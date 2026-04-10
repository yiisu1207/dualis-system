import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { usePortal } from './PortalGuard';

interface ChatMsg {
  id: string;
  text: string;
  sender: 'client' | 'business';
  senderName: string;
  createdAt: string;
}

export default function PortalChat() {
  const { businessId, customerId, customerName, businessName } = usePortal();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Real-time messages listener
  useEffect(() => {
    if (!businessId || !customerId) return;
    const q = query(
      collection(db, `businesses/${businessId}/portalChat/${customerId}/messages`),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMsg)));
      setLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, () => setLoading(false));
    return unsub;
  }, [businessId, customerId]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, `businesses/${businessId}/portalChat/${customerId}/messages`), {
        text: text.trim(),
        sender: 'client',
        senderName: customerName,
        createdAt: new Date().toISOString(),
      });
      setText('');
    } catch (err) {
      console.error('Chat send error:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-h-[700px] bg-[#0d1424] rounded-2xl border border-white/[0.07] overflow-hidden animate-in">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-white/[0.07] flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
          <MessageCircle size={16} className="text-indigo-400" />
        </div>
        <div>
          <h2 className="text-sm font-black text-white/90">Chat</h2>
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
            {businessName || 'Soporte'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={22} className="animate-spin text-white/20" />
          </div>
        ) : msgs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                <MessageCircle size={28} className="text-indigo-400/60" />
              </div>
              <p className="text-sm font-bold text-white/50 mb-1">
                Envía un mensaje al equipo de {businessName || 'soporte'}
              </p>
              <p className="text-[10px] text-white/25">
                Te responderán lo antes posible
              </p>
            </div>
          </div>
        ) : (
          msgs.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 ${
                msg.sender === 'client'
                  ? 'bg-indigo-600/25 text-indigo-100 border border-indigo-500/20'
                  : 'bg-white/[0.07] text-white/80 border border-white/[0.07]'
              }`}>
                <div className="text-[9px] font-black uppercase tracking-wider mb-0.5 opacity-40">
                  {msg.senderName}
                </div>
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                <div className="text-[8px] opacity-25 mt-1 text-right">
                  {new Date(msg.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="flex-none px-4 py-3 border-t border-white/[0.07]">
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-indigo-500/40 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="px-4 py-3 bg-indigo-600/30 text-indigo-300 rounded-xl hover:bg-indigo-600/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
