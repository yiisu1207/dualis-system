import React, { useRef } from 'react';
import { Movement, MovementType, AppConfig } from '../../types';
import { formatCurrency } from '../utils/formatters';

interface ReceiptModalProps {
  movement: Movement;
  config: AppConfig;
  onClose: () => void;
}

const ReceiptModal: React.FC<ReceiptModalProps> = ({ movement, config, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  const downloadReceipt = async () => {
    if (!receiptRef.current) return;
    const canvas = await (window as any).html2canvas(receiptRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
    });
    const link = document.createElement('a');
    link.download = `Recibo_${movement.entityId}_${movement.date}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[150] p-4">
      <div className="w-full max-w-sm animate-in zoom-in duration-300">
        {/* AREA DE CAPTURA */}
        <div
          ref={receiptRef}
          className="bg-white p-10 rounded-t-[2rem] border-b-2 border-dashed border-slate-100 relative"
        >
          <div className="text-center mb-8">
            <div className="text-4xl mb-4">👗</div>
            <h2 className="text-xl font-black text-slate-800 uppercase italic leading-none">
              {config.companyName}
            </h2>
            <p className="text-[10px] font-black text-indigo-500 tracking-[0.3em] uppercase mt-2">
              Comprobante Digital
            </p>
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex justify-between border-b pb-2">
              <span className="text-[9px] font-black text-slate-400 uppercase">Fecha</span>
              <span className="text-xs font-bold text-slate-800">{movement.date}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-[9px] font-black text-slate-400 uppercase">Cliente</span>
              <span className="text-xs font-bold text-slate-800 uppercase">
                {movement.entityId}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-[9px] font-black text-slate-400 uppercase">Operación</span>
              {/* Fix: Changed mismatched </p> to </span> to correctly close the opening tag */}
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded ${
                  movement.movementType === MovementType.FACTURA
                    ? 'bg-rose-50 text-rose-500'
                    : 'bg-emerald-50 text-emerald-500'
                }`}
              >
                {movement.movementType}
              </span>
            </div>
            <div className="pt-2">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Concepto</p>
              <p className="text-sm font-bold text-slate-700 leading-tight">{movement.concept}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-3xl text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Total Transacción
            </p>
            <p className="text-3xl font-black text-slate-900">
              {formatCurrency(movement.amountInUSD)}
            </p>
            {movement.rateUsed > 1 && (
              <p className="text-[8px] font-bold text-slate-400 mt-1 italic">
                Ref. BCV: Bs. {movement.rateUsed}
              </p>
            )}
          </div>

          <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-slate-900 rounded-full"></div>
          <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-slate-900 rounded-full"></div>
        </div>

        <div className="bg-white px-10 pb-10 rounded-b-[2rem] flex flex-col gap-3">
          <button
            onClick={downloadReceipt}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all"
          >
            <i className="fa-solid fa-download mr-2"></i> Descargar Imagen
          </button>
          <button
            onClick={onClose}
            className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
