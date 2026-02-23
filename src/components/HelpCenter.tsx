import React, { useMemo, useState } from 'react';

type HelpTopic = {
  id: string;
  title: string;
  description: string;
  icon: string;
  steps: string[];
  tags: string[];
};

type HelpCategory = {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  topics: HelpTopic[];
};

const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'billing',
    title: 'Facturacion y Dinero',
    subtitle: 'Ventas, cobranzas y hoja de vida.',
    accent: 'bg-amber-50 text-amber-700 border-amber-200',
    topics: [
      {
        id: 'invoice',
        title: 'Como crear una Factura',
        description: 'Paso a paso desde Panorama Global.',
        icon: 'fa-solid fa-file-invoice',
        tags: ['factura', 'venta', 'cobranza'],
        steps: [
          'Ve a Panorama Global y abre "Nueva Factura".',
          'Selecciona el cliente y agrega los items o concepto.',
          'Confirma monto, tasa y metodo de pago.',
          'Guarda para registrar la deuda o venta.',
        ],
      },
      {
        id: 'semaforo',
        title: 'Semaforo de Cobranzas',
        description: 'Interpreta el estado de cada cliente.',
        icon: 'fa-solid fa-traffic-light',
        tags: ['semaforo', 'cobranzas', 'estado'],
        steps: [
          'Rojo: cliente con deuda vencida.',
          'Amarillo: pendiente por confirmar.',
          'Verde: cliente solvente o al dia.',
          'Haz clic en el cliente para ver detalle.',
        ],
      },
      {
        id: 'life',
        title: 'Hoja de Vida del Cliente',
        description: 'Historial completo en un solo lugar.',
        icon: 'fa-solid fa-address-card',
        tags: ['historial', 'cliente', 'hoja de vida'],
        steps: [
          'En Gestion Cobranzas, haz clic en el nombre del cliente.',
          'Revisa facturas, abonos y estado de cuenta.',
          'Usa los filtros para ver solo movimientos recientes.',
          'Comparte el resumen con tu equipo si es necesario.',
        ],
      },
    ],
  },
  {
    id: 'team',
    title: 'Trabajo en Equipo',
    subtitle: 'Invitaciones y chat colaborativo.',
    accent: 'bg-sky-50 text-sky-700 border-sky-200',
    topics: [
      {
        id: 'workspace',
        title: 'Tu Codigo de Espacio',
        description: 'Invita socios al workspace.',
        icon: 'fa-solid fa-key',
        tags: ['codigo', 'equipo', 'workspace'],
        steps: [
          'Ve a Configuracion > Equipo.',
          'Copia el codigo de espacio compartido.',
          'Envialo a tu socio para que se una.',
          'Confirma su rol en la lista de miembros.',
        ],
      },
      {
        id: 'chat',
        title: 'Chat de Equipo',
        description: 'Adjunta pagos y clientes al instante.',
        icon: 'fa-regular fa-comments',
        tags: ['chat', 'adjuntos', 'dm'],
        steps: [
          'Abre el widget de Chat desde el dock inferior.',
          'Selecciona un canal o inicia un DM.',
          'Usa el clip para adjuntar la ficha de un cliente.',
          'Confirma el visto con los checks en DMs.',
        ],
      },
    ],
  },
  {
    id: 'security',
    title: 'Seguridad y Auditoria',
    subtitle: 'Control, comparaciones y cierres seguros.',
    accent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    topics: [
      {
        id: 'audit',
        title: 'Auditoria de Libros',
        description: 'Flujo seguro de comparacion.',
        icon: 'fa-solid fa-shield-halved',
        tags: ['auditoria', 'comparar', 'seguridad'],
        steps: [
          'Solicita la comparacion desde Comparar Libros.',
          'El socio acepta la solicitud de revision.',
          'Revisa las diferencias detectadas en pantalla.',
          'Guarda o exporta el resultado si es necesario.',
        ],
      },
      {
        id: 'logout',
        title: 'Cierre de Sesion Seguro',
        description: 'Protege tus datos al finalizar.',
        icon: 'fa-solid fa-door-closed',
        tags: ['logout', 'seguridad', 'sesion'],
        steps: [
          'Cuando termines, usa el boton Cerrar Sesion.',
          'Si estas auditando, finaliza la revision.',
          'Evita dejar sesiones abiertas en equipos compartidos.',
        ],
      },
    ],
  },
];

const HelpCenter: React.FC = () => {
  const [query, setQuery] = useState('');
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return HELP_CATEGORIES;
    return HELP_CATEGORIES.map((category) => {
      const topics = category.topics.filter((topic) => {
        return (
          topic.title.toLowerCase().includes(term) ||
          topic.description.toLowerCase().includes(term) ||
          topic.tags.some((tag) => tag.includes(term))
        );
      });
      return { ...category, topics };
    }).filter((category) => category.topics.length > 0);
  }, [query]);

  return (
    <section className="app-panel p-6 md:p-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">
            Academia de usuario
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-black text-slate-900">
            Como podemos ayudarte?
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-500 max-w-2xl">
            Busca una mision o explora las tarjetas para dominar el sistema en minutos.
          </p>
          <div className="mt-6 w-full max-w-2xl">
            <div className="relative">
              <i className="fa-solid fa-magnifying-glass absolute left-4 top-3 text-slate-400 text-sm"></i>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Busca factura, auditoria, chat o semaforo"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 text-sm font-semibold text-slate-700"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          {filteredCategories.map((category) => (
            <div key={category.id}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${category.accent}`}>
                    Mision
                  </div>
                  <div className="mt-2 text-xl font-black text-slate-800">
                    {category.title}
                  </div>
                  <div className="text-sm text-slate-500">{category.subtitle}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {category.topics.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setActiveTopicId(topic.id === activeTopicId ? null : topic.id)}
                    className={`text-left rounded-2xl border px-5 py-4 transition-all ${
                      topic.id === activeTopicId
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          topic.id === activeTopicId ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <i className={topic.icon}></i>
                      </div>
                      <div>
                        <div className="text-sm font-black uppercase tracking-wide">
                          {topic.title}
                        </div>
                        <div
                          className={`text-[11px] ${
                            topic.id === activeTopicId ? 'text-slate-200' : 'text-slate-400'
                          }`}
                        >
                          {topic.description}
                        </div>
                      </div>
                    </div>

                    {topic.id === activeTopicId && (
                      <div className="mt-4 space-y-2 text-[12px] text-slate-100">
                        {topic.steps.map((step, index) => (
                          <div key={step} className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-white/20 text-[10px] font-black flex items-center justify-center">
                              {index + 1}
                            </span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HelpCenter;
