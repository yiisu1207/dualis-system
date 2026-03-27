import React, { useState, useEffect, createContext, useContext } from 'react';
import { useParams, useSearchParams, Outlet } from 'react-router-dom';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PortalAccessToken } from '../../types';
import PortalLayout from './PortalLayout';

interface PortalContextType {
  businessId: string;
  customerId: string;
  customerName: string;
  businessName: string;
  businessLogo: string;
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
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

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

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenData) return;

    if (pin !== tokenData.pin) {
      setPinError('PIN incorrecto');
      return;
    }

    // Update last access
    try {
      if (tokenDocId && businessId) {
        await updateDoc(
          doc(db, 'businesses', businessId, 'portalAccess', tokenDocId),
          { lastAccessAt: new Date().toISOString() }
        );
      }
    } catch {}

    // Store session (24 hours)
    localStorage.setItem(
      `portal_session_${slug}`,
      JSON.stringify({
        businessId,
        customerId: tokenData.customerId,
        customerName: tokenData.customerName,
        businessName,
        businessLogo,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      })
    );

    setAuthState('authenticated');
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
            Hola, {tokenData?.customerName}. Ingresa tu PIN para acceder.
          </p>
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                placeholder="PIN"
                className="w-full px-4 py-4 bg-white/[0.06] border border-white/[0.08] rounded-xl text-center text-2xl font-black text-white tracking-[0.5em] focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-white/20 placeholder:tracking-normal placeholder:text-base"
                autoFocus
              />
              {pinError && (
                <p className="text-xs font-bold text-rose-400 mt-2 text-center">{pinError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={pin.length < 4}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition-all hover:from-indigo-700 hover:to-violet-700"
            >
              Acceder al Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Authenticated
  return (
    <PortalContext.Provider
      value={{
        businessId,
        customerId: tokenData!.customerId,
        customerName: tokenData!.customerName,
        businessName,
        businessLogo,
      }}
    >
      <PortalLayout>
        <Outlet />
      </PortalLayout>
    </PortalContext.Provider>
  );
}
