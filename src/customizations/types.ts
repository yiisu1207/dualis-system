import type React from 'react';

/**
 * Defines what a business-specific customization can include.
 * Add a new entry in index.ts with the client's businessId.
 */
export interface BusinessCustomization {
  /** Extra cards injected at the top of the Dashboard */
  dashboardCards?: React.ReactNode[];

  /** Extra sidebar tabs exclusive to this business */
  extraTabs?: CustomTab[];

  /** Extra action buttons shown in POS Detal toolbar */
  posDetalActions?: React.ReactNode[];

  /** Extra action buttons shown in POS Mayor toolbar */
  posMayorActions?: React.ReactNode[];

  /** Called after every sale is registered — for custom automation/logging */
  afterSaleHook?: (sale: Record<string, any>) => Promise<void> | void;

  /** Called after every inventory update */
  afterInventoryHook?: (item: Record<string, any>) => Promise<void> | void;

  /** Called after a customer is created or updated */
  afterCustomerHook?: (customer: Record<string, any>) => Promise<void> | void;

  /** Inject custom CSS string for this business (scoped to root) */
  customCss?: string;

  /** Override the displayed business name in the UI */
  businessDisplayName?: string;
}

export interface CustomTab {
  /** Unique ID — used as activeTab value */
  id: string;
  /** Sidebar label */
  label: string;
  /** Lucide icon component */
  icon?: React.ReactNode;
  /** Which sidebar group to place it in: 'Operaciones' | 'Finanzas' | 'Inteligencia' | 'Herramientas' */
  group?: string;
  /** The component to render when this tab is active */
  component: React.ReactNode;
}
