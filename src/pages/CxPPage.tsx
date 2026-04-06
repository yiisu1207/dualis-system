import React, { useState, useCallback, useMemo } from 'react';
import type { Supplier, Movement, CustomRate, ExchangeRates } from '../../types';
import { CxPSupplierList } from '../components/cxc/CxPSupplierList';
import { EntityDetail } from '../components/cxc/EntityDetail';
import { MovementFormPanel } from '../components/cxc/MovementFormPanel';
import NewSupplierModal from '../components/cxc/NewSupplierModal';

interface CxPPageProps {
  suppliers: Supplier[];
  movements: Movement[];
  rates: ExchangeRates;
  bcvRate: number;
  customRates: CustomRate[];
  businessId: string;
  userRole: string;
  isolationMode?: 'individual' | 'shared';
  currentUserId?: string;
  onSaveMovement: (data: Partial<Movement>) => Promise<void>;
  onUpdateMovement: (id: string, data: Partial<Movement>) => Promise<void>;
  onDeleteMovement: (id: string) => Promise<void>;
  onCreateSupplier: (data: Partial<Supplier>) => Promise<void>;
  onUpdateSupplier: (id: string, data: Partial<Supplier>) => Promise<void>;
  onDeleteSupplier: (id: string) => Promise<void>;
}

export default function CxPPage({
  suppliers,
  movements,
  rates,
  bcvRate,
  customRates,
  businessId,
  userRole,
  isolationMode,
  currentUserId,
  onSaveMovement,
  onUpdateMovement,
  onDeleteMovement,
  onCreateSupplier,
  onUpdateSupplier,
}: CxPPageProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<'FACTURA' | 'ABONO'>('FACTURA');
  const [formAccountPreset, setFormAccountPreset] = useState<string | undefined>();
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);

  // In individual mode, non-admin users only see their own movements
  const visibleMovements = useMemo(() => {
    if (isolationMode !== 'individual' || ['owner', 'admin'].includes(userRole)) return movements;
    if (!currentUserId) return movements;
    return movements.filter(m =>
      m.vendedorId === currentUserId || m.ownerId === currentUserId || (m as any).createdBy === currentUserId
    );
  }, [movements, isolationMode, userRole, currentUserId]);

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

  const handleUpdateEntity = useCallback(async (id: string, data: Partial<Supplier>) => {
    await onUpdateSupplier(id, data as any);
  }, [onUpdateSupplier]);

  return (
    <div className="h-full flex">
      {/* Left Panel — Supplier List */}
      <div className={`w-80 shrink-0 border-r border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#060a14] ${
        selectedSupplier ? 'hidden lg:flex lg:flex-col' : 'flex flex-col w-full lg:w-80'
      }`}>
        <CxPSupplierList
          suppliers={suppliers}
          movements={visibleMovements}
          rates={rates}
          selectedId={selectedSupplier?.id}
          onSelect={setSelectedSupplier}
          onCreateNew={() => setNewSupplierOpen(true)}
        />
      </div>

      {/* Right Panel — Detail */}
      <div className={`flex-1 bg-slate-50/50 dark:bg-[#070b16] ${
        selectedSupplier ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
      }`}>
        {selectedSupplier ? (
          <EntityDetail
            mode="cxp"
            entity={selectedSupplier as any}
            movements={visibleMovements}
            rates={rates}
            bcvRate={bcvRate}
            customRates={customRates}
            onRegisterMovement={openForm}
            onEditMovement={canEdit ? openEditForm : undefined}
            onDeleteMovement={canEdit ? handleDeleteMovement : undefined}
            onUpdateEntity={canEdit ? handleUpdateEntity : undefined}
            onBack={() => setSelectedSupplier(null)}
            canEdit={canEdit}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/[0.06] flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-300 dark:text-amber-500/40">
                  <path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 0V7a3 3 0 0 0 6 0v0m0 0V7a3 3 0 0 0 6 0V7H3l2-4h14l2 4M5 21V10.87M19 21V10.87" />
                </svg>
              </div>
              <p className="text-sm font-black text-slate-300 dark:text-white/15 uppercase tracking-widest">Selecciona un proveedor</p>
              <p className="text-xs font-medium text-slate-300 dark:text-white/10 mt-1">para ver su cuenta y movimientos</p>
            </div>
          </div>
        )}
      </div>

      {/* Movement Form Panel (slide-in) */}
      {formOpen && (
        <MovementFormPanel
          mode="cxp"
          type={formType}
          entity={selectedSupplier as any || undefined}
          entities={suppliers as any}
          bcvRate={bcvRate}
          customRates={customRates}
          rates={rates}
          businessId={businessId}
          onSave={handleSaveMovement}
          onClose={() => { setFormOpen(false); setEditingMovement(null); }}
          editingMovement={editingMovement || undefined}
        />
      )}

      {/* New Supplier Modal */}
      <NewSupplierModal
        open={newSupplierOpen}
        onClose={() => setNewSupplierOpen(false)}
        onSave={async (data) => {
          await onCreateSupplier({ ...data, businessId } as any);
        }}
        existingSuppliers={suppliers}
      />
    </div>
  );
}
