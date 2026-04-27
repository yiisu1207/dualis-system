# Roadmap de Innovación — Dualis ERP

> Sistema ERP venezolano multi-tenant. Pensado desde cero para minimarket VE,
> con IA disponible y contexto inflacionario.
>
> Última actualización: 2026-04-26

---

# 🗺️ Mapa del documento

1. **Parte 1** — Backlog de innovación (ideas core del sistema)
2. **Parte 2** — Sprint actual: refactor de secciones + Portal Clientes + Landing + Mobile
3. **Parte 3** — Marketing, comunidad y lanzamiento

---

# Parte 1 — Backlog de innovación core

## 🚀 Ideas innovadoras seleccionadas

### #2. Cobertura predictiva por SKU ⭐⭐⭐⭐
- 4-8 semanas de ventas → velocidad media + variabilidad por SKU
- Badge en columna "Cobertura": verde/ámbar/rojo
- "Pepsi 2L: 6 días para agotar"
- **Esfuerzo**: bajo (2h)

### #3. Detección de robo/merma con patrones ⭐⭐⭐⭐⭐
- Patrones: producto que pierde stock siempre el mismo día/hora
- Cajeros con % anulaciones >2x el promedio
- SKUs con varianzas constantes en conteo físico
- Alerta semanal con detalle del patrón
- **Esfuerzo**: medio-alto (5-6h)

### #5. Ofertas auto para productos próximos a vencer ⭐⭐⭐⭐
- Detecta vencimiento <30d + stock alto
- Sugiere descuento + cartel imprimible
- Convierte merma en oportunidad
- **Esfuerzo**: medio (3-4h)

### #6. Lista de compras inteligente ⭐⭐⭐⭐
- Mezcla bajo stock + predicción semana + margen alto
- Excluye próximos a vencer
- PDF accionable: "Lleva X, NO compres Y"
- **Esfuerzo**: medio (4h)

### #8. Comparador precios crowdsourced (zona) ⭐⭐⭐⭐
- Cada Dualis aporta precios anonimizados
- "Tu Coca Cola está 11% más cara que el promedio de tu zona"
- Solo agregado público
- **Esfuerzo**: alto (8-10h, backend agregación)

### #9. Cobranza inteligente con IA ⭐⭐⭐⭐⭐
- CxC ordenado por **probabilidad de cobro**, no por monto
- "Llama HOY a estos 5 clientes. Probabilidad 87%"
- **Flujo de escalamiento 5 niveles** (decidido):
  1. Día 1-3 vencido → recordatorio cordial WA
  2. Día 7-15 → insistencia firme + email
  3. Día 30 → suspensión POS automática (solo contado)
  4. Día 45 → propuesta plan de pago vía portal
  5. Día 90+ → lista negra interna + reporte mensual de incobrables
- **Esfuerzo**: medio-alto (5h core + 4h escalamiento)

### #11. Etiquetas QR con precio dinámico ⭐⭐⭐⭐
- 1 sola impresión, QR del producto
- Cliente escanea → ve precio actual + ofertas hora
- En VE con BCV diario, evita reimprimir
- **Esfuerzo**: medio (4h)

### #12. Modo "Aprendiz IA" ⭐⭐⭐⭐
- 2-4 semanas observando combos, horas, clientes
- Sugiere proactivamente: "Cliente Salazar siempre compra cerveza+papas, llamarlo"
- Detecta combos naturales
- **Esfuerzo**: alto (10h+)

### #13. Health check semanal ⭐⭐⭐⭐
- Lunes 8am: digest "234 ventas (+12%), margen $1,250"
- **Monetización 3 niveles** (decidido):
  - Free: email + push web + in-app
  - Pago $5/mes: WhatsApp Business API
  - Free con BYOK: conecta tu propio número WA
- **Esfuerzo**: medio (3h)

### #14. Historial visual del producto ⭐⭐⭐
- Timeline: costo histórico + precio histórico + stock superpuestos
- Inflación SKU por SKU sin Excel
- **Esfuerzo**: medio (3h)

### #15. Comparador antes/después de cambios masivos ⭐⭐⭐
- Preview obligatorio antes de "subir todos los precios 10%"
- Tabla con Δ
- Si #8 está activo: bandera "estos 12 quedarían más caros que zona"
- **Esfuerzo**: bajo-medio (2-3h)

---

## 📋 Features de baja fricción (catálogo)

| ID | Feature | Estrellas |
|---|---|---|
| A | Lookup auto al subir CSV/Excel | ⭐⭐⭐ |
| B | Lookup hook al guardar producto | ⭐⭐⭐ |
| C | Widget "productos sin imagen" en Inventario | ⭐⭐⭐ |
| D | Cámara celular para foto producto | ⭐⭐ |
| E | Escáner barcode con cámara | ⭐⭐⭐ |
| H | Detector duplicados por barcode + fusión | ⭐⭐⭐ |
| I | Galería pública compartida entre tenants | ⭐⭐⭐ |

---

## ❌ Descartadas

- Web scraping tiendas online VE (TOS, banean IP)
- Generar imágenes con AI (ficticias, no reales del producto)
- OCR etiqueta producto (barcode + API es más rápido)

---

# Parte 2 — Sprint actual (refactor + nuevo)

## ⚖️ Bloque 0 — Auditoría legal (CRÍTICO, va primero)

**Contexto**: Providencia SNAT/2011/00071 reserva términos fiscales. Dualis no tiene autorización.

**Acciones**:
- NDE / Nota Entrega / Comprobante Despacho → **Pedido Interno** + **Hoja Preparación**
- `estadoNDE` → `estadoPedido`
- "Nro Control" → "Nro Pedido Interno"
- Disclaimer reforzado en cada documento
- Landing: "Panel despacho" → "Panel preparación pedidos"

**Archivos**: `PosMayor.tsx`, `DespachoPanel.tsx`, `NDEReceiptModal.tsx` (rename), `ReceiptModal.tsx`, `NotificationCenter.tsx`, `LandingPage.tsx`, `Terms.tsx`, `MainSystem.tsx`, `LegalDisclaimerModal.tsx`, `shareLink.ts`, `ComisionesReporte.tsx`

---

## 🐛 Bug crítico de routing

8 entradas faltan en `tabRoutes` de `MainSystem.tsx`:
`cotizaciones`, `recurrentes`, `transferencias`, `historial`, `flujocaja`, `estadisticas`, `pareto`, `rentabilidad`

Sin esto, refactorizar es inútil — las secciones ni se ven.

---

# 🎯 SPRINT EN 6 FASES

---

## 🔵 FASE 1 — Fundamentos (1-2h)

| Item | Acción |
|---|---|
| Bloque 0 | Auditoría legal NDE → Pedido Interno |
| Bug routing | 8 entradas en `tabRoutes` |
| S20 | Eliminar Rentabilidad (placeholder 22 líneas) |
| S21 | Deprecar Comparar Libros del sidebar |
| S6 | Transferencias condicional a `almacenes.length > 1` |
| S7 | Renombrar "Libro Movimientos" → "Historial de Ventas" |

**Salida**: sistema sin secciones rotas, terminología legal correcta.

---

## 🟢 FASE 2 — Rediseños grandes Admin (medio día)

| Item | Acción |
|---|---|
| **S2** | Cajas: layout normal + monitor en vivo + comparativa cajeros + alertas |
| **S3** | Panel Pedidos Internos: doble cola POS Mayor + portal, rutas, picking list |
| **S8** | Agenda Cobranza: cola IA priorizada + 5 niveles escalamiento + acciones masivas WA |
| **S11** | Reclamos: tipificación + SLA + templates + estadísticas |

---

## 🟡 FASE 3 — Finanzas + Reportería (1 día)

| Item | Acción |
|---|---|
| **S9** | Tesorería: auditar errores → vista consolidada + salud + IGTF |
| **S10** | Flujo Caja: proyección 7/30/90/180d + escenarios + export bancario |
| **S13** | **Reportes unificado** (absorbe S18 Estadísticas + S19 Pareto + Contabilidad) en 6 tabs |
| **S14** | Conciliación: 2 tabs + integración `PortalAbonoForm` + matching estado cuenta |
| **S16** | Comisiones: ranking podio + heatmap + drill-down + liquidación |

---

## 🟠 FASE 4 — UX, Equipo, Configuración (1 día)

| Item | Acción |
|---|---|
| **S4** | Cotizaciones: empty state + plantillas + QR aprobación + recordatorio WA |
| **S5** | Recurrentes: calendario + preview + pausa masiva + auto-rebozar inflación |
| **S15** | RRHH: refactor SOLO visual + avatares + quick actions |
| **S17** | Sucursales: grid foto + KPIs + comparativa + mapa |
| **S22** | Configuración: refactor visual + 5 grupos + nuevas secciones |

---

## 🔴 FASE 5 — Innovación pura (1-2 días)

| Item | Acción |
|---|---|
| **S12** | Chat Portal con IA Claude (sugerencias + categorización + métricas) |
| **S23** | Ayuda reescrito: tours + videos + FAQ + glossary + contextual help |
| **S24** | Grupo Sistema: Notificaciones, Auditoría, Estado, Integraciones |
| **S25** | **Dashboard nuevo** (ver detalle abajo) |

### 🆕 S25. Dashboard nuevo — diseño definitivo

**Filosofía**: en 30 segundos el dueño debe saber **qué hacer ahora**, no leer números planos.

**5 zonas**:

```
ZONA 1 — Pulso hoy (4 KPIs accionables con comparativos y CTA)
  Ventas hoy +12% · Margen real 37% · Cobranza vencida $748 · Pedidos cola 3

ZONA 2 — Qué hacer ahora (lista priorizada IA)
  🔴 URGENTE   Cliente Pérez $200 vencido 45d, prob cobro 78% [Llamar]
  🟠 IMPORTANTE 6 productos se agotan esta semana [Lista compras]
  🟡 ATENCIÓN  12 productos vencen <30d con stock alto [Activar promo]
  🟢 OPORTUNIDAD Hoy viernes vendes +40% cervezas [Pricing especial]

ZONA 3 — Inteligencia (2 columnas)
  Anomalías detectadas      Health check semanal
  (engancha #3)             (engancha #13)

ZONA 4 — Visualizaciones
  Ventas 30d con tendencia   Distribución métodos pago

ZONA 5 — Footer flotante (>6pm)
  🌙 ¿Cerrando el día? [Iniciar cierre guiado]
```

**Estados especiales**:
- **Negocio nuevo** → wizard de bienvenida en 5 pasos
- **Todo al día** → mensaje positivo + sugerencias de crecimiento
- **Fin de mes** → banner especial con reporte mensual

**Innovación**: el Dashboard **aprende de ti** — si nunca clickeas charts, los oculta; si siempre vas a Cobranza, sube esa card a la posición 1. Personalización pasiva.

**Esfuerzo**: 13-20h según features incluidas.

---

## 🟣 FASE 6 — Portal Clientes + Landing + Mobile + Marketing

> Esta fase es nueva y MASIVA. La separamos del resto porque cambia la cara externa del producto.

### S26. Portal de Clientes — REESCRITURA COMPLETA

**Estado actual**: roto desde el registro. 13 archivos en `src/portal/`. UX inconsistente, flujos rotos.

**Nuevo diseño**:

#### Onboarding del cliente (NUEVO)
- Cliente llega vía link compartido → landing del portal personalizada con marca del negocio
- Registro en 2 pasos: nombre + cédula/RIF + teléfono
- Verificación SMS opcional (si negocio paga el add-on)
- Tour guiado al entrar primera vez (5 stops): "Aquí ves facturas · Aquí pagas · Aquí pides · Aquí chateas · Aquí reclamos"

#### Dashboard cliente (`PortalDashboard`)
- Saldo deuda destacado
- Próxima factura a vencer con countdown
- Beneficios fidelidad (puntos, tier actual, próximo tier)
- Última actividad (compras, pagos, mensajes)
- Acceso rápido a 4 acciones top: Pagar · Pedir · Estado de cuenta · Chat

#### Catálogo (`PortalCatalog`)
- Productos con foto, precio actual (con tasa BCV en vivo), disponibilidad
- Filtros: categoría, precio, oferta, en stock
- Búsqueda con autocompletado
- Carrito persistente
- Checkout: elegir entrega/retiro + pagar (entra a cola admin como Pedido del Portal)

#### Pagos (`PortalAbonoForm`)
- Form actual mejorado: monto, banco origen, banco destino, fecha, ref, foto comprobante
- **Nueva integración**: si Megasoft está conectado, opción "Pagar con C2P" (pago instantáneo verificado)
- Notificación al admin push instantánea
- Cliente ve estado en vivo: "Enviado" → "Verificando" → "Conciliado" o "Rechazado con motivo"

#### Estado de cuenta (`PortalStatement`)
- Movimientos cronológicos
- Filtros por período
- Export PDF para imprimir
- Saldo running para visualizar

#### Pronto pago (`PortalProntoPago`)
- Si paga antes de fecha X, descuento Y%
- Cálculo automático del descuento según política del negocio
- Cuenta regresiva visual

#### Fidelidad (`PortalLoyalty`)
- Puntos actuales + historial
- Tier (Bronze/Silver/Gold/Platinum) con progreso visual
- Beneficios desbloqueados
- Catálogo de canjes

#### Chat (`PortalChat`)
- Conversación con el negocio
- Adjuntar fotos
- Notificación push cuando responden
- Historial buscable

#### Reclamos (`PortalDispute`)
- Tipificación clara (defectuoso, faltante, mala atención, otro)
- Adjuntar fotos
- Tracking de estado
- Notificación cuando se resuelve

#### Verificación de pago pública (`PortalPaymentVerify`)
- Sin login, escaneable por QR
- Cliente le muestra al cajero la verificación de su pago

**Estimación rediseño portal**: 12-15h

---

### S27. LandingPage — REESCRITURA COMPLETA inspirada en Plade/Finapartner/Odoo

**Análisis de los 3 referentes**:
- **Plade**: minimalista, hero con producto, secciones funcionales, CTA claros
- **Finapartner**: gradientes vivos, mucho movimiento, prueba social, testimoniales reales
- **Odoo**: arquitectura modular visible, "todo en uno", precios transparentes, demo accesible

**Nueva LandingPage (979 líneas → reescritura completa)**:

#### Hero (above the fold)
- Headline: "El ERP venezolano que tu negocio merece"
- Sub: "Inventario · POS · CxC · Portal de Clientes — todo en uno, hecho para Venezuela"
- 2 CTAs: [Probar Gratis 30 días] [Ver Demo en Vivo]
- Mockup animado del Dashboard nuevo
- Trust badges: "Hecho en VE 🇻🇪 · Sin tarjeta para empezar · Soporte WhatsApp"

#### Bento grid de features (estilo Apple)
6-8 cards visuales con animación hover, cada una mostrando una capacidad:
- 📦 Inventario inteligente (con cobertura predictiva)
- 💰 Cobranza con IA
- 🏪 POS para VE (multi-moneda, IGTF, BCV)
- 👥 Portal de clientes
- 📊 Reportes y analytics
- ⚖️ Tasa BCV en vivo
- 🔐 Seguridad enterprise
- 📱 Funciona en celular

#### Comparativo VE-honesto (sin datos falsos)
Tabla **Dualis vs Plade vs Excel manual**:
- Solo features verificables (no inventar números)
- Honestidad: "Plade tiene módulo X que nosotros no", pero "tenemos Y que ellos no"

#### Sección "Por qué Dualis si ya hay Plade?"
Diferenciadores claros:
- Multi-tenant cloud-native (no instalar nada)
- IA integrada (cobranza, predicción)
- Portal de clientes incluido
- Hecho 2026 con stack moderno
- Soporte por WhatsApp en español venezolano

#### Demo interactiva
Iframe o video corto (60s) mostrando el sistema en acción.

#### Precios transparentes
3 planes claros: Trial · Negocio · Enterprise
Sin "Contactar ventas" para precio (anti-patrón).

#### Testimoniales y prueba social
- **REAL only**: pedir testimonio a beta users actuales
- Logos de negocios que lo usan (con permiso)
- Métricas reales: "X negocios activos, Y ventas procesadas este mes" (solo si las tenemos verificables)

#### FAQ
10-15 preguntas frecuentes con accordion

#### Footer rico
- Contacto: WhatsApp + email + redes sociales
- Links: Términos · Privacidad · Changelog · Status
- Newsletter opt-in

**Inspiración técnica**:
- Gradientes vivos como Finapartner
- Modularidad visible como Odoo
- Limpieza como Plade
- Animaciones sutiles con Framer Motion (ya está en el stack? verificar)

**Estimación rediseño landing**: 10-12h

---

### S28. Adaptación MOBILE completa — TODO debe funcionar en celular

**Estado actual**: el sistema usa breakpoints `lg:` pero muchas vistas no son verdaderamente mobile-first.

**Auditoría sección por sección**:
- [ ] Login + Register
- [ ] Sidebar (ya tiene swipe-to-close, mejorar)
- [ ] Dashboard (responsive ya planificado)
- [ ] Inventario (tablas largas → cards en mobile)
- [ ] POS Detal (mobile cashier ya parcial, completar)
- [ ] POS Mayor
- [ ] Cajas
- [ ] Despacho
- [ ] Cotizaciones
- [ ] Recurrentes
- [ ] Transferencias
- [ ] Historial
- [ ] Cobranza
- [ ] CxP
- [ ] Tesorería
- [ ] Flujo Caja
- [ ] Reclamos
- [ ] Chat Portal
- [ ] Reportes
- [ ] Conciliación
- [ ] RRHH
- [ ] Comisiones
- [ ] Sucursales
- [ ] Configuración
- [ ] Ayuda
- [ ] Portal Cliente (todas las páginas)
- [ ] Landing
- [ ] Modales (BankAccountModal, NewClientModal, etc.)

**Patrones a aplicar**:
- Tablas anchas → en mobile se transforman en cards apilados
- Modales → en mobile son fullscreen drawers desde abajo
- Sidebars de filtros → en mobile son bottom sheets
- Acciones primarias → siempre fixed bottom (pulgar accesible)
- Touch targets mínimo 44x44px
- Tipografía mínimo 14px en mobile
- Tablas con scroll horizontal indicado visualmente

**PWA install prompt**:
- Banner "Instala Dualis en tu celular" cuando se cumplen criterios
- Manifest.json optimizado
- Iconos para iOS y Android

**Innovaciones mobile-only**:
- **Pull-to-refresh** en listas
- **Swipe actions** en cards (swipe izq = anular, der = pagar)
- **Long press** para quick edit
- **Cámara directa** desde formularios (foto producto, foto comprobante, etc.)
- **Vibración háptica** al confirmar acciones críticas (`navigator.vibrate(50)`)
- **Modo landscape** para POS (más ancho útil para items)
- **Bottom navigation bar** en mobile (no sidebar) para acceso 1-touch a 5 secciones top

**Estimación adaptación mobile**: 15-20h (auditoría + ajustes por sección)

---

### S29. Sistema de notificaciones de actualizaciones — "What's New"

**Cómo notificar a usuarios existentes de cosas nuevas**:

#### In-app
- Badge rojo en avatar/menú cuando hay novedad sin leer
- Modal "Novedades de Dualis" la primera vez que entran tras release
- Slider con 3-5 highlights con GIFs/screenshots
- "No mostrar de nuevo" + "Ver todas las novedades en Changelog"

#### Por canal externo
- **Email**: digest mensual "Esto cambió en Dualis este mes"
- **WhatsApp**: opcional para usuarios opt-in (BYOK API)
- **Push web** (si aceptaron): "Nueva feature: Cobranza con IA → Pruébala"
- **Banner en login**: "Tenemos novedades — [Ver]"

#### Integrado al sistema
- `Changelog.tsx` (ya existe) → enriquecer con categorías y filtros
- Sección Sistema → Changelog destacado
- Tooltip "NEW" en items del sidebar/menús nuevos

#### Comunicación proactiva
- Newsletter mensual desde sistema (no marketing puro, valor real)
- Posts en redes sociales cuando hay release
- Video corto en YouTube por cada feature grande

**Estimación**: 5-7h (componentes nuevos + integración)

---

### S30. Lista de precios imprimible para vendedores de calle

**Necesidad real**: vendedores de calle (no en POS) necesitan llevar lista de precios impresa al cliente.

**Diseño**:
- En Inventario, botón nuevo: "📋 Generar lista de precios"
- Modal de configuración:
  - Filtros: categorías, marcas, productos seleccionados
  - Formato: A4 / Carta / Térmico (impresoras POS de bodega)
  - Columnas: Código · Producto · Precio Detal · Precio Mayor · Precio Especial · Stock disponible (opcional)
  - Encabezado: logo + nombre negocio + fecha + tasa BCV
  - Footer: "Precios sujetos a tasa BCV del día. Vendedor: ___"
  - Idiomas múltiples si necesario
  - Densidad: compacta (más productos por hoja) o espaciada
- Botón generar → PDF descargable
- **Variantes por vendedor**: cada vendedor puede tener su lista personalizada (productos que vende él, márgenes)
- **Versión digital QR**: el PDF tiene QR al final que lleva al catálogo online del portal (siempre actualizado)
- **Histórico**: guardar las listas generadas (auditable: "qué precios usaba Juan el 15 abril")

**Innovación adicional**:
- **Cuando cambias precios masivos**, sistema avisa: "Tienes 4 vendedores con listas impresas viejas. ¿Generar listas nuevas y enviarlas por WA?"
- **Auto-update por email/WA**: cada lunes, vendedores reciben lista actualizada automáticamente

**Estimación**: 4-6h

---

# Parte 3 — Marketing, comunidad, lanzamiento

## 📣 S31. Estrategia de redes sociales

### Cuentas a crear
- **Instagram** (@dualis.erp): visual, reels mostrando features, stories diarias con tips VE
- **TikTok** (@dualiserp): videos cortos divertidos sobre dolores de bodegueros + cómo Dualis los resuelve
- **Facebook** (Dualis ERP Venezuela): comunidad, posts informativos, grupo opcional
- **WhatsApp Business** (canal de difusión): novedades, tips, soporte rápido
- **YouTube** (Dualis Software): tutoriales, casos de uso, lanzamientos
- **LinkedIn** (Dualis): para B2B serio, casos de éxito

### Contenido por canal
| Canal | Frecuencia | Formato |
|---|---|---|
| Instagram | 3-4 posts/semana | Carrousel + reels + stories |
| TikTok | 2-3 videos/semana | 30-60s, dolor + solución |
| Facebook | 2-3 posts/semana | Texto + imagen + grupo |
| WhatsApp | 1 broadcast/semana | Tip rápido o novedad |
| YouTube | 1-2 videos/semana | Tutorial 3-5 min |
| LinkedIn | 1-2 posts/semana | Caso de éxito o thought leadership |

### Tono de marca
- Cercano, venezolano, sin tecnicismos innecesarios
- Honesto sobre limitaciones
- Útil siempre (cada post enseña algo)
- Visual: paleta morada/azul de Dualis, mockups del sistema

---

## 🎬 S32. Videos explicativos en YouTube

### Lista priorizada de videos a hacer

**Serie 1: Onboarding (8 videos cortos)**
1. ¿Qué es Dualis? (90s)
2. Cómo crear tu cuenta (2min)
3. Configurar tu negocio en 5 minutos (5min)
4. Cargar tus primeros productos (3min)
5. Hacer tu primera venta (POS Detal) (3min)
6. Hacer tu primera venta a crédito (POS Mayor) (4min)
7. Cobrar a un cliente (CxC) (3min)
8. Ver reportes de tu día (2min)

**Serie 2: Features avanzadas (10 videos)**
1. Cobranza con IA (4min)
2. Predicción de stock (3min)
3. Detección de robo/merma (3min)
4. Conciliación bancaria (5min)
5. Portal de clientes (4min)
6. Pedidos del portal (3min)
7. Multi-sucursal (4min)
8. Comisiones y nómina (5min)
9. Configuración avanzada (5min)
10. Tasas BCV/IGTF/USD-Bs (3min)

**Serie 3: Casos de uso reales (5 videos)**
1. "Día en la vida de un bodegón con Dualis"
2. "Día en la vida de una panadería con Dualis"
3. "Día en la vida de una farmacia con Dualis"
4. "Cómo recuperé $5,000 en CxC olvidadas"
5. "Cómo detecté un cajero deshonesto"

**Serie 4: Comparativos honestos (3 videos)**
1. Dualis vs Plade
2. Dualis vs Excel manual
3. Dualis vs Odoo (para PYMES)

### Producción
- Pantalla compartida + voz natural (no AI voice)
- Subtítulos automáticos español
- Thumbnails con cara/emoción + texto grande
- Intro de marca de 3s al inicio
- CTA al final: "Prueba Dualis gratis 30 días"

**Estimación**: producción ~30-40h total para los 26 videos

---

## 📰 S33. Sitios y plataformas a promocionar

### Directorios y catálogos
- ProductHunt (lanzamiento como "Producto del día")
- Capterra (categoría ERP)
- G2 (categoría POS/Inventario)
- GetApp
- Software Advice
- AppSumo (lifetime deal evento de lanzamiento)

### Comunidades
- Reddit: r/venezuela, r/EmprendedoresLatam, r/SaaS, r/POS
- Foros locales VE: clasificados, grupos Facebook de bodegueros
- Discord servers de emprendimiento LATAM
- Slack groups de SaaS

### Medios VE
- El Estímulo, ProDaVinci (artículos de innovación VE)
- Crónica.Uno (tecnología)
- Talent Network
- LatAm tech press: Contxto, LatamList

### Eventos
- Sponsor de eventos de emprendimiento VE
- Stand en ferias de bodegas/comerciantes
- Webinars propios mensuales
- Workshops con cámaras de comercio locales

---

## 💰 S34. Anuncios pagos

### Plataformas
- Google Ads (búsquedas: "sistema bodega", "ERP venezuela", "POS minimarket")
- Meta Ads (Facebook + Instagram + WhatsApp): targeting bodegueros VE 25-55 años
- TikTok Ads: contenido orgánico amplificado
- LinkedIn Ads: B2B para multi-sucursal/franquicias

### Presupuesto sugerido (mensual)
- Google: $200-500
- Meta: $300-800
- TikTok: $100-300
- Total inicial: $600-1600/mes

### Métricas a medir
- CAC (costo adquisición)
- Trial → paid conversion rate
- LTV / CAC ratio (objetivo >3x)
- Churn mensual

---

# 🎁 Innovaciones especiales aprobadas para este sprint

### N1. Modo "Cierre del día" guiado ⭐⭐⭐⭐⭐
Wizard 5 pasos al cerrar día. Cuadre, pendientes, cobranza mañana, pedidos, resumen automático.

### N2. Inflation guard ⭐⭐⭐⭐
Alerta cuando BCV sube >X%. Sugiere reajuste con preview. Único en VE.

### N3. Modo "Pánico" ⭐⭐⭐
Botón rojo: backup express + lockdown sesiones + bloqueo movimientos 1h.

### N6. Smart suggestions contextuales ⭐⭐⭐⭐⭐
Tarjetas dismissibles según patrón. ERP pasivo → activo.

### N7. Cliente VIP automático ⭐⭐⭐
Detección automática top 20% + tratamiento diferenciado.

### N8. Modo demo con data ficticia ⭐⭐⭐
Para capacitar empleados nuevos sin riesgo.

### N9. PWA con offline mode (POS) ⭐⭐⭐⭐⭐
Internet falla → POS sigue funcionando + sync al volver.

### N10. Atajos por gestos mobile ⭐⭐
Swipe izq anular, swipe der pagar, etc.

### N11. "Modo Bodegón Express" ⭐⭐⭐⭐
Workflow ultra-rápido para ventas pequeñas frecuentes:
- Modal de venta en 1 pantalla, sin transiciones
- Solo 3 inputs: producto (autocomplete) → cantidad → método pago
- Enter para confirmar, listo
- Atajo de teclado dedicado (Ctrl+Shift+E)

---

## 🔮 Diferidas a versiones posteriores

> Aprobadas conceptualmente pero NO entran en este sprint.

- **N14. Marketplace B2B entre negocios Dualis** — gran negocio (comisión 1-2% por transacción). Para v2.0.
- **N16. Programa de referidos** — el primer intento fue malo. Rehacer bien para versión posterior.
- **N17. Asistente Claude en cada sección** — diferenciador brutal pero requiere madurez de producto. Para v2.0.

## ❌ Descartadas definitivas (esta tanda)

- ~~N12. Modo Lluvia~~ (API clima)
- ~~N13. Cliente de paso en POS~~
- ~~N15. Reserva de productos~~
- ~~N18. Modo Show Off~~

---

# ⏱️ Estimación final del sprint

| Fase | Esfuerzo |
|---|---|
| Fase 1 (Fundamentos) | 1-2h |
| Fase 2 (Rediseños grandes) | 6-8h |
| Fase 3 (Finanzas) | 8-10h |
| Fase 4 (UX/Config) | 8-10h |
| Fase 5 (Innovación + Dashboard) | 13-20h |
| Fase 6 (Portal + Landing + Mobile + Notif + Lista precios) | **40-50h** |
| Innovaciones N seleccionadas | 15-25h |
| **TOTAL** | **~90-125h** |

**Sprint full**: 12-16 días continuos. Es un proyecto grande de verdad.

---

# 🎯 Orden recomendado de ejecución

Dado el tamaño, propongo este orden:

1. **🔵 Fase 1** (fundamentos) → estabiliza base
2. **🟣 Fase 6 / S29** (notificaciones in-app + email) → así anuncias todo lo que viene
3. **🟢 Fase 2 + 🟡 Fase 3** (admin grande + finanzas)
4. **🟣 Fase 6 / S26 Portal** (después de admin para tener flujos completos)
5. **🟠 Fase 4 + 🔴 Fase 5** (UX + innovación)
6. **🟣 Fase 6 / S28 Mobile audit** (después de tener todo, optimizar)
7. **🟣 Fase 6 / S27 Landing + S30 Lista precios**
8. **Parte 3** (Marketing, redes, videos) → solo cuando producto esté SÓLIDO

---

# ✅ Checklist por fase

Antes de pasar a siguiente fase:
- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run build` exitoso
- [ ] Smoke test manual: 3 secciones afectadas
- [ ] Sin errores en consola navegador
- [ ] Commit + push a main

---

# 🚦 Decisión

¿Le damos play a **Fase 1** ya?
