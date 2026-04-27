// Sistema de hotkeys configurable por terminal — POS.
//
// Decisiones:
//   - Persistencia por terminal (cajaId) en localStorage. Cada caja puede
//     tener sus propias teclas (cajeros con preferencias distintas).
//   - El primer uso muestra modal de onboarding una vez. Después se accede
//     desde Configuración → Atajos.
//   - Defaults razonables (F1/F2/F3/F4/F12 + Ctrl+N/Ctrl+R/Esc).
//   - Un solo set por terminal (sin perfiles por cajero individual para
//     mantener el modelo simple en V1).

export type HotkeyAction =
  | 'cobrar'
  | 'credito'
  | 'cliente'
  | 'descuento'
  | 'retener'
  | 'nuevoCliente'
  | 'repetirVenta'
  | 'limpiarCarrito'
  | 'consumidorFinal'
  | 'verHistorial'
  | 'escanear';

export interface HotkeyDef {
  action: HotkeyAction;
  label: string;
  description: string;
  /** Combo en formato simple: "F1", "Escape", "ctrl+n", "shift+f4". */
  combo: string;
  /** Default factory — referencia para "Restaurar defaults". */
  defaultCombo: string;
}

export const DEFAULT_HOTKEYS: HotkeyDef[] = [
  { action: 'cobrar',          label: 'Cobrar venta',           description: 'Abre modal de pago', combo: 'F1',  defaultCombo: 'F1'  },
  { action: 'credito',         label: 'Vender a crédito',       description: 'Genera factura en CxC', combo: 'F2',  defaultCombo: 'F2'  },
  { action: 'cliente',         label: 'Buscar cliente',         description: 'Foco en buscador de cliente', combo: 'F3',  defaultCombo: 'F3'  },
  { action: 'descuento',       label: 'Aplicar descuento',      description: 'Abre el control de descuento global', combo: 'F4',  defaultCombo: 'F4'  },
  { action: 'retener',         label: 'Retener carrito',        description: 'Pone el carrito en espera', combo: 'F12', defaultCombo: 'F12' },
  { action: 'nuevoCliente',    label: 'Nuevo cliente',          description: 'Crear cliente nuevo inline', combo: 'ctrl+n', defaultCombo: 'ctrl+n' },
  { action: 'repetirVenta',    label: 'Repetir última venta',   description: 'Recupera el carrito de la última venta', combo: 'ctrl+r', defaultCombo: 'ctrl+r' },
  { action: 'limpiarCarrito',  label: 'Limpiar carrito',        description: 'Vacía el carrito (con confirmación)', combo: 'Escape', defaultCombo: 'Escape' },
  { action: 'consumidorFinal', label: 'Consumidor final',       description: 'Toggle consumidor final', combo: 'F8',  defaultCombo: 'F8'  },
  { action: 'verHistorial',    label: 'Historial de ventas',    description: 'Abre el panel de ventas del día', combo: 'F9',  defaultCombo: 'F9'  },
  { action: 'escanear',        label: 'Escanear barcode',       description: 'Activar cámara para escanear', combo: 'F10', defaultCombo: 'F10' },
];

const STORAGE_PREFIX = 'pos_hotkeys_v1_';
const ONBOARDED_PREFIX = 'pos_hotkeys_onboarded_v1_';

/** Carga las hotkeys del terminal (o defaults si nunca fueron seteadas). */
export function loadHotkeys(cajaId: string): HotkeyDef[] {
  if (!cajaId) return DEFAULT_HOTKEYS;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + cajaId);
    if (!raw) return DEFAULT_HOTKEYS;
    const stored = JSON.parse(raw) as Partial<HotkeyDef>[];
    // Reconciliamos con DEFAULT_HOTKEYS para no perder acciones nuevas
    // que se agreguen a futuro (mismo orden, override del combo).
    return DEFAULT_HOTKEYS.map(def => {
      const found = stored.find(s => s.action === def.action);
      return found?.combo ? { ...def, combo: found.combo } : def;
    });
  } catch {
    return DEFAULT_HOTKEYS;
  }
}

export function saveHotkeys(cajaId: string, hotkeys: HotkeyDef[]): void {
  if (!cajaId) return;
  try {
    const minimal = hotkeys.map(h => ({ action: h.action, combo: h.combo }));
    localStorage.setItem(STORAGE_PREFIX + cajaId, JSON.stringify(minimal));
  } catch {
    // localStorage lleno o deshabilitado → silencioso
  }
}

export function hasOnboarded(cajaId: string): boolean {
  if (!cajaId) return true; // sin cajaId, no molestamos
  return localStorage.getItem(ONBOARDED_PREFIX + cajaId) === '1';
}

export function markOnboarded(cajaId: string): void {
  if (!cajaId) return;
  localStorage.setItem(ONBOARDED_PREFIX + cajaId, '1');
}

export function resetHotkeys(cajaId: string): HotkeyDef[] {
  if (!cajaId) return DEFAULT_HOTKEYS;
  localStorage.removeItem(STORAGE_PREFIX + cajaId);
  return DEFAULT_HOTKEYS;
}

/** Convierte un KeyboardEvent al formato combo que usamos. */
export function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey && e.key.length > 1) parts.push('shift'); // shift+F1, no shift+a
  if (e.altKey) parts.push('alt');
  let key = e.key;
  // Normalización: mayúsculas para teclas con nombre, lowercase para letras
  if (key.length === 1) key = key.toLowerCase();
  // Filtrar modifiers solos
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return '';
  parts.push(key);
  return parts.join('+');
}

/** Display friendly de un combo: "ctrl+n" → "Ctrl + N", "F1" → "F1". */
export function comboLabel(combo: string): string {
  return combo
    .split('+')
    .map(p => {
      if (p === 'ctrl') return 'Ctrl';
      if (p === 'shift') return 'Shift';
      if (p === 'alt') return 'Alt';
      if (p === 'Escape') return 'Esc';
      if (p.length === 1) return p.toUpperCase();
      return p;
    })
    .join(' + ');
}
