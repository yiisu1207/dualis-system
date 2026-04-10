import emailjs from '@emailjs/browser';

const SVC  = import.meta.env.VITE_EMAILJS_SERVICE_ID       ?? '';
const PUB  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY       ?? '';
const OTP_TPL     = import.meta.env.VITE_EMAILJS_OTP_TEMPLATE     ?? '';
const WELCOME_TPL = import.meta.env.VITE_EMAILJS_WELCOME_TEMPLATE ?? '';
const INVITE_TPL  = import.meta.env.VITE_EMAILJS_INVITE_TEMPLATE  ?? '';

const DEV = !SVC || !PUB;

/* ── Helpers ──────────────────────────────────────────────────────────── */
export function generateOTP(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return (n % 1_000_000).toString().padStart(6, '0');
}

/* ── Shared styles ────────────────────────────────────────────────────── */
const BRAND = {
  bg: '#070b14',
  card: '#0d1424',
  border: 'rgba(255,255,255,0.07)',
  gradientPrimary: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
  gradientGreen: 'linear-gradient(135deg,#059669,#0d9488)',
  textPrimary: '#e2e8f0',
  textSecondary: 'rgba(255,255,255,0.55)',
  textMuted: 'rgba(255,255,255,0.30)',
  accent: '#a5b4fc',
  accentGreen: '#6ee7b7',
};

function emailShell(headerGradient: string, headerTitle: string, headerSubtitle: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:48px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:28px;overflow:hidden;box-shadow:0 24px 48px rgba(0,0,0,0.4);">

        <!-- Header -->
        <tr>
          <td style="background:${headerGradient};padding:44px 48px;text-align:center;">
            <img src="https://dualis.online/logo.png" alt="Dualis" width="80" height="80" style="display:block;margin:0 auto 16px;border-radius:16px;" />
            <h1 style="margin:0 0 4px;font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Dualis ERP</h1>
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:4px;font-weight:700;">${headerSubtitle}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:44px 48px 0;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Support Contact -->
        <tr>
          <td style="padding:0 48px 44px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:20px;margin-top:32px;">
              <tr>
                <td style="padding:28px 32px;">
                  <p style="margin:0 0 16px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:3px;color:rgba(255,255,255,0.22);">Soporte Dualis</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:48px;vertical-align:top;">
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#4f46e5,#7c3aed);text-align:center;vertical-align:middle;">
                              <span style="font-size:17px;font-weight:900;color:#fff;line-height:44px;">JS</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td style="padding-left:16px;">
                        <p style="margin:0 0 3px;font-size:15px;font-weight:800;color:${BRAND.textPrimary};">Jesus Salazar</p>
                        <p style="margin:0;font-size:13px;color:${BRAND.textMuted};">Fundador &amp; CEO, Dualis ERP</p>
                      </td>
                    </tr>
                  </table>
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
                    <tr>
                      <td style="width:50%;font-size:13px;color:${BRAND.textMuted};line-height:1.8;">
                        <strong style="color:${BRAND.textSecondary};">WhatsApp</strong><br>
                        <a href="https://wa.me/584125343141" style="color:${BRAND.accent};text-decoration:none;font-weight:700;">+58 412-534-3141</a>
                      </td>
                      <td style="width:50%;font-size:13px;color:${BRAND.textMuted};line-height:1.8;">
                        <strong style="color:${BRAND.textSecondary};">Correo</strong><br>
                        <a href="mailto:soporte@dualis.online" style="color:${BRAND.accent};text-decoration:none;font-weight:700;">soporte@dualis.online</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 48px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.25);">Dualis ERP &mdash; Sistema Empresarial Inteligente</p>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.12);">Venezuela &amp; Latinoam&eacute;rica &nbsp;&bull;&nbsp; &copy; ${new Date().getFullYear()} Dualis</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ── OTP email ────────────────────────────────────────────────────────── */
function buildOTPHtml(name: string, otp: string): string {
  const digitBoxes = otp.split('')
    .map(d => `<td style="width:54px;height:68px;text-align:center;font-size:34px;font-weight:900;font-family:'Courier New',monospace;background:#111827;border:2px solid #4f46e5;border-radius:14px;color:#a5b4fc;">${d}</td>`)
    .join('<td style="width:8px;"></td>');

  return emailShell(BRAND.gradientPrimary, 'Dualis ERP', 'Verificaci&oacute;n de correo', `
    <h2 style="margin:0 0 12px;font-size:26px;font-weight:900;color:${BRAND.textPrimary};letter-spacing:-0.5px;">
      Hola, ${name}
    </h2>
    <p style="margin:0 0 36px;font-size:16px;color:${BRAND.textSecondary};line-height:1.7;">
      Recibimos una solicitud para verificar tu correo electr&oacute;nico. Ingresa el siguiente c&oacute;digo en la app para continuar.
    </p>

    <!-- OTP Digits -->
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
      <tr>${digitBoxes}</tr>
    </table>
    <p style="margin:0 0 36px;font-size:13px;color:${BRAND.textMuted};text-align:center;">
      V&aacute;lido por <strong style="color:${BRAND.textSecondary};">10 minutos</strong>
    </p>

    <!-- Warning -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,0.07);border:1.5px solid rgba(239,68,68,0.25);border-radius:18px;">
      <tr>
        <td style="padding:22px 28px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:900;color:#f87171;">&#9888; Advertencia de seguridad</p>
          <p style="margin:0;font-size:14px;color:rgba(248,113,113,0.75);line-height:1.7;">
            Este c&oacute;digo es <strong style="color:#f87171;">confidencial</strong>. Nunca lo compartas con nadie. Nuestro equipo jam&aacute;s te lo solicitar&aacute;.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:28px 0 0;font-size:13px;color:${BRAND.textMuted};line-height:1.7;">
      Si no solicitaste esta verificaci&oacute;n, ignora este correo.
    </p>
  `);
}

/* ── Welcome email ────────────────────────────────────────────────────── */
function buildWelcomeHtml(name: string, _businessId: string, customUrl?: string): string {
  const urlDisplay = customUrl || 'dualis.online';
  const urlHref = customUrl ? `https://${customUrl}` : 'https://dualis.online';

  return emailShell(BRAND.gradientPrimary, 'Dualis ERP', 'Bienvenido', `
    <h2 style="margin:0 0 12px;font-size:28px;font-weight:900;color:${BRAND.textPrimary};letter-spacing:-0.5px;">
      &#127881; &iexcl;Bienvenido, ${name}!
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:${BRAND.textSecondary};line-height:1.8;">
      Tu cuenta en <strong style="color:${BRAND.accent};">Dualis ERP</strong> ha sido creada exitosamente.
      Estamos encantados de tenerte con nosotros.
    </p>

    <!-- URL personalizada -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border:2px solid rgba(79,70,229,0.35);border-radius:20px;margin:0 0 20px;">
      <tr>
        <td style="padding:28px 32px;text-align:center;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:4px;color:#6366f1;">Tu URL personalizada</p>
          <a href="${urlHref}" style="display:inline-block;padding:16px 36px;background:rgba(79,70,229,0.15);border:2px solid rgba(79,70,229,0.4);border-radius:16px;text-decoration:none;margin:8px 0 12px;">
            <span style="font-size:22px;font-weight:900;color:${BRAND.accent};font-family:'Courier New',monospace;letter-spacing:0.5px;">${urlDisplay}</span>
          </a>
          <p style="margin:0;font-size:13px;color:${BRAND.textMuted};line-height:1.7;">
            Comparte esta URL con tu equipo para que se unan a tu empresa.
          </p>
        </td>
      </tr>
    </table>

    <!-- Acceso -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:20px;margin:0 0 16px;">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:4px;color:rgba(255,255,255,0.22);">C&oacute;mo acceder</p>
          <p style="margin:0 0 8px;font-size:16px;font-weight:800;color:${BRAND.textPrimary};">
            Inicia sesi&oacute;n con tu correo y contrase&ntilde;a
          </p>
          <p style="margin:0;font-size:14px;color:${BRAND.textMuted};">
            T&uacute; y todo tu equipo acceden <strong>exclusivamente</strong> desde <a href="${urlHref}" style="color:${BRAND.accent};text-decoration:none;font-weight:700;">${urlDisplay}</a>. No hay login en dualis.online.
          </p>
        </td>
      </tr>
    </table>

    <!-- Invitar equipo -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:20px;margin:0 0 16px;">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:4px;color:rgba(255,255,255,0.22);">Invitar a tu equipo</p>
          <p style="margin:0 0 8px;font-size:14px;color:${BRAND.textMuted};line-height:1.7;">
            Desde <strong style="color:${BRAND.textPrimary};">Configuraci&oacute;n &rarr; Equipo</strong>, env&iacute;a invitaciones por correo. Cada miembro recibir&aacute; un enlace para registrarse y acceder desde <strong style="color:${BRAND.accent};">${urlDisplay}</strong>.
          </p>
        </td>
      </tr>
    </table>

    <!-- Reglas -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:20px;">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:4px;color:rgba(255,255,255,0.22);">Importante</p>
          <p style="margin:0 0 6px;font-size:14px;color:${BRAND.textMuted};line-height:1.7;">&#8226; Tus datos est&aacute;n cifrados y aislados de otras empresas.</p>
          <p style="margin:0 0 6px;font-size:14px;color:${BRAND.textMuted};line-height:1.7;">&#8226; Prueba gratuita de 30 d&iacute;as con acceso a todos los m&oacute;dulos.</p>
          <p style="margin:0;font-size:14px;color:${BRAND.textMuted};line-height:1.7;">&#8226; Soporte disponible por WhatsApp y correo en espa&ntilde;ol.</p>
        </td>
      </tr>
    </table>

    <p style="margin:28px 0 0;font-size:14px;color:${BRAND.textMuted};line-height:1.7;">
      Si tienes alguna pregunta, no dudes en contactarnos. Estamos aqu&iacute; para ayudarte.
    </p>
  `);
}

/* ── Invite email ─────────────────────────────────────────────────────── */
function buildInviteHtml(inviterName: string, businessName: string, role: string, inviteUrl: string, expiresAt: string): string {
  const roleLabels: Record<string, string> = {
    owner: 'Propietario', admin: 'Administrador', ventas: 'Ventas',
    auditor: 'Auditor', staff: 'Staff', member: 'Miembro',
  };
  const roleLabel = roleLabels[role] || role;
  const expiresDate = new Date(expiresAt).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return emailShell(BRAND.gradientGreen, 'Dualis ERP', 'Invitaci&oacute;n al equipo', `
    <h2 style="margin:0 0 12px;font-size:28px;font-weight:900;color:${BRAND.textPrimary};letter-spacing:-0.5px;">
      &#128075; &iexcl;Te han invitado!
    </h2>
    <p style="margin:0 0 32px;font-size:17px;color:${BRAND.textSecondary};line-height:1.8;">
      <strong style="color:${BRAND.textPrimary};">${inviterName}</strong> te ha invitado a unirte a
      <strong style="color:${BRAND.accentGreen};">${businessName}</strong> como
      <strong style="color:${BRAND.accentGreen};">${roleLabel}</strong>.
    </p>

    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr>
        <td align="center">
          <a href="${inviteUrl}" style="display:inline-block;padding:18px 56px;background:${BRAND.gradientGreen};color:#fff;font-size:15px;font-weight:900;text-decoration:none;border-radius:16px;text-transform:uppercase;letter-spacing:2px;box-shadow:0 8px 24px rgba(5,150,105,0.35);">
            Aceptar Invitaci&oacute;n
          </a>
        </td>
      </tr>
    </table>

    <!-- Details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:20px;margin:0 0 28px;">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 16px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:3px;color:rgba(255,255,255,0.22);">Detalles</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;font-size:15px;color:${BRAND.textMuted};border-bottom:1px solid rgba(255,255,255,0.04);">
                <strong style="color:${BRAND.textSecondary};">Empresa</strong>
              </td>
              <td style="padding:8px 0;font-size:15px;color:${BRAND.textPrimary};text-align:right;border-bottom:1px solid rgba(255,255,255,0.04);font-weight:700;">
                ${businessName}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:15px;color:${BRAND.textMuted};border-bottom:1px solid rgba(255,255,255,0.04);">
                <strong style="color:${BRAND.textSecondary};">Rol asignado</strong>
              </td>
              <td style="padding:8px 0;font-size:15px;color:${BRAND.accentGreen};text-align:right;border-bottom:1px solid rgba(255,255,255,0.04);font-weight:700;">
                ${roleLabel}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:15px;color:${BRAND.textMuted};">
                <strong style="color:${BRAND.textSecondary};">Expira</strong>
              </td>
              <td style="padding:8px 0;font-size:15px;color:${BRAND.textPrimary};text-align:right;font-weight:700;">
                ${expiresDate}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Fallback link -->
    <p style="margin:0 0 4px;font-size:13px;color:${BRAND.textMuted};text-align:center;">
      Si el bot&oacute;n no funciona, copia este enlace:
    </p>
    <p style="margin:0;font-size:12px;color:${BRAND.accent};text-align:center;word-break:break-all;">
      <a href="${inviteUrl}" style="color:${BRAND.accent};text-decoration:underline;">${inviteUrl}</a>
    </p>

    <p style="margin:28px 0 0;font-size:13px;color:${BRAND.textMuted};line-height:1.7;">
      Si no esperabas esta invitaci&oacute;n, puedes ignorar este correo de forma segura.
    </p>
  `);
}

/* ── Public API ───────────────────────────────────────────────────────── */
export async function sendOTPEmail(toEmail: string, toName: string, otp: string): Promise<void> {
  if (DEV) {
    console.info(`%c[EmailService] OTP para ${toEmail}: ${otp}`, 'color:#6366f1;font-weight:bold;font-size:14px');
    return;
  }
  const tpl = OTP_TPL || WELCOME_TPL;
  if (!tpl) {
    console.warn('[EmailService] No email template configured for OTP');
    return;
  }
  await emailjs.send(SVC, tpl, {
    to_email:  toEmail,
    to_name:   toName,
    subject:   'Tu codigo de verificacion — Dualis ERP',
    html_body: buildOTPHtml(toName, otp),
  }, PUB);
}

export async function sendWelcomeEmail(toEmail: string, toName: string, businessId: string, customUrl?: string): Promise<void> {
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Bienvenida enviada a ${toEmail} (${businessId}) — URL: ${customUrl || 'dualis.online'}`, 'color:#10b981;font-weight:bold');
    return;
  }
  await emailjs.send(SVC, WELCOME_TPL, {
    to_email:  toEmail,
    to_name:   toName,
    subject:   'Bienvenido a Dualis ERP — Tu URL personalizada',
    html_body: buildWelcomeHtml(toName, businessId, customUrl),
  }, PUB);
}

export async function sendInviteEmail(payload: {
  toEmail: string;
  inviterName: string;
  businessName: string;
  role: string;
  inviteUrl: string;
  expiresAt: string;
}): Promise<void> {
  const { toEmail, inviterName, businessName, role, inviteUrl, expiresAt } = payload;
  if (DEV || (!INVITE_TPL && !WELCOME_TPL)) {
    console.info(`%c[EmailService] Invitacion enviada a ${toEmail} → ${inviteUrl}`, 'color:#059669;font-weight:bold;font-size:14px');
    return;
  }
  const tpl = INVITE_TPL || WELCOME_TPL;
  await emailjs.send(SVC, tpl, {
    to_email:  toEmail,
    to_name:   toEmail,
    subject:   `${inviterName} te invito a ${businessName} — Dualis ERP`,
    html_body: buildInviteHtml(inviterName, businessName, role, inviteUrl, expiresAt),
  }, PUB);
}

/* ── Tesorería: pagos del portal (P6.G) ───────────────────────────────── */

const fmtUsd = (n: number) => `$${(n || 0).toFixed(2)}`;

function buildPaymentPendingHtml(opts: {
  customerName: string;
  amount: number;
  bankName: string;
  reference: string;
  businessName: string;
}): string {
  return emailShell(BRAND.gradientPrimary, 'Dualis ERP', 'Nuevo pago pendiente', `
    <h2 style="margin:0 0 12px;font-size:24px;font-weight:900;color:${BRAND.textPrimary};">
      Pago pendiente de revisión
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.textSecondary};line-height:1.7;">
      <strong style="color:${BRAND.textPrimary};">${opts.customerName}</strong> registró un pago en el portal de
      <strong style="color:${BRAND.accent};">${opts.businessName}</strong>. Revísalo en Tesorería &rarr; Solicitudes.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:18px;">
      <tr><td style="padding:24px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:6px 0;color:${BRAND.textMuted};font-size:13px;">Monto</td><td style="padding:6px 0;text-align:right;color:${BRAND.textPrimary};font-weight:900;font-size:18px;">${fmtUsd(opts.amount)}</td></tr>
          <tr><td style="padding:6px 0;color:${BRAND.textMuted};font-size:13px;">Banco</td><td style="padding:6px 0;text-align:right;color:${BRAND.textPrimary};font-weight:700;">${opts.bankName}</td></tr>
          <tr><td style="padding:6px 0;color:${BRAND.textMuted};font-size:13px;">Referencia</td><td style="padding:6px 0;text-align:right;color:${BRAND.accent};font-family:'Courier New',monospace;font-weight:700;">${opts.reference}</td></tr>
        </table>
      </td></tr>
    </table>
  `);
}

function buildPaymentApprovedHtml(opts: {
  customerName: string;
  amount: number;
  businessName: string;
  reviewNote?: string;
  receiptPdfUrl?: string;
}): string {
  return emailShell(BRAND.gradientGreen, 'Dualis ERP', 'Pago aprobado', `
    <h2 style="margin:0 0 12px;font-size:26px;font-weight:900;color:${BRAND.textPrimary};">
      &#10004; Pago aprobado
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.textSecondary};line-height:1.7;">
      Hola <strong style="color:${BRAND.textPrimary};">${opts.customerName}</strong>, tu pago de
      <strong style="color:${BRAND.accentGreen};">${fmtUsd(opts.amount)}</strong> en
      <strong style="color:${BRAND.accentGreen};">${opts.businessName}</strong> fue aprobado.
    </p>
    ${opts.reviewNote ? `<p style="margin:0 0 20px;font-size:13px;color:${BRAND.textMuted};font-style:italic;">"${opts.reviewNote}"</p>` : ''}
    ${opts.receiptPdfUrl ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr><td align="center">
          <a href="${opts.receiptPdfUrl}" style="display:inline-block;padding:14px 36px;background:${BRAND.gradientGreen};color:#fff;font-size:14px;font-weight:900;text-decoration:none;border-radius:14px;text-transform:uppercase;letter-spacing:1.5px;">
            Descargar comprobante
          </a>
        </td></tr>
      </table>
    ` : ''}
  `);
}

function buildPaymentRejectedHtml(opts: {
  customerName: string;
  amount: number;
  businessName: string;
  reason: string;
}): string {
  return emailShell(BRAND.gradientPrimary, 'Dualis ERP', 'Pago rechazado', `
    <h2 style="margin:0 0 12px;font-size:26px;font-weight:900;color:${BRAND.textPrimary};">
      Pago rechazado
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:${BRAND.textSecondary};line-height:1.7;">
      Hola <strong style="color:${BRAND.textPrimary};">${opts.customerName}</strong>, tu pago de
      <strong style="color:#fca5a5;">${fmtUsd(opts.amount)}</strong> en
      <strong style="color:${BRAND.accent};">${opts.businessName}</strong> no pudo ser confirmado.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,0.07);border:1.5px solid rgba(239,68,68,0.25);border-radius:18px;">
      <tr><td style="padding:22px 28px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:900;color:#f87171;text-transform:uppercase;letter-spacing:2px;">Motivo</p>
        <p style="margin:0;font-size:14px;color:rgba(248,113,113,0.85);line-height:1.7;">${opts.reason}</p>
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:${BRAND.textMuted};line-height:1.7;">
      Puedes registrar un nuevo pago desde el portal en cualquier momento.
    </p>
  `);
}

function buildPaymentRevertedHtml(opts: {
  customerName: string;
  amount: number;
  businessName: string;
  reason: string;
}): string {
  return emailShell(BRAND.gradientPrimary, 'Dualis ERP', 'Pago revertido', `
    <h2 style="margin:0 0 12px;font-size:24px;font-weight:900;color:${BRAND.textPrimary};">
      Pago revertido
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:${BRAND.textSecondary};line-height:1.7;">
      <strong style="color:${BRAND.textPrimary};">${opts.customerName}</strong>, durante la conciliación bancaria de
      <strong style="color:${BRAND.accent};">${opts.businessName}</strong> tu pago de
      <strong style="color:#fca5a5;">${fmtUsd(opts.amount)}</strong> fue revertido.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,0.07);border:1.5px solid rgba(239,68,68,0.25);border-radius:18px;">
      <tr><td style="padding:22px 28px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:900;color:#f87171;text-transform:uppercase;letter-spacing:2px;">Motivo</p>
        <p style="margin:0;font-size:14px;color:rgba(248,113,113,0.85);line-height:1.7;">${opts.reason}</p>
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:${BRAND.textMuted};line-height:1.7;">
      Si crees que esto es un error, contacta directamente al negocio para regularizar la situación.
    </p>
  `);
}

function buildOverdueDigestHtml(opts: {
  count: number;
  list: { customerName: string; amount: number; createdAt: string }[];
  businessName: string;
}): string {
  const rows = opts.list.slice(0, 10).map(p => {
    const ageH = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 3600000);
    return `<tr>
      <td style="padding:8px 0;color:${BRAND.textPrimary};font-size:14px;font-weight:700;">${p.customerName}</td>
      <td style="padding:8px 0;text-align:right;color:${BRAND.accent};font-size:14px;font-weight:900;">${fmtUsd(p.amount)}</td>
      <td style="padding:8px 0;text-align:right;color:${BRAND.textMuted};font-size:12px;">${ageH}h</td>
    </tr>`;
  }).join('');

  return emailShell(BRAND.gradientPrimary, 'Dualis ERP', 'Pagos pendientes', `
    <h2 style="margin:0 0 12px;font-size:24px;font-weight:900;color:${BRAND.textPrimary};">
      ${opts.count} pago${opts.count !== 1 ? 's' : ''} esperando revisión
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:${BRAND.textSecondary};line-height:1.7;">
      Tienes pagos pendientes en <strong style="color:${BRAND.accent};">${opts.businessName}</strong> con más de 24 horas sin atender.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:18px;">
      <tr><td style="padding:24px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        ${opts.list.length > 10 ? `<p style="margin:12px 0 0;text-align:center;color:${BRAND.textMuted};font-size:12px;">+${opts.list.length - 10} más</p>` : ''}
      </td></tr>
    </table>
  `);
}

export async function sendPaymentPendingEmail(toEmail: string, opts: {
  customerName: string;
  amount: number;
  bankName: string;
  reference: string;
  businessName: string;
}): Promise<void> {
  if (!toEmail) return;
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Pago pendiente → ${toEmail}: ${opts.customerName} ${fmtUsd(opts.amount)} (${opts.bankName})`, 'color:#f59e0b;font-weight:bold');
    return;
  }
  try {
    await emailjs.send(SVC, WELCOME_TPL, {
      to_email:  toEmail,
      to_name:   'Administrador',
      subject:   `Nuevo pago pendiente — ${opts.customerName} ${fmtUsd(opts.amount)}`,
      html_body: buildPaymentPendingHtml(opts),
    }, PUB);
  } catch (err) {
    console.error('[EmailService] sendPaymentPendingEmail failed:', err);
  }
}

export async function sendPaymentApprovedEmail(toEmail: string, opts: {
  customerName: string;
  amount: number;
  businessName: string;
  reviewNote?: string;
  receiptPdfUrl?: string;
}): Promise<void> {
  if (!toEmail) return;
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Pago aprobado → ${toEmail}: ${fmtUsd(opts.amount)}`, 'color:#10b981;font-weight:bold');
    return;
  }
  try {
    await emailjs.send(SVC, WELCOME_TPL, {
      to_email:  toEmail,
      to_name:   opts.customerName,
      subject:   `Pago aprobado ${fmtUsd(opts.amount)} — ${opts.businessName}`,
      html_body: buildPaymentApprovedHtml(opts),
    }, PUB);
  } catch (err) {
    console.error('[EmailService] sendPaymentApprovedEmail failed:', err);
  }
}

export async function sendPaymentRejectedEmail(toEmail: string, opts: {
  customerName: string;
  amount: number;
  businessName: string;
  reason: string;
}): Promise<void> {
  if (!toEmail) return;
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Pago rechazado → ${toEmail}: ${opts.reason}`, 'color:#ef4444;font-weight:bold');
    return;
  }
  try {
    await emailjs.send(SVC, WELCOME_TPL, {
      to_email:  toEmail,
      to_name:   opts.customerName,
      subject:   `Pago rechazado — ${opts.businessName}`,
      html_body: buildPaymentRejectedHtml(opts),
    }, PUB);
  } catch (err) {
    console.error('[EmailService] sendPaymentRejectedEmail failed:', err);
  }
}

export async function sendPaymentRevertedEmail(toEmail: string, opts: {
  customerName: string;
  amount: number;
  businessName: string;
  reason: string;
}): Promise<void> {
  if (!toEmail) return;
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Pago revertido → ${toEmail}: ${opts.reason}`, 'color:#ef4444;font-weight:bold');
    return;
  }
  try {
    await emailjs.send(SVC, WELCOME_TPL, {
      to_email:  toEmail,
      to_name:   opts.customerName,
      subject:   `Pago revertido — ${opts.businessName}`,
      html_body: buildPaymentRevertedHtml(opts),
    }, PUB);
  } catch (err) {
    console.error('[EmailService] sendPaymentRevertedEmail failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// DISPUTES — emails para reclamos del portal
// ─────────────────────────────────────────────────────────────────────

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  wrong_items:   'Productos incorrectos',
  missing_items: 'Productos faltantes',
  damaged:       'Productos dañados',
  billing_error: 'Error de facturación',
  other:         'Otro motivo',
};

function buildDisputeOpenedHtml(opts: {
  customerName: string;
  type: string;
  description: string;
  movementRef: string;
  businessName: string;
  photoCount: number;
}): string {
  const typeLabel = DISPUTE_TYPE_LABELS[opts.type] || opts.type;
  return emailShell(BRAND.gradientPrimary, 'Dualis ERP', 'Nuevo reclamo', `
    <h2 style="margin:0 0 12px;font-size:24px;font-weight:900;color:${BRAND.textPrimary};">
      Nuevo reclamo recibido
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:${BRAND.textSecondary};line-height:1.7;">
      <strong style="color:${BRAND.textPrimary};">${opts.customerName}</strong> reportó un problema en
      <strong style="color:${BRAND.accent};">${opts.businessName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(245,158,11,0.07);border:1.5px solid rgba(245,158,11,0.25);border-radius:18px;">
      <tr><td style="padding:22px 28px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:900;color:#fbbf24;text-transform:uppercase;letter-spacing:2px;">Tipo</p>
        <p style="margin:0 0 16px;font-size:15px;font-weight:900;color:${BRAND.textPrimary};">${typeLabel}</p>
        <p style="margin:0 0 8px;font-size:11px;font-weight:900;color:#fbbf24;text-transform:uppercase;letter-spacing:2px;">Movimiento</p>
        <p style="margin:0 0 16px;font-size:13px;color:${BRAND.textSecondary};">${opts.movementRef || '—'}</p>
        <p style="margin:0 0 8px;font-size:11px;font-weight:900;color:#fbbf24;text-transform:uppercase;letter-spacing:2px;">Descripción</p>
        <p style="margin:0;font-size:13px;color:${BRAND.textSecondary};line-height:1.7;">${opts.description}</p>
        ${opts.photoCount > 0 ? `<p style="margin:16px 0 0;font-size:12px;color:${BRAND.textMuted};">📎 ${opts.photoCount} foto${opts.photoCount !== 1 ? 's' : ''} adjunta${opts.photoCount !== 1 ? 's' : ''}</p>` : ''}
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:${BRAND.textMuted};line-height:1.7;">
      Revisa el reclamo desde el panel de Dualis lo antes posible.
    </p>
  `);
}

function buildDisputeResolvedHtml(opts: {
  customerName: string;
  resolution: string;
  movementRef: string;
  businessName: string;
}): string {
  return emailShell(BRAND.gradientGreen, 'Dualis ERP', 'Reclamo resuelto', `
    <h2 style="margin:0 0 12px;font-size:26px;font-weight:900;color:${BRAND.textPrimary};">
      &#10004; Reclamo resuelto
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:${BRAND.textSecondary};line-height:1.7;">
      Hola <strong style="color:${BRAND.textPrimary};">${opts.customerName}</strong>, tu reclamo en
      <strong style="color:${BRAND.accentGreen};">${opts.businessName}</strong> fue revisado y resuelto.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(16,185,129,0.07);border:1.5px solid rgba(16,185,129,0.25);border-radius:18px;">
      <tr><td style="padding:22px 28px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:900;color:#34d399;text-transform:uppercase;letter-spacing:2px;">Respuesta</p>
        <p style="margin:0;font-size:14px;color:${BRAND.textSecondary};line-height:1.7;">${opts.resolution}</p>
        ${opts.movementRef ? `<p style="margin:16px 0 0;font-size:12px;color:${BRAND.textMuted};">Movimiento: ${opts.movementRef}</p>` : ''}
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:${BRAND.textMuted};line-height:1.7;">
      Si tienes dudas adicionales puedes registrar un nuevo reclamo desde tu portal.
    </p>
  `);
}

function buildDisputeRejectedHtml(opts: {
  customerName: string;
  resolution: string;
  movementRef: string;
  businessName: string;
}): string {
  return emailShell(BRAND.gradientPrimary, 'Dualis ERP', 'Reclamo cerrado', `
    <h2 style="margin:0 0 12px;font-size:24px;font-weight:900;color:${BRAND.textPrimary};">
      Reclamo cerrado
    </h2>
    <p style="margin:0 0 20px;font-size:15px;color:${BRAND.textSecondary};line-height:1.7;">
      Hola <strong style="color:${BRAND.textPrimary};">${opts.customerName}</strong>, tu reclamo en
      <strong style="color:${BRAND.accent};">${opts.businessName}</strong> fue revisado y cerrado.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,0.07);border:1.5px solid rgba(239,68,68,0.25);border-radius:18px;">
      <tr><td style="padding:22px 28px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:900;color:#f87171;text-transform:uppercase;letter-spacing:2px;">Motivo</p>
        <p style="margin:0;font-size:14px;color:rgba(248,113,113,0.85);line-height:1.7;">${opts.resolution}</p>
        ${opts.movementRef ? `<p style="margin:16px 0 0;font-size:12px;color:${BRAND.textMuted};">Movimiento: ${opts.movementRef}</p>` : ''}
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:${BRAND.textMuted};line-height:1.7;">
      Si crees que esto es un error puedes contactar directamente al negocio.
    </p>
  `);
}

export async function sendDisputeOpenedEmail(toEmail: string, opts: {
  customerName: string;
  type: string;
  description: string;
  movementRef: string;
  businessName: string;
  photoCount: number;
}): Promise<void> {
  if (!toEmail) return;
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Reclamo abierto → ${toEmail}: ${opts.customerName} (${opts.type})`, 'color:#f59e0b;font-weight:bold');
    return;
  }
  try {
    await emailjs.send(SVC, WELCOME_TPL, {
      to_email:  toEmail,
      to_name:   'Administrador',
      subject:   `Nuevo reclamo — ${opts.customerName}`,
      html_body: buildDisputeOpenedHtml(opts),
    }, PUB);
  } catch (err) {
    console.error('[EmailService] sendDisputeOpenedEmail failed:', err);
  }
}

export async function sendDisputeResolvedEmail(toEmail: string, opts: {
  customerName: string;
  resolution: string;
  movementRef: string;
  businessName: string;
}): Promise<void> {
  if (!toEmail) return;
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Reclamo resuelto → ${toEmail}`, 'color:#10b981;font-weight:bold');
    return;
  }
  try {
    await emailjs.send(SVC, WELCOME_TPL, {
      to_email:  toEmail,
      to_name:   opts.customerName,
      subject:   `Reclamo resuelto — ${opts.businessName}`,
      html_body: buildDisputeResolvedHtml(opts),
    }, PUB);
  } catch (err) {
    console.error('[EmailService] sendDisputeResolvedEmail failed:', err);
  }
}

export async function sendDisputeRejectedEmail(toEmail: string, opts: {
  customerName: string;
  resolution: string;
  movementRef: string;
  businessName: string;
}): Promise<void> {
  if (!toEmail) return;
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Reclamo cerrado → ${toEmail}`, 'color:#ef4444;font-weight:bold');
    return;
  }
  try {
    await emailjs.send(SVC, WELCOME_TPL, {
      to_email:  toEmail,
      to_name:   opts.customerName,
      subject:   `Reclamo cerrado — ${opts.businessName}`,
      html_body: buildDisputeRejectedHtml(opts),
    }, PUB);
  } catch (err) {
    console.error('[EmailService] sendDisputeRejectedEmail failed:', err);
  }
}

export async function sendBirthdayEmail(toEmail: string, opts: {
  customerName: string;
  businessName: string;
}): Promise<void> {
  if (!toEmail) return;
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Birthday greeting → ${toEmail}: ${opts.customerName}`, 'color:#ec4899;font-weight:bold');
    return;
  }
  try {
    await emailjs.send(SVC, WELCOME_TPL, {
      to_email: toEmail,
      to_name: opts.customerName,
      subject: `¡Feliz cumpleaños, ${opts.customerName}! 🎂`,
      html_body: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;text-align:center;padding:32px 20px;">
          <div style="font-size:48px;margin-bottom:16px;">🎂</div>
          <h1 style="color:${BRAND.accent};margin:0 0 12px;">¡Feliz Cumpleaños!</h1>
          <p style="color:#475569;font-size:16px;line-height:1.6;">
            <strong>${opts.businessName}</strong> te desea un excelente día en tu cumpleaños, <strong>${opts.customerName}</strong>.
          </p>
          <p style="color:#64748b;font-size:14px;margin-top:24px;">Gracias por ser parte de nuestra familia.</p>
        </div>
      `,
    }, PUB);
  } catch (err) {
    console.error('[EmailService] sendBirthdayEmail failed:', err);
  }
}

export async function sendOverduePaymentsDigest(toEmail: string, opts: {
  count: number;
  list: { customerName: string; amount: number; createdAt: string }[];
  businessName: string;
}): Promise<void> {
  if (!toEmail || opts.count === 0) return;
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Digest pagos pendientes → ${toEmail}: ${opts.count}`, 'color:#f59e0b;font-weight:bold');
    return;
  }
  try {
    await emailjs.send(SVC, WELCOME_TPL, {
      to_email:  toEmail,
      to_name:   'Administrador',
      subject:   `${opts.count} pago${opts.count !== 1 ? 's' : ''} pendiente${opts.count !== 1 ? 's' : ''} de revisión`,
      html_body: buildOverdueDigestHtml(opts),
    }, PUB);
  } catch (err) {
    console.error('[EmailService] sendOverduePaymentsDigest failed:', err);
  }
}

/**
 * Send an overdue invoice reminder email to a customer.
 */
export async function sendOverdueReminderEmail(toEmail: string, opts: {
  customerName: string;
  amount: string;
  businessName: string;
  daysOverdue: number;
  severity: 'soft' | 'urgent' | 'overdue' | 'final';
}): Promise<void> {
  if (!toEmail) return;
  const subjectMap: Record<string, string> = {
    soft: `Recordatorio de pago — ${opts.businessName}`,
    urgent: `Su saldo vence HOY — ${opts.businessName}`,
    overdue: `Saldo vencido (${opts.daysOverdue} días) — ${opts.businessName}`,
    final: `AVISO FINAL de pago — ${opts.businessName}`,
  };
  const colorMap: Record<string, string> = {
    soft: '#f59e0b', urgent: '#f97316', overdue: '#ef4444', final: '#dc2626',
  };
  const color = colorMap[opts.severity] || '#f59e0b';

  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Reminder (${opts.severity}) → ${toEmail}: ${opts.amount}`, 'color:#f59e0b;font-weight:bold');
    return;
  }
  try {
    await emailjs.send(SVC, WELCOME_TPL, {
      to_email: toEmail,
      to_name: opts.customerName,
      subject: subjectMap[opts.severity],
      html_body: `
        <div style="font-family:Inter,system-ui,sans-serif;background:${BRAND.bg};padding:32px 16px;">
          <div style="max-width:520px;margin:auto;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;padding:32px;">
            <h2 style="color:${color};font-size:20px;margin:0 0 16px;">
              ${subjectMap[opts.severity]}
            </h2>
            <p style="color:${BRAND.textPrimary};font-size:15px;line-height:1.6;margin:0 0 16px;">
              Hola ${opts.customerName},
            </p>
            <p style="color:${BRAND.textPrimary};font-size:15px;line-height:1.6;margin:0 0 16px;">
              Le informamos que su saldo pendiente con <strong>${opts.businessName}</strong> es de
              <strong style="color:${color};">${opts.amount}</strong>${opts.daysOverdue > 0 ? ` y tiene <strong>${opts.daysOverdue} día${opts.daysOverdue !== 1 ? 's' : ''}</strong> de vencido` : ''}.
            </p>
            <p style="color:${BRAND.textSecondary};font-size:13px;line-height:1.5;margin:0;">
              Si ya realizó el pago, por favor ignore este mensaje o comuníquese con nosotros.
            </p>
          </div>
        </div>
      `,
    }, PUB);
  } catch (err) {
    console.error('[EmailService] sendOverdueReminderEmail failed:', err);
  }
}
