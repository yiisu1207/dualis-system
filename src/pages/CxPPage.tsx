import React, { useState, useCallback, useMemo } from 'react';
import type { Supplier, Customer, Movement, CustomRate, ExchangeRates, ApprovalConfig, PendingMovement } from '../../types';
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
  approvalConfig?: ApprovalConfig;
  validatorCount?: number;
  pendingMovements?: PendingMovement[];
  /** Fase C.5 — eliminarDatos capability. */
  canDelete?: boolean;
  /** Fase C.5 — crearClientes capability (reutilizada para suppliers). */
  canCreateCustomer?: boolean;
  /** D.6 — customers list for cross-compensation CxP↔CxC */
  customers?: Customer[];
  onSaveMovement: (data: Partial<Movement>) => Promise<void | string>;
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
  approvalConfig,
  validatorCount = 0,
  pendingMovements = [],
  canDelete,
  canCreateCustomer,
  customers = [],
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

  const isOwnerOrAdmin = ['owner', 'admin'].includes(userRole);
  const canEdit = isOwnerOrAdmin;
  const effectiveCanDelete = canDelete ?? isOwnerOrAdmin;
  const effectiveCanCreateSupplier = canCreateCustomer ?? isOwnerOrAdmin;

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

  // D.6 — find if selected supplier is also a customer (by RIF)
  const linkedCustomer = useMemo(() => {
    if (!selectedSupplier) return null;
    const supRif = (selectedSupplier.rif || '').replace(/\s/g, '').toUpperCase();
    if (!supRif) return null;
    return customers.find(c => {
      const cRif = ((c as any).rif || (c as any).cedula || '').replace(/\s/g, '').toUpperCase();
      return cRif && cRif === supRif;
    }) || null;
  }, [selectedSupplier, customers]);

  const handleCrossCompensate = useCallback(async (amountUSD: number, direction: 'cxc-to-cxp' | 'cxp-to-cxc') => {
    if (!selectedSupplier || !linkedCustomer) return;
    const now = new Date().toISOString();
    const compensationPairId = `cross_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const supplierName = selectedSupplier.contacto || selectedSupplier.rif || '';
    const clientName = (linkedCustomer as any).fullName || (linkedCustomer as any).nombre || '';

    if (direction === 'cxp-to-cxc') {
      await onSaveMovement({
        entityId: selectedSupplier.id,
        entityName: supplierName,
        businessId,
        date: now.slice(0, 10),
        amountInUSD: amountUSD,
        amount: amountUSD,
        currency: 'USD' as any,
        movementType: 'FACTURA' as any,
        accountType: 'BCV' as any,
        concept: `Compensación cruzada CxP→CxC (cliente: ${clientName})`,
        compensationPairId,
        isCxP: true,
      } as any);
      await onSaveMovement({
        entityId: linkedCustomer.id,
        entityName: clientName,
        businessId,
        date: now.slice(0, 10),
        amountInUSD: amountUSD,
        amount: amountUSD,
        currency: 'USD' as any,
        movementType: 'ABONO' as any,
        accountType: (linkedCustomer as any).defaultAccountType || 'BCV',
        concept: `Compensación cruzada CxC←CxP (proveedor: ${supplierName})`,
        compensationPairId,
      });
    } else {
      await onSaveMovement({
        entityId: linkedCustomer.id,
        entityName: clientName,
        businessId,
        date: now.slice(0, 10),
        amountInUSD: amountUSD,
        amount: amountUSD,
        currency: 'USD' as any,
        movementType: 'ABONO' as any,
        accountType: (linkedCustomer as any).defaultAccountType || 'BCV',
        concept: `Compensación cruzada CxC→CxP (proveedor: ${supplierName})`,
        compensationPairId,
      });
      await onSaveMovement({
        entityId: selectedSupplier.id,
        entityName: supplierName,
        businessId,
        date: now.slice(0, 10),
        amountInUSD: amountUSD,
        amount: amountUSD,
        currency: 'USD' as any,
        movementType: 'ABONO' as any,
        accountType: 'BCV' as any,
        concept: `Compensación cruzada CxP←CxC (cliente: ${clientName})`,
        compensationPairId,
        isCxP: true,
      } as any);
    }
  }, [selectedSupplier, linkedCustomer, businessId, onSaveMovement]);

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
          onCreateNew={effectiveCanCreateSupplier ? () => setNewSupplierOpen(true) : undefined}
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
            onDeleteMovement={effectiveCanDelete ? handleDeleteMovement : undefined}
            onUpdateEntity={canEdit ? handleUpdateEntity : undefined}
            onCrossCompensate={canEdit && linkedCustomer ? handleCrossCompensate : undefined}
            linkedCounterpartName={linkedCustomer ? ((linkedCustomer as any).fullName || (linkedCustomer as any).nombre) : undefined}
            onBack={() => setSelectedSupplier(null)}
            canEdit={canEdit}
            pendingMovements={pendingMovements}
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
          approvalConfig={approvalConfig}
          validatorCount={validatorCount}
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
