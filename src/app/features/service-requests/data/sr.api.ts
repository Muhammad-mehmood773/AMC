import type { Observable } from 'rxjs';
import type { ClassificationRule, DuplicateMatch, IdentificationResult, RoutingRule, SrDashboard, SrDashboardFilters, SrHistoryEvent, SrPerformance, Suggestion, ValidationGroup } from '../models/operations.model';
import type { SrReferenceData } from '../models/reference.model';
import type { Activity, Classification, HoldReason, PartUsage, Priority, RequestDraft, RequestListItem, RequestType, Resolution, Schedule, ServiceRequest } from '../models/request.model';

/* Data-access contracts for Service Request Management, bound by `provideSrData()`. */

export interface AssignInput {
  readonly team: string;
  readonly technician: string | null;
  readonly dispatcher: string | null;
  readonly method: string;
  readonly reason: string;
}

export interface ClassifyInput {
  readonly type: RequestType;
  readonly serviceCategory: string;
  readonly subcategory: string;
  readonly classification: Classification;
}

export interface HoldInput {
  readonly reason: HoldReason;
  readonly expectedResume: string | null;
  readonly notes: string;
  readonly responsible: string;
}

export type ResolutionInput = Pick<Resolution, 'code' | 'category' | 'description' | 'rootCause' | 'correctiveAction' | 'recommendation' | 'findings' | 'labourMinutes'>;

export abstract class RequestApi {
  abstract list(): Observable<RequestListItem[]>;
  abstract get(id: string): Observable<RequestListItem>;
  abstract nextNumber(): Observable<string>;
  /** Classification, priority, coverage, SLA and routing suggestions for a draft (SRS 9.8–9.12). */
  abstract suggest(draft: RequestDraft): Observable<Suggestion>;
  abstract duplicates(draft: Pick<RequestDraft, 'customer' | 'location' | 'assetId' | 'serviceCategory' | 'subject' | 'description'>, excludeId?: string): Observable<DuplicateMatch[]>;
  abstract create(draft: RequestDraft, duplicateAction: 'none' | 'continue' | 'link', linkTo: string | null): Observable<ServiceRequest>;
  abstract update(id: string, draft: RequestDraft, reason: string): Observable<void>;
  abstract classify(id: string, input: ClassifyInput): Observable<void>;
  abstract validateCoverage(id: string): Observable<void>;
  abstract decideChargeable(id: string, approve: boolean, comment: string): Observable<void>;
  abstract setPriority(id: string, priority: Priority, reason: string): Observable<void>;
  abstract applySla(id: string): Observable<void>;
  abstract assign(id: string, input: AssignInput): Observable<void>;
  abstract autoAssign(id: string): Observable<void>;
  abstract schedule(id: string, input: Schedule, reason: string): Observable<void>;
  abstract start(id: string): Observable<void>;
  abstract escalate(id: string, level: number, reason: string, action: string): Observable<void>;
  abstract hold(id: string, input: HoldInput): Observable<void>;
  abstract resume(id: string, comment: string): Observable<void>;
  abstract createWorkOrder(id: string): Observable<string>;
  abstract completeWorkOrder(id: string, workOrderId: string, input: { labourMinutes: number; parts: readonly PartUsage[]; checklistCompleted: boolean }): Observable<void>;
  abstract resolve(id: string, input: ResolutionInput): Observable<void>;
  abstract confirm(id: string, accepted: boolean, by: string, comment: string): Observable<void>;
  abstract close(id: string, notes: string): Observable<void>;
  abstract reopen(id: string, reason: string, comment: string): Observable<void>;
  abstract cancel(id: string, reason: string, comment: string): Observable<void>;
  abstract reject(id: string, reason: string): Observable<void>;
  abstract linkDuplicate(id: string, otherId: string, merge: boolean): Observable<void>;
  abstract addActivity(id: string, input: Omit<Activity, 'id' | 'at' | 'user'>): Observable<void>;
  abstract addAttachment(id: string, file: { name: string; size: number; kind: 'Image' | 'Video' | 'Document' | 'Evidence'; visibility: 'Customer Visible' | 'Internal Only' }): Observable<void>;
  abstract validation(id: string): Observable<ValidationGroup[]>;
  abstract identify(query: string): Observable<IdentificationResult>;
  abstract runAutomation(): Observable<number>;
  abstract dashboard(filters: SrDashboardFilters): Observable<SrDashboard>;
  abstract performance(): Observable<SrPerformance>;
  abstract rules(): Observable<{ classification: ClassificationRule[]; routing: RoutingRule[] }>;
}

export abstract class SrHistoryApi {
  abstract list(requestId?: string): Observable<SrHistoryEvent[]>;
}

export abstract class SrReferenceApi {
  abstract get(): Observable<SrReferenceData>;
}
