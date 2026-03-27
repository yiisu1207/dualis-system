/**
 * Seed Test Data — Carga datos de prueba para probar todas las funciones del sistema.
 * Solo para desarrollo/testing. Ejecutar desde Configuración > DEV.
 */
import { db } from '../firebase/config';
import {
  collection, doc, setDoc, writeBatch, serverTimestamp, Timestamp,
} from 'firebase/firestore';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const randomId = () => Math.random().toString(36).slice(2, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const fmtDate = (d: Date) => d.toISOString().split('T')[0];
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randBetween = (min: number, max: number) => +(min + Math.random() * (max - min)).toFixed(2);

// ─── TEST DATA DEFINITIONS ───────────────────────────────────────────────────

const CATEGORIES = ['Alimentos', 'Bebidas', 'Limpieza', 'Higiene', 'Electrodomésticos', 'Ropa', 'Tecnología', 'Hogar'];
const BRANDS = ['Polar', 'Nestlé', 'Harina PAN', 'Mavesa', 'Empresas Polar', 'Samsung', 'LG', 'Colgate', 'P&G', 'Unilever'];
const SUPPLIERS = ['Distribuidora Central', 'Mayorista ABC', 'Importadora XYZ', 'Proveedor Directo', 'Comercial Sur'];
const UNITS = ['UND', 'KG', 'LT', 'PAQ', 'CAJA'];
const PAYMENT_METHODS = ['Efectivo USD', 'Efectivo Bs', 'Transferencia', 'Pago Móvil', 'Punto de Venta', 'Zelle'];

const PRODUCTS_DATA: Array<{
  nombre: string; categoria: string; costoUSD: number; margenDetal: number; margenMayor: number; stock: number;
}> = [
  // Alimentos
  { nombre: 'Harina PAN 1kg', categoria: 'Alimentos', costoUSD: 1.20, margenDetal: 35, margenMayor: 20, stock: 150 },
  { nombre: 'Aceite Mazeite 1L', categoria: 'Alimentos', costoUSD: 2.50, margenDetal: 30, margenMayor: 18, stock: 80 },
  { nombre: 'Arroz Mary 1kg', categoria: 'Alimentos', costoUSD: 1.10, margenDetal: 40, margenMayor: 25, stock: 200 },
  { nombre: 'Pasta Primor 500g', categoria: 'Alimentos', costoUSD: 0.85, margenDetal: 45, margenMayor: 28, stock: 300 },
  { nombre: 'Azúcar Montalbán 1kg', categoria: 'Alimentos', costoUSD: 0.95, margenDetal: 35, margenMayor: 22, stock: 120 },
  { nombre: 'Leche en Polvo 900g', categoria: 'Alimentos', costoUSD: 6.50, margenDetal: 25, margenMayor: 15, stock: 45 },
  { nombre: 'Atún Margarita 170g', categoria: 'Alimentos', costoUSD: 1.80, margenDetal: 30, margenMayor: 18, stock: 90 },
  { nombre: 'Sardina en Lata', categoria: 'Alimentos', costoUSD: 1.00, margenDetal: 40, margenMayor: 25, stock: 180 },
  { nombre: 'Café Madrid 500g', categoria: 'Alimentos', costoUSD: 4.20, margenDetal: 28, margenMayor: 16, stock: 60 },
  { nombre: 'Mantequilla Mavesa 500g', categoria: 'Alimentos', costoUSD: 2.80, margenDetal: 32, margenMayor: 20, stock: 55 },
  // Bebidas
  { nombre: 'Coca-Cola 2L', categoria: 'Bebidas', costoUSD: 1.50, margenDetal: 50, margenMayor: 30, stock: 100 },
  { nombre: 'Malta Regional', categoria: 'Bebidas', costoUSD: 0.90, margenDetal: 55, margenMayor: 35, stock: 200 },
  { nombre: 'Agua Minalba 1.5L', categoria: 'Bebidas', costoUSD: 0.60, margenDetal: 60, margenMayor: 40, stock: 250 },
  { nombre: 'Jugo Yukery 1L', categoria: 'Bebidas', costoUSD: 1.20, margenDetal: 45, margenMayor: 28, stock: 80 },
  { nombre: 'Cerveza Polar Pilsen', categoria: 'Bebidas', costoUSD: 1.80, margenDetal: 40, margenMayor: 25, stock: 150 },
  // Limpieza
  { nombre: 'Detergente Ariel 1kg', categoria: 'Limpieza', costoUSD: 3.50, margenDetal: 35, margenMayor: 20, stock: 70 },
  { nombre: 'Jabón Líquido 1L', categoria: 'Limpieza', costoUSD: 2.20, margenDetal: 40, margenMayor: 25, stock: 90 },
  { nombre: 'Cloro Clorox 1L', categoria: 'Limpieza', costoUSD: 1.50, margenDetal: 45, margenMayor: 30, stock: 110 },
  { nombre: 'Suavizante Downy 1L', categoria: 'Limpieza', costoUSD: 3.00, margenDetal: 30, margenMayor: 18, stock: 40 },
  // Higiene
  { nombre: 'Papel Higiénico Rosal x4', categoria: 'Higiene', costoUSD: 2.00, margenDetal: 45, margenMayor: 28, stock: 130 },
  { nombre: 'Shampoo H&S 400ml', categoria: 'Higiene', costoUSD: 4.50, margenDetal: 30, margenMayor: 18, stock: 35 },
  { nombre: 'Cepillo Dental Colgate', categoria: 'Higiene', costoUSD: 1.20, margenDetal: 50, margenMayor: 30, stock: 95 },
  { nombre: 'Desodorante Rexona 150ml', categoria: 'Higiene', costoUSD: 3.80, margenDetal: 28, margenMayor: 16, stock: 50 },
  // Tecnología
  { nombre: 'Cable USB-C 1m', categoria: 'Tecnología', costoUSD: 3.00, margenDetal: 60, margenMayor: 40, stock: 40 },
  { nombre: 'Cargador Universal 20W', categoria: 'Tecnología', costoUSD: 8.00, margenDetal: 50, margenMayor: 30, stock: 25 },
  { nombre: 'Audífonos Bluetooth', categoria: 'Tecnología', costoUSD: 12.00, margenDetal: 45, margenMayor: 28, stock: 15 },
  { nombre: 'Mouse Inalámbrico', categoria: 'Tecnología', costoUSD: 7.50, margenDetal: 50, margenMayor: 30, stock: 20 },
  { nombre: 'Pendrive 32GB', categoria: 'Tecnología', costoUSD: 5.00, margenDetal: 55, margenMayor: 35, stock: 30 },
  // Hogar
  { nombre: 'Bombillo LED 12W', categoria: 'Hogar', costoUSD: 1.80, margenDetal: 55, margenMayor: 35, stock: 100 },
  { nombre: 'Extensión Eléctrica 5m', categoria: 'Hogar', costoUSD: 4.50, margenDetal: 40, margenMayor: 25, stock: 30 },
];

const CUSTOMERS_DATA = [
  { id: 'carlos_martinez', cedula: 'V-12345678', telefono: '0412-1234567', direccion: 'Av. Bolívar, Centro Comercial Plaza', email: 'carlos@email.com', creditLimit: 500 },
  { id: 'maria_gonzalez', cedula: 'V-23456789', telefono: '0414-2345678', direccion: 'Calle 10, Edificio Sol, Piso 3', email: 'maria@email.com', creditLimit: 300 },
  { id: 'jose_rodriguez', cedula: 'V-34567890', telefono: '0424-3456789', direccion: 'Urb. La Floresta, Casa 15', email: 'jose@email.com', creditLimit: 1000 },
  { id: 'ana_lopez', cedula: 'V-45678901', telefono: '0416-4567890', direccion: 'Sector La Concordia, Calle 5', email: 'ana@email.com', creditLimit: 200 },
  { id: 'pedro_hernandez', cedula: 'V-56789012', telefono: '0426-5678901', direccion: 'Av. Universidad, Residencias El Parque', email: 'pedro@email.com', creditLimit: 800 },
  { id: 'lucia_ramirez', cedula: 'V-67890123', telefono: '0412-6789012', direccion: 'Calle Principal, Local 22', email: 'lucia@email.com', creditLimit: 400 },
  { id: 'diego_morales', cedula: 'V-78901234', telefono: '0414-7890123', direccion: 'Av. Libertador, Torre B, Piso 7', email: 'diego@email.com', creditLimit: 600 },
  { id: 'sofia_perez', cedula: 'V-89012345', telefono: '0424-8901234', direccion: 'Urb. Las Mercedes, Calle 8', email: '', creditLimit: 350 },
];

const SUPPLIER_DATA = [
  { id: 'dist_central', rif: 'J-12345678-0', contacto: '0212-1234567', categoria: 'Alimentos' },
  { id: 'may_abc', rif: 'J-23456789-0', contacto: '0212-2345678', categoria: 'Bebidas' },
  { id: 'imp_xyz', rif: 'J-34567890-0', contacto: '0212-3456789', categoria: 'Limpieza' },
  { id: 'prov_directo', rif: 'J-45678901-0', contacto: '0212-4567890', categoria: 'Tecnología' },
  { id: 'com_sur', rif: 'J-56789012-0', contacto: '0212-5678901', categoria: 'Hogar' },
];

// ─── MAIN SEED FUNCTION ──────────────────────────────────────────────────────

export async function seedTestData(
  businessId: string,
  ownerId: string,
  onProgress?: (msg: string, pct: number) => void,
): Promise<{ products: number; customers: number; suppliers: number; movements: number; terminals: number }> {
  const log = (msg: string, pct: number) => onProgress?.(msg, pct);
  const BCV_RATE = 51.50;
  const GRUPO_RATE = 53.00;

  // ── 1. Products ──────────────────────────────────────────────────────────
  log('Creando productos...', 5);
  let batch = writeBatch(db);
  let batchCount = 0;
  const productIds: string[] = [];

  for (const p of PRODUCTS_DATA) {
    const pid = randomId();
    productIds.push(pid);
    const precioDetal = +(p.costoUSD * (1 + p.margenDetal / 100)).toFixed(2);
    const precioMayor = +(p.costoUSD * (1 + p.margenMayor / 100)).toFixed(2);
    const tipoTasa = Math.random() > 0.6 ? 'GRUPO' : 'BCV';

    batch.set(doc(db, 'businesses', businessId, 'products', pid), {
      codigo: `PRD-${pid.slice(0, 5).toUpperCase()}`,
      nombre: p.nombre,
      marca: pick(BRANDS),
      proveedor: pick(SUPPLIERS),
      categoria: p.categoria,
      ubicacion: `Pasillo ${Math.ceil(Math.random() * 8)}-${String.fromCharCode(65 + Math.floor(Math.random() * 4))}`,
      costoUSD: p.costoUSD,
      precioDetal,
      precioMayor,
      precioBCV: +(p.costoUSD * BCV_RATE).toFixed(2),
      precioGrupo: +(p.costoUSD * GRUPO_RATE).toFixed(2),
      precioDivisa: 0,
      stock: p.stock,
      stockMinimo: Math.max(5, Math.floor(p.stock * 0.1)),
      iva: 16,
      ivaTipo: 'GENERAL',
      unidad: pick(UNITS),
      peso: randBetween(0.1, 5),
      descripcion: '',
      tipoTasa,
      margenDetal: p.margenDetal,
      margenMayor: p.margenMayor,
    });
    batchCount++;
    if (batchCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }
  if (batchCount > 0) { await batch.commit(); batch = writeBatch(db); batchCount = 0; }
  log(`${PRODUCTS_DATA.length} productos creados`, 20);

  // ── 2. Customers ─────────────────────────────────────────────────────────
  log('Creando clientes...', 25);
  for (const c of CUSTOMERS_DATA) {
    batch.set(doc(db, 'customers', c.id), {
      ...c,
      businessId,
      ownerId,
      createdAt: daysAgo(Math.floor(Math.random() * 60)).toISOString(),
    });
    batchCount++;
  }
  await batch.commit(); batch = writeBatch(db); batchCount = 0;
  log(`${CUSTOMERS_DATA.length} clientes creados`, 35);

  // ── 3. Suppliers ─────────────────────────────────────────────────────────
  log('Creando proveedores...', 38);
  for (const s of SUPPLIER_DATA) {
    batch.set(doc(db, 'suppliers', s.id), {
      id: s.id,
      rif: s.rif,
      contacto: s.contacto,
      categoria: s.categoria,
      businessId,
      ownerId,
    });
    batchCount++;
  }
  await batch.commit(); batch = writeBatch(db); batchCount = 0;
  log(`${SUPPLIER_DATA.length} proveedores creados`, 42);

  // ── 4. Terminals ─────────────────────────────────────────────────────────
  log('Creando terminales...', 45);
  const terminals = [
    { id: 'caja_detal_1', nombre: 'Caja Detal 1', tipo: 'detal' },
    { id: 'caja_detal_2', nombre: 'Caja Detal 2', tipo: 'detal' },
    { id: 'caja_mayor_1', nombre: 'Caja Mayor 1', tipo: 'mayor' },
  ];
  for (const t of terminals) {
    await setDoc(doc(db, 'businesses', businessId, 'terminals', t.id), {
      id: t.id,
      nombre: t.nombre,
      tipo: t.tipo,
      estado: 'cerrada',
      cajeroNombre: 'Sin asignar',
      totalFacturado: 0,
      movimientos: 0,
      createdAt: serverTimestamp(),
    });
  }
  log(`${terminals.length} terminales creados`, 50);

  // ── 5. Sales Movements (last 30 days) ────────────────────────────────────
  log('Generando ventas de los últimos 30 días...', 52);
  const movementCount = 120; // ~4 ventas/día
  const movementIds: string[] = [];

  for (let i = 0; i < movementCount; i++) {
    const mid = randomId();
    movementIds.push(mid);
    const dayOffset = Math.floor(Math.random() * 30);
    const date = daysAgo(dayOffset);
    const hour = 8 + Math.floor(Math.random() * 10);
    date.setHours(hour, Math.floor(Math.random() * 60));

    // Pick 1-4 random products for this sale
    const numItems = 1 + Math.floor(Math.random() * 4);
    const saleItems: Array<{ id: string; nombre: string; qty: number; price: number; subtotal: number }> = [];
    let subtotalUSD = 0;

    for (let j = 0; j < numItems; j++) {
      const pidx = Math.floor(Math.random() * PRODUCTS_DATA.length);
      const p = PRODUCTS_DATA[pidx];
      const qty = 1 + Math.floor(Math.random() * 5);
      const price = +(p.costoUSD * (1 + p.margenDetal / 100)).toFixed(2);
      const sub = +(price * qty).toFixed(2);
      subtotalUSD += sub;
      saleItems.push({
        id: productIds[pidx],
        nombre: p.nombre,
        qty,
        price,
        subtotal: sub,
      });
    }

    const ivaAmount = +(subtotalUSD * 0.16).toFixed(2);
    const totalUSD = +(subtotalUSD + ivaAmount).toFixed(2);
    const rate = Math.random() > 0.5 ? BCV_RATE : GRUPO_RATE;
    const method = pick(PAYMENT_METHODS);
    const isCredit = Math.random() > 0.85;
    const customer = Math.random() > 0.4 ? pick(CUSTOMERS_DATA) : null;
    const entityId = customer ? customer.id : 'CONSUMIDOR_FINAL';

    const pagos: Record<string, number> = {};
    if (method.includes('Efectivo') && Math.random() > 0.7) {
      // Mixed payment
      const cashPortion = +(totalUSD * 0.6).toFixed(2);
      const digitalPortion = +(totalUSD - cashPortion).toFixed(2);
      pagos['Efectivo USD'] = cashPortion;
      pagos['Transferencia'] = digitalPortion;
    } else {
      pagos[method] = totalUSD;
    }

    batch.set(doc(db, 'movements', mid), {
      businessId,
      entityId,
      concept: `Venta ${saleItems.map(i => i.nombre).join(', ').slice(0, 60)}`,
      amount: totalUSD,
      amountInUSD: totalUSD,
      originalAmount: totalUSD,
      subtotalUSD,
      ivaAmount,
      discountAmount: 0,
      igtfAmount: 0,
      igtfRate: 0,
      currency: 'USD',
      date: fmtDate(date),
      createdAt: date.toISOString(),
      startedAt: new Date(date.getTime() - 60000 * Math.floor(Math.random() * 10)).toISOString(),
      movementType: 'FACTURA',
      accountType: rate === BCV_RATE ? 'BCV' : 'GRUPO',
      rateUsed: rate,
      metodoPago: method,
      referencia: method.includes('Transferencia') || method.includes('Pago') ? `REF-${randomId().toUpperCase()}` : '',
      pagos,
      esPagoMixto: Object.keys(pagos).length > 1,
      items: saleItems,
      cajaId: pick(terminals).id,
      vendedorId: ownerId,
      vendedorNombre: 'Test User',
      pagado: !isCredit,
      estadoPago: isCredit ? 'PENDIENTE' : 'PAGADO',
      esVentaContado: !isCredit,
      anulada: Math.random() > 0.97, // ~3% anuladas
      nroControl: `NF-${String(i + 1).padStart(6, '0')}`,
    });
    batchCount++;
    if (batchCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }
  if (batchCount > 0) { await batch.commit(); batch = writeBatch(db); batchCount = 0; }
  log(`${movementCount} ventas generadas`, 75);

  // ── 6. Abono movements (payments received for credit sales) ──────────────
  log('Generando abonos...', 78);
  const abonoCount = 15;
  for (let i = 0; i < abonoCount; i++) {
    const aid = randomId();
    const customer = pick(CUSTOMERS_DATA);
    const abonoAmount = randBetween(10, 80);
    const date = daysAgo(Math.floor(Math.random() * 20));

    batch.set(doc(db, 'movements', aid), {
      businessId,
      entityId: customer.id,
      concept: `Abono de ${customer.cedula}`,
      amount: abonoAmount,
      amountInUSD: abonoAmount,
      originalAmount: abonoAmount,
      currency: 'USD',
      date: fmtDate(date),
      createdAt: date.toISOString(),
      movementType: 'ABONO',
      accountType: 'BCV',
      rateUsed: BCV_RATE,
      metodoPago: pick(['Transferencia', 'Pago Móvil', 'Efectivo USD']),
      referencia: `ABN-${randomId().toUpperCase()}`,
      pagos: { [pick(['Transferencia', 'Pago Móvil'])]: abonoAmount },
      pagado: true,
      estadoPago: 'PAGADO',
      anulada: false,
    });
    batchCount++;
  }
  if (batchCount > 0) { await batch.commit(); batch = writeBatch(db); batchCount = 0; }
  log(`${abonoCount} abonos generados`, 82);

  // ── 7. Expense movements (CxP) ──────────────────────────────────────────
  log('Generando gastos...', 85);
  const EXPENSE_CATEGORIES = ['Alquiler', 'Servicios', 'Nómina', 'Transporte', 'Suministros', 'Impuestos'];
  const expenseCount = 20;
  for (let i = 0; i < expenseCount; i++) {
    const eid = randomId();
    const supplier = pick(SUPPLIER_DATA);
    const amount = randBetween(15, 500);
    const date = daysAgo(Math.floor(Math.random() * 30));

    batch.set(doc(db, 'movements', eid), {
      businessId,
      entityId: supplier.id,
      concept: `${pick(EXPENSE_CATEGORIES)} — ${supplier.rif}`,
      amount,
      amountInUSD: amount,
      currency: 'USD',
      date: fmtDate(date),
      createdAt: date.toISOString(),
      movementType: 'FACTURA',
      accountType: 'BCV',
      rateUsed: BCV_RATE,
      isSupplierMovement: true,
      expenseCategory: pick(EXPENSE_CATEGORIES),
      pagado: Math.random() > 0.3,
      estadoPago: Math.random() > 0.3 ? 'PAGADO' : 'PENDIENTE',
      anulada: false,
    });
    batchCount++;
  }
  if (batchCount > 0) { await batch.commit(); batch = writeBatch(db); batchCount = 0; }
  log(`${expenseCount} gastos generados`, 90);

  // ── 8. Arqueo records ────────────────────────────────────────────────────
  log('Generando arqueos históricos...', 92);
  for (let i = 0; i < 5; i++) {
    const date = daysAgo(i * 5 + 1);
    const t = terminals[i % terminals.length];
    const salesTotal = randBetween(150, 800);
    const expectedUsd = +(salesTotal * 0.6).toFixed(2);
    const expectedBs = +(salesTotal * 0.25 * BCV_RATE).toFixed(2);

    await setDoc(doc(db, 'businesses', businessId, 'arqueos', `${t.id}_${date.toISOString().replace(/[:.]/g, '-')}`), {
      terminalId: t.id,
      terminalName: t.nombre,
      terminalType: t.tipo,
      cajero: 'Test User',
      closedBy: ownerId,
      apertura: new Date(date.getTime() - 8 * 3600000).toISOString(),
      cierreAt: date.toISOString(),
      salesTotal,
      salesCount: Math.floor(salesTotal / 15),
      paymentBreakdown: {
        'Efectivo USD': expectedUsd,
        'Efectivo Bs': +(salesTotal * 0.25).toFixed(2),
        'Transferencia': +(salesTotal * 0.15).toFixed(2),
      },
      denominationsUsd: { 100: 1, 50: Math.floor(Math.random() * 3), 20: Math.floor(Math.random() * 5), 10: Math.floor(Math.random() * 4), 5: Math.floor(Math.random() * 3), 1: Math.floor(Math.random() * 8) },
      denominationsBs: { 100: Math.floor(Math.random() * 5), 50: Math.floor(Math.random() * 8), 20: Math.floor(Math.random() * 10), 10: Math.floor(Math.random() * 6) },
      totalCountedUsd: +(expectedUsd + randBetween(-3, 3)).toFixed(2),
      totalCountedBs: +(expectedBs + randBetween(-10, 10)).toFixed(2),
      expectedCashUsd: expectedUsd,
      expectedCashBs: expectedBs,
      varianceUsd: randBetween(-3, 3),
      varianceBs: randBetween(-10, 10),
      note: i === 0 ? 'Turno sin novedades' : '',
      createdAt: Timestamp.fromDate(date),
    });
  }
  log('5 arqueos generados', 95);

  // ── 9. Business Config ───────────────────────────────────────────────────
  log('Configurando negocio...', 97);
  await setDoc(doc(db, 'businessConfigs', businessId), {
    companyName: 'Mi Negocio Test',
    companyRif: 'J-99887766-0',
    companyPhone: '0212-9988776',
    companyEmail: 'test@minegocio.com',
    companyAddress: 'Av. Principal, Local 1, Caracas',
    invoicePrefix: 'NF-',
    nextNroControl: movementCount + 1,
    fiscal: {
      igtfEnabled: true,
      igtfRate: 3,
      ivaEnabled: true,
      scannerEnabled: true,
    },
  }, { merge: true });

  log('Datos de prueba cargados exitosamente', 100);

  return {
    products: PRODUCTS_DATA.length,
    customers: CUSTOMERS_DATA.length,
    suppliers: SUPPLIER_DATA.length,
    movements: movementCount + abonoCount + expenseCount,
    terminals: terminals.length,
  };
}
