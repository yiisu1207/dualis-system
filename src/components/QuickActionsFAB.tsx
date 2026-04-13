import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, X, ShoppingCart, Users, Package, Wallet, FileText, Truck,
} from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  Icon: React.ElementType;
  color: string;
  path: string;
}

const ACTIONS: QuickAction[] = [
  { id: 'venta',     label: 'Nueva venta',     Icon: ShoppingCart, color: 'bg-indigo-500 shadow-indigo-500/30',   path: '/admin/cajas' },
  { id: 'cliente',   label: 'Nuevo cliente',    Icon: Users,       color: 'bg-emerald-500 shadow-emerald-500/30', path: '/admin/cobranzas?new=1' },
  { id: 'producto',  label: 'Nuevo producto',   Icon: Package,     color: 'bg-sky-500 shadow-sky-500/30',         path: '/admin/inventario?new=1' },
  { id: 'abono',     label: 'Registrar abono',  Icon: Wallet,      color: 'bg-amber-500 shadow-amber-500/30',     path: '/admin/cobranzas?abono=1' },
  { id: 'cotizacion',label: 'Cotización',        Icon: FileText,    color: 'bg-violet-500 shadow-violet-500/30',   path: '/admin/cotizaciones?new=1' },
  { id: 'despacho',  label: 'Despachar',         Icon: Truck,       color: 'bg-rose-500 shadow-rose-500/30',       path: '/admin/despacho' },
];

export default function QuickActionsFAB() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse items-end gap-2">
      {/* Main FAB button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`
          w-12 h-12 rounded-full flex items-center justify-center
          shadow-lg transition-all duration-300 ease-out
          ${open
            ? 'bg-white/10 backdrop-blur-md border border-white/20 rotate-45 shadow-xl'
            : 'bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-110'
          }
        `}
        title="Acciones rápidas"
      >
        {open
          ? <X size={18} className="text-white/80 -rotate-45" />
          : <Plus size={20} className="text-white" />
        }
      </button>

      {/* Actions menu */}
      {open && (
        <div className="flex flex-col gap-1.5 pb-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {ACTIONS.map((action, i) => (
            <button
              key={action.id}
              onClick={() => { setOpen(false); navigate(action.path); }}
              className="group flex items-center gap-2.5 pr-4 pl-2 py-2 rounded-xl bg-[#0d1424]/90 backdrop-blur-md border border-white/[0.08] hover:border-white/[0.15] hover:bg-[#0d1424] transition-all duration-150 shadow-lg"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <span className={`w-8 h-8 rounded-lg ${action.color} flex items-center justify-center shadow-md`}>
                <action.Icon size={14} className="text-white" />
              </span>
              <span className="text-[12px] font-bold text-white/70 group-hover:text-white whitespace-nowrap transition-colors">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
