import type { Priority, ServiceFrequency } from './amc.model';

// ── 6.8 Coverage ─────────────────────────────────────────────────────────────
export const COVERAGE_LEVELS = ['Customer', 'Site', 'Asset', 'Asset Category', 'Service'] as const;
export type CoverageLevel = (typeof COVERAGE_LEVELS)[number];
export const COVERAGE_TYPES = ['Full Maintenance', 'Preventive Maintenance', 'Corrective Maintenance', 'Breakdown Service', 'Emergency Service', 'Inspection', 'Calibration', 'Installation Support', 'Remote Support'] as const;
export type CoverageType = (typeof COVERAGE_TYPES)[number];
export const LABOR_COVERAGE = ['Included', 'Partially Included', 'Excluded'] as const;
export type LaborCoverage = (typeof LABOR_COVERAGE)[number];
export const PARTS_COVERAGE = ['All Covered Parts', 'Selected Parts', 'Consumables Only', 'Excluded'] as const;
export type PartsCoverage = (typeof PARTS_COVERAGE)[number];
export const COVERAGE_STATUSES = ['Active', 'Inactive', 'Expired'] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export interface CoverageLine {
  readonly id: string;
  readonly amcId: string;
  readonly level: CoverageLevel;
  readonly siteId: string | null;
  readonly assetId: string | null;
  readonly assetCategory: string | null;
  readonly serviceId: string | null;
  readonly coverageType: CoverageType;
  readonly labor: LaborCoverage;
  readonly parts: PartsCoverage;
  readonly maxVisits: number | null;
  readonly maxHours: number | null;
  readonly maxPartsValue: number | null;
  readonly maxCallOuts: number | null;
  readonly serviceHours: string;
  readonly geographicRestriction: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: CoverageStatus;
}

export type CoverageInput = Omit<CoverageLine, 'id'>;

export interface CoverageListItem extends CoverageLine {
  readonly effectiveStatus: CoverageStatus;
  readonly amcNumber: string;
  readonly customerName: string;
  readonly target: string;
}

// ── 6.9 Service plan ─────────────────────────────────────────────────────────
export interface ServicePlanLine {
  readonly id: string;
  readonly amcId: string;
  readonly serviceId: string;
  readonly serviceType: string;
  readonly frequency: ServiceFrequency;
  /** Occurrences per asset per year (derived from frequency unless Custom). */
  readonly occurrences: number;
  /** Assets the plan applies to; empty = all AMC assets. */
  readonly assetIds: readonly string[];
  readonly durationHours: number;
  readonly skill: string;
  readonly team: string;
  readonly parts: string;
  readonly checklist: string;
  readonly serviceWindow: string;
  readonly priority: Priority;
  readonly active: boolean;
}

export type ServicePlanInput = Omit<ServicePlanLine, 'id'>;

export interface ServicePlanListItem extends ServicePlanLine {
  readonly amcNumber: string;
  readonly customerName: string;
  readonly serviceName: string;
  readonly assetCount: number;
  readonly plannedEvents: number;
  readonly completedEvents: number;
}

// ── 6.10 PM schedule ─────────────────────────────────────────────────────────
export const PM_STATUSES = ['Planned', 'Scheduled', 'Assigned', 'In Progress', 'Completed', 'Rescheduled', 'Missed', 'Cancelled', 'Overdue'] as const;
export type PmStatus = (typeof PM_STATUSES)[number];

export interface PmEvent {
  readonly id: string;
  readonly number: string;
  readonly amcId: string;
  readonly planId: string | null;
  readonly assetId: string;
  readonly siteId: string;
  readonly serviceId: string;
  readonly maintenanceType: string;
  readonly scheduledDate: string;
  readonly dueDate: string;
  readonly window: string;
  readonly team: string;
  readonly technician: string | null;
  readonly priority: Priority;
  readonly status: PmStatus;
  readonly rescheduledFrom: string | null;
  readonly visitId: string | null;
  readonly workOrder: string | null;
  readonly escalated: boolean;
  readonly completedAt: string | null;
}

export interface PmEventListItem extends PmEvent {
  readonly effectiveStatus: PmStatus;
  readonly amcNumber: string;
  readonly customerName: string;
  readonly siteName: string;
  readonly assetName: string;
  readonly serviceName: string;
  readonly daysToDue: number;
}

// ── 6.11 Visits ──────────────────────────────────────────────────────────────
export const VISIT_TYPES = ['Preventive Maintenance', 'Inspection', 'Breakdown', 'Emergency', 'Calibration', 'Service Review', 'Other'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];
export const VISIT_STATUSES = ['Planned', 'Scheduled', 'Assigned', 'Confirmed', 'In Progress', 'Completed', 'Rescheduled', 'Cancelled', 'Missed'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export interface Visit {
  readonly id: string;
  readonly number: string;
  readonly amcId: string;
  readonly siteId: string;
  readonly assetIds: readonly string[];
  readonly serviceId: string | null;
  readonly plannedDate: string;
  readonly window: string;
  readonly technician: string | null;
  readonly team: string;
  readonly type: VisitType;
  readonly status: VisitStatus;
  readonly eventIds: readonly string[];
  readonly workOrder: string | null;
  readonly hours: number;
  readonly partsValue: number;
  readonly consumablesValue: number;
  readonly covered: boolean;
  readonly responseHours: number | null;
  readonly firstTimeFix: boolean | null;
  readonly report: string;
  readonly completedAt: string | null;
}

export interface VisitListItem extends Visit {
  readonly amcNumber: string;
  readonly customerName: string;
  readonly siteName: string;
  readonly assetNames: readonly string[];
  readonly serviceName: string | null;
}

export interface VisitInput {
  readonly amcId: string;
  readonly siteId: string;
  readonly assetIds: readonly string[];
  readonly serviceId: string | null;
  readonly plannedDate: string;
  readonly window: string;
  readonly type: VisitType;
  readonly team: string;
  readonly technician: string | null;
}

export interface VisitCompletion {
  readonly hours: number;
  readonly partsValue: number;
  readonly consumablesValue: number;
  readonly firstTimeFix: boolean;
  readonly report: string;
}

// ── 6.13 Billing ─────────────────────────────────────────────────────────────
export const BILLING_STATUSES = ['Planned', 'Ready for Billing', 'Invoiced', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export interface BillingLine {
  readonly id: string;
  readonly number: string;
  readonly amcId: string;
  readonly period: string;
  readonly billingDate: string;
  readonly dueDate: string;
  readonly amount: number;
  readonly discount: number;
  readonly tax: number;
  readonly net: number;
  readonly currency: string;
  readonly status: BillingStatus;
  readonly invoiceNumber: string | null;
  readonly paidAmount: number;
  readonly onHold: boolean;
}

export interface BillingListItem extends BillingLine {
  readonly effectiveStatus: BillingStatus;
  readonly amcNumber: string;
  readonly customerName: string;
  readonly billingFrequency: string;
}

// ── 6.14 Suspension / Termination ────────────────────────────────────────────
export interface Suspension {
  readonly id: string;
  readonly amcId: string;
  readonly suspensionDate: string;
  readonly requestedBy: string;
  readonly approvedBy: string | null;
  readonly reason: string;
  readonly periodDays: number | null;
  readonly pauseMaintenance: boolean;
  readonly pauseBilling: boolean;
  readonly notes: string;
  readonly resumedAt: string | null;
  readonly status: 'Active' | 'Resumed';
}

export const TERMINATION_TYPES = ['Customer Request', 'Company Request', 'Mutual Termination', 'Contractual Termination', 'Early Termination', 'Non-Renewal', 'Breach'] as const;
export type TerminationType = (typeof TERMINATION_TYPES)[number];
export const SETTLEMENT_STATUSES = ['Pending', 'In Progress', 'Settled'] as const;

export interface Termination {
  readonly id: string;
  readonly amcId: string;
  readonly terminationDate: string;
  readonly type: TerminationType;
  readonly requestedBy: string;
  readonly approvedBy: string | null;
  readonly reason: string;
  readonly noticePeriodDays: number;
  readonly finalServiceDate: string;
  readonly outstandingBilling: number;
  readonly outstandingServices: number;
  readonly settlementStatus: string;
  readonly documents: readonly string[];
  readonly notes: string;
  readonly createdAt: string;
}

export interface SuspensionTerminationItem {
  readonly id: string;
  readonly kind: 'Suspension' | 'Termination';
  readonly amcId: string;
  readonly amcNumber: string;
  readonly customerName: string;
  readonly date: string;
  readonly type: string;
  readonly reason: string;
  readonly requestedBy: string;
  readonly approvedBy: string | null;
  readonly impact: string;
  readonly status: string;
}

// ── 6.17 Renewal ─────────────────────────────────────────────────────────────
export interface RenewalReview {
  readonly amcId: string;
  readonly previousValue: number;
  readonly currency: string;
  readonly usage: number;
  readonly visitPerformance: number;
  readonly breakdownFrequency: number;
  readonly partsConsumption: number;
  readonly serviceCost: number;
  readonly revenue: number;
  readonly profitability: number;
  readonly serviceHistory: number;
  readonly suggestedPrice: number;
  readonly assetCount: number;
  readonly serviceCount: number;
}

export interface RenewalInput {
  readonly termMonths: number;
  readonly revisedValue: number;
  readonly revisedAssetIds: readonly string[];
  readonly revisedServiceIds: readonly string[];
  readonly scopeNotes: string;
}

// ── 6.20 Coverage validation ─────────────────────────────────────────────────
export const COVERAGE_RESULTS = ['Fully Covered', 'Partially Covered', 'Not Covered', 'Coverage Expired', 'Usage Limit Exceeded', 'Asset Not Covered', 'Service Not Covered', 'Site Not Covered'] as const;
export type CoverageResult = (typeof COVERAGE_RESULTS)[number];

export interface CoverageRequest {
  readonly customerId: string;
  readonly amcId: string | null;
  readonly siteId: string | null;
  readonly assetId: string | null;
  readonly serviceId: string | null;
  readonly date: string;
  readonly needsParts: boolean;
  readonly partsValue: number;
}

export interface CoverageStep {
  readonly step: string;
  readonly result: 'pass' | 'fail' | 'warn' | 'na';
  readonly detail: string;
}

export interface CoverageDecision {
  readonly request: CoverageRequest;
  readonly amcId: string | null;
  readonly amcNumber: string | null;
  readonly result: CoverageResult;
  readonly covered: boolean;
  readonly billable: boolean;
  readonly laborCovered: boolean;
  readonly partsCovered: boolean;
  readonly responseHours: number | null;
  readonly resolutionHours: number | null;
  readonly steps: readonly CoverageStep[];
  readonly summary: string;
}

// ── 6.15 History ─────────────────────────────────────────────────────────────
export const AMC_HISTORY_ACTIONS = [
  'AMC Created', 'AMC Updated', 'Submitted for Approval', 'AMC Approved', 'AMC Rejected', 'AMC Activated', 'Site Added', 'Asset Added', 'Asset Removed', 'Service Added', 'Service Removed',
  'Coverage Changed', 'Plan Updated', 'Schedule Created', 'Visit Scheduled', 'Visit Completed', 'Visit Rescheduled', 'Visit Cancelled', 'Parts Used', 'Entitlement Consumed',
  'Billing Generated', 'Billing Updated', 'AMC Suspended', 'AMC Resumed', 'AMC Amended', 'AMC Renewed', 'AMC Terminated', 'AMC Expired', 'Document Uploaded', 'Maintenance Escalated',
] as const;
export type AmcHistoryAction = (typeof AMC_HISTORY_ACTIONS)[number];
export const AMC_HISTORY_ENTITIES = ['AMC', 'Coverage', 'Service Plan', 'Schedule', 'Visit', 'Billing', 'Suspension', 'Termination', 'Renewal', 'Document'] as const;
export type AmcHistoryEntity = (typeof AMC_HISTORY_ENTITIES)[number];

export interface AmcHistoryEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly user: string;
  readonly action: AmcHistoryAction;
  readonly entity: AmcHistoryEntity;
  readonly entityId: string;
  readonly amcId: string | null;
  readonly label: string;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly reference: string | null;
  readonly comments: string;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export interface AmcDashboardFilters {
  readonly customers: readonly string[];
  readonly sites: readonly string[];
  readonly types: readonly string[];
  readonly statuses: readonly string[];
  readonly managers: readonly string[];
  readonly regions: readonly string[];
  readonly start: { readonly from: string; readonly to: string };
  readonly end: { readonly from: string; readonly to: string };
}

export interface AmcDashboardRow {
  readonly id: string;
  readonly amcId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly date: string | null;
  readonly value: number;
}

export interface AmcDashboard {
  readonly kpis: {
    readonly total: number;
    readonly draft: number;
    readonly pendingActivation: number;
    readonly active: number;
    readonly expiring: number;
    readonly expired: number;
    readonly suspended: number;
    readonly terminated: number;
    readonly coveredAssets: number;
    readonly coveredSites: number;
    readonly upcomingPm: number;
    readonly overduePm: number;
    readonly openRequests: number;
    readonly openWorkOrders: number;
    readonly completedVisits: number;
    readonly remainingVisits: number;
    readonly contractValue: number;
    readonly billed: number;
    readonly outstanding: number;
    readonly currency: string;
  };
  readonly expiringSoon: readonly AmcDashboardRow[];
  readonly upcomingPm: readonly AmcDashboardRow[];
  readonly overduePm: readonly AmcDashboardRow[];
  readonly recentVisits: readonly AmcDashboardRow[];
  readonly openRequests: readonly AmcDashboardRow[];
  readonly unscheduledAssets: readonly AmcDashboardRow[];
  readonly utilization: readonly { readonly id: string; readonly label: string; readonly value: number }[];
  readonly revenueCost: { readonly revenue: number; readonly cost: number; readonly profit: number; readonly margin: number };
  readonly profitByAmc: readonly { readonly id: string; readonly label: string; readonly value: number }[];
}
