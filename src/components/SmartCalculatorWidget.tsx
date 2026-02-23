import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExchangeRates } from '../../types';
import FloatingWidgetShell from './FloatingWidgetShell';

type WidgetPosition = {
  x: number;
  y: number;
};

type TapeEntry = {
  id: string;
  label: string;
  value: number;
};

interface SmartCalculatorWidgetProps {
  rates: ExchangeRates;
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
  onClose: () => void;
  onMinimize: () => void;
  onPositionChange: (position: WidgetPosition) => void;
}

const STORAGE_KEY = 'smart_calc_state_v2';

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0.00';
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const SmartCalculatorWidget: React.FC<SmartCalculatorWidgetProps> = ({
  rates,
  isOpen,
  isMinimized,
  position,
  onClose,
  onMinimize,
  onPositionChange,
}) => {
  const [display, setDisplay] = useState('0');
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [operator, setOperator] = useState<'+' | '-' | '*' | '/' | null>(null);
  const [awaitingNew, setAwaitingNew] = useState(true);
  const [tape, setTape] = useState<TapeEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [inputCurrency, setInputCurrency] = useState<'USD' | 'BS'>('USD');
  const [rateSource, setRateSource] = useState<'BCV' | 'GRUPO'>('BCV');
  const [activeTab, setActiveTab] = useState<'calc' | 'cash'>('calc');
  const [tapeInput, setTapeInput] = useState('');
  const [editingTapeId, setEditingTapeId] = useState<string | null>(null);
  const [editingTapeText, setEditingTapeText] = useState('');
  const [cashCounts, setCashCounts] = useState<Record<number, number>>({
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    1: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || loaded) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw) as {
          display: string;
          accumulator: number | null;
          operator: '+' | '-' | '*' | '/' | null;
          awaitingNew: boolean;
          tape: TapeEntry[];
          inputCurrency: 'USD' | 'BS';
          rateSource: 'BCV' | 'GRUPO';
          activeTab: 'calc' | 'cash';
          tapeInput: string;
          cashCounts: Record<number, number>;
        };
        if (data.display) setDisplay(data.display);
        if (typeof data.accumulator === 'number' || data.accumulator === null) {
          setAccumulator(data.accumulator ?? null);
        }
        if (data.operator) setOperator(data.operator);
        if (typeof data.awaitingNew === 'boolean') setAwaitingNew(data.awaitingNew);
        if (Array.isArray(data.tape)) setTape(data.tape);
        if (data.inputCurrency) setInputCurrency(data.inputCurrency);
        if (data.rateSource) setRateSource(data.rateSource);
        if (data.activeTab) setActiveTab(data.activeTab);
        if (typeof data.tapeInput === 'string') setTapeInput(data.tapeInput);
        if (data.cashCounts) setCashCounts(data.cashCounts);
      } catch (err) {
        console.warn('Calculator storage parse failed', err);
      }
    }
    setLoaded(true);
  }, [isOpen, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        display,
        accumulator,
        operator,
        awaitingNew,
        tape,
        inputCurrency,
        rateSource,
        activeTab,
        tapeInput,
        cashCounts,
      })
    );
  }, [
    display,
    accumulator,
    operator,
    awaitingNew,
    tape,
    inputCurrency,
    rateSource,
    activeTab,
    tapeInput,
    cashCounts,
    loaded,
  ]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Node | null;
      if (target && containerRef.current && !containerRef.current.contains(target)) {
        return;
      }
      const key = event.key;
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        handleDigit(key);
        return;
      }
      if (key === '.') {
        event.preventDefault();
        handleDot();
        return;
      }
      if (key === '+' || key === '-' || key === '*' || key === '/') {
        event.preventDefault();
        handleOperator(key as '+' | '-' | '*' | '/');
        return;
      }
      if (key === 'Enter' || key === '=') {
        event.preventDefault();
        handleEquals();
        return;
      }
      if (key === 'Backspace') {
        event.preventDefault();
        handleBackspace();
        return;
      }
      if (key === 'Escape') {
        event.preventDefault();
        handleAllClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMinimized, display, operator, accumulator, awaitingNew]);

  const currentValue = useMemo(() => {
    const parsed = parseFloat(display.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [display]);

  const rate = rateSource === 'BCV' ? rates.bcv : rates.grupo;
  const converted = inputCurrency === 'USD' ? currentValue * rate : currentValue / (rate || 1);
  const rateLabel = rateSource === 'BCV' ? 'BCV' : 'Grupo';

  const cashTotal = useMemo(() => {
    return Object.entries(cashCounts).reduce((sum, [denom, count]) => {
      return sum + Number(denom) * (Number(count) || 0);
    }, 0);
  }, [cashCounts]);

  const pushTape = (label: string, value: number) => {
    const entry: TapeEntry = { id: createId(), label, value };
    setTape((prev) => [entry, ...prev].slice(0, 10));
  };

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch (err) {
      console.warn('Clipboard failed', err);
    }
  };

  const setDisplayValue = (value: string) => {
    const normalized = value.replace(/[^0-9.\-]/g, '');
    if (normalized === '' || normalized === '-') {
      setDisplay('0');
      return;
    }
    setDisplay(normalized);
  };

  const handleDigit = (digit: string) => {
    if (awaitingNew) {
      setDisplay(digit);
      setAwaitingNew(false);
      return;
    }
    setDisplay((prev) => (prev === '0' ? digit : `${prev}${digit}`));
  };

  const handleDot = () => {
    if (awaitingNew) {
      setDisplay('0.');
      setAwaitingNew(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay((prev) => `${prev}.`);
    }
  };

  const handleBackspace = () => {
    if (awaitingNew) {
      setDisplay('0');
      return;
    }
    setDisplay((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  };

  const compute = (a: number, b: number, op: '+' | '-' | '*' | '/') => {
    switch (op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '/':
        return b === 0 ? 0 : a / b;
      default:
        return b;
    }
  };

  const handleOperator = (nextOp: '+' | '-' | '*' | '/') => {
    if (accumulator === null) {
      setAccumulator(currentValue);
      setOperator(nextOp);
      setAwaitingNew(true);
      return;
    }

    if (!awaitingNew && operator) {
      const result = compute(accumulator, currentValue, operator);
      setAccumulator(result);
      setDisplay(result.toString());
    }

    setOperator(nextOp);
    setAwaitingNew(true);
  };

  const handleEquals = () => {
    if (operator === null || accumulator === null) return;
    if (awaitingNew) return;
    const result = compute(accumulator, currentValue, operator);
    pushTape(`${formatNumber(accumulator)} ${operator} ${formatNumber(currentValue)} =`, result);
    setDisplay(result.toString());
    setAccumulator(null);
    setOperator(null);
    setAwaitingNew(true);
  };

  const handleClear = () => {
    setDisplay('0');
    setAwaitingNew(true);
  };

  const handleAllClear = () => {
    setDisplay('0');
    setAccumulator(null);
    setOperator(null);
    setAwaitingNew(true);
  };

  const applyPercent = (label: string, multiplier: number) => {
    const base = currentValue;
    const result = base * multiplier;
    pushTape(`${formatNumber(base)} ${label} =`, result);
    setDisplay(result.toString());
    setAccumulator(null);
    setOperator(null);
    setAwaitingNew(true);
  };

  const handleAddTape = () => {
    const label = tapeInput.trim() || 'Manual entry';
    pushTape(label, currentValue);
    setTapeInput('');
  };

  const handleDeleteTape = (id: string) => {
    setTape((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleEditTape = (entry: TapeEntry) => {
    setEditingTapeId(entry.id);
    setEditingTapeText(entry.label);
  };

  const handleSaveTape = () => {
    if (!editingTapeId) return;
    setTape((prev) =>
      prev.map((entry) =>
        entry.id === editingTapeId ? { ...entry, label: editingTapeText.trim() || entry.label } : entry
      )
    );
    setEditingTapeId(null);
    setEditingTapeText('');
  };

  if (!isOpen) return null;

  return (
    <div ref={containerRef}>
      <FloatingWidgetShell
        title="Smart Calculator"
        subtitle="Live rates"
        icon="fa-solid fa-calculator"
        isOpen={isOpen}
        isMinimized={isMinimized}
        position={position}
        width={360}
        onClose={onClose}
        onMinimize={onMinimize}
        onPositionChange={onPositionChange}
      >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('calc')}
            className={`px-3 py-1 rounded-lg text-[10px] font-black ${
              activeTab === 'calc' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Calc
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cash')}
            className={`px-3 py-1 rounded-lg text-[10px] font-black ${
              activeTab === 'cash' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Cash
          </button>
        </div>
        {copied && <span className="text-[10px] text-emerald-500">Copied</span>}
      </div>

      {activeTab === 'calc' ? (
        <>
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-black text-slate-400">Tape</p>
            </div>
            <div className="mt-2 space-y-1 max-h-28 overflow-y-auto pr-1">
              {tape.length === 0 && (
                <div className="text-[10px] text-slate-400">No tape yet.</div>
              )}
              {tape.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyValue(entry.value.toString())}
                    className="flex-1 text-left text-[11px] text-slate-600 hover:text-slate-900"
                  >
                    {entry.label}{' '}
                    <span className="font-black text-slate-900">{formatNumber(entry.value)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditTape(entry)}
                    className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                    title="Edit"
                  >
                    <i className="fa-solid fa-pen"></i>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTape(entry.id)}
                    className="w-7 h-7 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100"
                    title="Delete"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              ))}
            </div>
            {editingTapeId && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  value={editingTapeText}
                  onChange={(event) => setEditingTapeText(event.target.value)}
                />
                <button
                  type="button"
                  onClick={handleSaveTape}
                  className="px-2 py-1 rounded-lg bg-slate-900 text-white text-xs font-black"
                >
                  Save
                </button>
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                placeholder="Tape note"
                value={tapeInput}
                onChange={(event) => setTapeInput(event.target.value)}
              />
              <button
                type="button"
                onClick={handleAddTape}
                className="px-3 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-black"
              >
                Add
              </button>
            </div>
          </div>

          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInputCurrency((prev) => (prev === 'USD' ? 'BS' : 'USD'))}
                  className="px-2 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-black"
                >
                  {'Bs <-> $'}
                </button>
                <span className="uppercase font-bold">Input: {inputCurrency === 'USD' ? '$' : 'Bs'}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setRateSource('BCV')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                    rateSource === 'BCV'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  BCV
                </button>
                <button
                  type="button"
                  onClick={() => setRateSource('GRUPO')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                    rateSource === 'GRUPO'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  Grupo
                </button>
              </div>
            </div>

            <input
              data-calc-input
              type="text"
              inputMode="decimal"
              className="mt-2 w-full bg-transparent text-right text-3xl font-black text-slate-900 outline-none"
              value={display}
              onChange={(event) => setDisplayValue(event.target.value)}
              onFocus={() => setAwaitingNew(false)}
              onClick={() => copyValue(display)}
              title="Click to copy"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {inputCurrency === 'USD'
                ? `Converted: ${formatNumber(converted)} Bs @ ${rateLabel}`
                : `Converted: ${formatNumber(converted)} $ @ ${rateLabel}`}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => applyPercent('+ IVA 16%', 1.16)}
              className="py-2 rounded-xl bg-indigo-600 text-white text-[11px] font-black"
            >
              + IVA
            </button>
            <button
              type="button"
              onClick={() => applyPercent('- IVA 16%', 1 / 1.16)}
              className="py-2 rounded-xl bg-indigo-100 text-indigo-700 text-[11px] font-black"
            >
              - IVA
            </button>
            <button
              type="button"
              onClick={() => applyPercent('IGTF 3%', 1.03)}
              className="py-2 rounded-xl bg-amber-500 text-white text-[11px] font-black"
            >
              IGTF 3%
            </button>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {['AC', 'C', 'BK', '/'].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (label === 'AC') handleAllClear();
                  if (label === 'C') handleClear();
                  if (label === 'BK') handleBackspace();
                  if (label === '/') handleOperator('/');
                }}
                className="py-2 rounded-xl bg-slate-100 text-slate-700 text-[12px] font-black"
              >
                {label}
              </button>
            ))}
            {['7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+'].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (['+', '-', '*'].includes(label)) {
                    handleOperator(label as '+' | '-' | '*');
                    return;
                  }
                  handleDigit(label);
                }}
                className={`py-2 rounded-xl text-[12px] font-black ${
                  ['+', '-', '*'].includes(label)
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {label === '*' ? 'x' : label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="col-span-2 py-2 rounded-xl bg-white border border-slate-200 text-[12px] font-black text-slate-700"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDot}
              className="py-2 rounded-xl bg-white border border-slate-200 text-[12px] font-black text-slate-700"
            >
              .
            </button>
            <button
              type="button"
              onClick={handleEquals}
              className="py-2 rounded-xl bg-emerald-500 text-white text-[12px] font-black"
            >
              =
            </button>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase font-black text-slate-400">Cash Counter</p>
            <span className="text-sm font-black text-slate-900">${formatNumber(cashTotal)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[100, 50, 20, 10, 5, 1].map((denom) => (
              <div
                key={denom}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <span className="text-xs font-bold text-slate-500">${denom}</span>
                <input
                  type="number"
                  min="0"
                  className="w-16 text-right text-sm font-black text-slate-800 outline-none"
                  value={cashCounts[denom] ?? 0}
                  onChange={(event) =>
                    setCashCounts((prev) => ({
                      ...prev,
                      [denom]: Number(event.target.value) || 0,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
      </FloatingWidgetShell>
    </div>
  );
};

export default SmartCalculatorWidget;
