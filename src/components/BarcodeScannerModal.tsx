import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, CameraOff, Loader2 } from 'lucide-react';

interface BarcodeScannerModalProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

const SCANNER_ID = 'dualis-barcode-scanner';

const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: { width: 260, height: 120 } },
        (decodedText) => {
          // Stop scanner before calling onScan to avoid double-scans
          scanner.stop().catch(() => {}).finally(() => {
            onScan(decodedText.trim());
          });
        },
        () => { /* ignore per-frame errors */ },
      )
      .then(() => setStatus('scanning'))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
          setErrorMsg('Permiso de cámara denegado. Habilítalo en la configuración del navegador.');
        } else if (msg.toLowerCase().includes('notfound')) {
          setErrorMsg('No se encontró una cámara en este dispositivo.');
        } else {
          setErrorMsg('No se pudo iniciar la cámara.');
        }
        setStatus('error');
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [onScan]);

  const handleClose = () => {
    scannerRef.current?.stop().catch(() => {});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">

        {/* Header — z-50 to stay above scanner video element */}
        <div className="relative z-50 flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Camera size={16} />
            </div>
            <div>
              <p className="text-[13px] font-black text-slate-900">Escaner de Camara</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {status === 'starting' ? 'Iniciando...' : status === 'scanning' ? 'Apunta al codigo' : 'Error'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="relative z-50 h-10 w-10 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center transition-all cursor-pointer"
          >
            <X size={18} strokeWidth={3} />
          </button>
        </div>

        {/* Scanner area */}
        <div className="relative bg-slate-950">
          {/* Floating close button over video */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3 right-3 z-50 h-9 w-9 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm"
          >
            <X size={16} strokeWidth={3} />
          </button>
          {/* The div that html5-qrcode mounts into */}
          <div id={SCANNER_ID} className="w-full" />

          {/* Overlay states */}
          {status === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/70 min-h-[220px]">
              <Loader2 size={32} className="text-white animate-spin" />
              <p className="text-xs font-black text-white uppercase tracking-widest">Activando cámara...</p>
            </div>
          )}
          {status === 'error' && (
            <div className="flex flex-col items-center justify-center gap-4 px-8 py-12 min-h-[220px]">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-500 flex items-center justify-center">
                <CameraOff size={24} />
              </div>
              <p className="text-[12px] font-bold text-slate-600 text-center leading-relaxed">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Hint */}
        {status === 'scanning' && (
          <div className="px-5 py-4 flex items-center gap-2 border-t border-slate-100">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <p className="text-[10px] font-bold text-slate-400">
              Detecta códigos QR, EAN-13, EAN-8, Code 128, Code 39 y más.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BarcodeScannerModal;
