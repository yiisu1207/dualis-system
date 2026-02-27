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
  autoFocus?: boolean;
  onAfterSelect?: () => void;
  inputClassName?: string;
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
  autoFocus,
  onAfterSelect,
  inputClassName,
}: AutocompleteProps<T>) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(value || '');
  const [highlighted, setHighlighted] = useState(-1);
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

  const selectItem = (item: T) => {
    onSelect(item);
    setOpen(false);
    setHighlighted(-1);
    onAfterSelect?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown') { setOpen(true); setHighlighted(0); e.preventDefault(); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted(h => Math.min(h + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted(h => Math.max(h - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered.length > 0) {
          const idx = highlighted >= 0 ? highlighted : 0;
          selectItem(filtered[idx]);
        }
        break;
      case 'Escape':
        setOpen(false);
        setHighlighted(-1);
        break;
      case 'Tab':
        if (filtered.length > 0 && open) {
          const idx = highlighted >= 0 ? highlighted : 0;
          selectItem(filtered[idx]);
        }
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        autoFocus={autoFocus}
        className={inputClassName || 'w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-soft)] transition-all'}
        placeholder={placeholder || 'Buscar...'}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          onChange && onChange(e.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden max-h-56 overflow-y-auto">
          {filtered.map((it, idx) => (
            <button
              key={idx}
              type="button"
              className={`w-full text-left px-4 py-2.5 transition-colors ${
                idx === highlighted
                  ? 'bg-[var(--ui-soft)] text-[var(--ui-accent)]'
                  : 'hover:bg-slate-50'
              }`}
              onClick={() => selectItem(it)}
            >
              <div className={`font-bold text-sm ${idx === highlighted ? 'text-[var(--ui-accent)]' : 'text-slate-800'}`}>
                {stringify(it)}
              </div>
              {secondary && <div className="text-[11px] text-slate-400">{secondary(it)}</div>}
            </button>
          ))}

          {!exactExists && term.trim().length > 0 && onCreate && (
            <div className="p-2 border-t border-slate-100">
              <button
                type="button"
                className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-[var(--ui-soft)] text-xs font-bold text-slate-600 hover:text-[var(--ui-accent)] transition-colors"
                onClick={() => {
                  if (onChange) onChange(term);
                  onCreate(term);
                  setOpen(false);
                }}
              >
                + Crear «{term}»
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Autocomplete;
