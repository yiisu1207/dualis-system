import React, { useState, useEffect, useRef } from 'react';
import { usePortal } from './PortalGuard';
import { useParams } from 'react-router-dom';
import {
  HelpCircle, CreditCard, FileText, Receipt, Zap, ChevronDown,
  ChevronRight, CheckCircle2, AlertCircle, Clock, Shield, Phone,
  Mail, MessageCircle, Send, Loader2,
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

interface FAQItem {
  question: string;
  answer: string;
}

interface GuideStep {
  title: string;
  description: string;
}

interface Guide {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  steps: GuideStep[];
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: '¿Cómo registro un pago?',
    answer: 'Ve a la sección "Pagar" desde el menú. Selecciona la cuenta (BCV, Grupo o Divisa), elige las facturas que deseas pagar, ingresa el monto, método de pago y número de referencia. Tu pago será enviado para aprobación del administrador.',
  },
  {
    question: '¿Cuánto tarda en aprobarse mi pago?',
    answer: 'El tiempo de aprobación depende del administrador de la empresa. Generalmente los pagos se procesan dentro de las primeras 24 horas hábiles. Puedes ver el estado de tus pagos en el Dashboard.',
  },
  {
    question: '¿Qué es Pronto Pago?',
    answer: 'Pronto Pago es un programa de descuento por pago anticipado. Si pagas tu factura antes de la fecha de vencimiento, puedes obtener un descuento. El porcentaje varía según los días de anticipación. Consulta la sección "Pronto Pago" para ver las facturas elegibles.',
  },
  {
    question: '¿Qué significan las cuentas BCV, Grupo y Divisa?',
    answer: 'Son los tipos de cuenta con diferentes tasas de cambio. BCV usa la tasa oficial del Banco Central de Venezuela. Grupo y Divisa son tasas paralelas. Cada factura está asociada a una cuenta específica y el abono debe hacerse a la misma cuenta.',
  },
  {
    question: '¿Puedo pagar facturas de diferentes cuentas a la vez?',
    answer: 'No, cada pago debe ser para una cuenta específica (BCV, Grupo o Divisa). Si tienes deudas en diferentes cuentas, debes registrar un pago por cada cuenta.',
  },
  {
    question: '¿Qué es el estado de cuenta?',
    answer: 'El estado de cuenta muestra el historial completo de tus transacciones: facturas (débitos) y pagos (créditos). Puedes filtrar por tipo de cuenta y ver tu saldo actualizado con el balance corrido.',
  },
  {
    question: '¿Mi sesión expira?',
    answer: 'Sí, tu sesión dura 24 horas por seguridad. Después de ese tiempo, deberás ingresar tu PIN nuevamente para acceder al portal.',
  },
  {
    question: '¿Cómo obtengo mi PIN de acceso?',
    answer: 'Tu PIN es proporcionado por el administrador de la empresa cuando te genera acceso al portal. Si lo olvidaste, contacta al administrador para que te genere uno nuevo.',
  },
  {
    question: '¿Qué hago si mi pago fue rechazado?',
    answer: 'Si un pago fue rechazado, revisa el motivo en el historial de pagos del Dashboard. Asegúrate de que la referencia sea correcta y que el monto coincida. Puedes registrar un nuevo pago con la información corregida.',
  },
  {
    question: '¿Las tasas de cambio se actualizan automáticamente?',
    answer: 'Sí, las tasas se actualizan según la configuración del administrador. Puedes ver las tasas vigentes en el Dashboard. Ten en cuenta que el monto final en bolívares depende de la tasa al momento de la facturación.',
  },
];

const GUIDES: Guide[] = [
  {
    id: 'register-payment',
    title: 'Registrar un Pago',
    icon: CreditCard,
    color: 'indigo',
    steps: [
      { title: 'Selecciona la cuenta', description: 'En la pantalla de "Pagar", elige la cuenta a la que deseas abonar: BCV, Grupo o Divisa. Verás el saldo pendiente de cada una.' },
      { title: 'Elige las facturas', description: 'Selecciona las facturas que cubre tu pago. Esto es opcional pero ayuda al administrador a aplicar el abono correctamente.' },
      { title: 'Ingresa el monto', description: 'Escribe el monto en USD que estás pagando. Si seleccionaste facturas, puedes usar el botón "Usar total seleccionado" para llenar el monto automáticamente.' },
      { title: 'Método y referencia', description: 'Selecciona cómo pagaste (transferencia, Pago Móvil, Zelle, etc.) e ingresa el número de referencia del comprobante.' },
      { title: 'Envía el pago', description: 'Presiona "Enviar Pago para Aprobación". Tu pago quedará pendiente hasta que el administrador lo revise y apruebe.' },
    ],
  },
  {
    id: 'view-invoices',
    title: 'Consultar Facturas',
    icon: FileText,
    color: 'sky',
    steps: [
      { title: 'Accede a Facturas', description: 'Desde el menú, toca "Facturas" para ver todas tus facturas emitidas.' },
      { title: 'Filtra por estado', description: 'Usa los filtros de estado (Todas, Pendientes, Pagadas) para encontrar rápidamente lo que buscas.' },
      { title: 'Filtra por cuenta', description: 'Si deseas ver solo facturas de BCV, Grupo o Divisa, usa el filtro de tipo de cuenta.' },
      { title: 'Busca por concepto', description: 'Usa la barra de búsqueda para encontrar una factura específica por concepto o número de control.' },
    ],
  },
  {
    id: 'pronto-pago',
    title: 'Aprovechar Pronto Pago',
    icon: Zap,
    color: 'emerald',
    steps: [
      { title: 'Ve a Pronto Pago', description: 'Desde el menú, accede a "Pronto Pago" para ver las facturas elegibles para descuento.' },
      { title: 'Revisa los niveles de descuento', description: 'En la parte superior verás los niveles de descuento según los días de anticipación (ej: 5% si pagas en 7 días, 3% en 15 días).' },
      { title: 'Identifica facturas elegibles', description: 'Las facturas con el ícono verde son elegibles. Verás el descuento calculado y el monto neto a pagar.' },
      { title: 'Registra el pago', description: 'Presiona el botón de pago para ir directamente al formulario con las facturas preseleccionadas.' },
    ],
  },
  {
    id: 'statement',
    title: 'Estado de Cuenta',
    icon: Receipt,
    color: 'violet',
    steps: [
      { title: 'Accede al estado de cuenta', description: 'Desde el menú, toca "Estado" para ver tu estado de cuenta completo.' },
      { title: 'Selecciona la cuenta', description: 'Puedes filtrar por BCV, Grupo, Divisa o ver todas las cuentas juntas.' },
      { title: 'Lee el historial', description: 'La tabla muestra cada transacción con: fecha, concepto, Debe (facturas), Haber (pagos) y saldo acumulado.' },
      { title: 'Verifica tu balance', description: 'Al final de la tabla encontrarás el total de débitos, créditos y tu saldo actual.' },
    ],
  },
];

function FAQAccordion({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-white/[0.05] last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 py-3.5 px-4 text-left active:bg-white/[0.02] transition-colors"
      >
        <ChevronRight
          size={14}
          className={`text-white/30 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-xs sm:text-sm font-bold text-white/80 flex-1">{item.question}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pl-11 animate-in slide-in-from-top-2 duration-200">
          <p className="text-xs text-white/40 leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  );
}

function GuideCard({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] overflow-hidden shadow-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 sm:p-5 flex items-center gap-3 text-left active:bg-white/[0.02] transition-colors"
      >
        <div className={`w-10 h-10 rounded-xl bg-${guide.color}-500/10 text-${guide.color}-400 flex items-center justify-center shrink-0`}>
          <guide.icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white">{guide.title}</p>
          <p className="text-[9px] font-bold text-white/30 mt-0.5">{guide.steps.length} pasos</p>
        </div>
        <ChevronDown
          size={16}
          className={`text-white/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-white/[0.07] animate-in slide-in-from-top-2 duration-200">
          <div className="pt-4 space-y-3">
            {guide.steps.map((step, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full bg-${guide.color}-500/15 text-${guide.color}-400 flex items-center justify-center shrink-0 text-[10px] font-black`}>
                    {idx + 1}
                  </div>
                  {idx < guide.steps.length - 1 && (
                    <div className="w-px flex-1 bg-white/[0.06] mt-1" />
                  )}
                </div>
                <div className="pb-3">
                  <p className="text-xs font-black text-white/80">{step.title}</p>
                  <p className="text-[10px] sm:text-xs text-white/40 leading-relaxed mt-0.5">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ChatMsg {
  id: string;
  text: string;
  sender: 'client' | 'business';
  senderName: string;
  createdAt: string;
}

export default function PortalHelp() {
  const { businessId, customerId, customerName, businessName } = usePortal();
  const [tab, setTab] = useState<'guides' | 'faq' | 'chat'>('guides');
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load chat messages
  useEffect(() => {
    if (!businessId || !customerId || tab !== 'chat') return;
    const q = query(
      collection(db, `businesses/${businessId}/portalChat/${customerId}/messages`),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMsg)));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
  }, [businessId, customerId, tab]);

  const handleSendMsg = async () => {
    if (!chatText.trim() || chatSending) return;
    setChatSending(true);
    try {
      await addDoc(collection(db, `businesses/${businessId}/portalChat/${customerId}/messages`), {
        text: chatText.trim(),
        sender: 'client',
        senderName: customerName,
        createdAt: new Date().toISOString(),
      });
      setChatText('');
    } catch (err) {
      console.error('Chat send error:', err);
    } finally {
      setChatSending(false);
    }
  };

  return (
    <div className="space-y-5 animate-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
          <HelpCircle size={22} className="text-indigo-400" />
          Centro de Ayuda
        </h1>
        <p className="text-xs sm:text-sm text-white/40 font-bold mt-1">
          Guías paso a paso y preguntas frecuentes
        </p>
      </div>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 shadow-lg flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
            <Shield size={16} />
          </div>
          <div>
            <p className="text-xs font-black text-white/80">Seguridad</p>
            <p className="text-[9px] text-white/30 mt-0.5 leading-relaxed">
              Tu sesión está protegida con PIN y expira cada 24 horas por seguridad
            </p>
          </div>
        </div>
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 shadow-lg flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <Clock size={16} />
          </div>
          <div>
            <p className="text-xs font-black text-white/80">Pagos</p>
            <p className="text-[9px] text-white/30 mt-0.5 leading-relaxed">
              Los pagos registrados son revisados y aprobados por el administrador
            </p>
          </div>
        </div>
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 shadow-lg flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
            <CheckCircle2 size={16} />
          </div>
          <div>
            <p className="text-xs font-black text-white/80">Datos en Tiempo Real</p>
            <p className="text-[9px] text-white/30 mt-0.5 leading-relaxed">
              Tu balance, facturas y tasas se actualizan automáticamente
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.07]">
        <button
          onClick={() => setTab('guides')}
          className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            tab === 'guides'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          Guías
        </button>
        <button
          onClick={() => setTab('faq')}
          className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            tab === 'faq'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          FAQ
        </button>
        <button
          onClick={() => setTab('chat')}
          className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
            tab === 'chat'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          <MessageCircle size={11} /> Chat
        </button>
      </div>

      {/* Guides */}
      {tab === 'guides' && (
        <div className="space-y-3">
          {GUIDES.map((g) => (
            <React.Fragment key={g.id}><GuideCard guide={g} /></React.Fragment>
          ))}
        </div>
      )}

      {/* FAQ */}
      {tab === 'faq' && (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] overflow-hidden shadow-lg">
          {FAQ_ITEMS.map((item, idx) => (
            <React.Fragment key={idx}><FAQAccordion item={item} /></React.Fragment>
          ))}
        </div>
      )}

      {/* Chat */}
      {tab === 'chat' && (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] shadow-lg overflow-hidden flex flex-col" style={{ height: '400px' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.length === 0 && (
              <div className="py-12 text-center">
                <MessageCircle size={28} className="mx-auto text-white/10 mb-3" />
                <p className="text-xs font-bold text-white/20">Sin mensajes aún</p>
                <p className="text-[10px] text-white/15 mt-1">Escribe para iniciar una conversación con {businessName}</p>
              </div>
            )}
            {msgs.map((m) => {
              const isMe = m.sender === 'client';
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-br-md'
                      : 'bg-white/[0.06] text-white/80 rounded-bl-md'
                  }`}>
                    {!isMe && (
                      <p className="text-[8px] font-black uppercase tracking-widest text-indigo-400/60 mb-0.5">{m.senderName}</p>
                    )}
                    <p className="text-xs leading-relaxed">{m.text}</p>
                    <p className={`text-[8px] mt-1 ${isMe ? 'text-white/40' : 'text-white/20'}`}>
                      {new Date(m.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          {/* Input */}
          <div className="border-t border-white/[0.07] p-3 flex gap-2">
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMsg(); } }}
              placeholder="Escribe un mensaje..."
              className="flex-1 px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs text-white placeholder:text-white/20 outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <button
              onClick={handleSendMsg}
              disabled={!chatText.trim() || chatSending}
              className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 disabled:opacity-30 transition-all active:scale-90 shrink-0"
            >
              {chatSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* Contact info */}
      {tab !== 'chat' && (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-5 shadow-lg">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">
            ¿Necesitas más ayuda?
          </h3>
          <p className="text-xs text-white/50 leading-relaxed mb-4">
            Si tu duda no fue resuelta, usa el <button onClick={() => setTab('chat')} className="text-indigo-400 font-black hover:underline">chat</button> para contactar al administrador de <span className="text-white/80 font-black">{businessName}</span>.
          </p>
        </div>
      )}
    </div>
  );
}
