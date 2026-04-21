// SHA-256 fingerprint determinístico para identificar una transacción bancaria
// de manera única cross-cuenta. Usado por:
//  - PortalAbonoForm para dedup de pagos del portal
//  - reconciliationGuards.claimReference para anti-reuso de referencias

export async function buildReferenceFingerprint(
  bankAccountId: string,
  reference: string,
  amount: number,
): Promise<string> {
  // Coerción defensiva: algunos parsers (BDV Empresa) devuelven refs como number,
  // y .trim() sobre number lanza TypeError. Esto antes reventaba el auto-confirm
  // silenciosamente y dejaba abonos con match exact/105 atascados en 'revisar'.
  const refStr = String(reference ?? '').trim();
  const raw = `${bankAccountId}|${refStr}|${amount.toFixed(2)}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
