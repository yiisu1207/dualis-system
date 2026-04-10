import React, { useState, useMemo, useEffect, useRef } from 'react';
import { NumericFormat } from 'react-number-format';
import { DayPicker } from 'react-day-picker';
import {
  Customer,
  Movement,
  AccountType,
  MovementType,
  ExchangeRates,
  PaymentCurrency,
  AppConfig,
} from '../../types';
import Autocomplete from './Autocomplete';
import ClientStatusBadge from './ClientStatusBadge';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { buildClientStatus, ClientTag } from '../utils/clientStatus';
import { scanInvoiceImage } from '../lib/ai-scanner';
import EmptyState from './EmptyState';
import WhatsAppTemplateModal, { TemplateContext } from './WhatsAppTemplateModal';
import { DEFAULT_CONFIG } from '../utils/configDefaults';
import { useToast } from '../context/ToastContext';

interface CustomerViewerProps {
  customers: Customer[];
  movements: Movement[];
  rateCalendar?: RateCalendarMap;
  selectedId?: string | null;
  onSelectCustomer?: (id: string | null) => void;
  onOpenLedger?: (id: string) => void;
  onUpdateMovement: (id: string, updated: Partial<Movement>) => void;
  onDeleteMovement: (id: string) => void;
  onAddMovement: (data: any) => void;
  onRegisterCustomer: (c: Customer) => void;
  onUpdateCustomer: (id: string, c: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  rates: ExchangeRates;
  getSmartRate?: (date: string, accountType: AccountType) => Promise<number>;
  config: AppConfig;
  openCreateCustomer?: boolean;
  onCreateCustomerOpened?: () => void;
}

type AgingItem = {
  customer: string;
  cedula?: string;
  amount: number;
  age: number;
  date: string;
  reference?: string | null;
  accountType: AccountType;
  currency: PaymentCurrency;
  rate: number;
  category: 'green' | 'yellow' | 'red';
  tags?: ClientTag[];
};

type RateCalendarMap = Record<string, { bcv: number; grupo: number }>;

const toDateKey = (date: Date) => {
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const parseDateKey = (value: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map((n) => Number(n));
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

const SmartDatePicker: React.FC<{
  value: string;
  onChange: (value: string) => void;
  rateDates?: Set<string>;
  onRateCheck?: (value: string) => void;
  className?: string;
  inputClassName?: string;
  tabIndex?: number;
}> = ({ value, onChange, rateDates: _rateDates, onRateCheck, className = '', inputClassName = '', tabIndex }) => {
  const [open, setOpen] = useState(false);
  const [textVal, setTextVal] = useState(value);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = value ? parseDateKey(value) : undefined;

  useEffect(() => setTextVal(value), [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (date?: Date) => {
    if (!date) return;
    const next = toDateKey(date);
    onChange(next);
    onRateCheck?.(next);
    setOpen(false);
  };

  const applyTypedDate = () => {
    const dmy = textVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      const fmt = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
      onChange(fmt); onRateCheck?.(fmt); return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(textVal)) {
      onChange(textVal); onRateCheck?.(textVal); return;
    }
    setTextVal(value);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <input
        type="text"
        tabIndex={tabIndex}
        className={inputClassName || 'w-full px-3 py-3 pr-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-soft)] transition-all'}
        value={textVal}
        placeholder="DD/MM/AAAA"
        onChange={(e) => setTextVal(e.target.value)}
        onBlur={applyTypedDate}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyTypedDate(); } }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen((prev) => !prev)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[var(--ui-accent)] transition-colors"
        title="Abrir calendario"
      >
        <i className="fa-solid fa-calendar-days text-xs" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1.5 rounded-2xl border border-slate-100 dark:border-white/[0.07] bg-white dark:bg-slate-900 shadow-xl p-3">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  );
};

// --- SUB-COMPONENT: ACTION CARD ---
const ActionCard: React.FC<{
  title: string;
  accountType: AccountType;
  rate: number;
  headerColor: string;
  btnColor: string;
  icon: string;
  customerName?: string;
  isGlobal?: boolean;
  allCustomers?: Customer[];
  rateCalendar?: RateCalendarMap;
  rateDates?: Set<string>;
  onAction: (data: any) => void;
  onCreateCustomer?: (c: Customer) => void;
}> = ({
  title,
  accountType,
  rate,
  headerColor: _headerColor,
  btnColor: _btnColor,
  icon: _icon,
  customerName,
  isGlobal,
  allCustomers,
  rateCalendar,
  rateDates,
  onAction,
  onCreateCustomer,
}) => {
  const { success, error, warning, info } = useToast();
  const [localCustomer, setLocalCustomer] = useState(customerName || '');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [reference, setReference] = useState('');
  const [opDate, setOpDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<MovementType>(MovementType.FACTURA);
  const [currency, setCurrency] = useState<PaymentCurrency>(
    accountType === AccountType.DIVISA ? PaymentCurrency.USD : PaymentCurrency.BS
  );
  const [customRate, setCustomRate] = useState(rate.toString());
  const [rateHint, setRateHint] = useState('');
  const [quickPaymentOption, setQuickPaymentOption] = useState<'USD' | 'BS'>(
    accountType === AccountType.DIVISA ? 'USD' : 'BS'
  );
  const [ocrLoading, setOcrLoading] = useState(false);
  const ocrInputRef = useRef<HTMLInputElement | null>(null);
  const [creatingInline, setCreatingInline] = useState(false);
  const [newEntity, setNewEntity] = useState<{
    id: string;
    cedula?: string;
    telefonoCountry?: string;
    telefono?: string;
    direccion?: string;
  }>({ id: '', cedula: '', telefonoCountry: '+58', telefono: '', direccion: '' });

  useEffect(() => {
    if (customerName) setLocalCustomer(customerName);
  }, [customerName]);

  useEffect(() => {
    setCustomRate(rate.toString());
  }, [rate]);

  const handleOpDateChange = (value: string) => {
    setOpDate(value);
    if (!rateCalendar || accountType === AccountType.DIVISA) {
      setRateHint('');
      return;
    }
    const entry = rateCalendar[value];
    if (entry) {
      const nextRate = accountType === AccountType.BCV ? entry.bcv : entry.grupo;
      setCustomRate(String(nextRate));
      setRateHint(`Tasa historica cargada: ${nextRate} Bs`);
    } else {
      setRateHint('No hay tasa registrada para esta fecha. Usando tasa actual.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !localCustomer) {
      if (!localCustomer) { warning('Por favor seleccione un cliente.'); return; }
      return;
    }
    const numAmount = parseFloat(amount);
    const usedRate = parseFloat(customRate) || 1;

    // Determinar método de pago según la opción rápida seleccionada
    const metodoPago =
      quickPaymentOption === 'BS'
        ? 'Transferencia'
        : reference && reference.trim().length > 0
        ? 'Transferencia'
        : 'Efectivo';
    const usedCurrency = quickPaymentOption === 'BS' ? PaymentCurrency.BS : PaymentCurrency.USD;

    onAction({
      customerName: localCustomer,
      date: opDate || new Date().toISOString().split('T')[0],
      concept: concept || (type === MovementType.FACTURA ? 'Venta Rápida' : 'Abono Rápida'),
      amount: numAmount,
      originalAmount: numAmount,
      type,
      accountType,
      currency: usedCurrency,
      rate: usedRate,
      metodoPago,
      reference: reference || null,
    });
    setAmount('');
    setConcept('');
    setReference('');
    setOpDate(new Date().toISOString().split('T')[0]);
    if (isGlobal) setLocalCustomer('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 w-full animate-in zoom-in border-t-8 border-indigo-500 shadow-2xl h-full"
    >
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 uppercase italic">
          Nuevo Movimiento
        </h3>
        <div className="flex items-center gap-2">
          <input
            ref={ocrInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setOcrLoading(true);
              try {
                const result = await scanInvoiceImage(file, 'CUSTOMER');
                if (result?.entityName) setLocalCustomer(String(result.entityName).toUpperCase());
                if (result?.amount != null) setAmount(String(result.amount));
                if (result?.concept) setConcept(String(result.concept));
                if (result?.reference) setReference(String(result.reference));
                if (result?.movementType === 'ABONO') setType(MovementType.ABONO);
                if (result?.movementType === 'FACTURA') setType(MovementType.FACTURA);
                if (result?.currency === 'BS') {
                  setQuickPaymentOption('BS');
                  setCurrency(PaymentCurrency.BS);
                }
                if (result?.currency === 'USD') {
                  setQuickPaymentOption('USD');
                  setCurrency(PaymentCurrency.USD);
                }
              } catch (err) {
                console.error(err);
                error('No se pudo leer la imagen con IA.');
              } finally {
                setOcrLoading(false);
                if (ocrInputRef.current) ocrInputRef.current.value = '';
              }
            }}
          />
          <button
            type="button"
            onClick={() => ocrInputRef.current?.click()}
            className="px-3 py-2 text-[10px] font-black uppercase bg-slate-100 dark:bg-white/[0.07] hover:bg-indigo-600 hover:text-slate-900 dark:text-white rounded-full transition-colors"
          >
            {ocrLoading ? 'OCR...' : 'OCR'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAmount('');
              setConcept('');
              setReference('');
              setOpDate(new Date().toISOString().split('T')[0]);
            }}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.07] hover:bg-rose-500 hover:text-slate-900 dark:text-white transition-colors flex items-center justify-center"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div className="space-y-5">
        <div className="bg-slate-100 dark:bg-white/[0.07] p-1 rounded-xl flex">
          <button
            type="button"
            onClick={() => setType(MovementType.FACTURA)}
            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
              type === MovementType.FACTURA
                ? 'bg-white dark:bg-slate-900 shadow text-indigo-600'
                : 'text-slate-400'
            }`}
          >
            Generar Deuda
          </button>
          <button
            type="button"
            onClick={() => setType(MovementType.ABONO)}
            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
              type === MovementType.ABONO
                ? 'bg-emerald-500 shadow text-slate-900 dark:text-white'
                : 'text-slate-400'
            }`}
          >
            Registrar Abono
          </button>
        </div>

        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
            Cliente
          </label>
          <Autocomplete
            items={allCustomers || []}
            stringify={(c: any) => c.id}
            placeholder="Buscar cliente por nombre o cédula..."
            value={localCustomer}
            onChange={setLocalCustomer}
            onSelect={(c: any) => setLocalCustomer(c.id)}
            onCreate={(name) => {
              setCreatingInline(true);
              setNewEntity((prev) => ({ ...prev, id: name }));
              setLocalCustomer(name.toUpperCase());
            }}
          />
        </div>

        {creatingInline && (
          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/[0.07]">
            <div className="space-y-2">
              <input
                className="w-full p-3 bg-white dark:bg-slate-900 border-none rounded text-sm font-bold"
                value={newEntity.id}
                onChange={(e) => setNewEntity({ ...newEntity, id: e.target.value })}
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  className="col-span-1 p-2 rounded"
                  value={newEntity.telefonoCountry}
                  onChange={(e) =>
                    setNewEntity({ ...newEntity, telefonoCountry: e.target.value })
                  }
                >
                  <option value="+58">+58</option>
                  <option value="+1">+1</option>
                  <option value="+52">+52</option>
                </select>
                <input
                  className="col-span-2 p-2 rounded"
                  placeholder="Teléfono"
                  value={newEntity.telefono}
                  onChange={(e) => setNewEntity({ ...newEntity, telefono: e.target.value })}
                />
              </div>
              <input
                className="w-full p-3 rounded"
                placeholder="Cédula / RIF"
                value={newEntity.cedula}
                onChange={(e) => setNewEntity({ ...newEntity, cedula: e.target.value })}
              />
              <input
                className="w-full p-3 rounded"
                placeholder="Dirección fiscal"
                value={newEntity.direccion}
                onChange={(e) => setNewEntity({ ...newEntity, direccion: e.target.value })}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCreatingInline(false);
                    setNewEntity({
                      id: '',
                      cedula: '',
                      telefonoCountry: '+58',
                      telefono: '',
                      direccion: '',
                    });
                  }}
                  className="px-3 py-2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!newEntity.id) return;
                    const payload: Customer = {
                      id: newEntity.id.toUpperCase(),
                      cedula: newEntity.cedula || 'N/A',
                      telefono: (newEntity.telefonoCountry || '') + (newEntity.telefono || ''),
                      direccion: newEntity.direccion || '',
                    };
                    if (typeof onCreateCustomer === 'function') onCreateCustomer(payload);
                    setLocalCustomer(payload.id);
                    setCreatingInline(false);
                    setNewEntity({
                      id: '',
                      cedula: '',
                      telefonoCountry: '+58',
                      telefono: '',
                      direccion: '',
                    });
                  }}
                  className="px-3 py-2 bg-indigo-600 text-white rounded"
                >
                  Crear y Seleccionar
                </button>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
            Cuenta / Moneda
          </label>
          <select
            className="w-full p-4 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-slate-700 dark:text-slate-300 outline-none"
            value={accountType}
            onChange={() => null}
            disabled
          >
            <option value={accountType}>
              {accountType === AccountType.DIVISA
                ? 'Divisa ($ Efectivo)'
                : accountType === AccountType.BCV
                ? 'Bolívares (BCV)'
                : 'Bolívares (Paralelo)'}
            </option>
          </select>
        </div>

        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
            Monto
          </label>
          <NumericFormat
            value={amount}
            onValueChange={(values) => setAmount(values.value || '')}
            thousandSeparator="."
            decimalSeparator=","
            decimalScale={2}
            allowNegative={false}
            className="w-full p-4 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-black text-2xl text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="0,00"
            required
          />
          <div className="mt-3">
            <input
              type="text"
              className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-sm text-slate-700 dark:text-slate-300 outline-none"
              placeholder="Referencia (opcional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="mt-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Fecha de Operación
            </label>
            <SmartDatePicker
              value={opDate}
              onChange={handleOpDateChange}
              rateDates={rateDates}
              inputClassName="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-sm text-slate-700 dark:text-slate-300 outline-none"
            />
            {rateHint && (
              <div className="mt-2 text-[10px] font-semibold text-emerald-600">
                {rateHint}
              </div>
            )}
          </div>

          <div className="mt-2">
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  setQuickPaymentOption('USD');
                  setCurrency(PaymentCurrency.USD);
                }}
                className={`py-2 px-3 rounded-xl text-[11px] font-black uppercase ${
                  quickPaymentOption === 'USD'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300'
                }`}
              >
                USD / Efectivo
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuickPaymentOption('BS');
                  setCurrency(PaymentCurrency.BS);
                }}
                className={`py-2 px-3 rounded-xl text-[11px] font-black uppercase ${
                  quickPaymentOption === 'BS'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300'
                }`}
              >
                Bs / Transferencia
              </button>
            </div>
            <div className="mt-2">
              <span
                style={{ backgroundColor: 'var(--odoo-primary)' }}
                className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full text-slate-900 dark:text-white"
              >
                {quickPaymentOption === 'BS' ? 'Transferencia' : 'Efectivo'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
            Concepto
          </label>
          <input
            type="text"
            className="w-full p-4 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-sm text-slate-700 dark:text-slate-300 outline-none"
            placeholder="Opcional: Detalle de venta..."
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-8">
        <button
          type="submit"
          className={`w-full py-4 rounded-xl font-black text-slate-900 dark:text-white text-xs uppercase tracking-widest shadow-xl transition-transform active:scale-95 ${
            type === MovementType.FACTURA
              ? 'bg-indigo-600 hover:bg-indigo-700'
              : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          Confirmar Operación
        </button>
      </div>
    </form>
  );
};

// --- MAIN COMPONENT ---
const CustomerViewer: React.FC<CustomerViewerProps> = ({
  customers,
  movements,
  rateCalendar,
  selectedId: propSelectedId,
  onSelectCustomer,
  onOpenLedger,
  onUpdateMovement,
  onDeleteMovement,
  onAddMovement,
  onRegisterCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  rates,
  getSmartRate,
  config,
  openCreateCustomer,
  onCreateCustomerOpened,
}) => {
  const { success, error, warning, info } = useToast();
  const [viewMode, setViewMode] = useState<'LIST' | 'DETAIL' | 'AGING'>('LIST');
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showQuickOp, setShowQuickOp] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({});
  const [docType, setDocType] = useState<'V' | 'J' | 'E' | 'G'>('V');
  const [docNumber, setDocNumber] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [pendingCustomerName, setPendingCustomerName] = useState<string | null>(null);
  const [customerToast, setCustomerToast] = useState<string | null>(null);
  const customerToastTimerRef = useRef<number | null>(null);
  const [customerNote, setCustomerNote] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [detailFromDate, setDetailFromDate] = useState('');
  const [detailToDate, setDetailToDate] = useState('');
  const [detailAccountFilter, setDetailAccountFilter] = useState<'ALL' | AccountType>('ALL');
  const [detailRangeFilter, setDetailRangeFilter] = useState<
    'ALL' | 'SINCE_ZERO' | 'SINCE_LAST_DEBT' | 'SINCE_LAST_PAYMENT' | 'CUSTOM'
  >('ALL');
  const [editingDateMovement, setEditingDateMovement] = useState<Movement | null>(null);
  const [editingDateValue, setEditingDateValue] = useState('');
  const detailTableRef = useRef<HTMLDivElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const shareMenuCardRef = useRef<HTMLDivElement | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [shareMenuClientId, setShareMenuClientId] = useState<string | null>(null);
  const [shareMenuAccount, setShareMenuAccount] = useState<ReportAccount>('GLOBAL');
  const [shareMenuDetailAccount, setShareMenuDetailAccount] = useState<ReportAccount>('GLOBAL');
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppContext, setWhatsAppContext] = useState<TemplateContext>({});
  const messageTemplates =
    config.messageTemplates && config.messageTemplates.length > 0
      ? config.messageTemplates
      : DEFAULT_CONFIG.messageTemplates || [];
  const rateDates = useMemo(() => new Set(Object.keys(rateCalendar || {})), [rateCalendar]);
  const semaforoCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [agingSearch, setAgingSearch] = useState('');
  const [agingSort, setAgingSort] = useState<'amount-desc' | 'amount-asc' | 'age-desc' | 'age-asc'>(
    'amount-desc'
  );
  const [showAgingModal, setShowAgingModal] = useState(false);
  const [agingModalItem, setAgingModalItem] = useState<AgingItem | null>(null);

  const montoRef = useRef<HTMLInputElement>(null);
  const conceptoRef = useRef<HTMLInputElement>(null);
  const [successFlash, setSuccessFlash] = useState(false);

  const [quickForm, setQuickForm] = useState({
    customerName: '',
    amount: '',
    concept: '',
    type: MovementType.FACTURA,
    accountType: AccountType.BCV,
    rate: String(rates?.bcv ?? ''),
    reference: '',
    useRate: true,
    date: new Date().toISOString().split('T')[0],
  });
  const [rateHint, setRateHint] = useState<string | null>(null);

  const handleQuickDateSelect = (value: string) => {
    setQuickForm((prev) => ({ ...prev, date: value }));
    if (quickForm.accountType === AccountType.DIVISA) {
      setRateHint(null);
      return;
    }
    const entry = rateCalendar?.[value];
    if (entry) {
      const rateValue =
        quickForm.accountType === AccountType.BCV ? entry.bcv : entry.grupo;
      setQuickForm((prev) => ({ ...prev, rate: String(rateValue) }));
      setRateHint(`Tasa histórica cargada: ${rateValue} Bs`);
    } else {
      setRateHint(null);
    }
  };

  const handleAccountTypeChange = (at: AccountType) => {
    const newRate =
      at === AccountType.BCV ? String(rates?.bcv ?? '') :
      at === AccountType.GRUPO ? String(rates?.grupo ?? '') : '';
    setQuickForm(prev => ({
      ...prev,
      accountType: at,
      useRate: at !== AccountType.DIVISA,
      rate: newRate,
    }));
    setRateHint(null);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      setQuickForm(prev => ({
        ...prev,
        customerName: '',
        amount: '',
        concept: '',
        reference: '',
        date: new Date().toISOString().split('T')[0],
        accountType: AccountType.BCV,
        rate: String(rates?.bcv ?? ''),
        useRate: true,
      }));
      setRateHint(null);
      return;
    }
    if (!e.altKey) return;
    switch (e.key.toLowerCase()) {
      case 'b': e.preventDefault(); handleAccountTypeChange(AccountType.BCV); break;
      case 'g': e.preventDefault(); handleAccountTypeChange(AccountType.GRUPO); break;
      case 'd': e.preventDefault(); handleAccountTypeChange(AccountType.DIVISA); break;
      case 'f': e.preventDefault(); setQuickForm(p => ({ ...p, type: MovementType.FACTURA })); break;
      case 'a': e.preventDefault(); setQuickForm(p => ({ ...p, type: MovementType.ABONO })); break;
    }
  };

  useEffect(() => {
    if (propSelectedId) {
      setInternalSelectedId(propSelectedId);
      setViewMode('DETAIL');
    }
  }, [propSelectedId]);

  useEffect(() => {
    if (!openCreateCustomer) return;
    setShowAddModal(true);
    if (onCreateCustomerOpened) onCreateCustomerOpened();
  }, [openCreateCustomer, onCreateCustomerOpened]);

  useEffect(() => {
    if (!customerToast) return;
    if (customerToastTimerRef.current) {
      window.clearTimeout(customerToastTimerRef.current);
    }
    customerToastTimerRef.current = window.setTimeout(() => {
      setCustomerToast(null);
      customerToastTimerRef.current = null;
    }, 2400);
  }, [customerToast]);

  const openCreateCustomerModal = (prefillName?: string) => {
    setEditCustomer(null);
    setNewCustomer({
      id: prefillName ? prefillName.toUpperCase() : '',
      cedula: '',
      telefono: '',
      direccion: '',
      email: '',
    });
    setDocType('V');
    setDocNumber('');
    setPhoneDigits('');
    setPendingCustomerName(prefillName ? prefillName.toUpperCase() : null);
    setShowAddModal(true);
  };

  const toTitleCasePreserve = (value: string) => {
    if (!value) return '';
    let result = '';
    let newWord = true;
    for (const ch of value) {
      if (/[\s\-./]/.test(ch)) {
        result += ch;
        newWord = true;
        continue;
      }
      if (newWord) {
        result += ch.toLocaleUpperCase('es-VE');
        newWord = false;
      } else {
        result += ch.toLocaleLowerCase('es-VE');
      }
    }
    return result;
  };

  const formatPhoneDigits = (digits: string) => {
    const cleaned = digits.replace(/\D/g, '').slice(0, 10);
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  };

  const parseDoc = (value?: string) => {
    if (!value) return { type: 'V' as const, number: '' };
    const match = String(value).trim().match(/^([VJEGvjeg])\s*-?\s*(\d+)/);
    if (!match) return { type: 'V' as const, number: value.replace(/\D/g, '') };
    return { type: match[1].toUpperCase() as 'V' | 'J' | 'E' | 'G', number: match[2] };
  };

  const parsePhone = (value?: string) => {
    if (!value) return '';
    return String(value).replace(/\D/g, '').replace(/^58/, '').slice(0, 10);
  };

  const selectedCustomer = customers.find((c) => c.id === internalSelectedId);

  useEffect(() => {
    if (!showAddModal && !editCustomer) return;
    if (editCustomer) {
      const parsed = parseDoc(editCustomer.cedula);
      setDocType(parsed.type);
      setDocNumber(parsed.number);
      setPhoneDigits(parsePhone(editCustomer.telefono));
    } else {
      const parsed = parseDoc(newCustomer.cedula);
      setDocType(parsed.type);
      setDocNumber(parsed.number);
      setPhoneDigits(parsePhone(newCustomer.telefono));
    }
  }, [showAddModal, editCustomer, newCustomer.cedula, newCustomer.telefono]);

  const openCustomerDetail = (customerId: string) => {
    if (onSelectCustomer) {
      onSelectCustomer(customerId);
      return;
    }
    setInternalSelectedId(customerId);
    setViewMode('DETAIL');
  };

  const openCustomerLedger = (customerId: string) => {
    if (onOpenLedger) {
      onOpenLedger(customerId);
      return;
    }
    openCustomerDetail(customerId);
  };

  const openWhatsAppPreview = (context: TemplateContext) => {
    setWhatsAppContext(context);
    setShowWhatsAppModal(true);
  };

  const handleSendWhatsApp = (message: string) => {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    setShowWhatsAppModal(false);
  };

  const computeBalancesForCustomer = (customerId: string) => {
    const customerMovs = movements.filter((m) => m.entityId === customerId);
    const sumBy = (filterAccount: AccountType, mvType: MovementType) =>
      customerMovs
        .filter((m: any) => m.accountType === filterAccount && m.movementType === mvType)
        .reduce((s: number, m: any) => s + getMovementUsdAmount(m, rates), 0);

    const bcvDebt = sumBy(AccountType.BCV, MovementType.FACTURA);
    const bcvPaid = sumBy(AccountType.BCV, MovementType.ABONO);
    const grupoDebt = sumBy(AccountType.GRUPO, MovementType.FACTURA);
    const grupoPaid = sumBy(AccountType.GRUPO, MovementType.ABONO);
    const divDebt = sumBy(AccountType.DIVISA, MovementType.FACTURA);
    const divPaid = sumBy(AccountType.DIVISA, MovementType.ABONO);

    return {
      bcv: bcvPaid - bcvDebt,
      grupo: grupoPaid - grupoDebt,
      div: divPaid - divDebt,
    };
  };

  const getLastMovementInfo = (customerId: string) => {
    const customerMovs = movements
      .filter((m) => m.entityId === customerId)
      .map((m) => m.createdAt || m.date)
      .filter(Boolean)
      .map((value) => new Date(value as string))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());

    if (customerMovs.length === 0) {
      return { label: 'Sin movimientos', days: null };
    }
    const latest = customerMovs[0];
    const diffMs = Date.now() - latest.getTime();
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    return { label: `Ultimo movimiento: hace ${diffDays} dias`, days: diffDays };
  };

  useEffect(() => {
    if (!selectedCustomer?.id) return;
    const key = `customer_note_${selectedCustomer.id}`;
    setCustomerNote(localStorage.getItem(key) || '');
  }, [selectedCustomer?.id]);

  useEffect(() => {
    if (!selectedCustomer?.id) return;
    const key = `customer_note_${selectedCustomer.id}`;
    localStorage.setItem(key, customerNote);
  }, [customerNote, selectedCustomer?.id]);

  const getBalanceForAccount = (customerId: string, account: ReportAccount) => {
    const entry = directoryData.find((c) => c.id === customerId);
    if (!entry) return 0;
    if (account === 'BCV') return entry.balances.bcv;
    if (account === 'GRUPO') return entry.balances.grupo;
    if (account === 'DIVISA') return entry.balances.div;
    return entry.balances.totalUSD;
  };

  const buildWhatsAppContext = (customerId: string, account: ReportAccount, lastMov?: string) => {
    return {
      nombre_cliente: customerId,
      monto_deuda: formatCurrency(Math.abs(getBalanceForAccount(customerId, account)), '$'),
      fecha_vencimiento: lastMov || '',
      nombre_empresa: config.companyName || '',
    };
  };

  useEffect(() => {
    let active = true;
    const resolveRate = async () => {
      if (quickForm.accountType === AccountType.DIVISA) {
        setQuickForm((prev) => ({ ...prev, rate: '1' }));
        return;
      }
      const exact = rateCalendar?.[quickForm.date];
      if (exact) {
        const value =
          quickForm.accountType === AccountType.BCV ? exact.bcv : exact.grupo;
        setQuickForm((prev) => ({ ...prev, rate: String(value || 1) }));
        return;
      }
      if (!getSmartRate) {
        const fallback =
          quickForm.accountType === AccountType.BCV ? rates.bcv : rates.grupo;
        setQuickForm((prev) => ({ ...prev, rate: String(fallback || 1) }));
        return;
      }
      const rate = await getSmartRate(quickForm.date, quickForm.accountType);
      if (!active) return;
      setQuickForm((prev) => ({ ...prev, rate: String(rate || 1) }));
    };
    resolveRate();
    return () => {
      active = false;
    };
  }, [quickForm.accountType, quickForm.date, getSmartRate, rates.bcv, rates.grupo, rateCalendar]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const inDetail = shareMenuRef.current && shareMenuRef.current.contains(target);
      const inCard = shareMenuCardRef.current && shareMenuCardRef.current.contains(target);
      if (inDetail || inCard) return;
      if (showShareMenu) setShowShareMenu(false);
      if (shareMenuClientId) setShareMenuClientId(null);
    };
    if (showShareMenu || shareMenuClientId) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showShareMenu, shareMenuClientId]);

  const directoryData = useMemo(() => {
    return customers
      .map((c) => {
        const balances = computeBalancesForCustomer(c.id);
        const totalNetUSD = balances.bcv + balances.grupo + balances.div;

        return {
          ...c,
          lastMov: movements.filter((m) => m.entityId === c.id)[0]?.date || '-',
          balances: {
            bcv: balances.bcv,
            grupo: balances.grupo,
            div: balances.div,
            totalUSD: totalNetUSD,
          },
        };
      })
      .filter(
        (c) =>
          c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.cedula || '').toString().includes(searchTerm)
      );
  }, [customers, movements, searchTerm, rates]);

  const clientInsights = useMemo(() => {
    return customers.map((c) => {
      const customerMovs = movements.filter(
        (m) => m.entityId === c.id && !m.isSupplierMovement
      );
      return {
        id: c.id,
        cedula: c.cedula,
        ...buildClientStatus(customerMovs, rates, new Date(), {
          customerCreatedAt: c.createdAt || null,
        }),
      };
    });
  }, [customers, movements, rates]);

  const clientStatusMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildClientStatus>>();
    clientInsights.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [clientInsights]);

  const agingReport = useMemo(() => {
    const report: AgingItem[] = [];

    clientInsights
      .filter((c) => c.balance > 0)
      .forEach((c) => {
        const last = c.lastMovement;
        const fallbackRate =
          last?.accountType === AccountType.BCV
            ? rates.bcv
            : last?.accountType === AccountType.GRUPO
            ? rates.grupo
            : 1;
        const rateUsed = Number(last?.rateUsed ?? fallbackRate) || 1;
        const ageValue = c.daysSinceLast ?? 0;
        const category = ageValue > 30 ? 'red' : ageValue >= 16 ? 'yellow' : 'green';

        report.push({
          customer: c.id,
          cedula: c.cedula,
          amount: c.balance,
          age: ageValue,
          date: c.lastMovementDate || '-',
          reference: last?.reference || last?.concept || null,
          accountType: last?.accountType || AccountType.DIVISA,
          currency: (last?.currency as PaymentCurrency) || PaymentCurrency.USD,
          rate: rateUsed,
          category,
          tags: c.tags,
        });
      });

    return report.sort((a, b) => b.age - a.age);
  }, [clientInsights, rates]);

  const filteredAging = useMemo(() => {
    const term = agingSearch.trim().toLowerCase();
    const filtered = agingReport.filter((item) =>
      [item.customer, item.cedula || ''].some((value) =>
        value.toLowerCase().includes(term)
      )
    );

    const sorted = [...filtered].sort((a, b) => {
      switch (agingSort) {
        case 'amount-asc':
          return a.amount - b.amount;
        case 'amount-desc':
          return b.amount - a.amount;
        case 'age-asc':
          return a.age - b.age;
        case 'age-desc':
        default:
          return b.age - a.age;
      }
    });

    return sorted;
  }, [agingReport, agingSearch, agingSort]);

  const agingModalInvoices = useMemo(() => {
    if (!agingModalItem) return [] as AgingItem[];
    return agingReport
      .filter((item) => item.customer === agingModalItem.customer)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
  }, [agingModalItem, agingReport]);

  const filteredMovements = useMemo(
    () =>
      movements
        .filter((m) => m.entityId === internalSelectedId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [movements, internalSelectedId]
  );

  const detailFilteredMovements = useMemo(() => {
    return filterMovementsByRange(
      filteredMovements,
      detailAccountFilter,
      detailRangeFilter,
      detailFromDate,
      detailToDate
    );
  }, [
    filteredMovements,
    detailAccountFilter,
    detailRangeFilter,
    detailFromDate,
    detailToDate,
  ]);

  const detailMovementsChrono = useMemo(() => {
    const sorted = [...detailFilteredMovements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let running = 0;
    return sorted.map((m) => {
      const amountUsd = getMovementUsdAmount(m, rates);
      const debt = m.movementType === MovementType.FACTURA ? amountUsd : 0;
      const paid = m.movementType === MovementType.ABONO ? amountUsd : 0;
      running += debt - paid;
      return { ...m, debt, paid, balance: running };
    });
  }, [detailFilteredMovements, rates]);

  const detailMovementsDisplay = useMemo(() => {
    return [...detailMovementsChrono].reverse();
  }, [detailMovementsChrono]);

  const toDateTimeLocal = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
      parsed.getDate()
    )}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  };

  const handleEditDate = (movement: Movement) => {
    const dateValue = movement.createdAt || `${movement.date}T00:00:00`;
    setEditingDateMovement(movement);
    setEditingDateValue(toDateTimeLocal(dateValue));
  };

  const handleSaveDate = async () => {
    if (!editingDateMovement || !editingDateValue) return;
    const isoDate = editingDateValue.includes('T')
      ? editingDateValue
      : `${editingDateValue}T00:00:00`;
    onUpdateMovement(editingDateMovement.id, {
      date: isoDate.split('T')[0],
      createdAt: isoDate,
    });
    setEditingDateMovement(null);
    setEditingDateValue('');
  };

  const hexToRgb = (hex: string) => {
    const clean = hex.replace('#', '').trim();
    if (clean.length !== 6) return null;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return [r, g, b] as [number, number, number];
  };

  const addPdfHeader = (doc: any, title: string, rightInfo: string[] = []) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const brand = hexToRgb(config.theme?.primaryColor || '#0f172a') || [15, 23, 42];
    doc.setFillColor(brand[0], brand[1], brand[2]);
    doc.rect(0, 0, pageWidth, 32, 'F');

    const logo = config.companyLogo || '';
    if (logo) {
      const format = logo.includes('image/png') ? 'PNG' : 'JPEG';
      doc.setFillColor(255, 255, 255);
      doc.rect(12, 6, 16, 16, 'F');
      doc.addImage(logo, format, 12, 6, 16, 16);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text(config.companyName || 'Empresa', 32, 12);
    doc.setFontSize(10);
    doc.text(title, 32, 20);
    doc.setFontSize(8);
    doc.text(`RIF: ${config.companyRif || 'N/A'}`, 32, 26);

    if (rightInfo.length) {
      doc.setFontSize(9);
      rightInfo.slice(0, 4).forEach((line, idx) => {
        doc.text(line, pageWidth - 12, 10 + idx * 4, { align: 'right' });
      });
    }

    doc.setTextColor(0, 0, 0);
    return 38;
  };

  const formatPhone = (value?: string) => (value || '').replace(/\s+/g, ' ').trim();
  const getCustomerField = (value?: string) => (value && value.trim() ? value.trim() : 'N/A');

  const addCustomerBlock = (doc: any, startY: number, customer?: Customer | null) => {
    if (!customer) return startY;
    const pageWidth = doc.internal.pageSize.getWidth();
    const boxX = 14;
    const boxY = startY + 2;
    const boxW = pageWidth - 28;
    const boxH = 22;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.text(`Cliente: ${getCustomerField(customer.id)}`, boxX + 4, boxY + 7);
    doc.text(`CI/RIF: ${getCustomerField(customer.cedula)}`, boxX + 4, boxY + 12);
    doc.text(`Telefono: ${getCustomerField(formatPhone(customer.telefono))}`, boxX + 4, boxY + 17);
    doc.text(`Direccion: ${getCustomerField(customer.direccion)}`, boxX + 70, boxY + 12);
    return boxY + boxH + 6;
  };

  type ReportAccount = 'BCV' | 'GRUPO' | 'DIVISA' | 'GLOBAL';
  type RangeFilter = 'ALL' | 'SINCE_ZERO' | 'SINCE_LAST_DEBT' | 'SINCE_LAST_PAYMENT' | 'CUSTOM';

  const formatDisplayDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const resolveReportAccount = (value: 'ALL' | AccountType): ReportAccount =>
    value === 'ALL' ? 'GLOBAL' : (value as ReportAccount);

  const resolveAccountLabel = (account: ReportAccount) =>
    account === 'GLOBAL' ? 'CUENTA GLOBAL' : `CUENTA ${account}`;

  const resolveAccountSymbol = (account: ReportAccount) => (account === 'BCV' ? 'Bs' : '$');

  const filterMovementsByAccount = (items: Movement[], account: ReportAccount) => {
    if (account === 'GLOBAL') return items;
    return items.filter((m) => m.accountType === account);
  };

  const getDisplayAmount = (movement: Movement, account: ReportAccount) => {
    if (account === 'BCV') {
      return typeof movement.originalAmount === 'number'
        ? movement.originalAmount
        : typeof movement.amount === 'number'
        ? movement.amount
        : 0;
    }
    return getMovementUsdAmount(movement, rates);
  };

  const buildStatementData = (items: Movement[], account: ReportAccount) => {
    const filtered = filterMovementsByAccount(items, account);
    const sorted = [...filtered].sort((a, b) => {
      const aDate = new Date(a.createdAt || a.date).getTime();
      const bDate = new Date(b.createdAt || b.date).getTime();
      return aDate - bDate;
    });
    let running = 0;
    let totalDebt = 0;
    let totalPaid = 0;
    const rows = sorted.map((m) => {
      const amount = getDisplayAmount(m, account);
      const debt = m.movementType === MovementType.FACTURA ? amount : 0;
      const paid = m.movementType === MovementType.ABONO ? amount : 0;
      totalDebt += debt;
      totalPaid += paid;
      running += debt - paid;
      return { ...m, debt, paid, running };
    });
    return {
      rows,
      totalDebt,
      totalPaid,
      balance: totalDebt - totalPaid,
    };
  };

  const addSummaryBlock = (
    doc: any,
    startY: number,
    totals: { totalDebt: number; totalPaid: number; balance: number },
    symbol: string
  ) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const boxX = 14;
    const boxY = startY + 2;
    const boxW = pageWidth - 28;
    const boxH = 16;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.text('Total Cargos (Deuda)', boxX + 4, boxY + 6);
    doc.text('Total Abonos (Pagos)', boxX + 70, boxY + 6);
    doc.text('Saldo Final', boxX + 140, boxY + 6);
    doc.setFontSize(10);
    doc.text(formatCurrency(totals.totalDebt, symbol), boxX + 4, boxY + 12);
    doc.text(formatCurrency(totals.totalPaid, symbol), boxX + 70, boxY + 12);
    doc.text(formatCurrency(totals.balance, symbol), boxX + 140, boxY + 12);
    return boxY + boxH + 6;
  };

  const resolveCustomerForReport = (customerId?: string) => {
    if (customerId) return customers.find((c) => c.id === customerId) || null;
    return selectedCustomer || null;
  };

  function resolveRangeLabel(range: RangeFilter) {
    switch (range) {
      case 'SINCE_ZERO':
        return 'Desde el ultimo saldo cero';
      case 'SINCE_LAST_DEBT':
        return 'Desde la ultima factura';
      case 'SINCE_LAST_PAYMENT':
        return 'Desde el ultimo abono';
      case 'CUSTOM':
        return `${detailFromDate || 'Inicio'} - ${detailToDate || 'Hoy'}`;
      case 'ALL':
      default:
        return 'Todo el Historial';
    }
  }

  function filterMovementsByRange(
    items: Movement[],
    account: 'ALL' | AccountType,
    range: RangeFilter,
    fromDate: string,
    toDate: string
  ) {
    const accountScoped =
      account === 'ALL' ? items : items.filter((m) => m.accountType === account);
    const sorted = [...accountScoped].sort((a, b) => {
      const aDate = new Date(a.createdAt || a.date).getTime();
      const bDate = new Date(b.createdAt || b.date).getTime();
      return aDate - bDate;
    });

    if (range === 'CUSTOM') {
      return sorted.filter((m) => {
        if (fromDate && m.date < fromDate) return false;
        if (toDate && m.date > toDate) return false;
        return true;
      });
    }

    if (range === 'SINCE_LAST_DEBT' || range === 'SINCE_LAST_PAYMENT') {
      const targetType =
        range === 'SINCE_LAST_DEBT' ? MovementType.FACTURA : MovementType.ABONO;
      const idx =
        [...sorted].reverse().findIndex((m) => m.movementType === targetType) ?? -1;
      if (idx === -1) return sorted;
      const startIndex = sorted.length - 1 - idx;
      return sorted.slice(startIndex);
    }

    if (range === 'SINCE_ZERO') {
      let running = 0;
      let lastZeroIndex = -1;
      sorted.forEach((m, index) => {
        const amountUsd = getMovementUsdAmount(m, rates);
        const debt = m.movementType === MovementType.FACTURA ? amountUsd : 0;
        const paid = m.movementType === MovementType.ABONO ? amountUsd : 0;
        running += debt - paid;
        if (running <= 0) lastZeroIndex = index;
      });
      if (lastZeroIndex === -1) return sorted;
      return sorted.slice(lastZeroIndex);
    }

    return sorted;
  }

  const generateStatementPdf = async (params: {
    mode: 'summary' | 'detailed';
    account: ReportAccount;
    customerId?: string;
    sourceMovements?: Movement[];
    rangeFilter?: RangeFilter;
    rangeLabel?: string;
    rangeFrom?: string;
    rangeTo?: string;
  }) => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const customer = resolveCustomerForReport(params.customerId);
    if (!customer) return;

    const baseMovements =
      params.sourceMovements ||
      movements.filter((m) => m.entityId === customer.id && !m.isSupplierMovement);
    const scoped = params.rangeFilter
      ? filterMovementsByRange(
          baseMovements,
          params.account === 'GLOBAL' ? 'ALL' : (params.account as AccountType),
          params.rangeFilter,
          params.rangeFrom || '',
          params.rangeTo || ''
        )
      : baseMovements;
    const { rows, totalDebt, totalPaid, balance } = buildStatementData(scoped, params.account);
    const symbol = resolveAccountSymbol(params.account);

    const doc = new jsPDF();
    const titleSuffix = params.rangeLabel && params.rangeFilter !== 'ALL' ? ` (${params.rangeLabel})` : '';
    const title = `ESTADO DE CUENTA${titleSuffix} - ${resolveAccountLabel(params.account)}`;
    const rightInfo = [
      `Fecha de Emision: ${formatDisplayDate(new Date().toISOString())}`,
      `Rango: ${params.rangeLabel || 'Completo'}`,
    ];
    let cursorY = addPdfHeader(doc, title, rightInfo);
    cursorY = addCustomerBlock(doc, cursorY, customer);
    cursorY = addSummaryBlock(doc, cursorY, { totalDebt, totalPaid, balance }, symbol);

    if (params.mode === 'detailed') {
      const tableRows = rows.map((m: any) => {
        const refText =
          m.movementType === MovementType.ABONO
            ? `Ref: ${m.reference || 'N/A'} (Tasa: ${Number(m.rateUsed || 1).toFixed(2)})`
            : '-';
        return [
          formatDisplayDate(m.date),
          m.concept,
          refText,
          m.movementType === MovementType.FACTURA ? formatCurrency(m.debt, symbol) : '-',
          m.movementType === MovementType.ABONO ? formatCurrency(m.paid, symbol) : '-',
          formatCurrency(m.running, symbol),
        ];
      });

      autoTable(doc, {
        startY: cursorY + 2,
        head: [[
          'Fecha',
          'Concepto',
          'Ref / Tasa',
          'Deuda (+)',
          'Abono (-)',
          'Saldo',
        ]],
        body: tableRows.length ? tableRows : [['-', '-', '-', '-', '-', '-']],
        theme: 'striped',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 23, 42] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 60 },
          2: { cellWidth: 50 },
          3: { cellWidth: 24, halign: 'right' },
          4: { cellWidth: 24, halign: 'right' },
          5: { cellWidth: 24, halign: 'right' },
        },
      });
    }

    const suffix = params.mode === 'detailed' ? 'detallado' : 'resumen';
    doc.save(`estado-cuenta-${suffix}-${customer.id}.pdf`);
  };

  const exportSummaryImage = async (params: {
    account: ReportAccount;
    customerId?: string;
    sourceMovements?: Movement[];
    rangeFilter?: RangeFilter;
    rangeFrom?: string;
    rangeTo?: string;
  }) => {
    const { default: html2canvas } = await import('html2canvas');
    const customer = resolveCustomerForReport(params.customerId);
    if (!customer) return;
    const baseMovements =
      params.sourceMovements ||
      movements.filter((m) => m.entityId === customer.id && !m.isSupplierMovement);
    const scoped = params.rangeFilter
      ? filterMovementsByRange(
          baseMovements,
          params.account === 'GLOBAL' ? 'ALL' : (params.account as AccountType),
          params.rangeFilter,
          params.rangeFrom || '',
          params.rangeTo || ''
        )
      : baseMovements;
    const { totalDebt, totalPaid, balance } = buildStatementData(scoped, params.account);
    const symbol = resolveAccountSymbol(params.account);

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-10000px';
    wrapper.style.top = '0';
    wrapper.style.background = '#ffffff';
    wrapper.style.padding = '20px';
    wrapper.style.width = '520px';

    wrapper.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        ${
          config.companyLogo
            ? `<img src="${config.companyLogo}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" />`
            : ''
        }
        <div>
          <div style="font-weight:800;font-size:16px;color:#0f172a;">${
            config.companyName || 'Empresa'
          }</div>
          <div style="font-size:12px;color:#64748b;">Estado de Cuenta - ${resolveAccountLabel(
            params.account
          )}</div>
        </div>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
        <div style="font-weight:700;font-size:12px;color:#475569;margin-bottom:6px;">Cliente</div>
        <div style="font-weight:800;font-size:16px;color:#0f172a;">${customer.id}</div>
        <div style="font-size:11px;color:#64748b;">CI/RIF: ${customer.cedula || 'N/A'}</div>
        <div style="display:flex;gap:12px;margin-top:12px;">
          <div style="flex:1;background:#f8fafc;border-radius:10px;padding:8px;">
            <div style="font-size:10px;color:#64748b;">Total Cargos</div>
            <div style="font-weight:800;color:#0f172a;">${formatCurrency(totalDebt, symbol)}</div>
          </div>
          <div style="flex:1;background:#f8fafc;border-radius:10px;padding:8px;">
            <div style="font-size:10px;color:#64748b;">Total Abonos</div>
            <div style="font-weight:800;color:#0f172a;">${formatCurrency(totalPaid, symbol)}</div>
          </div>
          <div style="flex:1;background:#f1f5f9;border-radius:10px;padding:8px;">
            <div style="font-size:10px;color:#64748b;">Saldo Final</div>
            <div style="font-weight:800;color:#0f172a;">${formatCurrency(balance, symbol)}</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper, { backgroundColor: '#ffffff', scale: 2 });
    document.body.removeChild(wrapper);

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `estado-cuenta-resumen-${customer.id}.png`;
    link.click();
  };

  const exportDetailedImageFromData = async (params: {
    account: ReportAccount;
    customerId?: string;
    sourceMovements?: Movement[];
    rangeFilter?: RangeFilter;
    rangeFrom?: string;
    rangeTo?: string;
  }) => {
    const { default: html2canvas } = await import('html2canvas');
    const customer = resolveCustomerForReport(params.customerId);
    if (!customer) return;
    const baseMovements =
      params.sourceMovements ||
      movements.filter((m) => m.entityId === customer.id && !m.isSupplierMovement);
    const scoped = params.rangeFilter
      ? filterMovementsByRange(
          baseMovements,
          params.account === 'GLOBAL' ? 'ALL' : (params.account as AccountType),
          params.rangeFilter,
          params.rangeFrom || '',
          params.rangeTo || ''
        )
      : baseMovements;
    const { rows, totalDebt, totalPaid, balance } = buildStatementData(scoped, params.account);
    const symbol = resolveAccountSymbol(params.account);

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-10000px';
    wrapper.style.top = '0';
    wrapper.style.background = '#ffffff';
    wrapper.style.padding = '20px';
    wrapper.style.width = '800px';

    const header = `
      <div style="font-weight:800;font-size:16px;color:#0f172a;margin-bottom:6px;">
        ${config.companyName || 'Empresa'} - ${resolveAccountLabel(params.account)}
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:12px;">
        Cliente: ${customer.id} | CI/RIF: ${customer.cedula || 'N/A'}
      </div>
      <div style="display:flex;gap:12px;margin-bottom:12px;">
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:8px;">
          <div style="font-size:10px;color:#64748b;">Total Cargos</div>
          <div style="font-weight:800;">${formatCurrency(totalDebt, symbol)}</div>
        </div>
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:8px;">
          <div style="font-size:10px;color:#64748b;">Total Abonos</div>
          <div style="font-weight:800;">${formatCurrency(totalPaid, symbol)}</div>
        </div>
        <div style="flex:1;background:#f1f5f9;border-radius:8px;padding:8px;">
          <div style="font-size:10px;color:#64748b;">Saldo Final</div>
          <div style="font-weight:800;">${formatCurrency(balance, symbol)}</div>
        </div>
      </div>
    `;

    const tableRows = rows
      .map((m: any) => {
        const refText =
          m.movementType === MovementType.ABONO
            ? `Ref: ${m.reference || 'N/A'} (Tasa: ${Number(m.rateUsed || 1).toFixed(2)})`
            : '-';
        return `
          <tr>
            <td>${formatDisplayDate(m.date)}</td>
            <td>${m.concept}</td>
            <td>${refText}</td>
            <td style="text-align:right;">${
              m.movementType === MovementType.FACTURA ? formatCurrency(m.debt, symbol) : '-'
            }</td>
            <td style="text-align:right;">${
              m.movementType === MovementType.ABONO ? formatCurrency(m.paid, symbol) : '-'
            }</td>
            <td style="text-align:right;">${formatCurrency(m.running, symbol)}</td>
          </tr>
        `;
      })
      .join('');

    wrapper.innerHTML = `${header}
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th style="text-align:left;padding:6px;">Fecha</th>
            <th style="text-align:left;padding:6px;">Concepto</th>
            <th style="text-align:left;padding:6px;">Ref / Tasa</th>
            <th style="text-align:right;padding:6px;">Deuda (+)</th>
            <th style="text-align:right;padding:6px;">Abono (-)</th>
            <th style="text-align:right;padding:6px;">Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || ''}
        </tbody>
      </table>
    `;

    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper, { backgroundColor: '#ffffff', scale: 2 });
    document.body.removeChild(wrapper);

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `estado-cuenta-detallado-${customer.id}.png`;
    link.click();
  };

  const handleExportImageDetailed = async () => {
    if (!detailTableRef.current || !selectedCustomer) return;
    const { default: html2canvas } = await import('html2canvas');
    const source = detailTableRef.current;
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-10000px';
    wrapper.style.top = '0';
    wrapper.style.background = '#ffffff';
    wrapper.style.padding = '24px';
    wrapper.style.width = `${source.scrollWidth}px`;

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '12px';
    header.style.marginBottom = '12px';

    if (config.companyLogo) {
      const img = document.createElement('img');
      img.src = config.companyLogo;
      img.style.width = '56px';
      img.style.height = '56px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '8px';
      header.appendChild(img);
    }

    const info = document.createElement('div');
    info.innerHTML = `
      <div style="font-weight: 800; font-size: 16px; color: #111827;">${
        config.companyName || 'Empresa'
      }</div>
      <div style="font-size: 12px; color: #6b7280;">RIF: ${
        config.companyRif || 'N/A'
      }</div>
      <div style="font-size: 12px; color: #6b7280;">Estado de Cuenta: ${
        selectedCustomer.id
      }</div>
      <div style="font-size: 12px; color: #6b7280;">Rango: ${resolveRangeLabel(
        detailRangeFilter
      )}</div>
    `;
    header.appendChild(info);
    wrapper.appendChild(header);

    const clone = source.cloneNode(true) as HTMLElement;
    clone.style.maxHeight = 'none';
    clone.style.height = `${source.scrollHeight}px`;
    clone.style.overflow = 'visible';
    wrapper.appendChild(clone);

    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: 2,
      width: wrapper.scrollWidth,
      height: wrapper.scrollHeight,
      windowWidth: wrapper.scrollWidth,
      windowHeight: wrapper.scrollHeight,
    });
    document.body.removeChild(wrapper);

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `estado-cuenta-detallado-${selectedCustomer.id}.png`;
    link.click();
  };

  const getCustomerMovements = (customerId: string) =>
    movements.filter((m) => m.entityId === customerId && !m.isSupplierMovement);

  const getDetailReportContext = () => ({
    account: resolveReportAccount(detailAccountFilter),
    sourceMovements: filteredMovements.filter((m) => !m.isSupplierMovement),
    rangeFilter: detailRangeFilter,
    rangeLabel: resolveRangeLabel(detailRangeFilter),
    rangeFrom: detailFromDate,
    rangeTo: detailToDate,
  });

  const exportCardImage = async (customerId: string, account: ReportAccount) => {
    if (account !== 'GLOBAL') {
      await exportSummaryImage({
        account,
        customerId,
        sourceMovements: getCustomerMovements(customerId),
      });
      return;
    }
    const node = semaforoCardRefs.current[customerId];
    if (!node) {
      await exportSummaryImage({
        account,
        customerId,
        sourceMovements: getCustomerMovements(customerId),
      });
      return;
    }
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(node, { backgroundColor: '#ffffff', scale: 2 });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `estado-cuenta-resumen-${customerId}.png`;
    link.click();
  };

  const handleCardPdfSummary = async (customerId: string, account: ReportAccount) => {
    await generateStatementPdf({
      mode: 'summary',
      account,
      customerId,
      sourceMovements: getCustomerMovements(customerId),
    });
    setCustomerToast('📄 Resumen exportado.');
  };

  const handleCardPdfDetailed = async (customerId: string, account: ReportAccount) => {
    await generateStatementPdf({
      mode: 'detailed',
      account,
      customerId,
      sourceMovements: getCustomerMovements(customerId),
    });
    setCustomerToast('📄 PDF detallado exportado.');
  };

  const handleCardImageSummary = async (customerId: string, account: ReportAccount) => {
    await exportCardImage(customerId, account);
    setCustomerToast('🖼️ Imagen exportada.');
  };

  const handleCardImageDetailed = async (customerId: string, account: ReportAccount) => {
    await exportDetailedImageFromData({
      account,
      customerId,
      sourceMovements: getCustomerMovements(customerId),
    });
    setCustomerToast('🖼️ Imagen detallada exportada.');
  };

  const sanitizeText = (value?: string) => String(value || '').replace(/[<>]/g, '').trim();

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (editCustomer) {
      const composedCedula = `${docType}-${docNumber}`;
      const composedPhone = `+58${phoneDigits}`;
      const safeDireccion = sanitizeText(editCustomer.direccion);
      const safeEmail = sanitizeText(editCustomer.email);
      if (!docNumber) { warning('Cédula/RIF requerido.'); return; }
      if (phoneDigits.length !== 10) {
        { warning('Teléfono inválido. Usa formato WhatsApp (ej: 4121234567).'); return; }
      }
      onUpdateCustomer(editCustomer.id, {
        ...editCustomer,
        cedula: composedCedula,
        telefono: composedPhone,
        direccion: safeDireccion,
        email: safeEmail,
      });
      setEditCustomer(null);
    } else {
      const safeName = sanitizeText(newCustomer.id);
      if (!safeName) { warning('Nombre requerido.'); return; }
      if (!docNumber) { warning('Cédula/RIF requerido.'); return; }
      if (phoneDigits.length !== 10) {
        { warning('Teléfono inválido. Usa formato WhatsApp (ej: 4121234567).'); return; }
      }
      const composedCedula = `${docType}-${docNumber}`;
      const composedPhone = `+58${phoneDigits}`;
      onRegisterCustomer({
        id: safeName.toUpperCase(),
        cedula: composedCedula,
        telefono: composedPhone,
        direccion: sanitizeText(newCustomer.direccion),
        email: sanitizeText(newCustomer.email),
        createdAt: new Date().toISOString(),
      });
      setShowAddModal(false);
      if (pendingCustomerName) {
        setQuickForm((prev) => ({ ...prev, customerName: safeName.toUpperCase() }));
        setPendingCustomerName(null);
      }
      setNewCustomer({});
      setCustomerToast('Cliente creado correctamente');
    }
  };

  const handleQuickOpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickForm.customerName || !quickForm.amount || !quickForm.concept) return;

    const numAmount = parseFloat(quickForm.amount);
    const shouldConvert = quickForm.useRate && quickForm.accountType !== AccountType.DIVISA;
    const usedRate = shouldConvert ? parseFloat(quickForm.rate) || 1 : 1;

    let currency = PaymentCurrency.USD;
    if (quickForm.accountType !== AccountType.DIVISA) currency = PaymentCurrency.BS;

    onAddMovement({
      customerName: quickForm.customerName,
      date: quickForm.date || new Date().toISOString().split('T')[0],
      concept: quickForm.concept,
      amount: numAmount,
      originalAmount: numAmount,
      type: quickForm.type,
      accountType: quickForm.accountType,
      currency: currency,
      rate: usedRate,
      reference: quickForm.reference || null,
    });

    // Inline feedback — no alert bloqueante
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), 2000);

    // Mantener cliente + cuenta + tipo para entrada rápida consecutiva
    setQuickForm(prev => ({
      ...prev,
      amount: '',
      concept: '',
      reference: '',
      date: new Date().toISOString().split('T')[0],
    }));
    setRateHint(null);

    // Re-enfocar monto para el siguiente registro
    setTimeout(() => montoRef.current?.focus(), 50);
  };

  const handleExportCSV = () => {
    const headers = [
      'NOMBRE/RAZON SOCIAL',
      'CEDULA/RIF',
      'TELEFONO',
      'SALDO BCV (Bs)',
      'SALDO GRUPO (Bs)',
      'SALDO DIVISA ($)',
      'ULTIMO MOVIMIENTO',
    ];
    const rows = directoryData.map((c) => {
      const bcv = (c as any).balances?.bcv || 0;
      const grupo = (c as any).balances?.grupo || 0;
      const divisa = (c as any).balances?.div || 0;
      const bcvUsd = rates.bcv ? bcv / rates.bcv : 0;
      const grupoUsd = rates.grupo ? grupo / rates.grupo : 0;
      return [
        c.id,
        c.cedula,
        c.telefono,
        bcvUsd.toFixed(2),
        grupoUsd.toFixed(2),
        divisa.toFixed(2),
        c.lastMov,
      ];
    });
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers, ...rows].map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'directorio_clientes.csv');
    document.body.appendChild(link);
    link.click();
  };

  const handleDelete = (id: string) => {
    if (confirm(`¿Eliminar al cliente ${id} y todo su historial?`)) {
      onDeleteCustomer(id);
      setViewMode('LIST');
    }
  };

  const agingGreen = filteredAging.filter((item) => item.category === 'green');
  const agingYellow = filteredAging.filter((item) => item.category === 'yellow');
  const agingRed = filteredAging.filter((item) => item.category === 'red');

  const getAgingTotals = (items: typeof agingGreen) => ({
    count: items.length,
    total: items.reduce((sum, item) => sum + item.amount, 0),
  });

  const getStatusStyles = (category: AgingItem['category']) => {
    if (category === 'red') {
      return {
        ring: 'ring-4 ring-rose-200',
        badge: 'bg-rose-100 text-rose-700',
        label: 'Vencido',
      };
    }
    if (category === 'yellow') {
      return {
        ring: 'ring-4 ring-amber-200',
        badge: 'bg-amber-100 text-amber-700',
        label: 'Pendiente',
      };
    }
    return {
      ring: 'ring-4 ring-emerald-200',
      badge: 'bg-emerald-100 text-emerald-700',
      label: 'Al día',
    };
  };

  const getCustomerAgingStatus = (customerId: string): AgingItem['category'] => {
    const item = clientStatusMap.get(customerId);
    if (!item) return 'green';
    if (item.status === 'RED') return 'red';
    if (item.status === 'YELLOW') return 'yellow';
    return 'green';
  };

  const handleQuickAbono = (item: (typeof agingGreen)[number]) => {
    const rateValue =
      item.accountType === AccountType.BCV
        ? rates.bcv
        : item.accountType === AccountType.GRUPO
        ? rates.grupo
        : 1;
    setQuickForm((prev) => ({
      ...prev,
      customerName: item.customer,
      amount: '',
      concept: 'Abono de cobranza',
      type: MovementType.ABONO,
      accountType: item.accountType,
      rate: String(item.rate || rateValue),
      reference: item.reference || '',
    }));
    setShowQuickOp(true);
  };

  const handleCallNote = (item: (typeof agingGreen)[number]) => {
    const note = prompt(`Registrar llamada para ${item.customer}. Nota:`);
    if (!note) return;
    success(`Nota registrada: ${note}`);
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');

  const getAgingBadges = (item: (typeof agingGreen)[number]) => {
    if (!item.tags || item.tags.length === 0) return [] as ClientTag[];
    return item.tags;
  };

  const totalsGreen = getAgingTotals(agingGreen);
  const totalsYellow = getAgingTotals(agingYellow);
  const totalsRed = getAgingTotals(agingRed);
  const quickBalances = quickForm.customerName
    ? computeBalancesForCustomer(quickForm.customerName)
    : null;
  const selectedAgingStatus = selectedCustomer
    ? getCustomerAgingStatus(selectedCustomer.id)
    : 'green';
  const selectedStatusStyles = getStatusStyles(selectedAgingStatus);

  return (
    <div className="app-section overflow-y-auto h-[calc(100vh-220px)]">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center app-panel p-6 gap-4">
        <div className="app-section-header">
          <h1 className="app-title uppercase">
            {viewMode === 'LIST'
              ? 'Directorio de Clientes'
              : viewMode === 'AGING'
              ? 'Semáforo de Morosidad'
              : `Expediente: ${internalSelectedId}`}
          </h1>
          <p className="app-subtitle">
            Módulo de Gestión de Cobranzas
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {viewMode === 'DETAIL' &&
            selectedCustomer &&
            (() => {
              const d = directoryData.find((c) => c.id === selectedCustomer.id);
              const bcv = d?.balances?.bcv || 0;
              const grupo = d?.balances?.grupo || 0;
              const div = d?.balances?.div || 0;
              const bcvUsd = bcv;
              const grupoUsd = grupo;
              return (
                <div className="hidden md:flex items-center gap-3 mr-2">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-white/[0.07] text-right flex flex-col justify-center items-end min-w-[140px]">
                    <div className="text-[10px] text-slate-400 font-bold">BCV</div>
                    <div
                      className={`font-mono font-black text-2xl truncate ${
                        bcvUsd > 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {formatCurrency(Math.abs(bcvUsd), '$')}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-white/[0.07] text-right flex flex-col justify-center items-end min-w-[140px]">
                    <div className="text-[10px] text-slate-400 font-bold">Grupo</div>
                    <div
                      className={`font-mono font-black text-2xl truncate ${
                        grupoUsd > 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {formatCurrency(Math.abs(grupoUsd), '$')}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-white/[0.07] text-right flex flex-col justify-center items-end min-w-[120px]">
                    <div className="text-[10px] text-slate-400 font-bold">Divisa</div>
                    <div
                      className={`font-mono font-black text-2xl truncate ${
                        div > 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {formatCurrency(Math.abs(div), '$')}
                    </div>
                  </div>
                </div>
              );
            })()}
          {viewMode === 'DETAIL' && (
            <button
              onClick={() => setViewMode('LIST')}
              className="px-4 py-2 app-btn app-btn-ghost"
            >
              <i className="fa-solid fa-arrow-left mr-2"></i> Volver
            </button>
          )}

          {viewMode !== 'DETAIL' && (
            <div className="flex app-chip p-1 rounded-xl">
              <button
                onClick={() => setViewMode('LIST')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase ${
                  viewMode === 'LIST' ? 'bg-white dark:bg-slate-900 shadow text-[var(--ui-accent)]' : 'text-slate-400'
                }`}
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode('AGING')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase ${
                  viewMode === 'AGING' ? 'bg-white dark:bg-slate-900 shadow text-rose-600' : 'text-slate-400'
                }`}
              >
                Semáforo
              </button>
            </div>
          )}

          {viewMode === 'LIST' && (
            <>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-2 app-btn app-btn-primary"
              >
                + Nuevo Cliente
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'LIST' && (
        <div className="flex-1 app-panel overflow-hidden flex flex-col">
          {customerToast && (
            <div className="px-6 pt-4">
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl px-4 py-2">
                {customerToast}
              </div>
            </div>
          )}
          <div className="px-5 pt-4 pb-3">
            <form
              onSubmit={handleQuickOpSubmit}
              onKeyDown={handleFormKeyDown}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-sm p-4 flex flex-col gap-3"
            >
              {/* ── Fila 1: Cliente + Cuenta + Tipo + Saldo ── */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
                  <Autocomplete
                    autoFocus
                    items={customers}
                    stringify={(i: any) => i.id}
                    secondary={(i: any) => i.cedula || ''}
                    placeholder="🔍 Buscar o crear cliente..."
                    value={quickForm.customerName}
                    onChange={(v) => setQuickForm({ ...quickForm, customerName: v })}
                    onSelect={(it: any) => setQuickForm({ ...quickForm, customerName: it.id })}
                    onAfterSelect={() => montoRef.current?.focus()}
                    onCreate={(label: string) => { openCreateCustomerModal(label); }}
                  />
                </div>

                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/[0.07] rounded-xl shrink-0">
                  {([
                    { at: AccountType.BCV, label: 'BCV', kbd: 'B', active: 'text-blue-600' },
                    { at: AccountType.GRUPO, label: 'Grupo', kbd: 'G', active: 'text-violet-600' },
                    { at: AccountType.DIVISA, label: 'Divisa', kbd: 'D', active: 'text-emerald-600' },
                  ] as const).map(({ at, label, kbd, active }) => (
                    <button key={at} type="button"
                      onClick={() => handleAccountTypeChange(at)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${quickForm.accountType === at ? `bg-white dark:bg-slate-900 shadow ${active}` : 'text-slate-400 hover:text-slate-600 dark:text-slate-400'}`}
                    >
                      {label} <kbd className="text-[9px] opacity-40 font-sans ml-0.5">⌥{kbd}</kbd>
                    </button>
                  ))}
                </div>

                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/[0.07] rounded-xl shrink-0">
                  <button type="button"
                    onClick={() => setQuickForm(p => ({ ...p, type: MovementType.FACTURA }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${quickForm.type === MovementType.FACTURA ? 'bg-rose-500 text-white shadow' : 'text-slate-400 hover:text-slate-600 dark:text-slate-400'}`}
                  >
                    Deuda <kbd className="text-[9px] opacity-40 font-sans ml-0.5">⌥F</kbd>
                  </button>
                  <button type="button"
                    onClick={() => setQuickForm(p => ({ ...p, type: MovementType.ABONO }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${quickForm.type === MovementType.ABONO ? 'bg-emerald-500 text-white shadow' : 'text-slate-400 hover:text-slate-600 dark:text-slate-400'}`}
                  >
                    Abono <kbd className="text-[9px] opacity-40 font-sans ml-0.5">⌥A</kbd>
                  </button>
                </div>

                {quickBalances && (
                  <div className="text-right shrink-0 ml-1">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saldo</div>
                    <div className={`text-sm font-black font-mono ${
                      (quickForm.accountType === AccountType.BCV ? quickBalances.bcv :
                       quickForm.accountType === AccountType.GRUPO ? quickBalances.grupo :
                       quickBalances.div) > 0 ? 'text-emerald-600' : 'text-rose-500'
                    }`}>
                      {formatCurrency(Math.abs(
                        quickForm.accountType === AccountType.BCV ? quickBalances.bcv :
                        quickForm.accountType === AccountType.GRUPO ? quickBalances.grupo :
                        quickBalances.div
                      ), '$')}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Fila 2: Monto + Tasa + Fecha + Concepto + Ref + Guardar ── */}
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-[110px]">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monto</label>
                  <NumericFormat
                    getInputRef={montoRef}
                    tabIndex={1}
                    value={quickForm.amount}
                    onValueChange={(vals) => setQuickForm({ ...quickForm, amount: vals.value || '' })}
                    thousandSeparator="."
                    decimalSeparator=","
                    decimalScale={2}
                    allowNegative={false}
                    className="w-full mt-1 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-sm font-black text-slate-800 dark:text-slate-200 outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-soft)] transition-all"
                    placeholder="0,00"
                    required
                    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); conceptoRef.current?.focus(); } }}
                  />
                </div>

                {quickForm.accountType !== AccountType.DIVISA && (
                  <div className="w-[88px]">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tasa Bs</label>
                    <input
                      type="number"
                      tabIndex={2}
                      step="0.01"
                      className="w-full mt-1 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-soft)] transition-all"
                      value={quickForm.rate}
                      onChange={(e) => setQuickForm({ ...quickForm, rate: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                )}

                <div className="w-[148px]">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fecha</label>
                  <SmartDatePicker
                    tabIndex={3}
                    value={quickForm.date}
                    onChange={handleQuickDateSelect}
                    rateDates={rateDates}
                    className="mt-1"
                    inputClassName="w-full px-3 py-2.5 pr-7 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-soft)] transition-all"
                  />
                </div>

                <div className="flex-1 min-w-[150px]">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Concepto</label>
                  <input
                    ref={conceptoRef}
                    type="text"
                    tabIndex={4}
                    className="w-full mt-1 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-soft)] transition-all"
                    placeholder={quickForm.type === MovementType.FACTURA ? 'Factura / Venta / Servicio...' : 'Pago / Abono / Depósito...'}
                    value={quickForm.concept}
                    onChange={(e) => setQuickForm({ ...quickForm, concept: e.target.value })}
                    required
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickOpSubmit(e as any); } }}
                  />
                </div>

                <div className="w-[130px]">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ref. (opt)</label>
                  <input
                    type="text"
                    tabIndex={5}
                    className="w-full mt-1 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-600 dark:text-slate-400 placeholder:text-slate-300 outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-soft)] transition-all"
                    placeholder="Nro. control..."
                    value={quickForm.reference}
                    onChange={(e) => setQuickForm({ ...quickForm, reference: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickOpSubmit(e as any); } }}
                  />
                </div>

                <button
                  type="submit"
                  tabIndex={6}
                  className={`shrink-0 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide shadow-sm transition-all active:scale-95 ${
                    successFlash
                      ? 'bg-emerald-500 text-white shadow-emerald-100'
                      : quickForm.type === MovementType.FACTURA
                      ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-100'
                      : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-100'
                  }`}
                >
                  {successFlash ? '✓ Guardado' : 'Guardar ↵'}
                </button>
              </div>

              {rateHint && (
                <div className="text-[10px] font-semibold text-emerald-600 -mt-1">{rateHint}</div>
              )}
            </form>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 pb-0.5 text-[10px] text-slate-300 font-medium select-none">
              <span>⌥B BCV</span><span className="text-slate-200">·</span>
              <span>⌥G Grupo</span><span className="text-slate-200">·</span>
              <span>⌥D Divisa</span><span className="text-slate-200">·</span>
              <span>⌥F Deuda</span><span className="text-slate-200">·</span>
              <span>⌥A Abono</span><span className="text-slate-200">·</span>
              <span>↵ Guardar</span><span className="text-slate-200">·</span>
              <span>Esc Limpiar</span>
            </div>
          </div>

          <div className="px-6 py-3 border-t border-slate-100 dark:border-white/[0.07] bg-white dark:bg-slate-900 flex items-center gap-2">
            <i className="fa-solid fa-magnifying-glass text-slate-300 text-xs" />
            <input
              type="text"
              placeholder="Filtrar clientes por nombre, cédula..."
              className="flex-1 bg-transparent border-none outline-none text-sm font-semibold text-slate-600 dark:text-slate-400 placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')} className="text-slate-300 hover:text-slate-500 transition-colors">
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto custom-scroll">
            {directoryData.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon="📒"
                  title="Comienza tu Agenda"
                  description="Crea tu primer cliente para empezar a registrar cobranzas y ventas."
                  actionLabel="Crear Nuevo Cliente"
                  onAction={() => setShowAddModal(true)}
                />
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 text-[10px] uppercase font-black tracking-widest sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4">Nombre / Razón Social</th>
                    <th className="px-6 py-4">RIF / C.I.</th>
                    <th className="px-6 py-4">Teléfono</th>
                    <th className="px-6 py-4 text-right">Saldos por Cuenta</th>
                    <th className="px-6 py-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.07]">
                  {directoryData.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50/70 transition-colors group"
                    >
                      <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">
                        <div className="flex flex-col gap-2">
                          <span>{c.id}</span>
                          <ClientStatusBadge
                            tags={clientStatusMap.get(c.id)?.tags}
                            className="text-[10px]"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{c.cedula}</td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{c.telefono}</td>
                      <td className="px-6 py-4 text-right align-top">
                        <div className="flex flex-col items-end text-[11px] font-semibold">
                          <div
                            className={`flex items-center gap-2 ${
                              ((c as any).balances?.bcv || 0) / (rates.bcv || 1) > 0
                                ? 'text-emerald-500'
                                : 'text-rose-500'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                            <span
                              className="uppercase text-[10px] font-black text-slate-500"
                              title="Saldo en bolivares segun tasa BCV"
                            >
                              BCV
                            </span>
                            <span className="font-mono">
                              {formatCurrency(Math.abs((c as any).balances?.bcv || 0), '$')}
                            </span>
                          </div>
                          <div
                            className={`flex items-center gap-2 ${
                              ((c as any).balances?.grupo || 0) > 0
                                ? 'text-emerald-500'
                                : 'text-rose-500'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span>
                            <span
                              className="uppercase text-[10px] font-black text-slate-500"
                              title="Saldo en divisa manejado internamente"
                            >
                              GRUPO
                            </span>
                            <span className="font-mono">
                              {formatCurrency(Math.abs((c as any).balances?.grupo || 0), '$')}
                            </span>
                          </div>
                          <div
                            className={`flex items-center gap-2 ${
                              (c as any).balances?.div > 0 ? 'text-emerald-500' : 'text-rose-500'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                            <span
                              className="uppercase text-[10px] font-black text-slate-500"
                              title="Saldo en caja divisa (USD)"
                            >
                              DIVISA
                            </span>
                            <span className="font-mono">
                              {formatCurrency(Math.abs((c as any).balances?.div || 0), '$')}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 flex justify-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            onOpenLedger ? onOpenLedger(c.id) : openCustomerDetail(c.id)
                          }
                          className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-slate-900 dark:text-white flex items-center justify-center transition-colors"
                          title="Ver Libro Mayor"
                        >
                          <i className="fa-solid fa-folder-open"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {viewMode === 'AGING' && (
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col p-6 gap-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">
                Semáforo de Morosidad
              </h2>
              <p className="text-xs text-slate-500 font-semibold">
                Organiza la cobranza por días de atraso y prioriza acciones.
              </p>
            </div>
            <div className="flex flex-col lg:flex-row gap-3 w-full lg:w-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Buscar cliente o cédula..."
                  className="w-full sm:w-[260px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50 text-sm font-semibold text-slate-700 dark:text-slate-300"
                  value={agingSearch}
                  onChange={(e) => setAgingSearch(e.target.value)}
                />
                <select
                  className="w-full sm:w-[220px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50 text-sm font-semibold text-slate-700 dark:text-slate-300"
                  value={agingSort}
                  onChange={(e) =>
                    setAgingSort(
                      e.target.value as 'amount-desc' | 'amount-asc' | 'age-desc' | 'age-asc'
                    )
                  }
                >
                  <option value="amount-desc">Ordenar: Monto (Mayor a menor)</option>
                  <option value="amount-asc">Ordenar: Monto (Menor a mayor)</option>
                  <option value="age-desc">Ordenar: Antigüedad (Mayor a menor)</option>
                  <option value="age-asc">Ordenar: Antigüedad (Menor a mayor)</option>
                </select>
              </div>
              <div className="w-full lg:w-[320px] bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-xl p-3 text-[10px] text-slate-600 dark:text-slate-400">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Info Semáforo
                </div>
                <div className="flex flex-col gap-1">
                  <span>🟢 Solvente: sin deuda en BCV, Grupo y Divisa.</span>
                  <span>🔴 Deudor: saldo negativo en alguna cuenta.</span>
                  <span>🟡 Inactivo/Nuevo: sin movimientos recientes o sin movimientos.</span>
                  <span>⭐ VIP: saldo a favor mayor o igual a $20.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
            <div className="flex flex-col bg-green-50 rounded-2xl border border-green-200 overflow-hidden">
              <div className="p-4 bg-green-50/80 border-b border-green-200">
                <div className="text-center">
                  <h3
                    className="text-green-700 font-black uppercase text-xs tracking-widest"
                    title="Clientes con deuda en los ultimos 15 dias"
                  >
                    Al Día (0-15 Días)
                  </h3>
                  <p className="text-green-700/80 text-[10px] font-bold mt-1">
                    Cobranza Regular
                  </p>
                  <p className="text-[10px] font-black text-green-700 mt-2">
                    {totalsGreen.count} Clientes | Total: {formatCurrency(totalsGreen.total)}
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
                {agingGreen.map((item, idx) => {
                  const badges = getAgingBadges(item);
                  const bsEquivalent = item.amount * (item.rate || 1);
                  return (
                    <div
                      key={`${item.customer}-${idx}`}
                      ref={(node) => {
                        semaforoCardRefs.current[item.customer] = node;
                      }}
                      className="group bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-emerald-100 border-l-4 border-l-emerald-400 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => {
                        setAgingModalItem(item);
                        setShowAgingModal(true);
                      }}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-black flex items-center justify-center text-xs">
                            {getInitials(item.customer)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight">
                              {item.customer}
                            </p>
                            <p className="text-[10px] text-slate-500 font-semibold">
                              {item.cedula || 'Sin cédula'}
                            </p>
                          </div>
                        </div>
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full">
                          Hace {item.age} días
                        </span>
                      </div>
                      <div className="mt-3">
                        <p className="text-2xl font-black text-slate-900 dark:text-white">
                          {formatCurrency(item.amount, '$')}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold">
                          {formatCurrency(bsEquivalent, 'Bs')} (Tasa {Number(item.rate || 1).toFixed(2)})
                        </p>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500 font-semibold">
                        Última factura: {item.reference || 'Sin referencia'}
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openCustomerLedger(item.customer);
                        }}
                        className="mt-2 text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-700 flex items-center gap-2"
                        title="Ir al Libro Mayor"
                      >
                        <i className="fa-solid fa-folder-open"></i>
                        Ver Hoja de Vida
                      </button>
                      {badges.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {badges.map((badge) => (
                            <span
                              key={badge.label}
                              title={badge.tooltip}
                              className={`text-[10px] font-bold px-2 py-1 rounded-full ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 border-t border-slate-100 dark:border-white/[0.07] pt-3 flex flex-wrap gap-2 opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-100">
                        <div
                          className="relative flex-1 min-w-[150px]"
                          ref={item.customer === shareMenuClientId ? shareMenuCardRef : null}
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setShareMenuClientId((prev) =>
                                prev === item.customer ? null : item.customer
                              );
                            }}
                            className="w-full bg-emerald-100 text-emerald-700 py-2 rounded-lg text-[11px] font-black uppercase hover:bg-emerald-200"
                          >
                            Enviar Estado
                          </button>
                          {shareMenuClientId === item.customer && (
                            <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-lg p-2 z-20">
                              <div className="px-3 pt-1 pb-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                  Cuenta a exportar
                                </label>
                                <select
                                  className="mt-2 w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-700 dark:text-slate-300"
                                  value={shareMenuAccount}
                                  onChange={(event) =>
                                    setShareMenuAccount(event.target.value as ReportAccount)
                                  }
                                >
                                  <option value="GLOBAL">Todas</option>
                                  <option value="BCV">BCV</option>
                                  <option value="GRUPO">GRUPO</option>
                                  <option value="DIVISA">DIVISA</option>
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  openWhatsAppPreview(
                                    buildWhatsAppContext(item.customer, shareMenuAccount, item.date)
                                  );
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                WhatsApp (plantilla)
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  void handleCardPdfSummary(item.customer, shareMenuAccount);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                PDF Resumido
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  void handleCardPdfDetailed(item.customer, shareMenuAccount);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                PDF Detallado
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  setTimeout(() => {
                                    void handleCardImageSummary(item.customer, shareMenuAccount);
                                  }, 60);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                Imagen Resumida
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  setTimeout(() => {
                                    void handleCardImageDetailed(item.customer, shareMenuAccount);
                                  }, 60);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                Imagen Detallada
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleQuickAbono(item);
                          }}
                          className="flex-1 min-w-[110px] bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 py-2 rounded-lg text-[11px] font-black uppercase hover:bg-slate-200"
                        >
                          Registrar Abono
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCallNote(item);
                          }}
                          className="flex-1 min-w-[110px] bg-indigo-100 text-indigo-700 py-2 rounded-lg text-[11px] font-black uppercase hover:bg-indigo-200"
                        >
                          Registrar Llamada
                        </button>
                      </div>
                    </div>
                  );
                })}
                {agingGreen.length === 0 && (
                  <EmptyState
                    icon="✅"
                    title="Cartera al Dia"
                    description="No hay clientes con pagos recientes pendientes en este rango."
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col bg-yellow-50 rounded-2xl border border-yellow-200 overflow-hidden">
              <div className="p-4 bg-yellow-50/80 border-b border-yellow-200">
                <div className="text-center">
                  <h3
                    className="text-yellow-700 font-black uppercase text-xs tracking-widest"
                    title="Clientes con deuda entre 15 y 30 dias"
                  >
                    Pendiente (16-30 Días)
                  </h3>
                  <p className="text-yellow-700/80 text-[10px] font-bold mt-1">
                    Atención Requerida
                  </p>
                  <p className="text-[10px] font-black text-yellow-700 mt-2">
                    {totalsYellow.count} Clientes | Total: {formatCurrency(totalsYellow.total)}
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
                {agingYellow.map((item, idx) => {
                  const badges = getAgingBadges(item);
                  const bsEquivalent = item.amount * (item.rate || 1);
                  return (
                    <div
                      key={`${item.customer}-${idx}`}
                      ref={(node) => {
                        semaforoCardRefs.current[item.customer] = node;
                      }}
                      className="group bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-amber-100 border-l-4 border-l-amber-400 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => {
                        setAgingModalItem(item);
                        setShowAgingModal(true);
                      }}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 font-black flex items-center justify-center text-xs">
                            {getInitials(item.customer)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight">
                              {item.customer}
                            </p>
                            <p className="text-[10px] text-slate-500 font-semibold">
                              {item.cedula || 'Sin cédula'}
                            </p>
                          </div>
                        </div>
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-1 rounded-full">
                          Hace {item.age} días
                        </span>
                      </div>
                      <div className="mt-3">
                        <p className="text-2xl font-black text-slate-900 dark:text-white">
                          {formatCurrency(item.amount, '$')}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold">
                          {formatCurrency(bsEquivalent, 'Bs')} (Tasa {Number(item.rate || 1).toFixed(2)})
                        </p>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500 font-semibold">
                        Última factura: {item.reference || 'Sin referencia'}
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openCustomerLedger(item.customer);
                        }}
                        className="mt-2 text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-700 flex items-center gap-2"
                        title="Ir al Libro Mayor"
                      >
                        <i className="fa-solid fa-folder-open"></i>
                        Ver Hoja de Vida
                      </button>
                      {badges.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {badges.map((badge) => (
                            <span
                              key={badge.label}
                              title={badge.tooltip}
                              className={`text-[10px] font-bold px-2 py-1 rounded-full ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 border-t border-slate-100 dark:border-white/[0.07] pt-3 flex flex-wrap gap-2 opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-100">
                        <div
                          className="relative flex-1 min-w-[150px]"
                          ref={item.customer === shareMenuClientId ? shareMenuCardRef : null}
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setShareMenuClientId((prev) =>
                                prev === item.customer ? null : item.customer
                              );
                            }}
                            className="w-full bg-emerald-100 text-emerald-700 py-2 rounded-lg text-[11px] font-black uppercase hover:bg-emerald-200"
                          >
                            Enviar Estado
                          </button>
                          {shareMenuClientId === item.customer && (
                            <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-lg p-2 z-20">
                              <div className="px-3 pt-1 pb-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                  Cuenta a exportar
                                </label>
                                <select
                                  className="mt-2 w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-700 dark:text-slate-300"
                                  value={shareMenuAccount}
                                  onChange={(event) =>
                                    setShareMenuAccount(event.target.value as ReportAccount)
                                  }
                                >
                                  <option value="GLOBAL">Todas</option>
                                  <option value="BCV">BCV</option>
                                  <option value="GRUPO">GRUPO</option>
                                  <option value="DIVISA">DIVISA</option>
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  openWhatsAppPreview(
                                    buildWhatsAppContext(item.customer, shareMenuAccount, item.date)
                                  );
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                WhatsApp (plantilla)
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  void handleCardPdfSummary(item.customer, shareMenuAccount);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                PDF Resumido
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  void handleCardPdfDetailed(item.customer, shareMenuAccount);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                PDF Detallado
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  setTimeout(() => {
                                    void handleCardImageSummary(item.customer, shareMenuAccount);
                                  }, 60);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                Imagen Resumida
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  setTimeout(() => {
                                    void handleCardImageDetailed(item.customer, shareMenuAccount);
                                  }, 60);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                Imagen Detallada
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleQuickAbono(item);
                          }}
                          className="flex-1 min-w-[110px] bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 py-2 rounded-lg text-[11px] font-black uppercase hover:bg-slate-200"
                        >
                          Registrar Abono
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCallNote(item);
                          }}
                          className="flex-1 min-w-[110px] bg-indigo-100 text-indigo-700 py-2 rounded-lg text-[11px] font-black uppercase hover:bg-indigo-200"
                        >
                          Registrar Llamada
                        </button>
                      </div>
                    </div>
                  );
                })}
                {agingYellow.length === 0 && (
                  <EmptyState
                    icon="🟡"
                    title="Sin pendientes"
                    description="No hay clientes con deuda entre 16 y 30 dias."
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col bg-red-50 rounded-2xl border border-red-200 overflow-hidden">
              <div className="p-4 bg-red-50/80 border-b border-red-200">
                <div className="text-center">
                  <h3
                    className="text-red-700 font-black uppercase text-xs tracking-widest"
                    title="Clientes con deuda superior a 30 dias"
                  >
                    Vencido (+30 Días)
                  </h3>
                  <p className="text-red-700/80 text-[10px] font-bold mt-1">
                    Riesgo Alto / Cobranza
                  </p>
                  <p className="text-[10px] font-black text-red-700 mt-2">
                    {totalsRed.count} Clientes | Total: {formatCurrency(totalsRed.total)}
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
                {agingRed.map((item, idx) => {
                  const badges = getAgingBadges(item);
                  const bsEquivalent = item.amount * (item.rate || 1);
                  return (
                    <div
                      key={`${item.customer}-${idx}`}
                      ref={(node) => {
                        semaforoCardRefs.current[item.customer] = node;
                      }}
                      className="group bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-rose-100 border-l-4 border-l-rose-400 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => {
                        setAgingModalItem(item);
                        setShowAgingModal(true);
                      }}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-700 font-black flex items-center justify-center text-xs">
                            {getInitials(item.customer)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight">
                              {item.customer}
                            </p>
                            <p className="text-[10px] text-slate-500 font-semibold">
                              {item.cedula || 'Sin cédula'}
                            </p>
                          </div>
                        </div>
                        <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-1 rounded-full">
                          Hace {item.age} días
                        </span>
                      </div>
                      <div className="mt-3">
                        <p className="text-2xl font-black text-slate-900 dark:text-white">
                          {formatCurrency(item.amount, '$')}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold">
                          {formatCurrency(bsEquivalent, 'Bs')} (Tasa {Number(item.rate || 1).toFixed(2)})
                        </p>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500 font-semibold">
                        Última factura: {item.reference || 'Sin referencia'}
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openCustomerLedger(item.customer);
                        }}
                        className="mt-2 text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-700 flex items-center gap-2"
                        title="Ir al Libro Mayor"
                      >
                        <i className="fa-solid fa-folder-open"></i>
                        Ver Hoja de Vida
                      </button>
                      {badges.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {badges.map((badge) => (
                            <span
                              key={badge.label}
                              title={badge.tooltip}
                              className={`text-[10px] font-bold px-2 py-1 rounded-full ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 border-t border-slate-100 dark:border-white/[0.07] pt-3 flex flex-wrap gap-2 opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-100">
                        <div
                          className="relative flex-1 min-w-[150px]"
                          ref={item.customer === shareMenuClientId ? shareMenuCardRef : null}
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setShareMenuClientId((prev) =>
                                prev === item.customer ? null : item.customer
                              );
                            }}
                            className="w-full bg-emerald-100 text-emerald-700 py-2 rounded-lg text-[11px] font-black uppercase hover:bg-emerald-200"
                          >
                            Enviar Estado
                          </button>
                          {shareMenuClientId === item.customer && (
                            <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-lg p-2 z-20">
                              <div className="px-3 pt-1 pb-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                  Cuenta a exportar
                                </label>
                                <select
                                  className="mt-2 w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-700 dark:text-slate-300"
                                  value={shareMenuAccount}
                                  onChange={(event) =>
                                    setShareMenuAccount(event.target.value as ReportAccount)
                                  }
                                >
                                  <option value="GLOBAL">Todas</option>
                                  <option value="BCV">BCV</option>
                                  <option value="GRUPO">GRUPO</option>
                                  <option value="DIVISA">DIVISA</option>
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  openWhatsAppPreview(
                                    buildWhatsAppContext(item.customer, shareMenuAccount, item.date)
                                  );
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                WhatsApp (plantilla)
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  void handleCardPdfSummary(item.customer, shareMenuAccount);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                PDF Resumido
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  void handleCardPdfDetailed(item.customer, shareMenuAccount);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                PDF Detallado
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  setTimeout(() => {
                                    void handleCardImageSummary(item.customer, shareMenuAccount);
                                  }, 60);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                Imagen Resumida
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShareMenuClientId(null);
                                  setTimeout(() => {
                                    void handleCardImageDetailed(item.customer, shareMenuAccount);
                                  }, 60);
                                }}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                Imagen Detallada
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleQuickAbono(item);
                          }}
                          className="flex-1 min-w-[110px] bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 py-2 rounded-lg text-[11px] font-black uppercase hover:bg-slate-200"
                        >
                          Registrar Abono
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCallNote(item);
                          }}
                          className="flex-1 min-w-[110px] bg-indigo-100 text-indigo-700 py-2 rounded-lg text-[11px] font-black uppercase hover:bg-indigo-200"
                        >
                          Registrar Llamada
                        </button>
                      </div>
                    </div>
                  );
                })}
                {agingRed.length === 0 && (
                  <EmptyState
                    icon="💚"
                    title="Cartera Saludable"
                    description="Tus clientes estan al dia con sus pagos."
                  />
                )}
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-semibold">
            ℹ️ El sistema clasifica automaticamente segun los dias desde el ultimo abono: Verde
            (0-15 dias), Amarillo (16-30 dias), Rojo (+30 dias).
          </div>
        </div>
      )}

      {viewMode === 'DETAIL' && selectedCustomer && (
        <div className="flex-1 flex flex-col gap-4">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 h-auto xl:h-[220px]">
            <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
              <ActionCard
                title="BCV"
                accountType={AccountType.BCV}
                rate={rates.bcv}
                headerColor="bg-blue-800"
                btnColor="bg-blue-800"
                icon="fa-building-columns"
                customerName={selectedCustomer.id}
                rateCalendar={rateCalendar}
                rateDates={rateDates}
                onAction={onAddMovement}
                onCreateCustomer={onRegisterCustomer}
              />
              <ActionCard
                title="Grupo"
                accountType={AccountType.GRUPO}
                rate={rates.grupo}
                headerColor="bg-orange-600"
                btnColor="bg-orange-600"
                icon="fa-users"
                customerName={selectedCustomer.id}
                rateCalendar={rateCalendar}
                rateDates={rateDates}
                onAction={onAddMovement}
                onCreateCustomer={onRegisterCustomer}
              />
              <ActionCard
                title="Divisa"
                accountType={AccountType.DIVISA}
                rate={1}
                headerColor="bg-emerald-700"
                btnColor="bg-emerald-700"
                icon="fa-money-bill"
                customerName={selectedCustomer.id}
                rateCalendar={rateCalendar}
                rateDates={rateDates}
                onAction={onAddMovement}
                onCreateCustomer={onRegisterCustomer}
              />
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-white/10 flex flex-col justify-center items-center text-center">
              <div
                className={`w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-2xl mb-2 ${selectedStatusStyles.ring}`}
              >
                👤
              </div>
              <h2 className="font-black text-slate-800 dark:text-slate-200 leading-none mb-1">
                {selectedCustomer.id}
              </h2>
              <ClientStatusBadge
                tags={clientStatusMap.get(selectedCustomer.id)?.tags}
                className="justify-center mb-2"
              />
              <div className="text-xs text-slate-500 mb-3 space-y-1">
                <div>
                  <span className="font-semibold text-slate-600 dark:text-slate-400">CI/RIF:</span>{' '}
                  {selectedCustomer.cedula || 'N/A'}
                </div>
                <div>
                  <span className="font-semibold text-slate-600 dark:text-slate-400">Telefono:</span>{' '}
                  {selectedCustomer.telefono ? (
                    <a
                      href={`tel:${selectedCustomer.telefono.replace(/\s+/g, '')}`}
                      className="text-slate-700 dark:text-slate-300 hover:text-[var(--ui-accent)]"
                    >
                      {formatPhone(selectedCustomer.telefono)}
                    </a>
                  ) : (
                    'N/A'
                  )}
                </div>
                <div>
                  <span className="font-semibold text-slate-600 dark:text-slate-400">Direccion:</span>{' '}
                  {selectedCustomer.direccion || 'N/A'}
                </div>
              </div>
              <div className="w-full flex flex-col gap-2 mt-2 px-1 overflow-y-auto max-h-[100px] custom-scroll">
                {(() => {
                  const d = directoryData.find((c) => c.id === selectedCustomer.id);
                  const bcv = d?.balances?.bcv || 0;
                  const grupo = d?.balances?.grupo || 0;
                  const div = d?.balances?.div || 0;
                  return (
                    <>
                      <div className="flex justify-between items-center p-2 rounded bg-blue-50 border border-blue-100">
                        <span className="text-[10px] font-black text-blue-700 uppercase">BCV</span>
                        <span
                          className={`font-mono font-black text-sm truncate ${
                            bcv > 0 ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {formatCurrency(Math.abs(bcv), '$')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded bg-orange-50 border border-orange-100">
                        <span className="text-[10px] font-black text-orange-700 uppercase">
                          Grupo
                        </span>
                        <span
                          className={`font-mono font-black text-sm truncate ${
                            grupo > 0 ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {formatCurrency(Math.abs(grupo), '$')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded bg-emerald-50 border border-emerald-100">
                        <span className="text-[10px] font-black text-emerald-700 uppercase">
                          Divisa
                        </span>
                        <span
                          className={`font-mono font-black text-sm truncate ${
                            div > 0 ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {formatCurrency(Math.abs(div), '$')}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[2.2fr_1fr] gap-4">
            {(() => {
              const balances = computeBalancesForCustomer(selectedCustomer.id);
              const lastInfo = getLastMovementInfo(selectedCustomer.id);
              const cards = [
                {
                  key: 'BCV',
                  label: 'BCV',
                  value: balances.bcv,
                  className: 'from-blue-500/15 via-white/80 to-white/80',
                  accent: 'text-blue-700',
                },
                {
                  key: 'GRUPO',
                  label: 'Grupo',
                  value: balances.grupo,
                  className: 'from-purple-500/15 via-white/80 to-white/80',
                  accent: 'text-purple-700',
                },
                {
                  key: 'DIVISA',
                  label: 'Divisa',
                  value: balances.div,
                  className: 'from-emerald-500/15 via-white/80 to-white/80',
                  accent: 'text-emerald-700',
                },
              ];
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {cards.map((card) => (
                    <div
                      key={card.key}
                      className={`rounded-2xl border border-white/70 bg-gradient-to-br ${card.className} shadow-sm backdrop-blur-sm p-4 min-h-[120px] flex flex-col justify-between`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-black uppercase tracking-widest ${card.accent}`}>
                          {card.label}
                        </span>
                        <span className="text-slate-300 text-xl">●</span>
                      </div>
                      <div>
                        <div
                          className={`text-2xl font-black ${
                            card.value < 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {formatCurrency(Math.abs(card.value), '$')}
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold mt-2">
                          {lastInfo.label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="rounded-2xl border border-slate-100 dark:border-white/[0.07] bg-white dark:bg-slate-900 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Notas internas
                  </div>
                  <div className="text-sm font-black text-slate-800 dark:text-slate-200">Apuntes rapidos</div>
                </div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Privado</span>
              </div>
              <textarea
                className="mt-3 w-full min-h-[110px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="Ej: Solo entrega al titular, cobra por Zelle, llamar el viernes..."
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
              />
              <div className="mt-2 text-[10px] text-slate-400 font-semibold">
                Se guarda automaticamente para este cliente.
              </div>
            </div>
          </div>

          <div className="flex-1 bg-white dark:bg-slate-900 rounded-[1.5rem] shadow-sm border border-slate-100 dark:border-white/[0.07] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] bg-white dark:bg-slate-900">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Cuenta
                    </label>
                    <select
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300"
                      value={detailAccountFilter}
                      onChange={(e) =>
                        setDetailAccountFilter(e.target.value as 'ALL' | AccountType)
                      }
                    >
                      <option value="ALL">Todas</option>
                      <option value={AccountType.BCV}>🔵 BCV</option>
                      <option value={AccountType.GRUPO}>🟠 Grupo</option>
                      <option value={AccountType.DIVISA}>🟢 Divisa</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Periodo / Rango
                    </label>
                    <select
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300"
                      value={detailRangeFilter}
                      onChange={(e) =>
                        setDetailRangeFilter(
                          e.target.value as
                            | 'ALL'
                            | 'SINCE_ZERO'
                            | 'SINCE_LAST_DEBT'
                            | 'SINCE_LAST_PAYMENT'
                            | 'CUSTOM'
                        )
                      }
                    >
                      <option value="ALL">📅 Todo el Historial</option>
                      <option value="SINCE_ZERO">0️⃣ Desde Saldo Cero</option>
                      <option value="SINCE_LAST_DEBT">🧾 Desde Ultima Factura</option>
                      <option value="CUSTOM">🗓️ Rango Personalizado</option>
                    </select>
                  </div>
                  {detailRangeFilter === 'CUSTOM' && (
                    <>
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Desde
                        </label>
                        <SmartDatePicker
                          value={detailFromDate}
                          onChange={setDetailFromDate}
                          rateDates={rateDates}
                          inputClassName="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Hasta
                        </label>
                        <SmartDatePicker
                          value={detailToDate}
                          onChange={setDetailToDate}
                          rateDates={rateDates}
                          inputClassName="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300"
                        />
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDetailAccountFilter('ALL');
                      setDetailRangeFilter('ALL');
                      setDetailFromDate('');
                      setDetailToDate('');
                    }}
                    className="px-3 py-2 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700 dark:text-slate-300"
                  >
                    Limpiar
                  </button>
                </div>
                <div className="flex items-center gap-2" ref={shareMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedCustomer) return;
                      setQuickForm((prev) => {
                        const accountType =
                          detailAccountFilter !== 'ALL' ? detailAccountFilter : prev.accountType;
                        const rateValue =
                          accountType === AccountType.BCV
                            ? rates.bcv
                            : accountType === AccountType.GRUPO
                            ? rates.grupo
                            : 1;
                        return {
                          ...prev,
                          customerName: selectedCustomer.id,
                          accountType,
                          rate: String(rateValue),
                        };
                      });
                      setShowQuickOp(true);
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase hover:bg-indigo-700"
                  >
                    + Movimiento
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShareMenuDetailAccount(resolveReportAccount(detailAccountFilter));
                        setShowShareMenu((prev) => !prev);
                      }}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase hover:bg-emerald-700"
                    >
                      Enviar Estado
                    </button>
                    {showShareMenu && (
                      <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-lg p-3 z-20">
                      <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Cuenta a exportar
                      </div>
                      <div className="px-3 pb-2">
                        <select
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300"
                          value={shareMenuDetailAccount}
                          onChange={(e) =>
                            setShareMenuDetailAccount(e.target.value as ReportAccount)
                          }
                        >
                          <option value="GLOBAL">Todas</option>
                          <option value="BCV">🔵 BCV</option>
                          <option value="GRUPO">🟠 Grupo</option>
                          <option value="DIVISA">🟢 Divisa</option>
                        </select>
                        <p className="text-[10px] text-slate-500 mt-2">
                          El estado respeta el rango actual; la cuenta sale segun este selector.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedCustomer) return;
                          setShowShareMenu(false);
                          const entry = directoryData.find((c) => c.id === selectedCustomer.id);
                          openWhatsAppPreview(
                            buildWhatsAppContext(
                              selectedCustomer.id,
                              shareMenuDetailAccount,
                              entry?.lastMov || ''
                            )
                          );
                        }}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50:bg-white dark:bg-slate-900"
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-xl">💬</div>
                          <div>
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                              WhatsApp (plantilla)
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Previsualiza antes de enviar.
                            </div>
                          </div>
                        </div>
                      </button>
                      <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Resumen Ejecutivo
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowShareMenu(false);
                          const { sourceMovements, rangeFilter, rangeLabel, rangeFrom, rangeTo } =
                            getDetailReportContext();
                          void generateStatementPdf({
                            mode: 'summary',
                            account: shareMenuDetailAccount,
                            sourceMovements,
                            rangeFilter,
                            rangeLabel,
                            rangeFrom,
                            rangeTo,
                          });
                        }}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50:bg-white dark:bg-slate-900"
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-xl">📄</div>
                          <div>
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">PDF Resumido</div>
                            <div className="text-[11px] text-slate-500">Resumen profesional para clientes.</div>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowShareMenu(false);
                          const { sourceMovements, rangeFilter, rangeFrom, rangeTo } =
                            getDetailReportContext();
                          void exportSummaryImage({
                            account: shareMenuDetailAccount,
                            sourceMovements,
                            rangeFilter,
                            rangeFrom,
                            rangeTo,
                          });
                        }}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50:bg-white dark:bg-slate-900"
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-xl">🖼️</div>
                          <div>
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Imagen Resumida</div>
                            <div className="text-[11px] text-slate-500">Tarjeta limpia para compartir.</div>
                          </div>
                        </div>
                      </button>
                      <div className="mt-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Detalle Completo
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowShareMenu(false);
                          const { sourceMovements, rangeFilter, rangeLabel, rangeFrom, rangeTo } =
                            getDetailReportContext();
                          void generateStatementPdf({
                            mode: 'detailed',
                            account: shareMenuDetailAccount,
                            sourceMovements,
                            rangeFilter,
                            rangeLabel,
                            rangeFrom,
                            rangeTo,
                          });
                        }}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50:bg-white dark:bg-slate-900"
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-xl">📄</div>
                          <div>
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">PDF Detallado</div>
                            <div className="text-[11px] text-slate-500">Incluye referencias y saldo acumulado.</div>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowShareMenu(false);
                          const { sourceMovements, rangeFilter, rangeFrom, rangeTo } =
                            getDetailReportContext();
                          void exportDetailedImageFromData({
                            account: shareMenuDetailAccount,
                            sourceMovements,
                            rangeFilter,
                            rangeFrom,
                            rangeTo,
                          });
                        }}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50:bg-white dark:bg-slate-900"
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-xl">🖼️</div>
                          <div>
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Imagen Detallada</div>
                            <div className="text-[11px] text-slate-500">Captura completa de la tabla.</div>
                          </div>
                        </div>
                      </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* AQUÍ ESTÁ EL CAMBIO IMPORTANTE: pb-20 y un espaciador al final */}
            <div ref={detailTableRef} className="overflow-y-auto custom-scroll flex-1 relative p-1 pb-24">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 text-[10px] uppercase font-black sticky top-0">
                  <tr>
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3">Concepto</th>
                    <th className="px-6 py-3 text-center">Tasa</th>
                    <th className="px-6 py-3 text-right">Deuda</th>
                    <th className="px-6 py-3 text-right">Abono</th>
                    <th className="px-6 py-3 text-right">Saldo</th>
                    <th className="px-6 py-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.07]">
                  {detailMovementsDisplay.map((m: any) => (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50:bg-slate-700/50">
                      {(() => {
                        const amountUsd = getMovementUsdAmount(m, rates);
                        return (
                          <>
                      <td className="px-6 py-3 font-bold text-slate-500 text-xs">
                        <div className="flex items-center gap-2">
                          <span>{m.date}</span>
                          <button
                            type="button"
                            onClick={() => handleEditDate(m)}
                            className="text-[10px] text-slate-400 hover:text-indigo-600"
                            title="Editar fecha"
                          >
                            <i className="fa-solid fa-pen"></i>
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-slate-700 dark:text-slate-300 font-medium">
                        {m.concept}
                      </td>
                      <td className="px-6 py-3 text-center text-slate-400 text-xs">
                        {m.rateUsed > 1 ? m.rateUsed : '-'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-rose-500">
                        {m.movementType === MovementType.FACTURA
                          ? formatCurrency(amountUsd)
                          : '-'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-emerald-500">
                        {m.movementType === MovementType.ABONO
                          ? formatCurrency(amountUsd)
                          : '-'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        {formatCurrency(Math.abs(m.balance || 0))}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('¿Eliminar este movimiento?')) {
                              onDeleteMovement(m.id);
                            }
                          }}
                          className="text-rose-600 hover:text-rose-700 text-xs"
                          title="Eliminar"
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </td>
                          </>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Espacio de seguridad al final de la tabla (evita que la barra inferior tape filas) */}
              <div className="h-24 w-full"></div>
            </div>
          </div>
        </div>
      )}

      {showAgingModal && agingModalItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-2xl shadow-2xl animate-in zoom-in border-t-8 border-indigo-500">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center font-black text-sm ${
                    getStatusStyles(agingModalItem.category).badge
                  }`}
                >
                  {getInitials(agingModalItem.customer)}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-slate-200">
                    {agingModalItem.customer}
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    {agingModalItem.cedula || 'Sin cédula'} · {agingModalItem.age} días de atraso
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAgingModal(false)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/[0.07] hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Resumen de deuda
                </p>
                <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">
                  {formatCurrency(agingModalItem.amount, '$')}
                </p>
                <p className="text-xs text-slate-500 font-semibold mt-1">
                  Última factura: {agingModalItem.reference || 'Sin referencia'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {getAgingBadges(agingModalItem).map((badge) => (
                    <span
                      key={badge.label}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                  Últimas 3 facturas vencidas
                </p>
                <div className="space-y-3">
                  {agingModalInvoices.map((inv, idx) => {
                    const bsEquivalent = inv.amount * (inv.rate || 1);
                    return (
                      <div
                        key={`${inv.customer}-${inv.date}-${idx}`}
                        className="flex items-center justify-between gap-3 border border-slate-100 dark:border-white/[0.07] rounded-xl p-3"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {inv.reference || 'Sin referencia'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-semibold">
                            {inv.date} · Hace {inv.age} días
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-slate-800 dark:text-slate-200">
                            {formatCurrency(inv.amount, '$')}
                          </p>
                          <p className="text-[10px] text-slate-400 font-semibold">
                            {formatCurrency(bsEquivalent, 'Bs')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {agingModalInvoices.length === 0 && (
                    <div className="text-center text-slate-400 text-xs font-bold">
                      No hay facturas vencidas registradas.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAgingModal(false)}
                className="px-5 py-2 text-slate-500 font-bold uppercase text-xs"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  openCustomerDetail(agingModalItem.customer);
                  setShowAgingModal(false);
                }}
                className="px-6 py-2 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 uppercase text-xs"
              >
                Ir a Hoja de Vida Completa
              </button>
            </div>
          </div>
        </div>
      )}

      {editingDateMovement && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in">
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-200 mb-4 uppercase italic">
              Corregir Fecha
            </h3>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Fecha y hora
            </label>
            <input
              type="datetime-local"
              className="w-full p-3 mt-2 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-sm text-slate-700 dark:text-slate-300 outline-none"
              value={editingDateValue}
              onChange={(e) => setEditingDateValue(e.target.value)}
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingDateMovement(null);
                  setEditingDateValue('');
                }}
                className="px-4 py-2 text-slate-500 font-bold uppercase text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveDate}
                className="px-5 py-2 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 uppercase text-xs"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ... (Resto de los modales sin cambios) ... */}
      {(showAddModal || editCustomer) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSaveCustomer}
            className="bg-white dark:bg-slate-900 rounded-3xl p-8 w-full max-w-lg shadow-2xl animate-in zoom-in"
          >
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 mb-6 uppercase italic">
              {editCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
            </h3>
            <div className="space-y-4">
              <div className="relative">
                <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-slate-700 dark:text-slate-300 outline-none"
                  placeholder="Nombre / Razón Social"
                  value={editCustomer ? editCustomer.id : newCustomer.id || ''}
                  onChange={(e) => {
                    const next = toTitleCasePreserve(e.target.value);
                    editCustomer
                      ? setEditCustomer({ ...editCustomer, id: next })
                      : setNewCustomer({ ...newCustomer, id: next });
                  }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Cédula / RIF
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative">
                      <i className="fa-solid fa-id-card absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                      <select
                        className="pl-8 pr-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-black text-slate-700 dark:text-slate-300 outline-none"
                        value={docType}
                        onChange={(e) => setDocType(e.target.value as 'V' | 'J' | 'E' | 'G')}
                      >
                        <option value="V">V</option>
                        <option value="J">J</option>
                        <option value="E">E</option>
                        <option value="G">G</option>
                      </select>
                    </div>
                    <input
                      className="flex-1 px-3 py-3 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-slate-700 dark:text-slate-300 outline-none"
                      placeholder="12345678"
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Teléfono WhatsApp
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-3 py-3 rounded-xl font-black text-slate-700 dark:text-slate-300">
                      <span>🇻🇪</span>
                      <span>+58</span>
                    </div>
                    <div className="relative flex-1">
                      <i className="fa-solid fa-phone absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                      <input
                        className="w-full pl-9 pr-3 py-3 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-slate-700 dark:text-slate-300 outline-none"
                        placeholder="412-123-4567"
                        value={formatPhoneDigits(phoneDigits)}
                        onChange={(e) =>
                          setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <i className="fa-solid fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                  <input
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-slate-700 dark:text-slate-300 outline-none"
                    placeholder="Email (opcional)"
                    value={editCustomer ? editCustomer.email || '' : newCustomer.email || ''}
                    onChange={(e) =>
                      editCustomer
                        ? setEditCustomer({ ...editCustomer, email: e.target.value })
                        : setNewCustomer({ ...newCustomer, email: e.target.value })
                    }
                  />
                </div>
                <div className="relative">
                  <i className="fa-solid fa-location-dot absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                  <input
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-slate-700 dark:text-slate-300 outline-none"
                    placeholder="Dirección"
                    value={editCustomer ? editCustomer.direccion : newCustomer.direccion || ''}
                    onChange={(e) => {
                      const next = toTitleCasePreserve(e.target.value);
                      editCustomer
                        ? setEditCustomer({ ...editCustomer, direccion: next })
                        : setNewCustomer({ ...newCustomer, direccion: next });
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditCustomer(null);
                }}
                className="px-6 py-3 text-slate-500 font-bold uppercase text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-slate-900 dark:text-white font-black rounded-xl shadow-lg hover:from-indigo-700 hover:to-violet-700 uppercase text-xs"
              >
                Guardar Cliente
              </button>
            </div>
          </form>
        </div>
      )}

      {showQuickOp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleQuickOpSubmit}
            className="bg-white dark:bg-slate-900 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in border-t-8 border-amber-400"
          >
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 mb-6 uppercase italic">
              <i className="fa-solid fa-bolt text-amber-500 mr-2"></i> Operación Rápida
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Cliente
                </label>
                <Autocomplete
                  items={customers}
                  stringify={(i: any) => i.id}
                  secondary={(i: any) => i.cedula || ''}
                  placeholder="Buscar cliente..."
                  value={quickForm.customerName}
                  onChange={(v) => setQuickForm({ ...quickForm, customerName: v })}
                  onSelect={(it: any) => setQuickForm({ ...quickForm, customerName: it.id })}
                  onCreate={(label: string) => {
                    openCreateCustomerModal(label);
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-white/[0.07] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setQuickForm({ ...quickForm, type: MovementType.FACTURA })}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                    quickForm.type === MovementType.FACTURA
                      ? 'bg-rose-500 shadow text-slate-900 dark:text-white'
                      : 'text-slate-400'
                  }`}
                >
                  Generar Deuda
                </button>
                <button
                  type="button"
                  onClick={() => setQuickForm({ ...quickForm, type: MovementType.ABONO })}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                    quickForm.type === MovementType.ABONO
                      ? 'bg-emerald-500 shadow text-slate-900 dark:text-white'
                      : 'text-slate-400'
                  }`}
                >
                  Registrar Abono
                </button>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Cuenta Destino
                </label>
                <select
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-slate-700 dark:text-slate-300 outline-none"
                  value={quickForm.accountType}
                  onChange={(e) =>
                    setQuickForm({
                      ...quickForm,
                      accountType: e.target.value as AccountType,
                    })
                  }
                >
                  <option value={AccountType.BCV}>BCV</option>
                  <option value={AccountType.GRUPO}>GRUPO</option>
                  <option value={AccountType.DIVISA}>DIVISA</option>
                </select>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2">
                <div>
                  <div className="text-[10px] font-black uppercase text-slate-500">
                    Convertir usando tasa
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Aplica division por tasa BCV/Grupo
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={quickForm.useRate}
                    onChange={(e) =>
                      setQuickForm((prev) => ({ ...prev, useRate: e.target.checked }))
                    }
                    disabled={quickForm.accountType === AccountType.DIVISA}
                  />
                  <span
                    className={`w-11 h-6 rounded-full transition-colors ${
                      quickForm.accountType === AccountType.DIVISA
                        ? 'bg-slate-200'
                        : quickForm.useRate
                        ? 'bg-indigo-600'
                        : 'bg-slate-300'
                    }`}
                  ></span>
                  <span
                    className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white dark:bg-slate-900 transition-transform ${
                      quickForm.useRate ? 'translate-x-5' : ''
                    }`}
                  ></span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Monto
                  </label>
                  <NumericFormat
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-black text-lg text-slate-800 dark:text-slate-200 outline-none"
                    placeholder="0,00"
                    value={quickForm.amount}
                    onValueChange={(values) =>
                      setQuickForm({ ...quickForm, amount: values.value })
                    }
                    thousandSeparator="."
                    decimalSeparator="," 
                    decimalScale={2}
                    fixedDecimalScale
                    allowNegative={false}
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Tasa Ref.
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl font-bold text-slate-600 dark:text-slate-400 outline-none"
                    value={quickForm.rate}
                    onChange={(e) => setQuickForm({ ...quickForm, rate: e.target.value })}
                    disabled={quickForm.accountType === AccountType.DIVISA}
                  />
                </div>
              </div>

              <input
                type="text"
                placeholder="Concepto..."
                className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded text-xs text-slate-600 dark:text-slate-400 outline-none focus:bg-white dark:bg-slate-800 focus:border-indigo-500"
                value={quickForm.concept}
                onChange={(e) => setQuickForm({ ...quickForm, concept: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Referencia / N° Control (opcional)"
                className="w-full mt-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded text-xs text-slate-600 dark:text-slate-400 outline-none"
                value={quickForm.reference}
                onChange={(e) => setQuickForm({ ...quickForm, reference: e.target.value })}
              />
              <div className="mt-3">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Fecha de Operación
                </label>
                <SmartDatePicker
                  value={quickForm.date}
                  onChange={handleQuickDateSelect}
                  rateDates={rateDates}
                  inputClassName="w-full mt-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded text-xs text-slate-600 dark:text-slate-400 outline-none"
                />
                {rateHint && (
                  <div className="mt-2 text-[10px] font-semibold text-emerald-600">
                    {rateHint}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowQuickOp(false)}
                className="px-4 py-2 text-slate-500 font-bold uppercase text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-amber-500 text-slate-900 dark:text-white font-black rounded-xl hover:bg-amber-600 uppercase text-xs"
              >
                Procesar
              </button>
            </div>
          </form>
        </div>
      )}
      <WhatsAppTemplateModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        templates={messageTemplates}
        context={whatsAppContext}
        onSend={handleSendWhatsApp}
      />
    </div>
  );
};

export default CustomerViewer;
