import { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, X, CheckSquare, Square } from 'lucide-react';

const STORAGE_KEY = 'dualis_legal_v1_accepted';

export default function LegalDisclaimerModal() {
  const [open,    setOpen]    = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
  }, []);

  const accept = () => {
    if (!checked) return;
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-[#0d1424] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in-0 duration-300">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600/30 to-red-600/20 border-b border-amber-500/20 px-7 py-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <ShieldAlert size={20} className="text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-0.5">Aviso Legal Obligatorio</p>
            <h2 className="text-sm font-black text-white">Software en Período de Prueba — Beta</h2>
          </div>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-4 max-h-[60vh] overflow-y-auto">

          {/* Beta notice */}
          <div className="bg-amber-500/[0.07] border border-amber-500/20 rounded-2xl p-4">
            <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest mb-2">
              ⚠ Versión Beta — No Oficial
            </p>
            <p className="text-xs text-amber-300/70 leading-relaxed">
              <strong className="text-amber-300">Dualis ERP</strong> es un sistema administrativo en fase de desarrollo y período de prueba.
              Esta versión <strong className="text-amber-300">NO ha sido homologada</strong> ante el <strong className="text-amber-300">SENIAT</strong> ni ante ningún organismo fiscal venezolano.
            </p>
          </div>

          {/* Fiscal disclaimer */}
          <div className="bg-red-500/[0.07] border border-red-500/20 rounded-2xl p-4">
            <p className="text-[11px] font-black text-red-400 uppercase tracking-widest mb-2">
              Limitaciones Fiscales
            </p>
            <ul className="space-y-1.5 text-xs text-red-300/70 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-red-400 shrink-0 mt-0.5">·</span>
                Los comprobantes, facturas y reportes generados por este sistema <strong className="text-red-300">NO tienen validez fiscal oficial</strong> ante el SENIAT ni el COT (Código Orgánico Tributario).
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 shrink-0 mt-0.5">·</span>
                El sistema <strong className="text-red-300">no sustituye</strong> la obligación de emitir facturas mediante máquina fiscal homologada según la <strong className="text-red-300">Providencia Administrativa SNAT/2011/0071</strong>.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 shrink-0 mt-0.5">·</span>
                Los datos fiscales (IVA, IGTF, descuentos) son referenciales y <strong className="text-red-300">no constituyen declaración tributaria</strong>.
              </li>
            </ul>
          </div>

          {/* User responsibility */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
            <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-2">
              Responsabilidad del Usuario
            </p>
            <p className="text-xs text-white/40 leading-relaxed">
              El usuario es el único responsable del cumplimiento de sus obligaciones tributarias ante el SENIAT. Dualis ERP, sus desarrolladores y distribuidores <strong className="text-white/60">no se hacen responsables</strong> de sanciones, multas o reparos fiscales derivados del uso de este software en sustitución de medios fiscales oficiales.
            </p>
            <p className="text-xs text-white/30 leading-relaxed mt-2">
              Refs. legales: Ley del IVA (Art. 54–57) · COT Arts. 100–107 · Providencia SNAT/2011/0071 · Ley Orgánica de Procedimientos Administrativos.
            </p>
          </div>

          {/* Intended use */}
          <div className="bg-indigo-500/[0.06] border border-indigo-500/20 rounded-2xl p-4">
            <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mb-2">
              Uso Previsto
            </p>
            <p className="text-xs text-indigo-300/70 leading-relaxed">
              Dualis ERP está diseñado como <strong className="text-indigo-300">herramienta administrativa interna</strong>: control de inventario, cuentas por cobrar/pagar, gestión de equipos y reportes operativos. Su uso es complementario — nunca sustitutivo — de los medios fiscales exigidos por la ley venezolana.
            </p>
          </div>
        </div>

        {/* Accept */}
        <div className="px-7 pb-6">
          <button
            onClick={() => setChecked(c => !c)}
            className="flex items-start gap-3 w-full text-left mb-4 group"
          >
            {checked
              ? <CheckSquare size={16} className="text-indigo-400 shrink-0 mt-0.5" />
              : <Square size={16} className="text-white/20 shrink-0 mt-0.5 group-hover:text-white/40 transition-colors" />
            }
            <p className="text-xs text-white/40 leading-relaxed group-hover:text-white/60 transition-colors">
              He leído y comprendo que este sistema está en período de prueba, no está homologado ante el SENIAT y no puede utilizarse como medio fiscal oficial. Acepto ser el único responsable de mis obligaciones tributarias.
            </p>
          </button>
          <button
            onClick={accept}
            disabled={!checked}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20"
          >
            Entendido — Acceder al sistema
          </button>
        </div>
      </div>
    </div>
  );
}
