import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import {
  AppConfig,
  Customer,
  ExchangeRates,
  AccountType,
  MovementType,
  Movement,
  Employee,
  CashAdvance,
  PaymentCurrency,
} from '../../types';
import { formatCurrency } from '../utils/formatters';

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

  // --- TOOL DEFINITIONS ---

  const registerMovementTool: FunctionDeclaration = {
    name: 'register_financial_movement',
    description:
      'Registra un movimiento financiero (Deuda/Factura o Pago/Abono) para un cliente o proveedor.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        entityName: { type: Type.STRING, description: 'Nombre exacto del cliente o proveedor.' },
        type: {
          type: Type.STRING,
          description: 'FACTURA (para deudas/ventas a crédito) o ABONO (para pagos recibidos).',
        },
        amount: { type: Type.NUMBER, description: 'Monto numérico de la operación.' },
        currency: { type: Type.STRING, description: 'Moneda del pago: USD o BS.' },
        accountType: { type: Type.STRING, description: 'Cuenta destino: BCV, GRUPO o DIVISA.' },
        concept: { type: Type.STRING, description: 'Descripción breve del movimiento.' },
      },
      required: ['entityName', 'type', 'amount', 'currency', 'accountType', 'concept'],
    },
  };

  const registerAdvanceTool: FunctionDeclaration = {
    name: 'register_payroll_advance',
    description: 'Registra un vale o adelanto de nómina para un empleado.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        employeeName: {
          type: Type.STRING,
          description: 'Nombre del empleado (primer nombre o apellido).',
        },
        amount: { type: Type.NUMBER, description: 'Monto del vale.' },
        currency: { type: Type.STRING, description: 'Moneda del vale: USD o BS.' },
        reason: { type: Type.STRING, description: 'Motivo del adelanto.' },
      },
      required: ['employeeName', 'amount', 'currency', 'reason'],
    },
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // Context Enrichment
      const customerList = customers.map((c) => c.id).join(', ');
      const employeeList = employees.map((e) => e.name + ' ' + e.lastName).join(', ');
      const context = `
        Sistema ERP: ${config.companyName}.
        Tasas del día: BCV ${rates.bcv}, Grupo ${rates.grupo}, Nómina ${payrollRate}.
        Clientes: ${customerList}.
        Empleados: ${employeeList}.
        HOY: ${new Date().toLocaleDateString()}.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { role: 'user', parts: [{ text: `Context: ${context} User Request: ${userText}` }] },
        ],
        config: {
          systemInstruction:
            'Eres un asistente ejecutivo. Si el usuario pide registrar algo, USA LAS HERRAMIENTAS. Si falta info, pregunta.',
          tools: [{ functionDeclarations: [registerMovementTool, registerAdvanceTool] }],
        },
      });

      // --- FUNCTION CALL HANDLING ---
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        let resultText = 'Acción completada.';

        if (call.name === 'register_financial_movement') {
          const args = call.args as any;
          // Resolve Rate
          let rate = 1;
          if (args.currency === 'BS') {
            rate = args.accountType === 'BCV' ? rates.bcv : rates.grupo;
          }

          await onRegisterMovement({
            customerName: args.entityName.toUpperCase(),
            date: new Date().toISOString().split('T')[0],
            type: args.type as MovementType,
            concept: args.concept,
            amount: args.currency === 'BS' ? args.amount / rate : args.amount, // Normalize to USD
            currency: args.currency,
            rate: rate,
            accountType: args.accountType as AccountType,
          });
          resultText = `✅ Registrado: ${args.type} de ${args.currency} ${args.amount} para ${args.entityName}.`;
        } else if (call.name === 'register_payroll_advance') {
          const args = call.args as any;
          // Find employee
          const emp = employees.find((e) =>
            (e.name + ' ' + e.lastName).toLowerCase().includes(args.employeeName.toLowerCase())
          );

          if (emp) {
            const rate = args.currency === 'BS' ? payrollRate : 1;
            const usdAmount = args.currency === 'BS' ? args.amount / rate : args.amount;

            const newAdvance: CashAdvance = {
              id: crypto.randomUUID(),
              employeeId: emp.id,
              date: new Date().toISOString().split('T')[0],
              amount: usdAmount,
              originalAmount: args.amount,
              currency: args.currency as PaymentCurrency,
              exchangeRate: rate,
              reason: args.reason || 'Solicitud vía Chat',
              status: 'PENDIENTE',
            };
            onRegisterAdvance(newAdvance);
            resultText = `✅ Vale registrado para ${emp.name}: $${usdAmount.toFixed(2)} (${
              args.currency
            } ${args.amount}).`;
          } else {
            resultText = `❌ Error: No encontré al empleado "${args.employeeName}".`;
          }
        }

        setMessages((prev) => [...prev, { role: 'ai', text: resultText, actionResult: 'success' }]);
      } else {
        // Normal text response
        setMessages((prev) => [...prev, { role: 'ai', text: response.text || 'Entendido.' }]);
      }
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
        <div className="w-[350px] md:w-[420px] h-[550px] bg-white dark:bg-slate-900 shadow-[0_30px_100px_rgba(0,0,0,0.3)] rounded-[2rem] mb-4 flex flex-col overflow-hidden border border-slate-100 dark:border-slate-800 animate-in slide-in-from-bottom-5">
          <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-xl shadow-lg ring-2 ring-white/10">
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

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll bg-slate-50 dark:bg-slate-950/50"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-4 rounded-2xl text-[13px] font-medium shadow-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : m.actionResult
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-bl-none'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-bl-none border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700">
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
            className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-3"
          >
            <input
              type="text"
              placeholder="Ej: Registra pago de $50 a Maria..."
              className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-xs font-bold outline-none dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 shadow-lg transition-all active:scale-90 disabled:opacity-50"
              disabled={loading}
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all group relative z-50 ring-4 ring-indigo-600/30"
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
