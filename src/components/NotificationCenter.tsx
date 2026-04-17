import React, { useMemo } from 'react';
import { X, Bell, AlertTriangle, Info, Package, TrendingUp, ChevronRight, Users, FileText, CheckCheck, GitCompare, ShieldCheck } from 'lucide-react';
import { Movement } from '../../types';

interface Notification {
  id: string;
  title: string;
  subtitle: string;
  type: 'warning' | 'info';
}

interface NotificationCenterProps {
  notifications: Notification[];
  inventoryItems: any[];
  movements: Movement[];
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

const NAV_MAP: Record<string, string> = {
  'low-stock': 'inventario',
  'today-activity': 'contabilidad',
  'overdue-cxc': 'clientes',
  'pending-cxp': 'proveedores',
  'pending-compare': 'comparar',
  'pending-products': 'inventario',
  'nde-pendientes': 'despacho',
  'cobranza-reminders': 'cobranza',
  'pending-approvals': 'clientes',
};

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  inventoryItems,
  movements,
  onClose,
  onNavigate,
  onDismiss,
  onDismissAll,
}) => {
  const lowStockItems = useMemo(
    () => inventoryItems.filter(p => {
      // Dual-model stock: prefer sum across warehouses, fall back to legacy field.
      const map = p.stockByAlmacen as Record<string, number> | undefined;
      const sumWarehouses = map
        ? Object.values(map).reduce<number>((acc, v) => acc + Number(v ?? 0), 0)
        : 0;
      const legacy = Number(p.stock ?? p.quantity ?? 0);
      const stock = sumWarehouses >= legacy ? sumWarehouses : legacy;
      const min = p.minStock ?? 10;
      return stock < min;
    }),
    [inventoryItems]
  );

  const today = new Date().toISOString().split('T')[0];
  const todayMovements = useMemo(
    () => movements.filter(m => m.date?.startsWith(today)),
    [movements, today]
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-slate-900/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-screen w-[380px] z-[71] bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-100 dark:border-white/[0.07] flex flex-col animate-in slide-in-from-right-8 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Bell size={16} className="text-[#4f6ef7]" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 dark:text-white text-[15px] leading-tight">Notificaciones</h2>
              <p className="text-[11px] text-slate-400 font-medium">
                {notifications.length === 0
                  ? 'Sin alertas activas'
                  : `${notifications.length} alerta${notifications.length > 1 ? 's' : ''} pendiente${notifications.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={onDismissAll}
                title="Marcar todas como leídas"
                className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-white/[0.04] hover:bg-blue-50 dark:hover:bg-blue-500/10 flex items-center justify-center text-slate-400 hover:text-blue-500 transition-all"
              >
                <CheckCheck size={14} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-white/[0.07] hover:bg-slate-100 dark:hover:bg-white/[0.12] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300 transition-all"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scroll">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                <Bell size={24} className="text-emerald-500" />
              </div>
              <p className="font-black text-slate-700 dark:text-slate-300 text-[15px]">Todo en orden</p>
              <p className="text-slate-400 text-[13px]">No hay alertas ni notificaciones pendientes.</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {notifications.map(notif => {
                const isWarning = notif.type === 'warning';
                // NAV_MAP lookup: primero exacto, luego por prefijo (IDs dinámicos como pending-approvals:xxx)
                const baseId = notif.id.split(':')[0];
                const tab = NAV_MAP[notif.id] || NAV_MAP[baseId] || 'resumen';

                const icon = (() => {
                  if (notif.id === 'low-stock') return <Package size={15} className="text-amber-600" />;
                  if (notif.id === 'today-activity') return <TrendingUp size={15} className="text-blue-600" />;
                  if (notif.id === 'overdue-cxc') return <Users size={15} className="text-rose-600" />;
                  if (notif.id === 'pending-cxp') return <FileText size={15} className="text-blue-600" />;
                  if (notif.id === 'pending-compare') return <GitCompare size={15} className="text-indigo-500" />;
                  if (baseId === 'pending-approvals') return <ShieldCheck size={15} className="text-orange-500" />;
                  return isWarning
                    ? <AlertTriangle size={15} className="text-amber-600" />
                    : <Info size={15} className="text-blue-600" />;
                })();

                const detail = notif.id === 'low-stock'
                  ? lowStockItems.slice(0, 2).map(p => p.name).join(', ') + (lowStockItems.length > 2 ? ` y ${lowStockItems.length - 2} más` : '')
                  : notif.id === 'today-activity'
                  ? `${todayMovements.length} registrado${todayMovements.length > 1 ? 's' : ''} desde la apertura`
                  : null;

                return (
                  <div
                    key={notif.id}
                    className={`rounded-2xl border overflow-hidden ${
                      isWarning
                        ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/[0.06]'
                        : 'border-blue-200 bg-blue-50/60 dark:border-blue-500/20 dark:bg-blue-500/[0.06]'
                    }`}
                  >
                    <button
                      onClick={() => { onNavigate(tab); onClose(); }}
                      className={`w-full p-4 flex items-start gap-3 text-left transition-all ${
                        isWarning ? 'hover:bg-amber-50 dark:hover:bg-amber-500/10' : 'hover:bg-blue-50 dark:hover:bg-blue-500/10'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isWarning ? 'bg-amber-100 dark:bg-amber-500/15' : 'bg-blue-100 dark:bg-blue-500/15'
                      }`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-black text-[13px] leading-tight ${isWarning ? 'text-amber-800 dark:text-amber-300' : 'text-blue-800 dark:text-blue-300'}`}>
                          {notif.title}
                        </p>
                        {detail && (
                          <p className={`text-[11px] mt-0.5 truncate ${isWarning ? 'text-amber-600 dark:text-amber-400/70' : 'text-blue-600 dark:text-blue-400/70'}`}>
                            {detail}
                          </p>
                        )}
                        <p className={`text-[11px] mt-1.5 flex items-center gap-1 font-semibold ${isWarning ? 'text-amber-500 dark:text-amber-400' : 'text-blue-500 dark:text-blue-400'}`}>
                          {notif.subtitle} <ChevronRight size={11} />
                        </p>
                      </div>
                    </button>
                    <div className={`px-4 pb-3 flex justify-end border-t ${isWarning ? 'border-amber-100/60 dark:border-amber-500/15' : 'border-blue-100/60 dark:border-blue-500/15'}`}>
                      <button
                        onClick={() => onDismiss(notif.id)}
                        className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-lg transition-all ${
                          isWarning
                            ? 'text-amber-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:text-amber-300 dark:hover:bg-amber-500/15'
                            : 'text-blue-400 hover:text-blue-600 hover:bg-blue-100 dark:hover:text-blue-300 dark:hover:bg-blue-500/15'
                        }`}
                      >
                        Marcar como leída
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.07] shrink-0">
          <p className="text-[11px] text-slate-400 text-center font-medium">
            Actualizado en tiempo real · Firebase Live
          </p>
        </div>
      </div>
    </>
  );
};

export default NotificationCenter;
