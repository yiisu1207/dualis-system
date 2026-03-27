import React, { useState, useEffect } from 'react';
import { Save, Loader2, Plus, Trash2, Lock } from 'lucide-react';
import { useRates } from '../context/RatesContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { auth } from '../firebase/config';
import type { CustomRate } from '../../types';
import RateHistoryWall from './RateHistoryWall';

const ExchangeRatesSection: React.FC = () => {
  const { customRates, updateCustomRates } = useRates();
  const { userProfile } = useAuth();
  const toast = useToast();

  const businessId = userProfile?.businessId || '';
  const { canAccess } = useSubscription(businessId);
  const hasDynamicPricing = canAccess('precios_dinamicos');

  const [localAccounts, setLocalAccounts] = useState<{ id: string; name: string; value: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');

  // Sync from context
  useEffect(() => {
    setLocalAccounts(customRates.map(cr => ({ id: cr.id, name: cr.name, value: cr.value })));
  }, [customRates]);

  // Save accounts
  const handleSave = async () => {
    if (!businessId) return;
    setSaving(true);
    try {
      const newCustomRates: CustomRate[] = localAccounts.map(a => ({
        id: a.id,
        name: a.name,
        value: a.value,
        enabled: true,
      }));
      await updateCustomRates(newCustomRates);
      toast.success('Cuentas actualizadas');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Add new account
  const handleAddAccount = () => {
    const name = newName.trim();
    if (!name) return;
    const id = name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    if (localAccounts.some(a => a.id === id)) {
      toast.error('Ya existe una cuenta con ese nombre');
      return;
    }
    setLocalAccounts(prev => [...prev, { id, name, value: 0 }]);
    setNewName('');
  };

  const removeAccount = (id: string) => {
    setLocalAccounts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* ─── Rate Wall (Historial Colaborativo) ─────────────────────────── */}
      <RateHistoryWall
        businessId={businessId}
        currentUser={auth.currentUser ? {
          uid: auth.currentUser.uid,
          displayName: auth.currentUser.displayName,
          photoURL: auth.currentUser.photoURL,
        } : undefined}
      />

      {/* ─── Cuentas de Precio ──────────────────────────────────────────── */}
      {hasDynamicPricing ? (
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-700 dark:text-white/80 uppercase tracking-widest">
              Cuentas de Precio
            </h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-white/20 mt-0.5">
              Tasas adicionales para POS Mayor e Inventario
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-black text-white flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-40 shadow-md shadow-indigo-500/20"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Existing accounts */}
          {localAccounts.map(account => (
            <div key={account.id} className="flex items-center gap-3 group">
              <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl">
                <span className="text-xs font-black text-slate-500 dark:text-white/30 uppercase tracking-wider min-w-[80px]">
                  {account.name}
                </span>
                <span className="text-[10px] font-bold text-slate-300 dark:text-white/10">Bs.</span>
                <input
                  type="number"
                  step="0.01"
                  value={account.value || ''}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setLocalAccounts(prev => prev.map(a => a.id === account.id ? { ...a, value: val } : a));
                  }}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-sm font-bold text-slate-800 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-white/15"
                />
                {account.value > 0 && (
                  <span className="text-[9px] font-bold text-slate-400 dark:text-white/15 whitespace-nowrap">
                    1 USD = Bs.{account.value.toFixed(2)}
                  </span>
                )}
              </div>
              <button
                onClick={() => removeAccount(account.id)}
                className="h-10 w-10 rounded-xl border border-transparent hover:border-rose-500/20 hover:bg-rose-500/10 flex items-center justify-center text-slate-300 dark:text-white/10 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"
                title="Eliminar cuenta"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {localAccounts.length === 0 && (
            <p className="text-center text-xs font-bold text-slate-400 dark:text-white/15 py-4">
              No hay cuentas adicionales configuradas
            </p>
          )}

          {/* Add new */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-white/[0.04]">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
              placeholder="Nombre de nueva cuenta..."
              className="flex-1 px-4 py-3 bg-slate-50 dark:bg-white/[0.03] border border-dashed border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/15 focus:ring-2 focus:ring-violet-400/20 outline-none transition-all"
            />
            <button
              onClick={handleAddAccount}
              disabled={!newName.trim()}
              className="h-11 px-4 rounded-xl text-xs font-black text-white flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 disabled:opacity-20 shadow-md"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}
            >
              <Plus size={14} />
              Agregar
            </button>
          </div>
        </div>
      </div>
      ) : (
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
