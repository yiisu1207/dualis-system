import React, { useState, useMemo, useEffect } from 'react';
import { usePortal } from './PortalGuard';
import { usePortalData } from './usePortalData';
import { addDoc, collection, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadToCloudinary } from '../utils/cloudinary';
import { sendDisputeOpenedEmail } from '../utils/emailService';
import { Dispute, MovementType } from '../../types';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Check, Loader2, Camera, X, FileText,
} from 'lucide-react';

type DisputeType = Dispute['type'];

const DISPUTE_TYPES: { value: DisputeType; label: string; description: string }[] = [
  { value: 'wrong_items', label: 'Productos incorrectos', description: 'Recibí productos distintos a los que solicité' },
  { value: 'missing_items', label: 'Productos faltantes', description: 'Faltan productos en la entrega' },
  { value: 'damaged', label: 'Productos dañados', description: 'Llegaron productos rotos o en mal estado' },
  { value: 'billing_error', label: 'Error en facturación', description: 'Hay un error en montos, descuentos o impuestos' },
  { value: 'other', label: 'Otro motivo', description: 'Otro reclamo no listado arriba' },
];

export default function PortalDispute() {
  const { businessId, customerId, customerName, businessName } = usePortal();
  const { movements, loading } = usePortalData(businessId, customerId);
  const [adminEmail, setAdminEmail] = useState('');

  useEffect(() => {
    if (!businessId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'businesses', businessId));
        if (snap.exists()) {
          const data = snap.data() as any;
          setAdminEmail(data?.ownerEmail || data?.adminEmail || data?.email || '');
        }
      } catch { /* swallow */ }
    })();
  }, [businessId]);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [movementId, setMovementId] = useState<string>('');
  const [type, setType] = useState<DisputeType | ''>('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdDisputeId, setCreatedDisputeId] = useState('');

  const facturas = useMemo(() => {
    // Reclamos sobre ventas/entregas: FACTURA y NDE. Excluir abonos, devoluciones y cualquier movimiento anulado.
    const reclamables = new Set([MovementType.FACTURA, (MovementType as any).NDE].filter(Boolean));
    return movements
      .filter((m) => reclamables.has(m.movementType as any) && !(m as any).anulada)
      .filter((m) => !(m as any).disputeStatus || (m as any).disputeStatus === 'rejected')
      .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())
      .slice(0, 30);
  }, [movements]);

  const selectedMovement = useMemo(
    () => movements.find((m) => m.id === movementId),
    [movements, movementId],
  );

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from((e.target.files || []) as FileList | File[]).slice(0, 4 - photos.length);
    if (!files.length) return;
    setPhotos((prev) => [...prev, ...files]);
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const canNext = () => {
    if (step === 1) return !!movementId;
    if (step === 2) return !!type;
    if (step === 3) return description.trim().length >= 10;
    return false;
  };

  const handleSubmit = async () => {
    if (!movementId || !type || description.trim().length < 10) return;
    setSubmitting(true);
    setError('');
    try {
      // Upload photos a Cloudinary (preset dualis_payments — reusamos el mismo bucket interno)
      const photoUrls: string[] = [];
      for (const file of photos) {
        try {
          const result = await uploadToCloudinary(file, 'dualis_payments');
          photoUrls.push(result.secure_url);
        } catch (err) {
          console.warn('Photo upload failed:', err);
        }
      }

      const payload: Omit<Dispute, 'id'> = {
        businessId,
        customerId,
        customerName,
        movementId,
        movementRef: (selectedMovement as any)?.nroControl || selectedMovement?.concept || '',
        type,
        description: description.trim(),
        photos: photoUrls,
        status: 'open',
        createdAt: new Date().toISOString(),
      };

      const ref = await addDoc(collection(db, 'businesses', businessId, 'disputes'), {
        ...payload,
        createdAtServer: serverTimestamp(),
      });

      // Marcar el Movement como en disputa
      try {
        await updateDoc(doc(db, 'movements', movementId), {
          disputeStatus: 'open',
          disputeId: ref.id,
        });
      } catch (err) {
        console.warn('Movement update failed:', err);
      }

      // Notificar al admin (best-effort, no bloquear)
      if (adminEmail) {
        sendDisputeOpenedEmail(adminEmail, {
          customerName,
          type,
          description: description.trim(),
          movementRef: payload.movementRef,
          businessName,
          photoCount: photoUrls.length,
        }).catch(() => { /* swallow */ });
      }

      setCreatedDisputeId(ref.id);
      setStep(4);
    } catch (err: any) {
      console.error('Dispute submit error:', err);
      setError(err?.message || 'No se pudo enviar el reclamo. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(1);
    setMovementId('');
    setType('');
    setDescription('');
    setPhotos([]);
    setPhotoPreviews([]);
    setCreatedDisputeId('');
    setError('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-in max-w-2xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={18} className="text-amber-400" />
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Reportar reclamo</h1>
        </div>
        <p className="text-xs sm:text-sm text-white/40 font-bold">
          Cuéntanos qué pasó. Lo revisaremos lo antes posible.
        </p>
      </div>

      {/* Stepper */}
      {step < 4 && (
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                step >= s ? 'bg-indigo-500' : 'bg-white/[0.06]'
              }`}
            />
          ))}
        </div>
      )}

      <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-6 shadow-lg">
        {/* ── STEP 1: Seleccionar movimiento ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-black text-white mb-1">¿Sobre qué movimiento es el reclamo?</h2>
              <p className="text-[11px] text-white/40 font-bold">Selecciona la factura o entrega afectada.</p>
            </div>

            {facturas.length === 0 ? (
              <div className="py-10 text-center">
                <FileText size={26} className="text-white/10 mx-auto mb-3" />
                <p className="text-xs font-bold text-white/30">No hay movimientos disponibles para reportar</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {facturas.map((m) => {
                  const selected = m.id === movementId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMovementId(m.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selected
                          ? 'bg-indigo-500/10 border-indigo-500/40'
                          : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{m.concept}</p>
                          <div className="flex items-center gap-2 text-[10px] text-white/40 font-bold mt-0.5">
                            <span>{m.date}</span>
                            <span>{(m as any).nroControl || ''}</span>
                          </div>
                        </div>
                        <span className="text-sm font-black font-mono text-rose-400 shrink-0">
                          ${(m.amountInUSD || m.amount).toFixed(2)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Tipo ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-black text-white mb-1">¿Qué tipo de problema?</h2>
              <p className="text-[11px] text-white/40 font-bold">Elige la opción que mejor describa tu reclamo.</p>
            </div>
            <div className="space-y-2">
              {DISPUTE_TYPES.map((dt) => {
                const selected = dt.value === type;
                return (
                  <button
                    key={dt.value}
                    onClick={() => setType(dt.value)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selected
                        ? 'bg-indigo-500/10 border-indigo-500/40'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    <p className="text-xs font-black text-white">{dt.label}</p>
                    <p className="text-[10px] text-white/40 font-bold mt-0.5">{dt.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STEP 3: Descripción + fotos ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-black text-white mb-1">Cuéntanos los detalles</h2>
              <p className="text-[11px] text-white/40 font-bold">Mínimo 10 caracteres. Sé específico.</p>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="Ej: Pedí 5 cajas de tornillos pero solo llegaron 3, y una venía con la caja rota..."
              className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
            <div className="text-right text-[10px] text-white/30 font-bold">{description.length}/1000</div>

            {/* Fotos opcionales */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-2">
                Fotos (opcional, hasta 4)
              </p>
              <div className="grid grid-cols-4 gap-2">
                {photoPreviews.map((src, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-white/[0.04]">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {photos.length < 4 && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-white/[0.1] hover:border-indigo-500/40 flex items-center justify-center cursor-pointer transition-all">
                    <Camera size={16} className="text-white/30" />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {error && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg">
                <p className="text-[11px] font-bold text-rose-400">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Success ── */}
        {step === 4 && (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <Check size={26} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-white mb-1">Reclamo enviado</h2>
              <p className="text-xs text-white/50 font-bold">
                Recibimos tu reporte #{createdDisputeId.slice(-6).toUpperCase()}.<br />
                Te contactaremos pronto con una respuesta.
              </p>
            </div>
            <button
              onClick={reset}
              className="px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Reportar otro
            </button>
          </div>
        )}

        {/* Navegación */}
        {step < 4 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/[0.06]">
            <button
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
              disabled={step === 1}
              className="flex items-center gap-1 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} /> Atrás
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (canNext() ? ((s + 1) as 1 | 2 | 3) : s))}
                disabled={!canNext()}
                className="flex items-center gap-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canNext() || submitting}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Enviar reclamo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
