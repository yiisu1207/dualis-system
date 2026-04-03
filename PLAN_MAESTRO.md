# PLAN MAESTRO — Dualis ERP
> Generado: 2026-04-03 | Actualizar conforme se avance

---

## TUTORIAL: Qué hay, para qué sirve, cómo funciona

### Estructura del Sistema
```
src/
├── components/          # Componentes reutilizables
│   ├── Sidebar.tsx          → Menú lateral (navegación principal)
│   ├── LandingPage.tsx      → Página pública (dualis.online)
│   ├── AccountingSection.tsx → Sección de contabilidad
│   ├── SupplierSection.tsx  → CxP actual (proveedores + movimientos)
│   ├── ConfigSection.tsx    → Configuración del sistema (apariencia, módulos, crédito, fiscal)
│   ├── CustomerViewer.tsx   → Vista anterior de clientes (reemplazada por CxCPage)
│   ├── NDEReceiptModal.tsx  → Recibo de Nota de Entrega (impresión)
│   ├── cxc/                 → Componentes del nuevo CxC
│   │   ├── AccountCard.tsx      → Tarjeta visual por cuenta (BCV, Paralela, etc.)
│   │   ├── CxCClientList.tsx    → Panel izquierdo: lista de clientes con filtros
│   │   ├── CxCClientProfile.tsx → Perfil detallado del cliente
│   │   ├── EntityDetail.tsx     → Panel derecho: resumen, movimientos, config
│   │   ├── LedgerView.tsx       → Tabla de movimientos con filtros y CSV
│   │   ├── MovementFormPanel.tsx → Panel slide-in para registrar Factura/Abono
│   │   └── cxcHelpers.ts       → Funciones de cálculo (tasas, colores, aging, score)
│   └── ...
├── pages/               # Páginas completas
│   ├── CxCPage.tsx          → Deudores/CxC (layout 2 paneles)
│   ├── Inventario.tsx       → Gestión de inventario + Ingreso Rápido (~2400 líneas)
│   ├── Configuracion.tsx    → Configuración completa (~1650 líneas)
│   ├── RecursosHumanos.tsx  → RRHH y nómina
│   ├── DespachoPanel.tsx    → Panel de despacho (confirmar NDE)
│   ├── BillingPage.tsx      → Suscripción y pagos
│   ├── SucursalesManager.tsx → Gestión de sucursales
│   ├── SuperAdminPanel.tsx  → Panel super-admin (interno Dualis)
│   └── pos/
│       ├── PosMayor.tsx     → POS al mayor (facturación B2B)
│       └── PosDetal.tsx     → POS al detal (venta directa)
├── portal/              # Portal de clientes
│   ├── PortalDashboard.tsx  → Dashboard del cliente
│   ├── PortalProntoPago.tsx → Descuentos por pronto pago
│   ├── PortalAbonoForm.tsx  → Formulario de pago del cliente
│   ├── PortalInvoices.tsx   → Facturas del cliente
│   ├── PortalStatement.tsx  → Estado de cuenta
│   ├── PortalGuard.tsx      → Autenticación (PIN)
│   ├── PortalLayout.tsx     → Layout del portal
│   └── usePortalData.ts    → Hook de datos del portal
├── context/             # Contextos React
│   ├── AuthContext.tsx      → Autenticación (Firebase Auth)
│   ├── RatesContext.tsx     → Tasas de cambio (BCV + custom)
│   ├── CartContext.tsx      → Carrito del POS
│   ├── VendorContext.tsx    → Datos del vendedor
│   ├── ToastContext.tsx     → Notificaciones toast
│   └── WidgetContext.tsx    → Sistema de widgets
├── hooks/               # Hooks personalizados
│   ├── useBusinessData.ts   → Datos del negocio (Firestore)
│   ├── useSubscription.ts   → Plan y suscripción
│   └── useRolePermissions.ts → Permisos por rol
├── routes/
│   └── AppRouter.tsx        → Rutas del sistema (subdominios, guards)
├── utils/               # Utilidades
│   ├── formatters.ts        → Formato de moneda, fechas, tasas
│   ├── clientStatus.ts      → Cálculo de estado del cliente
│   ├── planConfig.ts        → Configuración de planes/precios
│   └── configDefaults.ts    → Valores default de AppConfig
├── MainSystem.tsx       → Layout principal (Sidebar + Topbar + contenido)
├── App.tsx              → Raíz de la app (providers)
└── types.ts             → TODOS los tipos TypeScript del sistema
```

### Conceptos Clave

**Tasas de Cambio:**
- BCV = tasa oficial del Banco Central de Venezuela (fija, obligatoria)
- Custom Rates = tasas adicionales que cada negocio configura (ej: "Paralela", "Prueba Tasa")
- Cada cliente puede tener cuentas en múltiples tasas
- Los precios de productos pueden variar según la tasa seleccionada

**Movimientos (Movement):**
- FACTURA = venta/deuda (aumenta lo que el cliente debe)
- ABONO = pago (reduce lo que el cliente debe)
- Cada movimiento pertenece a un accountType (BCV, o cualquier custom rate)
- Los movimientos tienen: monto, tasa usada, moneda (USD/BS), fecha, concepto

**NDE (Nota de Entrega):**
- Documento que acompaña la mercancía al despachar
- Flujo: Venta en POS → NDE generada → Almacén despacha → Cliente recibe
- Estados: pendiente_despacho → despachado / parcial / rechazado
- Comisiones por bulto para vendedor y/o almacenista

**Crédito:**
- Cada cliente puede tener límite de crédito
- Score: EXCELENTE / BUENO / REGULAR / RIESGO (calculado por historial de pago)
- Días de crédito configurables por venta (Contado, 15d, 30d, 45d, 60d)
- Descuento por pronto pago por tier

**Portal de Clientes:**
- Acceso por PIN de 4 dígitos (migrar a OTP)
- El cliente ve: deuda, facturas, estado de cuenta
- Puede subir comprobante de pago → admin aprueba en el sistema

**Suscripción:**
- Planes: Gratis, Básico, Negocio, Pro, Enterprise
- Add-ons: usuarios extra, productos extra, portal, IA, etc.
- Pago manual (no Stripe) — usuario sube comprobante

---

## FASES DE IMPLEMENTACIÓN

### FASE 1 — Fixes Urgentes + UX Base
**Prioridad: CRÍTICA | Semana 1**

- [ ] **1.1 Sidebar fix**: resize listener + deviceMode funcional + transiciones suaves
- [ ] **1.2 Font sizes globales**: sistema de variables CSS para escalar todo desde config
- [ ] **1.3 Formulario de clientes**: modal real reemplazando prompt(), campos completos
- [ ] **1.4 Panel personalizable**: posición configurable (derecha/centro/izquierda/arriba/abajo)
- [ ] **1.5 Detector de duplicados**: alertar al crear cliente si cédula/RIF/teléfono ya existe

---

### FASE 2 — Funcionalidad Urgente del Cliente
**Prioridad: CRÍTICA (genera venta) | Semana 1-2**

- [ ] **2.1 Descuento ficticio en NDE**: markup automático + descuento visual por días de crédito
- [ ] **2.2 Límite de crédito en POS**: validación antes de facturar a crédito
- [ ] **2.3 POS Mayor: bultos + unidades**: facturar por bulto o unidad, mostrar stock
- [ ] **2.4 Devoluciones y notas de crédito**: anular parcial/total, devolver stock, NC

---

### FASE 3 — CxP + Ingreso Mercancía
**Prioridad: ALTA | Semana 2-3**

- [ ] **3.1 CxP rediseño 2 paneles**: como CxC pero para proveedores
- [ ] **3.2 Ingreso mercancía mejorado**: extraer a componente, secciones colapsables, flujo claro
- [ ] **3.3 Costo promedio ponderado**: recalcular costo al ingresar mercancía a diferente precio

---

### FASE 4 — Portal de Clientes Completo
**Prioridad: ALTA | Semana 3-5**

- [ ] **4.1 Autenticación OTP**: migrar de PIN 4 dígitos a código por email/SMS
- [ ] **4.2 Cédula/RIF obligatorio**: con validación de formato + API SENIAT si disponible
- [ ] **4.3 Dashboard completo**: deuda total, por cuenta, límite, score, tier fidelidad
- [ ] **4.4 Facturas pendientes**: lista con filtros, seleccionar cuál pagar
- [ ] **4.5 Pagos parciales**: pagar parte de una factura específica
- [ ] **4.6 Abono → aprobación admin**: el pago queda pendiente hasta que admin confirme en CxC
- [ ] **4.7 Catálogo + auto-pedido**: cliente ve productos, arma pedido, negocio aprueba → factura
- [ ] **4.8 Estado de cuenta PDF**: descargable con membrete
- [ ] **4.9 Recibo de pago automático**: se genera al confirmar abono
- [ ] **4.10 QR en facturas/NDE**: escanear → va directo al portal
- [ ] **4.11 PWA**: manifest.json + service worker → se instala como app
- [ ] **4.12 Notificaciones push**: vencimientos, pagos confirmados, pedidos aprobados
- [ ] **4.13 Firma digital NDE**: cliente firma desde su teléfono que recibió mercancía
- [ ] **4.14 Chat cliente ↔ negocio**: mensajería simple dentro del portal
- [ ] **4.15 Compensación entre cuentas**: saldo a favor en una cuenta cubre deuda en otra
- [ ] **4.16 Marca blanca**: logo y colores del negocio en el portal

---

### FASE 5 — Sistema de Fidelidad
**Prioridad: MEDIA-ALTA | Semana 5-6**

- [ ] **5.1 Puntos por compra**: X puntos por cada $ facturado y pagado a tiempo
- [ ] **5.2 Tiers/Niveles**: Bronce → Plata → Oro → Platino → Diamante → Elite
- [ ] **5.3 Beneficios por tier**: + límite crédito, + días gracia, % descuento, badges
- [ ] **5.4 Bonificación pronto pago**: puntos extra por pagar antes del vencimiento
- [ ] **5.5 Panel fidelidad en portal**: cliente ve sus puntos, progreso, próximo tier
- [ ] **5.6 Listas de precios por grupo**: precios diferenciados por tier/segmento
- [ ] **5.7 Segmentación de clientes**: tags personalizables (VIP, moroso, mayorista, etc.)

---

### FASE 6 — Resiliencia y Datos
**Prioridad: MEDIA | Semana 6-7**

- [ ] **6.1 Offline mode**: Firestore offline persistence + cola de sincronización
- [ ] **6.2 Backup/export**: botón para exportar todo a Excel/JSON
- [ ] **6.3 Importación masiva**: CSV/Excel para inventario, clientes, proveedores
- [ ] **6.4 Error boundary global**: componente que crashea no tumba todo el sistema
- [ ] **6.5 Caché inteligente**: React Query/SWR para reducir lecturas Firestore

---

### FASE 7 — Ventas Avanzadas
**Prioridad: MEDIA | Semana 7-8**

- [ ] **7.1 Cotizaciones/Presupuestos**: generar → aprobar → convertir en factura
- [ ] **7.2 Facturación recurrente**: plantilla de pedido → auto-genera en fecha programada
- [ ] **7.3 Combos/Kits**: agrupar productos con precio especial, descontar stock individual
- [ ] **7.4 Pedidos pendientes/backorders**: registrar cuando no hay stock, notificar al llegar
- [ ] **7.5 Lector código barras móvil**: cámara del teléfono como escáner

---

### FASE 8 — UX Avanzada
**Prioridad: MEDIA | Semana 8-9**

- [ ] **8.1 Búsqueda global (Ctrl+K)**: buscar clientes, productos, facturas desde un input
- [ ] **8.2 Atajos de teclado**: Ctrl+N, F2, etc. con overlay de ayuda
- [ ] **8.3 Onboarding interactivo**: tour guiado con tooltips (react-joyride)
- [ ] **8.4 Modo kiosco**: POS pantalla completa sin sidebar/topbar
- [ ] **8.5 Tema claro**: modo light además del dark actual
- [ ] **8.6 Accesibilidad**: contraste, aria-labels, navegación por teclado
- [ ] **8.7 Galería de productos**: fotos para catálogo e inventario
- [ ] **8.8 Calculadora rentabilidad**: margen, ganancia, punto de equilibrio al ingresar producto

---

### FASE 9 — Inventario Avanzado
**Prioridad: MEDIA | Semana 9-10**

- [ ] **9.1 Transferencias entre almacenes**: origen → tránsito → destino con trazabilidad
- [ ] **9.2 Lotes y vencimientos**: fecha de vencimiento por lote, alertas FEFO
- [ ] **9.3 Conteo físico**: inventario real vs sistema, diferencias, ajuste con justificación
- [ ] **9.4 Productos con variantes**: talla, color, sabor con SKU y stock propio
- [ ] **9.5 Alertas de reposición inteligente**: predicción de agotamiento por velocidad de venta

---

### FASE 10 — Finanzas y Reportes
**Prioridad: MEDIA | Semana 10-11**

- [ ] **10.1 Flujo de caja proyectado**: ingresos y egresos esperados a 30/60/90 días
- [ ] **10.2 Rentabilidad por producto**: margen, rotación, Pareto 80/20
- [ ] **10.3 Cierre de caja**: cuadre de efectivo vs sistema al final del día
- [ ] **10.4 Conciliación bancaria real**: importar CSV del banco, cruzar automáticamente
- [ ] **10.5 Multi-tasa histórica**: reportes en dólares del momento vs dólares de hoy
- [ ] **10.6 Recibos/facturas PDF**: generador profesional con logo y datos fiscales

---

### FASE 11 — Comunicaciones y CRM
**Prioridad: MEDIA-BAJA | Semana 11-12**

- [ ] **11.1 Notificaciones WhatsApp/email**: factura vence, stock bajo, pago recibido
- [ ] **11.2 Recordatorios progresivos**: 5d antes → día → 5d después → 15d → 30d
- [ ] **11.3 Historial de comunicaciones**: registro de llamadas, visitas, promesas de pago
- [ ] **11.4 Cumpleaños/fechas especiales**: capturar y enviar felicitación automática
- [ ] **11.5 Agenda de cobranza**: vista calendario por vencimientos, marcar visitado/promesa
- [ ] **11.6 Geolocalización clientes**: mapa para planificar rutas de cobranza/despacho
- [ ] **11.7 Rutas de despacho**: orden óptimo de entrega con Google Maps

---

### FASE 12 — Secciones Pendientes (Fix y Mejora)
**Prioridad: MEDIA | Semana 12-13**

- [ ] **12.1 Comparar Libros**: fix sincronización, datos que no aparecen, UI más clara
- [ ] **12.2 Estadísticas**: dashboards más completos y útiles
- [ ] **12.3 Auditoría IA**: rehacer completamente, hacer la IA útil
- [ ] **12.4 Contabilidad**: mejorar interfaz y funcionalidad
- [ ] **12.5 Conciliación**: mejorar flujo
- [ ] **12.6 Sucursales**: gestión más robusta
- [ ] **12.7 Configuración**: agregar todas las funciones del sistema + personalización completa
- [ ] **12.8 Panel Despacho**: mejorar interfaz y funcionalidad
- [ ] **12.9 Libro Movimientos POS**: mejorar interfaz

---

### FASE 13 — Infraestructura y Escalabilidad
**Prioridad: BAJA (pero importante) | Semana 13-14**

- [ ] **13.1 Rate limiting Firebase**: App Check + Security Rules estrictas
- [ ] **13.2 Tests automatizados**: funciones críticas (tasas, aging, score, descuentos)
- [ ] **13.3 Monitoreo/analytics**: Firebase Analytics o Mixpanel
- [ ] **13.4 API pública**: REST API documentada para integraciones
- [ ] **13.5 Webhooks configurables**: eventos → URL del cliente
- [ ] **13.6 Multi-empresa**: selector de empresa sin cerrar sesión
- [ ] **13.7 i18n completo**: inglés y portugués

---

### FASE 14 — Logística Externa
**Prioridad: BAJA | Semana 14-15**

- [ ] **14.1 Conexión delivery apps**: MRW, Zoom, Tealca — guías de envío
- [ ] **14.2 Tracking de envíos**: seguimiento desde el sistema

---

### FASE 15 — Fiscal / SENIAT (Último)
**Prioridad: BAJA (por ahora) | Cuando sea necesario**

- [ ] **15.1 Libro de Ventas**: formato SENIAT
- [ ] **15.2 Libro de Compras**: formato SENIAT
- [ ] **15.3 Retenciones IVA**: cálculo y reporte
- [ ] **15.4 Formato declaración**: exportar datos para declaración

---

## NOTAS TÉCNICAS

### Descuento Ficticio NDE (Fase 2.1)
```
Precio normal:  $100
Crédito 30d con 5% "descuento" configurado:
  Precio mostrado: $100 / (1 - 0.05) = $105.26
  Descuento 5%:   -$5.26
  NETO:           $100.00

El cliente ve "descuento" pero el negocio no pierde margen.
Legal: es financiamiento comercial. El precio de lista incluye costo financiero.
```

### Font Scaling (Fase 1.2)
```css
/* Variables CSS que escalan con la preferencia del usuario */
:root[data-font="xs"]   { --f-micro: 9px;  --f-small: 10px; --f-base: 11px; --f-md: 12px; --f-lg: 14px; }
:root[data-font="sm"]   { --f-micro: 10px; --f-small: 11px; --f-base: 12px; --f-md: 13px; --f-lg: 15px; }
:root[data-font="base"] { --f-micro: 11px; --f-small: 12px; --f-base: 13px; --f-md: 14px; --f-lg: 16px; }
:root[data-font="lg"]   { --f-micro: 12px; --f-small: 13px; --f-base: 14px; --f-md: 16px; --f-lg: 18px; }
:root[data-font="xl"]   { --f-micro: 13px; --f-small: 14px; --f-base: 16px; --f-md: 18px; --f-lg: 20px; }

/* Reemplazar text-[10px] → text-[var(--f-small)] en todo el codebase */
```

### Portal: Flujo de Auto-Pedido (Fase 4.7)
```
Cliente en portal → ve catálogo → agrega productos → selecciona cuenta + días crédito
  → "Enviar Pedido" → status: pendiente_aprobacion
  → Admin ve en CxC/notificación → Aprueba → se convierte en Movement tipo FACTURA
  → Stock se descuenta → NDE se genera si aplica
  → Cliente ve factura en su portal
```

### Portal: Flujo de Pago (Fase 4.4-4.6)
```
Cliente en portal → ve facturas pendientes → selecciona cuál(es) pagar
  → ingresa monto (total o parcial) → selecciona método de pago
  → sube comprobante (foto/captura) → "Enviar Pago"
  → status: pending_review → Admin ve en CxC → sección "Pagos por Aprobar"
  → Admin aprueba → Movement tipo ABONO se crea → deuda se reduce
  → Cliente recibe notificación + recibo descargable
```

### Sistema de Fidelidad (Fase 5)
```
Tiers:
  Bronce    (0 pts)      → sin beneficios extra
  Plata     (500 pts)    → +$200 crédito, +5 días, 2% desc
  Oro       (2,000 pts)  → +$500 crédito, +10 días, 3% desc
  Platino   (5,000 pts)  → +$1,000 crédito, +15 días, 5% desc
  Diamante  (15,000 pts) → +$2,500 crédito, +30 días, 7% desc
  Elite     (50,000 pts) → +$5,000 crédito, +45 días, 10% desc

Puntos: 10 pts por cada $1 facturado Y pagado a tiempo
Bonus: x2 puntos si paga antes del vencimiento
Penalización: -5% puntos totales por cada factura que pase 30d de mora
```

---

## ESTADO ACTUAL
- [x] CxC rediseñado (2 paneles, custom rates, helpers)
- [x] Fix landing comparativa (grid-cols-7)
- [x] Eliminar /onboarding
- [ ] Todo lo demás está pendiente → empezar por Fase 1
