import type { CustomerStatus, DuplicateMatchField } from '../models/customer.model';
import type { SiteStatus } from '../models/site.model';

/**
 * Fields compared when detecting potential duplicate customers. Adjust to tune matching
 * (e.g. drop `phone` for tenants where shared switchboard numbers are common).
 */
export const DUPLICATE_MATCH_CRITERIA: readonly DuplicateMatchField[] = [
  'legalName',
  'crNumber',
  'vatNumber',
  'email',
  'phone',
];

export const DUPLICATE_FIELD_LABELS: Record<DuplicateMatchField, string> = {
  legalName: 'Legal name',
  crNumber: 'CR number',
  vatNumber: 'VAT number',
  email: 'Email',
  phone: 'Phone',
};

/** Customer statuses that block new operational transactions (sites, contracts, requests). */
export const TRANSACTION_BLOCKED_CUSTOMER_STATUSES: readonly CustomerStatus[] = [
  'Inactive',
  'Archived',
];

/** Site statuses that block new operational transactions. */
export const TRANSACTION_BLOCKED_SITE_STATUSES: readonly SiteStatus[] = ['Inactive', 'Archived'];

/** Agreements ending within this window are treated as expiring. */
export const EXPIRING_WINDOW_DAYS = 60;
