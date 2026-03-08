import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

const UPDATED = '7 de marzo de 2026';

export default function Terms() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-[#060b1a] text-white px-4 py-14">
      <div className="max-w-2xl mx-auto">

        <button onClick={() => nav(-1)}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors mb-10">
          <ArrowLeft size={13} /> Volver
        </button>

        {/* Header */}
        <div className="mb-10">
          <span className="inline-block text-[9px] font-black uppercase tracking-[0.4em] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full mb-4">
            Documento Legal
          </span>
          <h1 className="text-3xl font-black tracking-tight mb-2">Términos de Servicio</h1>
          <p className="text-white/30 text-sm">Última actualización: {UPDATED} · Dualis ERP by Jesús Salazar</p>
        </div>

        {/* CRITICAL FISCAL NOTICE */}
        <div className="bg-amber-500/[0.08] border border-amber-500/30 rounded-2xl p-5 mb-8 flex gap-3">
          <ShieldAlert size={20} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest mb-1">Aviso Fiscal Prioritario</p>
            <p className="text-xs text-amber-300/70 leading-relaxed">
              Dualis ERP es un sistema en <strong className="text-amber-300">período de prueba beta</strong>, aún no homologado ante el <strong className="text-amber-300">SENIAT</strong> ni ante ninguna autoridad fiscal venezolana. Los documentos generados (facturas, recibos, reportes) <strong className="text-amber-300">no tienen validez fiscal oficial</strong> y no sustituyen la obligación de emitir facturas con máquina fiscal homologada según la Providencia Administrativa SNAT/2011/0071. El usuario asume plena responsabilidad de sus obligaciones tributarias.
            </p>
          </div>
        </div>

        <div className="space-y-8 text-sm text-white/50 leading-relaxed">

          <section>
            <h2 className="text-base font-black text-white mb-2">1. Aceptación</h2>
            <p>Al crear una cuenta y acceder a Dualis ERP, usted acepta íntegramente estos Términos. Si no está de acuerdo con alguna cláusula, no debe utilizar el servicio. El uso continuado del sistema implica aceptación de las versiones actualizadas que se publiquen.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">2. Naturaleza del Servicio — Beta</h2>
            <p>Dualis ERP se encuentra actualmente en <strong className="text-white/70">fase de desarrollo y prueba (beta)</strong>. El servicio se ofrece "tal cual" (<em>as is</em>), sin garantía de disponibilidad continua, exactitud de cálculos o idoneidad para un fin específico. El proveedor no garantiza que el software esté libre de errores ni que su funcionamiento sea ininterrumpido.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">3. Limitaciones Fiscales y Legales</h2>
            <ul className="space-y-2">
              <li>• Este software <strong className="text-white/70">no está homologado</strong> ante el SENIAT como sistema de facturación fiscal.</li>
              <li>• Los comprobantes y reportes generados son de uso <strong className="text-white/70">administrativo interno</strong> y no sustituyen documentos fiscales válidos.</li>
              <li>• Los cálculos de IVA, IGTF y retenciones son referenciales y no constituyen declaración tributaria oficial.</li>
              <li>• El usuario es responsable de cumplir con la <strong className="text-white/70">Ley del IVA (Arts. 54-57)</strong>, el <strong className="text-white/70">Código Orgánico Tributario</strong> y demás normativa vigente en Venezuela.</li>
              <li>• El proveedor no se hace responsable por sanciones, multas o reparos fiscales derivados del uso de este software como sustituto de medios fiscales oficiales.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">4. Uso Permitido</h2>
            <p>El servicio está destinado exclusivamente al control administrativo y operativo de negocios (inventario, cuentas por cobrar y pagar, reportes, punto de venta interno). Está prohibido utilizar Dualis ERP para actividades ilegales, evasión fiscal, fraude o cualquier fin contrario a la legislación venezolana y latinoamericana aplicable.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">5. Responsabilidad del Usuario</h2>
            <p>El usuario se compromete a: (a) mantener sus credenciales confidenciales; (b) no compartir el acceso con personas no autorizadas; (c) ingresar datos verídicos; (d) notificar de inmediato cualquier acceso no autorizado. Cualquier actividad realizada desde su cuenta es su responsabilidad exclusiva.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">6. Propiedad Intelectual</h2>
            <p>Todo el código, diseño, marca, nombre "Dualis ERP" y materiales asociados son propiedad de Jesús Salazar. Se otorga una licencia de uso limitada, no exclusiva e intransferible, revocable en caso de incumplimiento. No se permite copiar, distribuir, modificar o crear obras derivadas sin autorización expresa por escrito.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">7. Planes, Pagos y Reembolsos</h2>
            <p>Los planes de pago se activan previa verificación manual del comprobante de pago. Los precios están denominados en dólares (USD) o su equivalente en bolívares a la tasa BCV del día. No se garantizan reembolsos salvo acuerdo expreso. El período de prueba (trial) es gratuito por 30 días; al vencimiento, el acceso queda suspendido hasta adquirir un plan.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">8. Limitación de Responsabilidad</h2>
            <p>En ningún caso el proveedor será responsable de daños indirectos, pérdida de datos, lucro cesante o daño emergente derivados del uso o imposibilidad de uso del servicio. La responsabilidad máxima del proveedor estará limitada al monto pagado por el usuario en el último mes de servicio.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">9. Modificaciones</h2>
            <p>El proveedor se reserva el derecho de modificar estos Términos en cualquier momento. Los cambios serán notificados dentro de la plataforma con al menos 7 días de anticipación. El uso continuado tras esa notificación implica aceptación.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">10. Jurisdicción y Ley Aplicable</h2>
            <p>Estos Términos se rigen por las leyes de la República Bolivariana de Venezuela. Cualquier disputa se someterá a los tribunales competentes de la ciudad de Caracas, Venezuela, renunciando las partes a cualquier otro fuero.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">11. Contacto</h2>
            <p>
              Para consultas sobre estos Términos contacta a:<br />
              <strong className="text-white/70">Jesús Salazar</strong> — Fundador Dualis ERP<br />
              WhatsApp: 0412-534-3141 · soporte@dualis.app
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/15">Dualis ERP &copy; 2026 · Todos los derechos reservados</p>
        </div>
      </div>
    </div>
  );
}
