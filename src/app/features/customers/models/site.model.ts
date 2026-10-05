import type { Auditable, Identifiable } from '@shared/models/entity';
import type { Address, AgreementState, ServicePriority } from './customer.model';

export const SITE_TYPES = [
  'Head Office',
  'Branch',
  'Warehouse',
  'Factory',
  'Hospital',
  'Hotel',
  'School',
  'Residential Building',
  'Commercial Building',
  'Industrial Site',
  'Other',
] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const SITE_STATUSES = [
  'Planned',
  'Active',
  'Temporarily Closed',
  'Inactive',
  'Archived',
] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const VISIT_TIMES = [
  'Early Morning (06:00–09:00)',
  'Morning (09:00–12:00)',
  'Afternoon (12:00–16:00)',
  'Evening (16:00–20:00)',
  'Night (20:00–06:00)',
  'Any Time',
] as const;
export type VisitTime = (typeof VISIT_TIMES)[number];

export interface Site extends Identifiable, Auditable {
  readonly code: string;
  readonly name: string;
  readonly customerId: string;
  readonly type: SiteType;
  readonly status: SiteStatus;
  readonly location: Address;
  readonly siteContactId: string | null;
  readonly siteManagerId: string | null;
  readonly emergencyContactId: string | null;
  readonly operatingHours: string;
  readonly serviceHours: string;
  readonly accessRequirements: string;
  readonly securityRequirements: string;
  readonly defaultSlaId: string | null;
  readonly serviceTerritoryId: string | null;
  readonly servicePriority: ServicePriority;
  readonly preferredVisitDays: readonly Weekday[];
  readonly preferredVisitTime: VisitTime | null;
  readonly accessNoticeRequired: boolean;
  readonly siteInstructions: string;
  readonly technicianInstructions: string;
  readonly internalNotes: string;
}

export interface SiteListItem extends Site {
  readonly customerName: string;
  readonly customerCode: string;
  readonly customerStatus: string;
  readonly primaryContactName: string | null;
  readonly siteManagerName: string | null;
  readonly emergencyContactName: string | null;
  readonly totalAssets: number;
  readonly activeContracts: number;
  readonly activeAmcs: number;
  readonly openServiceRequests: number;
  readonly openWorkOrders: number;
  readonly upcomingMaintenance: number;
  readonly completedVisits: number;
  readonly contractState: AgreementState;
}

export type SiteUpsert = Omit<Site, keyof Identifiable | keyof Auditable>;

export interface SiteFilter {
  readonly customerId?: string;
}
