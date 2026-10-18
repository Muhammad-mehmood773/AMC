import type { Priority, TimeUnit } from './sla.model';

// ── 7.8 Targets ──────────────────────────────────────────────────────────────
export const TARGET_TYPES = ['First Response', 'Acknowledgement', 'Assignment', 'Technician Dispatch', 'On-Site Arrival', 'Restoration', 'Resolution', 'Closure'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];
export const START_EVENTS = ['Service Request Created', 'Service Request Submitted', 'Customer Request Received', 'Request Accepted', 'Work Order Created', 'Work Order Assigned'] as const;
export const STOP_EVENTS = ['First Response Sent', 'Request Acknowledged', 'Technician Assigned', 'Technician Arrived', 'Service Restored', 'Work Completed', 'Resolution Confirmed', 'Request Closed'] as const;
export const PAUSE_REASONS = ['Waiting for Customer', 'Waiting for Customer Approval', 'Waiting for Parts', 'Waiting for External Vendor', 'Site Inaccessible', 'Customer Requested Delay', 'Scheduled Maintenance Window', 'Other Approved Hold'] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];
export const WARNING_LEVELS = ['Normal', 'Warning', 'Critical', 'Breached'] as const;
export type WarningLevel = (typeof WARNING_LEVELS)[number];

export interface SlaTarget {
  readonly id: string;
  readonly slaId: string;
  readonly priority: Priority | 'All';
  readonly targetType: TargetType;
  readonly durationMinutes: number;
  readonly unit: TimeUnit;
  readonly calendarId: string;
  readonly startEvent: string;
  readonly stopEvent: string;
  readonly pauseEvents: readonly string[];
  readonly resumeEvent: string;
  readonly warningPercent: number;
  readonly escalationPercent: number;
  readonly breachPercent: number;
}

export type SlaTargetInput = Omit<SlaTarget, 'id'>;

export interface SlaTargetListItem extends SlaTarget {
  readonly slaNumber: string;
  readonly slaName: string;
  readonly calendarName: string;
}

// ── 7.9 Coverage & applicability ─────────────────────────────────────────────
export const SLA_COVERAGE_LEVELS = ['Customer', 'Contract', 'AMC', 'Site', 'Asset', 'Asset Category', 'Service', 'Service Category'] as const;
export type SlaCoverageLevel = (typeof SLA_COVERAGE_LEVELS)[number];

export interface SlaCoverage {
  readonly id: string;
  readonly slaId: string;
  readonly level: SlaCoverageLevel;
  readonly customerId: string | null;
  readonly contractId: string | null;
  readonly amcId: string | null;
  readonly siteId: string | null;
  readonly assetId: string | null;
  readonly assetCategory: string | null;
  readonly serviceId: string | null;
  readonly serviceCategory: string | null;
  readonly priority: Priority | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly status: 'Active' | 'Inactive';
}

export type SlaCoverageInput = Omit<SlaCoverage, 'id'>;

export interface SlaCoverageListItem extends SlaCoverage {
  readonly slaNumber: string;
  readonly slaName: string;
  readonly target: string;
  readonly effectiveStatus: 'Active' | 'Inactive' | 'Expired';
}

// ── 7.10 Calendars ───────────────────────────────────────────────────────────
export const CALENDAR_TYPES = ['24x7', 'Business Hours', 'Extended Business Hours', 'Custom Hours', 'Customer-Specific Calendar', 'Contract-Specific Calendar'] as const;
export const TIME_ZONES = ['Asia/Riyadh', 'Asia/Dubai', 'Asia/Karachi', 'Europe/London', 'UTC'] as const;
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const HOLIDAY_TYPES = ['Public Holiday', 'Religious Holiday', 'Company Holiday', 'Customer Holiday'] as const;

export interface DayHours {
  readonly working: boolean;
  readonly start: string;
  readonly end: string;
}

export interface SlaCalendar {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly timeZone: string;
  /** Index 0 = Sunday. */
  readonly days: readonly DayHours[];
  readonly breakStart: string | null;
  readonly breakEnd: string | null;
  readonly weekendRules: string;
  readonly holidayCalendar: string;
  readonly effectiveDate: string;
  readonly status: 'Active' | 'Inactive';
  readonly customerId: string | null;
}

export type SlaCalendarInput = Omit<SlaCalendar, 'id'>;

export interface Holiday {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly type: string;
  readonly country: string;
  readonly region: string;
  readonly siteId: string | null;
  readonly calendar: string;
  readonly working: boolean;
  readonly overrideAllowed: boolean;
}

export type HolidayInput = Omit<Holiday, 'id'>;

// ── 7.11 Escalation rules ────────────────────────────────────────────────────
export const ESCALATION_LEVELS = ['Level 1 — Operational Team', 'Level 2 — Service Supervisor', 'Level 3 — Service Manager', 'Level 4 — Account Manager', 'Level 5 — Management'] as const;
export const TRIGGER_TYPES = ['Before SLA Breach', 'At SLA Breach', 'After SLA Breach', 'No Assignment', 'No Response', 'No Progress', 'Resolution Overdue', 'Repeated Breach'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];
export const NOTIFICATION_CHANNELS = ['In-App Notification', 'Email', 'SMS', 'Push Notification', 'Customer Notification', 'Internal Alert'] as const;
export const ESCALATION_ACTIONS = ['Notify Technician', 'Notify Supervisor', 'Notify Service Manager', 'Reassign Work Order', 'Increase Priority', 'Create Escalation Case', 'Notify Customer', 'Trigger Management Review'] as const;

export interface EscalationRule {
  readonly id: string;
  readonly slaId: string;
  readonly level: number;
  readonly triggerType: TriggerType;
  readonly triggerPercent: number | null;
  readonly triggerMinutes: number | null;
  readonly targetType: TargetType | 'Any';
  readonly recipient: string;
  readonly team: string;
  readonly channel: string;
  readonly action: string;
  readonly status: 'Active' | 'Inactive';
}

export type EscalationRuleInput = Omit<EscalationRule, 'id'>;

export interface EscalationRuleListItem extends EscalationRule {
  readonly slaNumber: string;
  readonly slaName: string;
  readonly levelName: string;
  readonly triggered: number;
}

export interface EscalationEvent {
  readonly id: string;
  readonly ruleId: string;
  readonly clockId: string;
  readonly slaId: string;
  readonly level: number;
  readonly triggeredAt: string;
  readonly consumption: number;
  readonly recipient: string;
  readonly channel: string;
  readonly action: string;
  readonly status: 'Open' | 'Acknowledged' | 'Closed';
}

export interface EscalationEventListItem extends EscalationEvent {
  readonly slaNumber: string;
  readonly transactionNumber: string;
  readonly customerName: string;
  readonly priority: Priority;
  readonly targetType: TargetType;
  readonly levelName: string;
}

// ── 7.12 Assignment / mapping ────────────────────────────────────────────────
export const MAPPING_LEVELS = ['Customer', 'Contract', 'AMC', 'Site', 'Asset', 'Service', 'Service Category', 'Priority'] as const;
export type MappingLevel = (typeof MAPPING_LEVELS)[number];

export interface SlaMapping {
  readonly id: string;
  readonly slaId: string;
  readonly level: MappingLevel;
  readonly customerId: string | null;
  readonly contractId: string | null;
  readonly amcId: string | null;
  readonly siteId: string | null;
  readonly assetId: string | null;
  readonly serviceId: string | null;
  readonly serviceCategory: string | null;
  readonly priority: Priority | null;
  readonly effectiveDate: string;
  readonly expiryDate: string | null;
  /** Lower number wins when specificity is equal. */
  readonly assignmentPriority: number;
  readonly status: 'Active' | 'Inactive';
}

export type SlaMappingInput = Omit<SlaMapping, 'id'>;

export interface SlaMappingListItem extends SlaMapping {
  readonly slaNumber: string;
  readonly slaName: string;
  readonly slaStatus: string;
  readonly scope: string;
  readonly specificity: number;
}

// ── 7.21 Validation / selection ──────────────────────────────────────────────
export const SLA_VALIDATION_RESULTS = ['SLA Applied', 'SLA Not Applicable', 'SLA Expired', 'SLA Suspended', 'Customer Not Covered', 'Site Not Covered', 'Asset Not Covered', 'Service Not Covered', 'Priority Not Covered', 'No Applicable SLA', 'Multiple Applicable SLAs', 'SLA Assignment Conflict'] as const;
export type SlaValidationResult = (typeof SLA_VALIDATION_RESULTS)[number];
export const APPLICABILITY_RESULTS = ['SLA Applicable', 'SLA Not Applicable', 'Multiple SLA Candidates', 'Higher Priority SLA Applied', 'Contract SLA Applied', 'Customer SLA Applied', 'Service-Specific SLA Applied', 'SLA Expired', 'SLA Suspended'] as const;
export type ApplicabilityResult = (typeof APPLICABILITY_RESULTS)[number];

export interface SlaRequest {
  readonly customerId: string;
  readonly contractId: string | null;
  readonly amcId: string | null;
  readonly siteId: string | null;
  readonly assetId: string | null;
  readonly serviceId: string | null;
  readonly priority: Priority;
  readonly requestType: string | null;
  readonly date: string;
}

export interface SlaCandidate {
  readonly slaId: string;
  readonly slaNumber: string;
  readonly slaName: string;
  readonly mappingId: string;
  readonly level: MappingLevel;
  readonly specificity: number;
  readonly assignmentPriority: number;
  readonly status: string;
  readonly eligible: boolean;
  readonly reason: string;
}

export interface SlaSelection {
  readonly request: SlaRequest;
  readonly result: SlaValidationResult;
  readonly applicability: ApplicabilityResult;
  readonly slaId: string | null;
  readonly slaNumber: string | null;
  readonly responseMinutes: number | null;
  readonly resolutionMinutes: number | null;
  readonly calendarName: string | null;
  readonly candidates: readonly SlaCandidate[];
  readonly steps: readonly { readonly step: string; readonly result: 'pass' | 'fail' | 'warn' | 'na'; readonly detail: string }[];
  readonly summary: string;
}

// ── 7.13 Clocks ──────────────────────────────────────────────────────────────
export const CLOCK_STATUSES = ['Not Started', 'Running', 'Paused', 'Warning', 'Critical', 'Breached', 'Met', 'Cancelled'] as const;
export type ClockStatus = (typeof CLOCK_STATUSES)[number];

export interface ClockPause {
  readonly id: string;
  readonly reason: PauseReason;
  readonly requestedBy: string;
  readonly approvedBy: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly resumeReason: string;
  readonly notes: string;
}

export interface SlaClock {
  readonly id: string;
  readonly number: string;
  readonly slaId: string;
  readonly slaVersion: string;
  readonly selection: string;
  readonly transactionType: 'Service Request' | 'Work Order';
  readonly transactionId: string;
  readonly transactionNumber: string;
  readonly subject: string;
  readonly customerId: string;
  readonly siteId: string;
  readonly assetId: string | null;
  readonly serviceId: string | null;
  readonly priority: Priority;
  readonly targetType: TargetType;
  /** Target snapshot — later SLA changes never alter historical calculations. */
  readonly targetMinutes: number;
  readonly calendarId: string;
  readonly warningPercent: number;
  readonly escalationPercent: number;
  readonly startEvent: string;
  readonly stopEvent: string;
  readonly startedAt: string;
  readonly stoppedAt: string | null;
  readonly status: 'Not Started' | 'Running' | 'Paused' | 'Met' | 'Breached' | 'Cancelled';
  readonly pauses: readonly ClockPause[];
  readonly team: string;
  readonly technician: string | null;
  readonly region: string;
  readonly notes: readonly { readonly at: string; readonly by: string; readonly text: string }[];
}

export interface SlaClockListItem extends SlaClock {
  readonly monitoringStatus: ClockStatus;
  readonly warningLevel: WarningLevel;
  readonly slaNumber: string;
  readonly slaName: string;
  readonly customerName: string;
  readonly siteName: string;
  readonly assetName: string | null;
  readonly serviceName: string | null;
  readonly elapsedMinutes: number;
  readonly remainingMinutes: number;
  readonly pausedMinutes: number;
  readonly consumption: number;
  readonly dueAt: string;
  readonly breachRisk: 'Low' | 'Medium' | 'High' | 'Breached';
  readonly escalationStatus: string;
  readonly breachId: string | null;
}

// ── 7.14 Breaches ────────────────────────────────────────────────────────────
export const BREACH_TYPES = ['Response Breach', 'Resolution Breach', 'Assignment Breach', 'Arrival Breach', 'Restoration Breach', 'Closure Breach'] as const;
export const BREACH_REASONS = ['Technician Delay', 'Parts Unavailable', 'Customer Delay', 'Site Access Issue', 'External Vendor Delay', 'Incorrect Assignment', 'Resource Constraint', 'System Issue', 'Emergency Workload', 'Other'] as const;
export const BREACH_STATUSES = ['Detected', 'Under Review', 'Acknowledged', 'Root Cause Identified', 'Corrective Action', 'Closed', 'Waived'] as const;
export type BreachStatus = (typeof BREACH_STATUSES)[number];

export interface SlaBreach {
  readonly id: string;
  readonly number: string;
  readonly clockId: string;
  readonly slaId: string;
  readonly breachType: string;
  readonly detectedAt: string;
  /** Original target and actual times are preserved. */
  readonly targetAt: string;
  readonly targetMinutes: number;
  readonly actualAt: string | null;
  readonly actualMinutes: number | null;
  readonly reason: string | null;
  readonly owner: string | null;
  readonly rootCause: string;
  readonly correctiveAction: string;
  readonly waiver: { readonly requestedBy: string; readonly reason: string; readonly approvedBy: string | null } | null;
  readonly status: BreachStatus;
  readonly penalty: number;
  readonly currency: string;
}

export interface SlaBreachListItem extends SlaBreach {
  readonly slaNumber: string;
  readonly slaName: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly transactionType: string;
  readonly transactionNumber: string;
  readonly siteName: string;
  readonly assetName: string | null;
  readonly serviceName: string | null;
  readonly priority: Priority;
  readonly targetType: TargetType;
  readonly breachMinutes: number;
  readonly team: string;
  readonly technician: string | null;
  readonly escalationStatus: string;
  readonly repeated: boolean;
}

// ── 7.15 / 7.23 Performance ──────────────────────────────────────────────────
export interface SlaPerformance {
  readonly total: number;
  readonly requests: number;
  readonly workOrders: number;
  readonly met: number;
  readonly breached: number;
  readonly compliance: number | null;
  readonly responseMet: number;
  readonly responseBreached: number;
  readonly responseCompliance: number | null;
  readonly resolutionMet: number;
  readonly resolutionBreached: number;
  readonly resolutionCompliance: number | null;
  readonly avgResponseMinutes: number | null;
  readonly avgResolutionMinutes: number | null;
  readonly avgBreachMinutes: number | null;
  readonly escalations: number;
  readonly repeatedBreaches: number;
  readonly firstResponseCompliance: number | null;
  readonly onTimeResolution: number | null;
  readonly availability: number | null;
  readonly firstTimeResolution: number | null;
}

export interface PerformanceRow {
  readonly key: string;
  readonly label: string;
  readonly total: number;
  readonly met: number;
  readonly breached: number;
  readonly compliance: number | null;
  readonly avgResponseMinutes: number | null;
  readonly avgResolutionMinutes: number | null;
  readonly escalations: number;
}

export const PERFORMANCE_DIMENSIONS = ['Customer', 'Contract', 'AMC', 'SLA', 'Service', 'Site', 'Asset', 'Priority', 'Service Team', 'Technician', 'Region'] as const;
export type PerformanceDimension = (typeof PERFORMANCE_DIMENSIONS)[number];

export interface TrendPoint {
  readonly label: string;
  readonly compliance: number | null;
  readonly avgResponseMinutes: number | null;
  readonly avgResolutionMinutes: number | null;
  readonly breaches: number;
  readonly escalations: number;
}

// ── 7.24 Renewal ─────────────────────────────────────────────────────────────
export interface SlaRenewalReview {
  readonly slaId: string;
  readonly previousVersion: string;
  readonly previousValue: number;
  readonly currency: string;
  readonly performance: SlaPerformance;
  readonly breachFrequency: number;
  readonly escalationFrequency: number;
  readonly complaints: number;
  readonly suggestion: string;
}

export interface SlaRenewalInput {
  readonly termMonths: number;
  readonly revisedValue: number;
  readonly revisedTargets: Readonly<Record<Priority, { readonly response: number; readonly resolution: number }>>;
  readonly revisedCalendarId: string;
  readonly revisedEscalation: string;
  readonly revisedCoverage: string;
  readonly revisedCommercial: string;
}

// ── 7.25 History ─────────────────────────────────────────────────────────────
export const SLA_HISTORY_ACTIONS = [
  'SLA Created', 'SLA Activated', 'SLA Assigned', 'Customer Added', 'Site Added', 'Asset Added', 'Service Added', 'Target Added', 'Target Modified', 'Calendar Changed', 'Escalation Added', 'Escalation Modified',
  'SLA Clock Started', 'SLA Paused', 'SLA Resumed', 'SLA Met', 'SLA Breached', 'Escalation Triggered', 'SLA Suspended', 'SLA Reactivated', 'SLA Amended', 'SLA Renewed', 'SLA Expired',
  'Submitted for Approval', 'SLA Approved', 'SLA Rejected', 'Breach Updated', 'Breach Waived', 'Mapping Changed', 'Coverage Changed', 'Document Uploaded',
] as const;
export type SlaHistoryAction = (typeof SLA_HISTORY_ACTIONS)[number];
export const SLA_HISTORY_ENTITIES = ['SLA', 'Target', 'Coverage', 'Calendar', 'Escalation', 'Mapping', 'Clock', 'Breach', 'Document'] as const;
export type SlaHistoryEntity = (typeof SLA_HISTORY_ENTITIES)[number];

export interface SlaHistoryEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly user: string;
  readonly action: SlaHistoryAction;
  readonly entity: SlaHistoryEntity;
  readonly entityId: string;
  readonly slaId: string | null;
  readonly label: string;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly reference: string | null;
  readonly comments: string;
}

// ── 7.4 Dashboard ────────────────────────────────────────────────────────────
export interface SlaDashboardFilters {
  readonly customers: readonly string[];
  readonly slas: readonly string[];
  readonly services: readonly string[];
  readonly sites: readonly string[];
  readonly priorities: readonly string[];
  readonly statuses: readonly string[];
  readonly types: readonly string[];
  readonly regions: readonly string[];
  readonly teams: readonly string[];
  readonly technicians: readonly string[];
  readonly contracts: readonly string[];
  readonly amcs: readonly string[];
  readonly assets: readonly string[];
  readonly period: { readonly from: string; readonly to: string };
}

export interface SlaDashboard {
  readonly kpis: {
    readonly total: number;
    readonly draft: number;
    readonly pendingApproval: number;
    readonly active: number;
    readonly expiring: number;
    readonly expired: number;
    readonly suspended: number;
    readonly activeClocks: number;
    readonly requestsUnderSla: number;
    readonly workOrdersUnderSla: number;
    readonly dueSoon: number;
    readonly breaches: number;
    readonly responseBreaches: number;
    readonly resolutionBreaches: number;
    readonly openEscalations: number;
    readonly compliance: number | null;
    readonly firstResponseCompliance: number | null;
    readonly resolutionCompliance: number | null;
    readonly avgResponseMinutes: number | null;
    readonly avgResolutionMinutes: number | null;
  };
  readonly breachesToday: number;
  readonly breachesWeek: number;
  readonly breachesMonth: number;
  readonly dueSoon: readonly SlaClockListItem[];
  readonly activeClocks: readonly SlaClockListItem[];
  readonly critical: readonly SlaClockListItem[];
  readonly escalations: readonly EscalationEventListItem[];
  readonly customersWithBreaches: readonly PerformanceRow[];
  readonly servicesWithBreaches: readonly PerformanceRow[];
  readonly trend: readonly TrendPoint[];
  readonly byCustomer: readonly PerformanceRow[];
  readonly byService: readonly PerformanceRow[];
  readonly byPriority: readonly PerformanceRow[];
  readonly byTeam: readonly PerformanceRow[];
}
