import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Appointment, AppointmentStatus, Service, StaffSchedule,
} from '../../types';
import {
  ChevronLeft, ChevronRight, Plus, Clock, User, Phone,
  CheckCircle, XCircle, AlertTriangle, Calendar, UserPlus,
} from 'lucide-react';

interface Props {
  businessId: string;
  currentUserId: string;
  currentUserName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 7; // 7:00 - 20:30
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function addMinutes(time: string, mins: number): string {
  const total = toMinutes(time) + mins;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isoWeekday(d: Date): number {
  return d.getDay(); // 0=Sun
}

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  confirmed: 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300',
  pending:   'bg-amber-500/20 border-amber-500/30 text-amber-300',
  completed: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
  cancelled: 'bg-slate-500/20 border-slate-500/30 text-slate-400 line-through',
  no_show:   'bg-rose-500/20 border-rose-500/30 text-rose-300',
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmada',
  pending:   'Pendiente',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show:   'No asistió',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CitasPanel({ businessId, currentUserId, currentUserName }: Props) {
  const [selectedDate, setSelectedDate] = useState(() => formatDate(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staffSchedules, setStaffSchedules] = useState<StaffSchedule[]>([]);

  // Modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);

  // New appointment form
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerPhone, setFormCustomerPhone] = useState('');
  const [formServiceId, setFormServiceId] = useState('');
  const [formStaffId, setFormStaffId] = useState('');
  const [formTime, setFormTime] = useState('09:00');
  const [formSource, setFormSource] = useState<'manual' | 'walk_in'>('manual');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Data listeners ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!businessId) return;
    const unsubs = [
      onSnapshot(collection(db, `businesses/${businessId}/appointments`), snap => {
        setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment)));
      }),
      onSnapshot(collection(db, `businesses/${businessId}/services`), snap => {
        setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Service)));
      }),
      onSnapshot(collection(db, `businesses/${businessId}/staffSchedules`), snap => {
        setStaffSchedules(snap.docs.map(d => ({ staffId: d.id, ...d.data() } as StaffSchedule)));
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [businessId]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const dayAppts = useMemo(
    () => appointments.filter(a => a.date === selectedDate && a.status !== 'cancelled'),
    [appointments, selectedDate],
  );

  const staffList = useMemo(() => {
    if (staffSchedules.length > 0) return staffSchedules;
    // Fallback: derive from appointments
    const map = new Map<string, string>();
    appointments.forEach(a => { if (a.staffId) map.set(a.staffId, a.staffName); });
    return [...map.entries()].map(([id, name]) => ({
      staffId: id, staffName: name, weeklyHours: {}, breaks: [], bufferMinutes: 10, daysOff: [],
    }));
  }, [staffSchedules, appointments]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigateDay = (delta: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(formatDate(d));
  };

  const selectedService = services.find(s => s.id === formServiceId);

  // ── Save appointment ────────────────────────────────────────────────────────
  const handleSaveAppointment = async () => {
    if (!formCustomerName || !formServiceId || !formStaffId || saving) return;
    setSaving(true);
    try {
      const svc = services.find(s => s.id === formServiceId);
      const staff = staffList.find(s => s.staffId === formStaffId);
      const endTime = addMinutes(formTime, svc?.duration || 30);

      const payload: Omit<Appointment, 'id'> = {
        businessId,
        customerName: formCustomerName,
        customerPhone: formCustomerPhone,
        serviceId: formServiceId,
        serviceName: svc?.name || '',
        staffId: formStaffId,
        staffName: staff?.staffName || '',
        date: selectedDate,
        startTime: formTime,
        endTime,
        status: 'confirmed',
        source: formSource,
        notes: formNotes || undefined,
        createdAt: new Date().toISOString(),
      };

      if (editingAppt) {
        await updateDoc(doc(db, `businesses/${businessId}/appointments`, editingAppt.id), payload);
      } else {
        await addDoc(collection(db, `businesses/${businessId}/appointments`), payload);
      }

      resetForm();
    } catch (err) {
      console.error('Error saving appointment:', err);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setShowNewModal(false);
    setEditingAppt(null);
    setFormCustomerName('');
    setFormCustomerPhone('');
    setFormServiceId('');
    setFormStaffId('');
    setFormTime('09:00');
    setFormSource('manual');
    setFormNotes('');
  };

  const handleStatusChange = async (apptId: string, status: AppointmentStatus) => {
    await updateDoc(doc(db, `businesses/${businessId}/appointments`, apptId), { status });

    // When completed, record commission for the staff member
    if (status === 'completed') {
      const appt = appointments.find(a => a.id === apptId);
      const svc = services.find(s => s.id === appt?.serviceId);
      if (appt && svc && svc.price > 0) {
        await addDoc(collection(db, `businesses/${businessId}/commissions`), {
          type: 'cita',
          staffId: appt.staffId,
          staffName: appt.staffName,
          appointmentId: apptId,
          serviceId: svc.id,
          serviceName: svc.name,
          servicePrice: svc.price,
          customerName: appt.customerName,
          date: appt.date,
          createdAt: new Date().toISOString(),
        });
      }
    }
  };

  const openEdit = (appt: Appointment) => {
    setEditingAppt(appt);
    setFormCustomerName(appt.customerName);
    setFormCustomerPhone(appt.customerPhone);
    setFormServiceId(appt.serviceId);
    setFormStaffId(appt.staffId);
    setFormTime(appt.startTime);
    setFormSource(appt.source === 'portal' ? 'manual' : appt.source);
    setFormNotes(appt.notes || '');
    setShowNewModal(true);
  };

  // ── Date display ────────────────────────────────────────────────────────────
  const dateObj = new Date(selectedDate + 'T12:00:00');
  const isToday = selectedDate === formatDate(new Date());
  const dayLabel = dateObj.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = dayAppts.length;
    const confirmed = dayAppts.filter(a => a.status === 'confirmed').length;
    const completed = dayAppts.filter(a => a.status === 'completed').length;
    const pending = dayAppts.filter(a => a.status === 'pending').length;
    return { total, confirmed, completed, pending };
  }, [dayAppts]);

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Citas</h1>
          <p className="text-xs text-slate-500 dark:text-white/30 mt-0.5">Agenda y gestión de citas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedDate(formatDate(new Date()))}
            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
              isToday
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                : 'border-white/10 text-white/40 hover:bg-white/[0.04]'
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => { setShowNewModal(true); setEditingAppt(null); }}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 flex items-center gap-2"
          >
            <Plus size={14} /> Nueva Cita
          </button>
        </div>
      </div>

      {/* ── Date nav + stats ── */}
      <div className="flex items-center justify-between bg-[#0d1424] rounded-2xl border border-white/[0.06] p-4">
        <button onClick={() => navigateDay(-1)} className="p-2 rounded-xl hover:bg-white/[0.05] transition-all">
          <ChevronLeft size={18} className="text-white/40" />
        </button>
        <div className="text-center">
          <p className="text-sm font-black text-white capitalize">{dayLabel}</p>
          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-[10px] font-bold text-white/30">{stats.total} citas</span>
            {stats.confirmed > 0 && <span className="text-[10px] font-bold text-indigo-400">{stats.confirmed} confirmadas</span>}
            {stats.pending > 0 && <span className="text-[10px] font-bold text-amber-400">{stats.pending} pendientes</span>}
            {stats.completed > 0 && <span className="text-[10px] font-bold text-emerald-400">{stats.completed} completadas</span>}
          </div>
        </div>
        <button onClick={() => navigateDay(1)} className="p-2 rounded-xl hover:bg-white/[0.05] transition-all">
          <ChevronRight size={18} className="text-white/40" />
        </button>
      </div>

      {/* ── Day timeline (per staff) ── */}
      {staffList.length > 0 ? (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] overflow-hidden">
          {/* Staff headers */}
          <div className="grid border-b border-white/[0.06]" style={{ gridTemplateColumns: `60px repeat(${staffList.length}, 1fr)` }}>
            <div className="p-3 border-r border-white/[0.06]">
              <Clock size={14} className="text-white/20 mx-auto" />
            </div>
            {staffList.map(s => (
              <div key={s.staffId} className="p-3 text-center border-r border-white/[0.06] last:border-r-0">
                <p className="text-xs font-black text-white truncate">{s.staffName}</p>
              </div>
            ))}
          </div>

          {/* Time slots */}
          <div className="max-h-[60vh] overflow-y-auto custom-scroll">
            {HOURS.map(time => (
              <div
                key={time}
                className="grid border-b border-white/[0.03] hover:bg-white/[0.01] transition-colors"
                style={{ gridTemplateColumns: `60px repeat(${staffList.length}, 1fr)` }}
              >
                <div className="p-2 border-r border-white/[0.06] flex items-start justify-center">
                  <span className="text-[10px] font-bold text-white/20">{time}</span>
                </div>
                {staffList.map(staff => {
                  const slotAppts = dayAppts.filter(
                    a => a.staffId === staff.staffId && a.startTime <= time && a.endTime > time,
                  );
                  const startsHere = dayAppts.filter(
                    a => a.staffId === staff.staffId && a.startTime === time,
                  );

                  return (
                    <div
                      key={staff.staffId}
                      className="p-1 border-r border-white/[0.06] last:border-r-0 min-h-[40px] relative cursor-pointer"
                      onClick={() => {
                        if (slotAppts.length === 0) {
                          setFormStaffId(staff.staffId);
                          setFormTime(time);
                          setShowNewModal(true);
                          setEditingAppt(null);
                        }
                      }}
                    >
                      {startsHere.map(appt => {
                        const duration = toMinutes(appt.endTime) - toMinutes(appt.startTime);
                        const slots = Math.ceil(duration / 30);
                        return (
                          <div
                            key={appt.id}
                            onClick={(e) => { e.stopPropagation(); openEdit(appt); }}
                            className={`absolute inset-x-1 rounded-lg border px-2 py-1.5 cursor-pointer hover:opacity-80 transition-opacity z-10 ${STATUS_COLORS[appt.status]}`}
                            style={{ height: `${slots * 40 - 4}px` }}
                          >
                            <p className="text-[10px] font-black truncate">{appt.customerName}</p>
                            <p className="text-[9px] opacity-60 truncate">{appt.serviceName}</p>
                            <p className="text-[9px] opacity-40">{appt.startTime} - {appt.endTime}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-12 text-center">
          <Calendar size={40} className="text-white/10 mx-auto mb-3" />
          <p className="text-sm font-bold text-white/30 mb-1">Sin personal configurado</p>
          <p className="text-xs text-white/15">Agrega empleados y horarios en Configuración para ver la agenda.</p>
        </div>
      )}

      {/* ── Walk-in queue ── */}
      {dayAppts.filter(a => a.source === 'walk_in' && a.status === 'pending').length > 0 && (
        <div className="bg-[#0d1424] rounded-2xl border border-amber-500/20 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-3 flex items-center gap-2">
            <UserPlus size={14} /> Cola de Walk-in
          </p>
          <div className="space-y-2">
            {dayAppts.filter(a => a.source === 'walk_in' && a.status === 'pending').map(appt => (
              <div key={appt.id} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-white">{appt.customerName}</p>
                  <p className="text-[10px] text-white/30">{appt.serviceName} — {appt.startTime}</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleStatusChange(appt.id, 'confirmed')}
                    className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all"
                    title="Confirmar"
                  >
                    <CheckCircle size={14} />
                  </button>
                  <button
                    onClick={() => handleStatusChange(appt.id, 'cancelled')}
                    className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all"
                    title="Cancelar"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Appointment list (mobile-friendly) ── */}
      <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-5 sm:hidden">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Citas del día</p>
        {dayAppts.length === 0 ? (
          <p className="text-xs text-white/20 text-center py-6">Sin citas para este día</p>
        ) : (
          <div className="space-y-2">
            {dayAppts.sort((a, b) => a.startTime.localeCompare(b.startTime)).map(appt => (
              <div
                key={appt.id}
                onClick={() => openEdit(appt)}
                className={`rounded-xl border px-4 py-3 cursor-pointer hover:opacity-80 transition-all ${STATUS_COLORS[appt.status]}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-black">{appt.customerName}</p>
                  <span className="text-[9px] font-bold opacity-60">{appt.startTime} - {appt.endTime}</span>
                </div>
                <p className="text-[10px] opacity-60">{appt.serviceName} — {appt.staffName}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New/Edit Appointment Modal ── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={resetForm}>
          <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white mb-5">
              {editingAppt ? 'Editar Cita' : 'Nueva Cita'}
            </h3>

            <div className="space-y-4">
              {/* Customer */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Cliente</label>
                  <input
                    value={formCustomerName}
                    onChange={e => setFormCustomerName(e.target.value)}
                    placeholder="Nombre"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Teléfono</label>
                  <input
                    value={formCustomerPhone}
                    onChange={e => setFormCustomerPhone(e.target.value)}
                    placeholder="04XX-XXXXXXX"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Service */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Servicio</label>
                <select
                  value={formServiceId}
                  onChange={e => setFormServiceId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Seleccionar servicio...</option>
                  {services.filter(s => s.active !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.duration} min — ${s.price})</option>
                  ))}
                </select>
              </div>

              {/* Staff + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Profesional</label>
                  <select
                    value={formStaffId}
                    onChange={e => setFormStaffId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">Seleccionar...</option>
                    {staffList.map(s => (
                      <option key={s.staffId} value={s.staffId}>{s.staffName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Hora</label>
                  <select
                    value={formTime}
                    onChange={e => setFormTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              {/* End time preview */}
              {selectedService && (
                <p className="text-[10px] text-white/20">
                  Fin estimado: {addMinutes(formTime, selectedService.duration)} ({selectedService.duration} min)
                </p>
              )}

              {/* Source */}
              <div className="flex gap-2">
                {(['manual', 'walk_in'] as const).map(src => (
                  <button
                    key={src}
                    onClick={() => setFormSource(src)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                      formSource === src
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                        : 'border-white/[0.08] text-white/30 hover:bg-white/[0.03]'
                    }`}
                  >
                    {src === 'manual' ? 'Manual' : 'Walk-in'}
                  </button>
                ))}
              </div>

              {/* Notes */}
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Notas (opcional)"
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />

              {/* Status buttons for editing */}
              {editingAppt && (
                <div className="flex gap-1.5">
                  {(['confirmed', 'completed', 'no_show', 'cancelled'] as AppointmentStatus[]).map(st => (
                    <button
                      key={st}
                      onClick={() => { handleStatusChange(editingAppt.id, st); resetForm(); }}
                      className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${STATUS_COLORS[st]} hover:opacity-80 transition-all`}
                    >
                      {STATUS_LABELS[st]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={resetForm}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest hover:bg-white/[0.04] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveAppointment}
                disabled={!formCustomerName || !formServiceId || !formStaffId || saving}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition-all"
              >
                {saving ? 'Guardando...' : editingAppt ? 'Actualizar' : 'Crear Cita'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
