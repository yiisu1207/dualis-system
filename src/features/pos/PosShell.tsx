import React, { useEffect, useMemo, useState } from 'react';

type CartItem = {
  id: string;
  name: string;
  qty: number;
  price: number;
  stock: number;
  iva: number;
};

const QUICK_PRODUCTS = [
  { id: 'A001', name: 'Arroz premium 1kg', price: 2.2, stock: 180 },
  { id: 'B014', name: 'Camisa basica blanca', price: 12.9, stock: 32 },
  { id: 'C122', name: 'Cargador USB-C 20W', price: 9.5, stock: 19 },
  { id: 'D311', name: 'Shampoo herbal 400ml', price: 4.8, stock: 65 },
  { id: 'E101', name: 'Cafe molido 500g', price: 6.2, stock: 48 },
  { id: 'F022', name: 'Papel oficio resma', price: 8.9, stock: 24 },
];

const MOCK_CART: CartItem[] = [
  { id: 'A001', name: 'Arroz premium 1kg', qty: 4, price: 2.2, stock: 180, iva: 0.16 },
  { id: 'B014', name: 'Camisa basica blanca', qty: 2, price: 12.9, stock: 32, iva: 0.16 },
  { id: 'C122', name: 'Cargador USB-C 20W', qty: 1, price: 9.5, stock: 19, iva: 0.16 },
];

export default function PosShell() {
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>(MOCK_CART);
  const [now, setNow] = useState(new Date());
  const [discountPct, setDiscountPct] = useState('0');
  const [applyIgtf, setApplyIgtf] = useState(false);
  const rateBcv = 36.5;

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const totals = useMemo(() => {
    const baseUsd = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    const discountRate = Math.max(0, Math.min(100, Number(discountPct) || 0)) / 100;
    const discounted = baseUsd * (1 - discountRate);
    const iva = discounted * 0.16;
    const igtf = applyIgtf ? discounted * 0.03 : 0;
    const total = discounted + iva + igtf;
    return {
      baseUsd,
      baseBs: baseUsd * rateBcv,
      discountRate,
      iva,
      igtf,
      total,
      totalBs: total * rateBcv,
    };
  }, [cart, discountPct, applyIgtf]);

  const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 text-slate-900 font-sans">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 shadow-sm z-10">
        <div className="h-16 px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-violet-600 text-white flex items-center justify-center text-sm font-black shadow-lg shadow-violet-200">
              POS
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                Sistema de Caja
              </div>
              <div className="text-sm font-bold text-slate-800">Nueva Venta</div>
            </div>
          </div>

          <div className="flex-1 max-w-3xl mx-8">
            <div className="relative">
              <i className="fa-solid fa-magnifying-glass absolute left-4 top-3.5 text-slate-400"></i>
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar producto (F3) o escanear código..."
                className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-10 pr-4 py-3 text-sm font-bold shadow-inner focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right hidden md:block">
              <div className="text-xs font-semibold text-slate-400">{timeLabel}</div>
              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-500">Caja Abierta</div>
            </div>
            <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-2 text-right">
              <span className="block text-[9px] font-black uppercase text-violet-400">Tasa BCV</span>
              <span className="block text-sm font-black text-violet-700">{rateBcv.toFixed(2)} Bs</span>
            </div>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="h-12 px-6 flex items-center gap-3 border-t border-slate-100 bg-white">
          <button className="px-4 py-1.5 text-[10px] font-black uppercase rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors">
            <i className="fa-solid fa-house mr-2"></i>Inicio
          </button>
          <div className="h-6 w-px bg-slate-200 mx-2"></div>
          <button className="px-4 py-1.5 text-[10px] font-black uppercase rounded-lg border border-slate-200 bg-white hover:border-violet-300 hover:text-violet-600 transition-colors">
            Limpiar (F5)
          </button>
          <button className="px-4 py-1.5 text-[10px] font-black uppercase rounded-lg border border-slate-200 bg-white hover:border-violet-300 hover:text-violet-600 transition-colors">
            Ver Cotizaciones
          </button>
          <div className="ml-auto flex gap-3">
             <select className="bg-transparent text-xs font-bold text-slate-600 outline-none cursor-pointer hover:text-violet-600">
               <option>1 - Almacen Principal</option>
             </select>
             <select className="bg-transparent text-xs font-bold text-slate-600 outline-none cursor-pointer hover:text-violet-600">
               <option>Factura Fiscal</option>
               <option>Nota de Entrega</option>
             </select>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL: CATALOG & CLIENT */}
        <section className="w-[350px] flex flex-col border-r border-slate-200 bg-white">
           <div className="p-4 border-b border-slate-100 bg-slate-50/50">
             <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-colors group">
                <i className="fa-regular fa-user text-slate-400 text-2xl mb-2 group-hover:text-violet-500"></i>
                <p className="text-xs font-bold text-slate-600 group-hover:text-violet-700">Seleccionar Cliente</p>
                <p className="text-[10px] text-slate-400">O crear uno nuevo (+)</p>
             </div>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 custom-scroll">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Más Vendidos</h3>
              <div className="grid grid-cols-2 gap-3">
                {QUICK_PRODUCTS.map((product) => (
                  <button
                    key={product.id}
                    className="flex flex-col text-left p-3 rounded-xl border border-slate-100 bg-white shadow-sm hover:shadow-md hover:border-violet-200 hover:-translate-y-1 transition-all group"
                  >
                    <div className="h-16 w-full rounded-lg bg-slate-50 mb-3 group-hover:bg-violet-50 transition-colors"></div>
                    <span className="text-[10px] font-bold text-slate-400">{product.id}</span>
                    <span className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight min-h-[2.5em] group-hover:text-violet-700">
                      {product.name}
                    </span>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-black text-slate-900">${product.price}</span>
                      <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">x{product.stock}</span>
                    </div>
                  </button>
                ))}
              </div>
           </div>
        </section>

        {/* RIGHT PANEL: CART & TOTALS */}
        <main className="flex-1 flex flex-col bg-slate-50">
            <div className="flex-1 overflow-y-auto p-6 custom-scroll">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-xs font-black uppercase text-slate-400 tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4">Producto</th>
                      <th className="px-4 py-4 text-center">Cant.</th>
                      <th className="px-4 py-4 text-right">Precio</th>
                      <th className="px-4 py-4 text-right">Total</th>
                      <th className="px-4 py-4 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {cart.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">{item.name}</div>
                          <div className="text-[10px] font-semibold text-slate-400">COD: {item.id}</div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex items-center border border-slate-200 rounded-lg bg-white">
                             <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-l-lg">-</button>
                             <span className="w-8 text-center font-bold text-slate-700">{item.qty}</span>
                             <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-r-lg">+</button>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-slate-600">
                          ${item.price.toFixed(2)}
                        </td>
                        <td className="px-4 py-4 text-right font-black text-slate-800">
                          ${(item.qty * item.price).toFixed(2)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                            <i className="fa-solid fa-trash-can"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TOTALS BAR */}
            <div className="bg-white border-t border-slate-200 p-6 shadow-lg z-20">
              <div className="max-w-4xl mx-auto grid grid-cols-[1fr_auto] gap-12">
                 <div className="space-y-4">
                    <div className="flex gap-4">
                       <div className="flex-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block">Notas</label>
                          <textarea className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all outline-none resize-none h-20" placeholder="Observaciones de la venta..."></textarea>
                       </div>
                       <div className="w-32">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 block">Descuento %</label>
                          <input 
                            value={discountPct} 
                            onChange={(e) => setDiscountPct(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-center font-black text-lg focus:ring-2 focus:ring-violet-500 focus:bg-white outline-none" 
                          />
                       </div>
                    </div>
                 </div>

                 <div className="w-80">
                    <div className="space-y-2 mb-6">
                       <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">Subtotal</span>
                          <span className="text-slate-800 font-bold">${totals.baseUsd.toFixed(2)}</span>
                       </div>
                       <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">IVA (16%)</span>
                          <span className="text-slate-800 font-bold">${totals.iva.toFixed(2)}</span>
                       </div>
                       {Number(discountPct) > 0 && (
                         <div className="flex justify-between text-sm text-emerald-600">
                            <span className="font-bold">Descuento ({discountPct}%)</span>
                            <span className="font-bold">-${(totals.baseUsd * totals.discountRate).toFixed(2)}</span>
                         </div>
                       )}
                       <div className="pt-3 border-t border-dashed border-slate-200 flex justify-between items-end">
                          <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Total a Pagar</span>
                          <div className="text-right">
                             <div className="text-3xl font-black text-slate-900 leading-none">${totals.total.toFixed(2)}</div>
                             <div className="text-sm font-bold text-slate-400 mt-1">{totals.totalBs.toFixed(2)} Bs</div>
                          </div>
                       </div>
                    </div>

                    <button className="w-full py-4 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-violet-200 hover:shadow-violet-300 hover:-translate-y-1 transition-all active:translate-y-0 active:shadow-none flex items-center justify-center gap-2">
                       <span>Cobrar</span> <i className="fa-solid fa-arrow-right"></i>
                    </button>
                 </div>
              </div>
            </div>
        </main>
      </div>
    </div>
  );
}
