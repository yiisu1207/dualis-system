import React, { useState } from 'react';
import {
  X, LayoutDashboard, ShoppingCart, Package, Wallet, Settings2,
  FileSpreadsheet, Zap, ChevronRight, Lightbulb, BookOpen,
  Fingerprint, Monitor, ArrowUpDown, Tag, Camera, History,
  Receipt, CreditCard, Users, Import, BarChart3, Building2,
} from 'lucide-react';

// ─── CONTENT ─────────────────────────────────────────────────────────────────
interface Step  { icon: React.ReactNode; title: string; desc: string; }
interface Tip   { text: string; }
interface Section {
  id: string;
  icon: React.ReactNode;
  label: string;
  color: string;        // tailwind accent color token
  bg: string;           // tailwind bg token
  overview: string;
  steps: Step[];
  tips: Tip[];
}

const SECTIONS: Section[] = [
  {
    id: 'dashboard',
    icon: <LayoutDashboard size={16} />,
    label: 'Dashboard',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    overview: 'Tu centro de mando. Ve el estado financiero de tu negocio en tiempo real sin tener que abrir ningún otro módulo.',
    steps: [
      { icon: <BarChart3 size={14} />, title: 'KPIs en tiempo real', desc: 'Las 6 tarjetas superiores muestran: Facturado, Cobrado, CxC (por cobrar), CxP (por pagar), Productos en stock y Facturas del período.' },
      { icon: <ChevronRight size={14} />, title: 'Cambiar período', desc: 'Usa los botones "Hoy / 7 Días / 30 Días" arriba a la derecha para filtrar todos los datos del dashboard.' },
      { icon: <BarChart3 size={14} />, title: 'Gráfico de ventas', desc: 'El área chart compara Facturado (azul) vs Cobrado (verde). Si la línea azul supera la verde, tienes ventas a crédito pendientes.' },
      { icon: <Package size={14} />, title: 'Alertas de inventario', desc: 'La sección inferior derecha lista los productos con stock por debajo del mínimo configurado. Haz clic para ir al inventario.' },
      { icon: <ShoppingCart size={14} />, title: 'Nueva venta rápida', desc: 'El botón "+ Nueva Venta" te lleva directamente al POS Detal sin navegar por el menú.' },
    ],
    tips: [
      { text: 'Haz clic en cualquier KPI para ir al módulo correspondiente.' },
      { text: 'El dashboard se actualiza en tiempo real. No necesitas refrescar la página.' },
    ],
  },
  {
    id: 'pos-detal',
    icon: <ShoppingCart size={16} />,
    label: 'POS Detal',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    overview: 'Terminal de ventas al detal (consumidor final). Ideal para tiendas, abastos y locales de atención directa al público.',
    steps: [
      { icon: <Package size={14} />, title: 'Agregar productos', desc: 'Escribe el código del producto en la barra de búsqueda y presiona Enter. Se añade al carrito automáticamente.' },
      { icon: <Camera size={14} />, title: 'Escáner de cámara', desc: 'Haz clic en el ícono de cámara 📷 para activar el escáner. Apunta la cámara al código de barras del producto. Actívalo en Configuración → Fiscal/POS.' },
      { icon: <Tag size={14} />, title: 'Aplicar descuento', desc: 'En el panel derecho, selecciona el tipo de descuento (ninguno / porcentaje / monto fijo) e ingresa el valor. Se aplica sobre el total con IVA.' },
      { icon: <CreditCard size={14} />, title: 'Cobrar venta', desc: 'Haz clic en "COBRAR". Selecciona el método: Efectivo USD, Efectivo Bs, Transferencia o Pago Mixto. El sistema calcula el cambio automáticamente.' },
      { icon: <Receipt size={14} />, title: 'Recibo digital', desc: 'Tras confirmar el pago aparece el comprobante. Puedes imprimirlo (80mm), compartirlo por WhatsApp (si el cliente tiene teléfono) o descargarlo.' },
      { icon: <History size={14} />, title: 'Historial y anulaciones', desc: 'El ícono 🕐 muestra las últimas 30 ventas. Para anular una venta haz clic en "Anular" — se crea un movimiento de reverso y se restaura el stock.' },
    ],
    tips: [
      { text: 'Las ventas en POS Detal son siempre de contado. Para crédito usa POS Mayor.' },
      { text: 'IGTF (3%) se aplica automáticamente al pagar en Efectivo USD o Mixto, si está activo.' },
      { text: 'Consumidor Final no aparece en Contabilidad. Es para ventas anónimas.' },
    ],
  },
  {
    id: 'pos-mayor',
    icon: <Building2 size={16} />,
    label: 'POS Mayor',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    overview: 'Terminal de ventas al mayor con soporte para crédito, condiciones de pago y clientes registrados.',
    steps: [
      { icon: <Users size={14} />, title: 'Seleccionar cliente', desc: 'El POS Mayor requiere un cliente registrado. Búscalo por nombre y selecciónalo. Las ventas se vinculan a su cuenta para el control de CxC.' },
      { icon: <CreditCard size={14} />, title: 'Condición de pago', desc: 'Selecciona: Contado (pago inmediato), Crédito 15 días, Crédito 30 días o Crédito 45 días. Las ventas a crédito quedan pendientes en Cuentas por Cobrar.' },
      { icon: <Tag size={14} />, title: 'Descuentos por volumen', desc: 'Aplica descuento porcentual o fijo al total del pedido, igual que en POS Detal.' },
      { icon: <Receipt size={14} />, title: 'Historial de pedidos', desc: 'El ícono de historial muestra las últimas ventas de esta terminal. Puedes anular pedidos con el mismo flujo que en Detal.' },
    ],
    tips: [
      { text: 'El precio que muestra el POS Mayor usa la lista de precio "Mayor" del producto.' },
      { text: 'Las ventas a crédito aparecen en Contabilidad → Directorio con saldo pendiente.' },
      { text: 'Para cobrar una deuda ve a Contabilidad y registra un Abono al cliente.' },
    ],
  },
  {
    id: 'inventario',
    icon: <Package size={16} />,
    label: 'Inventario',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    overview: 'Administra tu catálogo de productos, controla el stock, importa listas de precios desde Excel y genera etiquetas con código de barras.',
    steps: [
      { icon: <Package size={14} />, title: 'Agregar producto', desc: 'Haz clic en "+ Nuevo Producto". Completa: nombre, código (SKU/barcode), categoría, costo USD, precio detal y precio mayor. El stock inicial puedes dejarlo en 0.' },
      { icon: <Import size={14} />, title: 'Importar desde Excel', desc: 'Haz clic en "Importar". En el paso 1, copia tus celdas de Excel (Ctrl+C) y pégalas en el área de texto. El sistema detecta automáticamente columnas de NOMBRE, COSTO, MARGEN y PRECIO.' },
      { icon: <FileSpreadsheet size={14} />, title: 'Formato de importación', desc: 'Tu Excel puede tener las columnas en cualquier orden. Si tienes PRECIO COSTO + MARGEN (ej. 25%), el sistema calcula el precio de venta automáticamente. Los decimales con coma (1,5) se manejan solos.' },
      { icon: <ArrowUpDown size={14} />, title: 'Ajuste de stock', desc: 'Haz clic en el ícono de stock de un producto para ajustar. Tipos: COMPRA (entrada), AJUSTE (corrección manual), MERMA (pérdida). Cada movimiento queda registrado en el Kardex.' },
      { icon: <Receipt size={14} />, title: 'Etiquetas de código de barras', desc: 'Selecciona productos con el checkbox y haz clic en "Etiquetas". Configura el tamaño de la etiqueta y genera un PDF listo para imprimir.' },
      { icon: <FileSpreadsheet size={14} />, title: 'Exportar inventario', desc: 'El botón "Exportar" genera un Excel con todos los productos, incluyendo márgenes y precios en Bs.' },
    ],
    tips: [
      { text: 'Cuando vendes desde el POS, el stock se descuenta automáticamente.' },
      { text: 'Si anulas una venta, el stock se restaura automáticamente.' },
      { text: 'El stockMínimo controla las alertas del dashboard.' },
    ],
  },
  {
    id: 'contabilidad',
    icon: <Wallet size={16} />,
    label: 'Contabilidad / CxC',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    overview: 'Directorio contable de todas las entidades con saldos por cuenta. Gestiona cuentas por cobrar (clientes) y por pagar (proveedores).',
    steps: [
      { icon: <Users size={14} />, title: 'Directorio de entidades', desc: 'Muestra todos los clientes, proveedores y empleados con su balance consolidado. Los saldos se calculan de forma automática a partir de los movimientos.' },
      { icon: <Wallet size={14} />, title: 'Saldos por cuenta', desc: 'Cada entidad tiene 3 cuentas: BCV (en tasa BCV), Grupo (tasa empresa) y Divisa (USD directo). Los filtros "BCV / Grupo / Divisa" muestran solo entidades con saldo en esa cuenta.' },
      { icon: <Receipt size={14} />, title: 'Cuentas por cobrar (CxC)', desc: 'Filtra por "Clientes" y activa "Solo con saldo". Verás los clientes que tienen facturas a crédito sin pagar. El saldo rojo indica deuda.' },
      { icon: <CreditCard size={14} />, title: 'Registrar un cobro', desc: 'Haz clic en un cliente con saldo → "Nuevo Abono". Ingresa el monto y método. El saldo se actualiza al instante.' },
    ],
    tips: [
      { text: 'CONSUMIDOR_FINAL no aparece aquí. Esas ventas son siempre de contado.' },
      { text: 'Usa el campo de búsqueda para encontrar rápidamente un cliente por nombre.' },
    ],
  },
  {
    id: 'importar',
    icon: <FileSpreadsheet size={16} />,
    label: 'Importar Excel',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    overview: 'Importa tu lista de precios desde Excel directamente pegando el texto. No necesitas guardar ningún archivo especial.',
    steps: [
      { icon: <FileSpreadsheet size={14} />, title: 'Paso 1: Copia en Excel', desc: 'En tu Excel, selecciona todas las celdas con datos (incluyendo la fila de encabezados). Presiona Ctrl+C.' },
      { icon: <Import size={14} />, title: 'Paso 2: Pega en el sistema', desc: 'Ve a Inventario → Importar. En la zona "o pega texto directamente", haz clic en el textarea y presiona Ctrl+V. Aparecerán los datos.' },
      { icon: <Zap size={14} />, title: 'Paso 3: Detección automática', desc: 'El sistema detecta automáticamente columnas NOMBRE, COSTO, MARGEN, PRECIO DETAL, STOCK, etc. Revisa el mapeo en el paso siguiente.' },
      { icon: <ChevronRight size={14} />, title: 'Paso 4: Verificar mapeo', desc: 'Cada columna de tu Excel se asigna a un campo del sistema. Puedes corregir manualmente cualquier asignación incorrecta.' },
      { icon: <Receipt size={14} />, title: 'Paso 5: Vista previa y confirmar', desc: 'Ve una muestra de cómo quedarán los productos antes de importarlos. Haz clic en "Importar" para guardar todo de golpe.' },
    ],
    tips: [
      { text: 'Si tienes PRECIO COSTO y MARGEN (ej. 25%), el sistema calcula el precio de venta solo.' },
      { text: 'Los decimales venezolanos con coma (1,5) se convierten automáticamente.' },
      { text: 'En modo "Flexible" solo se requiere el nombre del producto.' },
      { text: 'Si el código ya existe, puedes elegir: omitir duplicados o sobreescribir.' },
    ],
  },
  {
    id: 'configuracion',
    icon: <Settings2 size={16} />,
    label: 'Configuración',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    overview: 'Ajusta los parámetros fiscales, visuales y operativos de tu negocio. Los cambios afectan a todos los módulos del sistema.',
    steps: [
      { icon: <Building2 size={14} />, title: 'Datos del negocio', desc: 'Nombre, RIF y dirección que aparecen en tus recibos. El RIF se formatea automáticamente (J-XXXXXXXX-X).' },
      { icon: <Receipt size={14} />, title: 'IGTF', desc: 'Activa o desactiva el Impuesto a Grandes Transacciones Financieras (por defecto 3%). Se aplica cuando el cliente paga en Efectivo USD o pago Mixto.' },
      { icon: <Wallet size={14} />, title: 'IVA', desc: 'Configura la tasa de IVA: 16% (General), 8% (Reducido) o 0% (Exento). Aplica a todos los productos por defecto, salvo que el producto tenga tasa propia.' },
      { icon: <Monitor size={14} />, title: 'Tasa de cambio', desc: 'Actualiza la tasa BCV y la tasa de Grupo manualmente. Se usa para mostrar precios en bolívares en todo el sistema.' },
      { icon: <Camera size={14} />, title: 'Escáner por cámara', desc: 'Activa o desactiva el botón de cámara en el POS. Útil si usas un escáner USB externo y no necesitas la cámara.' },
    ],
    tips: [
      { text: 'Los cambios de IGTF e IVA en Configuración afectan inmediatamente a ambos POS.' },
      { text: 'Actualiza la tasa BCV todos los días para mantener los precios en Bs correctos.' },
    ],
  },
  {
    id: 'onboarding',
    icon: <Fingerprint size={16} />,
    label: 'Configuración Inicial',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    overview: 'El asistente de configuración inicial te guía en 4 pasos para activar tu sistema por primera vez.',
    steps: [
      { icon: <Building2 size={14} />, title: 'Paso 1 – Datos del negocio', desc: 'Ingresa el nombre de tu empresa (aparecerá en facturas), RIF (se auto-formatea), teléfono y dirección.' },
      { icon: <Wallet size={14} />, title: 'Paso 2 – Finanzas y Fiscal', desc: 'Define la moneda principal, IVA, tasa BCV inicial y si usarás IGTF. Estos valores se pueden cambiar luego en Configuración.' },
      { icon: <Monitor size={14} />, title: 'Paso 3 – Primera Terminal', desc: 'Crea tu primera caja: dale un nombre (ej. "Caja Principal") y elige si es Detal (consumidor final) o Mayor (clientes con crédito).' },
      { icon: <Fingerprint size={14} />, title: 'Paso 4 – PIN de seguridad', desc: 'Crea un PIN de 4 dígitos. Se pedirá para acciones críticas como anular ventas. Confírmalo en la segunda caja.' },
    ],
    tips: [
      { text: 'Puedes agregar más terminales en Configuración → Cajas después del setup inicial.' },
      { text: 'El PIN no se puede recuperar, guárdalo en un lugar seguro.' },
    ],
  },
];

// ─── COMPONENT ───────────────────────────────────────────────────────────────
interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpPanel({ open, onClose }: HelpPanelProps) {
  const [active, setActive] = useState('dashboard');
  const section = SECTIONS.find(s => s.id === active) ?? SECTIONS[0];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-[90] w-full max-w-[480px] flex flex-col bg-[#0b0f1c] border-l border-white/[0.07] shadow-2xl animate-in slide-in-from-right-4 duration-300">

        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.07] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BookOpen size={15} className="text-white" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/30">Dualis System</p>
              <p className="text-sm font-black text-white leading-none mt-0.5">Guía de uso</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab nav — horizontal scroll */}
        <div className="flex gap-1 px-4 py-3 border-b border-white/[0.07] overflow-x-auto custom-scroll shrink-0 scrollbar-hide">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 ${
                active === s.id
                  ? `${s.bg} ${s.color} border border-current/20`
                  : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
              }`}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scroll px-6 py-5 space-y-6">

          {/* Overview chip */}
          <div className={`${section.bg} border border-white/[0.06] rounded-2xl p-4`}>
            <p className={`text-[10px] font-black uppercase tracking-widest ${section.color} mb-2`}>
              ¿Para qué sirve?
            </p>
            <p className="text-sm text-white/70 font-medium leading-relaxed">
              {section.overview}
            </p>
          </div>

          {/* Steps */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">
              Cómo usarlo — paso a paso
            </p>
            <div className="space-y-2">
              {section.steps.map((step, i) => (
                <div
                  key={i}
                  className="flex gap-3 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] rounded-2xl p-4 transition-colors"
                >
                  {/* Number circle */}
                  <div className={`h-7 w-7 rounded-xl ${section.bg} ${section.color} flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`${section.color} opacity-70`}>{step.icon}</span>
                      <p className="text-[12px] font-black text-white">{step.title}</p>
                    </div>
                    <p className="text-[11px] text-white/50 font-medium leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          {section.tips.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">
                Consejos
              </p>
              <div className="space-y-2">
                {section.tips.map((tip, i) => (
                  <div
                    key={i}
                    className="flex gap-3 items-start bg-amber-500/5 border border-amber-500/10 rounded-xl px-4 py-3"
                  >
                    <Lightbulb size={13} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-200/70 font-medium leading-relaxed">{tip.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-2 pb-4 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/15">
              Dualis System · Guía Interactiva
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
