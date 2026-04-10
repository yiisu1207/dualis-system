import React, { useState, useRef } from 'react';
import { X, User, Phone, Mail, MapPin, Camera, Loader2, Check, ArrowRight, ArrowLeft, KeyRound, Share2, Copy, MessageCircle } from 'lucide-react';
import type { Customer } from '../../../types';
import { uploadToCloudinary } from '../../utils/cloudinary';
import { shareViaWhatsApp, shareViaEmail, copyToClipboard, messageTemplates } from '../../utils/shareLink';

type Step = 1 | 2 | 3 | 4;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Crea el customer y devuelve el id (y opcionalmente un link al portal). */
  onSave: (data: Partial<Customer> & { pin?: string }) => Promise<{ customerId: string; portalLink?: string }>;
  businessName?: string;
  existingCustomers: Customer[];
}

const inputCls =
  'w-full px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all';
const labelCls =
  'text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block';

export default function ClientOnboardingWizard({ open, onClose, onSave, businessName = 'el negocio', existingCustomers }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1: básicos
  const [nombre, setNombre] = useState('');
  const [cedulaPrefix, setCedulaPrefix] = useState<'V-' | 'J-' | 'E-' | 'G-'>('V-');
  const [cedulaNum, setCedulaNum] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');

  // Step 2: KYC
  const [frontalFile, setFrontalFile] = useState<File | null>(null);
  const [traseraFile, setTraseraFile] = useState<File | null>(null);
  const [frontalUrl, setFrontalUrl] = useState('');
  const [traseraUrl, setTraseraUrl] = useState('');
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  // Step 3: PIN
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [enablePortal, setEnablePortal] = useState(true);

  // Step 4: shareable link
  const [portalLink, setPortalLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const fullCedula = `${cedulaPrefix}${cedulaNum}`;
  const cedulaDup = cedulaNum.length >= 6 && existingCustomers.find(
    c => c.cedula?.replace(/[\s.-]/g, '').toUpperCase() === fullCedula.replace(/[\s.-]/g, '').toUpperCase()
  );

  const reset = () => {
    setStep(1); setNombre(''); setCedulaNum(''); setPhone(''); setEmail(''); setDireccion('');
    setFrontalFile(null); setTraseraFile(null); setFrontalUrl(''); setTraseraUrl('');
    setPin(''); setPinConfirm(''); setEnablePortal(true);
    setPortalLink(''); setCopied(false); setError(''); setSaving(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleUpload = async (file: File, side: 'front' | 'back') => {
    if (side === 'front') setUploadingFront(true); else setUploadingBack(true);
    try {
      const res = await uploadToCloudinary(file, 'dualis_kyc');
      if (side === 'front') { setFrontalUrl(res.secure_url); setFrontalFile(file); }
      else { setTraseraUrl(res.secure_url); setTraseraFile(file); }
    } catch (err) {
      console.error(err);
      setError('Error subiendo la imagen');
    } finally {
      if (side === 'front') setUploadingFront(false); else setUploadingBack(false);
    }
  };

  const nextStep = () => {
    setError('');
    if (step === 1) {
      if (!nombre.trim()) { setError('Falta el nombre'); return; }
      if (cedulaNum.length < 6) { setError('Cédula/RIF inválida'); return; }
      if (cedulaDup) { setError('Ya existe un cliente con esta cédula'); return; }
      setStep(2);
    } else if (step === 2) {
      // KYC opcional — si no subió fotos, advertir pero permitir avanzar
      setStep(3);
    } else if (step === 3) {
      if (enablePortal) {
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { setError('PIN debe ser 4 dígitos'); return; }
        if (pin !== pinConfirm) { setError('Los PINs no coinciden'); return; }
      }
      handleSave();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: Partial<Customer> & { pin?: string } = {
        nombre: nombre.trim(),
        cedula: fullCedula,
        telefono: phone.trim(),
        email: email.trim(),
        direccion: direccion.trim(),
        cedulaFrontalUrl: frontalUrl || undefined,
        cedulaTraseraUrl: traseraUrl || undefined,
        kycStatus: (frontalUrl && traseraUrl) ? 'pending' : undefined,
        kycSubmittedAt: (frontalUrl && traseraUrl) ? new Date().toISOString() : undefined,
        portalEnabled: enablePortal,
        ...(enablePortal ? { pin } : {}),
      };
      const result = await onSave(payload);
      setPortalLink(result.portalLink || '');
      setStep(4);
    } catch (err) {
      console.error(err);
      setError('Error al crear el cliente');
    } finally {
      setSaving(false);
    }
  };

  const stepLabel = (n: Step) => ({
    1: 'Datos básicos',
    2: 'Verificación (KYC)',
    3: 'Acceso al portal',
    4: 'Listo',
  }[n]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 w-full max-w-lg max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-[#0d1424] z-10 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Nuevo cliente</h3>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <X size={18} />
            </button>
          </div>
          {/* Progress */}
          <div className="flex items-center gap-1.5">
            {([1, 2, 3, 4] as Step[]).map(n => (
              <div key={n} className="flex-1 flex items-center gap-1.5">
                <div className={`flex-1 h-1 rounded-full ${n <= step ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-white/10'}`} />
              </div>
            ))}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/40 mt-2">
            Paso {step}/4 · {stepLabel(step)}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* ── Step 1: Datos básicos ── */}
          {step === 1 && (
            <>
              <div>
                <label className={labelCls}>Nombre completo</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Juan Pérez" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cédula / RIF</label>
                <div className="flex gap-2">
                  <select value={cedulaPrefix} onChange={e => setCedulaPrefix(e.target.value as any)} className="px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white">
                    <option>V-</option><option>J-</option><option>E-</option><option>G-</option>
                  </select>
                  <input type="text" inputMode="numeric" value={cedulaNum} onChange={e => setCedulaNum(e.target.value.replace(/\D/g, ''))} placeholder="12345678" className={inputCls} />
                </div>
                {cedulaDup && <p className="text-[11px] text-rose-500 mt-1">Ya existe: {cedulaDup.nombre}</p>}
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0414-1234567" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@email.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Dirección</label>
                <input type="text" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Calle, ciudad" className={inputCls} />
              </div>
            </>
          )}

          {/* ── Step 2: KYC ── */}
          {step === 2 && (
            <>
              <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/15 p-3">
                <p className="text-[11px] text-slate-600 dark:text-white/60 leading-relaxed">
                  Sube las fotos de la cédula del cliente para verificar su identidad. <strong>Opcional</strong> — puedes saltar este paso y completarlo después.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Frontal */}
                <div>
                  <label className={labelCls}>Cédula frontal</label>
                  <input ref={frontInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'front')} />
                  <button type="button" onClick={() => frontInputRef.current?.click()} disabled={uploadingFront} className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-slate-200 dark:border-white/15 flex flex-col items-center justify-center gap-1 hover:border-indigo-500/40 transition-colors overflow-hidden bg-slate-50 dark:bg-white/[0.02]">
                    {uploadingFront ? (
                      <Loader2 size={18} className="animate-spin text-indigo-400" />
                    ) : frontalUrl ? (
                      <img src={frontalUrl} alt="frontal" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Camera size={18} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-400">Subir frontal</span>
                      </>
                    )}
                  </button>
                </div>
                {/* Trasera */}
                <div>
                  <label className={labelCls}>Cédula trasera</label>
                  <input ref={backInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'back')} />
                  <button type="button" onClick={() => backInputRef.current?.click()} disabled={uploadingBack} className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-slate-200 dark:border-white/15 flex flex-col items-center justify-center gap-1 hover:border-indigo-500/40 transition-colors overflow-hidden bg-slate-50 dark:bg-white/[0.02]">
                    {uploadingBack ? (
                      <Loader2 size={18} className="animate-spin text-indigo-400" />
                    ) : traseraUrl ? (
                      <img src={traseraUrl} alt="trasera" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Camera size={18} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-400">Subir trasera</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Step 3: PIN + Portal ── */}
          {step === 3 && (
            <>
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                <input type="checkbox" checked={enablePortal} onChange={e => setEnablePortal(e.target.checked)} className="mt-1" />
                <div>
                  <p className="text-xs font-black text-slate-900 dark:text-white">Habilitar portal del cliente</p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">Permite ver facturas, abonos y reportar disputas</p>
                </div>
              </label>

              {enablePortal && (
                <>
                  <div>
                    <label className={labelCls}>PIN de acceso (4 dígitos)</label>
                    <div className="relative">
                      <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" className={`${inputCls} pl-9 tracking-[0.4em] text-center font-mono`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Confirmar PIN</label>
                    <input type="text" inputMode="numeric" maxLength={4} value={pinConfirm} onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" className={`${inputCls} tracking-[0.4em] text-center font-mono`} />
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Step 4: Listo ── */}
          {step === 4 && (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Check size={24} className="text-emerald-400" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-white">{nombre}</h4>
                <p className="text-[11px] text-slate-500 dark:text-white/50">Cliente creado correctamente</p>
              </div>

              {portalLink && (
                <>
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">Acceso al portal</p>
                    <p className="text-[11px] text-slate-600 dark:text-white/60 break-all font-mono">{portalLink}</p>
                    {pin && <p className="text-[11px] text-slate-600 dark:text-white/60 mt-1">PIN: <span className="font-mono font-black text-indigo-400">{pin}</span></p>}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyToClipboard(portalLink);
                        if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
                      }}
                      className="flex flex-col items-center gap-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all"
                    >
                      <Copy size={14} className="text-slate-500" />
                      <span className="text-[9px] font-black uppercase">{copied ? 'Copiado' : 'Copiar'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={!phone}
                      onClick={() => shareViaWhatsApp(phone, messageTemplates.portalAccess(businessName, nombre, portalLink, pin))}
                      className="flex flex-col items-center gap-1 py-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all disabled:opacity-40"
                    >
                      <MessageCircle size={14} className="text-emerald-400" />
                      <span className="text-[9px] font-black uppercase text-emerald-400">WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      disabled={!email}
                      onClick={() => shareViaEmail(email, `Tu acceso a ${businessName}`, messageTemplates.portalAccess(businessName, nombre, portalLink, pin))}
                      className="flex flex-col items-center gap-1 py-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 transition-all disabled:opacity-40"
                    >
                      <Mail size={14} className="text-indigo-400" />
                      <span className="text-[9px] font-black uppercase text-indigo-400">Email</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-[#0d1424] border-t border-slate-100 dark:border-white/[0.06] px-6 py-4 flex items-center gap-2">
          {step > 1 && step < 4 && (
            <button type="button" onClick={() => setStep((step - 1) as Step)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
              <ArrowLeft size={12} /> Atrás
            </button>
          )}
          <div className="flex-1" />
          {step < 4 ? (
            <button type="button" onClick={nextStep} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <>Siguiente <ArrowRight size={12} /></>}
            </button>
          ) : (
            <button type="button" onClick={handleClose} className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest">
              Listo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
