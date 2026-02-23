export type DemoData = {
  customers?: any[];
  suppliers?: any[];
  inventory?: any[];
  movements?: any[];
  employees?: any[];
  records?: any[];
  sanctions?: any[];
  advances?: any[];
  payrollReceipts?: any[];
  sales?: any[];
  reconciliations?: any[];
};

const DEMO_STORAGE_KEY = 'erp_demo_data';
const DEMO_MODE_KEY = 'erp_demo_mode';

export const isDemoMode = () => localStorage.getItem(DEMO_MODE_KEY) === '1';

export const loadDemoData = (): DemoData | null => {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoData;
  } catch (e) {
    console.warn('No se pudo leer demo data', e);
    return null;
  }
};

export const saveDemoData = (data: DemoData) => {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(DEMO_MODE_KEY, '1');
  } catch (e) {
    console.warn('No se pudo guardar demo data', e);
  }
};

export const clearDemoData = () => {
  localStorage.removeItem(DEMO_STORAGE_KEY);
  localStorage.removeItem(DEMO_MODE_KEY);
};
