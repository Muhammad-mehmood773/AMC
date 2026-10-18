import type { Observable } from 'rxjs';
import type {
  EscalationEventListItem,
  EscalationRuleInput,
  EscalationRuleListItem,
  Holiday,
  HolidayInput,
  PauseReason,
  PerformanceDimension,
  PerformanceRow,
  SlaBreachListItem,
  SlaCalendar,
  SlaCalendarInput,
  SlaClockListItem,
  SlaCoverageInput,
  SlaCoverageListItem,
  SlaDashboard,
  SlaDashboardFilters,
  SlaHistoryEntity,
  SlaHistoryEvent,
  SlaMappingInput,
  SlaMappingListItem,
  SlaPerformance,
  SlaRenewalInput,
  SlaRenewalReview,
  SlaRequest,
  SlaSelection,
  SlaTargetInput,
  SlaTargetListItem,
  TrendPoint,
} from '../models/operations.model';
import type { SlaReferenceData } from '../models/reference.model';
import type { Sla, SlaDocument, SlaListItem, SlaUpsert, SlaVersion } from '../models/sla.model';

/* Data-access contracts for SLA Management, bound by `provideSlaData()`. */

export abstract class SlaApi {
  abstract list(): Observable<SlaListItem[]>;
  abstract get(id: string): Observable<SlaListItem>;
  abstract create(input: SlaUpsert): Observable<Sla>;
  abstract update(id: string, input: SlaUpsert, summary: string): Observable<Sla>;
  abstract nextNumber(): Observable<string>;
  abstract duplicate(id: string): Observable<Sla>;
  abstract submitForApproval(id: string): Observable<void>;
  abstract decide(id: string, approve: boolean, comment: string): Observable<void>;
  abstract activate(id: string): Observable<Sla>;
  abstract suspend(id: string, reason: string): Observable<void>;
  abstract reactivate(id: string): Observable<void>;
  abstract expire(id: string): Observable<void>;
  abstract renewalReview(id: string): Observable<SlaRenewalReview>;
  abstract renew(id: string, input: SlaRenewalInput): Observable<Sla>;
  abstract uploadDocument(id: string, type: SlaDocument['type'], file: { name: string; size: number }): Observable<void>;
  abstract versions(id: string): Observable<SlaVersion[]>;
  abstract dashboard(filters: SlaDashboardFilters): Observable<SlaDashboard>;
}

export abstract class SlaTargetApi {
  abstract list(slaId?: string): Observable<SlaTargetListItem[]>;
  abstract create(input: SlaTargetInput): Observable<void>;
  abstract update(id: string, input: SlaTargetInput): Observable<void>;
}

export abstract class SlaCoverageApi {
  abstract list(slaId?: string): Observable<SlaCoverageListItem[]>;
  abstract create(input: SlaCoverageInput): Observable<void>;
  abstract update(id: string, input: SlaCoverageInput): Observable<void>;
}

export abstract class SlaCalendarApi {
  abstract list(): Observable<SlaCalendar[]>;
  abstract create(input: SlaCalendarInput): Observable<void>;
  abstract update(id: string, input: SlaCalendarInput): Observable<void>;
  abstract holidays(): Observable<Holiday[]>;
  abstract createHoliday(input: HolidayInput): Observable<void>;
  abstract updateHoliday(id: string, input: HolidayInput): Observable<void>;
}

export abstract class EscalationApi {
  abstract rules(slaId?: string): Observable<EscalationRuleListItem[]>;
  abstract createRule(input: EscalationRuleInput): Observable<void>;
  abstract updateRule(id: string, input: EscalationRuleInput): Observable<void>;
  abstract events(slaId?: string): Observable<EscalationEventListItem[]>;
  abstract setEventStatus(id: string, status: 'Acknowledged' | 'Closed'): Observable<void>;
}

export abstract class SlaMappingApi {
  abstract list(slaId?: string): Observable<SlaMappingListItem[]>;
  abstract create(input: SlaMappingInput): Observable<void>;
  abstract update(id: string, input: SlaMappingInput): Observable<void>;
  /** SRS 7.12 / 7.21 — applicability validation and most-specific SLA selection. */
  abstract resolve(request: SlaRequest): Observable<SlaSelection>;
}

export interface StartClockInput {
  readonly request: SlaRequest;
  readonly transactionType: 'Service Request' | 'Work Order';
  readonly subject: string;
}

export abstract class SlaClockApi {
  abstract list(filter?: { slaId?: string; open?: boolean }): Observable<SlaClockListItem[]>;
  /** Runs validation + selection and starts response / resolution clocks for a new transaction. */
  abstract start(input: StartClockInput): Observable<SlaClockListItem[]>;
  abstract pause(id: string, reason: PauseReason, notes: string): Observable<void>;
  abstract resume(id: string, reason: string): Observable<void>;
  abstract stop(id: string): Observable<void>;
  abstract escalate(id: string): Observable<void>;
  abstract reassign(id: string, team: string, technician: string | null): Observable<void>;
  abstract addNote(id: string, text: string): Observable<void>;
}

export interface BreachPatch {
  readonly reason?: string | null;
  readonly owner?: string | null;
  readonly rootCause?: string;
  readonly correctiveAction?: string;
}

export abstract class SlaBreachApi {
  abstract list(slaId?: string): Observable<SlaBreachListItem[]>;
  abstract update(id: string, patch: BreachPatch): Observable<void>;
  abstract acknowledge(id: string): Observable<void>;
  abstract requestWaiver(id: string, reason: string): Observable<void>;
  abstract approveWaiver(id: string, approve: boolean): Observable<void>;
  abstract close(id: string): Observable<void>;
}

export abstract class SlaPerformanceApi {
  abstract summary(slaId?: string): Observable<SlaPerformance>;
  abstract breakdown(dimension: PerformanceDimension, period: { from: string; to: string }, slaId?: string): Observable<PerformanceRow[]>;
  abstract trend(granularity: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly', slaId?: string): Observable<TrendPoint[]>;
}

export abstract class SlaHistoryApi {
  abstract list(filter?: { slaId?: string; entity?: SlaHistoryEntity }): Observable<SlaHistoryEvent[]>;
}

export abstract class SlaReferenceApi {
  abstract get(): Observable<SlaReferenceData>;
  abstract calendars(): Observable<SlaCalendar[]>;
  abstract slaOptions(): Observable<{ id: string; number: string; name: string; status: string }[]>;
}
