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
            <img src="https://dualis.app/logo.png" alt="Dualis" width="80" height="80" style="display:block;margin:0 auto 16px;border-radius:16px;" />
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
                        <a href="mailto:soporte@dualis.app" style="color:${BRAND.accent};text-decoration:none;font-weight:700;">soporte@dualis.app</a>
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
  const urlDisplay = customUrl || 'dualis.app';
  const urlHref = customUrl ? `https://${customUrl}` : 'https://dualis.app';

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
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:20px;">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:4px;color:rgba(255,255,255,0.22);">C&oacute;mo acceder</p>
          <p style="margin:0 0 8px;font-size:16px;font-weight:800;color:${BRAND.textPrimary};">
            Inicia sesi&oacute;n con tu correo y contrase&ntilde;a
          </p>
          <p style="margin:0;font-size:14px;color:${BRAND.textMuted};">
            Accede desde tu URL personalizada <a href="${urlHref}" style="color:${BRAND.accent};text-decoration:none;font-weight:700;">${urlDisplay}</a> o desde <a href="https://dualis.app" style="color:${BRAND.accent};text-decoration:none;font-weight:700;">dualis.app</a>.
          </p>
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
  await emailjs.send(SVC, OTP_TPL, {
    to_email:  toEmail,
    to_name:   toName,
    subject:   'Tu codigo de verificacion — Dualis ERP',
    html_body: buildOTPHtml(toName, otp),
  }, PUB);
}

export async function sendWelcomeEmail(toEmail: string, toName: string, businessId: string, customUrl?: string): Promise<void> {
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Bienvenida enviada a ${toEmail} (${businessId}) — URL: ${customUrl || 'dualis.app'}`, 'color:#10b981;font-weight:bold');
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
