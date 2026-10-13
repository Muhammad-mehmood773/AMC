import type { Auditable, Identifiable } from '@shared/models/entity';
import type { Address, AgreementState, ServicePriority } from './customer.model';

/** Seed values; the list is user-maintainable through the generic lookup mechanism. */
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
export type SiteType = string;

export const SITE_STATUSES = [
  'Planned',
  'Active',
  'Temporarily Closed',
  'Inactive',
  'Archived',
] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

/**
 * Common IANA timezone identifiers grouped by region.
 * This list covers the markets supported by the platform.
 * The operating system's Intl API is used for display; these are seed values only.
 */
export const COMMON_TIMEZONES = [
  // GCC / Middle East
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Bahrain',
  'Asia/Kuwait',
  'Asia/Muscat',
  'Asia/Qatar',
  // Pakistan
  'Asia/Karachi',
  // US & Canada
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  // UK
  'Europe/London',
  // Europe
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Amsterdam',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Stockholm',
  'Europe/Warsaw',
  // UTC
  'UTC',
] as const;

export type CommonTimezone = (typeof COMMON_TIMEZONES)[number] | string;

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
  /** IANA timezone identifier, e.g. "Asia/Riyadh" or "America/New_York". Used for scheduling field-service visits at international sites. */
  readonly timezone: string;
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
