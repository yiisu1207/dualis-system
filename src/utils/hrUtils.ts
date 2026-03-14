// ── HR Utility Functions ─────────────────────────────────────────────────────

export function fmtHR(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
export function printVoucherSheet(emp: any, vouchers: any[], businessName = 'Mi Negocio') {
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
  .footer{margin-top:32px;text-align:center;font-size:9px;color:#ccc;letter-spacing:.08em;text-transform:uppercase}
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
      <td colspan="3">TOTALES PENDIENTES (${pending.length} vales)</td>
      <td class="tr">${totalUSD>0?'$'+fmtHR(totalUSD):''}${totalUSD>0&&totalBs>0?' / ':''}${totalBs>0?'Bs '+fmtHR(totalBs):''}</td>
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
<div class="footer">con tecnología Dualis</div>
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

  // Per-period deductions (IVSS/Paro are monthly, divide by period)
  const pIVSS   = (row.ivssUSD    || 0) / freqDiv;
  const pParo   = (row.paroUSD    || 0) / freqDiv;
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

<div class="footer">con tecnología Dualis</div>
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
