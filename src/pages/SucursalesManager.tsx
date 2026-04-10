import React, { useState, useEffect } from 'react';
import {
  MapPin, Plus, Edit2, Trash2, Building2, Users, Package,
  ToggleLeft, ToggleRight, Phone, User, Check, X, ChevronRight,
  Loader2, ArrowLeftRight, AlertTriangle, Share2, Lock,
} from 'lucide-react';
import { db } from '../firebase/config';
import {
  collection, addDoc, updateDoc, deleteDoc, onSnapshot,
  doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useTenantSafe } from '../context/TenantContext';
import { logAudit } from '../utils/auditLogger';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Sucursal {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  encargado: string;
  activa: boolean;
  inventarioCompartido: boolean; // true = comparte stock con casa matriz, false = stock independiente
  creadaEn: any;
}

const EMPTY: Omit<Sucursal, 'id' | 'creadaEn'> = {
  nombre: '',
  direccion: '',
  telefono: '',
  encargado: '',
  activa: true,
  inventarioCompartido: false,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SucursalesManager() {
  const { tenantId } = useTenantSafe();
  const { user } = useAuth();
  const businessId = tenantId;

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Subscribe ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!businessId) return;
    const q = query(
      collection(db, 'businesses', businessId, 'sucursales'),
      orderBy('creadaEn', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setSucursales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sucursal)));
      setLoading(false);
    });
    return unsub;
  }, [businessId]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY });
    setModalOpen(true);
  };

  const openEdit = (s: Sucursal) => {
    setEditingId(s.id);
    setForm({
      nombre: s.nombre,
      direccion: s.direccion,
      telefono: s.telefono,
      encargado: s.encargado,
      activa: s.activa,
      inventarioCompartido: s.inventarioCompartido,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      const ref = collection(db, 'businesses', businessId, 'sucursales');
      if (editingId) {
        await updateDoc(doc(ref, editingId), { ...form });
        await logAudit(businessId, user?.uid ?? '', 'EDITAR', 'sucursal', `Actualizar sucursal: ${form.nombre}`);
      } else {
        await addDoc(ref, { ...form, creadaEn: serverTimestamp() });
        await logAudit(businessId, user?.uid ?? '', 'CREAR', 'sucursal', `Crear sucursal: ${form.nombre}`);
      }
      setModalOpen(false);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'businesses', businessId, 'sucursales', id));
      await logAudit(businessId, user?.uid ?? '', 'ELIMINAR', 'sucursal', `Eliminar sucursal id: ${id}`);
      setDeleteConfirm(null);
    } catch (e) {
      console.error(e);
    }
    setDeleting(false);
  };

  const toggleActive = async (s: Sucursal) => {
    await updateDoc(doc(db, 'businesses', businessId, 'sucursales', s.id), { activa: !s.activa });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 min-h-full bg-slate-50 dark:bg-[#070b14]">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Sucursales</h1>
          <p className="text-sm text-slate-500 dark:text-white/30 mt-1">Gestiona los puntos de venta y almacenes de tu negocio</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:-translate-y-0.5 active:scale-95"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 4px 20px -5px rgba(99,102,241,.45)' }}
        >
          <Plus size={16} /> Nueva Sucursal
        </button>
      </div>

      {/* Inventory mode info banner */}
      <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Modo de Inventario por Sucursal</p>
          <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-0.5 leading-relaxed">
            Cada sucursal puede tener <strong>stock independiente</strong> (maneja su propio inventario) o <strong>stock compartido</strong> (comparte el inventario de la casa matriz).
            Configura esto al crear o editar cada sucursal.
          </p>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-indigo-400" />
        </div>
      ) : sucursales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Building2 size={28} className="text-indigo-400" />
          </div>
          <p className="text-slate-500 dark:text-white/30 font-medium text-sm">Sin sucursales registradas</p>
          <button
            onClick={openNew}
            className="text-xs font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            + Crear primera sucursal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sucursales.map(s => (
            <div
              key={s.id}
              className={`relative rounded-2xl border bg-white dark:bg-[#0d1424] shadow-lg shadow-black/10 transition-all duration-200 ${
                s.activa
                  ? 'border-slate-100 dark:border-white/[0.07]'
                  : 'border-slate-100 dark:border-white/[0.04] opacity-50'
              }`}
            >
              {/* Status pill */}
              <div className={`absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                s.activa ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-white/[0.06] text-slate-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.activa ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                {s.activa ? 'Activa' : 'Inactiva'}
              </div>

              <div className="p-5">
                {/* Icon + name */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <MapPin size={18} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 dark:text-white text-base tracking-tight">{s.nombre}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 mb-4">
                  {s.direccion && (
                    <div className="flex items-start gap-2">
                      <MapPin size={12} className="text-slate-400 dark:text-white/25 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-500 dark:text-white/35 leading-snug">{s.direccion}</p>
                    </div>
                  )}
                  {s.telefono && (
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-slate-400 dark:text-white/25 shrink-0" />
                      <p className="text-xs text-slate-500 dark:text-white/35">{s.telefono}</p>
                    </div>
                  )}
                  {s.encargado && (
                    <div className="flex items-center gap-2">
                      <User size={12} className="text-slate-400 dark:text-white/25 shrink-0" />
                      <p className="text-xs text-slate-500 dark:text-white/35">{s.encargado}</p>
                    </div>
                  )}
                </div>

                {/* Inventory mode badge */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold mb-4 ${
                  s.inventarioCompartido
                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                    : 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20'
                }`}>
                  {s.inventarioCompartido
                    ? <><Share2 size={12} /> Stock compartido con casa matriz</>
                    : <><Lock size={12} /> Stock independiente</>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-white/[0.05]">
                  <button
                    onClick={() => openEdit(s)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all"
                  >
                    <Edit2 size={13} /> Editar
                  </button>
                  <button
                    onClick={() => toggleActive(s)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      s.activa
                        ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                        : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                    }`}
                  >
                    {s.activa ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                    {s.activa ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(s.id)}
                    className="flex items-center justify-center p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Add card */}
          <button
            onClick={openNew}
            className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/[0.07] bg-transparent hover:border-indigo-400/40 hover:bg-indigo-500/[0.04] transition-all flex flex-col items-center justify-center gap-3 p-8 min-h-[200px] group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/[0.05] group-hover:bg-indigo-500/10 flex items-center justify-center transition-all">
              <Plus size={20} className="text-slate-400 group-hover:text-indigo-400 transition-colors" />
            </div>
            <p className="text-sm font-bold text-slate-400 group-hover:text-indigo-400 transition-colors">Agregar sucursal</p>
          </button>
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 border border-slate-100 dark:border-white/[0.07]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
                  <Building2 size={17} className="text-indigo-400" />
                </div>
                <h2 className="font-black text-slate-900 dark:text-white text-base">
                  {editingId ? 'Editar Sucursal' : 'Nueva Sucursal'}
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5">
                  Nombre *
                </label>
                <input
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Sucursal Centro"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>

              {/* Dirección */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5">
                  Dirección
                </label>
                <input
                  value={form.direccion}
                  onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                  placeholder="Ej: Av. Libertador, Caracas"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>

              {/* Teléfono + Encargado side-by-side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5">
                    Teléfono
                  </label>
                  <input
                    value={form.telefono}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="+58 412 ..."
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5">
                    Encargado
                  </label>
                  <input
                    value={form.encargado}
                    onChange={e => setForm(f => ({ ...f, encargado: e.target.value }))}
                    placeholder="Nombre del encargado"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
              </div>

              {/* Inventory mode */}
              <div className="rounded-2xl border border-slate-100 dark:border-white/[0.07] p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-white/30 mb-3">
                  Modo de Inventario
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, inventarioCompartido: false }))}
                    className={`flex flex-col gap-1.5 p-4 rounded-xl border text-left transition-all ${
                      !form.inventarioCompartido
                        ? 'border-violet-500/40 bg-violet-500/10'
                        : 'border-slate-200 dark:border-white/[0.07] hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Lock size={14} className={!form.inventarioCompartido ? 'text-violet-400' : 'text-slate-400 dark:text-white/25'} />
                      {!form.inventarioCompartido && <Check size={12} className="text-violet-400" />}
                    </div>
                    <p className={`text-xs font-black ${!form.inventarioCompartido ? 'text-violet-700 dark:text-violet-400' : 'text-slate-500 dark:text-white/30'}`}>
                      Independiente
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-white/20 leading-snug">
                      Maneja su propio stock separado
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, inventarioCompartido: true }))}
                    className={`flex flex-col gap-1.5 p-4 rounded-xl border text-left transition-all ${
                      form.inventarioCompartido
                        ? 'border-sky-500/40 bg-sky-500/10'
                        : 'border-slate-200 dark:border-white/[0.07] hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Share2 size={14} className={form.inventarioCompartido ? 'text-sky-400' : 'text-slate-400 dark:text-white/25'} />
                      {form.inventarioCompartido && <Check size={12} className="text-sky-400" />}
                    </div>
                    <p className={`text-xs font-black ${form.inventarioCompartido ? 'text-sky-700 dark:text-sky-400' : 'text-slate-500 dark:text-white/30'}`}>
                      Compartido
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-white/20 leading-snug">
                      Comparte stock con casa matriz
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 pb-6">
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.nombre.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {editingId ? 'Guardar cambios' : 'Crear sucursal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 border border-slate-100 dark:border-white/[0.07] p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 size={18} className="text-rose-400" />
              </div>
              <h3 className="font-black text-slate-900 dark:text-white text-base">Eliminar sucursal</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-white/30 mb-6 leading-relaxed">
              Esta acción es permanente. Los datos de ventas e inventario asociados no se eliminarán.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-white/40 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 transition-all disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
