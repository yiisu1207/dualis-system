import React, { useState, useRef, useEffect } from 'react';
import {
  AppConfig,
  Customer,
  ExchangeRates,
  Employee,
  CashAdvance,
  Movement,
} from '../../types';
import { getMovementUsdAmount } from '../utils/formatters';

interface AIChatProps {
  config: AppConfig;
  customers: Customer[];
  employees: Employee[];
  rates: ExchangeRates;
  movements: Movement[];
  payrollRate: number;
  onRegisterMovement: (data: any) => Promise<string> | string;
  onAddCustomer: (customer: Customer) => void;
  onUpdateRates: (rates: ExchangeRates) => void;
  onRegisterAdvance: (advance: CashAdvance) => void;
}

const AIChat: React.FC<AIChatProps> = ({
  config,
  customers,
  employees,
  rates,
  movements,
  payrollRate,
  onRegisterMovement,
  onAddCustomer,
  onUpdateRates,
  onRegisterAdvance,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<
    { role: 'user' | 'ai'; text: string; actionResult?: string }[]
  >([
    {
      role: 'ai',
      text: `¡Hola! Soy Vision Manager, tu copiloto ERP. Puedo registrar pagos, deudas, vales de nómina o analizar datos. ¿Qué necesitas?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setLoading(true);

    try {
      // Context Enrichment
      const customerList = customers.map((c) => c.id).join(', ');
      const employeeList = employees.map((e) => e.name + ' ' + e.lastName).join(', ');
      const sortedMovements = [...movements].sort((a, b) => {
        const aDate = new Date(a.createdAt || a.date).getTime();
        const bDate = new Date(b.createdAt || b.date).getTime();
        return bDate - aDate;
      });
      const recentMovements = sortedMovements.slice(0, 20);
      const totalFacturas = movements
        .filter((m) => m.movementType === 'FACTURA')
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      const totalAbonos = movements
        .filter((m) => m.movementType === 'ABONO')
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);

      const buildAccountTotals = (filterFn: (m: Movement) => boolean) => {
        const sumBy = (accountType: string, mvType: string) =>
          movements
            .filter((m) => filterFn(m) && m.accountType === accountType && m.movementType === mvType)
            .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);

        const bcvDebt = sumBy('BCV', 'FACTURA');
        const bcvPaid = sumBy('BCV', 'ABONO');
        const grupoDebt = sumBy('GRUPO', 'FACTURA');
        const grupoPaid = sumBy('GRUPO', 'ABONO');
        const divDebt = sumBy('DIVISA', 'FACTURA');
        const divPaid = sumBy('DIVISA', 'ABONO');

        return {
          bcv: bcvDebt - bcvPaid,
          grupo: grupoDebt - grupoPaid,
          divisa: divDebt - divPaid,
        };
      };

      const customerTotals = buildAccountTotals((m) => !m.isSupplierMovement);
      const supplierTotals = buildAccountTotals((m) => m.isSupplierMovement);
      const recentSummary = recentMovements
        .map((m) => {
          const amountUsd = getMovementUsdAmount(m, rates).toFixed(2);
          return `${m.date} | ${m.entityId} | ${m.movementType} | ${m.accountType} | $${amountUsd}`;
        })
        .join(' | ');
      const context = `
        Sistema ERP: ${config.companyName}.
        Tasas del día: BCV ${rates.bcv}, Grupo ${rates.grupo}, Nómina ${payrollRate}.
        Clientes: ${customerList}.
        Empleados: ${employeeList}.
        Totales históricos: Facturas $${totalFacturas.toFixed(2)} / Abonos $${totalAbonos.toFixed(2)}.
        Saldos por cuenta (Clientes): BCV $${customerTotals.bcv.toFixed(2)} | Grupo $${customerTotals.grupo.toFixed(2)} | Divisa $${customerTotals.divisa.toFixed(2)}.
        Saldos por cuenta (Proveedores): BCV $${supplierTotals.bcv.toFixed(2)} | Grupo $${supplierTotals.grupo.toFixed(2)} | Divisa $${supplierTotals.divisa.toFixed(2)}.
        Movimientos recientes (máx 20): ${recentSummary || 'Sin movimientos recientes'}.
        HOY: ${new Date().toLocaleDateString()}.
      `;

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Context: ${context}\nUser Request: ${userText}`,
          system:
            'Eres un asistente ejecutivo. Si el usuario pide registrar algo, pregunta por los datos faltantes. Responde de forma clara y concisa.',
        }),
      });

      if (!response.ok) {
        throw new Error('Proxy de IA no disponible');
      }

      const data = await response.json();
      const text = data?.result || 'Entendido.';
      setMessages((prev) => [...prev, { role: 'ai', text }]);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Lo siento, tuve un error procesando tu solicitud.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
      {isOpen && (
        <div className="w-[350px] md:w-[420px] h-[550px] app-panel mb-4 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
          <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[var(--ui-accent)] rounded-xl flex items-center justify-center text-xl shadow-lg ring-2 ring-white/10">
                🤖
              </div>
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                  Vision Manager AI
                </h3>
                <p className="text-xs font-bold">Asistente Ejecutivo</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-rose-500 transition-all"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-4 rounded-2xl text-[13px] font-medium shadow-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[var(--ui-accent)] text-white rounded-br-none'
                      : m.actionResult
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-bl-none'
                      : 'bg-white text-slate-700 rounded-bl-none border border-slate-200'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white p-4 rounded-2xl rounded-bl-none border border-slate-200">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="p-4 bg-white border-t border-slate-100 flex gap-3"
          >
            <input
              type="text"
              placeholder="Ej: Registra pago de $50 a Maria..."
              className="flex-1 app-input text-xs font-bold"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              className="w-12 h-12 bg-[var(--ui-accent)] text-white rounded-xl flex items-center justify-center hover:opacity-90 shadow-lg transition-all active:scale-90 disabled:opacity-50"
              disabled={loading}
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 bg-[var(--ui-accent)] text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all group relative z-50 ring-4 ring-[var(--ui-soft)]"
      >
        <span className="text-2xl group-hover:rotate-12 transition-transform">✨</span>
        {!isOpen && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
          </span>
        )}
      </button>
    </div>
  );
};

export default AIChat;
