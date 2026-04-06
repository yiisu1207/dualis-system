import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, addDoc, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { usePortal } from './PortalGuard';
import { Service, Appointment, StaffSchedule } from '../../types';
import { CalendarDays, Clock, User, ChevronLeft, ChevronRight, CheckCircle, Loader2 } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function addMinutes(time: string, mins: number): string {
  const total = toMinutes(time) + mins;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function generateSlots(start: string, end: string, duration: number, buffer: number): string[] {
  const slots: string[] = [];
  let current = toMinutes(start);
  const endMin = toMinutes(end);
  while (current + duration <= endMin) {
    slots.push(`${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`);
    current += duration + buffer;
  }
  return slots;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Step = 'service' | 'staff' | 'datetime' | 'confirm' | 'done';

export default function PortalBooking() {
  const { businessId, customerId, customerName } = usePortal();

  const [services, setServices] = useState<Service[]>([]);
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [existingAppts, setExistingAppts] = useState<Appointment[]>([]);
  const [customerPhone, setCustomerPhone] = useState('');

  // Booking flow state
  const [step, setStep] = useState<Step>('service');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffSchedule | null>(null);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!businessId) return;
    const unsubs = [
      onSnapshot(collection(db, `businesses/${businessId}/services`), snap => {
        setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Service)).filter(s => s.active !== false));
      }),
      onSnapshot(collection(db, `businesses/${businessId}/staffSchedules`), snap => {
        setSchedules(snap.docs.map(d => ({ staffId: d.id, ...d.data() } as StaffSchedule)));
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [businessId]);

  // Load existing appointments for the selected date
  useEffect(() => {
    if (!businessId || !selectedDate) return;
    const unsub = onSnapshot(collection(db, `businesses/${businessId}/appointments`), snap => {
      setExistingAppts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment)));
    });
    return unsub;
  }, [businessId, selectedDate]);

  // Load customer phone
  useEffect(() => {
    if (!customerId) return;
    (async () => {
      const snap = await getDoc(doc(db, 'customers', customerId));
      if (snap.exists()) setCustomerPhone(snap.data()?.telefono || '');
    })();
  }, [customerId]);

  // ── Available staff for selected service ──────────────────────────────────
  const availableStaff = useMemo(() => {
    if (!selectedService) return [];
    return schedules.filter(s =>
      selectedService.staffIds.length === 0 || selectedService.staffIds.includes(s.staffId)
    );
  }, [selectedService, schedules]);

  // ── Available time slots ──────────────────────────────────────────────────
  const availableSlots = useMemo(() => {
    if (!selectedStaff || !selectedService || !selectedDate) return [];

    const dayOfWeek = new Date(selectedDate + 'T12:00:00').getDay();
    const hours = selectedStaff.weeklyHours[dayOfWeek];
    if (!hours) return []; // day off

    // Check if day is in daysOff
    if (selectedStaff.daysOff?.includes(selectedDate)) return [];

    const duration = selectedService.duration;
    const buffer = selectedStaff.bufferMinutes || 0;
    const allSlots = generateSlots(hours.start, hours.end, duration, buffer);

    // Filter out breaks
    const breaks = selectedStaff.breaks || [];
    const afterBreaks = allSlots.filter(slot => {
      const slotEnd = toMinutes(slot) + duration;
      return !breaks.some(b => {
        const bStart = toMinutes(b.start);
        const bEnd = toMinutes(b.end);
        return toMinutes(slot) < bEnd && slotEnd > bStart;
      });
    });

    // Filter out already booked slots
    const dayAppts = existingAppts.filter(
      a => a.date === selectedDate && a.staffId === selectedStaff.staffId && a.status !== 'cancelled'
    );
    return afterBreaks.filter(slot => {
      const slotEnd = toMinutes(slot) + duration;
      return !dayAppts.some(a => {
        return toMinutes(slot) < toMinutes(a.endTime) && slotEnd > toMinutes(a.startTime);
      });
    });
  }, [selectedStaff, selectedService, selectedDate, existingAppts]);

  // ── Date navigation ───────────────────────────────────────────────────────
  const dateObj = new Date(selectedDate + 'T12:00:00');
  const today = formatDate(new Date());
  const dates = useMemo(() => {
    const arr: string[] = [];
    const start = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      arr.push(formatDate(d));
    }
    return arr;
  }, []);

  // ── Submit booking ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedService || !selectedStaff || !selectedTime || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, `businesses/${businessId}/appointments`), {
        businessId,
        customerId,
        customerName,
        customerPhone,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        staffId: selectedStaff.staffId,
        staffName: selectedStaff.staffName,
        date: selectedDate,
        startTime: selectedTime,
        endTime: addMinutes(selectedTime, selectedService.duration),
        status: 'pending',
        source: 'portal',
        notes: notes || undefined,
        createdAt: new Date().toISOString(),
      });
      setStep('done');
    } catch (err) {
      console.error('Booking error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const resetBooking = () => {
    setStep('service');
    setSelectedService(null);
    setSelectedStaff(null);
    setSelectedTime('');
    setNotes('');
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-black text-white tracking-tight">Reservar Cita</h1>
        <p className="text-xs text-white/30 mt-1">Selecciona el servicio, profesional, fecha y hora</p>
      </div>

      {/* ── Progress bar ── */}
      <div className="flex items-center gap-1 px-4">
        {(['service', 'staff', 'datetime', 'confirm'] as Step[]).map((s, i) => (
          <div key={s} className={`flex-1 h-1 rounded-full transition-all ${
            (['service', 'staff', 'datetime', 'confirm', 'done'] as Step[]).indexOf(step) >= i
              ? 'bg-gradient-to-r from-indigo-500 to-violet-500'
              : 'bg-white/[0.06]'
          }`} />
        ))}
      </div>

      {/* ── Step 1: Service ── */}
      {step === 'service' && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 px-1">Elige un servicio</p>
          {services.length === 0 ? (
            <p className="text-xs text-white/20 text-center py-12">No hay servicios disponibles</p>
          ) : (
            <div className="space-y-2">
              {services.map(svc => (
                <button
                  key={svc.id}
                  onClick={() => {
                    setSelectedService(svc);
                    // If only one staff, auto-select
                    const staff = schedules.filter(s =>
                      svc.staffIds.length === 0 || svc.staffIds.includes(s.staffId)
                    );
                    if (staff.length === 1) {
                      setSelectedStaff(staff[0]);
                      setStep('datetime');
                    } else {
                      setStep('staff');
                    }
                  }}
                  className="w-full text-left bg-[#0d1424] rounded-2xl border border-white/[0.06] p-4 hover:border-indigo-500/30 hover:bg-indigo-500/[0.03] transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">{svc.name}</p>
                      <p className="text-[10px] text-white/30 mt-0.5 flex items-center gap-3">
                        <span className="flex items-center gap-1"><Clock size={10} /> {svc.duration} min</span>
                        {svc.category && <span>{svc.category}</span>}
                      </p>
                    </div>
                    <span className="text-sm font-black text-indigo-400">${svc.price}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Staff ── */}
      {step === 'staff' && (
        <div className="space-y-3">
          <button onClick={() => setStep('service')} className="text-[10px] font-bold text-white/30 hover:text-white/50 flex items-center gap-1">
            <ChevronLeft size={12} /> Cambiar servicio
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 px-1">Elige un profesional</p>
          {availableStaff.length === 0 ? (
            <p className="text-xs text-white/20 text-center py-12">No hay profesionales disponibles para este servicio</p>
          ) : (
            <div className="space-y-2">
              {availableStaff.map(s => (
                <button
                  key={s.staffId}
                  onClick={() => { setSelectedStaff(s); setStep('datetime'); }}
                  className="w-full text-left bg-[#0d1424] rounded-2xl border border-white/[0.06] p-4 hover:border-indigo-500/30 hover:bg-indigo-500/[0.03] transition-all group flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <User size={18} className="text-indigo-400" />
                  </div>
                  <p className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">{s.staffName}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Date & Time ── */}
      {step === 'datetime' && (
        <div className="space-y-4">
          <button onClick={() => availableStaff.length > 1 ? setStep('staff') : setStep('service')}
            className="text-[10px] font-bold text-white/30 hover:text-white/50 flex items-center gap-1">
            <ChevronLeft size={12} /> Atrás
          </button>

          {/* Date picker */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 px-1 mb-2">Fecha</p>
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scroll">
              {dates.map(d => {
                const dObj = new Date(d + 'T12:00:00');
                const isSelected = d === selectedDate;
                return (
                  <button
                    key={d}
                    onClick={() => { setSelectedDate(d); setSelectedTime(''); }}
                    className={`shrink-0 w-16 py-3 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                        : 'border-white/[0.06] text-white/40 hover:bg-white/[0.03]'
                    }`}
                  >
                    <p className="text-[9px] font-bold uppercase">{dObj.toLocaleDateString('es-VE', { weekday: 'short' })}</p>
                    <p className="text-lg font-black">{dObj.getDate()}</p>
                    <p className="text-[9px]">{dObj.toLocaleDateString('es-VE', { month: 'short' })}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time slots */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 px-1 mb-2">Hora disponible</p>
            {availableSlots.length === 0 ? (
              <p className="text-xs text-white/20 text-center py-8">No hay horarios disponibles para esta fecha</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {availableSlots.map(slot => (
                  <button
                    key={slot}
                    onClick={() => { setSelectedTime(slot); setStep('confirm'); }}
                    className={`py-3 rounded-xl border text-xs font-bold transition-all ${
                      selectedTime === slot
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                        : 'border-white/[0.06] text-white/40 hover:bg-white/[0.03] hover:text-white/60'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 4: Confirm ── */}
      {step === 'confirm' && selectedService && selectedStaff && (
        <div className="space-y-4">
          <button onClick={() => setStep('datetime')} className="text-[10px] font-bold text-white/30 hover:text-white/50 flex items-center gap-1">
            <ChevronLeft size={12} /> Cambiar horario
          </button>

          <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-5 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Resumen de tu cita</p>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Servicio</span>
                <span className="text-sm font-bold text-white">{selectedService.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Profesional</span>
                <span className="text-sm font-bold text-white">{selectedStaff.staffName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Fecha</span>
                <span className="text-sm font-bold text-white">
                  {dateObj.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Hora</span>
                <span className="text-sm font-bold text-white">
                  {selectedTime} - {addMinutes(selectedTime, selectedService.duration)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Precio</span>
                <span className="text-lg font-black text-indigo-400">${selectedService.price}</span>
              </div>
            </div>

            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notas adicionales (opcional)"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none placeholder:text-white/15"
            />

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> Reservando...</>
              ) : (
                <><CalendarDays size={16} /> Confirmar Reserva</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Done ── */}
      {step === 'done' && (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={40} className="text-emerald-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Cita Reservada</h2>
          <p className="text-sm text-white/40 mb-1">Tu cita ha sido registrada correctamente.</p>
          <p className="text-xs text-white/20 mb-6">Recibirás confirmación por parte del negocio.</p>
          <button
            onClick={resetBooking}
            className="px-6 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs font-black uppercase tracking-widest hover:bg-white/[0.06] transition-all"
          >
            Reservar otra cita
          </button>
        </div>
      )}
    </div>
  );
}
