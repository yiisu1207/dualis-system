import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const UPDATED = '7 de marzo de 2026';

export default function Privacy() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-[#060b1a] text-white px-4 py-14">
      <div className="max-w-2xl mx-auto">

        <button onClick={() => nav(-1)}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors mb-10">
          <ArrowLeft size={13} /> Volver
        </button>

        <div className="mb-10">
          <span className="inline-block text-[9px] font-black uppercase tracking-[0.4em] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 rounded-full mb-4">
            Documento Legal
          </span>
          <h1 className="text-3xl font-black tracking-tight mb-2">Política de Privacidad</h1>
          <p className="text-white/30 text-sm">Última actualización: {UPDATED} · Dualis ERP by Jesús Salazar</p>
        </div>

        <div className="space-y-8 text-sm text-white/50 leading-relaxed">

          <section>
            <h2 className="text-base font-black text-white mb-2">1. Responsable del Tratamiento</h2>
            <p>
              El responsable del tratamiento de sus datos personales es <strong className="text-white/70">Jesús Salazar</strong>, desarrollador y propietario de Dualis ERP (en adelante "el Proveedor"), con contacto en soporte@dualis.online y WhatsApp 0412-534-3141.
            </p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">2. Datos que Recopilamos</h2>
            <ul className="space-y-2">
              <li>• <strong className="text-white/70">Datos de registro:</strong> nombre, correo electrónico, cédula/RIF, país.</li>
              <li>• <strong className="text-white/70">Datos operativos:</strong> inventario, movimientos, clientes, proveedores y configuraciones del negocio ingresados por el usuario.</li>
              <li>• <strong className="text-white/70">Datos de pago:</strong> capturas de comprobantes de pago (solo para verificación manual de planes). No almacenamos datos de tarjetas bancarias.</li>
              <li>• <strong className="text-white/70">Datos técnicos:</strong> registros de acceso, dispositivo, dirección IP y eventos de auditoría internos.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">3. Finalidad del Tratamiento</h2>
            <ul className="space-y-2">
              <li>• Prestación y mejora del servicio Dualis ERP.</li>
              <li>• Autenticación y seguridad de la cuenta.</li>
              <li>• Verificación de pagos y activación de planes.</li>
              <li>• Soporte técnico y comunicaciones relacionadas con el servicio.</li>
              <li>• Cumplimiento de obligaciones legales aplicables.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">4. Base Legal</h2>
            <p>El tratamiento de datos se realiza con base en: (a) el consentimiento del usuario al registrarse; (b) la ejecución del contrato de prestación de servicios; (c) el cumplimiento de obligaciones legales en Venezuela (Ley de Infogobierno, LPDP en proceso legislativo).</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">5. Almacenamiento y Seguridad</h2>
            <p>Los datos se almacenan en <strong className="text-white/70">Google Firebase (Firestore / Authentication)</strong> con servidores ubicados en los Estados Unidos. Firebase aplica cifrado en tránsito (TLS) y en reposo. Aunque implementamos medidas técnicas razonables, ningún sistema es 100% infalible.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">6. Compartición con Terceros</h2>
            <ul className="space-y-2">
              <li>• <strong className="text-white/70">No vendemos</strong> ni comercializamos sus datos personales.</li>
              <li>• Compartimos datos únicamente con proveedores tecnológicos necesarios para operar el servicio (Google Firebase, EmailJS para correos transaccionales).</li>
              <li>• Podemos divulgar información si una autoridad legal venezolana lo requiere mediante orden judicial.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">7. Retención de Datos</h2>
            <p>Los datos se conservan mientras la cuenta esté activa y durante un período adicional de 12 meses tras la cancelación, salvo que el usuario solicite eliminación anticipada o la ley exija un plazo diferente.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">8. Derechos del Usuario</h2>
            <p>Usted tiene derecho a:</p>
            <ul className="space-y-1 mt-2">
              <li>• <strong className="text-white/70">Acceso:</strong> conocer qué datos tenemos sobre usted.</li>
              <li>• <strong className="text-white/70">Rectificación:</strong> corregir datos inexactos.</li>
              <li>• <strong className="text-white/70">Eliminación:</strong> solicitar borrado de su cuenta y datos.</li>
              <li>• <strong className="text-white/70">Portabilidad:</strong> recibir sus datos en formato exportable.</li>
              <li>• <strong className="text-white/70">Oposición:</strong> limitar ciertos tratamientos no esenciales.</li>
            </ul>
            <p className="mt-2">Para ejercer estos derechos, contacte a soporte@dualis.online o al WhatsApp 0412-534-3141.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">9. Cookies y Almacenamiento Local</h2>
            <p>Dualis ERP utiliza <strong className="text-white/70">localStorage</strong> del navegador para persistir preferencias de usuario (tema, idioma, estado del sidebar, aceptación de términos). No utilizamos cookies de rastreo publicitario de terceros.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">10. Menores de Edad</h2>
            <p>El servicio no está dirigido a personas menores de 18 años. No recopilamos conscientemente datos de menores. Si detectamos que un menor ha creado una cuenta sin consentimiento, procederemos a eliminarla.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">11. Modificaciones</h2>
            <p>Esta Política puede actualizarse. Los cambios serán notificados dentro de la plataforma. El uso continuado tras la notificación implica aceptación de la versión vigente.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-white mb-2">12. Contacto</h2>
            <p>
              <strong className="text-white/70">Jesús Salazar</strong> — Responsable de Datos, Dualis ERP<br />
              WhatsApp: 0412-534-3141<br />
              Correo: soporte@dualis.online
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
