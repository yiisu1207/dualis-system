import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MessageCircle, Send, Loader2, Users, ArrowLeft } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Customer } from '../../types';

interface ChatMsg {
  id: string;
  text: string;
  sender: 'client' | 'business';
  senderName: string;
  createdAt: string;
}

interface ChatThread {
  customerId: string;
  customerName: string;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
}

interface PortalChatAdminProps {
  businessId: string;
  businessName: string;
  userName: string;
  customers: Customer[];
}

export default function PortalChatAdmin({ businessId, businessName, userName, customers }: PortalChatAdminProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [chatText, setChatText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load thread list by scanning customers who have chat messages
  useEffect(() => {
    if (!businessId) return;
    // Listen for all portalChat subcollections — we scan customers to find threads
    const loadThreads = async () => {
      setLoading(true);
      const threadList: ChatThread[] = [];

      for (const cust of customers) {
        try {
          const q = query(
            collection(db, `businesses/${businessId}/portalChat/${cust.id}/messages`),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const lastDoc = snap.docs[0].data();
            threadList.push({
              customerId: cust.id,
              customerName: cust.nombre || cust.fullName || 'Sin nombre',
              lastMessage: lastDoc.text || '',
              lastAt: lastDoc.createdAt || '',
              unreadCount: lastDoc.sender === 'client' ? 1 : 0,
            });
          }
        } catch {
          // Skip customers without chat
        }
      }

      threadList.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
      setThreads(threadList);
      setLoading(false);
    };

    loadThreads();
  }, [businessId, customers]);

  // Load messages for selected customer
  useEffect(() => {
    if (!businessId || !selectedCustomerId) return;
    const q = query(
      collection(db, `businesses/${businessId}/portalChat/${selectedCustomerId}/messages`),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMsg)));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
  }, [businessId, selectedCustomerId]);

  const handleSend = async () => {
    if (!chatText.trim() || sending || !selectedCustomerId) return;
    setSending(true);
    try {
      await addDoc(collection(db, `businesses/${businessId}/portalChat/${selectedCustomerId}/messages`), {
        text: chatText.trim(),
        sender: 'business',
        senderName: userName || businessName,
        createdAt: new Date().toISOString(),
      });
      setChatText('');
    } catch (err) {
      console.error('Chat send error:', err);
    } finally {
      setSending(false);
    }
  };

  const selectedThread = threads.find(t => t.customerId === selectedCustomerId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Thread list */}
      <div className={`${selectedCustomerId ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-80 border-r border-white/5`}>
        <div className="flex-none px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-indigo-400" />
            <h2 className="text-sm font-black text-white/90">Chat del Portal</h2>
          </div>
          <p className="text-[10px] text-white/30 mt-0.5">{threads.length} conversación{threads.length !== 1 ? 'es' : ''}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-white/20" />
            </div>
          ) : threads.length === 0 ? (
            <div className="text-center py-10">
              <Users size={28} className="mx-auto text-white/15 mb-2" />
              <p className="text-xs text-white/30">No hay conversaciones</p>
              <p className="text-[10px] text-white/20 mt-1">Los clientes pueden iniciar chat desde el portal</p>
            </div>
          ) : (
            threads.map(thread => (
              <button
                key={thread.customerId}
                onClick={() => setSelectedCustomerId(thread.customerId)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 transition-all hover:bg-white/5 ${
                  selectedCustomerId === thread.customerId ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white/80 truncate">{thread.customerName}</span>
                  {thread.unreadCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-indigo-500 flex-none" />
                  )}
                </div>
                <p className="text-[10px] text-white/30 truncate mt-0.5">{thread.lastMessage}</p>
                {thread.lastAt && (
                  <p className="text-[9px] text-white/20 mt-0.5">
                    {new Date(thread.lastAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className={`${selectedCustomerId ? 'flex' : 'hidden lg:flex'} flex-col flex-1`}>
        {selectedCustomerId ? (
          <>
            {/* Chat header */}
            <div className="flex-none px-4 py-3 border-b border-white/5 flex items-center gap-3">
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="lg:hidden p-1 hover:bg-white/5 rounded-lg"
              >
                <ArrowLeft size={16} className="text-white/50" />
              </button>
              <div>
                <div className="text-xs font-bold text-white/80">{selectedThread?.customerName || 'Cliente'}</div>
                <div className="text-[9px] text-white/30">Chat del portal</div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {msgs.length === 0 ? (
                <p className="text-center text-[11px] text-white/20 py-10">No hay mensajes aún</p>
              ) : (
                msgs.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'business' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[75%] rounded-xl px-3 py-2 ${
                      msg.sender === 'business'
                        ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/20'
                        : 'bg-white/5 text-white/80 border border-white/10'
                    }`}>
                      <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5 opacity-50">
                        {msg.senderName}
                      </div>
                      <p className="text-xs leading-relaxed">{msg.text}</p>
                      <div className="text-[8px] opacity-30 mt-1 text-right">
                        {new Date(msg.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex-none px-4 py-3 border-t border-white/5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatText}
                  onChange={e => setChatText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Escribir mensaje..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50"
                />
                <button
                  onClick={handleSend}
                  disabled={!chatText.trim() || sending}
                  className="px-3 py-2.5 bg-indigo-500/20 text-indigo-300 rounded-xl hover:bg-indigo-500/30 disabled:opacity-30 transition-all"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <MessageCircle size={32} className="mx-auto text-white/10 mb-2" />
              <p className="text-xs text-white/30">Selecciona una conversación</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
