# Auditoría completa — Dualis System

> Fecha: 2026-04-19
> Alcance: **todo el repositorio** (src/, api/, firestore.rules, config)
> Verificación automática: `tsc --noEmit` ✅ · `npm run lint` ✅ · `npm run build` ✅
> Auditoría manual: 8 subagentes en paralelo cubriendo 8 dominios
> Total de hallazgos: **~85 bugs/issues** (algunos duplicados entre dominios)

---

## 🔥 TOP 10 fixes recomendados (alto ROI, riesgo alto)

1. **`firestore.rules:339` — colección `/customers` abierta a cualquier usuario auth'd** → fuga cross-tenant de TODA la lista de clientes del sistema.
2. **`firestore.rules:225-227` — `/portalPayments allow create: if true`** → cualquiera sin auth puede forjar pagos.
3. **`api/passkey-auth-verify.js:70` — `createCustomToken(userId)` sin verificar que la credential pertenece al userId** → login como cualquier usuario si se adivina/fuga credentialId.
4. **`api/scanner.js` — sin verificación de idToken, sin rate limit** → cualquiera dispara llamadas a Gemini gastando tus cuotas.
5. **`src/utils/invoiceAllocations.ts:86-146` — idempotencia NO enforzada** → editar un abono 2x duplica allocations; facturas pagadas quedan abiertas o viceversa.
6. **`src/utils/invoiceAllocations.ts:117-144` — race condition en allocation writes** → usar `runTransaction`, no `writeBatch` con reads no-atómicos.
7. **`src/components/PayrollSection.tsx:137` — división por 0 cuando `payrollRate` no está set** → `NaN` cascadea en anticipos de nómina.
8. **`src/components/ReportesSection.tsx:245` + **`LibroVentasSection.tsx:232-234`** — CSV export sin escaping** → cualquier campo con coma o comilla rompe el archivo exportado.
9. **`src/pages/PosDetal.tsx:955` / `PosMayor.tsx:1015` — IGTF se aplica al total USD completo en pago mixto** → cargas IGTF sobre la parte en Bolívares también.
10. **`src/context/ThemeContext.tsx:37` — FOUC en dark mode** → flash visual en cada carga; aplicar clase en `index.tsx` antes de `root.render()`.

---

## 🔴 CRÍTICOS — data loss / security / math incorrecta

### Seguridad & multi-tenant

| # | Archivo:línea | Bug | Fix sugerido |
|---|---|---|---|
| S1 | [firestore.rules:339](firestore.rules#L339) | `/customers` permite read/write a cualquier user auth → fuga cross-tenant | Agregar check `belongsToMe(resource.data)` + `businessId` scoping |
| S2 | [firestore.rules:225-227](firestore.rules#L225-L227) | `/portalPayments allow create: if true` (sin auth) | Validar token portal + match de businessId en rule |
| S3 | [firestore.rules:12](firestore.rules#L12) | Email superadmin hardcoded `yisus_xd77@hotmail.com` | Migrar a custom claim `super_admin: true` |
| S4 | [api/passkey-auth-verify.js:70](api/passkey-auth-verify.js#L70) | `createCustomToken(userId)` sin verificar credential→userId binding | Validar `credData.userId === expectedUser` antes de emitir token |
| S5 | [api/passkey-auth-options.js:24](api/passkey-auth-options.js#L24) | Challenge sin TTL ni expiración | Agregar `expiresAt` + cleanup cron |
| S6 | [api/scanner.js](api/scanner.js) | Sin verificación de idToken, sin rate limit | Espejar patrón de extract-receipt.js con verifyIdToken + throttle |
| S7 | [src/components/Login.tsx:74-78](src/components/Login.tsx#L74-L78) | Validación subdomain vs user.businessId post-sign-in → race si admin cambia bid durante login | Reverificar dentro de una tx / re-fetch user doc |
| S8 | [src/portal/PortalGuard.tsx:130-165](src/portal/PortalGuard.tsx#L130-L165) | Token lookup usa slug de URL sin revalidar que bid coincide | Validar `resolvedBid === slug→bid` antes de query |

### Datos / contabilidad / dinero

| # | Archivo:línea | Bug | Fix sugerido |
|---|---|---|---|
| D1 | [src/utils/invoiceAllocations.ts:86-146](src/utils/invoiceAllocations.ts#L86-L146) | Función claim idempotencia pero no la enforza — edit 2x duplica allocations | Chequear `existing.find(a => a.abonoId === current.abonoId)` antes de append |
| D2 | [src/utils/invoiceAllocations.ts:117-144](src/utils/invoiceAllocations.ts#L117-L144) | Race condition: batch read+write no-atómico entre users concurrentes | Migrar a `runTransaction` |
| D3 | [src/utils/invoiceAllocations.ts:40,55,67](src/utils/invoiceAllocations.ts#L40) | Tolerancias mixtas `0.009` con `≥` y `>` → off-by-penny | Normalizar todas a `< 0.005` (medio centavo) |
| D4 | [src/pages/pos/PosDetal.tsx:955](src/pages/pos/PosDetal.tsx#L955) + [PosMayor.tsx:1015](src/pages/pos/PosMayor.tsx#L1015) | IGTF aplicado a TODO el total en pago mixto (debería ser solo al USD cash) | `igtfAmount = method==='mixto' ? mixCash*IGTF_RATE : ...` |
| D5 | [src/pages/QuotesPanel.tsx:155](src/pages/QuotesPanel.tsx#L155) | IVA calculado sobre subtotal pero discount aplicado después → total no cuadra con factura | Definir orden canónico: IVA sobre `(subtotal - discount)` |
| D6 | [src/components/ReturnSaleModal.tsx:148-177](src/components/ReturnSaleModal.tsx#L148-L177) | Nota de crédito emitida aunque el producto fue eliminado → stock no rollback, CxC sí reversa | Validar existencia antes del batch o rechazar return completo |
| D7 | [src/pages/Inventario.tsx:3643](src/pages/Inventario.tsx#L3643) | `addDoc(collection(db, 'movements'))` escribe a colección ROOT, no bajo `businesses/{bid}` | Usar path `businesses/${tenantId}/movements` |
| D8 | [src/components/PayrollSection.tsx:137](src/components/PayrollSection.tsx#L137) | `originalAmount / rate` cuando rate=0/undefined → `NaN` cascadea | Guardar con `rate > 0 ? ... : null` y surface error |
| D9 | [src/components/inventory/RecepcionModal.tsx:103-156](src/components/inventory/RecepcionModal.tsx#L103-L156) | Stock update + CxP en dos operaciones separadas; si CxP falla queda inconsistente | Wrap en single `runTransaction` |
| D10 | [src/components/inventory/RecepcionModal.tsx:123](src/components/inventory/RecepcionModal.tsx#L123) | Doble conversión USD→BS cuando supplier es GRUPO/DIVISA | Clarificar cost basis del supplier (campo `costCurrency`) |
| D11 | [src/components/inventory/ExpirationAlerts.tsx:21-32](src/components/inventory/ExpirationAlerts.tsx#L21-L32) | TZ bug: `new Date(iso)` local vs `'T00:00:00'` UTC → off-by-day | `new Date(p.fechaVencimiento).setHours(0,0,0,0)` |

### Exportaciones / reportes

| # | Archivo:línea | Bug | Fix sugerido |
|---|---|---|---|
| E1 | [src/components/ReportesSection.tsx:245](src/components/ReportesSection.tsx#L245) | CSV sin escaping de comas/comillas | `quote(field)` helper + escape `"`→`""` |
| E2 | [src/components/LibroVentasSection.tsx:232-234](src/components/LibroVentasSection.tsx#L232-L234) | Idem: `.join(',')` sin quoting | Idem |
| E3 | [src/components/ReportesSection.tsx:246](src/components/ReportesSection.tsx#L246) | Sin BOM UTF-8 → Excel muestra acentos basura | Prefix `'\uFEFF' + csv` |
| E4 | [src/components/LibroVentasSection.tsx:194](src/components/LibroVentasSection.tsx#L194) | `totalBs = totalUsd * avgRate` → wrong cuando rates fluctúan en el período | Sumar `originalAmount` por row |
| E5 | [src/components/LibroVentasSection.tsx:215](src/components/LibroVentasSection.tsx#L215) | Precedencia: `m.originalAmount \|\| (m.amountInUSD * m.rateUsed ? x : 0)` | Parentizar: `m.originalAmount \|\| (m.amountInUSD && m.rateUsed ? ... : 0)` |

### Concurrencia / Core

| # | Archivo:línea | Bug | Fix sugerido |
|---|---|---|---|
| C1 | [src/context/WidgetContext.tsx:99](src/context/WidgetContext.tsx#L99) | `manager` useMemo con deps que cambian constantemente → cascading re-renders | Extraer `toggleWidget` fuera del useMemo; usar functional setState |
| C2 | [src/context/ToastContext.tsx:63](src/context/ToastContext.tsx#L63) | `setTimeout` sin tracking → leak + closure stale en unmount | Guardar timer IDs en `useRef`, clear en cleanup |
| C3 | [src/context/ThemeContext.tsx:37](src/context/ThemeContext.tsx#L37) | FOUC: theme aplicado en useEffect, no síncronamente | Aplicar clase en `src/index.tsx` antes de render() |
| C4 | [src/components/ErrorBoundary.tsx:57](src/components/ErrorBoundary.tsx#L57) | `void this.logToFirestore()` swallow | Agregar `.catch(console.error)` + telemetry fallback |
| C5 | [src/context/RatesContext.tsx:122](src/context/RatesContext.tsx#L122) | `getDoc().then(async ...)` sin catch outer | `try/catch` explícito; flag `usingStaleRate` solo tras falla real |

---

## 🟠 ALTOS — bugs visibles al usuario / edge cases importantes

### Flujos específicos

| # | Archivo:línea | Bug |
|---|---|---|
| A1 | [src/components/cxc/cxcHelpers.ts:185-188](src/components/cxc/cxcHelpers.ts#L185-L188) | Aging buckets off-by-one: día 30 cae en `current` en vez de `d31_60` |
| A2 | [src/pages/RecurringBillingPanel.tsx:65-75](src/pages/RecurringBillingPanel.tsx#L65-L75) | DST bug en `addFrequency`: `setMonth` puede saltar/duplicar día en transición |
| A3 | [src/components/DisputesPanel.tsx:159](src/components/DisputesPanel.tsx#L159) | `sendEmail().catch(() => {})` swallow → cliente nunca recibe resolución |
| A4 | [src/pages/Tesoreria.tsx:102-121](src/pages/Tesoreria.tsx#L102-L121) | `accounts.length >= 0` siempre true → Caja Chica se intenta re-crear cada load |
| A5 | [src/utils/globalBankPool.ts:134](src/utils/globalBankPool.ts#L134) | Rows sin `reference` excluidos del pool pero no marcados como no-claimables |
| A6 | [src/utils/reconciliationGuards.ts:59](src/utils/reconciliationGuards.ts#L59) | Fingerprint con `bankAccountId \|\| accountAlias \|\| ''` → permite `''` silenciosamente |
| A7 | [src/pages/pos/PosDetal.tsx:1073-1074](src/pages/pos/PosDetal.tsx#L1073-L1074) + [PosMayor.tsx:1092-1094](src/pages/pos/PosMayor.tsx#L1092-L1094) | Split `__v_` sin validar longitud → realProductId vacío, variantId undefined |
| A8 | [src/pages/pos/PosMayor.tsx:1312-1338](src/pages/pos/PosMayor.tsx#L1312-L1338) | Discount/markup: rounding intermedio compound → total factura ≠ sum(items) por centavos |
| A9 | [src/context/CartContext.tsx:327](src/context/CartContext.tsx#L327) | `discountValue` no validado `isFinite/>=0` → NaN poisoning |
| A10 | [src/pages/Inventario.tsx:3662](src/pages/Inventario.tsx#L3662) + [TransferStockModal.tsx:152](src/components/inventory/TransferStockModal.tsx#L152) | `Math.max(0, ...)` oculta stock negativo en source warehouse |
| A11 | [src/components/DataImporter.tsx:84,152-154](src/components/DataImporter.tsx#L84) | `line.split(',')` rompe con BOM y comas entre comillas |
| A12 | [src/components/DataImporter.tsx:114-128](src/components/DataImporter.tsx#L114-L128) | Locale numérico: `"1.234,50"` → `1234.5` (off por 10x en data latam) |
| A13 | [src/utils/fefoHelper.ts:17-22](src/utils/fefoHelper.ts#L17-L22) | Si todos los lotes expirados, retorna `null` pero caller no valida |
| A14 | [src/utils/rateBackfill.ts:33-46](src/utils/rateBackfill.ts#L33-L46) | Overwrite rates auto-fetch pero no manual → inconsistente |
| A15 | [src/components/RateHistoryWall.tsx:236,388,448,560](src/components/RateHistoryWall.tsx#L236) | `grupo: 0, divisa: 0` hardcoded → histórico pierde tasas alternas |

### Seguridad / portal

| # | Archivo:línea | Bug |
|---|---|---|
| A16 | [src/components/AccountingSection.tsx:979,1017,1092](src/components/AccountingSection.tsx#L979) | `innerHTML` con `config.companyName` sin sanitize → XSS en impresión PDF |
| A17 | [src/utils/rateLimiter.ts](src/utils/rateLimiter.ts) | Rate limit solo en localStorage del cliente → bypasseable trivial |
| A18 | [src/components/LandingPage.tsx:276](src/components/LandingPage.tsx#L276) | `contactRequests` sin rate limit/honeypot/CAPTCHA |
| A19 | [src/portal/PortalChat.tsx:42](src/portal/PortalChat.tsx#L42) | BusinessId del path sin revalidar → message injection posible |
| A20 | [src/portal/PortalDispute.tsx:98](src/portal/PortalDispute.tsx#L98) + [PortalAbonoForm.tsx:236-243](src/portal/PortalAbonoForm.tsx#L236-L243) | Cloudinary preset "dualis_payments" unsigned, sin MIME magic validation |
| A21 | [api/assistant.js:12](api/assistant.js#L12), [extract-receipt.js:183](api/extract-receipt.js#L183), [scanner.js](api/scanner.js) | `Access-Control-Allow-Origin: '*'` en endpoints sensibles |

### Reactividad / UX

| # | Archivo:línea | Bug |
|---|---|---|
| A22 | [src/components/Sidebar.tsx:673,694](src/components/Sidebar.tsx#L673) | Active-link falla en rutas anidadas (`/admin/clientes/detail/123` no matchea) |
| A23 | [src/components/GlobalSearchPalette.tsx:85-187](src/components/GlobalSearchPalette.tsx#L85-L187) | 150+ items renderizados sin virtualización |
| A24 | [src/hooks/useBusinessData.ts:26-83](src/hooks/useBusinessData.ts#L26-L83) | Si bid cambia rápido, 2 sets de subs corriendo en paralelo antes del cleanup |
| A25 | [src/context/RatesContext.tsx:99](src/context/RatesContext.tsx#L99) | `autoUpdateAttemptedForDayRef` no resetea al pasar medianoche |
| A26 | [src/components/OfflineBanner.tsx:31-48](src/components/OfflineBanner.tsx#L31-L48) | `unhandledrejection` matchea "resource-exhausted" de cualquier quota (false positive) |
| A27 | [tsconfig.json:20](tsconfig.json#L20) | `allowJs: true` sin `strict: true` → array access bugs solo se ven en runtime |
| A28 | [src/firebase/config.ts:6-13](src/firebase/config.ts#L6-L13) | No valida env vars VITE_FIREBASE_* — initializeApp falla con error críptico |

---

## 🟡 MEDIOS — bug ocasional / degradación

| # | Archivo:línea | Bug |
|---|---|---|
| M1 | [src/utils/processReceiptBatch.ts:341](src/utils/processReceiptBatch.ts#L341) | `monthKey` fallback puede caer fuera del rango del pool query |
| M2 | [src/components/tesoreria/BatchReviewPanel.tsx:161](src/components/tesoreria/BatchReviewPanel.tsx#L161) | Sync de stats con `.catch(warn)` → stats congeladas en UI si write falla |
| M3 | [src/utils/voucherAudit.ts:107](src/utils/voucherAudit.ts#L107) | Threshold `DIVERGENCE_PCT_THRESHOLD=0.1` hardcoded |
| M4 | [api/assistant.js:44](api/assistant.js#L44), [extract-receipt.js:17](api/extract-receipt.js#L17) | Prompt injection posible vía texto user → LLM |
| M5 | [src/utils/auditLogger.ts:88-107](src/utils/auditLogger.ts#L88-L107) | `deviceId` de fingerprint spoofable — no sirve como device tracking |
| M6 | [src/portal/PortalStatement.tsx:43-125](src/portal/PortalStatement.tsx#L43-L125) | jsPDF con datos user sin sanitize → PDF injection teórico |
| M7 | [src/portal/PortalDispute.tsx:89-153](src/portal/PortalDispute.tsx#L89-L153) | Sin race check: dos tabs abren dispute simultáneo |
| M8 | [src/routes/AppRouter.tsx](src/routes/AppRouter.tsx) + [SEO.tsx](src/components/SEO.tsx) | Portal/admin sin `noindex` → Google podría cachear data privada |
| M9 | [src/index.tsx:16-21](src/index.tsx#L16-L21) | `localStorage` fuera del check `container` → SSR throws silenciosos |
| M10 | [src/i18n.ts:37-41](src/i18n.ts#L37-L41) | `i18n.on('languageChanged')` sin cleanup |
| M11 | [src/context/WidgetContext.tsx:82-84](src/context/WidgetContext.tsx#L82-L84) | `toggleWidget` lee `widgets[key].isOpen` con closure stale |
| M12 | [src/components/RateConverterWidget.tsx:72-81](src/components/RateConverterWidget.tsx#L72-L81) | Flicker al cambiar rateSource mientras se edita monto |
| M13 | [src/pages/Conciliacion.tsx:126-139](src/pages/Conciliacion.tsx#L126-L139) | Stale batches si bid cambia durante load |
| M14 | [src/pages/Conciliacion.tsx:161-180](src/pages/Conciliacion.tsx#L161-L180) | `usedByAccountIdentity` stale memo tras delete de batch |
| M15 | Auditlogs | Admin puede modificar/borrar sus propios audit entries (no inmutable) |

---

## 🟢 BAJOS — menor, worth-fixing-eventually

- [src/pages/QuotesPanel.tsx:358](src/pages/QuotesPanel.tsx#L358) — `useCallback` deps con `cartTipoTasa` mutable (indicio de closure issue)
- [src/components/NotificationCenter.tsx:139](src/components/NotificationCenter.tsx#L139) — Join con `', '` no i18n-aware
- [src/components/ModeToggle.tsx](src/components/ModeToggle.tsx) — Sin atajo de teclado documentado
- [src/context/RatesContext.tsx:125,177](src/context/RatesContext.tsx#L125) — Fallback no valida `rate > 0` (podría quedar negativo)
- [src/portal/PortalChat.tsx:112](src/portal/PortalChat.tsx#L112), [PortalDispute.tsx:112](src/portal/PortalDispute.tsx#L112) — React auto-escapa, pero sin CSP explícito
- [src/utils/tenantResolver.ts:81](src/utils/tenantResolver.ts#L81) — Falta comentario sobre case-sensitivity Firestore
- [src/components/VisionLab.tsx](src/components/VisionLab.tsx), [WhatsAppTemplateModal.tsx](src/components/WhatsAppTemplateModal.tsx) — No revisado exhaustivamente

---

## Cross-cutting patrones detectados

1. **Swallow de errores** — muchos `.catch(() => {})` silenciosos en paths críticos (email, Firestore writes, CxP, rate fetch). Sugiero un wrapper `logAndForget(p, context)` que al menos capture a Sentry.
2. **Tolerancias asimétricas de floats** — mezcla de `0.01`, `0.009`, `0.005`, `Math.abs(...) < 0.01`. Unificar en `isZero(x)` / `equals(a, b)` helpers en `src/utils/money.ts`.
3. **`runTransaction` faltante donde corresponde** — allocations, stock+CxP, sale+inventory. Firestore batch reads NO son atómicos.
4. **Firestore rules permisivas heredadas** — `/customers`, `/portalPayments`, audit logs mutables. Hacer pase de endurecimiento.
5. **`undefined` reaching Firestore** — Firestore rechaza undefineds anidados. El helper `stripUndefined` de `processReceiptBatch.ts` debería extraerse a `src/utils/firestore.ts` y usarse en TODOS los writes.
6. **Timezone / date** — mezcla de `.toISOString().slice(0,10)` (UTC) y `new Date()` (local). Definir un `dateOnly` helper o usar `date-fns-tz`.
7. **Multi-tenant scoping** — varias queries / writes pueden no estar bajo `businesses/{bid}`; auditar cada `collection(db, ...)` y `collectionGroup(...)`.
8. **Cloudinary unsigned presets** — elevar a signed uploads vía API route para todos los flows de user-upload.

---

## Qué NO revisamos (propongo fases 2)

- [ ] Correctitud funcional de algoritmos de pricing dinámico
- [ ] Precisión de cálculos de comisiones / descuento ficticio en producción
- [ ] Cobertura de tests (tests/button-smoke.spec.ts es lo único existente)
- [ ] Consumo de Firestore (reads/writes por pantalla) — potencial optimización
- [ ] Bundle size / code splitting (chunks ~1.2 MB)
- [ ] Accessibility (a11y)
- [ ] Performance profiling
- [ ] functions/ (Cloud Functions) — no inspeccionado en detalle

---

## Siguiente paso

Dime qué bloque te atacamos primero. Sugerencia:

1. **Tanda 1 — Seguridad crítica** (S1-S8 + D7): endurecer rules + API auth. Riesgo de producción alto.
2. **Tanda 2 — Dinero/contabilidad** (D1-D11 + E1-E5): idempotencia allocations, IGTF mixto, CSV escaping, FOUC. Afecta cuadres contables.
3. **Tanda 3 — Estabilidad** (C1-C5 + A22-A28): contexts, hooks, tsconfig. Mejora UX y DX.
4. **Tanda 4 — Resto** (A / M / B): pase largo y amplio.

Cada tanda puede ir en 1–2 commits con su propio build + push.
