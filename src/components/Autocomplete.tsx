import React, { useState, useEffect, useRef } from 'react';

interface AutocompleteProps<T> {
  items: T[];
  stringify: (item: T) => string;
  secondary?: (item: T) => string;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  onSelect: (item: T) => void;
  onCreate?: (label: string) => Promise<any> | any;
}

function Autocomplete<T>({
  items,
  stringify,
  secondary,
  placeholder,
  value = '',
  onChange,
  onSelect,
  onCreate,
}: AutocompleteProps<T>) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(value || '');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setTerm(value || ''), [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const filtered = items
    .filter((i) => {
      const s = stringify(i).toLowerCase();
      return (
        s.includes(term.toLowerCase()) ||
        (secondary && secondary(i).toLowerCase().includes(term.toLowerCase()))
      );
    })
    .slice(0, 8);

  const exactExists = items.some((i) => stringify(i).toLowerCase() === term.trim().toLowerCase());

  return (
    <div ref={containerRef} className="relative">
      <input
        className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-bold text-sm outline-none"
        placeholder={placeholder || 'Buscar...'}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          onChange && onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-60 overflow-y-auto">
          {filtered.map((it, idx) => (
            <button
              key={idx}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700"
              onClick={() => {
                onSelect(it);
                setOpen(false);
              }}
            >
              <div className="font-bold text-sm text-slate-800 dark:text-white">
                {stringify(it)}
              </div>
              {secondary && <div className="text-[11px] text-slate-400">{secondary(it)}</div>}
            </button>
          ))}

          {filtered.length === 0 && term.trim().length > 0 && onCreate && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900"
                onClick={() => onCreate(term)}
              >
                ¿No existe? Crear a «{term}»
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Autocomplete;
