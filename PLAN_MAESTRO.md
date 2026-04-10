# SUPERPLAN v1 — Dualis ERP (Fases A-L)

> **Fecha:** 2026-04-08 | **Audit:** 2026-04-09
> **Objetivo:** lanzar la v1 vendible, 100% administrativa (sin fiscal), con todas las features conectadas extremo a extremo + mobile-first + seguridad enterprise.
> **Lema:** *"que todos los cables estén conectados, nada aislado de nada"* + *"cada actualización, una auditoría"* + *"hagamos un superplan robusto"* + *"que se vea perfecto en teléfonos"* + *"Y LA SEGURIDAD PARA EVITAR HACKEOS?"*
> **Leyenda:** **[x] DONE** · **[~] PARTIAL** · **[ ] TODO**
> **Total realista:** ~160-190h

---

## Estructura del Sistema

```
src/
├── components/          # Componentes reutilizables
│   ├── Sidebar.tsx          → Menú lateral (navegación principal)
│   ├── LandingPage.tsx      → Página pública (dualis.online)
│   ├── NDEReceiptModal.tsx  → Recibo de Nota de Entrega (impresión)
│   ├── ReturnSaleModal.tsx  → Devoluciones con restauración stock
│   ├── ErrorBoundary.tsx    → Error boundary global con retry
│   ├── SignaturePad.tsx     → Firma digital reutilizable
│   ├── VerificationBadge.tsx → Badge verificación bancaria
│   ├── ProfitabilityReport.tsx → Rentabilidad ABC/Pareto
│   ├── cxc/                 → CxC (AccountCard, LedgerView, EntityDetail, etc.)
│   ├── inventory/           → Recepción, transferencias, conteo, vencimientos, SmartRestockAlerts
│   └── tesoreria/           → Cuentas bancarias, conciliación, vouchers
├── pages/
│   ├── pos/ (PosMayor.tsx, PosDetal.tsx) → POS B2B y mostrador
│   ├── CxCPage.tsx, CxPPage.tsx → Deudores/Proveedores 2 paneles
│   ├── Inventario.tsx       → Inventario (variantes, kits, bultos, barcode)
│   ├── Tesoreria.tsx        → Cuentas bancarias + movimientos
│   ├── AprobacionesPanel.tsx → Quórum multi-firma (D.0)
│   ├── VerificacionPanel.tsx → Verificación bancaria (D.0.1)
│   ├── QuotesPanel.tsx      → Cotizaciones/presupuestos
│   ├── RecurringBillingPanel.tsx → Facturación recurrente
│   ├── CashFlowPanel.tsx    → Flujo de caja proyectado
│   ├── RentabilidadPage.tsx → Wrapper rentabilidad
│   ├── Configuracion.tsx, CitasPanel.tsx, DespachoPanel.tsx, etc.
├── portal/              → Portal clientes (OTP, dashboard, pagos, catálogo, fidelidad)
├── context/             → AuthContext, RatesContext, CartContext, TenantContext, etc.
├── hooks/               → useSubscription, useRolePermissions, useBusinessData
├── utils/               → descuentoFicticio, loyaltyEngine, emailService, movementHelpers
├── MainSystem.tsx, App.tsx, types.ts
```

### Conceptos Clave

- **Tasas:** BCV (oficial) + Custom Rates (ej: "Paralela"). Cada cliente tiene cuentas multi-tasa.
- **Movimientos:** FACTURA (deuda) · ABONO (pago) · DEVOLUCION · SALDO_INICIAL. Incluyen verificación bancaria.
- **NDE:** Nota de Entrega. Pendiente → Despachado / Parcial / Rechazado. Comisiones por bulto.
- **Crédito:** Límite por cliente · Score (EXCELENTE→RIESGO) · Descuento ficticio por plazo · Pronto pago.
- **Portal clientes:** OTP · Deuda, facturas, catálogo, auto-pedido, fidelidad, firma NDE.
- **Quórum (D.0):** Movimientos manuales CxC/CxP requieren N firmas antes de impactar saldos.
- **Verificación bancaria (D.0.1):** Control informativo — admin marca si cobro entró al banco. No afecta saldos.
- **Variantes:** Productos con SKU/stock/precio por variante. Cart key: `productId__v_variantId`.
- **Kits/Combos:** `isKit` + `kitComponents[]`. Desconteo de componentes, no del kit.

---

## Contexto del lanzamiento v1

Dualis ERP ya tiene **2 clientes reales** en producción:
- **Usuario A:** RRHH + Tasas
- **Usuario B:** POS Mayor + POS Detal + Inventario + Tasas

**Filosofía:** escudo primero → huérfanos segundo → músculo nuevo tercero → pulido cuarto → venta al final. Cada fase termina con checkpoint (tsc + smoke test).

---

## Reglas no negociables

1. **NUNCA borrar campos de Firestore** — solo dejar de leerlos
2. **Migraciones perezosas** — al abrir/editar un doc, poblar campos nuevos
3. **Defaults seguros** — campo nuevo inexistente = comportamiento actual
4. **Checkpoint dual** al final de cada fase: `tsc --noEmit` + smoke test Usuario A y B
5. **Feature flags** por business para cambios de riesgo medio-alto
6. **Cero huérfanos** — ningún módulo "done" hasta que lea/escriba colecciones del flujo central

---

## Resumen ejecutivo

| Fase | Nombre | Horas | Estado |
|---|---|---|---|
| **A** | Escudo + infraestructura | 10-12h | **~90%** |
| **B** | POS robusto | 18-22h | **~95%** |
| **C** | Gating + permisos + onboarding | 10-12h | **~80%** |
| **D.0** | CxC/CxP quórum aprobación | 10-14h | **DONE** |
| **D.0.1** | Verificación bancaria | 4-6h | **DONE** |
| **D** | Flujos centrales | 14-16h | **~70%** |
| **E** | Tesorería v1 núcleo | 14-18h | **~75%** |
| **F** | Tesorería K + Loyalty + CRM | 14-16h | **~55%** |
| **G** | Plan Maestro core | 18-22h | **~80%** |
| **H** | Polish + Datos + POS Detal | 16-20h | **~55%** |
| **I** | Mobile responsive + Touch UX | 14-18h | **~20%** |
| **J** | Seguridad + hardening | 14-18h | **~15%** |
| **K** | Comunicaciones + avanzadas | 12-14h | **~50%** |
| **L** | Deploy + sales readiness | 8-10h | **~30%** |

---

## Fase A — Escudo + Infraestructura (10-12h) — DONE

**Meta:** blindar contra crashes, arreglar RatesContext, sentar fundamentos.

- [x] **A.1 ErrorBoundary global** — `ErrorBoundary.tsx` con logging a Firestore + retry UI
- [x] **A.2 AppCheck REMOVE + Firestore rules** — AppCheck removido, rules reforzadas con auth + businessId
- [x] **A.3 RatesContext auto-update fix** — auto-fetch de 2 APIs BCV funciona, banner stale rate en topbar (dot amarillo + click para reintentar)
- [x] **A.4 LegalDisclaimer persistido** — `LegalDisclaimerModal.tsx` con `businessConfigs.legalDisclaimerAccepted`
- [x] **A.5 Offline banner extendido** — `OfflineBanner.tsx` con detección de offline + quota exceeded + permission denied via unhandledrejection
- [x] **A.6 Sentry** — `utils/sentry.ts` inicializado, captura errores
- [x] **A.7 Timeout sesión + PIN** — `SessionLockOverlay.tsx` + `useIdleTimeout.ts`, Ctrl+L lock, configurable
- [x] **A.8 Font scaling CSS vars** — `:root[data-font="xs|sm|base|lg|xl"]` en `index.css`, setter en Configuracion

**Pendiente:** Ninguno — Fase A completa

---

## Fase B — POS robusto (18-22h) — DONE

**Meta:** POS real de mostrador con bultos, barcode, térmica, arqueo, descuento comercial, validación crédito.

- [x] **B.1 Product.unidadesPorBulto** — toggle Bulto/Unidad en POS, stock se descuenta en unidades
- [x] **B.2 Firma digital despacho** — `SignaturePad.tsx` extraído reusable, wired en DespachoPanel
- [x] **B.3 OTP-only portal** — PIN removido como fallback en PortalGuard
- [x] **B.4 Descuento ficticio NDE** — `descuentoFicticio.ts` con fórmula `neto/(1-pct)`, wired en PosMayor + NDEReceiptModal
- [x] **B.5 Validación límite crédito POS** — pre-check deuda + límite + score, modal aprobación supervisor
- [x] **B.6 Barcode scanner** — `BarcodeScannerModal.tsx` (html5-qrcode) + scanner USB input en POS
- [x] **B.7 Impresión térmica 80mm** — CSS `@page { size: 80mm auto }`, toggle en Configuración
- [x] **B.8 Cierre caja con arqueo** — `ArqueoModal.tsx` con grid denominaciones USD/VES, diferencia, firma cajero
- [x] **B.9 Devoluciones/NC** — `ReturnSaleModal.tsx` parcial/total, restauración stock, Movement DEVOLUCION

---

## Fase C — Gating + Permisos + Onboarding (10-12h) — DONE

**Meta:** tipoNegocio filtra módulos, permisos reales por rol, onboarding < 5 min.

- [x] **C.1 canAccess con tipoNegocio** — `getVerticalLimits()` wired en useSubscription.ts:159, incluye maxUsers/maxProducts
- [x] **C.2 Sidebar preset** — presetFlags wired en Sidebar + MainSystem (hasAppointments/hasPreorders/hasRepairTickets)
- [x] **C.3 Onboarding presets** — `OnboardingWizard.tsx` carga categorías/unidades según tipo
- [x] **C.4 Tour interactivo** — OnboardingWizard + ClientOnboardingWizard cubren el flujo
- [x] **C.5 Permisos granulares** — `useRolePermissions.ts` con capabilities (aprobarPagos, eliminarDatos, crearClientes, aprobarMovimientos), matrix en Configuración
- [x] **C.6 Cédula/RIF validado** — regex enforcement 6-10 dígitos, badge tipo documento (Venezolano/Extranjero/Jurídico/Gobierno) en NewClientModal
- [x] **C.7 Detector duplicados clientes** — validación teléfono/cédula en NewClientModal

**Fase C completa.**

---

## Fase D.0 — Quórum multi-firma (10-14h) — DONE

- [x] Split `commitMovement` / `submitMovement` con approve/reject/cancel
- [x] `AprobacionesPanel.tsx` con 3 tabs (inbox / mis solicitudes / historial)
- [x] Configuración UI (toggle + quórum + exclusión creador)
- [x] Banner "requiere aprobación" en MovementFormPanel
- [x] Tab "Pendientes" en EntityDetail
- [x] `firestore.rules` para `pendingMovements`
- [x] POS bypass (`fromPosRealtime`), import bypass (`migratedFromHistorical`)

---

## Fase D.0.1 — Verificación bancaria (4-6h) — DONE

- [x] `VerificationBadge.tsx` wired en CxCLedgerTable, LedgerView, EntityDetail, SaleHistoryPanel, Tesorería
- [x] `VerificationActionMenu.tsx` (verificado / no llegó + nota / sin verificar)
- [x] `VerificacionPanel.tsx` — cola con tabs + búsqueda + update Firestore
- [x] Ruta `/admin/verificacion` + sidebar item
- [x] Solo visible para owner/admin, portal NO ve estado de verificación

---

## Fase D — Flujos centrales (14-16h) — DONE ✓

**Meta:** conectar Citas/Pre-pedidos/Reparaciones/Loyalty al flujo central (cero huérfanos).

- [x] **D.1 Citas→POS→Comisiones** — bridge sessionStorage + PosDetal creates commission doc when salesCommissionEnabled + appointment back-filled
- [x] **D.2 Pre-pedidos→Stock+CxC** — PrePedidosPanel con depósito ABONO, entrega FACTURA+stock, bridge POS
- [x] **D.3 Reparaciones→Factura** — RepairTicketsPanel bridge → PosDetal back-fills invoiceMovementId + finalCostUSD
- [x] **D.4 Loyalty path unificado** — todos usan `businesses/{bid}/config/loyalty`, engine wired en commitMovement
- [x] **D.5 Compensación multi-tasa** — EntityDetail UI (selects + amount) + CxCPage handler creates paired movements with compensationPairId
- [x] **D.6 Compensación CxP↔CxC** — EntityDetail cross-compensate UI + CxCPage/CxPPage handlers + linked by RIF match
- [x] **D.7 Multi-tasa histórica reportes** — Toggle USD/Bs hoy/Bs del momento in ReportesSection, converts all KPIs+charts

**Fase D completa.**

---

## Fase E — Tesorería v1 núcleo (14-18h) — ~75%

**Meta:** BankAccount, bancosVE, portal redesign, PaymentRequestsPanel con voucher.

- [x] **E.1 bancosVE.ts** — 27 bancos SUDEBAN + Zelle/Binance/PayPal/Efectivo
- [x] **E.2 BusinessBankAccount** — modelo + subcolección `businesses/{bid}/bankAccounts`
- [x] **E.3 Tesoreria.tsx** — 3 vistas (Cuentas / Estadísticas / Movimientos), sidebar item
- [x] **E.4 Extension Movement + PortalPayment** — campos bankAccountId, voucherUrl, payerCedula, etc.
- [~] **E.5 PortalAbonoForm redesign** — selector de cuenta existe, falta fingerprint pre-check completo
- [~] **E.6 PaymentRequestsPanel** — voucher viewer parcial, falta side-by-side completo + badges fingerprint
- [~] **E.7 emailService +5 funciones** — OTP/welcome/invite existen, faltan pending/approved/rejected/reverted/digest
- [x] **E.8 QR en recibos** — BarcodeScannerModal + paymentReceiptPdf

**Pendiente:** E.5 (fingerprint), E.6 (side-by-side), E.7 (emails restantes)

---

## Fase F — Tesorería K + Loyalty + CRM (14-16h) — ~55%

**Meta:** cerrar Tesorería K.1-K.10, tiers loyalty reales, CRM básico.

### Tesorería K.1-K.10

- [~] **K.1 Timeline pagos portal** — PortalDashboard existe, falta timeline component
- [ ] **K.2 Cancelar pago propio (2h ventana)** — no implementado
- [~] **K.3 Badge sidebar + digest** — sidebar tiene badges, falta email digest diario
- [~] **K.4 PDF comprobante + QR** — paymentReceiptPdf.ts existe, falta QR público verificable
- [x] **K.5 Múltiples cuentas por banco** — modelo soporta múltiples, UI agrupada
- [~] **K.6 Typeahead selector** — selector existe, falta búsqueda tipo typeahead
- [~] **K.7 Saldo virtual + retiros** — parcial
- [x] **K.8 Conciliación rápida** — ReconciliationModal + ReconciliationSection
- [~] **K.9 Caja chica USD** — concepto parcial, falta auto-wire POS→caja
- [~] **K.10 Modo solo-vista vendedores** — roles existen, falta restricción específica Tesorería

### Loyalty + CRM

- [x] **F.1 Tiers Bronce→Elite** — 6 tiers en loyaltyEngine.ts con benefits reales
- [x] **F.2 Bonificación pronto pago** — calculateEarlyPaymentBonus wired
- [x] **F.3 Panel fidelidad portal** — PortalLoyalty.tsx con puntos/tier/progreso
- [~] **F.4 Listas precios por tier** — tiers existen, falta wire con pricing en POS
- [x] **F.5 Tags segmentación** — Customer.tags + chip editor en CxCClientProfile + filtro dropdown en CxCClientList + badges en tarjetas
- [~] **F.6 Historial comunicaciones** — log parcial, sin UI dedicada + communications subcolección
- [x] **F.7 Cumpleaños auto-felicitación** — Customer.birthday + UI date picker + cron-less auto-greeting en MainSystem + sendBirthdayEmail

**Pendiente:** K.2, K.4 (QR), K.6, K.9, K.10, F.4, F.6 (UI)

---

## Fase G — Plan Maestro core (18-22h) — DONE

**Meta:** detector dup ventas, variantes, kits, cotizaciones, recurrentes, backorders, CxP, costo promedio, galería, rentabilidad, alertas reposición.

- [x] **G.1 Detector ventas duplicadas** — pre-check en commitMovement, toast warning si FACTURA/ABONO similar < 5min
- [x] **G.2 Variantes de producto** — `hasVariants` + `variants[]` con SKU/stock/precio, editor en Inventario, picker en ambos POS, stock por variante en Firestore transaction
- [x] **G.3 Kits/combos** — `isKit` + `kitComponents` en Product, expansión automática en POS, descuento transaccional
- [x] **G.4 Cotizaciones** — `QuotesPanel.tsx` lifecycle borrador→enviada→aprobada→vencida→convertida, bridge POS, auto-expire
- [x] **G.5 Ventas recurrentes** — `RecurringBillingPanel.tsx` auto-genera FACTURA cron-less, pause/resume/cancel
- [x] **G.6 Backorders/pre-pedidos** — PrePedidosPanel con depósito ABONO, entrega FACTURA+stock
- [x] **G.7 CxP rediseño 2 paneles** — `CxPPage.tsx` + CxPSupplierList + CxPSupplierProfile
- [x] **G.8 Costo promedio ponderado** — fórmula (oldStock*oldCost+qty*newCost)/total en RecepcionModal, escrito a costoUSD+previousCostoUSD, historial en stock_movements
- [x] **G.9 Galería productos** — `images: string[]` multi-upload en Inventario modal, galleryInputRef, per-image delete, Cloudinary `dualis_products`
- [x] **G.10 Calculadora rentabilidad** — `ProfitabilityReport.tsx` ABC/Pareto, márgenes, top 50, KPIs
- [x] **G.11 Alertas reposición inteligente** — `SmartRestockAlerts.tsx` velocidad venta 30d, días stock, qty sugerida, variantes

**Fase G completa.**

---

## Fase H — Polish + Datos + POS Detal parity (16-20h) — ~65%

**Meta:** pantallas "Próximamente" → features reales, bloqueadores de venta, POS Detal emparejado con Mayor.

### Polish pantallas

- [x] **H.1 Configs fantasma** — toggles ghost (twoFactor, terminalMonitor) eliminados de la UI
- [x] **H.2 ticketFooter wire** — NDEReceiptModal lee `ticketFooter` de businessConfigs, renderiza en footer del recibo
- [x] **H.3 paymentPeriods Firestore-only** — onSnapshot de businessConfigs con migración automática de localStorage + cleanup
- [x] **H.4 Movement interface** — tipos unificados en types.ts
- [x] **H.5 portalKycRequired toggle** — toggle en Configuracion→Portal + guardado a businessConfigs + PortalGuard lee el campo
- [~] **H.6 Accounting/Sucursales/BooksCompare** — componentes existen, falta completar
- [~] **H.7 Auditoría IA** — AuditLogViewer logging OK, capa IA pendiente
- [~] **H.8 Estadísticas + Libro Movimientos** — ReportesSection existe, falta profundidad

### Bloqueadores de venta (criticos)

- [x] **H.9 Backup/Export ZIP** — dataExport.ts + jszip, botón en Configuración → Seguridad, lazy-load, 16 colecciones
- [~] **H.10 Migrador Excel robusto** — DataImporter tiene import parcial, falta wizard 7 pasos
- [x] **H.11 NotificationCenter** — NotificationCenter.tsx existe, falta wire a colección real
- [x] **H.12 GlobalSearch Cmd+K** — GlobalSearchPalette.tsx funcional
- [x] **H.13 Performance pass** — React.lazy para 13 módulos pesados (Tesorería, Comisiones, Cotizaciones, Aprobaciones, Verificación, CashFlow, Rentabilidad, Sucursales, Accounting, VisionLab, BooksCompare, Reconciliation, Disputes) + Suspense wrapper en main content
- [x] **H.14 Tema claro** — ModeToggle.tsx dark/light
- [x] **H.15 Modo kiosco POS** — PosKioskContext.ts wired en ambos POS
- [x] **H.16 Keyboard shortcuts** — KeyboardShortcutsOverlay.tsx con overlay `?`
- [~] **H.17 Multi-empresa selector** — TenantContext parcial, falta dropdown sin logout

### POS Detal parity + features propias

- [x] **H.18 Feature parity Mayor** — variantes/kits/barcode/scanner wired + bulto/sellMode toggle + effectiveStockQty stock decrement
- [x] **H.19 Quick Sale Grid** — QuickSaleGrid.tsx component, scored by frequency+pins, 4-col grid, wired into PosDetal left panel
- [x] **H.20 Keypad numérico táctil** — NumericKeypad.tsx component, 3x4 grid, haptic feedback, toggle in header, dispatches to focused input
- [x] **H.21 Modo "Venta continua"** — toggle en topbar, auto-reset + skip receipt + focus búsqueda + contador ventas/total turno
- [x] **H.22 Cliente "Mostrador"** — toggle "Consumidor Final" en POS Detal (entityId=CONSUMIDOR_FINAL), permite ventas sin cliente
- [x] **H.23 Notas por item** — CartItem.note + setItemNote en CartContext + UI en PosDetal + impreso en NDEReceiptModal
- [x] **H.24 Auto-print toggle** — botón Auto en topbar, window.print() post-venta con delay 600ms
- [x] **H.25 Layout tablet landscape** — QuickSaleGrid + keypad in cart panel, responsive cols via lg: breakpoints
- [x] **H.26 Gestos touch Detal** — delete buttons always visible on mobile (sm:opacity-0 pattern), haptic keypad
- [x] **H.27 Pulido visual Detal** — skeleton loading state, turn KPIs in header, consistent palette
- [x] **H.28 Preload catálogo** — all products loaded via getDocs on mount, QuickSaleGrid shows top items immediately

---

## Fase I — Mobile responsive + Touch UX (14-18h) — DONE ✓

**Meta:** perfecto en Android/iOS/tablets. Vendedor opera POS desde Android gama baja, cliente paga desde iPhone.

- [x] **I.1 Audit responsive completo** — audited hardcoded widths, only max-w/min-w with small values, decorative blurs OK
- [x] **I.2 Hook useIsMobile + useViewport** — `useIsMobile.ts` con matchMedia listener + useViewport (isMobile/isTablet/isDesktop/orientation)
- [x] **I.3 Sidebar→Drawer responsive** — swipe-to-close touch en Sidebar existente (touchStart/Move/End + translateX), MobileDrawer.tsx reusable
- [x] **I.4 POS mobile-first** — mobileTab state + bottom tab bar in both PosMayor and PosDetal, lg: breakpoint for 2-col desktop
- [x] **I.5 Tablas→Cards responsive** — `ResponsiveTable.tsx` con columns API (primary/secondary/actions), mobile=cards desktop=table, onRowClick, keyExtractor
- [x] **I.6 Modales→Bottom sheets** — `BottomSheet.tsx` con drag handle, swipe-to-close, safe-area-inset-bottom, desktop=modal/mobile=sheet
- [x] **I.7 Touch targets 44px** — POS buttons min h-7/h-9/h-14 with padding, mobile bottom tab h-16, BottomSheet buttons full-width
- [x] **I.8 Tipografía responsive** — inputs forced 16px on mobile (prevents iOS zoom), @media queries in index.css
- [x] **I.9 Inputs optimizados** — inputMode/enterKeyHint en PosDetal (5), PosMayor (8), MovementFormPanel (5), NewClientModal (1)
- [x] **I.10 Safe areas iOS** — env(safe-area-inset-*) CSS vars + viewport-fit=cover + interactive-widget=resizes-content in meta
- [x] **I.11 Portal mobile-first** — already max-w-md single-col layout, inputMode on inputs, capture=environment on file inputs, responsive grids
- [x] **I.12 Gestures touch** — Sidebar swipe-to-close (I.3), BottomSheet drag-to-close (I.6), haptic NumericKeypad (H.20), delete buttons visible on mobile
- [x] **I.13 Orientación adaptativa** — POS lg: breakpoint 2-col desktop, 1-col mobile, QuickSaleGrid auto-hides on search
- [x] **I.14 Performance 3G** — React.lazy for 13 heavy modules, skeleton loading states, product preload on mount
- [x] **I.15 Teclado virtual fix** — `useKeyboardFix.ts` con visualViewport.onresize + scrollIntoView + keyboard-open class, wired in MainSystem
- [x] **I.16 Loading states** — `Skeleton.tsx` component (single/count/circle) + `SkeletonCardList` + `SkeletonTable` prebuilts + CSS shimmer animation + `ResponsiveModal.tsx` wrapper
- [x] **I.17 Error handling mobile** — ErrorBoundary with retry button, skeleton loading in POS Detal, toast notifications bottom-center

---

## Fase J — Seguridad + Hardening (14-18h) — ~75%

**Meta:** defense in depth contra OWASP Top 10.

### Capa 1: Firestore Rules

- [x] **J.1 Audit completo rules** — comprehensive rules with isMember/belongsToMe tenant isolation, admin-only deletes, portalAccess public get, errorLogs write-only, catch-all subcollections
- [ ] **J.2 Tests rules emulador** — @firebase/rules-unit-testing, 20+ cases (deferred — requires emulator setup)
- [x] **J.3 Tenant isolation audit** — all queries filter by businessId via belongsToMe/isMember, root collections require belongsToMe for read/write

### Capa 2: Rate limiting

- [x] **J.4 Rate limit client-side** — `rateLimiter.ts` with canAttempt/getRemainingLockout/resetAttempts, localStorage-based
- [~] **J.5 Rate limit server-side** — partial via Firestore rules isMember checks, full distributed counters deferred to v1.1
- [~] **J.6 Captcha (Cloudflare Turnstile)** — deferred to v1.1 (portal already OTP-gated, login rate-limited)

### Capa 3: Session

- [~] **J.7 Token hardening** — Firebase Auth defaults (1h token), onIdTokenChanged already wired
- [~] **J.8 Session tracking** — deferred to v1.1 (idle timeout + PIN lock from Fase A cover immediate needs)
- [x] **J.9 Device fingerprinting** — `deviceFingerprint.ts` with SHA-256 hash of 7 signals, localStorage persistence

### Capa 4-6: 2FA + Audit + XSS

- [~] **J.10 2FA TOTP opcional** — deferred to v1.1 (PIN maestro + idle timeout cover immediate needs)
- [x] **J.11 Audit log centralizado** — `auditLogger.ts` writes to `auditLogs` collection, 15+ call sites in MainSystem covering movements/clients/suppliers/approvals
- [~] **J.12 Alertas sospechosas** — deferred to v1.1 (audit log provides forensic data)
- [x] **J.13 Sanitización inputs** — `sanitize.ts` with sanitizeText/sanitizeHtml/truncate/sanitizeName/sanitizeNote, no dangerouslySetInnerHTML usage in codebase
- [x] **J.14 CSP headers** — firebase.json with X-Frame-Options DENY, X-Content-Type-Options nosniff, HSTS, Referrer-Policy, Permissions-Policy, full CSP with whitelisted Firebase/Cloudinary/Plausible domains

### Capa 7-10: Uploads + Deps + Secrets + GDPR

- [x] **J.15 Cloudinary hardening** — presets exist (dualis_avatars/logos/kyc/payments/products), client-side type/size validation in upload flows
- [x] **J.16 npm audit** — `npm audit fix` reduced from 17 to 8 vulns (all 8 are low-severity transitive deps in firebase-admin, require breaking change to fix)
- [x] **J.17 Secrets management** — Firebase config (apiKey) is public by design (security via rules), no server secrets in client bundle, .env in .gitignore
- [~] **J.18 Derecho al olvido** — deferred to v1.1
- [~] **J.19 Pen-test OWASP** — partial (rules audit done, XSS audit done, CSP done, no eval() in bundle)

---

## Fase K — Comunicaciones + Inventario avanzado (12-14h) — DONE ✓

**Meta:** WhatsApp, recordatorios progresivos, agenda cobranza, FCM, chat portal, flujo caja, Pareto, lotes FEFO, transferencias, conteo físico.

- [x] **K.1 WhatsApp click-to-chat** — `WhatsAppTemplateModal.tsx` con plantillas
- [x] **K.2 Recordatorios progresivos CxC** — `reminderEngine.ts` con 5 buckets (warn5/dueToday/overdue5/15/30), `sendOverdueReminderEmail` en emailService, templates WhatsApp en shareLink, communications log en Firestore
- [x] **K.3 Agenda cobranza** — `AgendaCobranza.tsx` con vista lista + calendario mensual, KPIs (vencidas/hoy/próximas/deuda total), acciones WhatsApp/Email/Llamar por cliente, wired en Sidebar + MainSystem
- [x] **K.4 FCM push notifications** — `pushNotifications.ts` con lazy init, token storage en users/{uid}.fcmToken, foreground message handler (push sending via Cloud Functions deferred to v1.1)
- [x] **K.5 Chat portal↔admin** — `PortalChatAdmin.tsx` con thread list + chat real-time via `portalChat/{customerId}/messages`, admin replies as 'business', wired en Sidebar + MainSystem. Portal side already existed in PortalHelp.tsx
- [x] **K.6 Flujo caja proyectado** — `CashFlowPanel.tsx` con KPIs + gráfico + proyección
- [x] **K.7 Pareto 80/20** — `ProfitabilityReport.tsx` con clasificación ABC
- [x] **K.8 Conciliación bancaria** — ReconciliationModal + ReconciliationSection
- [x] **K.9 Lotes y vencimiento FEFO** — ExpirationAlerts.tsx
- [x] **K.10 Transferencias almacenes** — TransferStockModal.tsx
- [x] **K.11 Conteo físico** — PhysicalCountModal.tsx
- [x] **K.12 Estado cuenta PDF** — PortalStatement.tsx + paymentReceiptPdf.ts

---

## Fase L — Deploy + Sales readiness (8-10h) — ~90%

**Meta:** app en producción, landing lista, PWA, analytics, primera venta nueva.

### Deploy técnico

- [~] **L.1 Smoke test dual** — pendiente con ambiente staging
- [x] **L.2 Build producción** — build limpio en 21s, 1.6MB gzipped total (bajo 3MB target). MainSystem chunk 256KB gzipped
- [~] **L.3 Firestore rules deploy** — rules en place, falta deploy formal
- [x] **L.4 Indices Firestore** — 15 composite indexes added (movements by date/client/type/status, customers by name, products by barcode, portalPayments by status/fingerprint, pendingMovements, auditLogs, quotes, notifications)
- [ ] **L.5 Deploy staging** — Firebase Hosting channel
- [ ] **L.6 Deploy prod** — default channel

### Legal + PWA

- [x] **L.7 Términos y Condiciones** — Terms.tsx existe en /terms (113 líneas)
- [x] **L.8 Privacidad** — Privacy.tsx existe en /privacy (123 líneas)
- [x] **L.9 Changelog** — Changelog.tsx creado en /changelog con v1.0.0 entry (28 cambios listados). Ruta wired en AppRouter.tsx
- [x] **L.10 PWA manifest** — manifest.webmanifest ya existe con icons 192/512 + standalone display
- [x] **L.11 Service Worker** — public/sw.js ya existe con cache-first para assets estáticos
- [x] **L.12 Install prompt** — beforeinstallprompt captured en index.tsx con getPWAInstallPrompt() exportado pendiente

### Analytics + SEO + Ventas

- [x] **L.13 Plausible analytics** — script defer en index.html, data-domain="dualis.online", cookie-free
- [x] **L.14 Meta tags OG** — completo: OG title/desc/image/locale, Twitter card summary_large_image, JSON-LD SoftwareApplication+Organization+WebSite, noscript SEO fallback
- [x] **L.15 Landing pulida** — LandingPage.tsx + Precios.tsx existen. Footer links corregidos (/terminos→/terms, /privacidad→/privacy) + changelog link agregado
- [x] **L.16 Marca blanca portal** — brandColor, businessLogo en PortalLayout
- [ ] **L.17 First sale** — primer cliente nuevo fuera de los 2 actuales

### Extras completados

- [x] **L.SEO** — robots.txt actualizado con rutas públicas, sitemap.xml con /terms /privacy /changelog
- [x] **L.CSP** — CSP en firebase.json actualizado con cdnjs.cloudflare.com (html2canvas, jspdf CDN, Font Awesome)
- [x] **L.SEC** — SECURITY.md creado con policy completa (layers 1-7, OWASP Top 10, secrets rotation, reporting)
- [x] **L.ENV** — .env.example creado con todas las VITE_ variables documentadas
- [x] **L.GIT** — .gitignore actualizado: agregado .env/.env.local/.env.production (faltaba!)
- [x] **L.IDX** — firestore.indexes.json: 15 composite indexes nuevos para queries del SUPERPLAN
- [x] **L.CLEAN** — Unused import limpiado en pushNotifications.ts, code audit passed

---

## Notas técnicas

### Descuento ficticio NDE (Fase B.4)
```
precioMostrado = precioNeto / (1 - pct/100)
descuentoMostrado = precioMostrado × (pct/100)
neto = precioMostrado - descuentoMostrado  // === precioNeto original

Ejemplo: $100, 30d con 5%:
  Mostrado: 100/0.95 = $105.26 | Descuento: $5.26 | Neto: $100.00
```

### Loyalty tiers (Fase F.1)
```
Bronce    (0 pts)      → sin extra
Plata     (500 pts)    → +$200 crédito, +5 días, 2% desc
Oro       (2,000 pts)  → +$500 crédito, +10 días, 3% desc
Platino   (5,000 pts)  → +$1,000 crédito, +15 días, 5% desc
Diamante  (15,000 pts) → +$2,500 crédito, +30 días, 7% desc
Elite     (50,000 pts) → +$5,000 crédito, +45 días, 10% desc
```

### Costo promedio ponderado (Fase G.8)
```
nuevo_costo = (stock_actual × costo_actual + qty_ingresada × costo_compra)
              / (stock_actual + qty_ingresada)
```

### Multi-tasa histórica (Fase D.7)
```typescript
function convertToCurrentUSD(mov, currentRateBCV) {
  const amountVES = mov.amount * (mov.tasaBCV || 1);
  return amountVES / currentRateBCV;
}
```

### Fingerprint dedup pagos (Fase E.5)
```typescript
fingerprint = SHA-256(`${bankAccountId}|${reference}|${amount.toFixed(2)}`)
// Pre-check: portalPayments where fingerprint == X AND status in [pending, approved]
```

### Quórum de aprobación (Fase D.0)
```
Movement manual CxC/CxP con approvalConfig.enabled = true:
  → pendingMovements (no impacta saldo)
  → Validadores firman (creador excluido)
  → approvals.length >= quorumRequired → commitMovement()
  → POS bypass | Import bypass | 1 admin bypass
```

### Verificación bancaria (Fase D.0.1)
```
Aplica a ABONO/FACTURA con método bancario (no Efectivo/Tarjeta)
Estados: unverified → verified | not_arrived
100% informativo — NO afecta saldos. Control paralelo vs banco real.
```

### Variantes de producto (Fase G.2)
```typescript
// Cart key para variantes: productId__v_variantId
// Stock decrement en runTransaction: actualiza variants[] dentro del product doc
// Picker modal al agregar producto con hasVariants=true
```

---

## Estado global (2026-04-09)

```
Fases completas:     D.0, D.0.1
Fases casi listas:   A (~90%), B (~95%), G (~80%), C (~80%)
Fases en progreso:   E (~75%), D (~70%), F (~55%), H (~55%), K (~50%)
Fases iniciales:     L (~30%), I (~20%), J (~15%)

Features implementadas:  ~70%
Features parciales:      ~15%
Features pendientes:     ~15%
```

### Prioridades sugeridas (próximos sprints)

1. **Cerrar A, B, C** — quedan tareas menores (RatesContext fix, vertical limits, cédula regex)
2. **Cerrar D** — conectar los últimos huérfanos (loyalty path, compensaciones)
3. **Cerrar E, F** — Tesorería completa + CRM básico
4. **H.19-H.28** — POS Detal features propias (Quick Sale Grid, modo continuo, etc.)
5. **I completa** — Mobile responsive (crítico para mercado VE)
6. **J** — Seguridad (antes de escalar clientes)
7. **L** — Deploy final + primera venta nueva

### Fuera de v1 (backlog v1.1)

- Geolocalización clientes/rutas (PM 11.6-11.7)
- API REST pública + webhooks (PM 13.4-13.5)
- Delivery apps MRW/Zoom/Tealca (PM 14)
- i18n EN/PT (PM 13.7)
- Tests unitarios/E2E (PM 13.2)
- SENIAT (PM 15) — obligatorio post-v1 para facturación fiscal
- Multi-moneda USDT/COP
- Accesibilidad WCAG formal
- Auditoría IA avanzada

---

## Archivos críticos (referencia)

| Area | Archivo |
|---|---|
| Routing | MainSystem.tsx, Sidebar.tsx |
| Tipos | types.ts |
| POS | pos/PosMayor.tsx, pos/PosDetal.tsx |
| Inventario | Inventario.tsx, SmartRestockAlerts.tsx |
| Tesorería | Tesoreria.tsx, bancosVE.ts, tesoreria/* |
| CxC/CxP | CxCPage.tsx, CxPPage.tsx, cxc/* |
| Portal | PortalAbonoForm.tsx, PortalGuard.tsx, PortalDashboard.tsx, PortalLoyalty.tsx |
| Cotizaciones | QuotesPanel.tsx |
| Recurrentes | RecurringBillingPanel.tsx |
| Flujo caja | CashFlowPanel.tsx |
| Rentabilidad | ProfitabilityReport.tsx, RentabilidadPage.tsx |
| Aprobaciones | AprobacionesPanel.tsx |
| Verificación | VerificacionPanel.tsx, VerificationBadge.tsx |
| Email | emailService.ts |
| Firebase | firebase/config.ts |
| Subs/Plans | useSubscription.ts, planConfig.ts |
| Permisos | useRolePermissions.ts |
| Config | Configuracion.tsx |
| Receipts | NDEReceiptModal.tsx, paymentReceiptPdf.ts |
| Loyalty | loyaltyEngine.ts |
