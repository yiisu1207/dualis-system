import React, { useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { usePortal } from './PortalGuard';
import {
  LayoutDashboard, FileText, Zap, CreditCard, Receipt, LogOut,
  Menu, X, HelpCircle, Package, Trophy, ShoppingBag, AlertTriangle,
  MoreHorizontal, MessageCircle,
} from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

export default function PortalLayout({ children }: Props) {
  const { slug } = useParams<{ slug: string }>();
  const { customerName, businessName, businessLogo, brandColor } = usePortal();
  const [mobileNav, setMobileNav] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Convert hex to RGB for CSS variable
  const brandRgb = brandColor ? (() => {
    const hex = brandColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return isNaN(r) ? null : `${r} ${g} ${b}`;
  })() : null;

  const basePath = `/portal/${slug}`;

  const mainNavItems = [
    { to: basePath, label: 'Inicio', icon: LayoutDashboard, end: true },
    { to: `${basePath}/facturas`, label: 'Movimientos', icon: FileText },
    { to: `${basePath}/pronto-pago`, label: 'Pronto Pago', icon: Zap },
    { to: `${basePath}/pagar`, label: 'Pagar', icon: CreditCard },
    { to: `${basePath}/catalogo`, label: 'Catálogo', icon: Package },
    { to: `${basePath}/fidelidad`, label: 'Fidelidad', icon: Trophy },
    { to: `${basePath}/estado-cuenta`, label: 'Estado', icon: Receipt },
  ];

  const moreNavItems: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[] = [
    { to: `${basePath}/chat`, label: 'Chat', icon: MessageCircle },
    { to: `${basePath}/pedidos`, label: 'Pedidos', icon: ShoppingBag },
    { to: `${basePath}/reclamo`, label: 'Reclamo', icon: AlertTriangle },
    { to: `${basePath}/ayuda`, label: 'Ayuda', icon: HelpCircle },
  ];

  const allNavItems = [
    ...mainNavItems,
    ...moreNavItems,
  ];

  const handleLogout = () => {
    localStorage.removeItem(`portal_session_${slug}`);
    window.location.reload();
  };

  return (
    <div
      className="min-h-screen bg-[#070b14] text-white pb-[68px] md:pb-0"
      style={brandRgb ? { '--portal-brand': brandRgb } as React.CSSProperties : undefined}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0d1424]/90 backdrop-blur-xl border-b border-white/[0.07]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {businessLogo ? (
              <img src={businessLogo} alt="" className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover" />
            ) : (
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-xs sm:text-sm font-black"
                style={brandColor ? { background: brandColor } : undefined}
              >
                <span className={!brandColor ? 'bg-gradient-to-br from-indigo-500 to-violet-600 w-full h-full rounded-xl flex items-center justify-center' : ''}>
                  {(businessName || 'P').charAt(0)}
                </span>
              </div>
            )}
            <div>
              <p className="text-xs sm:text-sm font-black text-white truncate max-w-[120px] sm:max-w-none">
                {businessName || 'Portal'}
              </p>
              <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-white/40 hidden sm:block">
                Portal de Cliente
              </p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {allNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${
                    isActive
                      ? 'text-white shadow-md' + (brandColor ? '' : ' bg-gradient-to-r from-indigo-600 to-violet-600 shadow-indigo-500/25')
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  }`
                }
                style={({ isActive }) => isActive && brandColor ? { backgroundColor: brandColor, boxShadow: `0 4px 14px ${brandColor}40` } : undefined}
              >
                <item.icon size={13} /> {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-black text-white/80 truncate max-w-[140px]">{customerName}</p>
              <p className="text-[9px] font-bold text-white/30 uppercase">Cliente</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-rose-500/20 text-white/40 hover:text-rose-400 flex items-center justify-center transition-all"
              title="Cerrar sesión"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {children}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0d1424]/95 backdrop-blur-xl border-t border-white/[0.07] safe-area-bottom">
        <div className="flex items-center justify-around px-1 py-1.5">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[52px] transition-all ${
                  isActive
                    ? 'text-indigo-400'
                    : 'text-white/30 active:text-white/50'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`p-1.5 rounded-lg transition-all ${isActive ? 'bg-indigo-500/15' : ''}`}>
                    <item.icon size={18} />
                  </div>
                  <span className="text-[8px] font-black uppercase tracking-wider">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[52px] transition-all text-white/30 active:text-white/50"
          >
            <div className="p-1.5 rounded-lg transition-all">
              <MoreHorizontal size={18} />
            </div>
            <span className="text-[8px] font-black uppercase tracking-wider">Más</span>
          </button>
        </div>
      </nav>

      {/* Mobile "Más" sheet */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full bg-[#0d1424] border-t border-white/[0.07] rounded-t-3xl p-4 pb-8 safe-area-bottom"
          >
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <div className="grid grid-cols-4 gap-2">
              {moreNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
                      isActive
                        ? 'bg-indigo-500/15 text-indigo-400'
                        : 'bg-white/[0.04] text-white/60 active:bg-white/[0.08]'
                    }`
                  }
                >
                  <item.icon size={22} />
                  <span className="text-[9px] font-black uppercase tracking-wider text-center">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
