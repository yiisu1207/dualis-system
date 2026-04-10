/**
 * J.13 — Input sanitization utilities.
 * Strips dangerous HTML/script content from user inputs.
 * React already escapes JSX text, but this covers edge cases
 * like dangerouslySetInnerHTML, PDF generation, and email templates.
 */

/** Strip all HTML tags from a string */
export function sanitizeText(input: string): string {
  if (!input) return '';
  // Remove all HTML tags
  return input.replace(/<[^>]*>/g, '').trim();
}

/** Allow only safe inline formatting tags */
const SAFE_TAGS = new Set(['b', 'i', 'em', 'strong', 'br', 'u']);

export function sanitizeHtml(input: string): string {
  if (!input) return '';
  // Remove script tags and their content first
  let clean = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove event handlers (onclick, onerror, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*(['"])[^'"]*\1/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  // Remove javascript: and data: URLs
  clean = clean.replace(/href\s*=\s*['"]?\s*javascript:/gi, 'href="');
  clean = clean.replace(/src\s*=\s*['"]?\s*data:/gi, 'src="');
  // Remove all tags except safe ones
  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    if (SAFE_TAGS.has(tag.toLowerCase())) {
      // Keep safe tags but strip their attributes
      const isClosing = match.startsWith('</');
      return isClosing ? `</${tag.toLowerCase()}>` : `<${tag.toLowerCase()}>`;
    }
    return '';
  });
  return clean.trim();
}

/** Enforce max length on a string (for Firestore field validation) */
export function truncate(input: string, maxLength: number): string {
  if (!input) return '';
  return input.length > maxLength ? input.slice(0, maxLength) : input;
}

/** Validate and sanitize a customer/product name */
export function sanitizeName(input: string, maxLen = 100): string {
  return truncate(sanitizeText(input), maxLen);
}

/** Validate and sanitize a note/comment/description */
export function sanitizeNote(input: string, maxLen = 500): string {
  return truncate(sanitizeText(input), maxLen);
}
