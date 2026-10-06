import type { LookupTypeDefinition } from '@shared/lookups/lookup';
import { CONTACT_TYPES, PREFERRED_LANGUAGES, SYSTEM_CONTACT_TYPES } from '../models/contact.model';
import { COMMUNICATION_METHODS, CUSTOMER_CATEGORIES, CUSTOMER_TYPES, INDUSTRIES } from '../models/customer.model';
import { DOCUMENT_CATEGORIES } from '../models/document.model';
import { SITE_TYPES } from '../models/site.model';

/** Lookup type keys used by the Customer & Site module. */
export const LOOKUP = {
  customerType: 'customer-type',
  customerCategory: 'customer-category',
  industry: 'industry',
  communicationMethod: 'communication-method',
  preferredLanguage: 'preferred-language',
  contactType: 'contact-type',
  siteType: 'site-type',
  documentCategory: 'document-category',
} as const;

export type CustomerSiteLookupType = (typeof LOOKUP)[keyof typeof LOOKUP];

/**
 * Classification lists defined by the SRS that organisations maintain themselves.
 * Statuses, priorities, access levels, service windows, visit times and master data owned by
 * other modules (SLA, payment terms, territories, users, address hierarchy) are intentionally
 * not registered here and remain fixed selects.
 */
export const CUSTOMER_SITE_LOOKUP_TYPES: readonly LookupTypeDefinition[] = [
  { key: LOOKUP.customerType, label: 'Customer Type', editable: true, description: 'Used to classify customers in lists, filters and reports.' },
  { key: LOOKUP.customerCategory, label: 'Customer Category', editable: true, description: 'Market segment used for customer classification and reporting.' },
  { key: LOOKUP.industry, label: 'Industry', editable: true },
  { key: LOOKUP.communicationMethod, label: 'Communication Method', editable: true, maxLength: 40 },
  { key: LOOKUP.preferredLanguage, label: 'Preferred Language', editable: true, maxLength: 40 },
  { key: LOOKUP.contactType, label: 'Contact Type', editable: true, description: 'Distinguishes the role of a contact; one primary contact is allowed per type.' },
  { key: LOOKUP.siteType, label: 'Site Type', editable: true },
  { key: LOOKUP.documentCategory, label: 'Document Type', editable: true, description: 'Categorises customer and site documents for search and compliance tracking.' },
];

/** Initial values per lookup type, with values that business rules depend on flagged as system. */
export const LOOKUP_SEED: Readonly<Record<CustomerSiteLookupType, { values: readonly string[]; system?: readonly string[] }>> = {
  [LOOKUP.customerType]: { values: CUSTOMER_TYPES },
  [LOOKUP.customerCategory]: { values: CUSTOMER_CATEGORIES },
  [LOOKUP.industry]: { values: INDUSTRIES },
  [LOOKUP.communicationMethod]: { values: COMMUNICATION_METHODS },
  [LOOKUP.preferredLanguage]: { values: PREFERRED_LANGUAGES },
  [LOOKUP.contactType]: { values: CONTACT_TYPES, system: SYSTEM_CONTACT_TYPES },
  [LOOKUP.siteType]: { values: SITE_TYPES },
  [LOOKUP.documentCategory]: { values: DOCUMENT_CATEGORIES },
};
