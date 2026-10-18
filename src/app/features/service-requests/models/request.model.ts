/** SRS 9.2 — service-demand categories. */
export const REQUEST_TYPES = [
  'Incident / Breakdown', 'Service Request', 'Maintenance Request', 'Repair Request', 'Inspection Request', 'Installation / Commissioning', 'Warranty Request', 'Contract / AMC Request', 'PM Generated Request', 'Internal Service Request', 'Follow-up Request',
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_SOURCES = ['Phone', 'Email', 'Customer Portal', 'Mobile App', 'WhatsApp', 'Walk-in', 'Technician', 'PM Plan', 'Internal'] as const;
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const URGENCY = ['High', 'Medium', 'Low'] as const;
export const BUSINESS_IMPACT = ['High', 'Medium', 'Low'] as const;

/** SRS 9.17 lifecycle. Escalation is tracked as a level on the request and surfaced as a status flag. */
export const REQUEST_STATUSES = ['New', 'Under Validation', 'Validated', 'Assigned', 'Scheduled', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Cancelled', 'Rejected', 'Reopened'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const OPEN_STATUSES: readonly RequestStatus[] = ['New', 'Under Validation', 'Validated', 'Assigned', 'Scheduled', 'In Progress', 'Pending', 'Reopened'];
export const ACTIVE_WORK_STATUSES: readonly RequestStatus[] = ['Validated', 'Assigned', 'Scheduled', 'In Progress', 'Reopened'];

/** SRS 9.10 */
export const COVERAGE_RESULTS = ['Covered', 'Partially Covered', 'Not Covered', 'Expired Coverage', 'Coverage Pending Validation'] as const;
export type CoverageResult = (typeof COVERAGE_RESULTS)[number];

export const HOLD_REASONS = ['Waiting for Customer', 'Waiting for Parts', 'Waiting for Approval', 'Waiting for Site Access', 'Waiting for Vendor', 'Waiting for Technician', 'Waiting for Information', 'Other'] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];
export const REOPEN_REASONS = ['Issue Not Resolved', 'Issue Recurred', 'Incorrect Resolution', 'Customer Rejection', 'Additional Service Required'] as const;
export const CANCEL_REASONS = ['Raised in Error', 'Duplicate Request', 'Customer Withdrew Request', 'Merged into Another Request', 'Service Not Supported', 'Other'] as const;
export const ASSIGNMENT_METHODS = ['Manual Assignment', 'Team-Based Assignment', 'Skill-Based Assignment', 'Location-Based Assignment', 'Asset-Based Assignment', 'Category-Based Assignment', 'Workload-Based Assignment', 'Automatic Assignment'] as const;
export const APPOINTMENT_TYPES = ['On-Site Visit', 'Remote Support', 'Inspection Visit', 'Emergency Call-Out', 'Follow-up Visit'] as const;
export const ESCALATION_LEVELS = ['Level 1 — Team Lead', 'Level 2 — Service Manager', 'Level 3 — Operations Manager', 'Level 4 — Management / Account Management'] as const;
export const ESCALATION_TRIGGERS = ['SLA approaching breach', 'SLA breach', 'Critical priority', 'No assignment', 'No response', 'No progress', 'Customer escalation', 'Repeated reopening', 'Excessive pending duration'] as const;
export const ESCALATION_ACTIONS = ['Notification', 'Reassignment', 'Priority review', 'Management alert', 'Customer communication', 'SLA review'] as const;
export const RESOLUTION_CODES = ['Repaired', 'Part Replaced', 'Adjusted / Calibrated', 'Cleaned / Serviced', 'Configuration Changed', 'Advice Given', 'No Fault Found', 'Replaced Unit', 'Referred to Vendor'] as const;
export const RESOLUTION_CATEGORIES = ['Fixed', 'Workaround', 'No Fault Found', 'Customer Education', 'Replaced', 'Not Resolved — Referred'] as const;
export const ACTIVITY_TYPES = ['Customer Call', 'Email', 'SMS', 'Portal Message', 'Internal Note', 'Technician Note', 'Dispatcher Note', 'Customer Comment', 'System Notification'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface Classification {
  readonly problemCategory: string;
  readonly problemCode: string;
  readonly serviceCode: string;
  readonly failureType: string;
  readonly symptom: string;
  readonly cause: string;
  readonly requestedServiceId: string | null;
  readonly urgency: string;
  readonly businessImpact: string;
  readonly affectedUsers: number;
  readonly requiredSkill: string;
  /** Rule that produced the automatic suggestion (SRS 9.31 traceability). */
  readonly suggestedBy: string | null;
}

export interface CoverageStep {
  readonly step: string;
  readonly result: 'pass' | 'fail' | 'warn' | 'na';
  readonly detail: string;
}

export interface Coverage {
  readonly result: CoverageResult;
  readonly contractId: string | null;
  readonly amcId: string | null;
  readonly warranty: { readonly status: string; readonly endDate: string | null; readonly provider: string } | null;
  readonly entitlement: string;
  readonly coveredService: string;
  readonly chargeable: boolean;
  /** SRS 9.16 — customer sign-off required before closure (critical/high priority or covered work). */
  readonly requiresCustomerConfirmation: boolean;
  /** Customer approval / quote for non-covered work (SRS 9.28). */
  readonly approval: 'Not Required' | 'Pending' | 'Approved' | 'Rejected';
  readonly steps: readonly CoverageStep[];
  readonly validatedAt: string | null;
}

export interface SlaSnapshot {
  readonly slaId: string | null;
  readonly slaNumber: string | null;
  readonly slaName: string | null;
  readonly applicability: string;
  readonly calendarId: string | null;
  readonly responseMinutes: number | null;
  readonly resolutionMinutes: number | null;
  readonly respondedAt: string | null;
  readonly resolvedAt: string | null;
}

export interface Assignment {
  readonly team: string | null;
  readonly technician: string | null;
  readonly dispatcher: string | null;
  readonly method: string;
  readonly skill: string;
  readonly region: string;
  readonly assignedAt: string | null;
  readonly reason: string;
}

export interface Schedule {
  readonly scheduledDate: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly durationMinutes: number;
  readonly appointmentType: string;
  readonly customerAvailability: string;
  readonly access: string;
}

export interface Hold {
  readonly reason: HoldReason;
  readonly startedAt: string;
  readonly expectedResume: string | null;
  readonly endedAt: string | null;
  readonly notes: string;
  readonly responsible: string;
  /** Approved SLA pause reason (SRS 9.21). */
  readonly pausesSla: boolean;
  readonly previousStatus: RequestStatus;
}

export interface Activity {
  readonly id: string;
  readonly type: ActivityType;
  readonly at: string;
  readonly user: string;
  readonly direction: 'Inbound' | 'Outbound' | 'Internal';
  readonly message: string;
  readonly attachment: string | null;
  readonly followUp: string | null;
  readonly visibility: 'Customer Visible' | 'Internal Only';
}

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly kind: 'Image' | 'Video' | 'Document' | 'Evidence';
  readonly size: number;
  readonly by: string;
  readonly at: string;
  readonly visibility: 'Customer Visible' | 'Internal Only';
}

export interface PartUsage {
  readonly partNumber: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitCost: number;
}

export interface SrWorkOrder {
  readonly id: string;
  readonly number: string;
  readonly status: 'Open' | 'Assigned' | 'In Progress' | 'Completed' | 'Cancelled';
  readonly createdAt: string;
  readonly team: string | null;
  readonly technician: string | null;
  readonly scheduledDate: string | null;
  readonly completedAt: string | null;
  readonly labourMinutes: number;
  readonly travelCost: number;
  readonly parts: readonly PartUsage[];
  readonly billable: boolean;
  readonly checklistCompleted: boolean;
}

export interface Resolution {
  readonly code: string;
  readonly category: string;
  readonly description: string;
  readonly rootCause: string;
  readonly correctiveAction: string;
  readonly recommendation: string;
  readonly findings: string;
  readonly labourMinutes: number;
  readonly completedAt: string;
  readonly resolvedBy: string;
  readonly confirmation: { readonly confirmed: boolean; readonly by: string; readonly at: string; readonly comment: string } | null;
  readonly closureNotes: string;
}

export interface EscalationEvent {
  readonly at: string;
  readonly level: number;
  readonly trigger: string;
  readonly action: string;
  readonly by: string;
  readonly reason: string;
}

export interface ServiceRequest {
  readonly id: string;
  readonly number: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly company: string;
  readonly branch: string;
  readonly type: RequestType;
  readonly serviceCategory: string;
  readonly subcategory: string;
  readonly subject: string;
  readonly description: string;
  readonly source: string;
  readonly requestedDate: string | null;
  readonly requestedTime: string;
  readonly priority: Priority;
  readonly priorityReason: string;
  readonly customerReference: string;
  readonly customer: { readonly customerId: string; readonly contactId: string | null; readonly contactName: string; readonly phone: string; readonly email: string };
  readonly location: { readonly siteId: string; readonly building: string; readonly area: string; readonly accessInstructions: string };
  readonly assetId: string | null;
  readonly classification: Classification;
  readonly coverage: Coverage;
  readonly sla: SlaSnapshot;
  readonly status: RequestStatus;
  readonly assignment: Assignment;
  readonly assignmentHistory: readonly (Assignment & { readonly by: string })[];
  readonly schedule: Schedule | null;
  readonly scheduleHistory: readonly (Schedule & { readonly at: string; readonly by: string; readonly reason: string })[];
  readonly holds: readonly Hold[];
  readonly escalation: { readonly level: number; readonly events: readonly EscalationEvent[] };
  readonly workOrders: readonly SrWorkOrder[];
  readonly activities: readonly Activity[];
  readonly attachments: readonly Attachment[];
  readonly resolution: Resolution | null;
  readonly previousResolutions: readonly Resolution[];
  readonly reopenCount: number;
  readonly linkedRequestIds: readonly string[];
  readonly duplicateOf: string | null;
  readonly origin: { readonly process: 'Manual' | 'Customer Portal' | 'PM Plan' | 'Follow-up' | 'Internal'; readonly planId: string | null; readonly planNumber: string | null; readonly occurrence: string | null; readonly parentRequestId: string | null };
  readonly cancellation: { readonly reason: string; readonly comment: string; readonly by: string; readonly at: string } | null;
  readonly notes: { readonly customer: string; readonly internal: string };
}

export interface RequestDraft {
  readonly type: RequestType;
  readonly serviceCategory: string;
  readonly subcategory: string;
  readonly subject: string;
  readonly description: string;
  readonly source: string;
  readonly requestedDate: string | null;
  readonly requestedTime: string;
  readonly priority: Priority | null;
  readonly customerReference: string;
  readonly customer: ServiceRequest['customer'];
  readonly location: ServiceRequest['location'];
  readonly assetId: string | null;
  readonly classification: Classification;
  readonly notes: ServiceRequest['notes'];
  readonly parentRequestId: string | null;
}

export type SlaState = 'On Track' | 'At Risk' | 'Breached' | 'Met' | 'Paused' | 'No SLA';

export interface ClockView {
  readonly targetMinutes: number | null;
  readonly elapsedMinutes: number;
  readonly remainingMinutes: number | null;
  readonly dueAt: string | null;
  readonly consumption: number;
  readonly state: SlaState;
}

export interface RequestListItem extends ServiceRequest {
  readonly customerName: string;
  readonly customerStatus: string;
  readonly siteName: string;
  readonly region: string;
  readonly assetName: string | null;
  readonly contractNumber: string | null;
  readonly amcNumber: string | null;
  readonly ageHours: number;
  readonly response: ClockView;
  readonly resolutionClock: ClockView;
  readonly slaState: SlaState;
  readonly dueAt: string | null;
  readonly onHold: Hold | null;
  readonly escalated: boolean;
  readonly cost: { readonly labour: number; readonly parts: number; readonly travel: number; readonly total: number };
}
