import React, { useState, useMemo } from 'react';
import { X, Building2, Hash, Phone, Tag, AlertTriangle } from 'lucide-react';
import type { Supplier } from '../../../types';

interface NewSupplierModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Supplier>) => Promise<void>;
  existingSuppliers: Supplier[];
}

const CATEGORIES = ['Fábrica', 'Distribuidor', 'Materia Prima', 'Servicios', 'Importador', 'Transporte', 'Tecnología', 'Otro'];

export default function NewSupplierModal({ open, onClose, onSave, existingSuppliers }: NewSupplierModalProps) {
  const [name, setName] = useState('');
  const [rif, setRif] = useState('');
  const [contacto, setContacto] = useState('');
  const [categoria, setCategoria] = useState('Fábrica');
  const [saving, setSaving] = useState(false);

  const duplicateByRif = useMemo(() => {
    if (!rif || rif.length < 3) return null;
    return existingSuppliers.find(s => s.rif && s.rif.toLowerCase() === rif.toLowerCase());
  }, [rif, existingSuppliers]);

  const duplicateByName = useMemo(() => {
    if (!name || name.length < 3) return null;
    return existingSuppliers.find(s => s.id && s.id.toLowerCase() === name.trim().toUpperCase());
  }, [name, existingSuppliers]);

  const rifValid = !rif.trim() || /^[VJEGvjeg]\d{7,9}$/.test(rif.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rifValid || duplicateByRif) return;
    setSaving(true);
    try {
      await onSave({
        id: name.trim().toUpperCase(),
        rif: rif.trim(),
        contacto: contacto.trim(),
        categoria,
      });
      setName('');
      setRif('');
      setContacto('');
      setCategoria('Fábrica');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/5 dark:to-orange-500/5">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-amber-500" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Nuevo Proveedor</h3>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-all">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5 block">Nombre del proveedor *</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: DISTRIBUIDORA LOS ANDES"
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/40 uppercase"
            />
            {duplicateByName && (
              <div className="flex items-center gap-1.5 mt-1.5 text-amber-500">
                <AlertTriangle size={11} />
                <p className="text-[10px] font-bold">Ya existe un proveedor con este nombre</p>
              </div>
            )}
          </div>

          {/* RIF */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5 block flex items-center gap-1.5"><Hash size={10} /> RIF</label>
            <input
              value={rif}
              onChange={e => setRif(e.target.value)}
              placeholder="J-12345678-9"
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            {duplicateByRif && (
              <div className="flex items-center gap-1.5 mt-1.5 text-rose-500">
                <AlertTriangle size={11} />
                <p className="text-[10px] font-bold">RIF ya registrado: {duplicateByRif.id}</p>
              </div>
            )}
            {rif.trim() && !rifValid && (
              <p className="text-[10px] font-bold text-rose-400 mt-1">Formato: V/J/E/G + 7-9 dígitos (ej: J123456789)</p>
            )}
          </div>

          {/* Contacto */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5 block flex items-center gap-1.5"><Phone size={10} /> Contacto</label>
            <input
              value={contacto}
              onChange={e => setContacto(e.target.value)}
              placeholder="Teléfono o persona de contacto"
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>

          {/* Categoría */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5 block flex items-center gap-1.5"><Tag size={10} /> Categoría</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoria(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                    categoria === cat
                      ? 'bg-amber-100 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/30 text-amber-600 dark:text-amber-400'
                      : 'bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.06] text-slate-400 dark:text-white/30 hover:bg-slate-50 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] text-xs font-black text-slate-500 dark:text-white/40 uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-black uppercase tracking-widest shadow-md shadow-amber-500/25 hover:opacity-90 transition-all disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Crear Proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
