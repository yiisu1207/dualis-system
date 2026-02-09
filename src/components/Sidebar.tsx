import React from 'react';
import { User, AppConfig } from '../../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  user: User;
  config: AppConfig;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen,
  setIsOpen,
  user,
  config,
  onLogout,
}) => {
  const isDark = config.theme?.darkMode;
  const menuItems = [
    { id: 'resumen', label: 'Panorama Global', icon: 'fa-solid fa-chart-pie' },
    { id: 'clientes', label: 'Gestión Cobranzas', icon: 'fa-solid fa-folder-open' },
    { id: 'contabilidad', label: 'Libro Mayor', icon: 'fa-solid fa-scale-balanced' },
    { id: 'proveedores', label: 'Cuentas x Pagar', icon: 'fa-solid fa-file-invoice-dollar' },
    { id: 'nomina', label: 'Capital Humano', icon: 'fa-solid fa-users-gear' },
    { id: 'inventario', label: 'Activos / Stock', icon: 'fa-solid fa-boxes-stacked' },
    { id: 'vision', label: 'Vision Lab', icon: 'fa-solid fa-wand-magic-sparkles' },
    { id: 'config', label: 'Configuración', icon: 'fa-solid fa-gears' },
  ];

  // Logic to hide modules based on role
  const filteredItems = menuItems.filter((item) => {
    if (user.role !== 'admin') {
      if (item.id === 'config' || item.id === 'nomina' || item.id === 'vision') return false;
    }
    return true;
  });

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static top-0 left-0 h-full w-[260px] z-50 transition-transform lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } flex flex-col ${
          isDark
            ? 'bg-[#18181B] text-[#AAB0B9] border-r border-[#27272F]'
            : 'bg-white text-slate-600 border-r border-slate-200 shadow-sm'
        }`}
      >
        {/* APP BRAND */}
        <div
          className={`h-16 flex items-center px-6 border-b ${
            isDark ? 'bg-[#111827] border-[#27272F]' : 'bg-white border-slate-200'
          }`}
        >
          <div className="w-8 h-8 rounded-md flex items-center justify-center text-slate-50 mr-3 font-bold text-lg bg-gradient-to-tr from-purple-600 to-indigo-600">
            LA
          </div>
          <span
            className={`font-semibold text-lg tracking-tight ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}
          >
            Boutique Financial
          </span>
        </div>

        {/* MENU */}
        <nav className="flex-1 overflow-y-auto py-4">
          <p
            className={`px-6 text-xs font-bold uppercase tracking-wider mb-2 ${
              isDark ? 'text-[#6b7280]' : 'text-slate-400'
            }`}
          >
            Finanzas &amp; Control
          </p>
          <ul>
            {filteredItems.map((item) => (
              <li key={item.id} className="mb-0.5">
                <button
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium transition-colors border-l-4 ${
                    activeTab === item.id
                      ? isDark
                        ? 'bg-[#27272F] text-slate-50 border-purple-500'
                        : 'bg-slate-100 text-slate-900 border-purple-500'
                      : isDark
                      ? 'border-transparent hover:bg-[#1f2933] hover:text-slate-50'
                      : 'border-transparent hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <i className={`${item.icon} w-5 text-center`}></i>
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* USER PROFILE */}
        <div
          className={`p-4 border-t ${
            isDark ? 'border-[#27272F] bg-[#111827]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-slate-50 text-xs font-bold">
              {user.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p
                className={`text-sm font-medium truncate ${
                  isDark ? 'text-slate-50' : 'text-slate-900'
                }`}
              >
                {user.name}
              </p>
              <p className={`text-xs capitalize ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {user.role}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className={`w-full py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
              isDark
                ? 'bg-[#27272F] hover:bg-[#323645] text-slate-50'
                : 'bg-indigo-600 hover:bg-indigo-700 text-slate-50'
            }`}
          >
            <i className="fa-solid fa-right-from-bracket" /> Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
