/**
 * Client-side rate limiter backed by localStorage.
 *
 * localStorage key format: `dualis:rl:<key>`
 * Stored value: { attempts, windowStart, windowMs }
 *
 * Intended uses:
 *   - Login:          canAttempt("login",         5, 15 * 60_000)
 *   - Portal OTP:     canAttempt("otp:<uid>",     3, 10 * 60_000)
 *   - PIN unlock:     canAttempt("pin:<uid>",      5,  5 * 60_000)
 *   - Password reset: canAttempt("pwd-reset:<uid>",3, 60 * 60_000)
 */

const PREFIX = "dualis:rl:";

interface RateLimitRecord {
  attempts: number;
  windowStart: number;
  windowMs: number;
}

// ── Storage helpers ────────────────────────────────────────────────────────────

function getRecord(key: string): RateLimitRecord | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as RateLimitRecord;
  } catch {
    return null;
  }
}

function setRecord(key: string, record: RateLimitRecord): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(record));
  } catch {
    // localStorage unavailable (private mode / quota exceeded) — fail open
  }
}

function removeRecord(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Checks whether an action can be attempted under the given rate limit.
 * Automatically records the attempt when returning `true`.
 *
 * @param key         Unique action identifier, e.g. "login" or "otp:uid123"
 * @param maxAttempts Maximum allowed attempts within the window
 * @param windowMs    Rolling window duration in milliseconds
 * @returns `true` if the attempt is allowed, `false` if the limit has been reached
 */
export function canAttempt(
  key: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const record = getRecord(key);

  // No prior record — first attempt in a fresh window
  if (!record) {
    setRecord(key, { attempts: 1, windowStart: now, windowMs });
    return true;
  }

  const elapsed = now - record.windowStart;

  // Window has expired — reset and allow
  if (elapsed > record.windowMs) {
    setRecord(key, { attempts: 1, windowStart: now, windowMs });
    return true;
  }

  // Window active, limit already reached — block
  if (record.attempts >= maxAttempts) {
    return false;
  }

  // Window active, still under limit — increment and allow
  setRecord(key, {
    attempts: record.attempts + 1,
    windowStart: record.windowStart,
    windowMs: record.windowMs,
  });
  return true;
}

/**
 * Returns the number of milliseconds remaining on an active lockout.
 * Returns `0` if the key is not tracked or the window has already expired.
 *
 * @param key Unique action identifier
 */
export function getRemainingLockout(key: string): number {
  const record = getRecord(key);
  if (!record) return 0;

  const expiry = record.windowStart + record.windowMs;
  const remaining = expiry - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Clears all recorded attempts for the given key, immediately un-locking it.
 *
 * @param key Unique action identifier
 */
export function resetAttempts(key: string): void {
  removeRecord(key);
}
