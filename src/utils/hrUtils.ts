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
  .bp{background:#fee2e2;color:#dc2626}.bd{background:#d1fae5;color:#059669}
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:50px}
  .sig-line{border-top:1px solid #111;padding-top:6px;font-size:10px;color:#666;text-align:center}
  .sig-sub{text-align:center;font-size:9px;color:#aaa;margin-top:3px}
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
      <td>${v.createdAt?.toDate?v.createdAt.toDate().toLocaleDateString('es-VE'):'—'}</td>
      <td>${v.reason||'—'}</td>
      <td class="tc">${v.currency}</td>
      <td class="tr">${v.currency==='USD'?'$':'Bs '}${fmtHR(Number(v.amount))}</td>
      <td class="tr">${v.rateUsed?'Bs '+fmtHR(Number(v.rateUsed)):'—'}</td>
      <td class="tr">${v.amountUSD!=null?'$'+fmtHR(Number(v.amountUSD)):v.currency==='USD'?'$'+fmtHR(Number(v.amount)):'—'}</td>
      <td class="tc"><span class="badge ${v.status==='PENDIENTE'?'bp':'bd'}">${v.status}</span></td>
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
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

/** Imprimir recibo de nómina (payslip) individual */
export function printPayslip(emp: any, row: any, period: string, frequency: string, businessName = 'Mi Negocio') {
  const w = window.open('', '_blank', 'width=794,height=600');
  if (!w) return;
  const freqLabel = frequency === 'quincenal' ? 'Quincenal' : frequency === 'semanal' ? 'Semanal' : 'Mensual';
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Recibo de Nómina – ${emp.fullName}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:32px;max-width:680px;margin:0 auto}
  .header{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:2.5px solid #111}
  .biz{font-size:20px;font-weight:900}.sub{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.1em;margin-top:2px}
  .period-badge{background:#111;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:900;letter-spacing:.05em}
  .emp-row{display:flex;gap:32px;background:#f7f7f7;padding:14px;border-radius:4px;margin-bottom:20px}
  .ef-label{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:2px}
  .ef-val{font-size:13px;font-weight:700}
  .section-title{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:8px;margin-top:16px}
  table{width:100%;border-collapse:collapse}
  td{padding:7px 10px;border-bottom:1px solid #ebebeb;font-size:11px}
  .tl{text-align:left}.tr{text-align:right}
  .positive{color:#16a34a;font-weight:700}.negative{color:#dc2626;font-weight:700}
  .net-row td{background:#111;color:#fff;font-weight:900;font-size:14px;padding:10px}
  .sig{border-top:1px solid #111;padding-top:6px;font-size:10px;color:#666;text-align:center;width:200px;margin-top:36px}
  @media print{body{padding:18px}}
</style></head><body>
<div class="header">
  <div><div class="biz">${businessName}</div><div class="sub">Recibo de Nómina</div></div>
  <div style="text-align:right">
    <div class="period-badge">${period}</div>
    <div style="font-size:10px;color:#999;margin-top:6px">${freqLabel} · ${new Date().toLocaleDateString('es-VE')}</div>
  </div>
</div>
<div class="emp-row">
  <div><div class="ef-label">Empleado</div><div class="ef-val">${emp.fullName}</div></div>
  <div><div class="ef-label">Departamento</div><div class="ef-val">${emp.department||'—'}</div></div>
  <div><div class="ef-label">Cargo</div><div class="ef-val">${emp.role||'—'}</div></div>
  <div><div class="ef-label">Cédula</div><div class="ef-val">${emp.cedula||'S/N'}</div></div>
</div>
<div class="section-title">Ingresos</div>
<table>
  ${row.grossUSD>0?`<tr><td class="tl">Salario Base USD</td><td class="tr positive">$${fmtHR(row.emp?.salaryUSD||0)}</td></tr>`:''}
  ${(row.emp?.bonusUSD||0)>0?`<tr><td class="tl">Bono en USD</td><td class="tr positive">+$${fmtHR(row.emp.bonusUSD)}</td></tr>`:''}
  ${row.grossBs>0?`<tr><td class="tl">Salario Base Bs (BCV)</td><td class="tr positive">Bs ${fmtHR(row.emp?.salaryBs||0)}</td></tr>`:''}
  ${(row.emp?.bonusBs||0)>0?`<tr><td class="tl">Bono en Bs (BCV)</td><td class="tr positive">+Bs ${fmtHR(row.emp.bonusBs)}</td></tr>`:''}
  ${row.grossUSD>0?`<tr style="background:#f7f7f7"><td class="tl" style="font-weight:700">Total Bruto USD</td><td class="tr" style="font-weight:700">$${fmtHR(row.grossUSD)}</td></tr>`:''}
</table>
<div class="section-title">Deducciones</div>
<table>
  ${row.voucherDedUSD>0?`<tr><td class="tl">Vales / Adelantos</td><td class="tr negative">-$${fmtHR(row.voucherDedUSD)}</td></tr>`:''}
  ${row.ivssUSD>0?`<tr><td class="tl">IVSS (${row.emp?.ivssRate||4}%)</td><td class="tr negative">-$${fmtHR(row.ivssUSD)}</td></tr>`:''}
  ${row.paroUSD>0?`<tr><td class="tl">Paro Forzoso (${row.emp?.paroRate||2}%)</td><td class="tr negative">-$${fmtHR(row.paroUSD)}</td></tr>`:''}
  ${row.loanDedUSD>0?`<tr><td class="tl">Préstamos a Cuotas</td><td class="tr negative">-$${fmtHR(row.loanDedUSD)}</td></tr>`:''}
  ${row.totalDedUSD>0?`<tr style="background:#f7f7f7"><td class="tl" style="font-weight:700">Total Deducciones</td><td class="tr negative" style="font-weight:700">-$${fmtHR(row.totalDedUSD)}</td></tr>`:'<tr><td colspan="2" style="color:#999;font-size:11px;text-align:center;padding:8px">Sin deducciones este período</td></tr>'}
</table>
<table style="margin-top:8px">
  <tr class="net-row">
    <td class="tl">NETO A RECIBIR</td>
    <td class="tr">$${fmtHR(row.netUSD)}${row.netBs>0?' / Bs '+fmtHR(row.netBs):''}</td>
  </tr>
</table>
<div style="display:flex;gap:60px;margin-top:40px">
  <div class="sig">Firma del Empleado<br><span style="font-size:9px;color:#aaa">${emp.fullName}</span></div>
  <div class="sig">Administración / RRHH<br><span style="font-size:9px;color:#aaa">Dualis ERP</span></div>
</div>
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
