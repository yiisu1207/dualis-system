import { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, X, CheckSquare, Square } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Persistencia dual:
//  1. localStorage — cache local para no mostrar el modal otra vez en el mismo
//     dispositivo antes del round-trip a Firestore (evita flash visual al reload).
//  2. Firestore `businessConfigs/{bid}.legalDisclaimerAccepted` — fuente de
//     verdad por business. Si un dueño acepta desde un device, cualquier
//     usuario del mismo business no vuelve a ver el modal (el disclaimer es
//     a nivel empresa, no a nivel user — lo firma el responsable legal).
//  Legacy: STORAGE_KEY antiguo se respeta para no bombardear a usuarios A y B
//  que ya aceptaron la versión v2 en localStorage. En el primer login post-fix
//  se migra silenciosamente a Firestore.
const STORAGE_KEY = 'dualis_legal_v2_accepted';

interface LegalDisclaimerModalProps {
  businessId?: string;
  userId?: string;
}

export default function LegalDisclaimerModal({ businessId, userId }: LegalDisclaimerModalProps) {
  const [open,    setOpen]    = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      // 1. Cache local primero — evita flash visual
      const localAccepted = localStorage.getItem(STORAGE_KEY);

      // 2. Firestore como fuente de verdad — si hay businessId
      if (businessId) {
        try {
          const snap = await getDoc(doc(db, 'businessConfigs', businessId));
          const acceptedAt = snap.exists() ? (snap.data() as any)?.legalDisclaimerAccepted : null;
          if (cancelled) return;
          if (acceptedAt) {
            // Sync con local por si el usuario cambió de device
            if (!localAccepted) localStorage.setItem(STORAGE_KEY, acceptedAt);
            setOpen(false);
            return;
          }
          // Firestore vacío pero local tiene → migración: escribir a Firestore
          if (localAccepted) {
            await setDoc(
              doc(db, 'businessConfigs', businessId),
              { legalDisclaimerAccepted: localAccepted, legalDisclaimerAcceptedBy: userId || null },
              { merge: true },
            );
            setOpen(false);
            return;
          }
          // Nadie aceptó nunca → mostrar
          setOpen(true);
        } catch (e) {
          // Si Firestore falla, caer al comportamiento legacy
          if (!cancelled && !localAccepted) setOpen(true);
        }
      } else {
        // Sin businessId (signup flow, onboarding) → solo local
        if (!localAccepted) setOpen(true);
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [businessId, userId]);

  const accept = async () => {
    if (!checked) return;
    const now = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, now);
    if (businessId) {
      try {
        await setDoc(
          doc(db, 'businessConfigs', businessId),
          { legalDisclaimerAccepted: now, legalDisclaimerAcceptedBy: userId || null },
          { merge: true },
        );
      } catch (e) {
        // Best-effort: local ya quedó escrito
        console.warn('[LegalDisclaimer] No se pudo persistir en Firestore:', e);
      }
    }
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
            <h2 className="text-sm font-black text-white">Sistema Administrativo — No Homologado SENIAT</h2>
          </div>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-4 max-h-[60vh] overflow-y-auto">

          {/* Nature of the system */}
          <div className="bg-amber-500/[0.07] border border-amber-500/20 rounded-2xl p-4">
            <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest mb-2">
              Sistema Administrativo — No Homologado
            </p>
            <p className="text-xs text-amber-300/70 leading-relaxed">
              <strong className="text-amber-300">Dualis ERP</strong> es un sistema administrativo y de gestión interna.
              <strong className="text-amber-300"> NO es un sistema de facturación homologado por el SENIAT</strong>,
              ni bajo la Providencia SNAT/2011/00071 (imprenta autorizada/forma libre),
              ni bajo la SNAT/2024/000102 (facturación digital),
              ni bajo la SNAT/2024/000121 (proveedores de software de facturación).
            </p>
          </div>

          {/* Fiscal disclaimer */}
          <div className="bg-red-500/[0.07] border border-red-500/20 rounded-2xl p-4">
            <p className="text-[11px] font-black text-red-400 uppercase tracking-widest mb-2">
              Los Documentos Internos NO Son Fiscales
            </p>
            <ul className="space-y-1.5 text-xs text-red-300/70 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-red-400 shrink-0 mt-0.5">·</span>
                Los comprobantes de venta, comprobantes internos de despacho, registros de devolución y reportes generados por Dualis son <strong className="text-red-300">documentos administrativos internos sin valor tributario</strong>.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 shrink-0 mt-0.5">·</span>
                <strong className="text-red-300">NO sustituyen</strong> la factura, nota de débito, nota de crédito, orden de entrega ni guía de despacho reguladas por la Providencia SNAT/2011/00071 (Arts. 6, 7, 13, 21, 22).
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 shrink-0 mt-0.5">·</span>
                El usuario debe mantener su medio de emisión fiscal externo (máquina fiscal Tipo I/II/III, imprenta autorizada o sistema digital homologado) para cumplir con sus obligaciones tributarias.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 shrink-0 mt-0.5">·</span>
                Los cálculos de IVA, IGTF y retenciones son <strong className="text-red-300">referenciales</strong>, no generan crédito ni débito fiscal y no constituyen declaración tributaria.
              </li>
            </ul>
          </div>

          {/* User responsibility */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
            <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-2">
              Responsabilidad del Usuario
            </p>
            <p className="text-xs text-white/40 leading-relaxed">
              El usuario es el único responsable del cumplimiento de sus obligaciones tributarias ante el SENIAT. Dualis ERP, sus desarrolladores y distribuidores <strong className="text-white/60">no asumen responsabilidad solidaria</strong> bajo el Art. 12 de la Providencia SNAT/2024/000121 ni por sanciones, multas, clausuras o reparos fiscales derivados del uso de este software como sustituto de medios fiscales oficiales.
            </p>
            <p className="text-xs text-white/30 leading-relaxed mt-2">
              Refs. legales: Ley del IVA Arts. 54–57 · Reglamento LIVA · COT 2020 Arts. 100–107 · Providencia SNAT/2011/00071 · Providencia SNAT/2024/000102 · Providencia SNAT/2024/000121.
            </p>
          </div>

          {/* Intended use */}
          <div className="bg-indigo-500/[0.06] border border-indigo-500/20 rounded-2xl p-4">
            <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mb-2">
              Uso Previsto
            </p>
            <p className="text-xs text-indigo-300/70 leading-relaxed">
              Dualis ERP está diseñado como <strong className="text-indigo-300">herramienta administrativa interna</strong>: control de inventario, cuentas por cobrar/pagar, gestión de equipos, reportes operativos y registro de ventas internas. Dualis ofrece un campo opcional "Nº Factura Fiscal Externa" para vincular cada venta interna con el documento fiscal emitido por el medio autorizado del usuario. Su uso es complementario — nunca sustitutivo — de los medios fiscales exigidos por la ley venezolana.
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
              He leído y comprendo que Dualis ERP es un sistema administrativo de gestión interna, <strong className="text-white/70">NO está homologado</strong> por el SENIAT y sus documentos no sustituyen factura, nota de crédito/débito ni guía de despacho fiscal. Me comprometo a usar mi propio medio de emisión fiscal (máquina fiscal, imprenta autorizada o sistema homologado) y asumo plena responsabilidad por mis obligaciones tributarias conforme a la Providencia SNAT/2011/00071, SNAT/2024/000102, SNAT/2024/000121 y el COT.
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
