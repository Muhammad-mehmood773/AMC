import type { FieldErrorMessages } from '@shared/ui/form-field';

/** Validation patterns for customer/site master data. */
export const PATTERNS = {
  code: /^[A-Za-z0-9][A-Za-z0-9-]{2,19}$/,
  /** KSA Commercial Registration — 10 digits. Country-aware logic applies this only for Saudi Arabia. */
  crNumber: /^\d{10}$/,
  /** KSA VAT number — 15 digits, starts and ends with 3. Country-aware logic applies this only for Saudi Arabia. */
  vatNumber: /^3\d{13}3$/,
  /** KSA National Address short code — 4 letters + 4 digits. */
  nationalAddress: /^[A-Za-z]{4}\d{4}$/,
  /** KSA building number — 4 digits. Used only when Saudi Arabia is selected. */
  buildingNumber: /^\d{4}$/,
  /** KSA additional number — 4 digits. Used only when Saudi Arabia is selected. */
  additionalNumber: /^\d{4}$/,
  /** International phone number — allows E.164 and local formats with spaces, dashes, parentheses. */
  phone: /^\+?[0-9 ()-]{7,20}$/,
} as const;

export const PATTERN_MESSAGES = {
  code: {
    pattern: 'Use 3–20 letters, numbers or hyphens.',
    codeTaken: 'This code is already in use. Codes must be unique.',
  },
  /** Shown for KSA; country-aware logic replaces the validator for other countries. */
  crNumber: { pattern: 'CR number must be 10 digits.' },
  /** Shown for KSA; country-aware logic replaces the validator for other countries. */
  vatNumber: { pattern: 'VAT number must be 15 digits, starting and ending with 3.' },
  nationalAddress: { pattern: 'Use the short address format, e.g. RRRD2929.' },
  buildingNumber: { pattern: 'Building number must be 4 digits.' },
  postalCode: { pattern: 'Enter a valid postal code.' },
  additionalNumber: { pattern: 'Additional number must be 4 digits.' },
  phone: { pattern: 'Enter a valid international phone number, e.g. +1 555 123 4567.' },
} as const satisfies Record<string, FieldErrorMessages>;

export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}
