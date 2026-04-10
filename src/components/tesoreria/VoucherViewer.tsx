import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, ExternalLink } from 'lucide-react';

interface Props {
  url: string;
  caption?: string;
  onClose: () => void;
}

export default function VoucherViewer({ url, caption, onClose }: Props) {
  const [zoom, setZoom] = useState(1);

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-md" onClick={onClose} />
      <div className="fixed inset-0 z-[91] flex items-center justify-center p-4 pointer-events-none">
        <div className="relative max-w-5xl max-h-[92vh] flex flex-col items-center gap-3 pointer-events-auto">
          {/* Toolbar */}
          <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-white/10 rounded-2xl px-3 py-2 shadow-2xl">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 flex items-center justify-center transition-all"
              title="Alejar"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-xs font-mono text-white/60 min-w-[50px] text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(3, z + 0.25))}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 flex items-center justify-center transition-all"
              title="Acercar"
            >
              <ZoomIn size={15} />
            </button>
            <div className="w-px h-6 bg-white/10 mx-1" />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 flex items-center justify-center transition-all"
              title="Abrir original"
            >
              <ExternalLink size={14} />
            </a>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 flex items-center justify-center transition-all"
              title="Cerrar"
            >
              <X size={15} />
            </button>
          </div>

          {/* Image */}
          <div className="overflow-auto custom-scroll max-h-[80vh] max-w-full bg-slate-900/50 rounded-2xl border border-white/10 p-2">
            <img
              src={url}
              alt="Voucher"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }}
              className="transition-transform duration-150 max-w-full"
            />
          </div>

          {caption && (
            <p className="text-xs font-bold text-white/70 text-center max-w-md">{caption}</p>
          )}
        </div>
      </div>
    </>
  );
}
