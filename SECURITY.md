# Security Policy — Dualis ERP

## Architecture

Dualis is a client-side SPA (React + Vite) backed by Firebase services:
- **Firebase Auth** — authentication (email/password, OTP)
- **Firestore** — database with server-side security rules
- **Firebase Hosting** — static hosting with security headers
- **Cloudinary** — image uploads (unsigned presets with restrictions)

## Defense Layers

### Layer 1: Firestore Security Rules (`firestore.rules`)
- Tenant isolation: all reads/writes require `request.auth != null` + business membership
- Shape validation: writes to critical collections validate field names
- Admin-only deletes: only owners can delete documents
- Portal access: customers read own data only via OTP-verified sessions

### Layer 2: Rate Limiting
- Client-side: `src/utils/rateLimiter.ts` — localStorage-based attempt tracking
  - Login: 5 attempts / 15 min
  - Portal OTP: 3 attempts / 10 min  
  - PIN unlock: 5 attempts then forced logout
- Server-side: Firestore rules enforce `isMember` checks (distributed rate limiting deferred to v1.1)

### Layer 3: Session Security
- Firebase Auth ID tokens (1h lifetime, auto-refresh)
- Idle timeout: configurable 5-30 min auto-logout
- PIN lock screen: Ctrl+L quick lock without logout
- Device fingerprinting: `src/utils/deviceFingerprint.ts` — SHA-256 hash of browser signals

### Layer 4: Input Sanitization
- `src/utils/sanitize.ts` — text/HTML sanitization helpers
- No `dangerouslySetInnerHTML` usage in codebase
- React's built-in XSS protection for all rendered content
- Max length enforcement on critical fields

### Layer 5: Security Headers (firebase.json)
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Strict-Transport-Security` — forces HTTPS
- `Content-Security-Policy` — whitelists allowed sources
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — restricts camera/mic/geo access

### Layer 6: Audit Logging
- `src/utils/auditLogger.ts` — writes to `auditLogs` collection
- 15+ call sites covering movements, clients, suppliers, approvals
- Includes userId, action, resource, timestamp, diff

### Layer 7: Upload Security
- Cloudinary presets enforce file type and size limits
- Client-side validation before upload (type, size)
- EXIF stripping enabled on Cloudinary

## Secrets Management

| Secret | Location | Notes |
|--------|----------|-------|
| Firebase config (apiKey) | `src/firebase/config.ts` | **Public by design** — security via rules |
| Cloudinary cloud_name | `src/utils/cloudinary.ts` | Public — unsigned presets |
| EmailJS keys | `.env` (VITE_EMAILJS_*) | Client-side, rate-limited by EmailJS |
| Sentry DSN | `.env` (VITE_SENTRY_DSN) | Public by design |
| Super Admin PIN | `.env` (VITE_SUPER_ADMIN_PIN) | Keep private |
| Gemini API key | `.env` (VITE_GEMINI_API_KEY) | Keep private, server-side preferred |

### Rotation Schedule
- Admin passwords: every 6 months
- EmailJS keys: annually or after suspected leak
- Super Admin PIN: after any team member leaves
- Gemini API key: annually

## Reporting Vulnerabilities

If you find a security issue, please report it to: **security@dualis.online**

- Response SLA: 24h acknowledgment, 7d fix for critical
- Do NOT open a public GitHub issue for security vulnerabilities

## OWASP Top 10 Coverage

| # | Category | Status |
|---|----------|--------|
| A01 | Broken Access Control | Covered (Firestore rules + ACL) |
| A02 | Cryptographic Failures | Covered (TLS via Firebase, no custom crypto) |
| A03 | Injection | Covered (no SQL, Firestore shape validation) |
| A04 | Insecure Design | Covered (defense in depth architecture) |
| A05 | Security Misconfiguration | Covered (CSP headers, rules audit) |
| A06 | Vulnerable Components | Monitored (npm audit, 0 high/critical) |
| A07 | Auth Failures | Covered (rate limiting, idle timeout, PIN) |
| A08 | Software Integrity | Covered (lockfile, no eval()) |
| A09 | Logging & Monitoring | Covered (audit logs, Sentry) |
| A10 | SSRF | N/A (client-side SPA) |

## Deferred to v1.1
- 2FA TOTP (otplib + Google Authenticator)
- Cloudflare Turnstile captcha
- Server-side distributed rate limiting
- Session tracking with device list
- Suspicious activity alerts
- Right to forget (GDPR-like data deletion)
- Formal penetration test report
