import React, { useMemo, useState } from 'react';

const MODULES = [
  { id: 'bodegon', label: 'Bodegon / Supermercado', impact: 'Vencimientos y lotes' },
  { id: 'farmacia', label: 'Farmacia / Salud', impact: 'Vencimientos estandarizados' },
  { id: 'boutique', label: 'Boutique / Zapateria', impact: 'Matriz de tallas y colores' },
  { id: 'tecnologia', label: 'Tecnologia / Celulares', impact: 'Seriales e IMEI' },
  { id: 'ferreteria', label: 'Ferreteria / Construccion', impact: 'Venta por decimales' },
  { id: 'repuestos', label: 'Repuestos / Autoperiquitos', impact: 'Codigos equivalentes' },
  { id: 'servicios', label: 'Peluqueria / Barberia / Spa', impact: 'Servicios sin stock' },
  { id: 'mascotas', label: 'Mascotas / Veterinaria / Agro', impact: 'Historico de servicios' },
  { id: 'comida', label: 'Comida Rapida / Cafeteria', impact: 'Recetas y porciones' },
  { id: 'libreria', label: 'Libreria / Papeleria', impact: 'Etiquetado inteligente' },
  { id: 'jugueteria', label: 'Jugueteria / Regalos', impact: 'Bundles y kits' },
  { id: 'multitienda', label: 'Multitienda / Departamentos', impact: 'Activa todo' },
];

export default function PlanesFacturacion() {
  const [plan, setPlan] = useState<'Basico' | 'Pro' | 'Elite'>('Basico');
  const [activeModules, setActiveModules] = useState<string[]>(['boutique']);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const hasUniversal = activeModules.includes('multitienda');
  const visibleModules = useMemo(() => MODULES, []);

  const handleToggle = (id: string) => {
    if (id === 'multitienda') {
      if (hasUniversal) {
        setConfirming(id);
        setConfirmText('');
        return;
      }
      setActiveModules(['multitienda']);
      return;
    }

    if (hasUniversal) {
      setConfirming('multitienda');
      setConfirmText('');
      return;
    }

    if (activeModules.includes(id)) {
      setConfirming(id);
      setConfirmText('');
      return;
    }

    setActiveModules((prev) => [...prev, id]);
  };

  const confirmDisable = () => {
    if (confirmText !== 'ELIMINAR' || !confirming) return;
    setActiveModules((prev) => prev.filter((id) => id !== confirming));
    setConfirming(null);
    setConfirmText('');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="text-xs font-black uppercase text-slate-400">Plan actual</div>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <div className="text-2xl font-black text-slate-900">{plan}</div>
            <div className="text-sm text-slate-500">Gestiona modulos y upselling.</div>
          </div>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as 'Basico' | 'Pro' | 'Elite')}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase"
          >
            <option value="Basico">Basico</option>
            <option value="Pro">Pro</option>
            <option value="Elite">Elite</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-black uppercase text-slate-400">Giros / Modulos</div>
            <div className="text-sm text-slate-600">Activa o desactiva segun tu plan.</div>
          </div>
          {hasUniversal && (
            <div className="text-xs font-bold text-emerald-600">Universal activo</div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleModules.map((module) => {
            const isActive = hasUniversal || activeModules.includes(module.id);
            const isLocked = hasUniversal && module.id !== 'multitienda';
            return (
              <button
                key={module.id}
                type="button"
                onClick={() => handleToggle(module.id)}
                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                  isActive
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                } ${isLocked ? 'opacity-60' : ''}`}
              >
                <div className="text-sm font-bold text-slate-900">{module.label}</div>
                <div className="text-xs text-slate-500">{module.impact}</div>
                <div className="mt-3 text-[10px] font-black uppercase text-slate-400">
                  {isActive ? 'Activo' : 'Inactivo'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6">
          <div className="w-full max-w-lg rounded-2xl border border-rose-500/40 bg-slate-950 p-6 text-white shadow-2xl">
            <div className="text-xs font-black uppercase text-rose-300">Advertencia critica</div>
            <div className="mt-2 text-xl font-black">Desactivar modulo</div>
            <p className="mt-2 text-sm text-rose-200">
              Al desactivar este modulo ocultaras datos criticos vinculados a tus productos.
              Escribe ELIMINAR para confirmar.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="ELIMINAR"
              className="mt-4 w-full rounded-xl border border-rose-500/40 bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold uppercase text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDisable}
                className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-black uppercase text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
