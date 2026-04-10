import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, FileText, CreditCard, Settings2, ShieldCheck } from 'lucide-react';
import type { Movement, Customer, Supplier, CustomRate, ExchangeRates, ApprovalConfig } from '../../../types';
import { resolveAccountLabel, resolveAccountColor, resolveRateForAccount } from './cxcHelpers';
import { mapMovementToApprovalKind } from '../../utils/approvalHelpers';

export type PanelPosition = 'right' | 'left' | 'center' | 'bottom' | 'top';

const POSITION_LABELS: Record<PanelPosition, string> = {
  right: 'Derecha',
  left: 'Izquierda',
  center: 'Centro',
  top: 'Arriba',
  bottom: 'Abajo',
};

function getPanelPositionClasses(pos: PanelPosition): { container: string; panel: string; animation: string } {
  switch (pos) {
    case 'left':
      return {
        container: 'justify-start',
        panel: 'w-full max-w-md h-full border-r border-l-0',
        animation: 'animate-slide-in-left',
      };
    case 'center':
      return {
        container: 'items-center justify-center p-4',
        panel: 'w-full max-w-lg max-h-[90vh] rounded-2xl border shadow-2xl',
        animation: 'animate-scale-in',
      };
    case 'top':
      return {
        container: 'items-start justify-center pt-4 px-4',
        panel: 'w-full max-w-lg max-h-[85vh] rounded-2xl border shadow-2xl',
        animation: 'animate-slide-in-top',
      };
    case 'bottom':
      return {
        container: 'items-end justify-center pb-4 px-4',
        panel: 'w-full max-w-lg max-h-[85vh] rounded-2xl border shadow-2xl',
        animation: 'animate-slide-in-bottom',
      };
    default: // right
      return {
        container: 'justify-end',
        panel: 'w-full max-w-md h-full border-l',
        animation: 'animate-slide-in-right',
      };
  }
}

interface MovementFormPanelProps {
  mode: 'cxc' | 'cxp';
  type: 'FACTURA' | 'ABONO';
  entity?: Customer | Supplier;
  entities: (Customer | Supplier)[];
  bcvRate: number;
  customRates: CustomRate[];
  rates: ExchangeRates;
  businessId: string;
  onSave: (data: Partial<Movement>) => Promise<void>;
  onClose: () => void;
  editingMovement?: Movement;
  approvalConfig?: ApprovalConfig;
  validatorCount?: number;
}

const PAYMENT_METHODS = ['Transferencia', 'Pago Movil', 'Efectivo USD', 'Efectivo Bs', 'Zelle', 'Binance', 'Punto de Venta'];
const EXPENSE_CATEGORIES = ['Mercancia', 'Servicios', 'Alquiler', 'Transporte', 'Impuestos', 'Nomina', 'Otro'];

const inp = "w-full px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all";
const label = "text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block";

export function MovementFormPanel({
  mode,
  type: initialType,
  entity: preselectedEntity,
  entities,
  bcvRate,
  customRates,
  rates,
  businessId,
  onSave,
  onClose,
  editingMovement,
  approvalConfig,
  validatorCount = 0,
}: MovementFormPanelProps) {
  const isEditing = !!editingMovement;

  const [movType, setMovType] = useState<'FACTURA' | 'ABONO'>(editingMovement?.movementType as any || initialType);
  const [entityId, setEntityId] = useState(editingMovement?.entityId || preselectedEntity?.id || '');
  const [entitySearch, setEntitySearch] = useState('');
  const [accountType, setAccountType] = useState(editingMovement?.accountType as string || 'BCV');
  const [currency, setCurrency] = useState<'USD' | 'BS'>(editingMovement?.currency as any || 'USD');
  const [amount, setAmount] = useState(editingMovement ? String(editingMovement.amount || editingMovement.amountInUSD || '') : '');
  const [rateUsed, setRateUsed] = useState(editingMovement?.rateUsed?.toString() || '');
  const [date, setDate] = useState(editingMovement?.date?.split('T')[0] || new Date().toISOString().split('T')[0]);
  const [concept, setConcept] = useState(editingMovement?.concept || '');
  const [nroControl, setNroControl] = useState(editingMovement?.nroControl || '');
  const [paymentDays, setPaymentDays] = useState(editingMovement?.paymentDays ?? 0);
  const [earlyPayDiscount, setEarlyPayDiscount] = useState(!!(editingMovement?.earlyPayDiscountPct));
  const [discountPct, setDiscountPct] = useState(editingMovement?.earlyPayDiscountPct?.toString() || '1');
  const [metodoPago, setMetodoPago] = useState(editingMovement?.metodoPago || 'Transferencia');
  const [referencia, setReferencia] = useState(editingMovement?.referencia || editingMovement?.reference || '');
  const [expenseCategory, setExpenseCategory] = useState(editingMovement?.expenseCategory || '');
  const [saving, setSaving] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition>(() => {
    try { return (localStorage.getItem('dualis_panel_position') as PanelPosition) || 'right'; } catch { return 'right'; }
  });
  const [showPositionMenu, setShowPositionMenu] = useState(false);

  const changePanelPosition = (pos: PanelPosition) => {
    setPanelPosition(pos);
    try { localStorage.setItem('dualis_panel_position', pos); } catch {}
    setShowPositionMenu(false);
  };

  const posClasses = getPanelPositionClasses(panelPosition);

  // All available accounts: BCV + enabled custom rates
  const availableAccounts = useMemo(() => {
    const accs: { id: string; label: string; color: string }[] = [
      { id: 'BCV', label: 'BCV', color: 'indigo' },
    ];
    customRates.filter(r => r.enabled).forEach((r, i) => {
      accs.push({ id: r.id, label: r.name, color: resolveAccountColor(r.id, customRates, i) });
    });
    return accs;
  }, [customRates]);

  // Auto-set rate when account changes
  useEffect(() => {
    if (!isEditing) {
      const rate = resolveRateForAccount(accountType, bcvRate, customRates);
      setRateUsed(rate > 0 ? rate.toString() : '');
    }
  }, [accountType, bcvRate, customRates, isEditing]);

  // Filter entities for search
  const filteredEntities = useMemo(() => {
    if (!entitySearch.trim()) return entities.slice(0, 20);
    const q = entitySearch.toLowerCase();
    return entities.filter(e => {
      const name = ('nombre' in e ? e.nombre : '') || ('fullName' in e ? (e as any).fullName : '') || e.id || '';
      const doc = ('cedula' in e ? (e as Customer).cedula : '') || ('rif' in e ? (e as Supplier).rif : '');
      return name.toLowerCase().includes(q) || doc.toLowerCase().includes(q);
    }).slice(0, 20);
  }, [entities, entitySearch]);

  const selectedEntity = useMemo(
    () => entities.find(e => e.id === entityId),
    [entities, entityId]
  );

  const entityDisplayName = useCallback((e: Customer | Supplier) => {
    const name = ('fullName' in e ? (e as any).fullName : '') || ('nombre' in e ? (e as any).nombre : '') || e.id;
    return name;
  }, []);

  // Quorum banner — Fase D.0
  const needsApproval = useMemo(() => {
    if (isEditing) return false;
    if (!approvalConfig || !approvalConfig.enabled) return false;
    const quorumRequired = Math.max(2, approvalConfig.quorumRequired || 2);
    if (validatorCount < quorumRequired) return false;
    const kind = mapMovementToApprovalKind({
      movementType: movType,
      isSupplierMovement: mode === 'cxp',
      anulada: false,
    });
    if (!kind || !approvalConfig.appliesTo.includes(kind)) return false;
    return true;
  }, [isEditing, approvalConfig, validatorCount, movType, mode]);

  const dueDate = useMemo(() => {
    if (movType !== 'FACTURA' || paymentDays <= 0) return null;
    const d = new Date(date);
    d.setDate(d.getDate() + paymentDays);
    return d.toISOString().split('T')[0];
  }, [date, paymentDays, movType]);

  const handleSubmit = async () => {
    if (!entityId || !amount || saving) return;

    const parsedAmount = parseFloat(amount) || 0;
    const parsedRate = parseFloat(rateUsed) || 0;
    if (parsedAmount <= 0) return;

    setSaving(true);
    try {
      const amountInUSD = currency === 'BS' && parsedRate > 0 ? parsedAmount / parsedRate : parsedAmount;

      const data: Partial<Movement> = {
        entityId,
        businessId,
        movementType: movType,
        accountType,
        currency,
        amount: parsedAmount,
        amountInUSD,
        rateUsed: parsedRate,
        date,
        createdAt: isEditing ? editingMovement!.createdAt : new Date().toISOString(),
        concept: concept.trim() || (movType === 'FACTURA' ? (mode === 'cxp' ? 'Factura' : 'Venta') : 'Abono'),
        nroControl: nroControl.trim(),
        isSupplierMovement: mode === 'cxp',
      };

      if (movType === 'FACTURA') {
        data.paymentDays = paymentDays;
        if (dueDate) data.dueDate = dueDate;
        data.pagado = paymentDays === 0;
        data.estadoPago = paymentDays === 0 ? 'PAGADO' : 'PENDIENTE';
        data.esVentaContado = paymentDays === 0;
        if (earlyPayDiscount && dueDate) {
          data.earlyPayDiscountPct = parseFloat(discountPct) || 0;
          data.earlyPayDiscountExpiry = dueDate;
        }
      } else {
        data.metodoPago = metodoPago;
        data.referencia = referencia.trim();
        data.reference = referencia.trim();
        data.pagado = true;
        data.estadoPago = 'PAGADO';
      }

      if (mode === 'cxp' && expenseCategory) {
        data.expenseCategory = expenseCategory;
      }

      await onSave(data);
      onClose();
    } catch (err) {
      console.error('Error saving movement:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-[200] flex ${posClasses.container}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className={`relative bg-white dark:bg-[#0a0f1c] overflow-y-auto shadow-2xl border-slate-200 dark:border-white/[0.06] ${posClasses.panel} ${posClasses.animation}`}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white dark:bg-[#0a0f1c] border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            {movType === 'FACTURA' ? <FileText size={16} className="text-rose-400" /> : <CreditCard size={16} className="text-emerald-400" />}
            <h2 className="text-sm font-black text-slate-800 dark:text-white">
              {isEditing ? 'Editar' : 'Nuevo'} {movType === 'FACTURA' ? (mode === 'cxp' ? 'Factura' : 'Cargo') : 'Abono'}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {/* Position toggle */}
            <div className="relative">
              <button
                onClick={() => setShowPositionMenu(p => !p)}
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all"
                title="Cambiar posición del panel"
              >
                <Settings2 size={13} className="text-slate-400" />
              </button>
              {showPositionMenu && (
                <div className="absolute right-0 top-10 z-50 bg-white dark:bg-[#141b2d] border border-slate-200 dark:border-white/[0.1] rounded-xl shadow-2xl py-1.5 min-w-[140px]">
                  {(Object.keys(POSITION_LABELS) as PanelPosition[]).map(pos => (
                    <button
                      key={pos}
                      onClick={() => changePanelPosition(pos)}
                      className={`w-full px-3 py-2 text-left text-[11px] font-bold transition-all ${
                        panelPosition === pos
                          ? 'bg-indigo-500/10 text-indigo-400'
                          : 'text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      {POSITION_LABELS[pos]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all">
              <X size={14} className="text-slate-400" />
            </button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Type toggle */}
          {!isEditing && (
            <div className="flex rounded-xl bg-slate-100 dark:bg-white/[0.04] p-1">
              {(['FACTURA', 'ABONO'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setMovType(t)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    movType === t
                      ? t === 'FACTURA'
                        ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                        : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                      : 'text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50'
                  }`}
                >
                  {t === 'FACTURA' ? (mode === 'cxp' ? 'FACTURA' : 'CARGO') : 'ABONO'}
                </button>
              ))}
            </div>
          )}

          {/* Approval quorum banner — Fase D.0 */}
          {needsApproval && (
            <div className="rounded-xl bg-amber-500/[0.08] border border-amber-500/30 px-4 py-3 flex items-start gap-3">
              <ShieldCheck size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                  Requiere aprobación
                </p>
                <p className="text-[10px] font-bold text-amber-300/80 mt-0.5 leading-snug">
                  Este movimiento quedará pendiente hasta reunir {Math.max(2, approvalConfig?.quorumRequired || 2)} firmas de validadores distintos.
                </p>
              </div>
            </div>
          )}

          {/* Entity selector */}
          <div>
            <label className={label}>{mode === 'cxc' ? 'Cliente' : 'Proveedor'}</label>
            {selectedEntity ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-500/[0.06] border border-indigo-500/20">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-400">
                  {entityDisplayName(selectedEntity).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-800 dark:text-white truncate">{entityDisplayName(selectedEntity)}</p>
                  <p className="text-[10px] text-slate-400 dark:text-white/30">
                    {'cedula' in selectedEntity ? (selectedEntity as Customer).cedula : ('rif' in selectedEntity ? (selectedEntity as Supplier).rif : '')}
                  </p>
                </div>
                {!isEditing && (
                  <button onClick={() => { setEntityId(''); setEntitySearch(''); }}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-white/60">
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={entitySearch}
                  onChange={e => setEntitySearch(e.target.value)}
                  placeholder={`Buscar ${mode === 'cxc' ? 'cliente' : 'proveedor'}...`}
                  inputMode="search"
                  enterKeyHint="search"
                  className={inp}
                />
                {filteredEntities.length > 0 && (
                  <div className="max-h-[200px] overflow-y-auto rounded-xl border border-slate-200 dark:border-white/[0.06] divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {filteredEntities.map(e => (
                      <button
                        key={e.id}
                        onClick={() => { setEntityId(e.id); setEntitySearch(''); }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                      >
                        <p className="text-xs font-bold text-slate-700 dark:text-white/70">{entityDisplayName(e)}</p>
                        <p className="text-[10px] text-slate-400 dark:text-white/30">
                          {'cedula' in e ? (e as Customer).cedula : ('rif' in e ? (e as Supplier).rif : '')}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Account pills */}
          <div>
            <label className={label}>Cuenta</label>
            <div className="flex flex-wrap gap-1.5">
              {availableAccounts.map(acc => {
                const active = accountType === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => setAccountType(acc.id)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                      active
                        ? `bg-${acc.color}-500/20 border-${acc.color}-500/30 text-${acc.color}-400 shadow-sm`
                        : 'border-slate-200 dark:border-white/[0.06] text-slate-400 dark:text-white/30 hover:border-slate-300 dark:hover:border-white/[0.12]'
                    }`}
                  >
                    {acc.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Currency + Amount */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Moneda</label>
              <div className="flex rounded-xl bg-slate-100 dark:bg-white/[0.04] p-0.5">
                {(['USD', 'BS'] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                      currency === c ? 'bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 dark:text-white/30'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className={label}>Monto</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                enterKeyHint="next"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className={inp}
              />
            </div>
          </div>

          {/* Rate + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Tasa</label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                enterKeyHint="next"
                value={rateUsed}
                onChange={e => setRateUsed(e.target.value)}
                placeholder="0.00"
                className={inp}
              />
            </div>
            <div>
              <label className={label}>Fecha</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inp}
              />
            </div>
          </div>

          {/* FACTURA-only fields */}
          {movType === 'FACTURA' && (
            <>
              <div>
                <label className={label}>Dias de credito</label>
                <div className="flex gap-1.5">
                  {[0, 15, 30, 45, 60].map(d => (
                    <button
                      key={d}
                      onClick={() => setPaymentDays(d)}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${
                        paymentDays === d
                          ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                          : 'border-slate-200 dark:border-white/[0.06] text-slate-400 dark:text-white/30'
                      }`}
                    >
                      {d === 0 ? 'Contado' : `${d}d`}
                    </button>
                  ))}
                </div>
                {dueDate && (
                  <p className="text-[9px] text-slate-400 dark:text-white/25 mt-1.5 font-bold">
                    Vence: {new Date(dueDate).toLocaleDateString('es-VE')}
                  </p>
                )}
              </div>

              {paymentDays > 0 && (
                <div className="rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20 px-4 py-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={earlyPayDiscount}
                      onChange={e => setEarlyPayDiscount(e.target.checked)}
                      className="rounded border-emerald-500/30 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Descuento pronto pago</span>
                  </label>
                  {earlyPayDiscount && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        inputMode="decimal"
                        enterKeyHint="done"
                        value={discountPct}
                        onChange={e => setDiscountPct(e.target.value)}
                        className="w-20 px-2 py-1.5 rounded-lg bg-white dark:bg-white/[0.04] border border-emerald-500/20 text-sm font-black text-emerald-500 text-center outline-none"
                      />
                      <span className="text-[10px] font-bold text-emerald-400/60">% si paga antes de vencimiento</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ABONO-only fields */}
          {movType === 'ABONO' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Metodo pago</label>
                <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} className={inp}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Referencia</label>
                <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Nro. ref" className={inp} />
              </div>
            </div>
          )}

          {/* CxP expense category */}
          {mode === 'cxp' && (
            <div>
              <label className={label}>Categoria de gasto</label>
              <select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)} className={inp}>
                <option value="">Sin categoria</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Concept + NroControl */}
          <div>
            <label className={label}>Concepto</label>
            <input value={concept} onChange={e => setConcept(e.target.value)} placeholder="Descripcion del movimiento" className={inp} />
          </div>
          <div>
            <label className={label}>Nro Control</label>
            <input value={nroControl} onChange={e => setNroControl(e.target.value)} placeholder="Opcional" className={inp} />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-5 py-4 bg-white dark:bg-[#0a0f1c] border-t border-slate-100 dark:border-white/[0.06] flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-white/40 text-xs font-black uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-all">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!entityId || !amount || saving}
            className={`flex-1 py-3 rounded-xl text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg disabled:opacity-40 ${
              movType === 'FACTURA'
                ? 'bg-gradient-to-r from-rose-500 to-pink-500 shadow-rose-500/25 hover:from-rose-400 hover:to-pink-400'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-400'
            }`}
          >
            {saving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
