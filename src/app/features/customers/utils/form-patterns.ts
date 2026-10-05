import type { FieldErrorMessages } from '@shared/ui/form-field';

/** Validation patterns for customer/site master data (KSA National Address conventions). */
export const PATTERNS = {
  code: /^[A-Za-z0-9][A-Za-z0-9-]{2,19}$/,
  crNumber: /^\d{10}$/,
  vatNumber: /^3\d{13}3$/,
  nationalAddress: /^[A-Za-z]{4}\d{4}$/,
  buildingNumber: /^\d{4}$/,
  postalCode: /^\d{5}$/,
  additionalNumber: /^\d{4}$/,
  phone: /^\+?[0-9 ()-]{7,20}$/,
} as const;

export const PATTERN_MESSAGES = {
  code: {
    pattern: 'Use 3–20 letters, numbers or hyphens.',
    codeTaken: 'This code is already in use. Codes must be unique.',
  },
  crNumber: { pattern: 'CR number must be 10 digits.' },
  vatNumber: { pattern: 'VAT number must be 15 digits, starting and ending with 3.' },
  nationalAddress: { pattern: 'Use the short address format, e.g. RRRD2929.' },
  buildingNumber: { pattern: 'Building number must be 4 digits.' },
  postalCode: { pattern: 'Postal code must be 5 digits.' },
  additionalNumber: { pattern: 'Additional number must be 4 digits.' },
  phone: { pattern: 'Enter a valid phone number, e.g. +966 11 234 5678.' },
} as const satisfies Record<string, FieldErrorMessages>;

export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}
