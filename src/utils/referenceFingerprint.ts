// SHA-256 fingerprint determinístico para identificar una transacción bancaria
// de manera única cross-cuenta. Usado por:
//  - PortalAbonoForm para dedup de pagos del portal
//  - reconciliationGuards.claimReference para anti-reuso de referencias

export async function buildReferenceFingerprint(
  bankAccountId: string,
  reference: string,
  amount: number,
): Promise<string> {
  const raw = `${bankAccountId}|${reference.trim()}|${amount.toFixed(2)}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
