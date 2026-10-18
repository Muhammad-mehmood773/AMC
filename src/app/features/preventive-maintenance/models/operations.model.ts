import type { Priority } from './plan.model';

// ── 8.9 Recurring schedule ───────────────────────────────────────────────────
export const OCCURRENCE_STATUSES = ['Planned', 'Scheduled', 'Assigned', 'Confirmed', 'In Progress', 'Completed', 'Rescheduled', 'Missed', 'Cancelled', 'Overdue'] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];
export const OPEN_STATUSES: readonly OccurrenceStatus[] = ['Planned', 'Scheduled', 'Assigned', 'Confirmed', 'Rescheduled', 'Overdue'];
export const ASSIGNMENT_STATUSES = ['Unassigned', 'Assigned', 'Accepted', 'Rejected', 'Reassigned', 'Confirmed', 'In Progress', 'Completed'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export const DUE_CATEGORIES = ['Due Today', 'Due Tomorrow', 'Due This Week', 'Due This Month', 'Due Soon', 'Overdue', 'Severely Overdue', 'Missed'] as const;
export type DueCategory = (typeof DUE_CATEGORIES)[number];
export const OVERDUE_REASONS = ['Technician Unavailable', 'Customer Unavailable', 'Site Access Issue', 'Parts Unavailable', 'Tool Unavailable', 'Emergency Workload', 'Scheduling Conflict', 'Customer Requested Delay', 'Other'] as const;

export interface Reschedule {
  readonly at: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly fromWindow: string;
  readonly toWindow: string;
  readonly reason: string;
  readonly requestedBy: string;
  readonly approvedBy: string;
  readonly slaImpact: string;
  readonly amcImpact: string;
  readonly customerApproval: boolean;
  readonly notes: string;
}

export const COMPLETION_RESULTS = ['Maintenance Completed Successfully', 'Maintenance Completed with Findings', 'Maintenance Requires Corrective Action', 'Maintenance Partially Completed', 'Maintenance Failed', 'Follow-Up Required'] as const;
export type CompletionResult = (typeof COMPLETION_RESULTS)[number];
export const ASSET_CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Critical'] as const;

export interface ChecklistResult {
  readonly itemId: string;
  readonly value: string;
  readonly pass: boolean | null;
}

/** SRS 8.21 */
export interface Completion {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMinutes: number;
  readonly checklist: readonly ChecklistResult[];
  readonly tasksDone: readonly string[];
  readonly partsUsed: readonly { readonly partNumber: string; readonly quantity: number }[];
  readonly toolsUsed: string;
  readonly assetCondition: string;
  readonly defects: string;
  readonly correctiveActions: string;
  readonly recommendations: string;
  readonly technicianNotes: string;
  readonly customerNotes: string;
  readonly customerSignature: boolean;
  readonly technicianSignature: boolean;
  readonly photos: number;
  readonly result: CompletionResult;
  readonly reportNumber: string;
}

export interface Occurrence {
  readonly id: string;
  readonly number: string;
  readonly planId: string;
  readonly planVersion: string;
  readonly assetId: string;
  readonly siteId: string;
  readonly customerId: string;
  readonly serviceId: string | null;
  readonly maintenanceType: string;
  /** Original planned date — preserved through rescheduling (SRS 8.17). */
  readonly originalDate: string;
  readonly scheduledDate: string;
  readonly dueDate: string;
  readonly window: string;
  readonly team: string;
  readonly technician: string | null;
  readonly priority: Priority;
  readonly status: Exclude<OccurrenceStatus, 'Overdue'>;
  readonly assignment: AssignmentStatus;
  readonly workOrderId: string | null;
  /** Rule that generated the occurrence (SRS 8.25 traceability). */
  readonly generatedBy: string;
  readonly reschedules: readonly Reschedule[];
  readonly overdueReason: string | null;
  readonly escalationLevel: number;
  readonly cancelReason: string | null;
  readonly completion: Completion | null;
  readonly correctiveWorkOrderIds: readonly string[];
}

export interface OccurrenceListItem extends Occurrence {
  readonly effectiveStatus: OccurrenceStatus;
  readonly dueCategory: DueCategory | null;
  readonly daysOverdue: number;
  readonly daysToDue: number;
  readonly planNumber: string;
  readonly planName: string;
  readonly customerName: string;
  readonly siteName: string;
  readonly assetName: string;
  readonly serviceName: string | null;
  readonly workOrderNumber: string | null;
  readonly region: string;
}

// ── 8.14 Work orders ─────────────────────────────────────────────────────────
export const PM_WO_STATUSES = ['Open', 'Assigned', 'Dispatched', 'In Progress', 'Completed', 'Cancelled'] as const;
export type PmWoStatus = (typeof PM_WO_STATUSES)[number];

export interface PmWorkOrder {
  readonly id: string;
  readonly number: string;
  readonly kind: 'Preventive' | 'Corrective';
  readonly occurrenceId: string;
  readonly planId: string;
  readonly customerId: string;
  readonly siteId: string;
  readonly assetId: string;
  readonly serviceId: string | null;
  readonly maintenanceType: string;
  readonly priority: Priority;
  readonly plannedDate: string;
  readonly dueDate: string;
  readonly team: string;
  readonly technician: string | null;
  readonly checklistId: string | null;
  readonly parts: readonly { readonly partNumber: string; readonly quantity: number }[];
  readonly tools: string;
  readonly status: PmWoStatus;
  readonly generatedBy: string;
  readonly createdAt: string;
  readonly defect: string | null;
  readonly severity: string | null;
  readonly estimatedCost: number | null;
}

export interface PmWorkOrderListItem extends PmWorkOrder {
  readonly planNumber: string;
  readonly occurrenceNumber: string;
  readonly customerName: string;
  readonly siteName: string;
  readonly assetName: string;
  readonly serviceName: string | null;
  readonly partsAvailable: boolean;
}

// ── 8.11 Checklists ──────────────────────────────────────────────────────────
export const CHECKLIST_ITEM_TYPES = ['Yes / No', 'Pass / Fail', 'Numeric', 'Text', 'Selection', 'Measurement', 'Photo Required', 'Signature Required'] as const;
export type ChecklistItemType = (typeof CHECKLIST_ITEM_TYPES)[number];

export interface ChecklistItem {
  readonly id: string;
  readonly sequence: number;
  readonly task: string;
  readonly type: ChecklistItemType;
  readonly required: boolean;
  readonly inspectionPoint: string;
  readonly expected: string;
  readonly unit: string;
  readonly min: number | null;
  readonly max: number | null;
  readonly options: readonly string[];
}

export interface Checklist {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly assetCategory: string;
  readonly serviceId: string | null;
  readonly version: string;
  readonly status: 'Active' | 'Inactive';
  readonly items: readonly ChecklistItem[];
}

export type ChecklistInput = Omit<Checklist, 'id' | 'number' | 'version'>;

export interface ChecklistListItem extends Checklist {
  readonly planCount: number;
  readonly measurementCount: number;
}

// ── 8.12 Tasks ───────────────────────────────────────────────────────────────
export const TASK_TYPES = ['Inspection', 'Cleaning', 'Lubrication', 'Adjustment', 'Calibration', 'Replacement', 'Testing', 'Measurement', 'Functional Test', 'Safety Check'] as const;

export interface MaintenanceTask {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly description: string;
  readonly type: string;
  readonly sequence: number;
  readonly durationMinutes: number;
  readonly skill: string;
  readonly certification: string;
  readonly tool: string;
  readonly partNumber: string | null;
  readonly consumable: string;
  readonly safety: string;
  readonly procedure: string;
  readonly acceptance: string;
  readonly dependsOn: string | null;
  readonly assetCategory: string;
}

export type MaintenanceTaskInput = Omit<MaintenanceTask, 'id' | 'number'>;

export interface TaskListItem extends MaintenanceTask {
  readonly dependsOnName: string | null;
  readonly partName: string | null;
  readonly planCount: number;
}

// ── 8.13 Meter / condition rules ─────────────────────────────────────────────
export const METER_TYPES = ['Operating Hours', 'Mileage', 'Runtime', 'Production Units', 'Machine Cycles', 'Usage Count', 'Energy Consumption', 'Custom Meter'] as const;
export const CONDITION_PARAMETERS = ['Temperature', 'Pressure', 'Vibration', 'Performance', 'Sensor Alert', 'Inspection Failure', 'Asset Health'] as const;

export interface Reading {
  readonly at: string;
  readonly value: number;
  readonly by: string;
  readonly triggered: boolean;
}

export interface MeterRule {
  readonly id: string;
  readonly number: string;
  readonly kind: 'Meter' | 'Condition';
  readonly planId: string;
  readonly assetId: string;
  readonly meterType: string;
  readonly parameter: string;
  readonly operator: '>' | '<';
  readonly unit: string;
  /** Meter: maintenance interval; condition: threshold value. */
  readonly interval: number;
  readonly lastTriggerReading: number;
  readonly readings: readonly Reading[];
  readonly status: 'Active' | 'Inactive';
}

export type MeterRuleInput = Omit<MeterRule, 'id' | 'number' | 'readings'> & { readonly initialReading: number };

export interface MeterRuleListItem extends MeterRule {
  readonly planNumber: string;
  readonly planName: string;
  readonly assetName: string;
  readonly currentReading: number | null;
  readonly previousReading: number | null;
  readonly readingDate: string | null;
  readonly nextMaintenanceReading: number | null;
  readonly progress: number;
  readonly state: 'Normal' | 'Approaching' | 'Threshold Reached';
}

// ── 8.23 Parts ───────────────────────────────────────────────────────────────
export interface StockPart {
  readonly partNumber: string;
  readonly description: string;
  readonly kind: 'Part' | 'Consumable';
  readonly category: string;
  readonly unit: string;
  readonly stock: number;
  readonly reserved: number;
  readonly warehouse: string;
  readonly unitCost: number;
}

// ── 8.26 Validation ──────────────────────────────────────────────────────────
export const PM_VALIDATION_RESULTS = ['Maintenance Scheduled', 'Maintenance Not Applicable', 'Asset Not Covered', 'Maintenance Plan Inactive', 'Maintenance Plan Suspended', 'Contract Expired', 'AMC Expired', 'Required Parts Unavailable', 'Technician Not Available', 'Maintenance Window Conflict', 'Duplicate Schedule Detected', 'Invalid Recurrence Rule', 'Maintenance Overdue', 'Maintenance Requires Approval'] as const;
export type PmValidationResult = (typeof PM_VALIDATION_RESULTS)[number];

export interface PmValidation {
  readonly result: PmValidationResult;
  readonly ok: boolean;
  readonly steps: readonly { readonly step: string; readonly result: 'pass' | 'fail' | 'warn' | 'na'; readonly detail: string }[];
  readonly summary: string;
}

// ── 8.10 Calendar conflicts ──────────────────────────────────────────────────
export const CONFLICT_TYPES = ['Technician Double Booking', 'Team Double Booking', 'Asset Conflict', 'Site Access Conflict', 'Maintenance Window Conflict', 'Holiday Conflict', 'Non-Working Day Conflict'] as const;

export interface CalendarConflict {
  readonly type: (typeof CONFLICT_TYPES)[number];
  readonly date: string;
  readonly occurrenceIds: readonly string[];
  readonly detail: string;
}

// ── 8.27 / 8.29 Performance & review ─────────────────────────────────────────
export interface PmPerformance {
  readonly planned: number;
  readonly scheduled: number;
  readonly completed: number;
  readonly due: number;
  readonly overdue: number;
  readonly missed: number;
  readonly rescheduled: number;
  readonly compliance: number | null;
  readonly onTime: number | null;
  readonly avgCompletionMinutes: number | null;
  readonly repeatFailureRate: number;
  readonly correctiveGenerated: number;
  readonly preventiveVsCorrective: string;
  readonly partsConsumption: number;
  readonly cost: number;
  readonly technicianHours: number;
}

export interface AssetPerformanceRow {
  readonly assetId: string;
  readonly assetName: string;
  readonly category: string;
  readonly siteName: string;
  readonly maintenanceFrequency: number;
  readonly breakdowns: number;
  readonly repeatFailures: number;
  readonly cost: number;
  readonly downtimeHours: number;
  readonly availability: number;
  readonly compliance: number | null;
  readonly corrective: number;
}

export interface PlanReview {
  readonly planId: string;
  readonly previousFrequency: string;
  readonly actualFrequency: string;
  readonly breakdownFrequency: number;
  readonly repeatFailureRate: number;
  readonly cost: number;
  readonly partsConsumption: number;
  readonly technicianHours: number;
  readonly assetCondition: string;
  readonly correctiveActions: number;
  readonly suggestion: string;
}

export interface PlanReviewInput {
  readonly frequencyType: string;
  readonly frequencyValue: number;
  readonly effectiveDate: string;
  readonly checklistId: string | null;
  readonly parts: readonly { readonly partNumber: string; readonly quantity: number }[];
  readonly window: string;
  readonly notes: string;
}

// ── 8.28 History ─────────────────────────────────────────────────────────────
export const PM_HISTORY_ACTIONS = [
  'Maintenance Plan Created', 'Maintenance Plan Activated', 'Maintenance Plan Modified', 'Schedule Generated', 'Work Order Generated', 'Technician Assigned', 'Maintenance Scheduled', 'Maintenance Rescheduled',
  'Maintenance Started', 'Checklist Completed', 'Parts Issued', 'Parts Consumed', 'Defect Identified', 'Corrective Work Order Created', 'Maintenance Completed', 'Maintenance Missed', 'Maintenance Cancelled',
  'Maintenance Overdue', 'Maintenance Plan Suspended', 'Maintenance Plan Resumed', 'Submitted for Approval', 'Maintenance Plan Approved', 'Meter Reading Recorded', 'Maintenance Triggered', 'Plan Reviewed', 'Document Uploaded',
] as const;
export type PmHistoryAction = (typeof PM_HISTORY_ACTIONS)[number];
export const PM_HISTORY_ENTITIES = ['Plan', 'Schedule', 'Work Order', 'Checklist', 'Task', 'Meter Rule', 'Parts', 'Document'] as const;
export type PmHistoryEntity = (typeof PM_HISTORY_ENTITIES)[number];

export interface PmHistoryEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly user: string;
  readonly action: PmHistoryAction;
  readonly entity: PmHistoryEntity;
  readonly entityId: string;
  readonly planId: string | null;
  readonly label: string;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly reference: string | null;
  readonly comments: string;
}

// ── 8.4 Dashboard ────────────────────────────────────────────────────────────
export interface PmDashboardFilters {
  readonly customers: readonly string[];
  readonly sites: readonly string[];
  readonly assets: readonly string[];
  readonly categories: readonly string[];
  readonly plans: readonly string[];
  readonly types: readonly string[];
  readonly services: readonly string[];
  readonly statuses: readonly string[];
  readonly teams: readonly string[];
  readonly technicians: readonly string[];
  readonly regions: readonly string[];
  readonly due: { readonly from: string; readonly to: string };
  readonly scheduled: { readonly from: string; readonly to: string };
}

export interface CountRow {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly secondary?: number;
}

export interface PmDashboard {
  readonly kpis: {
    readonly totalPlans: number;
    readonly activePlans: number;
    readonly draftPlans: number;
    readonly suspendedPlans: number;
    readonly coveredAssets: number;
    readonly scheduled: number;
    readonly due: number;
    readonly upcoming: number;
    readonly overdue: number;
    readonly completed: number;
    readonly missed: number;
    readonly cancelled: number;
    readonly rescheduled: number;
    readonly openWorkOrders: number;
    readonly completedWorkOrders: number;
    readonly compliance: number | null;
    readonly completionRate: number | null;
    readonly overdueRate: number | null;
    readonly avgCompletionMinutes: number | null;
    readonly cost: number;
  };
  readonly dueToday: readonly OccurrenceListItem[];
  readonly dueWeek: readonly OccurrenceListItem[];
  readonly dueMonth: number;
  readonly overdue: readonly OccurrenceListItem[];
  readonly upcoming: readonly OccurrenceListItem[];
  readonly missed: readonly OccurrenceListItem[];
  readonly workOrders: readonly PmWorkOrderListItem[];
  readonly assetsWithoutPlans: readonly CountRow[];
  readonly repeatedFailures: readonly CountRow[];
  readonly bySite: readonly CountRow[];
  readonly byCategory: readonly CountRow[];
  readonly byTeam: readonly CountRow[];
  readonly complianceTrend: readonly CountRow[];
  readonly costTrend: readonly CountRow[];
  readonly parts: readonly CountRow[];
  readonly recurring: readonly OccurrenceListItem[];
}
