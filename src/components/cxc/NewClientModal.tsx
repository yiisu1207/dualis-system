import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Phone, Mail, MapPin, CreditCard, ChevronDown, AlertTriangle, X } from 'lucide-react';
import type { Customer } from '../../../types';

/* ── Props ──────────────────────────────────────────────────── */

interface NewClientModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Customer>) => Promise<void>;
  existingCustomers: Customer[];
}

/* ── Constants ──────────────────────────────────────────────── */

const CEDULA_PREFIXES = ['V-', 'J-', 'E-', 'G-'] as const;
const RIF_PREFIXES = ['V', 'J', 'E', 'G'] as const;
const PAYMENT_DAY_OPTIONS = [0, 15, 30, 45, 60] as const;

const inputCls =
  'w-full px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all';

const labelCls =
  'text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block';

const selectCls =
  'px-2 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none cursor-pointer';

/* ── Component ──────────────────────────────────────────────── */

export default function NewClientModal({ open, onClose, onSave, existingCustomers }: NewClientModalProps) {
  /* -- State -- */
  const [nombre, setNombre] = useState('');
  const [cedulaPrefix, setCedulaPrefix] = useState<typeof CEDULA_PREFIXES[number]>('V-');
  const [cedulaNum, setCedulaNum] = useState('');
  const [rifPrefix, setRifPrefix] = useState<typeof RIF_PREFIXES[number]>('V');
  const [rifNum, setRifNum] = useState('');
  const [phoneCode, setPhoneCode] = useState('+58');
  const [phoneNum, setPhoneNum] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');

  const [creditLimit, setCreditLimit] = useState(0);
  const [defaultPaymentDays, setDefaultPaymentDays] = useState(0);
  const [creditApproved, setCreditApproved] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const backdropRef = useRef<HTMLDivElement>(null);

  /* -- Reset on open -- */
  useEffect(() => {
    if (open) {
      setNombre('');
      setCedulaPrefix('V-');
      setCedulaNum('');
      setRifPrefix('V');
      setRifNum('');
      setPhoneCode('+58');
      setPhoneNum('');
      setEmail('');
      setDireccion('');
      setCreditLimit(0);
      setDefaultPaymentDays(0);
      setCreditApproved(false);
      setCreditOpen(false);
      setSaving(false);
      setErrors({});
    }
  }, [open]);

  /* -- Duplicate detection -- */
  const fullCedula = `${cedulaPrefix}${cedulaNum}`;
  const fullRif = rifNum ? `${rifPrefix}${rifNum}` : '';

  const cedulaDuplicate = cedulaNum.length >= 3
    ? existingCustomers.find(c => c.cedula?.replace(/[\s.-]/g, '').toUpperCase() === fullCedula.replace(/[\s.-]/g, '').toUpperCase())
    : null;

  const rifDuplicate = fullRif.length >= 3
    ? existingCustomers.find(c => c.rif?.replace(/[\s.-]/g, '').toUpperCase() === fullRif.replace(/[\s.-]/g, '').toUpperCase())
    : null;

  /* -- Validation -- */
  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!nombre.trim()) errs.nombre = 'El nombre es obligatorio';
    if (!cedulaNum.trim()) errs.cedula = 'La cédula es obligatoria';
    else if (!/^\d+$/.test(cedulaNum.trim())) errs.cedula = 'Solo números después del prefijo';
    if (rifNum && !/^\d+$/.test(rifNum.trim())) errs.rif = 'Solo números después del prefijo';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [nombre, cedulaNum, rifNum]);

  /* -- Save -- */
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const data: Partial<Customer> = {
        nombre: nombre.trim(),
        fullName: nombre.trim(),
        cedula: fullCedula,
        rif: fullRif || undefined,
        telefono: phoneNum ? `${phoneCode}${phoneNum}` : '',
        email: email.trim() || undefined,
        direccion: direccion.trim(),
        creditLimit,
        defaultPaymentDays,
        creditApproved,
      };
      await onSave(data);
      onClose();
    } catch {
      /* parent handles error */
    } finally {
      setSaving(false);
    }
  };

  /* -- Backdrop click -- */
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  /* -- Render -- */
  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_150ms_ease-out]"
    >
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl animate-[slideUp_200ms_ease-out]">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white dark:bg-[#0d1424] border-b border-slate-100 dark:border-white/[0.08] rounded-t-2xl">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Nuevo Cliente</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-white/30 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ── Identificación ────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <User size={14} className="text-indigo-400" />
              <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500 dark:text-white/40">Identificación</span>
            </div>

            {/* Nombre */}
            <div className="mb-3">
              <label className={labelCls}>Nombre completo *</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: María Rodríguez"
                className={`${inputCls} ${errors.nombre ? 'ring-2 ring-red-500 border-red-500' : ''}`}
                autoFocus
              />
              {errors.nombre && <p className="mt-1 text-xs text-red-400">{errors.nombre}</p>}
            </div>

            {/* Cédula */}
            <div className="mb-3">
              <label className={labelCls}>Cédula *</label>
              <div className="flex gap-2">
                <select
                  value={cedulaPrefix}
                  onChange={e => setCedulaPrefix(e.target.value as typeof CEDULA_PREFIXES[number])}
                  className={`${selectCls} w-20 shrink-0`}
                >
                  {CEDULA_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cedulaNum}
                  onChange={e => setCedulaNum(e.target.value.replace(/\D/g, ''))}
                  placeholder="12345678"
                  className={`${inputCls} ${errors.cedula ? 'ring-2 ring-red-500 border-red-500' : ''}`}
                />
              </div>
              {errors.cedula && <p className="mt-1 text-xs text-red-400">{errors.cedula}</p>}
              {cedulaDuplicate && (
                <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Ya existe un cliente con esta cédula: <span className="font-bold">{cedulaDuplicate.nombre || cedulaDuplicate.fullName}</span>
                  </p>
                </div>
              )}
            </div>

            {/* RIF */}
            <div className="mb-3">
              <label className={labelCls}>RIF</label>
              <div className="flex gap-2">
                <select
                  value={rifPrefix}
                  onChange={e => setRifPrefix(e.target.value as typeof RIF_PREFIXES[number])}
                  className={`${selectCls} w-20 shrink-0`}
                >
                  {RIF_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  value={rifNum}
                  onChange={e => setRifNum(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456789"
                  className={`${inputCls} ${errors.rif ? 'ring-2 ring-red-500 border-red-500' : ''}`}
                />
              </div>
              {errors.rif && <p className="mt-1 text-xs text-red-400">{errors.rif}</p>}
              {rifDuplicate && (
                <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Ya existe un cliente con este RIF: <span className="font-bold">{rifDuplicate.nombre || rifDuplicate.fullName}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Teléfono */}
            <div>
              <label className={labelCls}>
                <Phone size={11} className="inline mr-1 -mt-0.5" />
                Teléfono
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={phoneCode}
                  onChange={e => setPhoneCode(e.target.value)}
                  className={`${selectCls} w-20 shrink-0 text-center`}
                />
                <input
                  type="text"
                  inputMode="tel"
                  value={phoneNum}
                  onChange={e => setPhoneNum(e.target.value.replace(/[^\d-]/g, ''))}
                  placeholder="412-1234567"
                  className={inputCls}
                />
              </div>
            </div>
          </section>

          {/* ── Contacto ──────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Mail size={14} className="text-indigo-400" />
              <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500 dark:text-white/40">Contacto</span>
            </div>

            {/* Email */}
            <div className="mb-3">
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className={inputCls}
              />
            </div>

            {/* Dirección */}
            <div>
              <label className={labelCls}>
                <MapPin size={11} className="inline mr-1 -mt-0.5" />
                Dirección
              </label>
              <textarea
                value={direccion}
                onChange={e => setDireccion(e.target.value)}
                placeholder="Av. Principal, Edif. Centro, Piso 3..."
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
          </section>

          {/* ── Crédito (collapsible) ─────────────────────── */}
          <section className="border border-slate-100 dark:border-white/[0.06] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setCreditOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-2">
                <CreditCard size={14} className="text-indigo-400" />
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500 dark:text-white/40">Crédito</span>
              </div>
              <ChevronDown
                size={16}
                className={`text-slate-400 dark:text-white/30 transition-transform duration-200 ${creditOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <div
              className={`grid transition-all duration-200 ease-in-out ${creditOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
            >
              <div className="overflow-hidden">
                <div className="px-4 pb-4 pt-1 space-y-4">
                  {/* Límite de crédito */}
                  <div>
                    <label className={labelCls}>Límite de crédito (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 dark:text-white/30">$</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={creditLimit}
                        onChange={e => setCreditLimit(parseFloat(e.target.value) || 0)}
                        className={`${inputCls} pl-7`}
                      />
                    </div>
                  </div>

                  {/* Días de pago */}
                  <div>
                    <label className={labelCls}>Días de pago default</label>
                    <div className="flex gap-2 flex-wrap">
                      {PAYMENT_DAY_OPTIONS.map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDefaultPaymentDays(d)}
                          className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                            defaultPaymentDays === d
                              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                              : 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/[0.1]'
                          }`}
                        >
                          {d === 0 ? 'Contado' : `${d} días`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toggle crédito aprobado */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-700 dark:text-white/70">Crédito aprobado</label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={creditApproved}
                      onClick={() => setCreditApproved(v => !v)}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                        creditApproved ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-white/[0.1]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                          creditApproved ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 px-6 py-4 bg-white dark:bg-[#0d1424] border-t border-slate-100 dark:border-white/[0.08] rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-white/50 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-600 shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Guardando...
              </span>
            ) : (
              'Guardar Cliente'
            )}
          </button>
        </div>
      </div>

      {/* ── Keyframe animations ───────────────────────────── */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
