// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  INVENTARIO — Tipos compartidos                                          ║
// ║                                                                          ║
// ║  Firestore paths:                                                        ║
// ║    businesses/{bid}/stockEntries/{id}     — entradas (recepción)         ║
// ║    businesses/{bid}/stockExits/{id}       — salidas (despacho/merma)     ║
// ║    businesses/{bid}/physicalCounts/{id}   — sesiones de conteo físico    ║
// ║    businesses/{bid}/inventoryMovements    — kardex consolidado (legacy)  ║
// ║                                                                          ║
// ║  Convención: cada StockEntry/StockExit GENERA N inventoryMovements al    ║
// ║  procesarse. Los movements son la fuente de verdad para el Kardex.       ║
// ║  Las entries/exits son el documento operativo (con líneas, motivo, doc   ║
// ║  origen, estado draft/done).                                             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/** Tipos de entrada al inventario. Cada uno tiene flujo y validaciones distintas. */
export type StockEntryType =
  | 'COMPRA'              // Recepción contra una factura/compra existente
  | 'AJUSTE_POSITIVO'     // Encontré stock no contado / regalo / muestra
  | 'DEVOLUCION_CLIENTE'  // Cliente devolvió, vuelve a stock
  | 'TRANSFERENCIA'       // Llegada desde otro almacén (par con StockExit)
  | 'PRODUCCION'          // Kit/ensamble terminado
  | 'INVENTARIO_INICIAL'  // Carga de saldos al arrancar el sistema
  | 'CONTEO_VARIANZA';    // Varianza positiva del conteo cíclico

export type StockExitType =
  | 'VENTA'               // Despacho contra una venta
  | 'AJUSTE_NEGATIVO'     // Encontré menos / merma genérica
  | 'MERMA'               // Daño / vencimiento / pérdida con motivo
  | 'DEVOLUCION_PROVEEDOR' // Devuelvo al proveedor
  | 'TRANSFERENCIA'       // Salida hacia otro almacén
  | 'CONSUMO_PRODUCCION'  // Componentes consumidos al armar un kit
  | 'CONTEO_VARIANZA';    // Varianza negativa del conteo cíclico

export type StockOpStatus =
  | 'DRAFT'        // Borrador, editable, no afecta stock
  | 'CONFIRMED'    // Confirmado pero esperando recepción física (multi-step)
  | 'DONE'         // Procesado, stock actualizado, inmutable
  | 'CANCELLED';   // Anulado

/** Una línea de producto dentro de una entrada/salida. */
export interface StockOpLine {
  id: string;                  // nanoid local, no Firestore
  productId: string;
  productCode?: string;
  productName: string;
  /** Cantidad esperada (ej. lo que dice la factura del proveedor). */
  expectedQty: number;
  /** Cantidad realmente recibida/despachada. Puede diferir de expectedQty. */
  doneQty: number;
  /** Costo unitario USD al momento de la operación (snapshot). */
  unitCostUSD?: number;
  /** Lote (opcional, para productos con tracking de lote). */
  lote?: string;
  /** Vencimiento del lote (ISO YYYY-MM-DD). */
  fechaVencimiento?: string;
  /** Motivo específico de esta línea si difiere del motivo general. */
  lineMotivo?: string;
  /** Variante del producto si aplica (ej. "Talla M / Color Rojo"). */
  variantId?: string;
  variantLabel?: string;
}

/** Documento de Entrada al inventario. Se persiste en Firestore. */
export interface StockEntry {
  id: string;
  businessId: string;
  type: StockEntryType;
  status: StockOpStatus;
  /** Fecha-hora ISO de la operación. */
  operationDate: string;
  /** Almacén destino. Si solo hay 1 configurado, se asume y se autohide en UI. */
  warehouseId: string;
  warehouseName?: string;

  /** Vinculación opcional al documento que originó la entrada.
   *  Ej. type=COMPRA → sourceDocId = id del Movement de tipo FACTURA-proveedor.
   *  Ej. type=TRANSFERENCIA → sourceDocId = id del StockExit del almacén origen.
   *  Ej. type=DEVOLUCION_CLIENTE → sourceDocId = id del Movement de venta original. */
  sourceDocType?: 'movement' | 'stockExit' | 'physicalCount' | 'manual';
  sourceDocId?: string;
  sourceDocLabel?: string;

  /** Líneas de producto. */
  lines: StockOpLine[];

  /** Motivo general (obligatorio para AJUSTE_POSITIVO, INVENTARIO_INICIAL, etc.). */
  motivo?: string;
  /** Nota interna libre. */
  nota?: string;

  /** Total USD de la operación (suma de doneQty * unitCostUSD). */
  totalUSD: number;

  /** Si la entrada fue parcial respecto a lo esperado, se genera un backorder
   *  (otra StockEntry de status DRAFT con las cantidades faltantes). */
  backorderId?: string;
  /** Si esta entrada ES un backorder, apunta al original. */
  parentEntryId?: string;

  /** Auditoría. */
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  processedAt?: string;
  processedBy?: string;
  processedByName?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
}

/** Documento de Salida del inventario. Simétrico a StockEntry. */
export interface StockExit {
  id: string;
  businessId: string;
  type: StockExitType;
  status: StockOpStatus;
  operationDate: string;
  /** Almacén origen. */
  warehouseId: string;
  warehouseName?: string;

  sourceDocType?: 'movement' | 'stockEntry' | 'physicalCount' | 'manual';
  sourceDocId?: string;
  sourceDocLabel?: string;

  /** Si es TRANSFERENCIA, almacén destino. Genera StockEntry par cuando el otro
   *  almacén confirma la recepción. */
  destinationWarehouseId?: string;
  destinationWarehouseName?: string;
  /** ID del StockEntry par (cuando se procesa la transferencia). */
  pairedEntryId?: string;

  lines: StockOpLine[];

  motivo?: string;
  nota?: string;
  totalUSD: number;

  createdAt: string;
  createdBy: string;
  createdByName?: string;
  processedAt?: string;
  processedBy?: string;
  processedByName?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
}

/** Sesión de conteo físico. Se genera una hoja, se cuenta, se aplica ajuste. */
export interface PhysicalCount {
  id: string;
  businessId: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'APPLIED' | 'CANCELLED';
  /** Almacén que se cuenta. */
  warehouseId: string;
  warehouseName?: string;
  /** Categoría/filtro opcional para conteo cíclico parcial. */
  filterCategory?: string;
  filterTag?: string;

  /** Líneas con teórico vs real. */
  lines: PhysicalCountLine[];

  /** Si se aplicó, IDs del StockEntry y StockExit generados por las varianzas. */
  appliedEntryId?: string;
  appliedExitId?: string;

  startedAt: string;
  startedBy: string;
  startedByName?: string;
  appliedAt?: string;
  appliedBy?: string;
  appliedByName?: string;
  notes?: string;
}

export interface PhysicalCountLine {
  productId: string;
  productCode?: string;
  productName: string;
  /** Stock teórico al momento de generar la hoja. Inmutable. */
  theoreticalQty: number;
  /** Stock contado físicamente. Editable hasta APPLIED. */
  countedQty: number | null;
  /** Diferencia = countedQty - theoreticalQty. Positivo = sobra, negativo = falta. */
  variance?: number;
  /** Costo unitario al momento del conteo (para valorar la varianza). */
  unitCostUSD?: number;
  varianceMotivo?: string;
}

// ─── Helpers de etiquetas en español ──────────────────────────────────────

export const STOCK_ENTRY_TYPE_LABELS: Record<StockEntryType, string> = {
  COMPRA: 'Compra',
  AJUSTE_POSITIVO: 'Ajuste +',
  DEVOLUCION_CLIENTE: 'Devolución de cliente',
  TRANSFERENCIA: 'Transferencia',
  PRODUCCION: 'Producción',
  INVENTARIO_INICIAL: 'Inventario inicial',
  CONTEO_VARIANZA: 'Varianza de conteo',
};

export const STOCK_EXIT_TYPE_LABELS: Record<StockExitType, string> = {
  VENTA: 'Venta',
  AJUSTE_NEGATIVO: 'Ajuste −',
  MERMA: 'Merma',
  DEVOLUCION_PROVEEDOR: 'Devolución a proveedor',
  TRANSFERENCIA: 'Transferencia',
  CONSUMO_PRODUCCION: 'Consumo (producción)',
  CONTEO_VARIANZA: 'Varianza de conteo',
};

export const STOCK_STATUS_LABELS: Record<StockOpStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  DONE: 'Procesado',
  CANCELLED: 'Anulado',
};
