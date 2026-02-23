import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  limitToLast,
} from 'firebase/firestore';
import FloatingWidgetShell from './FloatingWidgetShell';
import { db, storage } from '../firebase/config';
import { Customer, ExchangeRates, Movement } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { useWidgetManager } from '../context/WidgetContext';
import { useAuth } from '../context/AuthContext';

type WidgetPosition = {
  x: number;
  y: number;
};

type ChatUser = {
  id?: string;
  uid?: string;
  fullName?: string;
  email?: string;
  role?: string;
  jobTitle?: string;
  photoURL?: string;
  photoUrl?: string;
  avatarUrl?: string;
  lastActiveAt?: any;
};

type Conversation = {
  id: string;
  type: 'channel' | 'dm';
  name?: string;
  participants?: string[];
  dmKey?: string;
  createdAt?: any;
  lastMessageAt?: any;
  lastMessageText?: string;
};

type MessageAttachment = {
  type: 'customer';
  customerId: string;
  label?: string;
};

type MessageReply = {
  messageId: string;
  senderName?: string;
  text?: string;
};

type Message = {
  id: string;
  text?: string;
  senderId: string;
  senderName?: string;
  createdAt?: any;
  attachment?: MessageAttachment;
  replyTo?: MessageReply;
};

type TypingState = {
  uid: string;
  name?: string;
  updatedAt?: any;
  isTyping?: boolean;
};

interface TeamChatWidgetProps {
  businessId?: string;
  currentUserId?: string;
  currentUserName?: string;
  users?: ChatUser[];
  customers?: Customer[];
  movements?: Movement[];
  rates?: ExchangeRates;
  onOpenCustomer?: (customerId: string) => void;
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
  onClose: () => void;
  onMinimize: () => void;
  onPositionChange: (position: WidgetPosition) => void;
}

const EMOJIS = ['😀', '😅', '😍', '😎', '🤝', '✅', '⚡', '🔥', '📌', '💡', '📎', '🚀'];
const TYPING_IDLE_MS = 2500;
const TYPING_ACTIVE_WINDOW_MS = 5000;
const ONLINE_WINDOW_MS = 120000;

const resolveTimestamp = (value?: any) => {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const getDisplayTime = (value?: any) => {
  const time = resolveTimestamp(value);
  if (!time) return '';
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getInitials = (value: string) => {
  const cleaned = value.trim();
  if (!cleaned) return '??';
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const stringToHue = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
};

const TeamChatWidget: React.FC<TeamChatWidgetProps> = ({
  businessId,
  currentUserId,
  currentUserName,
  users = [],
  customers = [],
  movements = [],
  rates,
  onOpenCustomer,
  isOpen,
  isMinimized,
  position,
  onClose,
  onMinimize,
  onPositionChange,
}) => {
  const { updateUserProfile } = useAuth();
  const widgetManager = useWidgetManager();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
  const [attachmentSearch, setAttachmentSearch] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [replyDraft, setReplyDraft] = useState<MessageReply | null>(null);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [showDmPicker, setShowDmPicker] = useState(false);
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<TypingState[]>([]);
  const [readMap, setReadMap] = useState<Record<string, number>>({});
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileTitle, setProfileTitle] = useState('');
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileUploadProgress, setProfileUploadProgress] = useState<number | null>(null);
  const [currentUserOverride, setCurrentUserOverride] = useState<ChatUser | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const lastReadSentRef = useRef(0);

  const lastSeenKey = useMemo(() => {
    if (!businessId || !currentUserId) return '';
    return `chat_read_${businessId}_${currentUserId}`;
  }, [businessId, currentUserId]);

  useEffect(() => {
    if (!lastSeenKey) return;
    try {
      const raw = localStorage.getItem(lastSeenKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      setLastSeen(parsed);
    } catch (err) {
      console.warn('Failed to read chat read state', err);
    }
  }, [lastSeenKey]);

  const persistLastSeen = (next: Record<string, number>) => {
    setLastSeen(next);
    if (lastSeenKey) {
      localStorage.setItem(lastSeenKey, JSON.stringify(next));
    }
  };

  const userMap = useMemo(() => {
    const map = new Map<string, ChatUser>();
    users.forEach((user) => {
      const key = user.uid || user.id || '';
      if (key) map.set(key, user);
    });
    return map;
  }, [users]);

  const currentUser = useMemo(() => {
    if (currentUserOverride) return currentUserOverride;
    if (!currentUserId) return undefined;
    return userMap.get(currentUserId);
  }, [currentUserOverride, currentUserId, userMap]);

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((customer) => map.set(customer.id, customer));
    return map;
  }, [customers]);

  useEffect(() => {
    if (!showProfileModal) return;
    const profileSource = currentUser;
    setProfileName(profileSource?.fullName || currentUserName || '');
    setProfileTitle((profileSource as ChatUser | undefined)?.jobTitle || '');
    setProfilePhotoPreview(getAvatarUrl(profileSource));
    setProfilePhotoFile(null);
    setProfileUploadProgress(null);
  }, [showProfileModal, currentUser, currentUserName]);

  useEffect(() => {
    if (!profilePhotoPreview.startsWith('blob:')) return undefined;
    return () => URL.revokeObjectURL(profilePhotoPreview);
  }, [profilePhotoPreview]);

  const activeConversation = conversations.find((conv) => conv.id === activeConversationId);
  const isChannel = activeConversation?.type === 'channel';
  const activeParticipants = activeConversation?.participants || [];
  const dmOtherId = useMemo(() => {
    if (activeConversation?.type !== 'dm') return '';
    return activeParticipants.find((id) => id !== currentUserId) || '';
  }, [activeConversation, activeParticipants, currentUserId]);

  const resolveCustomerBalance = (customerId: string) => {
    const related = movements.filter(
      (movement) => movement.entityId === customerId && !movement.isSupplierMovement
    );
    const invoices = related.filter((m) => m.movementType === 'FACTURA');
    const payments = related.filter((m) => m.movementType === 'ABONO');
    const totalInvoices = invoices.reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
    const totalPayments = payments.reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
    return totalInvoices - totalPayments;
  };

  const getAvatarUrl = (user?: ChatUser) => {
    return user?.photoURL || user?.photoUrl || user?.avatarUrl || '';
  };

  const getDisplayName = (user?: ChatUser, fallback?: string) => {
    return user?.fullName || user?.email || fallback || 'Usuario';
  };

  const isUserOnline = (user?: ChatUser) => {
    const lastActive = resolveTimestamp(user?.lastActiveAt);
    if (!lastActive) return false;
    return Date.now() - lastActive < ONLINE_WINDOW_MS;
  };

  const renderAvatar = (user?: ChatUser, fallbackLabel?: string, showOnline?: boolean) => {
    const label = getDisplayName(user, fallbackLabel);
    const initials = getInitials(label);
    const hue = stringToHue(label);
    const avatarUrl = getAvatarUrl(user);
    const online = showOnline && isUserOnline(user);

    return (
      <div className="relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={label}
            className="w-8 h-8 rounded-full object-cover border border-white shadow"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white"
            style={{ backgroundColor: `hsl(${hue} 60% 45%)` }}
          >
            {initials}
          </div>
        )}
        {online && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white"></span>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (!businessId || !currentUserId) return;

    const convRef = collection(db, 'businesses', businessId, 'conversations');
    const convQuery = query(convRef, orderBy('lastMessageAt', 'desc'));
    const unsubscribe = onSnapshot(convQuery, (snapshot) => {
      const next = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<Conversation, 'id'>;
        return { id: docSnap.id, ...data } as Conversation;
      });
      setConversations(next);

      if (!activeConversationId && next.length > 0) {
        setActiveConversationId(next[0].id);
      }
    });

    return () => unsubscribe();
  }, [businessId, currentUserId, activeConversationId]);

  useEffect(() => {
    if (!businessId || !currentUserId) return;
    const ensureGeneral = async () => {
      const convRef = collection(db, 'businesses', businessId, 'conversations');
      const existing = await getDocs(
        query(convRef, where('type', '==', 'channel'), where('name', '==', 'General'))
      );
      if (!existing.empty) return;
      await addDoc(convRef, {
        type: 'channel',
        name: 'General',
        participants: ['ALL'],
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessageText: 'Canal general creado',
        createdBy: currentUserId,
      });
    };

    ensureGeneral();
  }, [businessId, currentUserId]);

  useEffect(() => {
    if (!businessId || !activeConversationId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    setMessages([]);
    setLoadingMessages(true);
    setChatError(null);
    const msgRef = collection(
      db,
      'businesses',
      businessId,
      'conversations',
      activeConversationId,
      'messages'
    );
    const msgQuery = query(msgRef, orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(
      msgQuery,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<Message, 'id'>;
          return { id: docSnap.id, ...data } as Message;
        });
        setMessages(next);
        setLoadingMessages(false);
      },
      (error) => {
        console.error('Chat snapshot error', error);
        setChatError('No se pudo cargar el historial del chat.');
        setLoadingMessages(false);
      }
    );

    return () => unsubscribe();
  }, [businessId, activeConversationId]);

  useEffect(() => {
    if (!businessId || !activeConversationId) return;
    const typingRef = collection(
      db,
      'businesses',
      businessId,
      'conversations',
      activeConversationId,
      'typing'
    );
    const unsubscribe = onSnapshot(typingRef, (snapshot) => {
      const next = snapshot.docs
        .map((docSnap) => docSnap.data() as TypingState)
        .filter((entry) => entry.uid && entry.uid !== currentUserId)
        .filter((entry) => {
          if (!entry.isTyping) return false;
          const ts = resolveTimestamp(entry.updatedAt);
          return ts > Date.now() - TYPING_ACTIVE_WINDOW_MS;
        });
      setTypingUsers(next);
    });

    return () => unsubscribe();
  }, [businessId, activeConversationId, currentUserId]);

  useEffect(() => {
    if (!businessId || !activeConversationId) return;
    const readRef = collection(
      db,
      'businesses',
      businessId,
      'conversations',
      activeConversationId,
      'reads'
    );
    const unsubscribe = onSnapshot(readRef, (snapshot) => {
      const next: Record<string, number> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as { lastReadAt?: any };
        next[docSnap.id] = resolveTimestamp(data.lastReadAt);
      });
      setReadMap(next);
    });

    return () => unsubscribe();
  }, [businessId, activeConversationId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    if (!isOpen || isMinimized) return;
    const active = conversations.find((conv) => conv.id === activeConversationId);
    if (!active) return;
    const latest = resolveTimestamp(active.lastMessageAt);
    if (!latest) return;
    if ((lastSeen[activeConversationId] || 0) < latest) {
      const next = { ...lastSeen, [activeConversationId]: latest };
      persistLastSeen(next);
    }
  }, [activeConversationId, conversations, isOpen, isMinimized, lastSeen]);

  useEffect(() => {
    const totalUnread = conversations.reduce((sum, conv) => {
      const latest = resolveTimestamp(conv.lastMessageAt);
      if (!latest) return sum;
      const seen = lastSeen[conv.id] || 0;
      if (latest > seen) return sum + 1;
      return sum;
    }, 0);
    widgetManager.setUnreadCount('chat', totalUnread);
  }, [conversations, lastSeen, widgetManager]);

  useEffect(() => {
    if (!businessId || !activeConversationId || !currentUserId) return;
    if (!isOpen || isMinimized) return;
    const now = Date.now();
    if (now - lastReadSentRef.current < 1000) return;
    lastReadSentRef.current = now;
    const readDoc = doc(
      db,
      'businesses',
      businessId,
      'conversations',
      activeConversationId,
      'reads',
      currentUserId
    );
    setDoc(
      readDoc,
      {
        uid: currentUserId,
        name: currentUserName || 'Usuario',
        lastReadAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [businessId, activeConversationId, currentUserId, currentUserName, messages, isOpen, isMinimized]);

  const dmConversations = useMemo(() => {
    return conversations.filter((conv) => conv.type === 'dm');
  }, [conversations]);

  const channelConversations = useMemo(() => {
    return conversations.filter((conv) => conv.type === 'channel');
  }, [conversations]);

  const filteredCustomers = useMemo(() => {
    const term = attachmentSearch.trim().toLowerCase();
    if (!term) return customers.slice(0, 6);
    return customers.filter((customer) => customer.id.toLowerCase().includes(term)).slice(0, 6);
  }, [attachmentSearch, customers]);

  const startDm = async (userId: string) => {
    if (!businessId || !currentUserId) return;
    const dmKey = [currentUserId, userId].sort().join('--');
    const existing = dmConversations.find((conv) => conv.dmKey === dmKey);
    if (existing) {
      setActiveConversationId(existing.id);
      setShowDmPicker(false);
      return;
    }
    const convRef = collection(db, 'businesses', businessId, 'conversations');
    const newDoc = await addDoc(convRef, {
      type: 'dm',
      dmKey,
      participants: [currentUserId, userId],
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageText: '',
      createdBy: currentUserId,
    });
    setActiveConversationId(newDoc.id);
    setShowDmPicker(false);
  };

  const createChannel = async () => {
    if (!businessId || !currentUserId) return;
    const trimmed = newChannelName.trim();
    if (!trimmed) return;
    const convRef = collection(db, 'businesses', businessId, 'conversations');
    await addDoc(convRef, {
      type: 'channel',
      name: trimmed,
      participants: ['ALL'],
      createdAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageText: 'Canal creado',
      createdBy: currentUserId,
    });
    setNewChannelName('');
    setCreatingChannel(false);
  };

  const updateTyping = async (isTyping: boolean) => {
    if (!businessId || !activeConversationId || !currentUserId) return;
    const typingDoc = doc(
      db,
      'businesses',
      businessId,
      'conversations',
      activeConversationId,
      'typing',
      currentUserId
    );
    await setDoc(
      typingDoc,
      {
        uid: currentUserId,
        name: currentUserName || 'Usuario',
        isTyping,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const touchTyping = () => {
    const now = Date.now();
    if (now - lastTypingSentRef.current > 900) {
      lastTypingSentRef.current = now;
      updateTyping(true);
    }
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      updateTyping(false);
    }, TYPING_IDLE_MS);
  };

  const handleProfilePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!storage) {
      alert('Storage deshabilitado temporalmente. No se pueden subir fotos.');
      return;
    }
    setProfilePhotoFile(file);
    const preview = URL.createObjectURL(file);
    setProfilePhotoPreview(preview);
  };

  const handleProfileSave = async () => {
    if (!currentUserId) return;
    setSavingProfile(true);
    try {
      let photoURL = getAvatarUrl(currentUser);
      if (profilePhotoFile) {
        alert('Storage deshabilitado temporalmente. No se puede guardar la foto.');
      }

      const nextName = profileName.trim() || currentUserName || 'Usuario';
      const nextTitle = profileTitle.trim();
      const updatePayload: Record<string, any> = {
        fullName: nextName,
        jobTitle: nextTitle,
      };
      if (photoURL) updatePayload.photoURL = photoURL;

      await updateDoc(doc(db, 'users', currentUserId), updatePayload);
      updateUserProfile({
        fullName: nextName,
        jobTitle: nextTitle,
        photoURL: updatePayload.photoURL,
      });
      setCurrentUserOverride({
        ...(currentUser || {}),
        uid: currentUserId,
        fullName: nextName,
        jobTitle: nextTitle,
        photoURL: updatePayload.photoURL,
      });
      setShowProfileModal(false);
    } catch (error) {
      console.error('No se pudo actualizar el perfil', error);
    } finally {
      setProfileUploadProgress(null);
      setSavingProfile(false);
    }
  };

  const handleSend = async () => {
    if (!businessId || !activeConversationId || !currentUserId) {
      setChatError('No se puede enviar mensajes sin un canal activo.');
      return;
    }
    const trimmed = input.trim();
    if (!trimmed && !pendingAttachment) return;

    const msgRef = collection(
      db,
      'businesses',
      businessId,
      'conversations',
      activeConversationId,
      'messages'
    );

    const payload: Omit<Message, 'id'> = {
      text: trimmed,
      senderId: currentUserId,
      senderName: currentUserName || 'Usuario',
      createdAt: serverTimestamp(),
    };
    if (pendingAttachment) payload.attachment = pendingAttachment;
    if (replyDraft) payload.replyTo = replyDraft;

    try {
      await addDoc(msgRef, payload);

      await updateDoc(doc(db, 'businesses', businessId, 'conversations', activeConversationId), {
        lastMessageAt: serverTimestamp(),
        lastMessageText: trimmed || pendingAttachment?.label || 'Adjunto',
      });

      setInput('');
      setPendingAttachment(null);
      setReplyDraft(null);
      updateTyping(false);
    } catch (error) {
      console.error('No se pudo enviar el mensaje', error);
      setChatError('No se pudo enviar el mensaje. Revisa permisos y conexion.');
    }
  };

  const handlePickAttachment = (customer: Customer) => {
    setPendingAttachment({
      type: 'customer',
      customerId: customer.id,
      label: customer.id,
    });
    setShowAttachmentPicker(false);
    setAttachmentSearch('');
  };

  const getConversationLabel = (conv: Conversation) => {
    if (conv.type === 'channel') return conv.name || 'Canal';
    const participants = conv.participants || [];
    const otherId = participants.find((id) => id !== currentUserId) || participants[0] || '';
    const other = userMap.get(otherId);
    return other?.fullName || other?.email || 'DM';
  };

  const getConversationSubtitle = (conv: Conversation) => {
    const text = conv.lastMessageText || '';
    return text.length > 0 ? text : 'Sin mensajes';
  };

  const typingLabel = useMemo(() => {
    if (typingUsers.length === 0) return '';
    const names = typingUsers.map((entry) => entry.name || 'Usuario');
    if (names.length === 1) return `${names[0]} esta escribiendo...`;
    if (names.length === 2) return `${names[0]} y ${names[1]} estan escribiendo...`;
    return 'Varias personas estan escribiendo...';
  }, [typingUsers]);

  const renderReadReceipt = (message: Message) => {
    if (activeConversation?.type !== 'dm') return null;
    if (message.senderId !== currentUserId) return null;
    if (!dmOtherId) return null;
    const otherReadAt = readMap[dmOtherId] || 0;
    const messageTime = resolveTimestamp(message.createdAt);
    const isRead = otherReadAt > 0 && messageTime > 0 && otherReadAt >= messageTime;
    return (
      <span className={`text-[10px] ${isRead ? 'text-sky-500' : 'text-slate-400'}`}>
        ✓✓
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <FloatingWidgetShell
      title="Team Chat"
      subtitle={activeConversation ? getConversationLabel(activeConversation) : 'Channels'}
      icon="fa-regular fa-comments"
      isOpen={isOpen}
      isMinimized={isMinimized}
      position={position}
      width={640}
      onClose={onClose}
      onMinimize={onMinimize}
      onPositionChange={onPositionChange}
    >
      {!businessId || !currentUserId ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Conecta tu workspace para activar el chat de equipo.
        </div>
      ) : (
        <div className="relative h-[520px]">
          <div className="flex h-full">
          <div className="w-56 border-r border-slate-200 dark:border-slate-800 pr-3 flex flex-col">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Channels</h4>
              <button
                type="button"
                onClick={() => setCreatingChannel((prev) => !prev)}
                className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-200 text-[10px]"
                title="Crear canal"
              >
                <i className="fa-solid fa-plus"></i>
              </button>
            </div>
            {creatingChannel && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(event) => setNewChannelName(event.target.value)}
                  placeholder="Nombre"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-700 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={createChannel}
                  className="px-2 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-black"
                >
                  OK
                </button>
              </div>
            )}
            <div className="mt-3 space-y-2 overflow-y-auto pr-1">
              {channelConversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                const unread = resolveTimestamp(conv.lastMessageAt) > (lastSeen[conv.id] || 0);
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setActiveConversationId(conv.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>#{conv.name || 'Canal'}</span>
                      {!isActive && unread && (
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      )}
                    </div>
                    <div
                      className={`text-[10px] ${
                        isActive ? 'text-slate-200' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {getConversationSubtitle(conv)}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <h4 className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">DMs</h4>
              <button
                type="button"
                onClick={() => setShowDmPicker((prev) => !prev)}
                className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-200 text-[10px]"
                title="Nuevo DM"
              >
                <i className="fa-solid fa-user-plus"></i>
              </button>
            </div>
            {showDmPicker && (
              <div className="mt-2 space-y-1">
                {users
                  .filter((user) => (user.uid || user.id) && (user.uid || user.id) !== currentUserId)
                  .slice(0, 6)
                  .map((user) => (
                    <button
                      key={user.uid || user.id}
                      type="button"
                      onClick={() => startDm(user.uid || user.id || '')}
                      className="w-full text-left text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200"
                    >
                      {user.fullName || user.email || 'Usuario'}
                    </button>
                  ))}
              </div>
            )}
            <div className="mt-3 space-y-2 overflow-y-auto pr-1">
              {dmConversations.map((conv) => {
                const label = getConversationLabel(conv);
                const isActive = conv.id === activeConversationId;
                const unread = resolveTimestamp(conv.lastMessageAt) > (lastSeen[conv.id] || 0);
                const otherId = (conv.participants || []).find((id) => id !== currentUserId) || '';
                const otherUser = userMap.get(otherId);
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setActiveConversationId(conv.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {renderAvatar(otherUser, label, true)}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span>{label}</span>
                          {!isActive && unread && (
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          )}
                        </div>
                        <div
                          className={`text-[10px] ${
                            isActive ? 'text-slate-200' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {getConversationSubtitle(conv)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 pl-4 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div>
                <div className="text-xs font-black text-slate-700 dark:text-slate-100">
                  {activeConversation ? getConversationLabel(activeConversation) : 'Selecciona'}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500">
                  {activeConversation ? getConversationSubtitle(activeConversation) : 'Sin conversacion'}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(true)}
                  className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  Mi perfil
                </button>
                <div className="text-[10px] text-slate-400 dark:text-slate-500">
                  {messages.length} mensajes
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-3">
              {chatError && (
                <div className="text-xs text-rose-600 dark:text-rose-300 font-semibold">
                  {chatError}
                </div>
              )}
              {loadingMessages && (
                <div className="text-xs text-slate-400 dark:text-slate-500">Cargando historial...</div>
              )}
              {messages.length === 0 && (
                <div className="text-xs text-slate-400 dark:text-slate-500">No hay mensajes en este canal.</div>
              )}
              {messages.map((msg) => {
                const isMine = msg.senderId === currentUserId;
                const sender = msg.senderId === currentUserId ? currentUser : userMap.get(msg.senderId);
                const customer = msg.attachment?.type === 'customer'
                  ? customerMap.get(msg.attachment.customerId)
                  : null;
                const senderLabel = isChannel
                  ? (isMine ? 'Tu' : msg.senderName || getDisplayName(sender))
                  : (isMine ? '' : msg.senderName || getDisplayName(sender));
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    {!isMine && (
                      <div className="mr-2 mt-5">{renderAvatar(sender, msg.senderName, true)}</div>
                    )}
                    <div className="max-w-[78%]">
                      {senderLabel && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">
                          {senderLabel}
                        </div>
                      )}
                      <div
                        className={`rounded-2xl px-4 py-3 text-xs shadow-sm border ${
                          isMine
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {msg.replyTo && (
                          <div className="mb-2 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400">
                            Respuesta a {msg.replyTo.senderName || 'Usuario'}: {msg.replyTo.text || ''}
                          </div>
                        )}
                        {msg.text && <div>{msg.text}</div>}
                        {customer && (
                          <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
                            <div className="text-[11px] font-black text-slate-600 dark:text-slate-300">Cliente</div>
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {customer.id}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">Tel: {customer.telefono}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">CI: {customer.cedula}</div>
                            <div className="mt-2 text-[10px] font-semibold text-emerald-600">
                              Balance {formatCurrency(resolveCustomerBalance(customer.id))}
                            </div>
                            {onOpenCustomer && (
                              <button
                                type="button"
                                onClick={() => onOpenCustomer(customer.id)}
                                className="mt-2 w-full rounded-lg bg-slate-900 text-white text-[10px] font-black py-1"
                              >
                                Ver cliente
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                        <span>{getDisplayTime(msg.createdAt)}</span>
                        {renderReadReceipt(msg)}
                        <button
                          type="button"
                          onClick={() =>
                            setReplyDraft({
                              messageId: msg.id,
                              senderName: msg.senderName,
                              text: msg.text,
                            })
                          }
                          className="hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          Responder
                        </button>
                      </div>
                    </div>
                    {isMine && (
                      <div className="ml-2 mt-5">{renderAvatar(currentUser, 'Tu', false)}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {typingLabel && (
              <div className="mb-2 text-[11px] text-slate-400">{typingLabel}</div>
            )}

            {replyDraft && (
              <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 flex items-center justify-between">
                <span>
                  Respondiendo a {replyDraft.senderName || 'Usuario'}: {replyDraft.text || ''}
                </span>
                <button
                  type="button"
                  onClick={() => setReplyDraft(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            )}

            {pendingAttachment && (
              <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Adjunto: {pendingAttachment.label}</span>
                <button
                  type="button"
                  onClick={() => setPendingAttachment(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            )}

            {showAttachmentPicker && (
              <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={attachmentSearch}
                    onChange={(event) => setAttachmentSearch(event.target.value)}
                    placeholder="Buscar cliente"
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAttachmentPicker(false)}
                    className="text-slate-400"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => handlePickAttachment(customer)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300"
                    >
                      <div className="text-xs font-semibold text-slate-700">{customer.id}</div>
                      <div className="text-[10px] text-slate-400">{customer.telefono}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showEmojiPicker && (
              <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="grid grid-cols-6 gap-2">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setInput((prev) => `${prev}${emoji}`);
                        setShowEmojiPicker(false);
                      }}
                      className="text-lg"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600"
                title="Emoji"
              >
                <i className="fa-regular fa-face-smile"></i>
              </button>
              <button
                type="button"
                onClick={() => setShowAttachmentPicker((prev) => !prev)}
                className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600"
                title="Adjuntar cliente"
              >
                <i className="fa-solid fa-paperclip"></i>
              </button>
              <input
                type="text"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  touchTyping();
                }}
                onBlur={() => updateTyping(false)}
                placeholder="Escribe un mensaje..."
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSend}
                className="w-10 h-10 rounded-xl bg-slate-900 text-white"
              >
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </div>
            </div>
          </div>

            {showProfileModal && (
              <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-black uppercase text-slate-500">Mi perfil</div>
                      <div className="text-[11px] text-slate-400">Personaliza tu identidad</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProfileModal(false)}
                      className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>

                  <div className="mt-4 flex flex-col items-center">
                    <input
                      ref={profileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProfilePhotoChange}
                    />
                    <button
                      type="button"
                      onClick={() => profileInputRef.current?.click()}
                      className="group relative"
                    >
                      {profilePhotoPreview ? (
                        <img
                          src={profilePhotoPreview}
                          alt="Avatar"
                          className="w-20 h-20 rounded-full object-cover border-2 border-white shadow"
                        />
                      ) : (
                        <div
                          className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-black text-white"
                          style={{ backgroundColor: `hsl(${stringToHue(profileName || currentUserName || 'Usuario')} 60% 45%)` }}
                        >
                          {getInitials(profileName || currentUserName || 'Usuario')}
                        </div>
                      )}
                      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 text-white text-[10px] font-black px-2 py-0.5">
                        Cambiar
                      </span>
                    </button>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400">Nombre para mostrar</label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                        placeholder="Ej: Ana Perez"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400">Cargo</label>
                      <input
                        type="text"
                        value={profileTitle}
                        onChange={(event) => setProfileTitle(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                        placeholder="Ej: Vendedor"
                      />
                    </div>
                    {profileUploadProgress !== null && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase">
                          <span>Subiendo foto</span>
                          <span>{profileUploadProgress}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${profileUploadProgress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowProfileModal(false)}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-500"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleProfileSave}
                      disabled={savingProfile || profileUploadProgress !== null}
                      className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-black disabled:opacity-70"
                    >
                      {savingProfile ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
      )}
    </FloatingWidgetShell>
  );
};

export default TeamChatWidget;
