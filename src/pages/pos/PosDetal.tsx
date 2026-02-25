import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useCart, CartProvider } from '../../context/CartContext';
import { useRates } from '../../context/RatesContext';
import { collection, getDocs, query, where, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { TenantProvider } from '../../context/TenantContext'; // Ensure Tenant context is available
import { 
  Scan, 
  ShoppingCart, 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  Receipt, 
  Package, 
  CheckCircle2,
  AlertTriangle,
  LogOut,
  FileText
} from 'lucide-react';
import ReceiptModal from '../../components/ReceiptModal';

type QuickProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  codigo: string;
  marca?: string;
};

// Internal component to use cart context
const PosContent = () => {
  const [searchParams] = useSearchParams();
  const { empresa_id } = useParams();
  const cajaId = searchParams.get('cajaId');
  const { userProfile } = useAuth();
  const { rates } = useRates();
  
  const { items, addProductByCode, updateQty, removeItem, totals, rateValue, setRateValue, clearCart } = useCart();
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [clientQuery, setClientQuery] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [products, setProducts] = useState<QuickProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastMovement, setLastMovement] = useState<any>(null);

  // Sync rates context with cart context
  useEffect(() => {
    if (rates.tasaBCV > 0) {
      setRateValue(rates.tasaBCV);
    }
  }, [rates.tasaBCV, setRateValue]);

  // 1. Cargar Productos
  useEffect(() => {
    if (!empresa_id) return;
    
    const loadData = async () => {
      try {
        // Productos
        const q = query(collection(db, `businesses/${empresa_id}/products`), where('stock', '>', 0));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || data.nombre || 'Sin nombre',
            price: Number(data.precioDetal || data.marketPrice || data.precioVenta || data.salePrice || data.price || 0),
            stock: Number(data.stock || 0),
            codigo: data.codigo || d.id,
            marca: data.marca || ''
          };
        });
        setProducts(list.slice(0, 12)); // Mostrar solo los primeros 12 en el grid rápido

        // Clientes
        const qc = query(collection(db, 'customers'), where('businessId', '==', empresa_id));
        const snapC = await getDocs(qc);
        setClients(snapC.docs.map(d => ({ id: d.id, ...d.data() })));
        
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError('Error cargando datos de la empresa');
        setLoading(false);
      }
    };
    
    loadData();
  }, [empresa_id]);

  const filteredClients = useMemo(() => {
    const term = clientQuery.toLowerCase();
    if (!term) return [];
    return clients.filter(c => 
      (c.fullName || c.nombre || c.id || '').toLowerCase().includes(term) || 
      (c.rif || c.cedula || '').toLowerCase().includes(term)
    );
  }, [clientQuery, clients]);

  const handleAddProduct = async (product: QuickProduct) => {
    setError('');
    const ok = await addProductByCode(product.codigo, 'detal');
    if (!ok) {
      setError(`No se pudo añadir: ${product.name}`);
      setTimeout(() => setError(''), 2000);
    }
  };

  const handleAdd = async () => {
    const code = searchQuery.trim();
    if (!code) return;
    setError('');
    const ok = await addProductByCode(code, 'detal');
    if (ok) {
      setSearchQuery('');
    } else {
      setError(`Producto no encontrado: ${code}`);
      setTimeout(() => setError(''), 2000);
    }
  };

  const handleCharge = async () => {
    if (!customer) {
      setError('Seleccione un cliente para facturar');
      return;
    }
    if (items.length === 0) {
      setError('El carrito está vacío');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const batchDate = new Date().toISOString();
      const simpleDate = batchDate.split('T')[0];

      // 1. Registrar el movimiento (Factura)
      const movementPayload = {
        businessId: empresa_id,
        entityId: customer.id,
        concept: `Venta POS - Caja ${cajaId || 'Principal'}`,
        amount: totals.totalUsd,
        originalAmount: totals.totalBs,
        amountInUSD: totals.totalUsd,
        currency: 'USD',
        date: simpleDate,
        createdAt: batchDate,
        movementType: 'FACTURA',
        accountType: 'BCV',
        rateUsed: rateValue,
        items: items.map(i => ({ 
          id: i.id, 
          nombre: i.nombre, 
          qty: i.qty, 
          price: i.priceUsd,
          subtotal: i.qty * i.priceUsd
        })),
        cajaId: cajaId || 'principal',
        vendedorId: userProfile?.uid || 'sistema',
        vendedorNombre: userProfile?.fullName || 'Vendedor'
      };

      await addDoc(collection(db, 'movements'), movementPayload);

      // 2. Actualizar stock y estadísticas de terminal
      for (const item of items) {
        const pRef = doc(db, `businesses/${empresa_id}/products`, item.id);
        await updateDoc(pRef, { 
          stock: increment(-item.qty) 
        });
      }

      if (cajaId) {
        const cRef = doc(db, `businesses/${empresa_id}/terminals`, cajaId);
        await updateDoc(cRef, {
          totalFacturado: increment(totals.totalUsd),
          movimientos: increment(1),
          ultimaVenta: batchDate
        });
      }

      setLastMovement(movementPayload);
      setSuccess('¡Venta procesada y stock actualizado!');
      clearCart();
      setCustomer(null);
      setClientQuery('');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      console.error("Error en cobro:", err);
      setError('Error crítico al procesar la venta');
    } finally {
      setLoading(false);
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 font-black uppercase tracking-widest text-slate-400 gap-4">
        <div className="animate-spin h-10 w-10 border-4 border-slate-900 border-t-transparent rounded-full"></div>
        Cargando Terminal...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 text-slate-900 font-inter">
      {/* HEADER POS */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-200">
            <Scan size={20} />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">Terminal Detal</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Caja: {cajaId || 'PRINCIPAL'}</p>
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
            placeholder="Escanear código de barras o escribir SKU..."
            className="w-full pl-12 pr-4 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all shadow-inner"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
        </div>

        <div className="flex items-center gap-4">
           <button 
             onClick={() => auth.signOut()}
             className="h-10 w-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all border border-rose-100"
             title="Cerrar Sesión"
           >
             <LogOut size={18} />
           </button>
           <div className="w-px h-8 bg-slate-200 mx-1"></div>
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
            <span className="text-sm font-black text-slate-900">{rates.tasaBCV.toFixed(2)} BS</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        {/* GRID PRODUCTOS */}
        <section className="w-[35%] bg-white border-r border-slate-200 flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Acceso Rápido</span>
            <span className="text-[10px] font-bold text-slate-300">{products.length} productos</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scroll bg-slate-50/50">
            {products.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                <Package size={48} className="text-slate-300 mb-4" />
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Sin productos</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {products.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleAddProduct(product)}
                    className="group bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-300 hover:-translate-y-1 transition-all text-left flex flex-col h-32 justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                         <div className="h-8 w-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors">
                           <Package size={14} />
                         </div>
                         <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter bg-slate-50 px-1.5 py-0.5 rounded-md">{product.stock}</span>
                            {product.marca && <span className="text-[7px] font-black text-indigo-400 uppercase mt-1">{product.marca}</span>}
                         </div>
                      </div>
                      <div className="text-xs font-black text-slate-700 line-clamp-2 leading-tight group-hover:text-slate-900">{product.name}</div>
                    </div>
                    <div className="text-sm font-black text-emerald-600">${product.price.toFixed(2)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CARRITO Y CHECKOUT */}
        <aside className="flex-1 flex flex-col bg-white relative">
          
          {/* LISTA ITEMS */}
          <div className="flex-1 overflow-y-auto custom-scroll p-0">
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
                      <p className="text-xs text-slate-300 font-medium">Escanea un código o selecciona un producto rápido</p>
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
                          <button 
                            onClick={() => updateQty(item.id, item.qty - 1)}
                            className="h-8 w-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors"
                          >
                            <Minus size={14} strokeWidth={3} />
                          </button>
                          <span className="w-4 text-center text-sm font-black text-slate-900">{item.qty}</span>
                          <button 
                            onClick={() => updateQty(item.id, item.qty + 1)}
                            className="h-8 w-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors"
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-slate-500">
                        ${item.priceUsd.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right text-base font-black text-slate-900">
                        ${(item.qty * item.priceUsd).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => removeItem(item.id)}
                          className="h-8 w-8 rounded-xl bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* CHECKOUT PANEL */}
          <div className="border-t border-slate-200 bg-slate-50 p-6 flex gap-8">
            
            {/* CLIENTE */}
            <div className="flex-1 space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cliente</label>
                {customer && (
                  <button onClick={() => { setCustomer(null); setClientQuery(''); }} className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-700">Cambiar</button>
                )}
              </div>
              
              {!customer ? (
                <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <Search className="h-4 w-4 text-slate-400" />
                   </div>
                   <input
                     value={clientQuery}
                     onChange={(e) => setClientQuery(e.target.value)}
                     placeholder="Buscar cliente (Nombre, RIF)..."
                     className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none shadow-sm"
                   />
                   {filteredClients.length > 0 && (
                      <div className="absolute bottom-full left-0 right-0 mb-2 max-h-40 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-1">
                        {filteredClients.map(c => (
                          <button
                            key={c.id}
                            onClick={() => { setCustomer(c); setClientQuery(''); }}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 rounded-lg flex justify-between items-center group"
                          >
                            <div>
                              <p className="text-xs font-black text-slate-800">{c.fullName || c.nombre || 'Sin Nombre'}</p>
                              <p className="text-[10px] font-bold text-slate-400">{c.rif || c.cedula}</p>
                            </div>
                            <CheckCircle2 size={14} className="text-emerald-500 opacity-0 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                   )}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                  <div className="h-10 w-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-black">
                    {(customer.fullName || customer.nombre || 'C').charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{customer.fullName || customer.nombre}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{customer.rif || customer.cedula || 'Consumidor Final'}</p>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                   <p className="text-[9px] font-black uppercase text-slate-300 mb-1">Items</p>
                   <p className="text-xl font-black text-slate-800">{items.reduce((acc, i) => acc + i.qty, 0)}</p>
                 </div>
                 <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                   <p className="text-[9px] font-black uppercase text-slate-300 mb-1">Total Bs</p>
                   <p className="text-xl font-black text-slate-800">{totals.totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })}</p>
                 </div>
              </div>
            </div>

            {/* TOTAL Y PAGAR */}
            <div className="w-[40%] bg-slate-900 rounded-[2rem] p-8 flex flex-col justify-between shadow-2xl text-white relative overflow-hidden group">
               <div className="absolute -right-10 -top-10 h-40 w-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors pointer-events-none"></div>
               
               <div>
                 <div className="flex justify-between items-start mb-1">
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total a Pagar</span>
                 </div>
                 <div className="text-5xl font-black tracking-tight flex items-start gap-1">
                   <span className="text-2xl mt-1 opacity-50">$</span>
                   {totals.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                 </div>
               </div>

               <button
                 disabled={!customer || items.length === 0 || loading}
                 onClick={handleCharge}
                 className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${
                    customer && items.length > 0 && !loading
                    ? 'bg-white text-slate-900 hover:bg-emerald-400 hover:text-white hover:scale-[1.02] shadow-xl'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                 }`}
               >
                 {loading ? 'Procesando...' : <><Receipt size={16} /> Cobrar Ticket</>}
               </button>
            </div>
          </div>
        </aside>
      </div>

      {lastMovement && (
        <ReceiptModal 
          movement={lastMovement} 
          config={{ companyName: userProfile?.fullName || 'Mi Negocio' } as any} 
          onClose={() => setLastMovement(null)} 
        />
      )}
    </div>
  );
};

// Main Export wrapping context with TenantProvider
export default function PosDetal() {
  const { empresa_id } = useParams();
  
  if (!empresa_id) {
    return <div className="h-screen flex items-center justify-center">Error: No se identificó la empresa.</div>;
  }

  return (
    <TenantProvider tenantId={empresa_id}>
      <CartProvider>
        <PosContent />
      </CartProvider>
    </TenantProvider>
  );
}
