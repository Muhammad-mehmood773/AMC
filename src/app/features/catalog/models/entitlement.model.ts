import type { Auditable, Identifiable } from '@shared/models/entity';
import type { Attachment, Priority } from './catalog.model';

/** SRS 4.10 A */
export const ENTITLEMENT_STATUSES = ['Draft', 'Active', 'Suspended', 'Expired', 'Cancelled'] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

/** SRS 4.10 B / 4.16 */
export const COVERAGE_TYPES = [
  'Full Coverage',
  'Labor Only',
  'Parts Only',
  'Preventive Maintenance',
  'Breakdown Service',
  'Emergency Service',
  'Inspection Only',
  'Remote Support',
  'Other',
] as const;
export type CoverageType = (typeof COVERAGE_TYPES)[number];

export const COVERAGE_DESCRIPTIONS: Readonly<Record<CoverageType, string>> = {
  'Full Coverage': 'Labor, standard parts, preventive maintenance and covered breakdown services are included according to contract terms.',
  'Labor Only': 'Technician labor is covered while parts and other charges may remain billable.',
  'Parts Only': 'Specified parts are covered while labor or service charges may remain billable.',
  'Preventive Maintenance': 'Scheduled preventive maintenance services are covered.',
  'Breakdown Service': 'Corrective or breakdown service is covered.',
  'Emergency Service': 'Emergency response services are covered.',
  'Inspection Only': 'Inspection and assessment services are covered.',
  'Remote Support': 'Remote technical assistance is covered.',
  Other: 'Coverage as defined in the included services and commercial rules.',
};

/** SRS 4.10 D */
export const RESET_FREQUENCIES = ['Monthly', 'Quarterly', 'Yearly', 'Contract Period', 'No Reset'] as const;
export type ResetFrequency = (typeof RESET_FREQUENCIES)[number];

export const SERVICE_WINDOWS = ['Business Hours (08:00–17:00)', 'Extended Hours (07:00–22:00)', '24/7'] as const;
export const ESCALATION_POLICIES = ['Standard', 'Priority Escalation', 'Executive Escalation', 'None'] as const;
export const TAX_TREATMENTS = ['Standard VAT', 'Zero-Rated', 'Exempt', 'Reverse Charge'] as const;

export interface EntitlementValidity {
  readonly startDate: string;
  readonly endDate: string;
  readonly effectiveDate: string;
  readonly autoRenewal: boolean;
  readonly renewalPeriodMonths: number | null;
}

export interface EntitlementUsage {
  readonly limitApplicable: boolean;
  readonly maxVisits: number | null;
  readonly maxHours: number | null;
  readonly maxQuantity: number | null;
  readonly usedVisits: number;
  readonly usedHours: number;
  readonly usedQuantity: number;
  readonly resetFrequency: ResetFrequency;
  readonly lastResetDate: string;
}

export interface EntitlementCoverage {
  readonly serviceIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly coverageType: CoverageType;
  readonly includedServices: string;
  readonly excludedServices: string;
  readonly coveredServiceTypes: readonly string[];
  readonly serviceFrequency: string;
  readonly includedVisits: number | null;
  readonly emergencyService: boolean;
  readonly afterHoursService: boolean;
}

export interface LaborPartsCoverage {
  readonly labor: boolean;
  readonly parts: boolean;
  readonly consumables: boolean;
  readonly travel: boolean;
  readonly callOut: boolean;
  readonly overtime: boolean;
}

export interface EntitlementSla {
  readonly applicable: boolean;
  readonly slaId: string | null;
  readonly responseHours: number | null;
  readonly resolutionHours: number | null;
  readonly priority: Priority;
  readonly serviceWindow: string;
  readonly escalationPolicy: string;
}

export interface EntitlementExclusions {
  readonly serviceIds: readonly string[];
  readonly assetIds: readonly string[];
  readonly parts: string;
  readonly locations: string;
  readonly serviceHours: string;
  readonly notes: string;
}

export interface EntitlementCommercial {
  readonly billableServiceIds: readonly string[];
  readonly nonBillableServiceIds: readonly string[];
  readonly customerPrice: number | null;
  readonly currency: string;
  readonly discountRules: string;
  readonly additionalCharges: string;
  readonly taxTreatment: string;
}

/** SRS 4.10 — services and benefits a customer is authorized to receive. */
export interface Entitlement extends Identifiable, Auditable {
  readonly number: string;
  readonly name: string;
  readonly customerId: string;
  readonly contractId: string | null;
  readonly amcId: string | null;
  readonly siteIds: readonly string[];
  readonly assetIds: readonly string[];
  readonly status: EntitlementStatus;
  readonly coverage: EntitlementCoverage;
  readonly validity: EntitlementValidity;
  readonly usage: EntitlementUsage;
  readonly laborParts: LaborPartsCoverage;
  readonly sla: EntitlementSla;
  readonly exclusions: EntitlementExclusions;
  readonly commercial: EntitlementCommercial;
  readonly attachments: readonly Attachment[];
}

export type EntitlementUpsert = Omit<Entitlement, keyof Identifiable | keyof Auditable>;

export type UsageState = 'Within Limit' | 'Near Limit' | 'Exhausted' | 'Overused' | 'Unlimited';

/** SRS 4.17 */
export interface UsageSummary {
  readonly unit: 'Visits' | 'Hours' | 'Quantity' | 'None';
  readonly allowed: number | null;
  readonly consumed: number;
  readonly remaining: number | null;
  readonly percentage: number | null;
  readonly state: UsageState;
  readonly periodStart: string;
  readonly resetDate: string | null;
}

export interface EntitlementListItem extends Entitlement {
  /** Effective status (Active entitlements past their end date are reported as Expired). */
  readonly effectiveStatus: EntitlementStatus;
  readonly customerName: string;
  readonly customerStatus: string;
  readonly agreementNumber: string | null;
  readonly agreementKind: 'Contract' | 'AMC' | null;
  readonly siteNames: readonly string[];
  readonly assetLabels: readonly string[];
  readonly serviceNames: readonly string[];
  readonly slaName: string | null;
  readonly daysRemaining: number;
  readonly expiring: boolean;
  readonly usageSummary: UsageSummary;
}

/** One consumption of a covered service (SRS 4.17 consumed quantity). */
export interface UsageRecord {
  readonly id: string;
  readonly entitlementId: string;
  readonly date: string;
  readonly serviceId: string;
  readonly siteId: string | null;
  readonly assetId: string | null;
  readonly visits: number;
  readonly hours: number;
  readonly quantity: number;
  readonly reference: string;
  readonly technician: string;
  readonly covered: boolean;
  readonly notes: string;
}

export interface UsageRecordListItem extends UsageRecord {
  readonly entitlementNumber: string;
  readonly customerName: string;
  readonly serviceName: string;
  readonly serviceType: string;
  readonly siteName: string | null;
  readonly assetLabel: string | null;
}

export type UsageInput = Omit<UsageRecord, 'id' | 'entitlementId' | 'covered'>;

export interface EntitlementFilter {
  readonly customerId?: string;
  readonly serviceId?: string;
}

export interface UsageFilter {
  readonly entitlementId?: string;
  readonly serviceId?: string;
}

/** SRS 4.12 validation request. */
export interface ValidationRequest {
  readonly customerId: string;
  readonly siteId: string | null;
  readonly assetId: string | null;
  readonly serviceId: string;
  readonly date: string;
  readonly emergency: boolean;
  readonly entitlementId?: string | null;
}

export type CheckResult = 'pass' | 'fail' | 'warn' | 'na';

export interface ValidationCheck {
  readonly question: string;
  readonly result: CheckResult;
  readonly detail: string;
}

export interface ValidationResult {
  readonly request: ValidationRequest;
  readonly eligible: boolean;
  readonly covered: boolean;
  readonly billable: boolean;
  readonly entitlement: EntitlementListItem | null;
  readonly checks: readonly ValidationCheck[];
  readonly laborCovered: boolean;
  readonly partsCovered: boolean;
  readonly responseHours: number | null;
  readonly resolutionHours: number | null;
  readonly remaining: number | null;
  readonly summary: string;
}
