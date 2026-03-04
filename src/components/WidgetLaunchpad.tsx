import React from 'react';
import { useWidgetManager } from '../context/WidgetContext';
import { 
  Calculator, 
  StickyNote, 
  RefreshCw, 
  Clock, 
  Search, 
  CheckSquare, 
  Zap, 
  MessageSquare,
  LayoutGrid
} from 'lucide-react';

const WIDGET_DEFS = [
  { 
    id: 'calculator', 
    name: 'Calculadora', 
    desc: 'Cálculos rápidos con conversión de tasa.', 
    icon: Calculator, 
    color: 'bg-indigo-500' 
  },
  { 
    id: 'notes', 
    name: 'Notas Adhesivas', 
    desc: 'Recordatorios rápidos para tu jornada.', 
    icon: StickyNote, 
    color: 'bg-amber-500' 
  },
  { 
    id: 'converter', 
    name: 'Conversor Divisas', 
    desc: 'Cambio instantáneo BCV vs Paralelo.', 
    icon: RefreshCw, 
    color: 'bg-emerald-500' 
  },
  { 
    id: 'timer', 
    name: 'Cronómetro', 
    desc: 'Control de tiempo para tareas críticas.', 
    icon: Clock, 
    color: 'bg-rose-500' 
  },
  { 
    id: 'priceChecker', 
    name: 'Verificador', 
    desc: 'Consulta precios de inventario al instante.', 
    icon: Search, 
    color: 'bg-sky-500' 
  },
  { 
    id: 'todo', 
    name: 'Lista de Tareas', 
    desc: 'Tu agenda operativa personal.', 
    icon: CheckSquare, 
    color: 'bg-violet-500' 
  },
  { 
    id: 'chat', 
    name: 'Chat de Equipo', 
    desc: 'Comunicación interna en tiempo real.', 
    icon: MessageSquare, 
    color: 'bg-blue-600' 
  },
  { 
    id: 'speedDial', 
    name: 'Acceso Rápido', 
    desc: 'Botones tácticos configurables.', 
    icon: Zap, 
    color: 'bg-orange-500' 
  },
];

export default function WidgetLaunchpad() {
  const { widgets, toggleWidget } = useWidgetManager();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800/50 p-8 pt-24 font-inter">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 animate-in fade-in slide-in-from-top-4 duration-700">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Tactical Control Center</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none flex items-center gap-4">
              <LayoutGrid size={36} className="text-indigo-600" />
              Widgets & Herramientas
            </h1>
            <p className="text-slate-400 font-medium text-sm mt-3 uppercase tracking-widest italic">
              Activa tus herramientas flotantes para máxima productividad.
            </p>
          </div>
        </div>

        {/* GRID DE WIDGETS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
          {WIDGET_DEFS.map((w) => {
            const state = (widgets as any)[w.id];
            const isActive = state?.isOpen;

            return (
              <button
                key={w.id}
                onClick={() => toggleWidget(w.id as any)}
                className={`group relative p-8 rounded-[2.5rem] border transition-all duration-500 text-left flex flex-col justify-between h-64 overflow-hidden hover:shadow-2xl ${
                  isActive 
                    ? 'bg-white dark:bg-slate-900 border-indigo-200 shadow-indigo-100 shadow-xl' 
                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-white/[0.07] shadow-xl shadow-slate-200/50 grayscale hover:grayscale-0'
                }`}
              >
                <div className="flex justify-between items-start relative z-10">
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 ${isActive ? w.color : 'bg-slate-100 dark:bg-white/[0.07] text-slate-400'} text-white`}>
                    <w.icon size={28} />
                  </div>
                  {isActive && (
                    <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[8px] font-black uppercase tracking-widest animate-pulse">
                      Activo
                    </div>
                  )}
                </div>

                <div className="relative z-10 mt-6">
                  <h3 className={`text-lg font-black tracking-tight mb-1 ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                    {w.name}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed line-clamp-2">
                    {w.desc}
                  </p>
                </div>

                {/* ESTATUS VISUAL */}
                <div className="mt-6 flex items-center justify-between relative z-10">
                   <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${isActive ? 'text-indigo-600' : 'text-slate-300'}`}>
                     {isActive ? 'Cerrar Herramienta' : 'Lanzar Widget'}
                   </span>
                   <div className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-300'}`}>
                     {isActive ? <LayoutGrid size={14} /> : <Zap size={14} />}
                   </div>
                </div>

                {/* BACKGROUND DECORATION */}
                <div className={`absolute -right-4 -bottom-4 opacity-5 transition-transform duration-700 group-hover:scale-125 group-hover:rotate-12 ${isActive ? 'text-indigo-600' : 'text-slate-900 dark:text-white'}`}>
                  <w.icon size={120} />
                </div>
              </button>
            );
          })}
        </div>

        {/* PRO TIP CARD */}
        <div className="bg-slate-900 rounded-[3rem] p-12 text-white relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-700">
             <Zap size={180} />
           </div>
           <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
              <div className="h-24 w-24 rounded-[2rem] bg-white dark:bg-slate-900/10 backdrop-blur-xl border border-white/20 flex items-center justify-center flex-shrink-0">
                <LayoutGrid size={40} className="text-indigo-400" />
              </div>
              <div>
                <h3 className="text-2xl font-black mb-2 tracking-tight">Potencia tu flujo de trabajo</h3>
                <p className="text-slate-400 text-sm font-medium max-w-xl leading-relaxed">
                  Los widgets son herramientas flotantes que puedes usar sin salir de tu vista actual. 
                  Úsalos para realizar conversiones rápidas, anotar pendientes o chatear con tu equipo 
                  mientras facturas o gestionas tu inventario.
                </p>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
