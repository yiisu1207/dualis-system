import React from 'react';
import { Lock } from 'lucide-react';
import { useRates } from '../context/RatesContext';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { auth } from '../firebase/config';
import TasasPageRedesign from './rates/TasasPageRedesign';

const ExchangeRatesSection: React.FC = () => {
  const { customRates } = useRates();
  const { userProfile } = useAuth();

  const businessId = userProfile?.businessId || '';
  const { canAccess } = useSubscription(businessId);
  const hasDynamicPricing = canAccess('precios_dinamicos');

  const currentUserProp = auth.currentUser ? {
    uid: auth.currentUser.uid,
    displayName: auth.currentUser.displayName,
    photoURL: auth.currentUser.photoURL,
  } : undefined;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <TasasPageRedesign
        businessId={businessId}
        currentUser={currentUserProp}
        customRates={hasDynamicPricing ? customRates.map(cr => ({ id: cr.id, name: cr.name, value: cr.value, enabled: true })) : []}
      />

      {!hasDynamicPricing && (
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
            <Lock size={20} className="text-violet-400" />
          </div>
          <h3 className="text-sm font-black text-slate-700 dark:text-white/60 mb-1">
            Cuentas de Precio Adicionales
          </h3>
          <p className="text-xs text-slate-400 dark:text-white/20 max-w-sm mx-auto mb-4">
            Crea tasas personalizadas para manejar precios diferenciados en POS Mayor e Inventario.
          </p>
          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500/10 text-[11px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">
            Disponible desde el plan Negocio
          </span>
        </div>
      )}
    </div>
  );
};

export default ExchangeRatesSection;
