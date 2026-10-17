import type { Auditable, Identifiable } from '@shared/models/entity';

/** SRS 6.2 — service agreement models. */
export const AMC_TYPE_GROUPS: readonly { readonly group: string; readonly types: readonly string[] }[] = [
  { group: 'Maintenance Agreements', types: ['Annual Maintenance Contract (AMC)', 'Preventive Maintenance Contract', 'Comprehensive Maintenance Contract', 'Non-Comprehensive Maintenance Contract', 'Full-Service Maintenance Contract'] },
  { group: 'Support Agreements', types: ['Technical Support Contract', 'Managed Service Contract', 'Remote Support Contract', 'On-Site Support Contract', 'Break-Fix Service Agreement'] },
  { group: 'Other Service Agreements', types: ['Inspection Contract', 'Calibration Contract', 'Equipment Support Contract', 'Facility Maintenance Contract', 'Subscription-Based Service Contract', 'Multi-Service Agreement', 'Other'] },
];
export const AMC_TYPES = AMC_TYPE_GROUPS.flatMap((g) => g.types);

/** SRS 6.16 */
export const AMC_STATUSES = ['Draft', 'Under Review', 'Pending Approval', 'Approved', 'Pending Activation', 'Active', 'Suspended', 'Expiring Soon', 'Expired', 'Terminated', 'Renewed', 'Cancelled', 'Archived'] as const;
export type AmcStatus = (typeof AMC_STATUSES)[number];

export const EDITABLE_AMC_STATUSES: readonly AmcStatus[] = ['Draft', 'Under Review', 'Pending Approval', 'Approved', 'Pending Activation', 'Active', 'Expiring Soon', 'Suspended'];
/** Statuses that provide active service entitlement (SRS 6.19). */
export const LIVE_AMC_STATUSES: readonly AmcStatus[] = ['Active', 'Expiring Soon'];

export const APPROVAL_STATES = ['Not Submitted', 'Pending', 'Approved', 'Rejected'] as const;
export type AmcApproval = (typeof APPROVAL_STATES)[number];

export const MAINTENANCE_TYPES = ['Preventive', 'Corrective', 'Preventive + Corrective', 'Predictive', 'Condition-Based'] as const;
export const SERVICE_FREQUENCIES = ['Daily', 'Weekly', 'Bi-Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Custom', 'Meter-Based', 'Condition-Based'] as const;
export type ServiceFrequency = (typeof SERVICE_FREQUENCIES)[number];
export const SERVICE_WINDOWS = ['Business Hours (08:00–17:00)', 'Extended Hours (07:00–22:00)', 'Night Shift (22:00–06:00)', '24/7'] as const;
export const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const ESCALATION_POLICIES = ['Standard', 'Priority Escalation', 'Executive Escalation', 'None'] as const;
export const SERVICE_HOURS = ['Business Hours', 'Extended Hours', '24/7'] as const;
export const BILLING_FREQUENCIES = ['One-Time', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Milestone-Based', 'Usage-Based'] as const;
export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];
export const BILLING_METHODS = ['Fixed Fee', 'Per Visit', 'Usage-Based', 'Milestone'] as const;
export const COMMUNICATION_METHODS = ['Email', 'Phone', 'SMS', 'WhatsApp', 'Customer Portal'] as const;
/** Seed values for the generic lookup mechanism. */
export const SERVICE_TEAMS = ['HVAC Team', 'Electrical Team', 'Mechanical Team', 'Fire & Safety Team', 'ELV & Security Team', 'Biomedical Team', 'Multi-Skill Team'] as const;

/** Coverage restrictions applied to the agreement (SRS 6.8). */
export interface AmcLimits {
  readonly maxHours: number | null;
  readonly maxPartsValue: number | null;
  readonly maxCallOuts: number | null;
}

export interface AmcCustomerInfo {
  readonly customerId: string;
  readonly legalEntity: string;
  readonly primaryContact: string;
  readonly contractManagerId: string;
  readonly accountManagerId: string | null;
}

export interface AmcPeriod {
  readonly startDate: string;
  readonly endDate: string;
  readonly renewalDate: string | null;
  readonly noticePeriodDays: number;
  readonly autoRenewal: boolean;
  readonly renewalTermMonths: number | null;
}

export interface AmcScope {
  readonly siteIds: readonly string[];
  readonly assetIds: readonly string[];
  readonly assetCategories: readonly string[];
  readonly serviceIds: readonly string[];
  readonly serviceCategories: readonly string[];
  readonly excludedSiteIds: readonly string[];
  readonly excludedAssetIds: readonly string[];
  readonly excludedServiceIds: readonly string[];
}

export interface AmcMaintenance {
  readonly maintenanceType: string;
  readonly maintenanceFrequency: ServiceFrequency;
  readonly serviceFrequency: ServiceFrequency;
  readonly visitsIncluded: number;
  readonly visitDurationHours: number;
  readonly serviceWindow: string;
  readonly preferredDays: readonly string[];
  readonly emergencyService: boolean;
  readonly afterHoursService: boolean;
}

export interface AmcLabor {
  readonly included: boolean;
  readonly technicianVisitsIncluded: boolean;
  readonly overtime: boolean;
  readonly emergencyLabor: boolean;
  readonly travel: boolean;
  readonly callOut: boolean;
}

export interface AmcParts {
  readonly partsIncluded: boolean;
  readonly consumablesIncluded: boolean;
  readonly majorComponents: boolean;
  readonly minorParts: boolean;
  readonly partsCostLimit: number | null;
  readonly consumablesLimit: number | null;
  readonly replacementCoverage: boolean;
  readonly excludedParts: string;
}

export interface AmcSla {
  readonly slaId: string | null;
  readonly responseHours: number | null;
  readonly resolutionHours: number | null;
  readonly priority: Priority;
  readonly escalationPolicy: string;
  readonly serviceHours: string;
}

export interface AmcCommercial {
  readonly value: number;
  readonly currency: string;
  readonly billingFrequency: BillingFrequency;
  readonly paymentTermsId: string | null;
  readonly billingMethod: string;
  readonly taxProfileId: string | null;
  readonly discountPercent: number;
  readonly priceEscalationPercent: number | null;
  readonly additionalCharges: string;
}

export interface AmcOperational {
  readonly serviceRegion: string;
  readonly territoryId: string | null;
  readonly serviceTeam: string;
  readonly technicianTeam: string;
  readonly communicationMethod: string;
}

export interface AmcDocument {
  readonly id: string;
  readonly name: string;
  readonly type: 'AMC Document' | 'Customer PO' | 'Quotation' | 'Supporting Document' | 'Service Report' | 'Termination Notice';
  readonly size: number;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly version: number;
}

export interface AmcSuspensionState {
  readonly reason: string;
  readonly from: string;
  readonly to: string | null;
  readonly pauseMaintenance: boolean;
  readonly pauseBilling: boolean;
}

/** SRS 6.6 — the operational service agreement. */
export interface Amc extends Identifiable, Auditable {
  readonly number: string;
  readonly title: string;
  readonly type: string;
  readonly parentContractId: string | null;
  readonly previousAmcId: string | null;
  readonly status: AmcStatus;
  readonly approval: AmcApproval;
  readonly version: string;
  readonly externalReference: string;
  readonly customer: AmcCustomerInfo;
  readonly period: AmcPeriod;
  readonly scope: AmcScope;
  readonly maintenance: AmcMaintenance;
  readonly labor: AmcLabor;
  readonly parts: AmcParts;
  readonly sla: AmcSla;
  readonly commercial: AmcCommercial;
  readonly operational: AmcOperational;
  readonly limits: AmcLimits;
  readonly notes: { readonly internal: string; readonly customer: string };
  readonly documents: readonly AmcDocument[];
  readonly suspension: AmcSuspensionState | null;
  readonly activatedAt: string | null;
}

export type AmcUpsert = Omit<Amc, keyof Identifiable | keyof Auditable | 'status' | 'approval' | 'version' | 'previousAmcId' | 'suspension' | 'activatedAt'>;

/** SRS 6.12 consumption metrics. */
export interface Consumption {
  readonly includedVisits: number;
  readonly usedVisits: number;
  readonly remainingVisits: number;
  readonly includedHours: number | null;
  readonly usedHours: number;
  readonly remainingHours: number | null;
  readonly includedPartsValue: number | null;
  readonly usedPartsValue: number;
  readonly remainingPartsValue: number | null;
  readonly includedCallOuts: number | null;
  readonly usedCallOuts: number;
  readonly remainingCallOuts: number | null;
  readonly visitUtilization: number;
  readonly hourUtilization: number | null;
  readonly partsUtilization: number | null;
  readonly overallUtilization: number;
  readonly alerts: readonly string[];
  readonly overConsumed: boolean;
}

/** SRS 6.21 */
export interface AmcFinancials {
  readonly contractValue: number;
  readonly invoiced: number;
  readonly collected: number;
  readonly outstanding: number;
  readonly laborCost: number;
  readonly partsCost: number;
  readonly consumablesCost: number;
  readonly travelCost: number;
  readonly subcontractorCost: number;
  readonly otherCost: number;
  readonly totalCost: number;
  readonly grossProfit: number;
  readonly grossMargin: number;
}

/** SRS 6.18 */
export interface AmcPerformance {
  readonly scheduledVisits: number;
  readonly completedVisits: number;
  readonly missedVisits: number;
  readonly overdueVisits: number;
  readonly rescheduledVisits: number;
  readonly breakdownRequests: number;
  readonly emergencyRequests: number;
  readonly avgResponseHours: number;
  readonly avgResolutionHours: number;
  readonly slaCompliance: number;
  readonly firstTimeFixRate: number;
  readonly repeatFailureRate: number;
  readonly partsConsumption: number;
  readonly technicianHours: number;
}

export interface AmcListItem extends Amc {
  readonly effectiveStatus: AmcStatus;
  readonly customerName: string;
  readonly customerCode: string;
  readonly siteNames: readonly string[];
  readonly contractManagerName: string;
  readonly parentContractNumber: string | null;
  readonly parentContractStatus: string | null;
  readonly daysRemaining: number;
  readonly consumption: Consumption;
  readonly financials: AmcFinancials;
  readonly upcomingPm: number;
  readonly overduePm: number;
  readonly openRequests: number;
  readonly openWorkOrders: number;
  readonly renewedById: string | null;
}

export interface AmcFilter {
  readonly customerId?: string;
}
