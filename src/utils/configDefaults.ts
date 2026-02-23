import { AppConfig } from '../../types';

export const DEFAULT_CONFIG: AppConfig = {
  companyName: 'DUALIS',
  currency: 'USD',
  language: 'es',
  theme: {
    primaryColor: '#714B67',
    fontFamily: 'Inter',
    borderRadius: '0.5rem',
    // darkMode eliminado: solo modo claro
    deviceMode: 'pc',
    uiVersion: 'editorial',
  },
  system: {
    alertThreshold: 15,
    enableAudit: true,
  },
  notifications: {
    cxc: true,
    inventory: true,
    nomina: true,
    ventas: true,
    finanzas: true,
    reportes: true,
  },
  modules: {
    dashboard: true,
    cxc: true,
    cxp: true,
    statement: true,
    ledger: true,
    expenses: true,
    vision: true,
    reconciliation: true,
    nomina: true,
  },
  messageTemplates: [
    {
      id: 'recordatorio',
      name: 'Recordatorio',
      body: 'Hola {nombre_cliente}, le escribimos de {nombre_empresa} para recordarle su saldo pendiente de {monto_deuda}.',
    },
    {
      id: 'vencido',
      name: 'Vencido',
      body: 'Atencion {nombre_cliente}, su factura ha vencido. Favor contactarnos.',
    },
    {
      id: 'agradecimiento',
      name: 'Agradecimiento',
      body: 'Gracias por su pago. Adjuntamos su estado de cuenta.',
    },
  ],
};

export const mergeConfig = (incoming?: Partial<AppConfig>): AppConfig => {
  const data = incoming || {};
  return {
    ...DEFAULT_CONFIG,
    ...data,
    theme: {
      ...DEFAULT_CONFIG.theme,
      ...(data.theme || {}),
    },
    system: {
      ...DEFAULT_CONFIG.system,
      ...(data.system || {}),
    },
    notifications: {
      ...DEFAULT_CONFIG.notifications,
      ...(data.notifications || {}),
    },
    modules: {
      ...DEFAULT_CONFIG.modules,
      ...(data.modules || {}),
    },
    messageTemplates:
      data.messageTemplates && data.messageTemplates.length > 0
        ? data.messageTemplates
        : DEFAULT_CONFIG.messageTemplates,
  };
};
