import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import ProfitabilityReport from '../components/ProfitabilityReport';

interface Props {
  businessId: string;
}

export default function RentabilidadPage({ businessId }: Props) {
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(collection(db, `businesses/${businessId}/products`), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [businessId]);

  return <ProfitabilityReport businessId={businessId} products={products} />;
}
