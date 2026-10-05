import type { Auditable, Identifiable } from '@shared/models/entity';
import type { CommunicationMethod } from './customer.model';

export const CONTACT_TYPES = [
  'Primary',
  'Technical',
  'Billing',
  'Procurement',
  'Management',
  'Site Contact',
  'Emergency',
  'Other',
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_STATUSES = ['Active', 'Inactive'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const PREFERRED_LANGUAGES = ['English', 'Arabic', 'Urdu', 'Hindi', 'French'] as const;
export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number];

export interface Contact extends Identifiable, Auditable {
  readonly customerId: string;
  readonly siteId: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly designation: string;
  readonly department: string;
  readonly email: string;
  readonly mobile: string;
  readonly phone: string;
  readonly preferredLanguage: PreferredLanguage;
  readonly preferredCommunication: CommunicationMethod;
  readonly type: ContactType;
  readonly isPrimary: boolean;
  readonly status: ContactStatus;
  readonly notes: string;
}

export interface ContactListItem extends Contact {
  readonly fullName: string;
  readonly customerName: string;
  readonly customerCode: string;
  readonly siteName: string | null;
}

export type ContactInput = Omit<Contact, keyof Identifiable | keyof Auditable>;

export interface ContactFilter {
  readonly customerId?: string;
  readonly siteId?: string;
}
