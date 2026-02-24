import React, { useEffect, useRef, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import SimpleTable from '../components/SimpleTable';
import { useAuth } from '../context/AuthContext';
import { isDemoMode, loadDemoData } from '../utils/demoStore';

export default function Ventas() {
  const { userProfile } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSale, setActiveSale] = useState<any | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingShare, setPendingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement | null>(null);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 2
    }).format(value);

  const getSaleDate = (sale: any) => {
    const raw = sale?.createdAt;
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (raw?.toDate) return raw.toDate().toLocaleString('es-MX');
    if (raw?.seconds) return new Date(raw.seconds * 1000).toLocaleString('es-MX');
    return '';
  };

  const buildReceiptText = (sale: any) => {
    const amount = Number(sale?.amount ?? 0);
    const customer = sale?.customer ?? 'Cliente';
    const date = getSaleDate(sale) || 'Fecha pendiente';
    return `Recibo de venta\nID: ${sale?.id ?? '-'}\nCliente: ${customer}\nFecha: ${date}\nTotal: ${formatCurrency(amount)}`;
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const createReceiptImage = async () => {
    if (!receiptRef.current) return null;
    setIsGenerating(true);
    setShareError(null);
    try {
      const html2canvas = (window as any).html2canvas;
      if (!html2canvas) {
        setShareError('No se pudo generar el recibo.');
        return null;
      }
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      const dataUrl = canvas.toDataURL('image/png');
      setReceiptPreview(dataUrl);
      return dataUrl;
    } catch (error) {
      console.warn('Error generating receipt image', error);
      setShareError('No se pudo generar el recibo.');
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const shareReceipt = async (sale: any, dataUrl: string) => {
    const shareText = buildReceiptText(sale);
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `recibo-${sale?.id ?? 'venta'}.png`, { type: 'image/png' });

    if (navigator.share && (navigator as any).canShare?.({ files: [file] })) {
      await navigator.share({
        title: 'Recibo de venta',
        text: shareText,
        files: [file]
      });
      return;
    }

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank', 'noopener');
    downloadImage(dataUrl, `recibo-${sale?.id ?? 'venta'}.png`);
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!userProfile?.businessId) return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'movements'),
          where('businessId', '==', userProfile.businessId),
          where('movementType', '==', 'FACTURA'),
          orderBy('date', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        if (!mounted) return;
        setSales(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      } catch (e) {
        console.warn('Error loading sales', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [userProfile?.businessId]);

  useEffect(() => {
    if (!activeSale || !pendingShare) return;

    const run = async () => {
      const dataUrl = await createReceiptImage();
      if (!dataUrl) {
        setPendingShare(false);
        return;
      }
      try {
        await shareReceipt(activeSale, dataUrl);
      } catch (error) {
        console.warn('Error sharing receipt', error);
        setShareError('No se pudo compartir el recibo.');
      } finally {
        setPendingShare(false);
      }
    };

    run();
  }, [activeSale, pendingShare]);

  return (
    <div className="min-h-screen bg-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-black mb-6 text-slate-900">Ventas</h2>
        <p className="text-slate-600 mb-6">
          POS, facturación y gestión de clientes.
        </p>

        <div className="grid grid-cols-1 gap-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="font-bold mb-4 text-slate-900">Ventas recientes</h4>
            {loading ? (
              <div className="text-sm text-slate-500">Cargando...</div>
            ) : sales.length === 0 ? (
              <div className="text-sm text-slate-500">No hay ventas registradas.</div>
            ) : (
              <SimpleTable
                columns={['ID', 'amount', 'customer', 'createdAt', 'Recibo']}
                rows={sales}
                renderCell={(row, column) => {
                  if (column === 'Recibo') {
                    return (
                      <button
                        onClick={() => {
                          setActiveSale(row);
                          setPendingShare(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        <span className="text-base">🧾</span>
                        Generar
                      </button>
                    );
                  }
                  if (column === 'amount') {
                    return formatCurrency(Number(row?.amount ?? 0));
                  }
                  if (column === 'createdAt') {
                    return getSaleDate(row);
                  }
                  return undefined;
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div
        ref={receiptRef}
        style={{ position: 'absolute', left: -9999, top: 0, width: 360 }}
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-lg">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Recibo</div>
          <div className="text-2xl font-black">Dualis System</div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Venta</span>
              <span className="font-semibold">{activeSale?.id ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Cliente</span>
              <span className="font-semibold">{activeSale?.customer ?? 'Cliente'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Fecha</span>
              <span className="font-semibold">{activeSale ? getSaleDate(activeSale) : '-'}</span>
            </div>
          </div>
          <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-emerald-700">Total</span>
              <span className="text-lg font-black text-emerald-700">
                {formatCurrency(Number(activeSale?.amount ?? 0))}
              </span>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">Gracias por tu compra.</div>
        </div>
      </div>

      {receiptPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-6">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black text-slate-900">Recibo generado</h4>
              <button
                onClick={() => setReceiptPreview(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
              >
                Cerrar
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <img src={receiptPreview} alt="Recibo" className="w-full" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => downloadImage(receiptPreview, `recibo-${activeSale?.id ?? 'venta'}.png`)}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Descargar imagen
              </button>
              <button
                onClick={() => {
                  if (activeSale) {
                    setPendingShare(true);
                  }
                }}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"
              >
                Compartir otra vez
              </button>
              {shareError && <span className="text-sm text-rose-500">{shareError}</span>}
              {isGenerating && <span className="text-sm text-slate-500">Generando...</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
