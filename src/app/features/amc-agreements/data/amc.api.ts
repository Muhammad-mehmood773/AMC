import type { Observable } from 'rxjs';
import type { Amc, AmcDocument, AmcFilter, AmcListItem, AmcPerformance, AmcUpsert } from '../models/amc.model';
import type {
  AmcDashboard,
  AmcDashboardFilters,
  AmcHistoryEntity,
  AmcHistoryEvent,
  BillingListItem,
  CoverageDecision,
  CoverageInput,
  CoverageListItem,
  CoverageRequest,
  PmEventListItem,
  RenewalInput,
  RenewalReview,
  ServicePlanInput,
  ServicePlanListItem,
  SuspensionTerminationItem,
  TerminationType,
  VisitCompletion,
  VisitInput,
  VisitListItem,
} from '../models/operations.model';
import type { AmcReferenceData } from '../models/reference.model';

/* Data-access contracts for AMC / Service Contract Management, bound by `provideAmcData()`. */

export interface ScopeChange {
  readonly addSiteIds?: readonly string[];
  readonly addAssetIds?: readonly string[];
  readonly removeAssetIds?: readonly string[];
  readonly addServiceIds?: readonly string[];
  readonly removeServiceIds?: readonly string[];
}

export interface SuspendInput {
  readonly reason: string;
  readonly requestedBy: string;
  readonly periodDays: number | null;
  readonly pauseMaintenance: boolean;
  readonly pauseBilling: boolean;
  readonly notes: string;
}

export interface TerminateInput {
  readonly type: TerminationType;
  readonly terminationDate: string;
  readonly requestedBy: string;
  readonly reason: string;
  readonly noticePeriodDays: number;
  readonly finalServiceDate: string;
  readonly settlementStatus: string;
  readonly documents: readonly string[];
  readonly notes: string;
}

export abstract class AmcApi {
  abstract list(filter?: AmcFilter): Observable<AmcListItem[]>;
  abstract get(id: string): Observable<AmcListItem>;
  abstract create(input: AmcUpsert): Observable<Amc>;
  abstract update(id: string, input: AmcUpsert, summary: string): Observable<Amc>;
  abstract nextNumber(): Observable<string>;
  abstract submitForApproval(id: string): Observable<void>;
  abstract decide(id: string, approve: boolean, comment: string): Observable<void>;
  /** Activates (auto-approving within the configured limit); future start dates become Pending Activation. */
  abstract activate(id: string): Observable<Amc>;
  abstract changeScope(id: string, change: ScopeChange): Observable<void>;
  abstract suspend(id: string, input: SuspendInput): Observable<void>;
  abstract resume(id: string): Observable<void>;
  abstract terminate(id: string, input: TerminateInput): Observable<void>;
  abstract renewalReview(id: string): Observable<RenewalReview>;
  abstract renew(id: string, input: RenewalInput): Observable<Amc>;
  abstract uploadDocument(id: string, type: AmcDocument['type'], file: { name: string; size: number }): Observable<void>;
  abstract performance(id: string): Observable<AmcPerformance>;
  abstract events(): Observable<SuspensionTerminationItem[]>;
  abstract dashboard(filters: AmcDashboardFilters): Observable<AmcDashboard>;
}

export abstract class CoverageApi {
  abstract list(amcId?: string): Observable<CoverageListItem[]>;
  abstract create(input: CoverageInput): Observable<void>;
  abstract update(id: string, input: CoverageInput): Observable<void>;
  abstract validate(request: CoverageRequest): Observable<CoverageDecision>;
}

export abstract class ServicePlanApi {
  abstract list(amcId?: string): Observable<ServicePlanListItem[]>;
  abstract create(input: ServicePlanInput): Observable<void>;
  abstract update(id: string, input: ServicePlanInput): Observable<void>;
}

export abstract class ScheduleApi {
  abstract list(amcId?: string): Observable<PmEventListItem[]>;
  /** Automatic schedule generation from the service plan (skips non-working days and holidays). */
  abstract generate(amcId: string): Observable<number>;
  abstract assign(id: string, team: string, technician: string | null): Observable<void>;
  abstract reschedule(id: string, date: string, reason: string): Observable<void>;
  abstract setStatus(id: string, status: 'In Progress' | 'Completed' | 'Cancelled' | 'Missed'): Observable<void>;
  abstract escalate(id: string): Observable<void>;
}

export abstract class VisitApi {
  abstract list(amcId?: string): Observable<VisitListItem[]>;
  /** Groups scheduled PM events into site visits for the next N days. */
  abstract generate(amcId: string, days: number): Observable<number>;
  abstract create(input: VisitInput): Observable<void>;
  abstract assign(id: string, team: string, technician: string): Observable<void>;
  abstract confirm(id: string): Observable<void>;
  abstract reschedule(id: string, date: string): Observable<void>;
  abstract start(id: string): Observable<void>;
  abstract complete(id: string, completion: VisitCompletion): Observable<void>;
  abstract cancel(id: string, reason: string): Observable<void>;
  abstract createWorkOrder(id: string): Observable<string>;
}

export abstract class BillingApi {
  abstract list(amcId?: string): Observable<BillingListItem[]>;
  abstract generate(amcId: string): Observable<number>;
  abstract advance(id: string): Observable<void>;
  abstract recordPayment(id: string, amount: number): Observable<void>;
  abstract cancel(id: string): Observable<void>;
}

export abstract class AmcHistoryApi {
  abstract list(filter?: { amcId?: string; entity?: AmcHistoryEntity }): Observable<AmcHistoryEvent[]>;
}

export abstract class AmcReferenceApi {
  abstract get(): Observable<AmcReferenceData>;
}
