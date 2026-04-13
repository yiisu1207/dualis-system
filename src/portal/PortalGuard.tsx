import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { useParams, useSearchParams, Outlet } from 'react-router-dom';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PortalAccessToken } from '../../types';
import { generateOTP, sendOTPEmail } from '../utils/emailService';
import { uploadToCloudinary } from '../utils/cloudinary';
import PortalLayout from './PortalLayout';
import { Camera, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface PortalContextType {
  businessId: string;
  customerId: string;
  customerName: string;
  businessName: string;
  businessLogo: string;
  brandColor: string;
  currencySymbol: string;
}

const PortalContext = createContext<PortalContextType | null>(null);
export const usePortal = () => {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used within PortalGuard');
  return ctx;
};

type AuthState = 'loading' | 'pin_required' | 'authenticated' | 'invalid';

export default function PortalGuard() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token');

  const [authState, setAuthState] = useState<AuthState>('loading');
  const [tokenData, setTokenData] = useState<PortalAccessToken | null>(null);
  const [tokenDocId, setTokenDocId] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessLogo, setBusinessLogo] = useState('');
  const [brandColor, setBrandColor] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('$');
  // Fase B.3: OTP-only. Mantenemos compat con enlaces viejos ignorando tokenData.pin.
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [emailSendFailed, setEmailSendFailed] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  // KYC state
  const [kycStatus, setKycStatus] = useState<'loading' | 'required' | 'pending' | 'verified' | 'rejected'>('loading');
  const [kycFrontal, setKycFrontal] = useState<File | null>(null);
  const [kycTrasera, setKycTrasera] = useState<File | null>(null);
  const [kycFrontalPreview, setKycFrontalPreview] = useState('');
  const [kycTraseraPreview, setKycTraseraPreview] = useState('');
  const [kycTerms, setKycTerms] = useState(false);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycError, setKycError] = useState('');
  const [portalTerms, setPortalTerms] = useState('');
  const frontalRef = useRef<HTMLInputElement>(null);
  const traseraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slug) { setAuthState('invalid'); return; }

    // Check localStorage for existing session
    const storedSession = localStorage.getItem(`portal_session_${slug}`);
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession);
        if (session.businessId && session.customerId && session.expiresAt > Date.now()) {
          setBusinessId(session.businessId);
          setBusinessName(session.businessName || '');
          setBusinessLogo(session.businessLogo || '');
          setBrandColor(session.brandColor || '');
          setCurrencySymbol(session.currencySymbol || '$');
          setTokenData({
            customerId: session.customerId,
            customerName: session.customerName,
            pin: '',
            createdAt: '',
            createdBy: '',
            active: true,
          });
          setAuthState('authenticated');
          return;
        }
      } catch {}
    }

    if (!tokenParam) { setAuthState('invalid'); return; }

    // Resolve businessId from slug
    (async () => {
      try {
        // Try tenants collection first (subdomain routing)
        const tenantSnap = await getDocs(
          query(collection(db, 'tenants'), where('__name__', '==', slug))
        );

        let bid = slug;
        let bName = '';
        let bLogo = '';

        if (!tenantSnap.empty) {
          const tenantData = tenantSnap.docs[0].data();
          bid = tenantData.businessId || slug;
          bName = tenantData.businessName || '';
          bLogo = tenantData.logoUrl || '';
        }

        setBusinessId(bid);
        setBusinessName(bName);
        setBusinessLogo(bLogo);

        // Load brand color from business config
        try {
          const { getDoc } = await import('firebase/firestore');
          const configSnap = await getDoc(doc(db, 'businesses', bid));
          if (configSnap.exists()) {
            const d = configSnap.data();
            if (!bName && d.name) setBusinessName(d.name);
            if (!bLogo && d.logoUrl) setBusinessLogo(d.logoUrl);
            if (d.theme?.primaryColor) setBrandColor(d.theme.primaryColor);
            if (d.currencySymbol) setCurrencySymbol(d.currencySymbol);
          }
        } catch {}

        // Find portal access token
        const tokSnap = await getDocs(
          query(
            collection(db, 'businesses', bid, 'portalAccess'),
            where('__name__', '==', tokenParam)
          )
        );

        if (tokSnap.empty) {
          // Try querying by document ID directly
          const { getDoc } = await import('firebase/firestore');
          const directDoc = await getDoc(doc(db, 'businesses', bid, 'portalAccess', tokenParam));
          if (!directDoc.exists()) {
            setAuthState('invalid');
            return;
          }
          const data = directDoc.data() as PortalAccessToken;
          if (!data.active) { setAuthState('invalid'); return; }
          if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
            setAuthState('invalid');
            return;
          }
          setTokenData(data);
          setTokenDocId(tokenParam);
          setAuthState('pin_required');
        } else {
          const docSnap = tokSnap.docs[0];
          const data = docSnap.data() as PortalAccessToken;
          if (!data.active) { setAuthState('invalid'); return; }
          if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
            setAuthState('invalid');
            return;
          }
          setTokenData(data);
          setTokenDocId(docSnap.id);
          setAuthState('pin_required');
        }
      } catch (err) {
        console.error('Portal auth error:', err);
        setAuthState('invalid');
      }
    })();
  }, [slug, tokenParam]);

  // Load customer email for OTP
  useEffect(() => {
    if (!tokenData?.customerId || !businessId) return;
    (async () => {
      try {
        const custDoc = await getDoc(doc(db, 'customers', tokenData.customerId));
        if (custDoc.exists()) {
          const email = custDoc.data()?.email || custDoc.data()?.correo || '';
          setCustomerEmail(email);
        }
      } catch {}
    })();
  }, [tokenData?.customerId, businessId]);

  // Fase B.3: auto-enviar OTP en cuanto tengamos email y estemos en pin_required
  useEffect(() => {
    if (authState !== 'pin_required' || !customerEmail || otpSent || otpSending) return;
    handleSendOTP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, customerEmail]);

  const handleSendOTP = async () => {
    if (!tokenData || !customerEmail || otpSending) return;
    setOtpSending(true);
    setOtpError('');
    try {
      const code = generateOTP();
      // Store OTP in Firestore with 10-minute TTL
      await setDoc(doc(db, 'businesses', businessId, 'portalOTP', tokenDocId || tokenData.customerId), {
        code,
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
        customerId: tokenData.customerId,
      });
      // Intentar enviar por email — si falla, el OTP sigue válido en Firestore
      let emailFailed = false;
      try {
        await sendOTPEmail(customerEmail, tokenData.customerName, code);
      } catch (emailErr) {
        console.warn('[Portal] Email send failed, OTP still valid in Firestore:', emailErr);
        emailFailed = true;
      }
      setEmailSendFailed(emailFailed);
      setOtpSent(true);
    } catch (err) {
      console.error('OTP generation error:', err);
      setOtpError('Error al generar el código. Intenta de nuevo.');
    } finally {
      setOtpSending(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenData || !otpCode) return;
    try {
      const otpDoc = await getDoc(doc(db, 'businesses', businessId, 'portalOTP', tokenDocId || tokenData.customerId));
      if (!otpDoc.exists()) {
        setOtpError('Código no encontrado. Envía uno nuevo.');
        return;
      }
      const data = otpDoc.data();
      if (data.expiresAt < Date.now()) {
        setOtpError('El código ha expirado. Envía uno nuevo.');
        setOtpSent(false);
        setOtpCode('');
        return;
      }
      if (data.code !== otpCode) {
        setOtpError('Código incorrecto');
        return;
      }
      // OTP valid — authenticate
      if (tokenDocId && businessId) {
        await updateDoc(
          doc(db, 'businesses', businessId, 'portalAccess', tokenDocId),
          { lastAccessAt: new Date().toISOString() }
        );
      }
      localStorage.setItem(
        `portal_session_${slug}`,
        JSON.stringify({
          businessId,
          customerId: tokenData.customerId,
          customerName: tokenData.customerName,
          businessName,
          businessLogo,
          brandColor,
          currencySymbol,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        })
      );
      setAuthState('authenticated');
    } catch (err) {
      console.error('OTP verify error:', err);
      setOtpError('Error al verificar. Intenta de nuevo.');
    }
  };

  // Fase B.3: handlePinSubmit eliminado — portal es OTP-only.

  // ── KYC check after authentication (realtime) ──────────────────────────────
  useEffect(() => {
    if (authState !== 'authenticated' || !businessId || !tokenData?.customerId) return;

    let unsubCustomer: (() => void) | null = null;
    let unsubConfig: (() => void) | null = null;
    let requiresKyc = true;
    let lastCustomerStatus: string | undefined;

    const applyStatus = () => {
      if (!requiresKyc) { setKycStatus('verified'); return; }
      if (lastCustomerStatus === 'verified') setKycStatus('verified');
      else if (lastCustomerStatus === 'pending') setKycStatus('pending');
      else if (lastCustomerStatus === 'rejected') setKycStatus('rejected');
      else setKycStatus('required');
    };

    // Subscribe to businessConfigs so KYC requirement changes propagate live
    unsubConfig = onSnapshot(
      doc(db, 'businessConfigs', businessId),
      (snap) => {
        const cfgData = snap.data();
        const creditCfg = cfgData?.creditConfig || {};
        requiresKyc = creditCfg.portalKycRequired !== false; // default true
        if (cfgData?.portalTerms) setPortalTerms(cfgData.portalTerms);
        applyStatus();
      },
      () => { requiresKyc = false; setKycStatus('verified'); }
    );

    // Subscribe to customer KYC status so portal reacts when admin approves
    unsubCustomer = onSnapshot(
      doc(db, 'customers', tokenData.customerId!),
      (snap) => {
        lastCustomerStatus = snap.data()?.kycStatus;
        applyStatus();
      },
      () => setKycStatus('verified') // fail-open on permission error
    );

    return () => {
      if (unsubCustomer) unsubCustomer();
      if (unsubConfig) unsubConfig();
    };
  }, [authState, businessId, tokenData?.customerId]);

  const handleKycSubmit = async () => {
    if (!kycFrontal || !kycTrasera || !kycTerms || !tokenData?.customerId) return;
    setKycSubmitting(true);
    setKycError('');
    try {
      const [frontalResult, traseraResult] = await Promise.all([
        uploadToCloudinary(kycFrontal, 'dualis_kyc'),
        uploadToCloudinary(kycTrasera, 'dualis_kyc'),
      ]);

      await updateDoc(doc(db, 'customers', tokenData.customerId), {
        cedulaFrontalUrl: frontalResult.secure_url,
        cedulaTraseraUrl: traseraResult.secure_url,
        kycStatus: 'pending',
        kycSubmittedAt: new Date().toISOString(),
        termsAcceptedAt: new Date().toISOString(),
      });

      setKycStatus('pending');
    } catch (err: any) {
      console.error('KYC upload error:', err);
      setKycError(err?.message || 'Error al subir documentos. Intenta de nuevo.');
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleFileSelect = (side: 'frontal' | 'trasera', file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (side === 'frontal') {
        setKycFrontal(file);
        setKycFrontalPreview(e.target?.result as string);
      } else {
        setKycTrasera(file);
        setKycTraseraPreview(e.target?.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mt-4">
            Cargando portal...
          </p>
        </div>
      </div>
    );
  }

  if (authState === 'invalid') {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-4">
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-8 max-w-sm w-full text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-4 text-2xl">
            🔒
          </div>
          <h2 className="text-xl font-black text-white mb-2">Acceso no válido</h2>
          <p className="text-sm text-slate-400">
            El enlace de acceso al portal ha expirado o no es válido. Contacta a tu proveedor para obtener un nuevo enlace.
          </p>
        </div>
      </div>
    );
  }

  if (authState === 'pin_required') {
    const maskedEmail = customerEmail
      ? customerEmail.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(b.length) + c)
      : '';

    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-4">
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-8 max-w-sm w-full shadow-2xl">
          {businessLogo && (
            <img src={businessLogo} alt="" className="w-14 h-14 rounded-xl object-cover mx-auto mb-4" />
          )}
          <h2 className="text-xl font-black text-white text-center mb-1">
            {businessName || 'Portal de Cliente'}
          </h2>
          <p className="text-sm text-slate-400 text-center mb-6">
            Hola, {tokenData?.customerName}
          </p>

          {/* Fase B.3: portal es OTP-only. Si el cliente no tiene email, se muestra fallback. */}
          {!customerEmail && (
            <div className="space-y-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto text-2xl">📧</div>
              <p className="text-sm text-white font-black">Email requerido</p>
              <p className="text-xs text-white/40 leading-relaxed">
                Este portal requiere verificación por email. Contacta a {businessName || 'tu proveedor'} para registrar tu correo.
              </p>
            </div>
          )}

          {/* ── OTP mode (único método) ── */}
          {customerEmail && (
            <div className="space-y-4">
              {otpSending && !otpSent && (
                <div className="text-center py-4">
                  <div className="animate-spin h-8 w-8 border-3 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-xs text-white/40 font-bold">Enviando código a {maskedEmail}...</p>
                </div>
              )}
              {otpSent && (
                <form onSubmit={handleOTPSubmit} className="space-y-4">
                  <div className="text-center mb-2">
                    {emailSendFailed ? (
                      <>
                        <p className="text-xs text-amber-400 font-black mb-1">No pudimos enviar el correo</p>
                        <p className="text-[10px] text-white/40 leading-relaxed">Solicita el código de verificación directamente a {businessName || 'tu proveedor'}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-emerald-400 font-black mb-1">Código enviado</p>
                        <p className="text-[10px] text-white/30">Revisa tu email {maskedEmail}</p>
                      </>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
                    placeholder="000000"
                    className="w-full px-4 py-4 bg-white/[0.06] border border-white/[0.08] rounded-xl text-center text-2xl font-black text-white tracking-[0.5em] focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-white/20"
                    autoFocus
                  />
                  {otpError && (
                    <p className="text-xs font-bold text-rose-400 text-center">{otpError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={otpCode.length < 6}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition-all"
                  >
                    Verificar Código
                  </button>
                  <div className="flex items-center justify-center">
                    <button type="button" onClick={() => { setOtpSent(false); setOtpCode(''); handleSendOTP(); }} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                      Reenviar código
                    </button>
                  </div>
                </form>
              )}
              {!otpSending && !otpSent && otpError && (
                <div className="text-center">
                  <p className="text-xs font-bold text-rose-400 mb-3">{otpError}</p>
                  <button onClick={handleSendOTP} className="text-xs font-bold text-indigo-400 hover:text-indigo-300">
                    Reintentar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── KYC screen (after auth, before portal access) ────────────────────────────
  if (kycStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (kycStatus === 'required' || kycStatus === 'rejected') {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-4">
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-6 sm:p-8 max-w-lg w-full shadow-2xl">
          {businessLogo && (
            <img src={businessLogo} alt="" className="w-12 h-12 rounded-xl object-cover mx-auto mb-3" />
          )}
          <h2 className="text-xl font-black text-white text-center mb-1">Verificación de Identidad</h2>
          <p className="text-sm text-slate-400 text-center mb-6">
            {kycStatus === 'rejected'
              ? 'Tu verificación fue rechazada. Por favor sube nuevas fotos de tu cédula.'
              : 'Para acceder al portal, necesitamos verificar tu identidad.'}
          </p>

          {kycStatus === 'rejected' && (
            <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 mb-5">
              <AlertCircle size={16} className="text-rose-400 shrink-0" />
              <p className="text-xs text-rose-300 font-medium">Documentos rechazados. Sube fotos claras de ambos lados de tu cédula.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-5">
            {/* Frontal */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Cédula — Frente</p>
              <input ref={frontalRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect('frontal', e.target.files[0])} />
              <button
                onClick={() => frontalRef.current?.click()}
                className={`w-full aspect-[1.6] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${
                  kycFrontalPreview
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.15]'
                }`}
              >
                {kycFrontalPreview ? (
                  <img src={kycFrontalPreview} alt="Frente" className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <>
                    <Camera size={24} className="text-white/20" />
                    <span className="text-[10px] font-bold text-white/30">Tomar foto</span>
                  </>
                )}
              </button>
            </div>

            {/* Trasera */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Cédula — Reverso</p>
              <input ref={traseraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect('trasera', e.target.files[0])} />
              <button
                onClick={() => traseraRef.current?.click()}
                className={`w-full aspect-[1.6] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${
                  kycTraseraPreview
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.15]'
                }`}
              >
                {kycTraseraPreview ? (
                  <img src={kycTraseraPreview} alt="Reverso" className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <>
                    <Camera size={24} className="text-white/20" />
                    <span className="text-[10px] font-bold text-white/30">Tomar foto</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Terms */}
          <label className="flex items-start gap-3 mb-5 cursor-pointer group">
            <input
              type="checkbox"
              checked={kycTerms}
              onChange={(e) => setKycTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30"
            />
            <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed">
              Acepto los términos y condiciones del portal y autorizo el procesamiento de mis datos personales e imágenes de identificación para verificación.
              {portalTerms && (
                <span className="block text-[10px] text-white/20 mt-1">{portalTerms}</span>
              )}
            </span>
          </label>

          {kycError && (
            <p className="text-xs font-bold text-rose-400 text-center mb-4">{kycError}</p>
          )}

          <button
            onClick={handleKycSubmit}
            disabled={!kycFrontal || !kycTrasera || !kycTerms || kycSubmitting}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
          >
            {kycSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Subiendo documentos...
              </>
            ) : (
              <>
                <Upload size={16} />
                Enviar Verificación
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (kycStatus === 'pending') {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-4">
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-8 max-w-sm w-full text-center shadow-2xl">
          {businessLogo && (
            <img src={businessLogo} alt="" className="w-12 h-12 rounded-xl object-cover mx-auto mb-3" />
          )}
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Verificación en Proceso</h2>
          <p className="text-sm text-slate-400 mb-4">
            Tus documentos fueron enviados correctamente. Estamos verificando tu identidad.
          </p>
          <p className="text-xs text-white/20">
            Recibirás acceso completo una vez que tu verificación sea aprobada.
          </p>
        </div>
      </div>
    );
  }

  // Authenticated + KYC verified
  return (
    <PortalContext.Provider
      value={{
        businessId,
        customerId: tokenData!.customerId,
        customerName: tokenData!.customerName,
        businessName,
        businessLogo,
        brandColor,
        currencySymbol,
      }}
    >
      <PortalLayout>
        <Outlet />
      </PortalLayout>
    </PortalContext.Provider>
  );
}
