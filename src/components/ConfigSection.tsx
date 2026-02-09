import React, { useState } from 'react';
import { AppConfig, AuditLog, User } from '../../types';
import {
  Building,
  Users,
  Palette,
  Settings,
  Shield,
  Image,
  Trash,
  Save,
  Moon,
  Sun,
  Bell,
} from 'lucide-react';

interface ConfigSectionProps {
  config: AppConfig;
  onUpdateConfig: (newConfig: AppConfig) => void;
  onResetData: () => void;
  auditLogs: AuditLog[];
  userRole: string;
}

const ConfigSection: React.FC<ConfigSectionProps> = ({
  config,
  onUpdateConfig,
  onResetData,
  auditLogs,
  userRole,
}) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [activeTab, setActiveTab] = useState<
    'EMPRESA' | 'USUARIOS' | 'PERSONALIZACION' | 'SISTEMA' | 'AUDITORIA'
  >('EMPRESA');

  // New User State
  const [newUser, setNewUser] = useState<User>({ username: '', name: '', role: 'employee' });

  const handleSave = () => {
    // 1. Enviamos al padre
    onUpdateConfig(localConfig);

    // 2. GUARDAMOS EN MEMORIA DEL NAVEGADOR
    localStorage.setItem('theme_color', localConfig.theme.primaryColor);
    if (localConfig.theme.darkMode) {
      localStorage.setItem('theme_mode', 'dark');
    } else {
      localStorage.setItem('theme_mode', 'light');
    }

    // Guardar modo de dispositivo
    if (localConfig.theme.deviceMode) {
      localStorage.setItem('device_mode', localConfig.theme.deviceMode);
      try {
        document.documentElement.setAttribute('data-device', localConfig.theme.deviceMode);
      } catch (e) {}
    }

    alert('✅ Configuración guardada correctamente.');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalConfig({ ...localConfig, companyLogo: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddUser = () => {
    if (!newUser.username || !newUser.name) return;
    const currentUsers = localConfig.authorizedUsers || [];
    setLocalConfig({ ...localConfig, authorizedUsers: [...currentUsers, newUser] });
    setNewUser({ username: '', name: '', role: 'employee' });
  };

  const removeUser = (username: string) => {
    const currentUsers = localConfig.authorizedUsers || [];
    setLocalConfig({
      ...localConfig,
      authorizedUsers: currentUsers.filter((u) => u.username !== username),
    });
  };

  // Clases comunes para inputs
  const inputClass =
    'w-full p-4 rounded-xl font-bold outline-none bg-slate-50 border border-slate-200 text-slate-800 dark:bg-slate-900 dark:border-slate-700 dark:text-white transition-colors focus:ring-2 focus:ring-indigo-500';
  const labelClass = 'text-xs font-black text-slate-400 uppercase ml-1 mb-1 block';

  return (
    <div className="space-y-6 animate-in fade-in h-full flex flex-col pb-20">
      {/* HEADER TIPO TARJETA */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 transition-colors">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight italic uppercase">
            Centro de Control
          </h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Ajustes del Sistema y Seguridad
          </p>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex flex-wrap justify-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl gap-1">
          {[
            { id: 'EMPRESA', icon: Building, label: 'Empresa' },
            { id: 'USUARIOS', icon: Users, label: 'Usuarios' },
            { id: 'PERSONALIZACION', icon: Palette, label: 'Estilo' },
            { id: 'SISTEMA', icon: Settings, label: 'Sistema' },
            { id: 'AUDITORIA', icon: Shield, label: 'Auditoría' },
          ].map((tab) =>
            tab.id === 'AUDITORIA' && userRole !== 'admin' ? null : (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                // 👇 ESTILO DINÁMICO PARA EL TEXTO ACTIVO
                style={{ color: activeTab === tab.id ? localConfig.theme.primaryColor : '' }}
                className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-700 shadow-sm' // Quitamos el text-indigo-600 fijo
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
              >
                <tab.icon size={14} /> <span className="hidden md:inline">{tab.label}</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="flex-1 bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-700 p-8 overflow-y-auto custom-scroll transition-colors relative">
        {/* --- TAB: EMPRESA --- */}
        {activeTab === 'EMPRESA' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in zoom-in-95 duration-300">
            <div className="text-center">
              <div className="w-32 h-32 bg-slate-50 dark:bg-slate-700 rounded-full mx-auto mb-4 flex items-center justify-center border-4 border-slate-200 dark:border-slate-600 overflow-hidden relative group shadow-inner">
                {localConfig.companyLogo ? (
                  <img src={localConfig.companyLogo} className="w-full h-full object-cover" />
                ) : (
                  <Image className="text-slate-300 dark:text-slate-500" size={48} />
                )}
                <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm">
                  <span className="text-white text-xs font-bold flex flex-col items-center gap-1">
                    <Image size={16} /> Cambiar
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleLogoUpload}
                  />
                </label>
              </div>
              <p className="text-xs font-bold text-slate-400">Logo de la Empresa</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nombre Comercial</label>
                <input
                  className={inputClass}
                  value={localConfig.companyName}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, companyName: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>RIF / Identificación Fiscal</label>
                <input
                  className={inputClass}
                  value={localConfig.companyRif || ''}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, companyRif: e.target.value.toUpperCase() })
                  }
                  placeholder="J-12345678-9"
                />
              </div>
              <div>
                <label className={labelClass}>Mensaje en Recibos</label>
                <input
                  className={inputClass}
                  value={localConfig.receiptMessage || ''}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, receiptMessage: e.target.value })
                  }
                  placeholder="¡Gracias por su compra!"
                />
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: USUARIOS --- */}
        {activeTab === 'USUARIOS' && (
          <div className="max-w-3xl mx-auto animate-in zoom-in-95 duration-300">
            <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-2xl mb-8 flex flex-col md:flex-row gap-4 items-end border border-slate-200 dark:border-slate-700">
              <div className="flex-1 w-full">
                <label className={labelClass}>Usuario (Login)</label>
                <input
                  className={inputClass}
                  placeholder="ej: juan"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                />
              </div>
              <div className="flex-1 w-full">
                <label className={labelClass}>Nombre Visible</label>
                <input
                  className={inputClass}
                  placeholder="Juan Perez"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                />
              </div>
              <div className="w-full md:w-32">
                <label className={labelClass}>Rol</label>
                <select
                  className={inputClass}
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })}
                >
                  <option value="employee">Vendedor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                onClick={handleAddUser}
                className="w-full md:w-auto px-6 py-4 bg-indigo-600 text-slate-50 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30"
              >
                Agregar
              </button>
            </div>

            <div className="space-y-2">
              {localConfig.authorizedUsers?.map((u, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center p-4 bg-white dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center font-bold text-slate-600 dark:text-slate-200 uppercase">
                      {u.username.substring(0, 2)}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-white">{u.name}</p>
                      <p className="text-xs text-slate-400">
                        @{u.username} •{' '}
                        <span className="uppercase text-[10px] font-black bg-slate-100 dark:bg-slate-800 px-1 rounded">
                          {u.role}
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeUser(u.username)}
                    className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 p-2 rounded-lg transition-colors"
                  >
                    <Trash size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- TAB: PERSONALIZACION --- */}
        {activeTab === 'PERSONALIZACION' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto animate-in zoom-in-95 duration-300">
            <div className="p-6 border border-slate-200 dark:border-slate-700 rounded-[2rem] bg-white dark:bg-slate-900 shadow-sm transition-colors">
              <h3 className="font-bold mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                <Moon size={20} /> Modo de Visualización
              </h3>
              <button
                onClick={() => {
                  const updated = {
                    ...localConfig,
                    theme: { ...localConfig.theme, darkMode: !localConfig.theme.darkMode },
                  };
                  setLocalConfig(updated);
                  onUpdateConfig(updated);
                }}
                // 👇 BORDE DINÁMICO CUANDO ESTÁ ACTIVO
                style={{
                  borderColor: localConfig.theme.darkMode ? localConfig.theme.primaryColor : '',
                }}
                className={`w-full p-5 rounded-2xl border-2 flex justify-between items-center transition-all ${
                  localConfig.theme.darkMode
                    ? 'bg-slate-800 text-white' // Quitamos border-indigo-500 fijo
                    : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-indigo-300'
                }`}
              >
                <span className="text-xs font-black uppercase tracking-widest">Modo Oscuro</span>
                <span className="text-xl flex items-center gap-2 font-black">
                  {localConfig.theme.darkMode ? 'ON' : 'OFF'}
                  {localConfig.theme.darkMode ? (
                    <Moon className="fill-current text-indigo-400" />
                  ) : (
                    <Sun className="text-amber-500" />
                  )}
                </span>
              </button>
            </div>
            <div className="p-6 border border-slate-200 dark:border-slate-700 rounded-[2rem] bg-white dark:bg-slate-900 shadow-sm transition-colors">
              <h3 className="font-bold mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                <Palette size={20} /> Color Principal
              </h3>
              <div className="flex gap-4 justify-center">
                {['#714B67', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'].map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      // A. Actualizamos estado
                      setLocalConfig({
                        ...localConfig,
                        theme: { ...localConfig.theme, primaryColor: color },
                      });
                      // B. PINTAMOS YA MISMO
                      document.documentElement.style.setProperty('--odoo-primary', color);
                    }}
                    className={`w-12 h-12 rounded-full border-4 transition-transform cursor-pointer hover:scale-110 ${
                      localConfig.theme.primaryColor === color
                        ? 'border-slate-300 dark:border-white scale-110 shadow-lg'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="p-6 border border-slate-200 dark:border-slate-700 rounded-[2rem] bg-white dark:bg-slate-900 shadow-sm transition-colors">
              <h3 className="font-bold mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                Modo de Dispositivo
              </h3>
              <div className="flex gap-3 justify-center">
                {(['pc', 'tablet', 'mobile'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setLocalConfig({
                        ...localConfig,
                        theme: { ...localConfig.theme, deviceMode: mode as any },
                      });
                      document.documentElement.setAttribute('data-device', mode);
                    }}
                    className={`px-4 py-3 rounded-2xl font-black text-sm transition-transform ${
                      localConfig.theme.deviceMode === mode ? 'scale-105 shadow-lg' : 'opacity-80'
                    }`}
                    style={{
                      border:
                        localConfig.theme.deviceMode === mode
                          ? `3px solid ${localConfig.theme.primaryColor}`
                          : '',
                    }}
                  >
                    {mode === 'pc' ? 'PC' : mode === 'tablet' ? 'Tablet' : 'Móvil'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: SISTEMA --- */}
        {activeTab === 'SISTEMA' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in zoom-in-95 duration-300">
            <div className="p-6 bg-rose-50 dark:bg-rose-900/20 rounded-[2rem] border border-rose-100 dark:border-rose-900/50">
              <h3 className="font-bold text-rose-800 dark:text-rose-400 mb-2 flex items-center gap-2">
                <Bell size={20} /> Alertas de Cobranza
              </h3>
              <p className="text-xs text-rose-600 dark:text-rose-300/70 mb-6">
                El sistema notificará cuando una deuda supere estos días sin movimiento.
              </p>
              <div className="flex items-center gap-6">
                <input
                  type="range"
                  min="7"
                  max="60"
                  value={localConfig.system?.alertThreshold || 15}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      system: { ...localConfig.system, alertThreshold: parseInt(e.target.value) },
                    })
                  }
                  className="flex-1 accent-rose-600 h-2 bg-rose-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="font-black text-rose-800 dark:text-rose-400 text-2xl w-24 text-center">
                  {localConfig.system?.alertThreshold || 15}{' '}
                  <span className="text-xs align-top">días</span>
                </span>
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border border-slate-200 dark:border-slate-700 text-center">
              <button
                onClick={() => {
                  if (confirm('¿Seguro? Se perderán todos los datos locales.')) onResetData();
                }}
                className="text-[10px] font-black text-rose-600 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 px-8 py-4 rounded-xl uppercase hover:bg-rose-600 hover:text-slate-50 transition-all shadow-sm"
              >
                ⚠️ Factory Reset (Borrar Todo)
              </button>
            </div>
          </div>
        )}

        {/* --- TAB: AUDITORIA --- */}
        {activeTab === 'AUDITORIA' && (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-300">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-400 font-bold uppercase sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Usuario</th>
                  <th className="px-6 py-4">Acción</th>
                  <th className="px-6 py-4">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                {auditLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <td className="px-6 py-3 font-mono text-slate-500 dark:text-slate-400">
                      {new Date(log.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 font-bold text-indigo-600 dark:text-indigo-400">
                      {log.user}
                    </td>
                    <td className="px-6 py-3 font-bold uppercase text-slate-700 dark:text-slate-300">
                      {log.action}
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-400">{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4 sticky bottom-0 z-20">
        <button
          onClick={handleSave}
          // 👇 AQUÍ ESTÁ LA MAGIA: El botón toma el color que elegiste
          style={{ backgroundColor: localConfig.theme.primaryColor }}
          className="flex items-center gap-2 px-10 py-4 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 transition-all"
        >
          <Save size={18} /> Guardar Configuración
        </button>
      </div>
    </div>
  );
};

export default ConfigSection;
