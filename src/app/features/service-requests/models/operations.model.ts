import type { Coverage, Priority, RequestListItem, RequestType } from './request.model';

/** SRS 9.8 / 9.11 / 9.12 — automatic suggestions shown on create and classification. */
export interface Suggestion {
  readonly type: RequestType | null;
  readonly serviceCategory: string | null;
  readonly subcategory: string | null;
  readonly problemCategory: string | null;
  readonly requiredSkill: string | null;
  readonly team: string | null;
  readonly technician: string | null;
  readonly serviceId: string | null;
  readonly priority: Priority;
  readonly priorityScore: number;
  readonly priorityFactors: readonly string[];
  readonly coverage: Coverage;
  readonly slaId: string | null;
  readonly slaNumber: string | null;
  readonly slaName: string | null;
  readonly responseMinutes: number | null;
  readonly resolutionMinutes: number | null;
  readonly rule: string | null;
}

export interface DuplicateMatch {
  readonly id: string;
  readonly number: string;
  readonly subject: string;
  readonly status: string;
  readonly createdAt: string;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface ValidationGroup {
  readonly group: 'Customer' | 'Service' | 'Asset' | 'Coverage' | 'SLA' | 'Assignment' | 'Closure';
  readonly checks: readonly { readonly check: string; readonly result: 'pass' | 'fail' | 'warn' | 'na'; readonly detail: string }[];
}

export interface IdentificationResult {
  readonly customers: readonly { id: string; name: string; code: string; status: string; matchedOn: string }[];
  readonly sites: readonly { id: string; name: string; customerId: string; city: string; matchedOn: string }[];
  readonly assets: readonly { id: string; name: string; siteId: string; customerId: string; serialNumber: string; status: string; warranty: string; matchedOn: string }[];
  readonly openRequests: readonly RequestListItem[];
}

export interface RoutingRule {
  readonly category: string;
  readonly team: string;
  readonly skill: string;
  readonly method: string;
}

export interface ClassificationRule {
  readonly id: string;
  readonly keywords: readonly string[];
  readonly type: RequestType;
  readonly category: string;
  readonly subcategory: string;
  readonly problemCategory: string;
  readonly urgency: string;
  readonly skill: string;
}

export const SR_HISTORY_ACTIONS = [
  'Request Created', 'Request Updated', 'Classification Changed', 'Priority Changed', 'SLA Applied', 'Coverage Validated', 'Assignment Created', 'Assignment Changed', 'Schedule Created', 'Schedule Changed', 'Status Changed',
  'Request Escalated', 'Request Put On Hold', 'Request Resumed', 'Work Order Created', 'Work Order Updated', 'Resolution Added', 'Request Resolved', 'Customer Confirmation', 'Request Closed', 'Request Reopened', 'Request Cancelled',
  'Request Rejected', 'Attachment Added', 'Communication Added', 'Duplicate Linked', 'Request Merged', 'Chargeable Approval', 'Automation',
] as const;
export type SrHistoryAction = (typeof SR_HISTORY_ACTIONS)[number];

export interface SrHistoryEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly user: string;
  readonly action: SrHistoryAction;
  readonly requestId: string;
  readonly requestNumber: string;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly reason: string;
  /** Manual, automation rule or originating process (SRS 9.26 / 9.31). */
  readonly source: string;
  readonly relatedRecord: string | null;
}

export interface SrDashboardFilters {
  readonly companies: readonly string[];
  readonly branches: readonly string[];
  readonly customers: readonly string[];
  readonly sites: readonly string[];
  readonly assets: readonly string[];
  readonly categories: readonly string[];
  readonly types: readonly string[];
  readonly priorities: readonly string[];
  readonly slas: readonly string[];
  readonly agreements: readonly string[];
  readonly teams: readonly string[];
  readonly technicians: readonly string[];
  readonly statuses: readonly string[];
  readonly period: { readonly from: string; readonly to: string };
}

export interface CountRow {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

export interface SrDashboard {
  readonly kpis: {
    readonly total: number;
    readonly new: number;
    readonly unassigned: number;
    readonly assigned: number;
    readonly inProgress: number;
    readonly scheduled: number;
    readonly pendingCustomer: number;
    readonly pendingParts: number;
    readonly pendingApproval: number;
    readonly escalated: number;
    readonly atRisk: number;
    readonly breached: number;
    readonly resolved: number;
    readonly closed: number;
    readonly reopened: number;
    readonly avgResponseMinutes: number | null;
    readonly avgResolutionMinutes: number | null;
    readonly firstTimeResolution: number | null;
  };
  readonly byPriority: readonly CountRow[];
  readonly byCustomer: readonly CountRow[];
  readonly bySite: readonly CountRow[];
  readonly byAsset: readonly CountRow[];
  readonly byTechnician: readonly CountRow[];
  readonly byType: readonly CountRow[];
  readonly byAgreement: readonly CountRow[];
  readonly byChannel: readonly CountRow[];
  readonly trend: readonly CountRow[];
  readonly atRiskList: readonly RequestListItem[];
  readonly unassignedList: readonly RequestListItem[];
}

export interface SrPerformance {
  readonly volume: number;
  readonly newRequests: number;
  readonly open: number;
  readonly avgAgeHours: number | null;
  readonly avgResponseMinutes: number | null;
  readonly avgResolutionMinutes: number | null;
  readonly responseCompliance: number | null;
  readonly resolutionCompliance: number | null;
  readonly breachRate: number | null;
  readonly firstTimeResolution: number | null;
  readonly reopenRate: number | null;
  readonly cancellationRate: number | null;
  readonly escalationRate: number | null;
  readonly avgPendingHours: number | null;
  readonly avgAssignmentMinutes: number | null;
  readonly scheduleDelayDays: number | null;
  readonly confirmationRate: number | null;
  readonly byCustomer: readonly CountRow[];
  readonly byAsset: readonly CountRow[];
  readonly byCategory: readonly CountRow[];
  readonly byTechnician: readonly CountRow[];
  readonly byAgreement: readonly CountRow[];
  readonly byRootCause: readonly CountRow[];
}
