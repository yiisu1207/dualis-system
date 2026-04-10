/**
 * deviceFingerprint.ts
 * Lightweight device fingerprinting utility for Dualis ERP.
 * No external dependencies. Uses SubtleCrypto (SHA-256) with a djb2 fallback.
 */

const STORAGE_KEY = "dualis:deviceId";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectRawComponents(): string {
  const nav = window.navigator;
  const scr = window.screen;

  return [
    nav.userAgent,
    String(scr.width),
    String(scr.height),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    nav.language,
    String(scr.colorDepth),
    nav.platform,
  ].join("|");
}

/** Simple djb2 hash — synchronous fallback when SubtleCrypto is unavailable. */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep it unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}

/** Convert an ArrayBuffer of bytes to a lowercase hex string. */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a stable hash string identifying the current device.
 *
 * Prefers SHA-256 via SubtleCrypto (async). If SubtleCrypto is unavailable
 * (e.g. insecure context or older browser) it falls back to a synchronous
 * djb2 hash prefixed with "fb-" so callers can distinguish the two.
 */
export async function getDeviceFingerprint(): Promise<string> {
  const raw = collectRawComponents();

  if (
    typeof window !== "undefined" &&
    window.crypto?.subtle
  ) {
    try {
      const encoded = new TextEncoder().encode(raw);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", encoded);
      return bufferToHex(hashBuffer);
    } catch {
      // SubtleCrypto present but failed (e.g. digest not supported) — fall through
    }
  }

  // Synchronous fallback
  return "fb-" + djb2Hash(raw);
}

/**
 * Returns the device fingerprint cached in localStorage under `dualis:deviceId`.
 *
 * On the first call it computes the fingerprint, persists it, then returns it.
 * Subsequent calls simply read from localStorage, making this effectively
 * synchronous after the first invocation.
 *
 * @returns A Promise that resolves to the persisted device ID string.
 */
export async function getDeviceId(): Promise<string> {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return cached;
  } catch {
    // localStorage may be blocked (private browsing, security policy, SSR)
  }

  const fingerprint = await getDeviceFingerprint();

  try {
    localStorage.setItem(STORAGE_KEY, fingerprint);
  } catch {
    // Silently ignore write failures — return the computed value anyway
  }

  return fingerprint;
}
