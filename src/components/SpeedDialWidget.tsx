import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useRates } from '../context/RatesContext';
import { useToast } from '../context/ToastContext';
import FloatingWidgetShell from './FloatingWidgetShell';
import { logAudit } from '../utils/auditLogger';
import {
  Receipt,
  Zap,
  UserPlus,
  RefreshCw,
  X,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

type WidgetPosition = { x: number; y: number };

interface Props {
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
  onClose: () => void;
  onMinimize: () => void;
  onPositionChange: (p: WidgetPosition) => void;
}

type ActivePanel = null | 'expense' | 'customer';

// ── Mini-form helpers ──────────────────────────────────────────────────────────

function ExpensePanel({ businessId, userId, onDone }: { businessId: string; userId: string; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('Gasto Operativo');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { rates } = useRates();

  const handleSave = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { toast.warning('Monto inválido'); return; }
    if (!desc.trim()) { toast.warning('Ingresa una descripción'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'movements'), {
        businessId,
        movementType: 'EGRESO',
        description: desc.trim(),
        category,
        amountInUSD: num,
        amountInBs: num * rates.tasaBCV,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        isSupplierMovement: false,
        entityId: '',
        source: 'speed_dial',
      });
      logAudit(businessId, userId, 'CREAR', 'EGRESO', `${category} — $${num}`);
      toast.success(`Gasto de $${num} registrado`);
      onDone();
    } catch {
      toast.error('Error al guardar el gasto');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-300 transition-all';

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">Registrar Gasto</span>
        <button onClick={onDone} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 transition-all"><X size={12} /></button>
      </div>
      <input type="number" min="0" step="0.01" placeholder="Monto en USD" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} />
      <input type="text" placeholder="Descripción" value={desc} onChange={e => setDesc(e.target.value)} className={inputCls} />
      <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
        {['Gasto Operativo', 'Servicios', 'Alquiler', 'Nómina', 'Transporte', 'Suministros', 'Otro'].map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-700 transition-all disabled:opacity-50"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <><Receipt size={12} /> Guardar Gasto</>}
      </button>
    </div>
  );
}

function CustomerPanel({ businessId, userId, onDone }: { businessId: string; userId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cedula, setCedula] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSave = async () => {
    if (!name.trim()) { toast.warning('Ingresa el nombre del cliente'); return; }
    setSaving(true);
    try {
      // Duplicate check: cédula or phone (normalized)
      const norm = (s: string) => s.replace(/[\s.-]/g, '').toUpperCase();
      const phoneDigits = phone.replace(/\D/g, '');
      const cedulaNorm = cedula.trim() ? norm(cedula.trim()) : '';
      const snap = await getDocs(query(collection(db, 'customers'), where('businessId', '==', businessId)));
      let dup: any = null;
      snap.forEach(d => {
        if (dup) return;
        const data: any = d.data();
        if (cedulaNorm && data.cedula && norm(String(data.cedula)) === cedulaNorm) {
          dup = data;
          return;
        }
        if (phoneDigits.length >= 7) {
          const od = String(data.telefono || data.phone || '').replace(/\D/g, '');
          if (od.length >= 7 && od.slice(-7) === phoneDigits.slice(-7)) {
            dup = data;
          }
        }
      });
      if (dup) {
        toast.warning(`Ya existe: ${dup.nombre || dup.fullName || dup.displayName || 'cliente'}`);
        setSaving(false);
        return;
      }
      await addDoc(collection(db, 'customers'), {
        businessId,
        cedula: cedula.trim() || name.trim(),
        telefono: phone.trim(),
        direccion: '',
        email: '',
        displayName: name.trim(),
        nombre: name.trim(),
        fullName: name.trim(),
        createdAt: new Date().toISOString(),
        source: 'speed_dial',
      });
      logAudit(businessId, userId, 'CREAR', 'CLIENTE', name.trim());
      toast.success(`Cliente "${name.trim()}" creado`);
      onDone();
    } catch {
      toast.error('Error al crear el cliente');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-300 transition-all';

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Nuevo Cliente</span>
        <button onClick={onDone} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 transition-all"><X size={12} /></button>
      </div>
      <input type="text" placeholder="Nombre completo *" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
      <input type="text" placeholder="Cédula / RIF" value={cedula} onChange={e => setCedula(e.target.value)} className={inputCls} />
      <input type="tel" placeholder="Teléfono" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all disabled:opacity-50"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <><UserPlus size={12} /> Crear Cliente</>}
      </button>
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────────

const SpeedDialWidget: React.FC<Props> = ({
  isOpen, isMinimized, position, onClose, onMinimize, onPositionChange,
}) => {
  const { userProfile, user: firebaseUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [panel, setPanel] = useState<ActivePanel>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const businessId = userProfile?.businessId || '';
  const userId = firebaseUser?.uid || '';

  const handleSync = async () => {
    setSyncing(true);
    setSyncDone(false);
    // Firebase is real-time. We do a lightweight write to user prefs as a heartbeat.
    if (userId) {
      try {
        await setDoc(doc(db, 'users', userId), { lastSyncedAt: new Date().toISOString() }, { merge: true });
      } catch { /* silent */ }
    }
    await new Promise(r => setTimeout(r, 800));
    setSyncing(false);
    setSyncDone(true);
    setTimeout(() => setSyncDone(false), 2500);
    toast.success('Sincronización completada');
  };

  const goToPOS = () => {
    navigate('/pos/detal');
    onClose();
  };

  const actions = [
    {
      id: 'expense' as const,
      label: 'Gasto Rápido',
      Icon: Receipt,
      color: 'bg-rose-500 hover:bg-rose-600',
      onClick: () => setPanel(p => p === 'expense' ? null : 'expense'),
    },
    {
      id: 'sale' as const,
      label: 'Ir al POS',
      Icon: Zap,
      color: 'bg-emerald-500 hover:bg-emerald-600',
      onClick: goToPOS,
    },
    {
      id: 'customer' as const,
      label: 'Nuevo Cliente',
      Icon: UserPlus,
      color: 'bg-indigo-500 hover:bg-indigo-600',
      onClick: () => setPanel(p => p === 'customer' ? null : 'customer'),
    },
    {
      id: 'sync' as const,
      label: syncDone ? '¡Listo!' : syncing ? 'Sincronizando…' : 'Sincronizar',
      Icon: syncDone ? CheckCircle2 : RefreshCw,
      color: syncDone ? 'bg-emerald-500' : 'bg-slate-800 hover:bg-slate-900',
      onClick: handleSync,
    },
  ];

  return (
    <FloatingWidgetShell
      title="Speed Dial"
      subtitle="Acciones rápidas"
      icon="fa-solid fa-bolt"
      isOpen={isOpen}
      isMinimized={isMinimized}
      position={position}
      width={280}
      onClose={onClose}
      onMinimize={onMinimize}
      onPositionChange={onPositionChange}
    >
      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2.5">
        {actions.map(({ id, label, Icon, color, onClick }) => (
          <button
            key={id}
            type="button"
            onClick={onClick}
            disabled={syncing && id === 'sync'}
            className={`h-[72px] rounded-2xl ${color} text-white flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-60 ${
              panel === id ? 'ring-2 ring-offset-1 ring-white/40' : ''
            }`}
          >
            <Icon size={20} className={syncing && id === 'sync' ? 'animate-spin' : ''} />
            <span className="text-[9px] font-black uppercase tracking-wider leading-none text-center px-1">{label}</span>
          </button>
        ))}
      </div>

      {/* Inline panels */}
      {panel === 'expense' && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <ExpensePanel businessId={businessId} userId={userId} onDone={() => setPanel(null)} />
        </div>
      )}
      {panel === 'customer' && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <CustomerPanel businessId={businessId} userId={userId} onDone={() => setPanel(null)} />
        </div>
      )}

      {/* POS shortcut hint */}
      {!panel && (
        <div className="mt-3 flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">POS directo</span>
          <button onClick={goToPOS} className="flex items-center gap-1 text-[9px] font-black text-indigo-600 hover:text-indigo-800 transition-colors">
            Abrir <ArrowRight size={10} />
          </button>
        </div>
      )}
    </FloatingWidgetShell>
  );
};

export default SpeedDialWidget;
