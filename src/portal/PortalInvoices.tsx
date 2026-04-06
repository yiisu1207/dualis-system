import React, { useState, useMemo, useRef, useCallback } from 'react';
import { usePortal } from './PortalGuard';
import { usePortalData } from './usePortalData';
import { formatCurrency } from '../utils/formatters';
import { AccountType, MovementType } from '../../types';
import { FileText, Receipt, Filter, Search, PenTool, Check, X, Loader2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

type StatusFilter = 'ALL' | 'PENDIENTE' | 'PAGADO';
type AcctFilter = 'ALL' | AccountType;

export default function PortalInvoices() {
  const { businessId, customerId, customerName } = usePortal();
  const { movements, loading } = usePortalData(businessId, customerId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [acctFilter, setAcctFilter] = useState<AcctFilter>('ALL');
  const [search, setSearch] = useState('');

  // Signature state
  const [sigMovId, setSigMovId] = useState<string | null>(null);
  const [sigSaving, setSigSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    drawingRef.current = true;
    hasDrawnRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
  }, []);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a5b4fc';
    ctx.lineTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
    ctx.stroke();
  }, []);

  const stopDraw = useCallback(() => { drawingRef.current = false; }, []);

  const clearSig = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  }, []);

  const handleSignSubmit = useCallback(async () => {
    if (!sigMovId || !canvasRef.current || !hasDrawnRef.current) return;
    setSigSaving(true);
    try {
      const sigData = canvasRef.current.toDataURL('image/png');
      await updateDoc(doc(db, 'movements', sigMovId), {
        clienteSignature: sigData,
        clienteSignedAt: new Date().toISOString(),
        clienteSignedBy: customerName,
      });
      setSigMovId(null);
    } catch (err) {
      console.error('Signature save error:', err);
    } finally {
      setSigSaving(false);
    }
  }, [sigMovId, customerName]);

  const filtered = useMemo(() => {
    let result = movements.filter((m) => !(m as any).anulada);

    if (statusFilter === 'PAGADO') {
      result = result.filter((m) => (m as any).pagado === true);
    } else if (statusFilter === 'PENDIENTE') {
      result = result.filter((m) => !(m as any).pagado && m.movementType === MovementType.FACTURA);
    }

    if (acctFilter !== 'ALL') {
      result = result.filter((m) => m.accountType === acctFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.concept.toLowerCase().includes(q) ||
          ((m as any).nroControl || '').toLowerCase().includes(q) ||
          m.date.includes(q)
      );
    }

    return result.sort(
      (a, b) =>
        new Date(b.createdAt || b.date).getTime() -
        new Date(a.createdAt || a.date).getTime()
    );
  }, [movements, statusFilter, acctFilter, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Facturas</h1>
        <p className="text-xs sm:text-sm text-white/40 font-bold mt-1">
          Historial completo de movimientos
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <div className="flex bg-white/[0.06] rounded-xl p-0.5 border border-white/[0.08]">
          {(['ALL', 'PENDIENTE', 'PAGADO'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                statusFilter === f
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/30 active:text-white/50'
              }`}
            >
              {f === 'ALL' ? 'Todos' : f === 'PENDIENTE' ? 'Pend.' : f}
            </button>
          ))}
        </div>

        <div className="flex bg-white/[0.06] rounded-xl p-0.5 border border-white/[0.08]">
          {(['ALL', AccountType.BCV, AccountType.GRUPO, AccountType.DIVISA] as AcctFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setAcctFilter(f)}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                acctFilter === f
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/30 active:text-white/50'
              }`}
            >
              {f === 'ALL' ? 'Todas' : f}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-0">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-xs font-bold text-white placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Results */}
      <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] overflow-hidden shadow-lg">
        <div className="px-4 sm:px-6 py-3 border-b border-white/[0.07]">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Filter size={22} className="text-white/10 mx-auto mb-3" />
            <p className="text-xs font-bold text-white/20">Sin resultados</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {filtered.map((mov) => {
              const isInvoice = mov.movementType === MovementType.FACTURA;
              const isPaid = (mov as any).pagado;
              const amount = mov.amountInUSD || mov.amount;

              return (
                <div
                  key={mov.id}
                  className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 active:bg-white/[0.02] transition-colors"
                >
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isInvoice
                        ? 'bg-rose-500/10 text-rose-400'
                        : 'bg-emerald-500/10 text-emerald-400'
                    }`}
                  >
                    {isInvoice ? <FileText size={15} /> : <Receipt size={15} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-bold text-white/80 truncate">
                        {mov.concept}
                      </p>
                      {isPaid && (
                        <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[7px] font-black uppercase rounded shrink-0">
                          Pagado
                        </span>
                      )}
                      {!isPaid && isInvoice && (
                        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 text-[7px] font-black uppercase rounded shrink-0">
                          Pend.
                        </span>
                      )}
                      {(mov as any).clienteSignature && (
                        <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[7px] font-black uppercase rounded shrink-0">
                          Firmado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-white/30 font-bold mt-0.5">
                      <span>{mov.date}</span>
                      <span>{(mov as any).nroControl || ''}</span>
                      <span className="px-1 py-0.5 bg-white/[0.05] rounded text-[7px] uppercase">
                        {mov.accountType}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Sign button for unsigned NDE invoices */}
                    {isInvoice && (mov as any).estadoNDE && !(mov as any).clienteSignature && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setSigMovId(mov.id); hasDrawnRef.current = false; }}
                        className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center hover:bg-indigo-500/25 active:scale-90 transition-all"
                        title="Firmar recepción"
                      >
                        <PenTool size={12} />
                      </button>
                    )}
                    <span
                      className={`text-sm sm:text-base font-black font-mono ${
                        isInvoice ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {isInvoice ? '+' : '-'}{formatCurrency(amount, '$')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Signature Modal ── */}
      {sigMovId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSigMovId(null)} />
          <div className="relative bg-[#0d1424] rounded-2xl border border-white/[0.07] p-5 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PenTool size={15} className="text-indigo-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Firma de Recepción</h3>
              </div>
              <button onClick={() => setSigMovId(null)} className="text-white/30 hover:text-white/60"><X size={16} /></button>
            </div>
            <p className="text-[10px] text-white/30 mb-3">Dibuja tu firma para confirmar que recibiste la mercancía.</p>

            <div className="bg-white rounded-xl overflow-hidden mb-3 touch-none">
              <canvas
                ref={canvasRef}
                width={340}
                height={180}
                className="w-full h-[140px] cursor-crosshair"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>

            <div className="flex items-center justify-between">
              <button onClick={clearSig} className="text-[10px] font-bold text-white/30 hover:text-white/50 transition-colors">
                Limpiar
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setSigMovId(null)}
                  className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/60 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSignSubmit}
                  disabled={sigSaving}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  {sigSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Firmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
