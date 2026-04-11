import { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Movement, MovementType, AccountType, PortalPayment, EarlyPaymentTier, CustomRate } from '../../types';

export interface PortalBalances {
  bcv: number;
  grupo: number;
  divisa: number;
  total: number;
  /** Saldo por cada accountType que aparece en los movimientos del cliente. Key = accountType. */
  byAccount: Record<string, number>;
}

export interface AgingBuckets {
  current: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
}

export interface InvoiceWithDiscount {
  movement: Movement;
  daysOld: number;
  amountUsd: number;
  eligibleTier: EarlyPaymentTier | null;
  discountAmount: number;
  netAmount: number;
}

export interface PortalRates {
  bcv: number;
  grupo: number;
  divisa: number;
  lastUpdated: string;
  customRates: CustomRate[];
}

export function usePortalData(businessId: string, customerId: string) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [portalPayments, setPortalPayments] = useState<PortalPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creditPolicy, setCreditPolicy] = useState<any>(null);
  const [creditLimit, setCreditLimit] = useState(0);
  const [rates, setRates] = useState<PortalRates>({ bcv: 0, grupo: 0, divisa: 0, lastUpdated: '', customRates: [] });

  // Load movements for this customer
  useEffect(() => {
    if (!businessId || !customerId) return;

    const q = query(
      collection(db, 'movements'),
      where('businessId', '==', businessId),
      where('entityId', '==', customerId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Movement));
      setMovements(data);
      setLoading(false);
    });

    return unsub;
  }, [businessId, customerId]);

  // Load portal payments
  useEffect(() => {
    if (!businessId || !customerId) return;

    const q = query(
      collection(db, 'businesses', businessId, 'portalPayments'),
      where('customerId', '==', customerId)
    );

    const unsub = onSnapshot(q, (snap) => {
      setPortalPayments(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as PortalPayment))
      );
    });

    return unsub;
  }, [businessId, customerId]);

  // Load credit policy + customer credit limit + exchange rates
  useEffect(() => {
    if (!businessId || !customerId) return;
    (async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        // Config (credit policy + rates)
        const configSnap = await getDoc(doc(db, 'businessConfigs', businessId));
        if (configSnap.exists()) {
          const data = configSnap.data();
          setCreditPolicy(data?.creditPolicy || null);
          // Build customRates from Firestore (with auto-migration from legacy fields)
          let customRates: CustomRate[] = data?.customRates || [];
          if (customRates.length === 0) {
            const legacyRates: CustomRate[] = [];
            const tG = Number(data?.tasaGrupo || 0);
            const tD = Number(data?.tasaDivisa || 0);
            if (tG > 0) legacyRates.push({ id: 'GRUPO', name: 'Grupo', value: tG, enabled: true });
            if (tD > 0) legacyRates.push({ id: 'DIVISA', name: 'Divisa', value: tD, enabled: true });
            customRates = legacyRates;
          }
          setRates({
            bcv: Number(data?.tasaBCV || data?.rates?.tasaBCV || 0),
            grupo: Number(data?.tasaGrupo || data?.rates?.tasaGrupo || 0),
            divisa: Number(data?.tasaDivisa || data?.rates?.tasaDivisa || 0),
            lastUpdated: data?.ratesUpdatedAt || data?.updatedAt || '',
            customRates,
          });
        }
        // Customer credit limit
        const custSnap = await getDoc(doc(db, 'customers', customerId));
        if (custSnap.exists()) {
          setCreditLimit(Number(custSnap.data()?.creditLimit || 0));
        }
      } catch {}
    })();
  }, [businessId, customerId]);

  // Compute balances dinámicamente por cada accountType presente en los movimientos
  const balances = useMemo<PortalBalances>(() => {
    const byAccount: Record<string, number> = {};
    movements.forEach((m) => {
      if ((m as any).anulada) return;
      const acct = String(m.accountType || '');
      if (!acct) return;
      const amt = m.amountInUSD || m.amount;
      const sign = m.movementType === MovementType.FACTURA ? 1 : m.movementType === MovementType.ABONO ? -1 : 0;
      if (!sign) return;
      byAccount[acct] = (byAccount[acct] || 0) + amt * sign;
    });
    const bcv = byAccount[AccountType.BCV] || 0;
    const grupo = byAccount[AccountType.GRUPO] || 0;
    const divisa = byAccount[AccountType.DIVISA] || 0;
    const total = Object.values(byAccount).reduce((s, v) => s + v, 0);
    return { bcv, grupo, divisa, total, byAccount };
  }, [movements]);

  // Aging buckets
  const aging = useMemo<AgingBuckets>(() => {
    const now = Date.now();
    const buckets: AgingBuckets = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    movements
      .filter((m) => m.movementType === MovementType.FACTURA && !(m as any).pagado && !(m as any).anulada)
      .forEach((inv) => {
        const days = Math.floor((now - new Date(inv.date).getTime()) / 86_400_000);
        const amt = inv.amountInUSD || inv.amount;
        if (days <= 30) buckets.current += amt;
        else if (days <= 60) buckets.d31_60 += amt;
        else if (days <= 90) buckets.d61_90 += amt;
        else buckets.d90plus += amt;
      });
    return buckets;
  }, [movements]);

  // Unpaid invoices with pronto pago eligibility
  const invoicesWithDiscount = useMemo<InvoiceWithDiscount[]>(() => {
    const now = Date.now();
    const tiers: EarlyPaymentTier[] = creditPolicy?.earlyPaymentTiers || [];
    const sortedTiers = [...tiers].sort((a, b) => a.maxDays - b.maxDays);

    return movements
      .filter((m) => m.movementType === MovementType.FACTURA && !(m as any).pagado && !(m as any).anulada)
      .map((m) => {
        const daysOld = Math.floor((now - new Date(m.date).getTime()) / 86_400_000);
        const amountUsd = m.amountInUSD || m.amount;
        const eligibleTier = sortedTiers.find((t) => daysOld <= t.maxDays) || null;
        const discountAmount = eligibleTier ? amountUsd * (eligibleTier.discountPercent / 100) : 0;
        return {
          movement: m,
          daysOld,
          amountUsd,
          eligibleTier,
          discountAmount,
          netAmount: amountUsd - discountAmount,
        };
      })
      .sort((a, b) => new Date(a.movement.date).getTime() - new Date(b.movement.date).getTime());
  }, [movements, creditPolicy]);

  // Upcoming due dates
  const upcomingDueDates = useMemo(() => {
    const now = Date.now();
    return movements
      .filter((m) => m.movementType === MovementType.FACTURA && !(m as any).pagado && !(m as any).anulada)
      .map((m) => {
        const cond = (m as any).paymentCondition as string || 'contado';
        const creditDays = cond.startsWith('credito') ? parseInt(cond.replace('credito', '')) : 0;
        const invoiceDate = new Date(m.date);
        const dueDate = new Date(invoiceDate.getTime() + creditDays * 86_400_000);
        const daysUntilDue = Math.ceil((dueDate.getTime() - now) / 86_400_000);
        return { movement: m, dueDate, daysUntilDue, amountUsd: m.amountInUSD || m.amount };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }, [movements]);

  const creditAvailable = creditLimit > 0 ? Math.max(0, creditLimit - Math.max(0, balances.total)) : 0;

  return {
    movements,
    portalPayments,
    loading,
    balances,
    aging,
    invoicesWithDiscount,
    upcomingDueDates,
    creditLimit,
    creditAvailable,
    creditPolicy,
    rates,
  };
}
