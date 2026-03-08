import emailjs from '@emailjs/browser';

const SVC  = import.meta.env.VITE_EMAILJS_SERVICE_ID       ?? '';
const PUB  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY       ?? '';
const OTP_TPL     = import.meta.env.VITE_EMAILJS_OTP_TEMPLATE     ?? '';
const WELCOME_TPL = import.meta.env.VITE_EMAILJS_WELCOME_TEMPLATE ?? '';

const DEV = !SVC || !PUB;

/* ── Helpers ──────────────────────────────────────────────────────────── */
export function generateOTP(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return (n % 1_000_000).toString().padStart(6, '0');
}

/* ── OTP email HTML ───────────────────────────────────────────────────── */
function buildOTPHtml(name: string, otp: string): string {
  const digits = otp.split('');
  const digitBoxes = digits
    .map(d => `<span style="display:inline-block;width:52px;height:64px;line-height:64px;text-align:center;font-size:32px;font-weight:900;font-family:monospace;background:#111827;border:2px solid #4f46e5;border-radius:12px;color:#a5b4fc;margin:0 4px;">${d}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#070b14;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#0d1424;border:1px solid rgba(255,255,255,0.07);border-radius:24px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:36px 40px;text-align:center;">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:rgba(255,255,255,0.15);margin-bottom:16px;">
              <span style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;">D</span>
            </div>
            <h1 style="margin:0;font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Dualis ERP</h1>
            <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:3px;">Verificación de correo</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 8px;font-size:16px;color:rgba(255,255,255,0.5);">Hola, <strong style="color:#e2e8f0;">${name}</strong></p>
            <p style="margin:0 0 32px;font-size:14px;color:rgba(255,255,255,0.35);line-height:1.6;">
              Recibimos una solicitud para crear tu cuenta en Dualis ERP. Usa el siguiente código para verificar tu correo electrónico.
            </p>

            <!-- OTP Digits -->
            <div style="text-align:center;margin:0 0 32px;">
              <p style="margin:0 0 16px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:4px;color:rgba(255,255,255,0.25);">Tu código de verificación</p>
              <div style="display:inline-block;">${digitBoxes}</div>
              <p style="margin:16px 0 0;font-size:11px;color:rgba(255,255,255,0.2);">Válido por <strong style="color:rgba(255,255,255,0.4);">10 minutos</strong></p>
            </div>

            <!-- WARNING BOX -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,0.08);border:1.5px solid rgba(239,68,68,0.3);border-radius:16px;margin:0 0 32px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:900;color:#f87171;text-transform:uppercase;letter-spacing:1px;">&#9888; Advertencia de seguridad</p>
                  <p style="margin:0;font-size:13px;color:rgba(248,113,113,0.8);line-height:1.6;">
                    Este código es <strong style="color:#f87171;">estrictamente confidencial</strong>. Nunca lo compartas con nadie, ni siquiera con soporte de Dualis.<br><br>
                    <strong style="color:#f87171;">Cuídalo con tu vida.</strong> Si alguien te lo solicita, es un intento de fraude. Repórtalo inmediatamente.
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);line-height:1.6;">
              Si no solicitaste esta verificación, ignora este correo. Tu cuenta permanecerá segura.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.05);">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);">Dualis ERP</p>
                  <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.15);">Soporte: soporte@dualis.app &nbsp;|&nbsp; WhatsApp: 0412-534-3141</p>
                </td>
                <td align="right">
                  <span style="font-size:10px;color:rgba(255,255,255,0.1);">&copy; 2026 Dualis</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ── Welcome email HTML ───────────────────────────────────────────────── */
function buildWelcomeHtml(name: string, businessId: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#070b14;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#0d1424;border:1px solid rgba(255,255,255,0.07);border-radius:24px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:40px;text-align:center;">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:72px;height:72px;border-radius:20px;background:rgba(255,255,255,0.15);margin-bottom:20px;">
              <span style="font-size:36px;font-weight:900;color:#fff;">D</span>
            </div>
            <h1 style="margin:0;font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Dualis ERP</h1>
            <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:3px;">Sistema Empresarial Inteligente</p>
          </td>
        </tr>

        <!-- Welcome message -->
        <tr>
          <td style="padding:40px 40px 0;">
            <h2 style="margin:0 0 16px;font-size:24px;font-weight:900;color:#e2e8f0;">&#127881; ¡Bienvenido, ${name}!</h2>
            <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.5);line-height:1.7;">
              Tu cuenta en <strong style="color:#a5b4fc;">Dualis ERP</strong> ha sido creada exitosamente. Estamos encantados de tenerte con nosotros.<br><br>
              Tu solicitud está siendo revisada por nuestro equipo. Te notificaremos en menos de <strong style="color:#e2e8f0;">24 horas</strong> cuando tu cuenta esté activa.
            </p>

            <!-- Business ID box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border:2px dashed rgba(79,70,229,0.4);border-radius:16px;margin:0 0 24px;">
              <tr>
                <td style="padding:24px;">
                  <p style="margin:0 0 8px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:4px;color:#6366f1;">Codigo de espacio unico</p>
                  <p style="margin:0 0 12px;font-size:13px;font-family:monospace;font-weight:900;color:#e2e8f0;word-break:break-all;letter-spacing:1px;">${businessId}</p>
                  <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">Guarda este codigo — es tu llave de acceso al sistema</p>
                </td>
              </tr>
            </table>

            <!-- CRITICAL WARNING -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(245,158,11,0.08);border:1.5px solid rgba(245,158,11,0.3);border-radius:16px;margin:0 0 32px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:900;color:#fbbf24;text-transform:uppercase;letter-spacing:1px;">&#9888; Guarda tu codigo con tu vida</p>
                  <p style="margin:0;font-size:13px;color:rgba(251,191,36,0.8);line-height:1.6;">
                    Este codigo es <strong style="color:#fbbf24;">tu unica llave de acceso</strong>. Sin el, no podras iniciar sesion ni recuperar tu espacio de trabajo.<br><br>
                    Guardalo en un lugar <strong style="color:#fbbf24;">seguro y privado</strong>. Nunca lo compartas. Nuestro equipo jamas te lo solicitara.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Contact / Owner info -->
        <tr>
          <td style="padding:0 40px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:16px;">
              <tr>
                <td style="padding:24px;">
                  <p style="margin:0 0 16px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:3px;color:rgba(255,255,255,0.25);">Tu equipo de soporte</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:44px;vertical-align:top;">
                        <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:flex;align-items:center;justify-content:center;text-align:center;line-height:40px;">
                          <span style="font-size:16px;font-weight:900;color:#fff;">JS</span>
                        </div>
                      </td>
                      <td style="padding-left:14px;">
                        <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#e2e8f0;">Jesus Salazar</p>
                        <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);">Fundador &amp; Soporte Dualis ERP</p>
                      </td>
                    </tr>
                  </table>
                  <div style="margin:16px 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,0.05);">
                    <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.3);">
                      &#128241; <strong style="color:rgba(255,255,255,0.5);">WhatsApp:</strong> 0412-534-3141
                    </p>
                    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);">
                      &#128231; <strong style="color:rgba(255,255,255,0.5);">Correo:</strong> soporte@dualis.app
                    </p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.05);">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);">Dualis ERP</p>
                  <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.15);">Sistema Empresarial para Venezuela y Latinoamerica</p>
                </td>
                <td align="right">
                  <span style="font-size:10px;color:rgba(255,255,255,0.1);">&copy; 2026 Dualis</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
    subject:   'Tu código de verificación — Dualis ERP',
    html_body: buildOTPHtml(toName, otp),
  }, PUB);
}

export async function sendWelcomeEmail(toEmail: string, toName: string, businessId: string): Promise<void> {
  if (DEV || !WELCOME_TPL) {
    console.info(`%c[EmailService] Bienvenida enviada a ${toEmail} (${businessId})`, 'color:#10b981;font-weight:bold');
    return;
  }
  await emailjs.send(SVC, WELCOME_TPL, {
    to_email:  toEmail,
    to_name:   toName,
    subject:   '¡Bienvenido a Dualis ERP! — Guarda tu llave',
    html_body: buildWelcomeHtml(toName, businessId),
  }, PUB);
}
