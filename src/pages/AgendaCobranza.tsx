import React, { useState, useMemo, useCallback } from 'react';
import {
  Calendar, Phone, Mail, MessageCircle,
  ChevronLeft, ChevronRight, CheckCircle2,
} from 'lucide-react';
import type { Movement, Customer } from '../../types';
import {
  calculateReminders, worstPerCustomer, getSeverityConfig,
  type ReminderItem, type ReminderSeverity,
} from '../utils/reminderEngine';
import { shareViaWhatsApp, messageTemplates } from '../utils/shareLink';
import { sendOverdueReminderEmail } from '../utils/emailService';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

interface AgendaCobranzaProps {
  movements: Movement[];
  customers: Customer[];
  businessId: string;
  businessName: string;
}

const SEVERITY_ORDER: ReminderSeverity[] = ['overdue30', 'overdue15', 'overdue5', 'dueToday', 'warn5'];

const SEVERITY_STYLES: Record<ReminderSeverity, { bg: string; text: string; border: string; dot: string }> = {
  overdue30: { bg: 'bg-rose-500/10',   text: 'text-rose-400',   border: 'border-rose-500/30', dot: 'bg-rose-500' },
  overdue15: { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/30',  dot: 'bg-red-500' },
  overdue5:  { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-500' },
  dueToday:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/30', dot: 'bg-amber-500' },
  warn5:     { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', dot: 'bg-yellow-500' },
};

function formatCurrency(n: number): string {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function AgendaCobranza({ movements, customers, businessId, businessName }: AgendaCobranzaProps) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  const allReminders = useMemo(
    () => calculateReminders(movements, customers),
    [movements, customers]
  );

  const perCustomer = useMemo(() => worstPerCustomer(allReminders), [allReminders]);

  // Calendar data: map dueDate → movements
  const calendarData = useMemo(() => {
    const map: Record<string, { invoices: Movement[]; severity: 'green' | 'amber' | 'red' }> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    movements
      .filter(m =>
        !m.isSupplierMovement &&
        m.movementType === 'FACTURA' &&
        !(m as any).pagado &&
        !(m as any).anulada &&
        m.dueDate &&
        m.entityId !== 'CONSUMIDOR_FINAL'
      )
      .forEach(m => {
        const dateKey = m.dueDate!.split('T')[0];
        if (!map[dateKey]) map[dateKey] = { invoices: [], severity: 'green' };
        map[dateKey].invoices.push(m);

        const due = new Date(dateKey);
        due.setHours(0, 0, 0, 0);
        const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
        if (diff < 0) map[dateKey].severity = 'red';
        else if (diff <= 5 && map[dateKey].severity !== 'red') map[dateKey].severity = 'amber';
      });
    return map;
  }, [movements]);

  const handleSendWhatsApp = useCallback((item: ReminderItem) => {
    if (!item.customerPhone) return;
    const cfg = getSeverityConfig(item.severity);
    const amount = formatCurrency(item.totalDebtUSD);
    const days = Math.abs(item.daysUntilDue);

    let msg: string;
    if (item.severity === 'warn5') {
      const due = item.overdueInvoices[0]?.dueDate
        ? new Date(item.overdueInvoices[0].dueDate).toLocaleDateString('es-VE')
        : 'próximamente';
      msg = messageTemplates.reminderSoft(businessName, item.customerName, amount, due);
    } else if (item.severity === 'dueToday') {
      msg = messageTemplates.reminderUrgent(businessName, item.customerName, amount);
    } else if (item.severity === 'overdue30') {
      msg = messageTemplates.reminderFinal(businessName, item.customerName, amount, days);
    } else {
      msg = messageTemplates.reminderOverdue(businessName, item.customerName, amount, days);
    }

    shareViaWhatsApp(item.customerPhone, msg);
    logCommunication(item, 'whatsapp');
    setSentMap(prev => ({ ...prev, [`${item.customerId}::wa`]: true }));
  }, [businessName]);

  const handleSendEmail = useCallback(async (item: ReminderItem) => {
    if (!item.customerEmail) return;
    const cfg = getSeverityConfig(item.severity);
    try {
      await sendOverdueReminderEmail(item.customerEmail, {
        customerName: item.customerName,
        amount: formatCurrency(item.totalDebtUSD),
        businessName,
        daysOverdue: Math.abs(item.daysUntilDue),
        severity: cfg.emailSeverity,
      });
    } catch (err) {
      console.warn('[AgendaCobranza] Email send failed:', err);
    }
    logCommunication(item, 'email');
    setSentMap(prev => ({ ...prev, [`${item.customerId}::em`]: true }));
  }, [businessName]);

  const logCommunication = useCallback(async (item: ReminderItem, type: 'whatsapp' | 'email') => {
    try {
      await addDoc(collection(db, `businesses/${businessId}/communications`), {
        customerId: item.customerId,
        customerName: item.customerName,
        type: type === 'whatsapp' ? 'recordatorio-whatsapp' : 'recordatorio-email',
        content: `Recordatorio ${getSeverityConfig(item.severity).label} — ${formatCurrency(item.totalDebtUSD)}`,
        severity: item.severity,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to log communication:', e);
    }
  }, [businessId]);

  // Calendar navigation
  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  // Render calendar
  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(calYear, calMonth);
    const firstDay = getFirstDayOfWeek(calYear, calMonth);
    const todayStr = new Date().toISOString().split('T')[0];
    const cells: React.ReactNode[] = [];

    // Empty cells for days before month start
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="h-16 lg:h-20" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const data = calendarData[dateStr];
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDay;

      cells.push(
        <button
          key={day}
          onClick={() => setSelectedDay(dateStr === selectedDay ? null : dateStr)}
          className={`h-16 lg:h-20 rounded-lg border text-left p-1.5 transition-all relative
            ${isSelected ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30' : 'border-white/5 hover:border-white/15'}
            ${isToday ? 'bg-white/5' : ''}
          `}
        >
          <span className={`text-[11px] font-bold ${isToday ? 'text-indigo-400' : 'text-white/50'}`}>
            {day}
          </span>
          {data && (
            <div className="flex items-center gap-0.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${
                data.severity === 'red' ? 'bg-red-500' :
                data.severity === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'
              }`} />
              <span className="text-[9px] text-white/40">{data.invoices.length}</span>
            </div>
          )}
        </button>
      );
    }

    return cells;
  };

  const selectedDayData = selectedDay ? calendarData[selectedDay] : null;

  // KPIs
  const totalOverdue = perCustomer.filter(r => r.daysUntilDue < 0).length;
  const totalDueToday = perCustomer.filter(r => r.severity === 'dueToday').length;
  const totalUpcoming = perCustomer.filter(r => r.severity === 'warn5').length;
  const totalDebt = perCustomer.reduce((s, r) => s + r.totalDebtUSD, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-indigo-400" />
            <h2 className="text-sm font-black tracking-wide text-white/90">Agenda de Cobranza</h2>
          </div>
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${
                viewMode === 'list' ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/40 hover:text-white/60'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${
                viewMode === 'calendar' ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/40 hover:text-white/60'
              }`}
            >
              Calendario
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            <div className="text-[9px] font-bold uppercase text-rose-400/70">Vencidas</div>
            <div className="text-lg font-black text-rose-400">{totalOverdue}</div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <div className="text-[9px] font-bold uppercase text-amber-400/70">Vencen hoy</div>
            <div className="text-lg font-black text-amber-400">{totalDueToday}</div>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
            <div className="text-[9px] font-bold uppercase text-yellow-400/70">Próximos 5d</div>
            <div className="text-lg font-black text-yellow-400">{totalUpcoming}</div>
          </div>
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
            <div className="text-[9px] font-bold uppercase text-indigo-400/70">Deuda total</div>
            <div className="text-lg font-black text-indigo-400">{formatCurrency(totalDebt)}</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {viewMode === 'list' ? (
          /* ── LIST VIEW ─────────────────────────────────────────── */
          perCustomer.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 size={36} className="mx-auto text-emerald-400/50 mb-3" />
              <p className="text-sm text-white/40 font-medium">No hay cobros pendientes de atención</p>
              <p className="text-[11px] text-white/25 mt-1">Todas las facturas están al día</p>
            </div>
          ) : (
            perCustomer.map(item => {
              const style = SEVERITY_STYLES[item.severity];
              const cfg = getSeverityConfig(item.severity);
              const waSent = sentMap[`${item.customerId}::wa`];
              const emSent = sentMap[`${item.customerId}::em`];

              return (
                <div
                  key={`${item.customerId}::${item.severity}`}
                  className={`rounded-xl border ${style.border} ${style.bg} p-3`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-none ${style.dot}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white/90 truncate">{item.customerName}</div>
                        <div className={`text-[10px] font-bold uppercase tracking-wider ${style.text}`}>
                          {cfg.label}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-none">
                      <div className="text-sm font-black text-white/90">{formatCurrency(item.totalDebtUSD)}</div>
                      <div className="text-[9px] text-white/30">
                        {item.overdueInvoices.length} factura{item.overdueInvoices.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                    {item.customerPhone && (
                      <button
                        onClick={() => handleSendWhatsApp(item)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                          waSent
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'
                        }`}
                      >
                        <MessageCircle size={12} />
                        {waSent ? 'Enviado' : 'WhatsApp'}
                      </button>
                    )}
                    {item.customerEmail && (
                      <button
                        onClick={() => handleSendEmail(item)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                          emSent
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20'
                        }`}
                      >
                        <Mail size={12} />
                        {emSent ? 'Enviado' : 'Email'}
                      </button>
                    )}
                    {item.customerPhone && (
                      <a
                        href={`tel:${item.customerPhone}`}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white/5 text-white/40 hover:text-white/70 border border-white/10 transition-all"
                      >
                        <Phone size={12} /> Llamar
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : (
          /* ── CALENDAR VIEW ─────────────────────────────────────── */
          <>
            {/* Calendar header */}
            <div className="flex items-center justify-between mb-2">
              <button onClick={prevMonth} className="p-2 hover:bg-white/5 rounded-lg transition-all">
                <ChevronLeft size={16} className="text-white/50" />
              </button>
              <span className="text-sm font-bold text-white/80">
                {MONTH_NAMES[calMonth]} {calYear}
              </span>
              <button onClick={nextMonth} className="p-2 hover:bg-white/5 rounded-lg transition-all">
                <ChevronRight size={16} className="text-white/50" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                <div key={d} className="text-center text-[9px] font-bold uppercase text-white/30 py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {renderCalendar()}
            </div>

            {/* Selected day detail */}
            {selectedDay && (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[10px] font-bold uppercase text-white/40 mb-2">
                  Vencimientos del {new Date(selectedDay + 'T12:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                {selectedDayData ? (
                  selectedDayData.invoices.map(inv => {
                    const cust = customers.find(c => c.id === inv.entityId);
                    return (
                      <div key={inv.id} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                        <div>
                          <span className="text-xs font-medium text-white/80">
                            {inv.entityName || cust?.nombre || cust?.fullName || 'Sin nombre'}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-white/70">{formatCurrency(inv.amountInUSD || 0)}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[11px] text-white/30">No hay vencimientos este día.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
