import type { Auditable, Identifiable } from '@shared/models/entity';

/** SRS 7.2 — SLA models. */
export const SLA_TYPE_GROUPS: readonly { readonly group: string; readonly types: readonly string[] }[] = [
  { group: 'Customer-Based SLA', types: ['Customer SLA', 'Enterprise Customer SLA', 'Strategic Customer SLA', 'Account-Level SLA'] },
  { group: 'Contract-Based SLA', types: ['Contract SLA', 'AMC SLA', 'Service Contract SLA', 'Subscription SLA'] },
  { group: 'Service-Based SLA', types: ['Service-Specific SLA', 'Support SLA', 'Maintenance SLA', 'Installation SLA', 'Inspection SLA', 'Calibration SLA'] },
  { group: 'Priority-Based SLA', types: ['Critical SLA', 'High Priority SLA', 'Medium Priority SLA', 'Low Priority SLA'] },
  { group: 'Operational SLA', types: ['Response SLA', 'Resolution SLA', 'Restoration SLA', 'First Response SLA', 'First-Time Fix SLA', 'On-Site Arrival SLA'] },
  { group: 'Other SLA Models', types: ['24x7 SLA', 'Business Hours SLA', 'Follow-the-Sun SLA', 'Premium Support SLA', 'Standard Support SLA', 'Custom SLA'] },
];
export const SLA_TYPES = SLA_TYPE_GROUPS.flatMap((g) => g.types);

/** SRS 7.16 */
export const SLA_STATUSES = ['Draft', 'Under Review', 'Pending Approval', 'Approved', 'Pending Activation', 'Active', 'Suspended', 'Expiring Soon', 'Expired', 'Renewed', 'Cancelled', 'Archived'] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];
export const LIVE_SLA_STATUSES: readonly SlaStatus[] = ['Active', 'Expiring Soon'];
export const EDITABLE_SLA_STATUSES: readonly SlaStatus[] = ['Draft', 'Under Review', 'Pending Approval', 'Approved', 'Pending Activation', 'Active', 'Expiring Soon', 'Suspended'];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TIME_UNITS = ['Minutes', 'Hours', 'Days'] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];
export const UNIT_MINUTES: Readonly<Record<TimeUnit, number>> = { Minutes: 1, Hours: 60, Days: 1440 };

export const CUSTOMER_SEGMENTS = ['Enterprise', 'Strategic', 'Government', 'SME', 'Standard'] as const;
export const REQUEST_TYPES = ['Breakdown', 'Emergency', 'Service Request', 'Inspection Request', 'Information Request', 'Complaint'] as const;
export const WORK_ORDER_TYPES = ['Corrective', 'Preventive', 'Installation', 'Inspection'] as const;
export const SERVICE_HOUR_MODES = ['Business Hours', '24x7', 'Extended Business Hours', 'Custom Hours'] as const;
export const BILLING_IMPACTS = ['None', 'Service Credit', 'Penalty Deduction', 'Credit Note'] as const;
export const ESCALATION_POLICIES = ['Standard', 'Priority Escalation', 'Executive Escalation', 'None'] as const;

export interface PriorityTarget {
  readonly response: number;
  readonly resolution: number;
}

export interface SlaDocument {
  readonly id: string;
  readonly name: string;
  readonly type: 'SLA Document' | 'Contract Attachment' | 'Customer Approval' | 'Supporting Document';
  readonly size: number;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
}

/** SRS 7.6 — SLA definition. Durations are stored in minutes; `unit` is the display unit. */
export interface Sla extends Identifiable, Auditable {
  readonly number: string;
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly status: SlaStatus;
  readonly approval: 'Not Submitted' | 'Pending' | 'Approved' | 'Rejected';
  readonly version: string;
  readonly parentSlaId: string | null;
  readonly previousSlaId: string | null;
  readonly externalReference: string;
  readonly customer: {
    readonly customerId: string | null;
    readonly legalEntity: string;
    readonly segment: string;
    readonly accountManagerId: string | null;
    readonly contractManagerId: string | null;
    readonly primaryContact: string;
  };
  readonly contract: {
    readonly contractId: string | null;
    readonly amcId: string | null;
    readonly contractLine: string;
    readonly contractStart: string | null;
    readonly contractEnd: string | null;
  };
  readonly validity: {
    readonly effectiveDate: string;
    readonly expiryDate: string | null;
    readonly renewalDate: string | null;
    readonly noticePeriodDays: number;
    readonly autoRenewal: boolean;
    readonly renewalTermMonths: number | null;
  };
  readonly scope: {
    readonly serviceIds: readonly string[];
    readonly serviceCategories: readonly string[];
    readonly serviceTypes: readonly string[];
    readonly servicePriority: Priority | null;
    readonly requestTypes: readonly string[];
    readonly workOrderTypes: readonly string[];
  };
  readonly response: {
    readonly firstResponse: number | null;
    readonly acknowledgement: number | null;
    readonly assignment: number | null;
    readonly onSiteArrival: number | null;
    readonly unit: TimeUnit;
    readonly calendarId: string;
  };
  readonly resolution: {
    readonly resolution: number | null;
    readonly restoration: number | null;
    readonly closure: number | null;
    readonly unit: TimeUnit;
    readonly calendarId: string;
  };
  /** Minutes per priority (SRS 7.6 H). */
  readonly priorityTargets: Readonly<Record<Priority, PriorityTarget>>;
  readonly serviceHours: {
    readonly calendarId: string;
    readonly mode: string;
    readonly afterHoursSupport: boolean;
    readonly holidayCalendar: string;
    readonly weekendRules: string;
  };
  readonly escalation: {
    readonly policy: string;
    readonly first: string;
    readonly second: string;
    readonly management: string;
    readonly percentage: number;
    readonly timeMinutes: number | null;
    readonly recipients: string;
  };
  readonly commercial: {
    readonly value: number;
    readonly currency: string;
    readonly billingImpact: string;
    readonly penaltyApplicable: boolean;
    readonly serviceCreditApplicable: boolean;
    readonly penaltyRules: string;
    readonly serviceCreditRules: string;
    /** Penalty per breach as a percentage of the monthly SLA value. */
    readonly penaltyPercent: number;
    /** Monthly cap on penalties / credits (% of monthly value). */
    readonly penaltyCapPercent: number;
  };
  readonly notes: { readonly internal: string; readonly customer: string };
  readonly documents: readonly SlaDocument[];
}

export type SlaUpsert = Omit<Sla, keyof Identifiable | keyof Auditable | 'status' | 'approval' | 'version' | 'previousSlaId' | 'documents'>;

export interface SlaVersion {
  readonly slaId: string;
  readonly version: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly summary: string;
  readonly snapshot: Readonly<Record<Priority, PriorityTarget>>;
}

export interface SlaListItem extends Sla {
  readonly effectiveStatus: SlaStatus;
  readonly customerName: string | null;
  readonly contractNumber: string | null;
  readonly amcNumber: string | null;
  readonly serviceNames: readonly string[];
  readonly calendarName: string;
  readonly daysRemaining: number | null;
  readonly coverage: { readonly customers: number; readonly sites: number; readonly assets: number; readonly services: number };
  readonly activeClocks: number;
  readonly activeRequests: number;
  readonly activeWorkOrders: number;
  readonly breaches: number;
  readonly openEscalations: number;
  readonly compliance: number | null;
  readonly responseCompliance: number | null;
  readonly resolutionCompliance: number | null;
  readonly avgResponseMinutes: number | null;
  readonly avgResolutionMinutes: number | null;
  readonly renewedById: string | null;
}
