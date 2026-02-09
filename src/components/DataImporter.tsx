import React, { useState } from 'react';

interface ParsedRow {
  name: string;
  cedula?: string;
  telefono?: string;
}

interface DataImporterProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: ParsedRow[] | any) => void;
}

const DataImporter: React.FC<DataImporterProps> = ({ open, onClose, onImport }) => {
  const [rawCsv, setRawCsv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  if (!open) return null;

  const handleProcess = () => {
    try {
      const lines = rawCsv
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) {
        setError('Pega al menos una línea de datos.');
        return;
      }

      // Soportamos encabezado opcional
      const dataLines =
        lines[0].toLowerCase().includes('nombre') && lines[0].includes(',')
          ? lines.slice(1)
          : lines;

      const rows: ParsedRow[] = dataLines.map((line) => {
        const [name = '', cedula = '', telefono = ''] = line.split(',').map((p) => p.trim());
        return { name, cedula, telefono };
      });

      onImport(rows);
      setError(null);
      setRawCsv('');
      onClose();
    } catch (e) {
      console.error(e);
      setError('No se pudo procesar el CSV. Revisa el formato.');
    }
  };

  const handleFile = (f: File | null) => {
    setImage(f);
  };

  const handleOCR = async () => {
    if (!image) return setError('Selecciona una imagen primero');
    setOcrLoading(true);
    setError(null);
    try {
      // Import tesseract.js dinámicamente (instala: npm i tesseract.js)
      const { createWorker } = await import('tesseract.js');
      const worker = createWorker({ logger: (m) => console.log(m) });
      await worker.load();
      await worker.loadLanguage('spa');
      await worker.initialize('spa');
      const { data } = await worker.recognize(image);
      await worker.terminate();

      const text = data.text || '';
      // Intentar extraer líneas con posibles facturas: numeros y montos
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const invoice: any = { raw: text, lines };

      // buscar montos (ej. 1,234.56 or 1234,56)
      const amounts: string[] = [];
      const amountRe = /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/g;
      let m: RegExpExecArray | null;
      while ((m = amountRe.exec(text))) {
        amounts.push(m[0]);
      }
      invoice.amounts = amounts;

      onImport(invoice);
      setImage(null);
      onClose();
    } catch (e) {
      console.error(e);
      setError('Error en OCR. Asegúrate de instalar tesseract.js: `npm i tesseract.js`');
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Importar Clientes / Facturas</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Pega CSV o sube una imagen para OCR (facturas / abonos).</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg">×</button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <textarea value={rawCsv} onChange={(e) => setRawCsv(e.target.value)} rows={6} className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-900 p-3 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40" placeholder={`Nombre, Cédula, Teléfono\nJuan Pérez, V-12345678, 0412-1234567`} />

          <div className="border-t pt-3">
            <label className="block text-sm font-medium text-slate-700 mb-2">Subir imagen (factura / abono)</label>
            <input type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
            {image && <p className="text-xs text-slate-500 mt-2">Imagen seleccionada: {image.name}</p>}
            {error && <p className="text-xs text-rose-500 mt-2">{error}</p>}
          </div>

          <p className="text-[11px] text-slate-500">Estos datos se procesarán en memoria y se enviarán a Firebase desde el sistema principal.</p>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/60 dark:bg-slate-900/60">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button onClick={handleProcess} className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 shadow-sm">Procesar CSV</button>
          <button onClick={handleOCR} disabled={ocrLoading} className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm">{ocrLoading ? 'Analizando...' : 'Analizar Imagen (OCR)'}</button>
        </div>
      </div>
    </div>
  );
};

export default DataImporter;
