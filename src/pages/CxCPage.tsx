import React, { useState, useCallback, useMemo } from 'react';
import type { Customer, Supplier, Movement, CustomRate, ExchangeRates, ApprovalConfig, PendingMovement } from '../../types';
import { CxCClientList } from '../components/cxc/CxCClientList';
import { EntityDetail } from '../components/cxc/EntityDetail';
import { MovementFormPanel } from '../components/cxc/MovementFormPanel';
import NewClientModal from '../components/cxc/NewClientModal';
import ClientOnboardingWizard from '../components/cxc/ClientOnboardingWizard';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useSubdomain } from '../context/SubdomainContext';
import { Zap, Sparkles, X } from 'lucide-react';

interface CxCPageProps {
  customers: Customer[];
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
  /** Fase C.5 — eliminarDatos capability. Si false, el delete queda oculto. */
  canDelete?: boolean;
  /** Fase C.5 — crearClientes capability. Si false, los botones de alta se ocultan. */
  canCreateCustomer?: boolean;
  /** D.6 — suppliers list for cross-compensation CxC↔CxP */
  suppliers?: Supplier[];
  businessName?: string;
  onSaveMovement: (data: Partial<Movement>) => Promise<void | string>;
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
  isolationMode,
  currentUserId,
  approvalConfig,
  validatorCount = 0,
  pendingMovements = [],
  canDelete,
  canCreateCustomer,
  suppliers = [],
  businessName,
  onSaveMovement,
  onUpdateMovement,
  onDeleteMovement,
  onCreateCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
}: CxCPageProps) {
  const [selectedClient, setSelectedClient] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<'FACTURA' | 'ABONO'>('FACTURA');
  const [formAccountPreset, setFormAccountPreset] = useState<string | undefined>();
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);

  // ── Alta de cliente: dos flujos coexisten ──────────────────────────────
  // 'closed'  → ningún modal abierto
  // 'picker'  → mini-menú para elegir entre "Rápido" y "Guiado"
  // 'quick'   → NewClientModal (flujo legacy, 1 pantalla, sin portal/KYC)
  // 'guided'  → ClientOnboardingWizard (4 pasos, KYC opcional + link portal)
  // El picker es el default del botón "Nuevo cliente". El usuario decide
  // el flujo caso por caso: "Rápido" para meter un cliente de paso,
  // "Guiado" para un cliente real que va a usar el portal.
  const [clientCreatorMode, setClientCreatorMode] =
    useState<'closed' | 'picker' | 'quick' | 'guided'>('closed');
  const { slug } = useSubdomain();

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
  // Fase C.5 — gating granular. Si el padre no pasó props, caemos al legacy (admin only).
  const effectiveCanDelete = canDelete ?? isOwnerOrAdmin;
  const effectiveCanCreateCustomer = canCreateCustomer ?? isOwnerOrAdmin;

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

  // D.6 — find if selected client is also a supplier (by RIF/cédula)
  const linkedSupplier = useMemo(() => {
    if (!selectedClient) return null;
    const clientRif = (selectedClient.rif || selectedClient.cedula || '').replace(/\s/g, '').toUpperCase();
    if (!clientRif) return null;
    return suppliers.find(s => {
      const supRif = (s.rif || '').replace(/\s/g, '').toUpperCase();
      return supRif && supRif === clientRif;
    }) || null;
  }, [selectedClient, suppliers]);

  const handleCrossCompensate = useCallback(async (amountUSD: number, direction: 'cxc-to-cxp' | 'cxp-to-cxc') => {
    if (!selectedClient || !linkedSupplier) return;
    const now = new Date().toISOString();
    const compensationPairId = `cross_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const clientName = (selectedClient as any).fullName || (selectedClient as any).nombre || '';
    const supplierName = linkedSupplier.contacto || linkedSupplier.rif || '';

    if (direction === 'cxc-to-cxp') {
      // Client pays supplier: ABONO in CxC (reduces client debt), ABONO in CxP (reduces what we owe supplier)
      await onSaveMovement({
        entityId: selectedClient.id,
        entityName: clientName,
        businessId,
        date: now.slice(0, 10),
        amountInUSD: amountUSD,
        amount: amountUSD,
        currency: 'USD' as any,
        movementType: 'ABONO' as any,
        accountType: selectedClient.defaultAccountType || 'BCV',
        concept: `Compensación cruzada CxC→CxP (proveedor: ${supplierName})`,
        compensationPairId,
      });
      await onSaveMovement({
        entityId: linkedSupplier.id,
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
    } else {
      // Supplier pays client: FACTURA in CxP (increases supplier debt), ABONO in CxC (reduces client debt)
      await onSaveMovement({
        entityId: linkedSupplier.id,
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
        entityId: selectedClient.id,
        entityName: clientName,
        businessId,
        date: now.slice(0, 10),
        amountInUSD: amountUSD,
        amount: amountUSD,
        currency: 'USD' as any,
        movementType: 'ABONO' as any,
        accountType: selectedClient.defaultAccountType || 'BCV',
        concept: `Compensación cruzada CxC←CxP (proveedor: ${supplierName})`,
        compensationPairId,
      });
    }
  }, [selectedClient, linkedSupplier, businessId, onSaveMovement]);

  const handleCompensate = useCallback(async (fromAccount: string, toAccount: string, amountUSD: number) => {
    if (!selectedClient) return;
    const now = new Date().toISOString();
    // Fase D.5 — par único que ata las dos puntas para auditoría/reversión
    const compensationPairId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const base = {
      entityId: selectedClient.id,
      entityName: (selectedClient as any).fullName || (selectedClient as any).nombre || '',
      businessId,
      date: now.slice(0, 10),
      amountInUSD: amountUSD,
      amount: amountUSD,
      currency: 'USD' as const,
      compensationPairId,
    };
    // Factura on source account (consume credit / increase debt to net zero)
    await onSaveMovement({
      ...base,
      movementType: 'FACTURA' as any,
      accountType: fromAccount as any,
      concept: `Compensación → ${toAccount}`,
    });
    // Abono on target account (reduce debt using the transferred amount)
    await onSaveMovement({
      ...base,
      movementType: 'ABONO' as any,
      accountType: toAccount as any,
      concept: `Compensación ← ${fromAccount}`,
    });
  }, [selectedClient, businessId, onSaveMovement]);

  return (
    <div className="h-full flex">
      {/* Left Panel — Client List */}
      <div className={`w-80 shrink-0 border-r border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#060a14] ${
        selectedClient ? 'hidden lg:flex lg:flex-col' : 'flex flex-col w-full lg:w-80'
      }`}>
        <CxCClientList
          customers={customers}
          movements={visibleMovements}
          rates={rates}
          customRates={customRates}
          selectedId={selectedClient?.id}
          onSelect={setSelectedClient}
          onCreateNew={effectiveCanCreateCustomer ? () => setClientCreatorMode('picker') : undefined}
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
            movements={visibleMovements}
            rates={rates}
            bcvRate={bcvRate}
            customRates={customRates}
            onRegisterMovement={openForm}
            onEditMovement={canEdit ? openEditForm : undefined}
            onDeleteMovement={effectiveCanDelete ? handleDeleteMovement : undefined}
            onUpdateEntity={canEdit ? handleUpdateEntity : undefined}
            onCompensate={canEdit ? handleCompensate : undefined}
            onCrossCompensate={canEdit && linkedSupplier ? handleCrossCompensate : undefined}
            linkedCounterpartName={linkedSupplier ? (linkedSupplier.contacto || linkedSupplier.rif) : undefined}
            onDeleteEntity={effectiveCanDelete ? onDeleteCustomer : undefined}
            onBack={() => setSelectedClient(null)}
            canEdit={canEdit}
            pendingMovements={pendingMovements}
            businessId={businessId}
            userId={currentUserId}
            slug={slug}
            businessName={businessName}
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
          approvalConfig={approvalConfig}
          validatorCount={validatorCount}
          onSave={handleSaveMovement}
          onClose={() => { setFormOpen(false); setEditingMovement(null); }}
          editingMovement={editingMovement || undefined}
        />
      )}

      {/* ── Picker mini-menú: elegir flujo de alta ───────────────────────
          Aparece cuando el usuario pulsa "Nuevo cliente" en la lista.
          Dos opciones, nada exclusivo: ambas crean un customer válido,
          pero el "Guiado" además habilita portal + KYC + link shareable.   */}
      {clientCreatorMode === 'picker' && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setClientCreatorMode('closed')}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Nuevo cliente</h3>
                <p className="text-xs font-bold text-slate-400 dark:text-white/40 mt-0.5">
                  ¿Cómo quieres crearlo?
                </p>
              </div>
              <button
                onClick={() => setClientCreatorMode('closed')}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] dark:text-white/40"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5">
              {/* Rápido: NewClientModal — 1 pantalla, solo datos básicos */}
              <button
                onClick={() => setClientCreatorMode('quick')}
                className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/[0.06] transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Zap size={18} className="text-indigo-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 dark:text-white">Rápido</p>
                    <p className="text-[11px] font-bold text-slate-400 dark:text-white/40 leading-tight">
                      Solo datos básicos. Ideal para meter un cliente de paso.
                    </p>
                  </div>
                </div>
              </button>

              {/* Guiado: ClientOnboardingWizard — 4 pasos + portal + KYC */}
              <button
                onClick={() => setClientCreatorMode('guided')}
                className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50/50 dark:hover:bg-violet-500/[0.06] transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Sparkles size={18} className="text-violet-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 dark:text-white">Guiado (con portal + KYC)</p>
                    <p className="text-[11px] font-bold text-slate-400 dark:text-white/40 leading-tight">
                      4 pasos: datos → cédula frontal/trasera → PIN del portal → link shareable por WhatsApp.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flujo Rápido — NewClientModal legacy, sin cambios */}
      <NewClientModal
        open={clientCreatorMode === 'quick'}
        onClose={() => setClientCreatorMode('closed')}
        onSave={async (data) => {
          await onCreateCustomer({ ...data, businessId } as any);
        }}
        existingCustomers={customers}
      />

      {/* ── Flujo Guiado — ClientOnboardingWizard ──────────────────────────
          onSave hace addDoc directo a `customers` para poder devolver el
          customerId al wizard (el prop onCreateCustomer del padre retorna
          void, por eso no lo reusamos aquí). Después crea un portalAccess
          con PIN y construye el link `{host}/portal/{slug}?token={docId}`
          para que el wizard lo muestre en su Step 4 (Copiar / WhatsApp /
          Email). Ver src/components/cxc/CxCClientProfile.tsx:140-156 para
          el mismo patrón de generación de link usado en el perfil.          */}
      {clientCreatorMode === 'guided' && (
        <ClientOnboardingWizard
          open={true}
          onClose={() => setClientCreatorMode('closed')}
          existingCustomers={customers}
          onSave={async (data) => {
            const { pin, ...customerData } = data;
            // 1. Crear el customer — addDoc directo para obtener el id
            const customerRef = await addDoc(collection(db, 'customers'), {
              ...customerData,
              businessId,
              createdAt: new Date().toISOString(),
            });

            // 2. Si el wizard habilitó el portal, crear token de acceso con PIN
            let portalLink: string | undefined;
            if (pin && (customerData as any).portalEnabled) {
              const tokenRef = await addDoc(
                collection(db, 'businesses', businessId, 'portalAccess'),
                {
                  customerId: customerRef.id,
                  customerName: customerData.nombre || '',
                  pin,
                  createdAt: new Date().toISOString(),
                  active: true,
                },
              );
              const host = window.location.origin;
              portalLink = slug
                ? `${host}/portal/${slug}?token=${tokenRef.id}`
                : `${host}/portal?token=${tokenRef.id}`;
            }

            return { customerId: customerRef.id, portalLink };
          }}
        />
      )}
    </div>
  );
}
