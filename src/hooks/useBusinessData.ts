import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Customer, Movement, Supplier, Employee, CashAdvance, PayrollReceipt, InventoryItem } from '../../types';

export interface BusinessData {
  customers: Customer[];
  suppliers: Supplier[];
  movements: Movement[];
  employees: Employee[];
  advances: CashAdvance[];
  payrollHistory: PayrollReceipt[];
  inventoryItems: InventoryItem[];
}

export function useBusinessData(businessId: string): BusinessData {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<CashAdvance[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<PayrollReceipt[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    if (!businessId) return;

    const unsubs: (() => void)[] = [];

    const qCust = query(collection(db, 'customers'), where('businessId', '==', businessId));
    unsubs.push(onSnapshot(qCust, snap =>
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)))
    ));

    const qSupp = query(collection(db, 'suppliers'), where('businessId', '==', businessId));
    unsubs.push(onSnapshot(qSupp, snap =>
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)))
    ));

    const qMov = query(
      collection(db, 'movements'),
      where('businessId', '==', businessId),
      orderBy('date', 'desc'),
      limit(300)
    );
    unsubs.push(onSnapshot(qMov, snap =>
      setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)))
    ));

    const qEmp = query(
      collection(db, `businesses/${businessId}/employees`)
    );
    unsubs.push(onSnapshot(qEmp, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      docs.sort((a: any, b: any) => (a.fullName || a.name || '').localeCompare(b.fullName || b.name || ''));
      setEmployees(docs);
    }));

    const qAdv = query(
      collection(db, `businesses/${businessId}/payroll_advances`),
      orderBy('date', 'desc')
    );
    unsubs.push(onSnapshot(qAdv, snap =>
      setAdvances(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)))
    ));

    const qHist = query(
      collection(db, `businesses/${businessId}/payroll_history`),
      orderBy('date', 'desc'),
      limit(24)
    );
    unsubs.push(onSnapshot(qHist, snap =>
      setPayrollHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)))
    ));

    const qInv = query(
      collection(db, `businesses/${businessId}/products`)
    );
    unsubs.push(onSnapshot(qInv, snap =>
      setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)))
    ));

    return () => unsubs.forEach(u => u());
  }, [businessId]);

  return { customers, suppliers, movements, employees, advances, payrollHistory, inventoryItems };
}
