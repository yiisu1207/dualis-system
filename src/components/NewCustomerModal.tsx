import React, { useState } from 'react';

interface NewCustomerModalProps {
  customerName: string;
  onConfirm: (data: { cedula: string; telefono: string; direccion: string }) => void;
  onCancel: () => void;
}

const NewCustomerModal: React.FC<NewCustomerModalProps> = ({
  customerName,
  onConfirm,
  onCancel,
}) => {
  // Split inputs for ID
  const [idPrefix, setIdPrefix] = useState('V-');
  const [idNumber, setIdNumber] = useState('');

  // Split inputs for Phone
  const [phonePrefix, setPhonePrefix] = useState('+58');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [direccion, setDireccion] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idNumber || !phoneNumber || !direccion) {
      alert('Por favor complete todos los campos obligatorios.');
      return;
    }

    // Concatenate values
    const finalCedula = `${idPrefix}${idNumber}`;
    const finalTelefono = `${phonePrefix}${phoneNumber}`;

    onConfirm({
      cedula: finalCedula,
      telefono: finalTelefono,
      direccion,
    });
  };

  const inputBaseClasses =
    'px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-full';
  const selectClasses =
    'px-2 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-24 font-bold';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-indigo-600 p-8 text-white text-center">
          <div className="text-4xl mb-2">✨</div>
          <h2 className="text-2xl font-black tracking-tight">¡Nuevo Registro!</h2>
          <p className="text-indigo-100 text-sm mt-1">
            Completa los datos para <b>{customerName}</b>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Smart ID Input Group */}
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              Identificación (Cédula / RIF)
            </label>
            <div className="flex gap-2">
              <select
                value={idPrefix}
                onChange={(e) => setIdPrefix(e.target.value)}
                className={selectClasses}
              >
                <option value="V-">V-</option>
                <option value="J-">J-</option>
                <option value="E-">E-</option>
                <option value="G-">G-</option>
              </select>
              <input
                type="number"
                required
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                className={inputBaseClasses}
                placeholder="Ej: 12345678"
              />
            </div>
          </div>

          {/* Smart Phone Input Group */}
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              Teléfono de Contacto
            </label>
            <div className="flex gap-2">
              <select
                value={phonePrefix}
                onChange={(e) => setPhonePrefix(e.target.value)}
                className={selectClasses}
              >
                <option value="+58">+58</option>
                <option value="+1">+1</option>
                <option value="+34">+34</option>
                <option value="+57">+57</option>
              </select>
              <input
                type="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className={inputBaseClasses}
                placeholder="4121234567"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              Dirección Fiscal / Habitación
            </label>
            <textarea
              required
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className={inputBaseClasses}
              rows={3}
              placeholder="Indique dirección completa..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 px-4 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3 px-4 bg-indigo-600 rounded-xl text-white font-black hover:bg-indigo-700 shadow-lg transition-transform active:scale-95"
            >
              GUARDAR CLIENTE
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewCustomerModal;
