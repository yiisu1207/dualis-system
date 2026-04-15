import React, { useState, useEffect, useCallback } from 'react';
import { NumericFormat } from 'react-number-format';
import { Plus, X } from 'lucide-react';
import type { DraftAbono } from '../../utils/bankReconciliation';

interface AbonoFormProps {
  value: DraftAbono;
  onChange: (v: DraftAbono) => void;
  onSubmit: () => void;
  onClear?: () => void;
  selectedMatchInfo?: string | null; // "Banesco Principal · $150 · 14-abr" si hay match seleccionado
  duplicateWarning?: string | null;  // "Ya existe abono #3 con estos datos"
  editingId?: string | null;
}

export default function AbonoForm({ value, onChange, onSubmit, onClear, selectedMatchInfo, duplicateWarning, editingId }: AbonoFormProps) {
  const [amountStr, setAmountStr] = useState<string>(value.amount ? String(value.amount) : '');

  useEffect(() => {
    setAmountStr(value.amount ? String(value.amount) : '');
  }, [value.amount, editingId]);

  const canSubmit = Number.isFinite(value.amount) && value.amount > 0 && !!value.date;

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }, [canSubmit, onSubmit]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" onKeyDown={handleKey}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">
          {editingId ? 'Editando abono' : 'Nuevo abono'}
        </h3>
        {editingId && onClear && (
          <button
            onClick={onClear}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
          >
            <X size={12} /> Cancelar edición
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Monto USD *</span>
          <NumericFormat
            value={amountStr}
            onValueChange={(v) => {
              setAmountStr(v.value);
              onChange({ ...value, amount: parseFloat(v.value) || 0 });
            }}
            thousandSeparator=","
            decimalSeparator="."
            decimalScale={2}
            allowNegative={false}
            placeholder="0.00"
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
            autoFocus
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Fecha *</span>
          <input
            type="date"
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">Tipo (opcional)</span>
        <select
          value={value.operationType || ''}
          onChange={(e) => onChange({ ...value, operationType: e.target.value ? (e.target.value as DraftAbono['operationType']) : undefined })}
          className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
        >
          <option value="">— Cualquiera</option>
          <option value="pago_movil">Pago móvil</option>
          <option value="transferencia">Transferencia</option>
          <option value="deposito">Depósito</option>
          <option value="punto_venta">Punto de venta</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Cliente</span>
          <input
            type="text"
            value={value.clientName || ''}
            onChange={(e) => onChange({ ...value, clientName: e.target.value || undefined })}
            placeholder="Nombre"
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Referencia</span>
          <input
            type="text"
            value={value.reference || ''}
            onChange={(e) => onChange({ ...value, reference: e.target.value || undefined })}
            placeholder="123456"
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Cédula</span>
          <input
            type="text"
            value={value.cedula || ''}
            onChange={(e) => onChange({ ...value, cedula: e.target.value || undefined })}
            placeholder="V-12345678"
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Teléfono</span>
          <input
            type="text"
            value={value.phone || ''}
            onChange={(e) => onChange({ ...value, phone: e.target.value || undefined })}
            placeholder="0414-1234567"
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">Nota</span>
        <input
          type="text"
          value={value.note || ''}
          onChange={(e) => onChange({ ...value, note: e.target.value || undefined })}
          placeholder="Opcional"
          className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
        />
      </label>

      {selectedMatchInfo && (
        <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
          ✓ Conciliar contra: <span className="font-medium">{selectedMatchInfo}</span>
        </div>
      )}

      {duplicateWarning && (
        <div className="text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2">
          ⚠ {duplicateWarning}
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={onSubmit}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Plus size={16} /> {editingId ? 'Guardar cambios' : 'Agregar abono'}
      </button>
      <p className="text-[11px] text-slate-400 text-center">Ctrl/Cmd+Enter para agregar rápido</p>
    </div>
  );
}
