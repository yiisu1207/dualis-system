import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, doc, runTransaction,
  serverTimestamp, where, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRightLeft, Package, CheckCircle2, Clock, Truck, XCircle,
  Plus, Search, Filter, X, Loader2, ChevronDown, ChevronUp, Send,
  Trash2, AlertTriangle,
} from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface StockTransfer {
  id: string;
  businessId: string;
  fromAlmacenId: string;
  fromAlmacenName: string;
  toAlmacenId: string;
  toAlmacenName: string;
  items: { productId: string; productName: string; qty: number }[];
  status: 'pendiente' | 'en_transito' | 'completada' | 'cancelada';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
}

interface Almacen {
  id: string;
  nombre: string;
  activo?: boolean;
}

interface Product {
  id: string;
  nombre: string;
  codigo?: string;
  stock: number;
  stockByAlmacen?: Record<string, number>;
}

const statusConfig: Record<StockTransfer['status'], { label: string; color: string; icon: React.ElementType }> = {
  pendiente:   { label: 'Pendiente',   color: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
  en_transito: { label: 'En Tránsito', color: 'bg-blue-500/20 text-blue-400',     icon: Truck },
  completada:  { label: 'Completada',  color: 'bg-green-500/20 text-green-400',   icon: CheckCircle2 },
  cancelada:   { label: 'Cancelada',   color: 'bg-red-500/20 text-red-400',       icon: XCircle },
};

const getStockAt = (p: Product, almacenId: string): number => {
  const map = p.stockByAlmacen || {};
  if (Object.prototype.hasOwnProperty.call(map, almacenId)) return Number(map[almacenId] || 0);
  if (almacenId === 'principal') return Number(p.stock || 0);
  return 0;
};

// ─── COMPONENT ──────────────────────────────────────────────────────────────

export default function TransferenciasPanel() {
  const { userProfile } = useAuth();
  const tenantId = userProfile?.businessId;

  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [lines, setLines] = useState<{ productId: string; productName: string; qty: number }[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAlmacen, setFilterAlmacen] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ── Real-time listeners ─────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/stockTransfers`), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() } as StockTransfer)));
      setLoading(false);
    });
    return unsub;
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/almacenes`), orderBy('orden', 'asc'));
    return onSnapshot(q, snap => {
      setAlmacenes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Almacen)).filter(a => a.activo !== false));
    });
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    return onSnapshot(collection(db, `businesses/${tenantId}/products`), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });
  }, [tenantId]);

  // ── Filtered list ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = transfers;
    if (filterStatus !== 'all') list = list.filter(t => t.status === filterStatus);
    if (filterAlmacen) list = list.filter(t => t.fromAlmacenId === filterAlmacen || t.toAlmacenId === filterAlmacen);
    if (filterDateFrom) list = list.filter(t => t.createdAt >= filterDateFrom);
    if (filterDateTo) list = list.filter(t => t.createdAt <= filterDateTo + 'T23:59:59');
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(t =>
        t.fromAlmacenName.toLowerCase().includes(s) ||
        t.toAlmacenName.toLowerCase().includes(s) ||
        t.items.some(i => i.productName.toLowerCase().includes(s)) ||
        t.notes?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [transfers, filterStatus, filterAlmacen, filterDateFrom, filterDateTo, searchTerm]);

  // ── Product search results ──────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!productSearch.trim() || !origen) return [];
    const s = productSearch.toLowerCase();
    return products
      .filter(p => (p.nombre.toLowerCase().includes(s) || p.codigo?.toLowerCase().includes(s)) && getStockAt(p, origen) > 0)
      .filter(p => !lines.some(l => l.productId === p.id))
      .slice(0, 8);
  }, [productSearch, products, origen, lines]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const resetForm = () => {
    setShowForm(false);
    setOrigen('');
    setDestino('');
    setLines([]);
    setProductSearch('');
    setNotes('');
  };

  const addLine = (p: Product) => {
    setLines(prev => [...prev, { productId: p.id, productName: p.nombre, qty: 1 }]);
    setProductSearch('');
  };

  const updateLineQty = (idx: number, qty: number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: Math.max(1, qty) } : l));
  };

  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const createTransfer = async () => {
    if (!tenantId || !origen || !destino || lines.length === 0) return;
    setSaving(true);
    try {
      const origenName = almacenes.find(a => a.id === origen)?.nombre || origen;
      const destinoName = almacenes.find(a => a.id === destino)?.nombre || destino;
      await addDoc(collection(db, `businesses/${tenantId}/stockTransfers`), {
        businessId: tenantId,
        fromAlmacenId: origen,
        fromAlmacenName: origenName,
        toAlmacenId: destino,
        toAlmacenName: destinoName,
        items: lines,
        status: 'pendiente',
        createdBy: userProfile?.uid || '',
        createdByName: userProfile?.fullName || 'Admin',
        createdAt: new Date().toISOString(),
        notes: notes || null,
      });
      resetForm();
    } catch (e: any) {
      console.error('Error creating transfer:', e);
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (t: StockTransfer) => {
    if (!tenantId) return;
    const ref = doc(db, `businesses/${tenantId}/stockTransfers`, t.id);
    if (t.status === 'pendiente') {
      await runTransaction(db, async txn => { txn.update(ref, { status: 'en_transito' }); });
    } else if (t.status === 'en_transito') {
      // Complete: decrement origin, increment destination
      await runTransaction(db, async txn => {
        for (const item of t.items) {
          const pRef = doc(db, `businesses/${tenantId}/products`, item.productId);
          const pSnap = await txn.get(pRef);
          if (!pSnap.exists()) continue;
          const data = pSnap.data();
          const sba: Record<string, number> = data.stockByAlmacen || {};
          const fromQty = Number(sba[t.fromAlmacenId] || 0);
          const toQty = Number(sba[t.toAlmacenId] || 0);
          txn.update(pRef, {
            [`stockByAlmacen.${t.fromAlmacenId}`]: Math.max(0, fromQty - item.qty),
            [`stockByAlmacen.${t.toAlmacenId}`]: toQty + item.qty,
          });
        }
        txn.update(ref, {
          status: 'completada',
          completedAt: new Date().toISOString(),
          completedBy: userProfile?.fullName || 'Admin',
        });
      });
    }
  };

  const cancelTransfer = async (t: StockTransfer) => {
    if (!tenantId || (t.status !== 'pendiente' && t.status !== 'en_transito')) return;
    const ref = doc(db, `businesses/${tenantId}/stockTransfers`, t.id);
    await runTransaction(db, async txn => { txn.update(ref, { status: 'cancelada' }); });
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (!tenantId) return <div className="p-8 text-white/50">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ArrowRightLeft className="w-6 h-6 text-indigo-400" />
          <h1 className="text-xl font-bold text-white tracking-tight">Transferencias entre Almacenes</h1>
        </div>
        <button onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancelar' : 'Nueva Transferencia'}
        </button>
      </div>

      {/* ── Creation Form ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white/70 uppercase tracking-widest">Nueva Transferencia</h2>

          {/* Almacén selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-white/50 mb-1 font-semibold">Almacén Origen</label>
              <select value={origen} onChange={e => { setOrigen(e.target.value); setLines([]); }}
                className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/10 text-sm">
                <option value="">Seleccionar...</option>
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1 font-semibold">Almacén Destino</label>
              <select value={destino} onChange={e => setDestino(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/10 text-sm">
                <option value="">Seleccionar...</option>
                {almacenes.filter(a => a.id !== origen).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          </div>

          {/* Product search */}
          {origen && destino && (
            <div className="relative">
              <label className="block text-xs text-white/50 mb-1 font-semibold">Agregar Productos</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/30" />
                <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
                  placeholder="Buscar por nombre o código..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/10 text-white border border-white/10 text-sm placeholder:text-white/30" />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {searchResults.map(p => (
                    <button key={p.id} onClick={() => addLine(p)}
                      className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center justify-between text-sm">
                      <span className="text-white">{p.nombre} <span className="text-white/40">({p.codigo})</span></span>
                      <span className="text-xs text-white/40">Stock: {getStockAt(p, origen)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Lines */}
          {lines.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-white/40 font-semibold uppercase">Productos ({lines.length})</p>
              {lines.map((l, i) => {
                const prod = products.find(p => p.id === l.productId);
                const maxQty = prod ? getStockAt(prod, origen) : 999;
                return (
                  <div key={i} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                    <Package className="w-4 h-4 text-white/30 shrink-0" />
                    <span className="text-sm text-white flex-1 truncate">{l.productName}</span>
                    <input type="number" min={1} max={maxQty} value={l.qty}
                      onChange={e => updateLineQty(i, parseInt(e.target.value) || 1)}
                      className="w-20 px-2 py-1 rounded bg-white/10 text-white text-sm text-center border border-white/10" />
                    <span className="text-xs text-white/30">/ {maxQty}</span>
                    <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-300">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas (opcional)" rows={2}
            className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/10 text-sm placeholder:text-white/30 resize-none" />

          <div className="flex items-center gap-3">
            {lines.some(l => {
              const p = products.find(pr => pr.id === l.productId);
              return p && l.qty > getStockAt(p, origen);
            }) && (
              <span className="flex items-center gap-1 text-xs text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5" /> Algún producto excede el stock disponible
              </span>
            )}
            <div className="flex-1" />
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-white/50 hover:text-white text-sm">Cancelar</button>
            <button onClick={createTransfer}
              disabled={saving || !origen || !destino || lines.length === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold transition">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Crear Transferencia
            </button>
          </div>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/30" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar transferencias..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/10 text-white border border-white/10 text-sm placeholder:text-white/30" />
        </div>
        <button onClick={() => setShowFilters(f => !f)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 text-white/60 hover:text-white text-sm">
          <Filter className="w-4 h-4" /> Filtros {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10">
            <option value="all">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_transito">En Tránsito</option>
            <option value="completada">Completada</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <select value={filterAlmacen} onChange={e => setFilterAlmacen(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10">
            <option value="">Todos los almacenes</option>
            {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10" />
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10" />
          {(filterStatus !== 'all' || filterAlmacen || filterDateFrom || filterDateTo) && (
            <button onClick={() => { setFilterStatus('all'); setFilterAlmacen(''); setFilterDateFrom(''); setFilterDateTo(''); }}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
      )}

      {/* ── Transfer List ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-white/30" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <ArrowRightLeft className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay transferencias {filterStatus !== 'all' ? 'con ese filtro' : 'registradas'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const cfg = statusConfig[t.status];
            const Icon = cfg.icon;
            return (
              <div key={t.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] transition">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.color}`}>
                        <Icon className="w-3 h-3" /> {cfg.label}
                      </span>
                      <span className="text-xs text-white/30">{new Date(t.createdAt).toLocaleString('es-VE')}</span>
                    </div>
                    <p className="text-sm text-white font-semibold">
                      {t.fromAlmacenName} <ArrowRightLeft className="w-3.5 h-3.5 inline text-white/30 mx-1" /> {t.toAlmacenName}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {t.items.length} producto{t.items.length > 1 ? 's' : ''} &middot; por {t.createdByName}
                      {t.notes && <> &middot; <span className="italic">{t.notes}</span></>}
                    </p>
                    {/* Items detail */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {t.items.map((item, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 text-xs text-white/60">
                          <Package className="w-3 h-3" /> {item.productName} x{item.qty}
                        </span>
                      ))}
                    </div>
                    {t.completedAt && (
                      <p className="text-xs text-green-400/70 mt-1">Completada {new Date(t.completedAt).toLocaleString('es-VE')} por {t.completedBy}</p>
                    )}
                  </div>

                  {/* Actions */}
                  {(t.status === 'pendiente' || t.status === 'en_transito') && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => advanceStatus(t)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition">
                        {t.status === 'pendiente' ? <><Truck className="w-3.5 h-3.5" /> Despachar</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Completar</>}
                      </button>
                      <button onClick={() => cancelTransfer(t)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition">
                        <XCircle className="w-3.5 h-3.5" /> Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
