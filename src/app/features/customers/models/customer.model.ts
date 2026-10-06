import type { Auditable, Identifiable } from '@shared/models/entity';
import type { Contact, ContactInput } from './contact.model';

/** Seed values; the list is user-maintainable through the generic lookup mechanism. */
export const CUSTOMER_TYPES = [
  'Corporate',
  'Government',
  'SME',
  'Individual',
  'Partner',
  'Other',
] as const;
export type CustomerType = string;

/** Seed values; the list is user-maintainable through the generic lookup mechanism. */
export const CUSTOMER_CATEGORIES = [
  'Enterprise',
  'Commercial',
  'Industrial',
  'Residential',
  'Government',
  'Healthcare',
  'Hospitality',
  'Education',
] as const;
export type CustomerCategory = string;

export const CUSTOMER_STATUSES = ['Active', 'On Hold', 'Inactive', 'Archived'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const SERVICE_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type ServicePriority = (typeof SERVICE_PRIORITIES)[number];

/** Seed values; the list is user-maintainable through the generic lookup mechanism. */
export const COMMUNICATION_METHODS = ['Email', 'Phone', 'Mobile', 'SMS', 'WhatsApp'] as const;
export type CommunicationMethod = string;

/** Seed values; the list is user-maintainable through the generic lookup mechanism. */
export const INDUSTRIES = [
  'Banking & Finance',
  'Education',
  'Government Services',
  'Healthcare',
  'Hospitality',
  'Logistics',
  'Manufacturing',
  'Oil & Gas',
  'Real Estate',
  'Retail',
  'Telecommunications',
] as const;

export const BILLING_CYCLES = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Per Visit'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const SERVICE_WINDOWS = [
  'Business Hours (08:00–17:00)',
  'Extended Hours (07:00–22:00)',
  'After Hours (18:00–06:00)',
  'Weekends Only',
  '24/7',
] as const;
export type ServiceWindow = (typeof SERVICE_WINDOWS)[number];

/** Operational aggregate states derived from linked contracts / AMCs. */
export type AgreementState = 'Active' | 'Expiring' | 'Expired' | 'None';
export const AGREEMENT_STATES: readonly AgreementState[] = ['Active', 'Expiring', 'Expired', 'None'];

export interface Address {
  readonly country: string;
  readonly region: string;
  readonly city: string;
  readonly district: string;
  readonly street: string;
  readonly buildingNumber: string;
  readonly postalCode: string;
  readonly additionalNumber: string;
  readonly addressLine: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface CustomerCommercial {
  readonly accountManagerId: string | null;
  readonly salesRepId: string | null;
  readonly paymentTermsId: string | null;
  readonly currency: string;
  readonly creditLimit: number | null;
  readonly taxProfileId: string | null;
  readonly priceListId: string | null;
  readonly billingCycle: BillingCycle | null;
}

export interface CustomerOperational {
  readonly servicePriority: ServicePriority;
  readonly defaultSlaId: string | null;
  readonly serviceRegion: string | null;
  readonly serviceTerritoryId: string | null;
  readonly preferredServiceWindow: ServiceWindow | null;
  readonly portalAccess: boolean;
}

export interface Customer extends Identifiable, Auditable {
  readonly code: string;
  readonly name: string;
  readonly legalName: string;
  readonly type: CustomerType;
  readonly category: CustomerCategory;
  readonly status: CustomerStatus;
  readonly crNumber: string;
  readonly vatNumber: string;
  readonly nationalAddressRef: string;
  readonly industry: string;
  readonly registrationDate: string | null;
  readonly address: Address;
  readonly primaryContactId: string | null;
  readonly commercial: CustomerCommercial;
  readonly operational: CustomerOperational;
  readonly internalNotes: string;
  readonly customerNotes: string;
  readonly companyId: string;
  readonly branchId: string;
}

/** Customer row with operational aggregates for list views. */
export interface CustomerListItem extends Customer {
  readonly primaryContactName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly accountManagerName: string | null;
  readonly totalSites: number;
  readonly activeContracts: number;
  readonly activeAmcs: number;
  readonly activeAssets: number;
  readonly openServiceRequests: number;
  readonly openWorkOrders: number;
  readonly outstandingAmount: number;
  readonly contractState: AgreementState;
  readonly amcState: AgreementState;
}

export interface CustomerDetail extends CustomerListItem {
  readonly primaryContact: Contact | null;
  readonly totalAssets: number;
  readonly completedServices: number;
  readonly totalContacts: number;
  readonly totalDocuments: number;
}

export type CustomerUpsert = Omit<
  Customer,
  keyof Identifiable | keyof Auditable | 'primaryContactId'
> & {
  readonly primaryContact: Omit<ContactInput, 'customerId' | 'siteId' | 'type' | 'isPrimary'> | null;
};

export const DUPLICATE_MATCH_FIELDS = ['legalName', 'crNumber', 'vatNumber', 'email', 'phone'] as const;
export type DuplicateMatchField = (typeof DUPLICATE_MATCH_FIELDS)[number];

export type DuplicateCandidate = Readonly<Partial<Record<DuplicateMatchField, string>>>;

export interface DuplicateMatch {
  readonly customerId: string;
  readonly code: string;
  readonly name: string;
  readonly status: CustomerStatus;
  readonly matchedOn: readonly DuplicateMatchField[];
}
