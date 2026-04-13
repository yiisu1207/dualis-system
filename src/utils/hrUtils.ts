// ── HR Utility Functions ─────────────────────────────────────────────────────

export function fmtHR(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Días de vacaciones acumulados según fecha de ingreso */
export function accrueVacationDays(startDate: string, daysPerYear = 15): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return 0;
  const ms = Date.now() - start.getTime();
  const years = ms / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.floor(years * daysPerYear));
}

/** Rango de fechas del período según frecuencia */
function calcDateRange(frequency: string, refDate?: Date): { from: string; to: string; label: string } {
  const ref = refDate || new Date();
  const fmt = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

  if (frequency === 'semanal') {
    const from = new Date(ref);
    from.setDate(from.getDate() - 7);
    return { from: fmt(from), to: fmt(ref), label: 'Semanal' };
  } else if (frequency === 'quincenal') {
    const d = ref.getDate();
    if (d <= 15) {
      return {
        from: fmt(new Date(ref.getFullYear(), ref.getMonth(), 1)),
        to:   fmt(new Date(ref.getFullYear(), ref.getMonth(), 15)),
        label: '1ra Quincena',
      };
    } else {
      return {
        from: fmt(new Date(ref.getFullYear(), ref.getMonth(), 16)),
        to:   fmt(new Date(ref.getFullYear(), ref.getMonth() + 1, 0)),
        label: '2da Quincena',
      };
    }
  } else {
    return {
      from: fmt(new Date(ref.getFullYear(), ref.getMonth(), 1)),
      to:   fmt(new Date(ref.getFullYear(), ref.getMonth() + 1, 0)),
      label: 'Mensual',
    };
  }
}

/** Imprimir hoja de vales de un empleado */
export function printVoucherSheet(emp: any, vouchers: any[], businessName = 'Mi Negocio', businessLogo = '') {
  const w = window.open('', '_blank', 'width=794,height=1123');
  if (!w) return;
  const pending = vouchers.filter((v: any) => v.status === 'PENDIENTE');
  const totalUSD = pending.filter((v: any) => v.currency === 'USD').reduce((s: number, v: any) => s + Number(v.amount), 0);
  const totalBs  = pending.filter((v: any) => v.currency === 'BS').reduce((s: number, v: any) => s + Number(v.amount), 0);
  const totalEquivUSD = pending.reduce((s: number, v: any) => s + Number(v.amountUSD || (v.currency === 'USD' ? v.amount : 0)), 0);

  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Vales – ${emp.fullName}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:32px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2.5px solid #111}
  .biz{font-size:22px;font-weight:900;letter-spacing:-0.5px}
  .doc-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#666;margin-top:3px}
  .emp-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;padding:14px;background:#f7f7f7;border-radius:4px}
  .ef-label{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:2px}
  .ef-val{font-size:13px;font-weight:700}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#555;padding:9px 10px;border-bottom:2px solid #111;text-align:left}
  td{padding:8px 10px;border-bottom:1px solid #e8e8e8;font-size:11px}
  .tr{text-align:right}.tc{text-align:center}
  .total-row td{background:#f7f7f7;font-weight:900;border-top:2px solid #111;font-size:12px}
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:900;text-transform:uppercase}
  .bp{background:#fee2e2;color:#dc2626}.bd{background:#d1fae5;color:#059669}.bc{background:#fef3c7;color:#b45309}
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:50px}
  .sig-line{border-top:1px solid #111;padding-top:6px;font-size:10px;color:#666;text-align:center}
  .sig-sub{text-align:center;font-size:9px;color:#aaa;margin-top:3px}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center}
  .footer-brand{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px}
  .footer-logo{height:24px;object-fit:contain}
  .footer-icon{width:24px;height:24px;border-radius:6px;background:#4f46e5;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:900;flex-shrink:0}
  .footer-biz{font-size:13px;font-weight:900;color:#1e293b}
  .footer-sub{font-size:10px;color:#94a3b8;margin:0}
  @media print{body{padding:18px}}
</style></head><body>
<div class="header">
  <div><div class="biz">${businessName}</div><div class="doc-type">Comprobante de Vales — Control Interno RRHH</div></div>
  <div class="tr">
    <div style="font-size:10px;color:#999;margin-bottom:3px">Fecha de emisión</div>
    <div style="font-size:14px;font-weight:700">${new Date().toLocaleDateString('es-VE',{year:'numeric',month:'long',day:'numeric'})}</div>
  </div>
</div>
<div class="emp-grid">
  <div><div class="ef-label">Empleado</div><div class="ef-val">${emp.fullName}</div></div>
  <div><div class="ef-label">Departamento</div><div class="ef-val">${emp.department||'—'}</div></div>
  <div><div class="ef-label">Cargo</div><div class="ef-val">${emp.role||'—'}</div></div>
  <div><div class="ef-label">Cédula</div><div class="ef-val">${emp.cedula||'S/N'}</div></div>
  <div><div class="ef-label">Teléfono</div><div class="ef-val">${emp.phone||'—'}</div></div>
  <div><div class="ef-label">Frecuencia de Pago</div><div class="ef-val">${emp.payFrequency==='quincenal'?'Quincenal':emp.payFrequency==='semanal'?'Semanal':'Mensual'}</div></div>
</div>
<table>
  <thead><tr>
    <th>Fecha</th><th>Concepto</th><th class="tc">Moneda</th>
    <th class="tr">Monto</th><th class="tr">Tasa Usada</th><th class="tr">Equiv. USD</th><th class="tc">Estatus</th>
  </tr></thead>
  <tbody>
    ${vouchers.map((v: any)=>`<tr>
      <td>${v.createdAt?.toDate?v.createdAt.toDate().toLocaleDateString('es-VE'):v.voucherDate||'—'}</td>
      <td>${v.reason||'—'}${v.correctedFrom?'<br><span style="font-size:9px;color:#b45309">[CORREGIDO de '+fmtHR(Number(v.originalAmount||0))+']</span>':''}</td>
      <td class="tc">${v.currency}</td>
      <td class="tr">${v.currency==='USD'?'$':'Bs '}${fmtHR(Number(v.amount))}</td>
      <td class="tr">${v.rateUsed?'Bs '+fmtHR(Number(v.rateUsed)):'—'}</td>
      <td class="tr">${v.amountUSD!=null?'$'+fmtHR(Number(v.amountUSD)):v.currency==='USD'?'$'+fmtHR(Number(v.amount)):'—'}</td>
      <td class="tc"><span class="badge ${v.status==='PENDIENTE'?'bp':v.status==='CORREGIDO'?'bc':'bd'}">${v.status}</span></td>
    </tr>`).join('')}
    <tr class="total-row">
      <td colspan="3">TOTALES PENDIENTES (${pending.length} vales)${totalUSD>0||totalBs>0?`<br><span style="font-size:9px;font-weight:400;color:#666">${totalUSD>0?'$'+fmtHR(totalUSD)+' USD':''}${totalUSD>0&&totalBs>0?' &nbsp;·&nbsp; ':''}${totalBs>0?'Bs '+fmtHR(totalBs):''}</span>`:''}</td>
      <td></td>
      <td></td>
      <td class="tr">$${fmtHR(totalEquivUSD)}</td>
      <td></td>
    </tr>
  </tbody>
</table>
<div class="sigs">
  <div><div class="sig-line">Firma del Empleado</div><div class="sig-sub">${emp.fullName} · ${emp.cedula||'S/N'}</div></div>
  <div><div class="sig-line">Autorizado por</div><div class="sig-sub">Administración / RRHH</div></div>
</div>
<div style="margin-top:20px;padding:8px;border:1px dashed #666;font-size:8px;text-align:center;color:#555;line-height:1.4">
  DOCUMENTO INTERNO ADMINISTRATIVO &middot; NO ES RECIBO FISCAL &middot; SIN VALOR TRIBUTARIO<br/>
  Sistema administrativo no homologado ante el SENIAT.
</div>
<div class="footer">
  <div class="footer-brand">
    ${businessLogo
      ? `<img src="${businessLogo}" class="footer-logo" alt="${businessName}" />`
      : `<div class="footer-icon">${businessName[0]?.toUpperCase() || 'D'}</div>`
    }
    <span class="footer-biz">${businessName}</span>
  </div>
  <p class="footer-sub">Reporte generado con <strong style="color:#6366f1">Dualis ERP</strong> &nbsp;·&nbsp; dualis.app</p>
</div>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

/** Imprimir recibo de nómina individual */
export function printPayslip(
  emp: any,
  row: any,
  period: string,
  frequency: string,
  businessName = 'Mi Negocio',
  periodVouchers: any[] = [],
  processDate?: string,
  activeLoans: any[] = [],
) {
  const w = window.open('', '_blank', 'width=794,height=900');
  if (!w) return;

  const refDate = processDate ? new Date(processDate) : new Date();
  const { from, to, label } = calcDateRange(frequency, refDate);

  // Per-period divisor
  const freqDiv = frequency === 'semanal' ? 4.33 : frequency === 'quincenal' ? 2 : 1;

  // Per-period income amounts
  const pSalUSD   = (emp.salaryUSD  || 0) / freqDiv;
  const pBonusUSD = (emp.bonusUSD   || 0) / freqDiv;
  const pSalBs    = (emp.salaryBs   || 0) / freqDiv;
  const pBonusBs  = (emp.bonusBs    || 0) / freqDiv;
  const pGrossUSD = pSalUSD + pBonusUSD;
  const pGrossBs  = pSalBs  + pBonusBs;

  // IVSS/Paro already come period-proportional from nominaRows
  const pIVSS   = row.ivssUSD    || 0;
  const pParo   = row.paroUSD    || 0;
  // Vouchers and loan installments are already period-based
  const pVales  = row.voucherDedUSD || 0;
  const pLoans  = row.loanDedUSD    || 0;
  const pTotalDed = pVales + pIVSS + pParo + pLoans;
  const pNetUSD = Math.max(0, pGrossUSD - pTotalDed);
  const pNetBs  = Math.max(0, pGrossBs - (row.voucherDedBs || 0));

  const voucherRows = periodVouchers.length > 0
    ? periodVouchers.map((v: any) =>
        `<tr><td style="padding-left:24px;color:#888">↳ ${v.reason||'Vale'} <span style="font-size:9px;color:#bbb">(${v.voucherDate||v.createdAt?.toDate?.().toLocaleDateString('es-VE')||''})</span></td>
         <td class="tr negative">-${v.currency==='USD'?'$':'Bs '}${fmtHR(Number(v.amount))}</td></tr>`
      ).join('')
    : '';

  const empLoans = (activeLoans || []).filter((l: any) => l.employeeId === emp.id && l.status === 'ACTIVO');
  const loanRows = empLoans.length > 0
    ? empLoans.map((l: any) =>
        `<tr><td style="padding-left:24px;color:#888">↳ ${l.reason||'Préstamo'} <span style="font-size:9px;color:#bbb">(cuota ${l.paidInstallments+1}/${l.totalInstallments})</span></td>
         <td class="tr negative">-${l.currency==='USD'?'$':'Bs '}${fmtHR(Number(l.installmentAmount))}</td></tr>`
      ).join('')
    : '';

  const emissionDate = new Date().toLocaleDateString('es-VE', { year:'numeric', month:'long', day:'numeric' });

  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Recibo de Nómina – ${emp.fullName}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:32px;max-width:680px;margin:0 auto}
  .header{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:2.5px solid #111}
  .biz{font-size:20px;font-weight:900}
  .sub{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.1em;margin-top:2px}
  .period-box{text-align:right}
  .period-badge{display:inline-block;background:#111;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:900;letter-spacing:.05em}
  .period-range{font-size:10px;color:#888;margin-top:5px}
  .emp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;background:#f7f7f7;padding:14px;border-radius:4px;margin-bottom:20px}
  .ef-label{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:2px}
  .ef-val{font-size:12px;font-weight:700}
  .section-title{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:8px;margin-top:16px}
  table{width:100%;border-collapse:collapse}
  td{padding:7px 10px;border-bottom:1px solid #ebebeb;font-size:11px}
  .tl{text-align:left}.tr{text-align:right}
  .positive{color:#16a34a;font-weight:700}.negative{color:#dc2626;font-weight:700}
  .subtotal td{background:#f7f7f7;font-weight:700}
  .net-row td{background:#111;color:#fff;font-weight:900;font-size:15px;padding:11px 10px}
  .sigs{display:flex;gap:60px;margin-top:40px}
  .sig{text-align:center}
  .sig-line{border-top:1px solid #111;padding-top:6px;font-size:10px;color:#666;width:200px}
  .sig-sub{font-size:9px;color:#aaa;margin-top:3px}
  .footer{margin-top:28px;text-align:center;font-size:9px;color:#ccc;letter-spacing:.08em;text-transform:uppercase}
  @media print{body{padding:18px}}
</style></head><body>

<div class="header">
  <div>
    <div class="biz">${businessName}</div>
    <div class="sub">Recibo de Nómina</div>
  </div>
  <div class="period-box">
    <div class="period-badge">${label}</div>
    <div class="period-range">Del ${from}<br>al ${to}</div>
    <div style="font-size:9px;color:#bbb;margin-top:4px">Emitido: ${emissionDate}</div>
  </div>
</div>

<div class="emp-grid">
  <div><div class="ef-label">Empleado</div><div class="ef-val">${emp.fullName}</div></div>
  <div><div class="ef-label">Cédula</div><div class="ef-val">${emp.cedula||'S/N'}</div></div>
  <div><div class="ef-label">Teléfono</div><div class="ef-val">${emp.phone||'—'}</div></div>
  <div><div class="ef-label">Departamento</div><div class="ef-val">${emp.department||'—'}</div></div>
  <div><div class="ef-label">Cargo</div><div class="ef-val">${emp.role||'—'}</div></div>
  <div><div class="ef-label">Frecuencia de Pago</div><div class="ef-val">${label}</div></div>
  <div><div class="ef-label">Fecha de Ingreso</div><div class="ef-val">${emp.startDate||'—'}</div></div>
  <div><div class="ef-label">Moneda de Pago</div><div class="ef-val">${emp.paymentCurrency||'USD'}</div></div>
  <div><div class="ef-label">Estatus</div><div class="ef-val">${emp.status||'Activo'}</div></div>
</div>

<div class="section-title">Ingresos del Período (${label})</div>
<table>
  ${pSalUSD>0?`<tr><td class="tl">Salario Base USD</td><td class="tr positive">$${fmtHR(pSalUSD)}</td></tr>`:''}
  ${pBonusUSD>0?`<tr><td class="tl">Bono en ${emp.bonusUSDCurrency==='BS'?'Bs (BCV)':'USD'}</td><td class="tr positive">+$${fmtHR(pBonusUSD)}</td></tr>`:''}
  ${pSalBs>0?`<tr><td class="tl">Salario Base Bs (BCV)</td><td class="tr positive">Bs ${fmtHR(pSalBs)}</td></tr>`:''}
  ${pBonusBs>0?`<tr><td class="tl">Bono Bs (BCV)</td><td class="tr positive">+Bs ${fmtHR(pBonusBs)}</td></tr>`:''}
  ${pGrossUSD>0?`<tr class="subtotal"><td class="tl">Total Bruto Período (USD)</td><td class="tr">$${fmtHR(pGrossUSD)}</td></tr>`:''}
  ${pGrossBs>0?`<tr class="subtotal"><td class="tl">Total Bruto Período (Bs)</td><td class="tr">Bs ${fmtHR(pGrossBs)}</td></tr>`:''}
</table>

<div class="section-title">Deducciones</div>
<table>
  ${pVales>0?`<tr><td class="tl">Vales / Adelantos (${periodVouchers.length})</td><td class="tr negative">-$${fmtHR(pVales)}</td></tr>${voucherRows}`:''}
  ${pIVSS>0?`<tr><td class="tl">IVSS (${emp.ivssRate||4}%)</td><td class="tr negative">-$${fmtHR(pIVSS)}</td></tr>`:''}
  ${pParo>0?`<tr><td class="tl">Paro Forzoso (${emp.paroRate||2}%)</td><td class="tr negative">-$${fmtHR(pParo)}</td></tr>`:''}
  ${pLoans>0?`<tr><td class="tl">Préstamos a Cuotas (${empLoans.length})</td><td class="tr negative">-$${fmtHR(pLoans)}</td></tr>${loanRows}`:''}
  ${pTotalDed===0?`<tr><td colspan="2" style="color:#999;font-size:11px;text-align:center;padding:8px">Sin deducciones este período</td></tr>`:''}
  ${pTotalDed>0?`<tr class="subtotal"><td class="tl">Total Deducciones</td><td class="tr negative">-$${fmtHR(pTotalDed)}</td></tr>`:''}
</table>

<table style="margin-top:8px">
  <tr class="net-row">
    <td class="tl">NETO A RECIBIR</td>
    <td class="tr">$${fmtHR(pNetUSD)}${pNetBs>0?' &nbsp;/&nbsp; Bs '+fmtHR(pNetBs):''}</td>
  </tr>
</table>

<div class="sigs">
  <div class="sig">
    <div class="sig-line">Firma del Empleado</div>
    <div class="sig-sub">${emp.fullName} · ${emp.cedula||'S/N'}</div>
  </div>
  <div class="sig">
    <div class="sig-line">Autorizado por</div>
    <div class="sig-sub">Administración / RRHH</div>
  </div>
</div>

<div style="margin-top:16px;padding:8px;border:1px dashed #666;font-size:8px;text-align:center;color:#555;line-height:1.4">
  DOCUMENTO INTERNO ADMINISTRATIVO &middot; NO ES RECIBO FISCAL &middot; SIN VALOR TRIBUTARIO<br/>
  Sistema administrativo no homologado ante el SENIAT.
</div>
<div class="footer" style="margin-top:10px">con tecnología Dualis</div>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

/** Imprimir resumen de corte de nómina completo (todos los empleados) */
export function printPayrollRunPDF(
  run: any,
  businessName = 'Mi Negocio',
  contactInfo?: { phone?: string; email?: string; rif?: string; address?: string },
) {
  const w = window.open('', '_blank', 'width=794,height=1123');
  if (!w) return;

  const processedDate = run.processedAt?.toDate
    ? run.processedAt.toDate().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });

  const details: any[] = run.details || [];
  const freqLabel: Record<string,string> = { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual', mixta: 'Mixta' };
  const rateBCV = run.rateBCV || 0;
  const hasPayData = details.some((d: any) => d.payAmountReal != null);

  // Compute totals by currency
  const totalPayUSD = run.totalPayUSD ?? details.filter((d: any) => (d.paymentCurrency || 'USD') === 'USD').reduce((s: number, d: any) => s + (d.netUSD || 0), 0);
  const totalPayBs = run.totalPayBs ?? details.filter((d: any) => d.paymentCurrency === 'BS').reduce((s: number, d: any) => s + ((d.payAmountReal || d.netUSD * rateBCV) || 0), 0);
  const countUSD = details.filter((d: any) => (d.paymentCurrency || 'USD') === 'USD').length;
  const countBs = details.filter((d: any) => d.paymentCurrency === 'BS').length;

  // Build detail rows
  const detailRows = details.map((d: any, i: number) => {
    const vouchersSum = d.voucherDedUSD || 0;
    const ivss = d.ivssUSD || 0;
    const paro = d.paroUSD || 0;
    const overtime = d.overtimeUSD || 0;
    const absences = d.absenceDeductionUSD || 0;
    const isBs = d.paymentCurrency === 'BS';
    const payReal = d.payAmountReal != null ? d.payAmountReal : (isBs && rateBCV > 0 ? d.netUSD * rateBCV : d.netUSD);
    const payStr = isBs ? `Bs ${fmtHR(payReal)}` : `$${fmtHR(payReal)}`;

    const voucherSubs = (d.settledVouchers || []).map((sv: any) =>
      `<tr class="sub-row"><td colspan="3" style="padding-left:24px">↳ ${sv.reason || 'Vale'}: -${sv.currency === 'USD' ? '$' : 'Bs '}${fmtHR(Number(sv.amount))}</td>
       <td colspan="6"></td></tr>`
    ).join('');

    return `<tr class="${i % 2 === 0 ? 'even' : ''}">
      <td class="emp-name">${d.name}${d.cedula ? `<br><span class="cedula">${d.cedula}</span>` : ''}</td>
      <td class="dept">${d.department || '—'}</td>
      <td class="tr">$${fmtHR(d.grossUSD)}</td>
      <td class="tr neg">${vouchersSum > 0 ? '-$' + fmtHR(vouchersSum) : '—'}</td>
      <td class="tr neg">${(ivss + paro) > 0 ? '-$' + fmtHR(ivss + paro) : '—'}</td>
      <td class="tr ${overtime > 0 ? 'pos' : 'neg'}">${overtime > 0 ? '+$' + fmtHR(overtime) : absences > 0 ? '-$' + fmtHR(absences) : '—'}</td>
      <td class="tr net">$${fmtHR(d.netUSD)}</td>
      <td class="tr pay ${isBs ? 'pay-bs' : 'pay-usd'}">${payStr}</td>
    </tr>${voucherSubs}`;
  }).join('');

  const contactLine = [
    contactInfo?.rif && `RIF: ${contactInfo.rif}`,
    contactInfo?.phone && `Tel: ${contactInfo.phone}`,
    contactInfo?.email && contactInfo.email,
    contactInfo?.address && contactInfo.address,
  ].filter(Boolean).join(' · ');

  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Corte de Nómina – ${run.period}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:28px 32px;max-width:780px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:2.5px solid #1a1a1a}
  .biz{font-size:20px;font-weight:900;letter-spacing:-0.5px}
  .contact{font-size:8px;color:#888;margin-top:3px;letter-spacing:.02em}
  .doc-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#666;margin-top:2px}
  .period-box{text-align:right}
  .period-badge{display:inline-block;background:#1a1a1a;color:#fff;padding:4px 14px;border-radius:20px;font-size:10px;font-weight:900;letter-spacing:.05em}
  .period-sub{font-size:9px;color:#888;margin-top:4px}

  .kpi-strip{display:grid;grid-template-columns:repeat(5,1fr);gap:0;border:1.5px solid #1a1a1a;border-radius:6px;overflow:hidden;margin-bottom:6px}
  .kpi{padding:10px 8px;text-align:center;border-right:1px solid #ddd}
  .kpi:last-child{border-right:none}
  .kpi-label{font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:3px}
  .kpi-val{font-size:15px;font-weight:900}
  .kpi-val.pos{color:#16a34a}.kpi-val.neg{color:#dc2626}

  .desembolso{display:flex;gap:16px;align-items:center;padding:8px 14px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:6px;margin-bottom:18px;flex-wrap:wrap}
  .desembolso .label{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#15803d}
  .desembolso .val{font-size:13px;font-weight:900;color:#166534}
  .desembolso .val-bs{font-size:13px;font-weight:900;color:#0369a1}
  .desembolso .rate{font-size:9px;color:#888;margin-left:auto}

  table{width:100%;border-collapse:collapse;margin-bottom:14px}
  th{font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#555;padding:6px 5px;border-bottom:2px solid #1a1a1a;text-align:left}
  td{padding:5px 5px;border-bottom:1px solid #eee;font-size:9.5px}
  .tr{text-align:right}.tc{text-align:center}
  .emp-name{font-weight:700;font-size:10px}
  .cedula{font-size:8px;color:#999;font-weight:400}
  .dept{font-size:8px;color:#888}
  .pos{color:#16a34a;font-weight:600}.neg{color:#dc2626;font-weight:600}
  .net{font-weight:800;color:#111;font-size:10px}
  .pay{font-weight:900;font-size:10.5px}
  .pay-usd{color:#166534;background:#f0fdf4}
  .pay-bs{color:#0369a1;background:#f0f9ff}
  .bs{font-size:8px;color:#0284c7;font-weight:600}
  .even{background:#fafafa}
  .sub-row td{font-size:8px;color:#999;padding:2px 5px;border-bottom:none}
  .total-row td{background:#f0f0f0;font-weight:900;border-top:2px solid #1a1a1a;font-size:10px}

  .footer-section{margin-top:24px;padding-top:12px;border-top:1.5px solid #ddd}
  .sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:30px;margin-top:36px}
  .sig-line{border-top:1px solid #111;padding-top:5px;font-size:9px;color:#666;text-align:center}
  .sig-sub{text-align:center;font-size:8px;color:#aaa;margin-top:2px}
  .powered{margin-top:20px;text-align:center;font-size:7px;color:#ccc;letter-spacing:.1em;text-transform:uppercase}
  @media print{body{padding:16px 18px}}
</style></head><body>

<div class="header">
  <div>
    <div class="biz">${businessName}</div>
    <div class="doc-type">Resumen de Corte de Nómina</div>
    ${contactLine ? `<div class="contact">${contactLine}</div>` : ''}
  </div>
  <div class="period-box">
    <div class="period-badge">${run.period}</div>
    <div class="period-sub">${freqLabel[run.frequency] || run.frequency} · ${run.employeeCount} empleados</div>
    <div class="period-sub">Procesado: ${processedDate}${run.processedByName ? ` por ${run.processedByName}` : ''}</div>
  </div>
</div>

<div class="kpi-strip">
  <div class="kpi">
    <div class="kpi-label">Empleados</div>
    <div class="kpi-val">${run.employeeCount}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Bruto Total</div>
    <div class="kpi-val">$${fmtHR(run.totalGrossUSD)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Deducciones</div>
    <div class="kpi-val neg">-$${fmtHR(run.totalDedUSD)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Neto Total</div>
    <div class="kpi-val pos">$${fmtHR(run.totalNetUSD)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Tasa BCV</div>
    <div class="kpi-val">${rateBCV > 0 ? 'Bs ' + fmtHR(rateBCV) : '—'}</div>
  </div>
</div>

<div class="desembolso">
  <span class="label">Desembolso real →</span>
  ${totalPayUSD > 0 ? `<span class="val">$${fmtHR(totalPayUSD)} USD</span><span style="font-size:8px;color:#888">(${countUSD} emp.)</span>` : ''}
  ${totalPayBs > 0 ? `<span class="val-bs">Bs ${fmtHR(totalPayBs)}</span><span style="font-size:8px;color:#888">(${countBs} emp.)</span>` : ''}
  ${rateBCV > 0 ? `<span class="rate">Tasa: Bs ${fmtHR(rateBCV)} / USD</span>` : ''}
</div>

<table>
  <thead><tr>
    <th>Empleado</th><th>Depto.</th><th class="tr">Bruto</th>
    <th class="tr">Vales</th><th class="tr">IVSS/Paro</th>
    <th class="tr">+H.Ex / -Aus.</th><th class="tr">Neto USD</th><th class="tr">A Pagar</th>
  </tr></thead>
  <tbody>
    ${detailRows}
    <tr class="total-row">
      <td colspan="2">TOTALES (${run.employeeCount})</td>
      <td class="tr">$${fmtHR(run.totalGrossUSD)}</td>
      <td class="tr neg">${details.reduce((s: number, d: any) => s + (d.voucherDedUSD || 0), 0) > 0 ? '-$' + fmtHR(details.reduce((s: number, d: any) => s + (d.voucherDedUSD || 0), 0)) : '—'}</td>
      <td class="tr neg">${details.reduce((s: number, d: any) => s + (d.ivssUSD || 0) + (d.paroUSD || 0), 0) > 0 ? '-$' + fmtHR(details.reduce((s: number, d: any) => s + (d.ivssUSD || 0) + (d.paroUSD || 0), 0)) : '—'}</td>
      <td class="tr">${details.reduce((s: number, d: any) => s + (d.overtimeUSD || 0) - (d.absenceDeductionUSD || 0), 0) !== 0 ? (details.reduce((s: number, d: any) => s + (d.overtimeUSD || 0) - (d.absenceDeductionUSD || 0), 0) > 0 ? '+' : '-') + '$' + fmtHR(Math.abs(details.reduce((s: number, d: any) => s + (d.overtimeUSD || 0) - (d.absenceDeductionUSD || 0), 0))) : '—'}</td>
      <td class="tr net">$${fmtHR(run.totalNetUSD)}</td>
      <td class="tr pay">${totalPayUSD > 0 ? '$' + fmtHR(totalPayUSD) : ''}${totalPayUSD > 0 && totalPayBs > 0 ? '<br>' : ''}${totalPayBs > 0 ? '<span class="pay-bs">Bs ' + fmtHR(totalPayBs) + '</span>' : ''}</td>
    </tr>
  </tbody>
</table>

<div class="footer-section">
  <p style="font-size:8px;color:#999;margin-bottom:3px">Observaciones:</p>
  <div style="border:1px solid #ddd;border-radius:4px;min-height:40px;padding:6px;font-size:9px;color:#bbb">
    Corte procesado automáticamente. Los vales incluidos fueron marcados como DESCONTADO.${rateBCV > 0 ? ` Tasa BCV aplicada: Bs ${fmtHR(rateBCV)} por dólar.` : ''}
  </div>
</div>

<div class="sigs">
  <div><div class="sig-line">Elaborado por</div><div class="sig-sub">${run.processedByName || 'RRHH / Administración'}</div></div>
  <div><div class="sig-line">Revisado por</div><div class="sig-sub">Gerencia</div></div>
  <div><div class="sig-line">Aprobado por</div><div class="sig-sub">Dirección</div></div>
</div>

<div style="margin-top:16px;padding:8px;border:1px dashed #666;font-size:8px;text-align:center;color:#555;line-height:1.4">
  DOCUMENTO INTERNO ADMINISTRATIVO &middot; NO ES CORTE FISCAL &middot; SIN VALOR TRIBUTARIO<br/>
  Sistema administrativo no homologado ante el SENIAT.
</div>
<div class="powered">Generado con tecnología Dualis · ${new Date().toLocaleDateString('es-VE')} ${new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</div>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

/** Imprimir detalle de corte de vales como PDF */
export function printCortePDF(corte: any, businessName = 'Mi Negocio') {
  const w = window.open('', '_blank', 'width=794,height=1123');
  if (!w) return;

  const freqLabel: Record<string,string> = { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' };
  const dateStr = corte.executedAt?.toDate
    ? corte.executedAt.toDate().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });

  // Group vouchers by employee
  const grouped = new Map<string, { name: string; vouchers: any[]; totalUSD: number; totalBs: number }>();
  (corte.vouchers || []).forEach((v: any) => {
    const prev = grouped.get(v.employeeId) || { name: v.employeeName, vouchers: [], totalUSD: 0, totalBs: 0 };
    prev.vouchers.push(v);
    prev.totalUSD += v.amountUSD || (v.currency === 'USD' ? v.amount : 0);
    if (v.currency === 'BS') prev.totalBs += v.amount;
    grouped.set(v.employeeId, prev);
  });

  const employeeRows = Array.from(grouped.entries()).map(([, g]) => {
    const voucherLines = g.vouchers.map((v: any) =>
      `<tr class="sub-row">
        <td style="padding-left:24px">↳ ${v.reason || 'Vale'}</td>
        <td class="tc">${v.voucherDate || '—'}</td>
        <td class="tc">${v.currency}</td>
        <td class="tr">${v.currency === 'USD' ? '$' : 'Bs '}${fmtHR(Number(v.amount))}</td>
        <td class="tr">${v.amountUSD != null ? '$' + fmtHR(Number(v.amountUSD)) : v.currency === 'USD' ? '$' + fmtHR(Number(v.amount)) : '—'}</td>
      </tr>`
    ).join('');
    return `<tr class="emp-header">
      <td colspan="3"><strong>${g.name}</strong> <span style="color:#888;font-size:9px">(${g.vouchers.length} vale${g.vouchers.length > 1 ? 's' : ''})</span></td>
      <td class="tr" style="color:#dc2626;font-weight:700">${g.totalBs > 0 ? 'Bs ' + fmtHR(g.totalBs) : ''}</td>
      <td class="tr" style="color:#dc2626;font-weight:900">$${fmtHR(g.totalUSD)}</td>
    </tr>${voucherLines}`;
  }).join('');

  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Corte de Vales – ${dateStr}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:28px 32px;max-width:760px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:2.5px solid #1a1a1a}
  .biz{font-size:20px;font-weight:900;letter-spacing:-0.5px}
  .doc-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#666;margin-top:2px}
  .period-box{text-align:right}
  .period-badge{display:inline-block;background:#1a1a1a;color:#fff;padding:4px 14px;border-radius:20px;font-size:10px;font-weight:900}
  .period-sub{font-size:9px;color:#888;margin-top:4px}
  .kpi-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1.5px solid #1a1a1a;border-radius:6px;overflow:hidden;margin-bottom:18px}
  .kpi{padding:10px 12px;text-align:center;border-right:1px solid #ddd}
  .kpi:last-child{border-right:none}
  .kpi-label{font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#888;margin-bottom:3px}
  .kpi-val{font-size:16px;font-weight:900}
  table{width:100%;border-collapse:collapse;margin-bottom:14px}
  th{font-size:7.5px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#555;padding:6px 6px;border-bottom:2px solid #1a1a1a;text-align:left}
  td{padding:5px 6px;border-bottom:1px solid #eee;font-size:10px}
  .tr{text-align:right}.tc{text-align:center}
  .emp-header td{background:#f7f7f7;border-top:1.5px solid #ddd}
  .sub-row td{font-size:9px;color:#555;padding:3px 6px;border-bottom:1px solid #f5f5f5}
  .total-row td{background:#f0f0f0;font-weight:900;border-top:2px solid #1a1a1a;font-size:11px}
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:40px}
  .sig-line{border-top:1px solid #111;padding-top:5px;font-size:9px;color:#666;text-align:center}
  .sig-sub{text-align:center;font-size:8px;color:#aaa;margin-top:2px}
  @media print{body{padding:16px 20px}}
</style></head><body>

<div class="header">
  <div>
    <div class="biz">${businessName}</div>
    <div class="doc-type">Detalle de Corte de Vales — Control Interno RRHH</div>
  </div>
  <div class="period-box">
    <div class="period-badge">${freqLabel[corte.frequency] || 'Corte'}</div>
    <div class="period-sub">Procesado: ${dateStr}</div>
    <div class="period-sub">Ejecutado por: ${corte.executedByName || '—'}</div>
  </div>
</div>

<div class="kpi-strip">
  <div class="kpi">
    <div class="kpi-label">Empleados</div>
    <div class="kpi-val">${corte.employeeCount || grouped.size}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Vales Descontados</div>
    <div class="kpi-val">${corte.voucherCount || 0}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Total USD</div>
    <div class="kpi-val" style="color:#dc2626">$${fmtHR(corte.totalUSD || 0)}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Neto Pagado</div>
    <div class="kpi-val" style="color:#16a34a">${corte.totalNetUSD ? '$' + fmtHR(corte.totalNetUSD) : '—'}</div>
  </div>
</div>

${corte.deferredCount > 0 ? `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:4px;padding:8px 12px;margin-bottom:14px;font-size:10px;color:#92400e;font-weight:700">⏳ ${corte.deferredCount} vale${corte.deferredCount > 1 ? 's' : ''} diferido${corte.deferredCount > 1 ? 's' : ''} al próximo período</div>` : ''}

<table>
  <thead><tr>
    <th>Empleado / Concepto</th><th class="tc">Fecha</th><th class="tc">Moneda</th>
    <th class="tr">Monto</th><th class="tr">Equiv. USD</th>
  </tr></thead>
  <tbody>
    ${employeeRows}
    <tr class="total-row">
      <td colspan="3">TOTALES (${corte.voucherCount || 0} vales)</td>
      <td class="tr">${corte.totalBs > 0 ? 'Bs ' + fmtHR(corte.totalBs) : '—'}</td>
      <td class="tr">$${fmtHR(corte.totalUSD || 0)}</td>
    </tr>
  </tbody>
</table>

<div class="sigs">
  <div><div class="sig-line">Elaborado por</div><div class="sig-sub">${corte.executedByName || 'RRHH'}</div></div>
  <div><div class="sig-line">Aprobado por</div><div class="sig-sub">Administración / Dirección</div></div>
</div>

<div style="margin-top:16px;padding:8px;border:1px dashed #666;font-size:8px;text-align:center;color:#555;line-height:1.4">
  DOCUMENTO INTERNO ADMINISTRATIVO &middot; NO ES RECIBO FISCAL &middot; SIN VALOR TRIBUTARIO<br/>
  Sistema administrativo no homologado ante el SENIAT.
</div>
<div style="margin-top:10px;text-align:center;font-size:7px;color:#ccc;letter-spacing:.1em;text-transform:uppercase">Generado con tecnología Dualis · ${new Date().toLocaleDateString('es-VE')} ${new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</div>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

/** Exportar nómina a CSV (Excel compatible con UTF-8 BOM) */
export function exportNominaCSV(rows: any[], period: string) {
  const header = [
    'Empleado','Departamento','Frecuencia','Moneda Pago',
    'Salario USD','Bono USD','Bruto USD',
    'Salario Bs','Bono Bs','Bruto Bs',
    'Vales USD','IVSS USD','Paro USD','Préstamos USD','Total Deduc. USD',
    'NETO USD','NETO Bs',
  ];
  const data = rows.map((n: any) => [
    n.emp.fullName, n.emp.department,
    n.emp.payFrequency === 'quincenal' ? 'Quincenal' : n.emp.payFrequency === 'semanal' ? 'Semanal' : 'Mensual',
    n.emp.paymentCurrency,
    fmtHR(n.emp.salaryUSD||0), fmtHR(n.emp.bonusUSD||0), fmtHR(n.grossUSD),
    fmtHR(n.emp.salaryBs||0), fmtHR(n.emp.bonusBs||0), fmtHR(n.grossBs),
    fmtHR(n.voucherDedUSD), fmtHR(n.ivssUSD), fmtHR(n.paroUSD), fmtHR(n.loanDedUSD), fmtHR(n.totalDedUSD),
    fmtHR(n.netUSD), fmtHR(n.netBs),
  ]);
  const csv = [header, ...data].map(row => row.map((v: any) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `nomina_${period}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
