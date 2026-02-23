import React, { useEffect, useState } from 'react';
import { ExchangeRates } from '../../types';
import FloatingWidgetShell from './FloatingWidgetShell';

type WidgetPosition = {
  x: number;
  y: number;
};

interface RateConverterWidgetProps {
  rates: ExchangeRates;
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
  onClose: () => void;
  onMinimize: () => void;
  onPositionChange: (position: WidgetPosition) => void;
}

const STORAGE_KEY = 'widget_converter_v1';

const parseNumber = (value: string) => {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const RateConverterWidget: React.FC<RateConverterWidgetProps> = ({
  rates,
  isOpen,
  isMinimized,
  position,
  onClose,
  onMinimize,
  onPositionChange,
}) => {
  const [usdValue, setUsdValue] = useState('0');
  const [bsValue, setBsValue] = useState('0');
  const [rateSource, setRateSource] = useState<'BCV' | 'GRUPO'>('BCV');
  const [lastEdited, setLastEdited] = useState<'USD' | 'BS'>('USD');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen || loaded) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw) as {
          usdValue: string;
          bsValue: string;
          rateSource: 'BCV' | 'GRUPO';
          lastEdited: 'USD' | 'BS';
        };
        setUsdValue(data.usdValue || '0');
        setBsValue(data.bsValue || '0');
        setRateSource(data.rateSource || 'BCV');
        setLastEdited(data.lastEdited || 'USD');
      } catch (err) {
        console.warn('Converter storage parse failed', err);
      }
    }
    setLoaded(true);
  }, [isOpen, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ usdValue, bsValue, rateSource, lastEdited })
    );
  }, [usdValue, bsValue, rateSource, lastEdited, loaded]);

  useEffect(() => {
    const rate = rateSource === 'BCV' ? rates.bcv : rates.grupo;
    if (lastEdited === 'USD') {
      const usdNum = parseNumber(usdValue);
      setBsValue((usdNum * rate).toFixed(2));
      return;
    }
    const bsNum = parseNumber(bsValue);
    setUsdValue(rate === 0 ? '0' : (bsNum / rate).toFixed(2));
  }, [rates.bcv, rates.grupo, rateSource, lastEdited]);

  return (
    <FloatingWidgetShell
      title="Rate Converter"
      subtitle="USD to BS"
      icon="fa-solid fa-arrows-rotate"
      isOpen={isOpen}
      isMinimized={isMinimized}
      position={position}
      width={320}
      onClose={onClose}
      onMinimize={onMinimize}
      onPositionChange={onPositionChange}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
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
        <span className="text-[10px] font-bold text-slate-500">Rate: {rateSource}</span>
      </div>

      <div className="mt-4 space-y-3">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
          <label className="text-[10px] uppercase font-black text-slate-400">USD</label>
          <input
            type="text"
            inputMode="decimal"
            className="mt-2 w-full bg-transparent text-2xl font-black text-slate-900 outline-none"
            value={usdValue}
            onChange={(event) => {
              setLastEdited('USD');
              setUsdValue(event.target.value);
              const rate = rateSource === 'BCV' ? rates.bcv : rates.grupo;
              const usdNum = parseNumber(event.target.value);
              setBsValue((usdNum * rate).toFixed(2));
            }}
          />
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
          <label className="text-[10px] uppercase font-black text-slate-400">BS</label>
          <input
            type="text"
            inputMode="decimal"
            className="mt-2 w-full bg-transparent text-2xl font-black text-slate-900 outline-none"
            value={bsValue}
            onChange={(event) => {
              setLastEdited('BS');
              setBsValue(event.target.value);
              const rate = rateSource === 'BCV' ? rates.bcv : rates.grupo;
              const bsNum = parseNumber(event.target.value);
              setUsdValue(rate === 0 ? '0' : (bsNum / rate).toFixed(2));
            }}
          />
        </div>
      </div>
    </FloatingWidgetShell>
  );
};

export default RateConverterWidget;
