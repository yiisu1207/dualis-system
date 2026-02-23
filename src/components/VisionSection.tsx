import React, { useState } from 'react';
import { analyzeVisionJson, analyzeVisionText } from '../lib/ai-scanner';
import { formatCurrency } from '../utils/formatters';

interface VisionSectionProps {
  onImportMovements: (movements: any[]) => void;
}

const VisionSection: React.FC<VisionSectionProps> = ({ onImportMovements }) => {
  const [images, setImages] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImages((prev) => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
      setAnalysis(null);
      setExtractedData(null);
    }
  };

  const analyzeImages = async () => {
    if (images.length === 0) return;
    setLoading(true);
    setAnalysis(null);
    setExtractedData(null);

    try {
      const textReport = await analyzeVisionText(images);
      setAnalysis(textReport);

      const data = await analyzeVisionJson(images);
      setExtractedData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setAnalysis('⚠️ ERROR CRÍTICO: No se pudo procesar la auditoría visual.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = () => {
    if (extractedData) {
      onImportMovements(extractedData);
      setExtractedData(null);
      setAnalysis('✅ Datos importados correctamente al sistema.');
    }
  };

  return (
    <div className="app-section space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div className="app-section-header">
          <p className="app-subtitle">IA y Digitalización</p>
          <h1 className="app-title uppercase">Vision Auditor Lab</h1>
        </div>
        <div className="flex items-center gap-4 mt-2 md:mt-0">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
          </div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest app-chip px-4 py-2 rounded-full">
            Sincronizacion Activa
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="flex flex-col gap-8">
          <div className="app-panel p-12 rounded-[3.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center min-h-[500px] relative hover:border-[var(--ui-accent)] transition-all group overflow-hidden">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleImagesUpload}
              className="hidden"
              id="multi-upload-vision-lab"
            />

            {images.length > 0 ? (
              <div className="w-full h-full flex flex-col">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8 max-h-[400px] overflow-y-auto p-2 custom-scroll">
                  {images.map((img, i) => (
                    <div key={i} className="relative group/img animate-in zoom-in duration-300">
                      <img
                        src={img}
                        className="w-full aspect-[3/4] object-cover rounded-[1.5rem] shadow-2xl ring-4 ring-white"
                      />
                      <button
                        onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-3 -right-3 w-10 h-10 bg-rose-600 text-white rounded-full flex items-center justify-center shadow-xl opacity-0 group-hover/img:opacity-100 transition-opacity transform hover:scale-110"
                      >
                        <i className="fa-solid fa-trash-can text-sm"></i>
                      </button>
                      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg text-[8px] font-black text-white uppercase">
                        Pág {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-auto flex gap-6">
                  <button
                    onClick={() => {
                      setImages([]);
                      setExtractedData(null);
                    }}
                    className="flex-1 py-5 app-btn app-btn-ghost"
                  >
                    Eliminar Todo
                  </button>
                  <button
                    onClick={analyzeImages}
                    disabled={loading}
                    className="flex-[2] py-5 app-btn app-btn-primary flex items-center justify-center gap-4 transform active:scale-95"
                  >
                    {loading ? (
                      <i className="fa-solid fa-atom animate-spin text-xl"></i>
                    ) : (
                      <i className="fa-solid fa-sparkles text-xl"></i>
                    )}
                    {loading ? 'AUDITANDO...' : 'EJECUTAR ANÁLISIS IA'}
                  </button>
                </div>
              </div>
            ) : (
              <label
                htmlFor="multi-upload-vision-lab"
                className="cursor-pointer flex flex-col items-center group text-center p-10"
              >
                <div className="w-32 h-32 bg-slate-50 rounded-[3rem] flex items-center justify-center text-6xl mb-8 group-hover:bg-[var(--ui-soft)] group-hover:text-[var(--ui-accent)] transition-all text-slate-200">
                  <i className="fa-solid fa-images"></i>
                </div>
                <h4 className="font-black text-slate-900 uppercase text-sm mb-3 tracking-tighter">
                  Subir Folios del Libro Mayor
                </h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest max-w-[280px] leading-relaxed">
                  Sincroniza tus registros físicos con la base de datos digital en un solo paso.
                </p>
              </label>
            )}
          </div>

          {extractedData && (
            <div className="app-panel p-10 rounded-[2.5rem] bg-emerald-600 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-5">
              <h3 className="font-black text-xl mb-2 flex items-center gap-3 italic">
                <i className="fa-solid fa-check-double"></i> ¡MOVIMIENTOS LISTOS!
              </h3>
              <p className="text-[11px] font-bold opacity-80 uppercase tracking-widest mb-6">
                Hemos extraído {extractedData.length} transacciones. Valídalas y presiona el botón
                para incorporarlas.
              </p>
              <button
                onClick={handleConfirmImport}
                className="w-full py-5 bg-white text-emerald-700 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest shadow-xl hover:scale-[1.02] transition-all"
              >
                SINCRONIZAR CON CONTABILIDAD REAL
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 h-full">
          <div className="app-panel p-12 rounded-[3.5rem] bg-slate-950 text-white shadow-3xl overflow-y-auto max-h-[400px] custom-scroll relative border border-white/5">
            <div className="flex items-center gap-6 mb-8 border-b border-white/10 pb-6 sticky top-0 bg-slate-950/95 backdrop-blur-md z-10">
              <span className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl">
                📝
              </span>
              <h2 className="font-black uppercase tracking-[0.2em] text-[12px] italic text-indigo-400">
                Reporte de Auditoría
              </h2>
            </div>
            <div className="text-[13px] leading-relaxed text-slate-300 font-medium whitespace-pre-line font-mono tracking-tight">
              {analysis || 'Esperando entrada de datos...'}
            </div>
          </div>

          {extractedData && (
            <div className="app-panel p-10 rounded-[3rem] bg-white shadow-2xl overflow-y-auto max-h-[420px] custom-scroll">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b pb-4">
                Previsualización de Importación
              </h3>
              <table className="w-full text-[11px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-slate-400 font-black uppercase text-[9px] tracking-widest">
                    <th className="text-left">Cliente</th>
                    <th className="text-left">Concepto</th>
                    <th className="text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {extractedData.map((d, i) => (
                    <tr key={i} className="bg-slate-50/50 rounded-xl">
                      <td className="p-3 font-black text-slate-800 uppercase">{d.customerName}</td>
                      <td className="p-3 text-slate-500 font-bold italic">{d.concept}</td>
                      <td
                        className={`p-3 text-right font-black ${
                          d.movementType === 'FACTURA' ? 'text-rose-500' : 'text-emerald-500'
                        }`}
                      >
                        {formatCurrency(d.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisionSection;
