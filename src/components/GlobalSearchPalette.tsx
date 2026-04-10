import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, User, Package, FileText, Settings, X, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';
import type { Customer, Movement, InventoryItem } from '../../types';

/**
 * Global search palette (Ctrl+K / Cmd+K).
 * Searches across customers, products, movements and quick-navigates to tabs.
 * Entirely additive — does not touch any existing flow.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  products: InventoryItem[];
  movements: Movement[];
  onNavigate: (tab: string, payload?: { entityId?: string; productId?: string; movementId?: string }) => void;
}

type ResultKind = 'customer' | 'product' | 'movement' | 'nav';

interface Result {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  action: () => void;
}

const NAV_ITEMS: Array<{ label: string; tab: string; hint: string }> = [
  { label: 'Dashboard',         tab: 'resumen',      hint: 'Resumen' },
  { label: 'Deudores / CxC',    tab: 'clientes',     hint: 'Cobranzas' },
  { label: 'Proveedores / CxP', tab: 'proveedores',  hint: 'Cuentas por pagar' },
  { label: 'Inventario',        tab: 'inventario',   hint: 'Productos, almacenes' },
  { label: 'Cajas / POS',       tab: 'cajas',        hint: 'Punto de venta' },
  { label: 'Despacho',          tab: 'despacho',     hint: 'Comprobantes pendientes' },
  { label: 'Citas',             tab: 'citas',        hint: 'Agenda de servicios' },
  { label: 'Pre-pedidos',       tab: 'prepedidos',   hint: 'Apartados y reservas' },
  { label: 'Reparaciones',      tab: 'reparaciones', hint: 'Tickets de servicio' },
  { label: 'RRHH',              tab: 'rrhh',         hint: 'Empleados y nómina' },
  { label: 'Tasas',             tab: 'tasas',        hint: 'BCV y paralela' },
  { label: 'Contabilidad',      tab: 'contabilidad', hint: 'Libro contable' },
  { label: 'Reportes',          tab: 'reportes',     hint: 'Analíticas' },
  { label: 'Conciliación',      tab: 'conciliacion', hint: 'Cuadre bancario' },
  { label: 'Reporte de Ventas', tab: 'libroventas',  hint: 'Registro administrativo' },
  { label: 'Sucursales',        tab: 'sucursales',   hint: 'Gestión multi-local' },
  { label: 'Configuración',     tab: 'config',       hint: 'Ajustes del sistema' },
];

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function GlobalSearchPalette({
  open,
  onClose,
  customers,
  products,
  movements,
  onNavigate,
}: Props) {
  const [q, setQ] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQ('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Escape handler
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  const results = useMemo<Result[]>(() => {
    const term = normalize(q.trim());
    if (!term) {
      // Empty query: show navigation shortcuts
      return NAV_ITEMS.map(n => ({
        kind: 'nav' as const,
        id: `nav-${n.tab}`,
        title: n.label,
        subtitle: n.hint,
        badge: 'Ir',
        action: () => { onNavigate(n.tab); onClose(); },
      }));
    }

    const out: Result[] = [];

    // Customers — match name, cedula, rif, phone, email
    for (const c of customers) {
      if (out.length >= 60) break;
      const name = normalize((c as any).fullName || (c as any).nombre || '');
      const ced = normalize(String((c as any).cedula || ''));
      const rif = normalize(String((c as any).rif || ''));
      const tel = normalize(String((c as any).telefono || (c as any).phone || ''));
      const mail = normalize(String((c as any).email || ''));
      if (
        name.includes(term) ||
        ced.includes(term) ||
        rif.includes(term) ||
        tel.includes(term) ||
        mail.includes(term)
      ) {
        out.push({
          kind: 'customer',
          id: `c-${c.id}`,
          title: (c as any).fullName || (c as any).nombre || 'Cliente',
          subtitle: [
            (c as any).cedula,
            (c as any).telefono || (c as any).phone,
          ].filter(Boolean).join(' · '),
          badge: 'Cliente',
          action: () => { onNavigate('clientes', { entityId: c.id }); onClose(); },
        });
      }
    }

    // Products — match nombre, codigo, sku
    for (const p of products) {
      if (out.length >= 90) break;
      const name = normalize(String((p as any).nombre || (p as any).name || ''));
      const code = normalize(String((p as any).codigo || (p as any).sku || ''));
      if (name.includes(term) || code.includes(term)) {
        const stock = Number((p as any).stock ?? 0);
        out.push({
          kind: 'product',
          id: `p-${(p as any).id || code}`,
          title: (p as any).nombre || (p as any).name || 'Producto',
          subtitle: [
            (p as any).codigo || (p as any).sku,
            `stock: ${stock}`,
          ].filter(Boolean).join(' · '),
          badge: 'Producto',
          action: () => { onNavigate('inventario', { productId: (p as any).id }); onClose(); },
        });
      }
    }

    // Movements — match nroControl, concept, entity name
    for (const m of movements) {
      if (out.length >= 120) break;
      const nro = normalize(String((m as any).nroControl || ''));
      const concept = normalize(String((m as any).concept || ''));
      const entity = normalize(String((m as any).entityLabel || ''));
      if (nro.includes(term) || concept.includes(term) || entity.includes(term)) {
        const amount = Number((m as any).amountInUSD || (m as any).amount || 0);
        out.push({
          kind: 'movement',
          id: `m-${m.id}`,
          title: `${(m as any).movementType || ''} ${(m as any).nroControl || ''}`.trim() || 'Movimiento',
          subtitle: `${(m as any).concept || ''} · $${amount.toFixed(2)}`,
          badge: (m as any).movementType || 'Mov',
          action: () => { onNavigate('clientes', { movementId: m.id }); onClose(); },
        });
      }
    }

    // Navigation items that match the term
    for (const n of NAV_ITEMS) {
      if (out.length >= 150) break;
      const lbl = normalize(n.label);
      if (lbl.includes(term) || normalize(n.hint).includes(term)) {
        out.push({
          kind: 'nav',
          id: `nav-${n.tab}`,
          title: n.label,
          subtitle: n.hint,
          badge: 'Ir',
          action: () => { onNavigate(n.tab); onClose(); },
        });
      }
    }

    return out;
  }, [q, customers, products, movements, onNavigate, onClose]);

  // Clamp selection
  useEffect(() => {
    if (selectedIdx >= results.length) setSelectedIdx(0);
  }, [results.length, selectedIdx]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[selectedIdx];
      if (r) r.action();
    }
  };

  if (!open) return null;

  const iconFor = (kind: ResultKind) => {
    switch (kind) {
      case 'customer': return <User size={14} className="text-sky-400" />;
      case 'product':  return <Package size={14} className="text-emerald-400" />;
      case 'movement': return <FileText size={14} className="text-violet-400" />;
      case 'nav':      return <Settings size={14} className="text-indigo-400" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden flex flex-col max-h-[70vh]"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/[0.06]">
          <Search size={16} className="text-slate-400 dark:text-white/30 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={e => { setQ(e.target.value); setSelectedIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar clientes, productos, movimientos..."
            className="flex-1 bg-transparent outline-none text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 dark:text-white/30"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs font-bold text-slate-400 dark:text-white/30">
              Sin resultados para "{q}"
            </div>
          ) : (
            <div className="py-1">
              {results.map((r, idx) => (
                <button
                  key={r.id}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  onClick={r.action}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    idx === selectedIdx
                      ? 'bg-indigo-500/10 dark:bg-indigo-500/15'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center shrink-0">
                    {iconFor(r.kind)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-900 dark:text-white truncate">{r.title}</p>
                    {r.subtitle && (
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-white/30 truncate">{r.subtitle}</p>
                    )}
                  </div>
                  {r.badge && (
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/40 shrink-0">
                      {r.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 dark:text-white/30">
            <span className="flex items-center gap-1"><ArrowUp size={10} /><ArrowDown size={10} /> navegar</span>
            <span className="flex items-center gap-1"><CornerDownLeft size={10} /> abrir</span>
            <span>ESC cerrar</span>
          </div>
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30">
            Ctrl+K
          </span>
        </div>
      </div>
    </div>
  );
}
