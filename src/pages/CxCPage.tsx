import React, { useState, useCallback } from 'react';
import type { Customer, Movement, CustomRate, ExchangeRates } from '../../types';
import { CxCClientList } from '../components/cxc/CxCClientList';
import { EntityDetail } from '../components/cxc/EntityDetail';
import { MovementFormPanel } from '../components/cxc/MovementFormPanel';

interface CxCPageProps {
  customers: Customer[];
  movements: Movement[];
  rates: ExchangeRates;
  bcvRate: number;
  customRates: CustomRate[];
  businessId: string;
  userRole: string;
  onSaveMovement: (data: Partial<Movement>) => Promise<void>;
  onUpdateMovement: (id: string, data: Partial<Movement>) => Promise<void>;
  onDeleteMovement: (id: string) => Promise<void>;
  onCreateCustomer: (data: Partial<Customer>) => Promise<void>;
  onUpdateCustomer: (id: string, data: Partial<Customer>) => Promise<void>;
  onDeleteCustomer: (id: string) => Promise<void>;
}

export default function CxCPage({
  customers,
  movements,
  rates,
  bcvRate,
  customRates,
  businessId,
  userRole,
  onSaveMovement,
  onUpdateMovement,
  onDeleteMovement,
  onCreateCustomer,
  onUpdateCustomer,
}: CxCPageProps) {
  const [selectedClient, setSelectedClient] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<'FACTURA' | 'ABONO'>('FACTURA');
  const [formAccountPreset, setFormAccountPreset] = useState<string | undefined>();
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);

  const canEdit = ['owner', 'admin'].includes(userRole);

  const openForm = useCallback((type: 'FACTURA' | 'ABONO', accountPreset?: string) => {
    setFormType(type);
    setFormAccountPreset(accountPreset);
    setEditingMovement(null);
    setFormOpen(true);
  }, []);

  const openEditForm = useCallback((movement: Movement) => {
    setFormType(movement.movementType as 'FACTURA' | 'ABONO');
    setEditingMovement(movement);
    setFormOpen(true);
  }, []);

  const handleSaveMovement = useCallback(async (data: Partial<Movement>) => {
    if (editingMovement) {
      await onUpdateMovement(editingMovement.id, data);
    } else {
      await onSaveMovement(data);
    }
  }, [editingMovement, onSaveMovement, onUpdateMovement]);

  const handleDeleteMovement = useCallback(async (id: string) => {
    if (!confirm('Eliminar este movimiento?')) return;
    await onDeleteMovement(id);
  }, [onDeleteMovement]);

  const handleUpdateEntity = useCallback(async (id: string, data: Partial<Customer>) => {
    await onUpdateCustomer(id, data);
  }, [onUpdateCustomer]);

  return (
    <div className="h-full flex">
      {/* Left Panel — Client List */}
      <div className={`w-80 shrink-0 border-r border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#060a14] ${
        selectedClient ? 'hidden lg:flex lg:flex-col' : 'flex flex-col w-full lg:w-80'
      }`}>
        <CxCClientList
          customers={customers}
          movements={movements}
          rates={rates}
          customRates={customRates}
          selectedId={selectedClient?.id}
          onSelect={setSelectedClient}
          onCreateNew={() => {
            const name = prompt('Nombre del cliente:');
            if (name?.trim()) {
              onCreateCustomer({
                fullName: name.trim(),
                nombre: name.trim(),
                businessId,
              } as any);
            }
          }}
        />
      </div>

      {/* Right Panel — Detail */}
      <div className={`flex-1 bg-slate-50/50 dark:bg-[#070b16] ${
        selectedClient ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
      }`}>
        {selectedClient ? (
          <EntityDetail
            mode="cxc"
            entity={selectedClient}
            movements={movements}
            rates={rates}
            bcvRate={bcvRate}
            customRates={customRates}
            onRegisterMovement={openForm}
            onEditMovement={canEdit ? openEditForm : undefined}
            onDeleteMovement={canEdit ? handleDeleteMovement : undefined}
            onUpdateEntity={canEdit ? handleUpdateEntity : undefined}
            onBack={() => setSelectedClient(null)}
            canEdit={canEdit}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/[0.06] flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-300 dark:text-indigo-500/40">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <p className="text-sm font-black text-slate-300 dark:text-white/15 uppercase tracking-widest">Selecciona un cliente</p>
              <p className="text-xs font-medium text-slate-300 dark:text-white/10 mt-1">para ver su perfil y movimientos</p>
            </div>
          </div>
        )}
      </div>

      {/* Movement Form Panel (slide-in) */}
      {formOpen && (
        <MovementFormPanel
          mode="cxc"
          type={formType}
          entity={selectedClient || undefined}
          entities={customers}
          bcvRate={bcvRate}
          customRates={customRates}
          rates={rates}
          businessId={businessId}
          onSave={handleSaveMovement}
          onClose={() => { setFormOpen(false); setEditingMovement(null); }}
          editingMovement={editingMovement || undefined}
        />
      )}
    </div>
  );
}
