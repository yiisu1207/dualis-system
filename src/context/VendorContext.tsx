/**
 * VendorContext — Per-company customizations set by the Dualis admin (super-admin panel).
 *
 * Stored in Firestore: vendorOverrides/{businessId}
 *
 * Usage in components:
 *   const { hidden, forced, featureOverride } = useVendor();
 *   if (hidden('btn-anular-venta')) return null;
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface VendorOverride {
  /** Features forced ON or OFF for this business regardless of their own config */
  featureOverrides: Record<string, boolean>;

  /** Sidebar module IDs that are always accessible regardless of subscription plan */
  forcedModules: string[];

  /** Sidebar module IDs that are completely hidden for this business */
  hiddenModules: string[];

  /** Element IDs (buttons, sections, cards) hidden in the UI for this business */
  hiddenElements: string[];

  /** Template applied (cosmetic label only) */
  template: string;

  /** Developer notes about this client */
  notes: string;

  /**
   * Webhook URL — POSTed to on business events (sale.created, etc.)
   * Set from super-admin panel. Connects to n8n, Zapier, custom backend, etc.
   */
  webhookUrl: string;

  /**
   * Which events trigger the webhook. Empty = all events.
   * e.g. ['sale.created', 'shift.closed']
   */
  webhookEvents: string[];

  /**
   * Custom CSS injected into <style> for this business only.
   * Use for branding tweaks, hiding elements, color overrides.
   */
  customCss: string;

  /**
   * Declarative UI config — JSON object for small UI tweaks without code.
   * e.g. { defaultTab: 'cajas', loginRedirect: 'pos-detal', alertText: '...' }
   */
  uiConfig: Record<string, any>;

  /** Last updated metadata */
  updatedAt?: string;
  updatedBy?: string;
}

export const VENDOR_DEFAULTS: VendorOverride = {
  featureOverrides: {},
  forcedModules:    [],
  hiddenModules:    [],
  hiddenElements:   [],
  template:         'estandar',
  notes:            '',
  webhookUrl:       '',
  webhookEvents:    [],
  customCss:        '',
  uiConfig:         {},
};

// ─── Pre-defined templates ────────────────────────────────────────────────────
export const VENDOR_TEMPLATES: Record<string, Partial<VendorOverride> & { label: string; description: string }> = {
  estandar: {
    label: 'Estándar',
    description: 'Todas las funciones habilitadas según su plan.',
    forcedModules: [],
    hiddenModules: [],
    hiddenElements: [],
    featureOverrides: {},
  },
  retail: {
    label: 'Tienda Retail',
    description: 'POS + inventario + CxC. Sin RRHH, sin conciliación.',
    forcedModules: ['cajas', 'inventario', 'clientes'],
    hiddenModules: ['rrhh', 'conciliacion', 'comparar'],
    hiddenElements: [],
    featureOverrides: { teamChat: false, bookComparison: false },
  },
  restaurante: {
    label: 'Restaurante / Comida',
    description: 'POS rápido al frente. Sin inventario complejo ni CxP.',
    forcedModules: ['cajas'],
    hiddenModules: ['rrhh', 'conciliacion', 'comparar', 'proveedores', 'contabilidad'],
    hiddenElements: ['btn-credito-mayor', 'section-libro-mayor'],
    featureOverrides: { teamChat: false, bookComparison: false, aiVision: false },
  },
  servicios: {
    label: 'Servicios / Consultoría',
    description: 'Sin POS. Enfocado en CxC, RRHH y reportes.',
    forcedModules: ['clientes', 'rrhh', 'reportes'],
    hiddenModules: ['cajas', 'inventario', 'comparar'],
    hiddenElements: ['btn-nueva-venta-detal'],
    featureOverrides: { teamChat: true, bookComparison: false },
  },
  distribuidora: {
    label: 'Distribuidora / Mayorista',
    description: 'POS Mayor + inventario + CxC + CxP + RRHH.',
    forcedModules: ['cajas', 'inventario', 'clientes', 'proveedores', 'rrhh'],
    hiddenModules: ['comparar'],
    hiddenElements: [],
    featureOverrides: { teamChat: true, bookComparison: true },
  },
};

// ─── Hideable elements registry — documents what IDs are available ─────────────
export const HIDEABLE_ELEMENTS: { id: string; label: string; location: string }[] = [
  { id: 'btn-anular-venta',       label: 'Botón Anular Venta',          location: 'Historial de ventas' },
  { id: 'btn-exportar-pdf',       label: 'Botón Exportar PDF',          location: 'Reportes / Audit' },
  { id: 'btn-exportar-excel',     label: 'Botón Exportar Excel',        location: 'Reportes / Audit' },
  { id: 'btn-whatsapp',           label: 'Botón WhatsApp',              location: 'Recibo de venta' },
  { id: 'btn-credito-mayor',      label: 'Opción Crédito POS Mayor',    location: 'POS Mayor' },
  { id: 'btn-descuento',          label: 'Botón Descuento POS',         location: 'POS Detal/Mayor' },
  { id: 'btn-agregar-cliente',    label: 'Botón Agregar Cliente',       location: 'CxC' },
  { id: 'card-kpi-utilidad',      label: 'KPI Utilidad Bruta',          location: 'Dashboard' },
  { id: 'card-kpi-cxc',          label: 'KPI Cuentas por Cobrar',      location: 'Dashboard' },
  { id: 'section-comisiones',     label: 'Sección Comisiones',          location: 'Reportes' },
  { id: 'section-pl',             label: 'Estado de Resultados (P&L)',  location: 'Reportes' },
  { id: 'section-vision-lab',     label: 'VisionLab IA completo',       location: 'VisionLab' },
];

// ─── Context ──────────────────────────────────────────────────────────────────
interface VendorContextValue {
  override: VendorOverride;
  loaded: boolean;
  /** Returns true if the element with this ID should be hidden for this business */
  hidden: (elementId: string) => boolean;
  /** Returns true if the module is force-hidden by the vendor override */
  moduleHidden: (moduleId: string) => boolean;
  /** Returns true if the module is force-enabled regardless of subscription plan */
  moduleForced: (moduleId: string) => boolean;
  /** Returns vendor override for a feature flag, or undefined if not overridden */
  featureOverride: (key: string) => boolean | undefined;
  /** Returns the configured webhook URL (empty string if none) */
  webhookUrl: string;
  /** Returns the declarative UI config value for a given key */
  uiConfig: (key: string) => any;
}

const VendorContext = createContext<VendorContextValue>({
  override: VENDOR_DEFAULTS,
  loaded: false,
  hidden: () => false,
  moduleHidden: () => false,
  moduleForced: () => false,
  featureOverride: () => undefined,
  webhookUrl: '',
  uiConfig: () => undefined,
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export const VendorProvider: React.FC<{ businessId: string; children: React.ReactNode }> = ({
  businessId,
  children,
}) => {
  const [override, setOverride] = useState<VendorOverride>(VENDOR_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!businessId) { setLoaded(true); return; }

    const unsub = onSnapshot(
      doc(db, 'vendorOverrides', businessId),
      snap => {
        if (snap.exists()) {
          setOverride({ ...VENDOR_DEFAULTS, ...snap.data() } as VendorOverride);
        } else {
          setOverride(VENDOR_DEFAULTS);
        }
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsub;
  }, [businessId]);

  // Inject custom CSS into <head> for this business, clean up on change
  useEffect(() => {
    if (!override.customCss) return;
    const el = document.createElement('style');
    el.id = 'dualis-vendor-css';
    el.textContent = override.customCss;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [override.customCss]);

  const hidden       = (id: string) => override.hiddenElements.includes(id);
  const moduleHidden = (id: string) => override.hiddenModules.includes(id);
  const moduleForced = (id: string) => override.forcedModules.includes(id);
  const featureOverride = (key: string): boolean | undefined => {
    const v = override.featureOverrides[key];
    return v === undefined ? undefined : Boolean(v);
  };
  const uiConfig = (key: string) => override.uiConfig?.[key];

  return (
    <VendorContext.Provider value={{
      override, loaded,
      hidden, moduleHidden, moduleForced, featureOverride,
      webhookUrl: override.webhookUrl,
      uiConfig,
    }}>
      {children}
    </VendorContext.Provider>
  );
};

export const useVendor = () => useContext(VendorContext);
