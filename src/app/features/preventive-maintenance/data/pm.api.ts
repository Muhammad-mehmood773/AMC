import type { Observable } from 'rxjs';
import type {
  AssetPerformanceRow,
  CalendarConflict,
  ChecklistInput,
  ChecklistListItem,
  Completion,
  MaintenanceTaskInput,
  MeterRuleInput,
  MeterRuleListItem,
  OccurrenceListItem,
  PlanReview,
  PlanReviewInput,
  PmDashboard,
  PmDashboardFilters,
  PmHistoryEntity,
  PmHistoryEvent,
  PmPerformance,
  PmValidation,
  PmWorkOrderListItem,
  StockPart,
  TaskListItem,
} from '../models/operations.model';
import type { MaintenancePlan, PlanDocument, PlanListItem, PlanUpsert, PlanVersion } from '../models/plan.model';
import type { PmReferenceData } from '../models/reference.model';

/* Data-access contracts for Preventive Maintenance, bound by `providePmData()`. */

export interface PreviewDate {
  readonly ruleDate: string;
  readonly scheduledDate: string;
  readonly adjusted: boolean;
}

export abstract class PlanApi {
  abstract list(): Observable<PlanListItem[]>;
  abstract get(id: string): Observable<PlanListItem>;
  abstract create(input: PlanUpsert): Observable<MaintenancePlan>;
  abstract update(id: string, input: PlanUpsert, summary: string): Observable<MaintenancePlan>;
  abstract nextNumber(): Observable<string>;
  abstract duplicate(id: string): Observable<MaintenancePlan>;
  abstract submitForApproval(id: string): Observable<void>;
  abstract approve(id: string, approve: boolean, comment: string): Observable<void>;
  abstract activate(id: string): Observable<MaintenancePlan>;
  abstract suspend(id: string, reason: string): Observable<void>;
  abstract resume(id: string): Observable<void>;
  /** Schedule preview for a plan definition without saving (SRS 8.9). */
  abstract preview(input: PlanUpsert, months: number): Observable<PreviewDate[]>;
  abstract review(id: string): Observable<PlanReview>;
  abstract applyReview(id: string, input: PlanReviewInput): Observable<void>;
  abstract versions(id: string): Observable<PlanVersion[]>;
  abstract uploadDocument(id: string, type: PlanDocument['type'], file: { name: string; size: number }): Observable<void>;
  abstract dashboard(filters: PmDashboardFilters): Observable<PmDashboard>;
}

export interface ScheduleInput {
  readonly team: string;
  readonly technician: string | null;
}

export interface RescheduleInput {
  readonly toDate: string;
  readonly toWindow: string;
  readonly reason: string;
  readonly requestedBy: string;
  readonly customerApproval: boolean;
  readonly notes: string;
}

export interface CorrectiveInput {
  readonly defect: string;
  readonly severity: string;
  readonly priority: string;
  readonly recommendedAction: string;
  readonly partNumber: string | null;
  readonly skill: string;
  readonly estimatedCost: number;
  readonly targetDate: string;
}

export abstract class ScheduleApi {
  abstract list(planId?: string): Observable<OccurrenceListItem[]>;
  /** Automatic schedule generation for the configured horizon (no duplicates). */
  abstract generate(planId: string): Observable<number>;
  abstract validate(occurrenceId: string): Observable<PmValidation>;
  abstract assign(id: string, input: ScheduleInput): Observable<void>;
  abstract bulkAssign(ids: readonly string[], input: ScheduleInput): Observable<number>;
  abstract respond(id: string, response: 'Accepted' | 'Rejected' | 'Confirmed'): Observable<void>;
  abstract reschedule(id: string, input: RescheduleInput): Observable<void>;
  abstract bulkReschedule(ids: readonly string[], days: number, reason: string): Observable<number>;
  abstract setOverdueReason(id: string, reason: string): Observable<void>;
  abstract start(id: string): Observable<void>;
  abstract complete(id: string, completion: Omit<Completion, 'reportNumber'>): Observable<void>;
  abstract cancel(id: string, reason: string): Observable<void>;
  abstract miss(id: string, reason: string): Observable<void>;
  abstract corrective(id: string, input: CorrectiveInput): Observable<string>;
  abstract conflicts(from: string, to: string): Observable<CalendarConflict[]>;
}

export abstract class PmWorkOrderApi {
  abstract list(planId?: string): Observable<PmWorkOrderListItem[]>;
  /** Runs the work-order automation rules now (normally continuous). */
  abstract runAutomation(): Observable<number>;
  abstract generate(occurrenceId: string): Observable<string>;
  abstract dispatch(id: string): Observable<void>;
  abstract suggest(occurrenceId: string): Observable<{ technician: string; team: string; score: number; reasons: string[] }[]>;
}

export abstract class ChecklistApi {
  abstract list(): Observable<ChecklistListItem[]>;
  abstract create(input: ChecklistInput): Observable<void>;
  abstract update(id: string, input: ChecklistInput): Observable<void>;
}

export abstract class TaskApi {
  abstract list(): Observable<TaskListItem[]>;
  abstract create(input: MaintenanceTaskInput): Observable<void>;
  abstract update(id: string, input: MaintenanceTaskInput): Observable<void>;
}

export abstract class MeterApi {
  abstract list(planId?: string): Observable<MeterRuleListItem[]>;
  abstract create(input: MeterRuleInput): Observable<void>;
  /** Records a meter / condition reading; returns the triggered occurrence number, if any. */
  abstract record(id: string, value: number): Observable<string | null>;
}

export abstract class PmPerformanceApi {
  abstract summary(planId?: string): Observable<PmPerformance>;
  abstract assets(): Observable<AssetPerformanceRow[]>;
}

export abstract class PmHistoryApi {
  abstract list(filter?: { planId?: string; entity?: PmHistoryEntity }): Observable<PmHistoryEvent[]>;
}

export abstract class PmReferenceApi {
  abstract get(): Observable<PmReferenceData>;
  abstract parts(): Observable<StockPart[]>;
  abstract planOptions(): Observable<{ id: string; number: string; name: string; status: string }[]>;
  abstract checklists(): Observable<{ id: string; name: string; items: number }[]>;
  abstract tasks(): Observable<{ id: string; name: string; sequence: number }[]>;
}
