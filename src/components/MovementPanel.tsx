import React, { useState, useEffect } from 'react';
import { AccountType, MovementType, Customer, ExchangeRates, PaymentCurrency } from '../../types';
import Autocomplete from './Autocomplete';

interface MovementPanelProps {
  title: string;
  accountType: AccountType;
  colorClass: string;
  customers: Customer[];
  inventory: any[];
  dailyRates: ExchangeRates;
  getSmartRate?: (date: string, accountType: AccountType) => Promise<number>;
  onRegister: (data: {
    date: string;
    customerName: string;
    type: MovementType;
    concept: string;
    amount: number;
    currency: PaymentCurrency;
    rate: number;
    accountType: AccountType;
    reference?: string;
  }) => void;
  onCreateCustomer?: (c: Customer) => void;
}

const MovementPanel: React.FC<MovementPanelProps> = ({
  title,
  accountType,
  colorClass,
  customers,
  dailyRates,
  getSmartRate,
  onRegister,
  onCreateCustomer,
}) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerName, setCustomerName] = useState('');
  const [creatingInline, setCreatingInline] = useState(false);
  const [newEntity, setNewEntity] = useState<{
    id: string;
    cedula?: string;
    telefonoCountry?: string;
    telefono?: string;
    direccion?: string;
  }>({ id: '', cedula: '', telefonoCountry: '+58', telefono: '', direccion: '' });
  const [type, setType] = useState<MovementType>(MovementType.FACTURA);
  const [currency, setCurrency] = useState<PaymentCurrency>(PaymentCurrency.USD);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [reference, setReference] = useState('');
  const [manualRate, setManualRate] = useState<string>('');
  const [isSuggesting, setIsSuggesting] = useState(false);

  useEffect(() => {
    let active = true;
    const resolveRate = async () => {
      if (accountType === AccountType.DIVISA) {
        setManualRate('1');
        return;
      }
      if (!getSmartRate) {
        const fallback = accountType === AccountType.BCV ? dailyRates.bcv : dailyRates.grupo;
        setManualRate(String(fallback || 1));
        return;
      }
      const rate = await getSmartRate(date, accountType);
      if (active) setManualRate(String(rate || 1));
    };
    resolveRate();
    return () => {
      active = false;
    };
  }, [date, accountType, dailyRates.bcv, dailyRates.grupo, getSmartRate]);

  const suggestAIConcept = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Ingrese un monto primero.');
      return;
    }
    setIsSuggesting(true);
    try {
      const prompt = `Sugiere una descripción profesional de máximo 4 palabras para una venta de ropa de $${amount}. Devuelve solo el texto.`;
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) throw new Error('Proxy de IA no disponible');
      const data = await response.json();
      setConcept(String(data?.result || '').trim());
    } catch (e) {
      console.error(e);
      alert('IA no disponible en este momento.');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !concept || !amount) return;

    const toNum = (v: any) => {
      const n = Number(v ?? 0);
      return Number.isFinite(n) ? n : 0;
    };
    const parsedAmount = toNum(amount);
    let usedRate =
      toNum(manualRate) ||
      (accountType === AccountType.BCV ? toNum(dailyRates.bcv) : toNum(dailyRates.grupo));
    if (usedRate === 0) usedRate = 1;

    onRegister({
      date,
      customerName,
      type,
      concept,
      amount: parsedAmount,
      currency: type === MovementType.FACTURA ? PaymentCurrency.USD : currency,
      rate: usedRate,
      accountType,
      reference: reference || null,
    });

    setCustomerName('');
    setConcept('');
    setAmount('');
    setReference('');
  };

  const inputClasses =
    'w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-sm';

  return (
    <div className="glass-panel rounded-[2rem] overflow-hidden animate-in">
      <div
        className={`px-6 py-4 ${colorClass} text-white font-black text-sm flex justify-between items-center`}
      >
        <span>{title}</span>
        <span className="text-[9px] bg-black/10 px-2 py-1 rounded-full uppercase">{type}</span>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
            Operación
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as MovementType)}
            className={inputClasses}
          >
            <option value={MovementType.FACTURA}>Generar Deuda (Factura)</option>
            <option value={MovementType.ABONO}>Registrar Pago (Abono)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
            Entidad
          </label>
          <Autocomplete
            items={customers}
            stringify={(i: any) => i.id}
            secondary={(i: any) => i.cedula || ''}
            placeholder="Seleccionar..."
            value={customerName}
            onChange={(v) => setCustomerName(v)}
            onSelect={(it: any) => setCustomerName(it.id)}
            onCreate={(label: string) => {
              setCreatingInline(true);
              setNewEntity((prev) => ({ ...prev, id: label }));
              return Promise.resolve();
            }}
          />

          {creatingInline && (
            <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
              <div className="space-y-2">
                <input
                  className="w-full p-2 bg-white dark:bg-slate-800 border-none rounded"
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
                  className="w-full p-2 rounded"
                  placeholder="Cédula / RIF"
                  value={newEntity.cedula}
                  onChange={(e) => setNewEntity({ ...newEntity, cedula: e.target.value })}
                />
                <input
                  className="w-full p-2 rounded"
                  placeholder="Dirección"
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
                    className="px-3 py-1"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const payload: Customer = {
                        id: newEntity.id.toUpperCase(),
                        cedula: newEntity.cedula || 'N/A',
                        telefono: (newEntity.telefonoCountry || '') + (newEntity.telefono || ''),
                        direccion: newEntity.direccion || '',
                      };
                      if (typeof onCreateCustomer === 'function') {
                        onCreateCustomer(payload);
                      }
                      setCustomerName(payload.id);
                      setCreatingInline(false);
                      setNewEntity({
                        id: '',
                        cedula: '',
                        telefonoCountry: '+58',
                        telefono: '',
                        direccion: '',
                      });
                    }}
                    className="px-3 py-1 bg-indigo-600 text-white rounded"
                  >
                    Crear y Seleccionar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center mb-1 px-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Concepto
            </label>
            <button
              type="button"
              onClick={suggestAIConcept}
              className="text-[8px] font-bold text-indigo-500 uppercase hover:underline"
            >
              IA Suggest
            </button>
          </div>
          <input
            type="text"
            placeholder="Descripción de la prenda o pago..."
            className={inputClasses}
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
          />
        </div>

        {type === MovementType.ABONO && (
          <div className="space-y-1">
            <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest ml-1">
              Número de Referencia
            </label>
            <input
              type="text"
              placeholder="Nro de Transferencia / Depósito"
              className={`${inputClasses} border-emerald-100 bg-emerald-50/10`}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Monto
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                className={inputClasses}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {type === MovementType.ABONO && (
                <select
                  className="absolute right-2 top-2 bottom-2 bg-slate-100 dark:bg-slate-700 border-none rounded-lg text-[10px] font-black px-2 outline-none"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as PaymentCurrency)}
                >
                  <option value={PaymentCurrency.USD}>$</option>
                  <option value={PaymentCurrency.BS}>Bs</option>
                </select>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-indigo-500 uppercase tracking-widest ml-1">
              Tasa (Ref.)
            </label>
            <input
              type="number"
              step="0.01"
              className={`${inputClasses} bg-indigo-50 dark:bg-indigo-900/10 border-indigo-100 text-indigo-700 dark:text-indigo-400`}
              value={manualRate}
              onChange={(e) => setManualRate(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          className={`w-full py-4 rounded-xl text-white font-black uppercase text-[10px] tracking-[0.2em] shadow-lg transform active:scale-95 transition-all ${colorClass}`}
        >
          Confirmar Registro
        </button>
      </form>
    </div>
  );
};

export default MovementPanel;
