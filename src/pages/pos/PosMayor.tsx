import React, { useMemo, useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useTenant, TenantProvider } from '../../context/TenantContext';
import { useCart, CartProvider } from '../../context/CartContext';
import { useParams } from 'react-router-dom';
import { 
  Factory, 
  Search, 
  ShoppingCart, 
  User, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Receipt, 
  Package, 
  X,
  CheckCircle2,
  AlertTriangle 
} from 'lucide-react';

type RateMode = 'bcv' | 'grupo' | 'divisas';

type QuickProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

type ClientRecord = {
  id: string;
  rif: string;
  nombre: string;
  telefono: string;
  direccion: string;
};

const RATE_MAP: Record<RateMode, number> = {
  bcv: 36.5,
  grupo: 39.0,
  divisas: 0,
};

const PosMayorContent = () => {
  const { tenantId } = useTenant();
  const { items, addProductByCode, updateQty, removeItem, totals: cartTotals, setRateValue, rateValue, clearCart } = useCart();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rateMode, setRateMode] = useState<RateMode>('bcv');
  const [customer, setCustomer] = useState<ClientRecord | null>(null);
  const [paymentCondition, setPaymentCondition] = useState('contado');
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<ClientRecord[]>([]);
  const [products, setProducts] = useState<QuickProduct[]>([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientForm, setClientForm] = useState({
    rif: '',
    nombre: '',
    telefono: '',
    direccion: '',
  });

  // Sync rate with cart context
  useEffect(() => {
    setRateValue(RATE_MAP[rateMode]);
  }, [rateMode, setRateValue]);

  // Load Products
  useEffect(() => {
    if (!tenantId) return;
    const loadProducts = async () => {
      try {
        const q = query(collection(db, `businesses/${tenantId}/products`));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || data.nombre || 'Producto sin nombre',
            price: Number(data.salePrice || data.precioDetal || data.price || 0),
            stock: Number(data.stock || 0),
          };
        });
        setProducts(list);
      } catch (err) {
        setError('Error cargando productos.');
      }
    };
    loadProducts();
  }, [tenantId]);

  // Load Clients
  useEffect(() => {
    if (!tenantId) return;
    const loadClients = async () => {
      try {
        const q = query(collection(db, 'customers'), where('businessId', '==', tenantId));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            rif: data.rif || '',
            nombre: data.nombre || data.fullName || '',
            telefono: data.telefono || '',
            direccion: data.direccion || '',
          };
        });
        setClientResults(list);
      } catch (err) {
        setError('Error cargando clientes.');
      }
    };
    loadClients();
  }, [tenantId]);

  const handleAdd = async () => {
    if (!searchQuery.trim()) return;
    const ok = await addProductByCode(searchQuery, 'mayor');
    if (!ok) {
      setError('Producto no encontrado.');
      setTimeout(() => setError(''), 2000);
      return;
    }
    setError('');
    setSearchQuery('');
  };

  const filteredClients = useMemo(() => {
    const term = clientQuery.trim().toLowerCase();
    if (!term) return clientResults;
    return clientResults.filter(
      (client) =>
        client.nombre.toLowerCase().includes(term) || client.rif.toLowerCase().includes(term)
    );
  }, [clientQuery, clientResults]);

  const saveClient = async () => {
    if (!clientForm.nombre.trim() || !clientForm.rif.trim()) return;
    if (!tenantId) return;
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        rif: clientForm.rif.trim(),
        nombre: clientForm.nombre.trim(),
        telefono: clientForm.telefono.trim(),
        direccion: clientForm.direccion.trim(),
        businessId: tenantId,
        createdAt: new Date().toISOString(),
      });
      const next: ClientRecord = {
        id: docRef.id,
        rif: clientForm.rif.trim(),
        nombre: clientForm.nombre.trim(),
        telefono: clientForm.telefono.trim(),
        direccion: clientForm.direccion.trim(),
      };
      setClientResults((prev) => [next, ...prev]);
      setCustomer(next);
      setClientQuery(next.nombre);
      setShowClientModal(false);
      setClientForm({ rif: '', nombre: '', telefono: '', direccion: '' });
      setSuccess('Cliente creado exitosamente');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError('No se pudo guardar el cliente.');
    }
  };

  const handleCharge = async () => {
    if (!customer || items.length === 0) return;
    try {
      await addDoc(collection(db, 'movements'), {
        businessId: tenantId,
        entityId: customer.id,
        concept: `Venta Mayor - ${customer.nombre}`,
        amount: cartTotals.totalUsd,
        amountInUSD: cartTotals.totalUsd,
        currency: 'USD',
        date: new Date().toISOString().split('T')[0],
        movementType: 'FACTURA',
        accountType: 'BCV',
        rateUsed: rateValue,
        items: items.map(i => ({ id: i.id, nombre: i.nombre, qty: i.qty, price: i.priceUsd })),
        paymentCondition,
        createdAt: new Date().toISOString()
      });
      clearCart();
      setCustomer(null);
      setClientQuery('');
      setSuccess('Venta registrada correctamente');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError('Error al procesar la venta');
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 text-slate-900 font-inter">
      {/* HEADER */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-200">
            <Factory size={20} />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">Terminal Mayor</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Mesa de Facturación</p>
          </div>
        </div>

        <div className="flex-1 max-w-2xl mx-10 relative">
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Buscar producto o escanear código..."
            className="w-full pl-12 pr-4 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-violet-600 focus:bg-white transition-all shadow-inner"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
        </div>

        <div className="flex items-center gap-4">
           {success && (
             <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-black animate-in fade-in slide-in-from-top-2">
               <CheckCircle2 size={14} /> {success}
             </div>
           )}
           {error && (
             <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-black animate-in fade-in slide-in-from-top-2">
               <AlertTriangle size={14} /> {error}
             </div>
           )}
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-black uppercase text-slate-300 tracking-widest">Tasa de Cambio</span>
            <span className="text-sm font-black text-slate-900">{rateValue.toFixed(2)} BS</span>
          </div>
        </div>
      </header>

      {/* CONTROLS BAR */}
      <div className="px-6 py-3 border-t border-slate-200 bg-white flex justify-between items-center shadow-sm z-20">
        <div className="flex gap-3">
          <select
            value={rateMode}
            onChange={(e) => setRateMode(e.target.value as RateMode)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-600"
          >
            <option value="bcv">Tasa BCV</option>
            <option value="grupo">Tasa Grupo</option>
            <option value="divisas">En Divisas</option>
          </select>
          <select
            value={paymentCondition}
            onChange={(e) => setPaymentCondition(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-600"
          >
            <option value="contado">Contado</option>
            <option value="credito">Crédito 15 Días</option>
            <option value="credito30">Crédito 30 Días</option>
          </select>
        </div>
        {!customer && (
          <div className="flex items-center gap-2 text-rose-500 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 animate-pulse">
            <AlertTriangle size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Seleccione un cliente</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* CATALOGO */}
        <section className="w-[30%] border-r border-slate-200 bg-slate-50 flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-white">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Catálogo</span>
            <span className="text-[10px] font-bold text-slate-300">{products.length} items</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scroll">
            <div className="grid grid-cols-1 gap-3">
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addProductByCode(product.id, 'mayor')}
                  className="group bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-violet-400 hover:shadow-md transition-all text-left flex items-center justify-between"
                >
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 mb-1">{product.id}</div>
                    <div className="text-sm font-black text-slate-800">{product.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-violet-600">${product.price.toFixed(2)}</div>
                    <div className="text-[9px] font-bold text-slate-400">Stock: {product.stock}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* CART */}
        <aside className="flex-1 flex flex-col bg-white">
          <div className="flex-1 overflow-y-auto custom-scroll">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white shadow-sm z-10 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-6 py-4 border-b border-slate-100">Producto</th>
                  <th className="px-6 py-4 border-b border-slate-100 text-center">Cant.</th>
                  <th className="px-6 py-4 border-b border-slate-100 text-right">Precio</th>
                  <th className="px-6 py-4 border-b border-slate-100 text-right">Total</th>
                  <th className="px-6 py-4 border-b border-slate-100 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-32 text-center select-none pointer-events-none">
                      <div className="inline-flex h-20 w-20 rounded-3xl bg-slate-50 items-center justify-center mb-6">
                        <ShoppingCart size={32} className="text-slate-300" />
                      </div>
                      <h3 className="text-lg font-black text-slate-300 uppercase tracking-widest mb-2">Carrito Vacío</h3>
                      <p className="text-xs text-slate-300 font-medium">Inicie una nueva orden mayorista</p>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 group transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-slate-800">{item.nombre}</p>
                        <p className="text-[10px] font-mono text-slate-400">{item.codigo}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-3">
                          <button onClick={() => updateQty(item.id, item.qty - 1)} className="h-8 w-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors"><Minus size={14} strokeWidth={3} /></button>
                          <span className="w-4 text-center text-sm font-black text-slate-900">{item.qty}</span>
                          <button onClick={() => updateQty(item.id, item.qty + 1)} className="h-8 w-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors"><Plus size={14} strokeWidth={3} /></button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-slate-500">${item.priceUsd.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right text-base font-black text-slate-900">${(item.qty * item.priceUsd).toFixed(2)}</td>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => removeItem(item.id)} className="h-8 w-8 rounded-xl bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* FOOTER */}
          <div className="border-t border-slate-200 bg-slate-50 p-6 flex gap-8">
            <div className="flex-1 space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cliente Mayorista</label>
                {customer ? (
                  <button onClick={() => { setCustomer(null); setClientQuery(''); }} className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-700">Cambiar</button>
                ) : (
                  <button onClick={() => setShowClientModal(true)} className="text-[9px] font-black uppercase text-violet-600 hover:text-violet-800">+ Nuevo</button>
                )}
              </div>
              
              {!customer ? (
                <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Search className="h-4 w-4 text-slate-400" /></div>
                   <input
                     value={clientQuery}
                     onChange={(e) => setClientQuery(e.target.value)}
                     placeholder="Buscar cliente..."
                     className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-violet-600 focus:outline-none shadow-sm"
                   />
                   {filteredClients.length > 0 && (
                      <div className="absolute bottom-full left-0 right-0 mb-2 max-h-40 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-1">
                        {filteredClients.map(c => (
                          <button key={c.id} onClick={() => { setCustomer(c); setClientQuery(''); }} className="w-full text-left px-4 py-3 hover:bg-violet-50 rounded-lg flex justify-between items-center group">
                            <div><p className="text-xs font-black text-slate-800">{c.nombre}</p><p className="text-[10px] font-bold text-slate-400">{c.rif}</p></div>
                            <CheckCircle2 size={14} className="text-violet-500 opacity-0 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                   )}
                </div>
              ) : (
                <div className="bg-white border border-violet-100 rounded-xl p-4 flex items-center gap-4 shadow-sm ring-1 ring-violet-500/20">
                  <div className="h-10 w-10 rounded-full bg-violet-600 text-white flex items-center justify-center font-black">
                    {customer.nombre.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{customer.nombre}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{customer.rif}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="w-[40%] bg-slate-900 rounded-[2rem] p-8 flex flex-col justify-between shadow-2xl text-white relative overflow-hidden group">
               <div className="absolute -right-10 -top-10 h-40 w-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors pointer-events-none"></div>
               <div>
                 <div className="flex justify-between items-start mb-1"><span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total a Pagar</span></div>
                 <div className="text-5xl font-black tracking-tight flex items-start gap-1"><span className="text-2xl mt-1 opacity-50">$</span>{cartTotals.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                 <div className="text-sm font-bold text-slate-400 mt-2">{rateMode === 'divisas' ? 'Pago en Divisas' : `${cartTotals.totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs`}</div>
               </div>
               <button
                 disabled={!customer || items.length === 0}
                 onClick={handleCharge}
                 className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${customer && items.length > 0 ? 'bg-white text-slate-900 hover:bg-violet-400 hover:text-white hover:scale-[1.02] shadow-xl' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
               >
                 <Receipt size={16} /> Procesar Pedido
               </button>
            </div>
          </div>
        </aside>
      </div>

      {showClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-8 shadow-2xl">
            <div className="text-xs font-black uppercase text-violet-500 mb-1">Nuevo Mayorista</div>
            <h3 className="text-xl font-black text-slate-900 mb-6">Registro Rápido</h3>
            <div className="space-y-4">
              {['rif', 'nombre', 'telefono', 'direccion'].map(field => (
                <div key={field}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">{field}</label>
                  <input
                    value={(clientForm as any)[field]}
                    onChange={(e) => setClientForm({ ...clientForm, [field]: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-600"
                  />
                </div>
              ))}
            </div>
            <div className="mt-8 flex gap-4">
              <button onClick={() => setShowClientModal(false)} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600">Cancelar</button>
              <button onClick={saveClient} className="flex-[2] py-3 rounded-xl bg-violet-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-violet-200 hover:bg-violet-700 transition-all">Guardar Cliente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function PosMayor() {
  const { empresa_id } = useParams();
  
  if (!empresa_id) {
    return <div className="h-screen flex items-center justify-center">Error: No se identificó la empresa.</div>;
  }

  return (
    <TenantProvider tenantId={empresa_id}>
      <CartProvider>
        <PosMayorContent />
      </CartProvider>
    </TenantProvider>
  );
}
