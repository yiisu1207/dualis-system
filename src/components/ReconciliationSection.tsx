import React, { useEffect, useState, useMemo, useRef } from 'react';
import { NumericFormat } from 'react-number-format';
import { Movement, AccountType, MovementType, ReconciliationRecord } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { getReconciliationHistory, saveReconciliationRecord } from '../firebase/api';
import {
  Landmark,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  BarChart3,
} from 'lucide-react';

interface ReconciliationSectionProps {
  movements: Movement[];
  businessId: string;
  ownerId?: string;
  rates?: { bcv: number; grupo: number; lastUpdated?: string };
}

interface BankLine {
  date: string;
  description: string;
  amount: number;
  matched: boolean;
}

const ACCOUNTS = [
  { key: AccountType.BCV,    label: 'Banesco BCV',       shortLabel: 'BCV' },
  { key: AccountType.GRUPO,  label: 'Grupo Paralelo',    shortLabel: 'GRUPO' },
  { key: AccountType.DIVISA, label: 'Caja Efectivo USD', shortLabel: 'DIVISA' },
] as const;

function parseCSV(text: string): BankLine[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  const results: BankLine[] = [];
  for (const line of lines) {
    const cols = line.split(/[,;|\t]/).map(c => c.trim().replace(/"/g, ''));
    if (cols.length < 2) continue;
    const rawAmt = cols[2] || cols[cols.length - 1];
    const amount = parseFloat(rawAmt.replace(/[^\d.-]/g, ''));
    if (!isNaN(amount) && cols[0]) {
      results.push({ date: cols[0], description: cols[1] || '', amount: Math.abs(amount), matched: false });
    }
  }
  return results;
}

function exportCSV(rows: ReconciliationRecord[]) {
  const headers = ['Fecha', 'Cuenta', 'Saldo Sistema', 'Conteo Físico', 'Diferencia', 'Responsable'];
  const body = rows.map(r => [
    new Date(r.createdAt).toLocaleDateString('es-VE'),
    r.account,
    r.system.toFixed(2),
    r.physical.toFixed(2),
    r.difference.toFixed(2),
    r.userName,
  ]);
  const csv = [headers, ...body].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conciliacion_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const ReconciliationSection: React.FC<ReconciliationSectionProps> = ({
  movements,
  businessId,
  ownerId,
}) => {
  const [selectedAccount, setSelectedAccount] = useState<AccountType>(AccountType.DIVISA);
  const [physicalAmount, setPhysicalAmount] = useState('');
  const [history, setHistory] = useState<ReconciliationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterAccount, setFilterAccount] = useState<'ALL' | AccountType>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  const [showBankImport, setShowBankImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!businessId) return;
    setLoadingHistory(true);
    getReconciliationHistory(businessId, 100, ownerId)
      .then(data => setHistory(data))
      .catch(e => console.error('Error cargando conciliaciones', e))
      .finally(() => setLoadingHistory(false));
  }, [businessId, ownerId]);

  // ── System balance per account ──────────────────────────────────────────────
  const balanceByAccount = useMemo(() => {
    const result: Record<string, number> = {
      [AccountType.BCV]: 0,
      [AccountType.GRUPO]: 0,
      [AccountType.DIVISA]: 0,
    };
    movements.forEach(m => {
      if (!(m.accountType in result)) return;
      const usd = getMovementUsdAmount(m);
      if (m.movementType === MovementType.ABONO) {
        result[m.accountType] += m.isSupplierMovement ? -usd : usd;
      }
    });
    return result;
  }, [movements]);

  const systemBalance = balanceByAccount[selectedAccount] ?? 0;

  const lastRecByAccount = useMemo(() => {
    const map: Record<string, ReconciliationRecord | null> = {};
    ACCOUNTS.forEach(a => { map[a.key] = null; });
    history.forEach(h => {
      const prev = map[h.account];
      if (!prev || new Date(h.createdAt) > new Date(prev.createdAt)) {
        map[h.account] = h;
      }
    });
    return map;
  }, [history]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const lines = parseCSV(text).map(line => ({
        ...line,
        matched: movements.some(m =>
          Math.abs(getMovementUsdAmount(m) - line.amount) < 0.01 &&
          m.accountType === selectedAccount
        ),
      }));
      setBankLines(lines);
      setShowBankImport(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!physicalAmount || !businessId) return;
    const physical = parseFloat(physicalAmount);
    const record: Omit<ReconciliationRecord, 'id'> = {
      businessId,
      ownerId,
      account: selectedAccount,
      system: systemBalance,
      physical,
      difference: physical - systemBalance,
      userName: ownerId || 'Sistema',
      userId: ownerId,
      createdAt: new Date().toISOString(),
    };
    try {
      setSaving(true);
      const id = await saveReconciliationRecord(record);
      setHistory(prev => [{ id, ...record }, ...prev]);
      setPhysicalAmount('');
    } catch (e) {
      console.error('Error guardando conciliación', e);
    } finally {
      setSaving(false);
    }
  };

  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      if (filterAccount !== 'ALL' && h.account !== filterAccount) return false;
      const d = new Date(h.createdAt);
      if (dateFrom && d < new Date(`${dateFrom}T00:00:00`)) return false;
      if (dateTo && d > new Date(`${dateTo}T23:59:59`)) return false;
      return true;
    });
  }, [history, filterAccount, dateFrom, dateTo]);

  const diff = physicalAmount ? parseFloat(physicalAmount) - systemBalance : null;
  const diffOk = diff !== null && Math.abs(diff) < 0.01;
  const matchedCount = bankLines.filter(l => l.matched).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-black text-slate-900 text-2xl leading-tight">Conciliación Bancaria</h1>
          <p className="text-slate-400 text-sm mt-0.5 font-medium">Auditoría y cuadre de saldos</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="file" ref={fileRef} accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[12px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
          >
            <Upload size={13} />
            Importar Extracto
          </button>
          {history.length > 0 && (
            <button
              onClick={() => exportCSV(filteredHistory)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#4f6ef7] text-white rounded-2xl text-[12px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md shadow-blue-200"
            >
              <Download size={13} />
              Exportar
            </button>
          )}
        </div>
      </div>

      {/* Account KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        {ACCOUNTS.map(acc => {
          const bal = balanceByAccount[acc.key] ?? 0;
          const last = lastRecByAccount[acc.key];
          const lastDiff = last ? last.difference : null;
          const isActive = selectedAccount === acc.key;
          return (
            <button
              key={acc.key}
              onClick={() => setSelectedAccount(acc.key)}
              className={`rounded-3xl border p-5 text-left transition-all ${
                isActive
                  ? 'bg-[#4f6ef7] border-blue-500 text-white shadow-lg shadow-blue-200'
                  : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isActive ? 'bg-white/20' : 'bg-blue-50'}`}>
                  <Landmark size={15} className={isActive ? 'text-white' : 'text-[#4f6ef7]'} />
                </div>
                {lastDiff !== null && (
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                    Math.abs(lastDiff) < 0.01
                      ? isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                      : isActive ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {Math.abs(lastDiff) < 0.01 ? 'OK' : `Dif. ${formatCurrency(lastDiff)}`}
                  </span>
                )}
              </div>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                {acc.shortLabel}
              </p>
              <p className={`text-lg font-black leading-tight ${isActive ? 'text-white' : 'text-slate-900'}`}>
                {formatCurrency(bal)}
              </p>
              {last && (
                <p className={`text-[10px] mt-1.5 ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>
                  Última: {new Date(last.createdAt).toLocaleDateString('es-VE')}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Bank import panel */}
      {showBankImport && bankLines.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-[#4f6ef7]" />
              <span className="font-black text-slate-800 text-[14px]">Extracto Importado</span>
              <span className="ml-1 bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-lg">{matchedCount} coinciden</span>
              {bankLines.length - matchedCount > 0 && (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-lg">
                  {bankLines.length - matchedCount} sin registro
                </span>
              )}
            </div>
            <button onClick={() => { setBankLines([]); setShowBankImport(false); }}
              className="text-[11px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest">
              Cerrar
            </button>
          </div>
          <div className="overflow-x-auto max-h-56 custom-scroll">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 sticky top-0 bg-white">
                  {['Fecha', 'Descripción', 'Monto', 'Estado'].map(h => (
                    <th key={h} className="px-5 py-3 text-left font-black text-slate-400 uppercase tracking-widest text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bankLines.map((line, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="px-5 py-2.5 text-slate-500">{line.date}</td>
                    <td className="px-5 py-2.5 text-slate-700 max-w-[200px] truncate">{line.description}</td>
                    <td className="px-5 py-2.5 font-black text-slate-800">{formatCurrency(line.amount)}</td>
                    <td className="px-5 py-2.5">
                      {line.matched
                        ? <span className="flex items-center gap-1 text-emerald-600 text-[11px] font-black"><CheckCircle2 size={12} />Coincide</span>
                        : <span className="flex items-center gap-1 text-amber-600 text-[11px] font-black"><AlertTriangle size={12} />Sin registro</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Verification form */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-800 text-[15px]">Verificación de Saldo</h3>
            <span className="text-[11px] font-black uppercase tracking-widest px-3 py-1 bg-blue-50 text-[#4f6ef7] rounded-xl">
              {ACCOUNTS.find(a => a.key === selectedAccount)?.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Saldo en Sistema</p>
              <p className="text-xl font-black text-slate-900">{formatCurrency(systemBalance)}</p>
              <p className="text-[10px] text-slate-400 mt-1">Calculado de movimientos</p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#4f6ef7] mb-2">Conteo Físico</p>
              <div className="relative">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">$</span>
                <NumericFormat
                  value={physicalAmount}
                  onValueChange={v => setPhysicalAmount(v.value || '')}
                  thousandSeparator="."
                  decimalSeparator=","
                  decimalScale={2}
                  allowNegative={false}
                  className="w-full pl-5 bg-transparent border-none outline-none text-lg font-black text-slate-800 placeholder:text-slate-300"
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          {diff !== null && (
            <div className={`rounded-2xl p-5 text-center ${diffOk ? 'bg-emerald-50 border border-emerald-100' : 'bg-rose-50 border border-rose-100'}`}>
              <div className="flex items-center justify-center gap-2 mb-1">
                {diffOk
                  ? <CheckCircle2 size={16} className="text-emerald-600" />
                  : <AlertTriangle size={16} className="text-rose-600" />
                }
                <p className={`text-[10px] font-black uppercase tracking-widest ${diffOk ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {diffOk ? 'Saldos cuadrados' : 'Discrepancia detectada'}
                </p>
              </div>
              <p className={`text-3xl font-black ${diffOk ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(diff)}</p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!physicalAmount || saving}
            className="w-full py-4 bg-[#4f6ef7] text-white rounded-2xl text-[12px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md shadow-blue-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <><Clock size={14} className="animate-spin" />Guardando...</> : 'Registrar Cierre de Caja'}
          </button>
        </div>

        {/* History */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={15} className="text-slate-400" />
              <span className="font-black text-slate-800 text-[14px]">Historial de Cierres</span>
              <span className="ml-auto text-[11px] font-black text-slate-400">{filteredHistory.length} registros</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select value={filterAccount} onChange={e => setFilterAccount(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-700">
                <option value="ALL">Todas</option>
                {ACCOUNTS.map(a => <option key={a.key} value={a.key}>{a.shortLabel}</option>)}
              </select>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700" />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[340px] custom-scroll">
            {loadingHistory ? (
              <div className="py-10 text-center text-slate-400 text-[12px] font-black">Cargando historial...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
                <Landmark size={28} />
                <span className="text-[12px] font-black">Sin registros de conciliación</span>
              </div>
            ) : (
              filteredHistory.map(h => (
                <div key={h.id} className="px-6 py-4 border-b border-slate-50 flex items-center justify-between hover:bg-slate-50/60 transition-all">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">{h.account}</span>
                      <span className="text-[11px] text-slate-400">{new Date(h.createdAt).toLocaleDateString('es-VE')}</span>
                    </div>
                    <p className="text-[10px] text-slate-400">{h.userName}</p>
                  </div>
                  <div className="text-right">
                    <div className={`flex items-center gap-1 justify-end mb-0.5 ${Math.abs(h.difference) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {Math.abs(h.difference) < 0.01
                        ? <><CheckCircle2 size={12} /><span className="text-[12px] font-black">OK</span></>
                        : <><AlertTriangle size={12} /><span className="text-[12px] font-black">{formatCurrency(h.difference)}</span></>
                      }
                    </div>
                    <p className="text-[10px] text-slate-400">Sistema: {formatCurrency(h.system)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReconciliationSection;
