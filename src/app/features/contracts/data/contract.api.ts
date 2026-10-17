import type { Observable } from 'rxjs';
import type { Contract, ContractFilter, ContractListItem, ContractUpsert } from '../models/contract.model';
import type { ContractDashboard, ContractDashboardFilters } from '../models/dashboard.model';
import type { ContractReferenceData } from '../models/shared.model';
import type {
  Amendment,
  AmendmentInput,
  AmendmentListItem,
  ApprovalListItem,
  ClauseInput,
  ClauseListItem,
  CommentVisibility,
  ContractAlert,
  ContractClause,
  ContractDocument,
  ContractHistoryEvent,
  ContractRequest,
  ContractTemplate,
  ContractVersion,
  DocumentType,
  HistoryFilter,
  NegotiationEntry,
  Obligation,
  ObligationInput,
  ObligationListItem,
  Renewal,
  RenewalCandidate,
  RenewalInput,
  RenewalListItem,
  RequestInput,
  RequestListItem,
  ReviewListItem,
  ReviewStatus,
  ReviewType,
  SignatureListItem,
  TemplateInput,
  TemplateListItem,
  Termination,
  TerminationInput,
  TerminationListItem,
} from '../models/workflow.model';

/*
 * Data-access contracts for Contract Lifecycle Management. `provideContractData()` binds the
 * in-memory mock adapters; HTTP adapters can replace them without component changes.
 */

export interface FileInput {
  readonly name: string;
  readonly size: number;
  readonly mime: string;
}

export interface SignatoryInput {
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly party: 'Company' | 'Customer' | 'Counterparty';
}

export abstract class ContractApi {
  abstract list(filter?: ContractFilter): Observable<ContractListItem[]>;
  abstract get(id: string): Observable<ContractListItem>;
  abstract create(input: ContractUpsert, changeSummary?: string): Observable<Contract>;
  abstract update(id: string, input: ContractUpsert, changeSummary: string): Observable<Contract>;
  abstract duplicate(id: string): Observable<Contract>;
  abstract remove(id: string): Observable<void>;
  abstract nextNumber(): Observable<string>;
  abstract isNumberAvailable(number: string, excludeId?: string): Observable<boolean>;
  abstract submitForReview(id: string, reviewerIds?: Partial<Record<ReviewType, string>>): Observable<void>;
  abstract startNegotiation(id: string, comment: string): Observable<void>;
  abstract submitForApproval(id: string): Observable<void>;
  abstract activate(id: string): Observable<void>;
  abstract suspend(id: string, reason: string): Observable<void>;
  abstract reactivate(id: string): Observable<void>;
  abstract archive(id: string): Observable<void>;
  abstract cancel(id: string, reason: string): Observable<void>;
  abstract versions(id: string): Observable<ContractVersion[]>;
  abstract documents(id?: string): Observable<ContractDocument[]>;
  abstract uploadDocument(contractId: string, type: DocumentType, file: FileInput, replacesId?: string | null): Observable<ContractDocument>;
  abstract dashboard(filters: ContractDashboardFilters): Observable<ContractDashboard>;
  abstract alerts(contractId?: string): Observable<ContractAlert[]>;
}

export abstract class ContractRequestApi {
  abstract list(): Observable<RequestListItem[]>;
  abstract create(input: RequestInput, submit: boolean): Observable<ContractRequest>;
  abstract update(id: string, input: RequestInput): Observable<ContractRequest>;
  abstract submit(id: string): Observable<void>;
  abstract startReview(id: string): Observable<void>;
  abstract decide(id: string, approve: boolean, comment: string): Observable<void>;
  abstract cancel(id: string, comment: string): Observable<void>;
  /** Approved request → new draft contract (SRS 5.6 workflow). */
  abstract convert(id: string): Observable<Contract>;
}

export abstract class TemplateApi {
  abstract templates(): Observable<TemplateListItem[]>;
  abstract createTemplate(input: TemplateInput): Observable<ContractTemplate>;
  abstract updateTemplate(id: string, input: TemplateInput): Observable<ContractTemplate>;
  abstract duplicateTemplate(id: string): Observable<ContractTemplate>;
  abstract versionTemplate(id: string): Observable<ContractTemplate>;
  abstract setTemplateStatus(id: string, active: boolean): Observable<void>;
  abstract clauses(): Observable<ClauseListItem[]>;
  abstract createClause(input: ClauseInput): Observable<ContractClause>;
  abstract updateClause(id: string, input: ClauseInput): Observable<ContractClause>;
  abstract versionClause(id: string, text: string): Observable<ContractClause>;
  abstract setClauseFlags(id: string, changes: { mandatory?: boolean; active?: boolean }): Observable<void>;
}

export abstract class ReviewApi {
  abstract list(contractId?: string): Observable<ReviewListItem[]>;
  abstract add(contractId: string, type: ReviewType, reviewerId: string, dueDate: string): Observable<void>;
  abstract setStatus(id: string, status: ReviewStatus, comments: string): Observable<void>;
  abstract negotiation(contractId?: string): Observable<NegotiationEntry[]>;
  abstract addEntry(contractId: string, entry: { kind: NegotiationEntry['kind']; visibility: CommentVisibility; party: NegotiationEntry['party']; section: string; original: string | null; proposed: string | null; text: string }): Observable<void>;
  abstract resolveEntry(id: string): Observable<void>;
}

export abstract class ApprovalApi {
  abstract list(contractId?: string): Observable<ApprovalListItem[]>;
  abstract decide(stepId: string, decision: 'Approved' | 'Rejected' | 'Returned for Changes', comments: string): Observable<void>;
  abstract delegate(stepId: string, delegateId: string): Observable<void>;
}

export abstract class SignatureApi {
  abstract list(): Observable<SignatureListItem[]>;
  abstract get(contractId: string): Observable<SignatureListItem>;
  abstract send(contractId: string, signatories: readonly SignatoryInput[]): Observable<void>;
  /** Simulates provider callbacks: viewed / signed / declined. */
  abstract record(signatoryId: string, event: 'Viewed' | 'Signed' | 'Declined'): Observable<void>;
  abstract cancel(contractId: string): Observable<void>;
  abstract remind(contractId: string): Observable<void>;
}

export abstract class ObligationApi {
  abstract list(contractId?: string): Observable<ObligationListItem[]>;
  abstract create(input: ObligationInput): Observable<Obligation>;
  abstract update(id: string, input: ObligationInput): Observable<Obligation>;
  abstract start(id: string): Observable<void>;
  abstract complete(id: string, evidence: readonly FileInput[], notes: string): Observable<void>;
  abstract waive(id: string, reason: string): Observable<void>;
  abstract escalate(id: string): Observable<void>;
}

export abstract class AmendmentApi {
  abstract list(contractId?: string): Observable<AmendmentListItem[]>;
  abstract create(input: AmendmentInput): Observable<Amendment>;
  /** Moves an amendment to the next workflow stage (review → negotiation → approval). */
  abstract advance(id: string): Observable<void>;
  abstract execute(id: string): Observable<void>;
  abstract cancel(id: string, reason: string): Observable<void>;
}

export abstract class RenewalApi {
  abstract list(contractId?: string): Observable<RenewalListItem[]>;
  abstract candidates(): Observable<RenewalCandidate[]>;
  abstract create(input: RenewalInput): Observable<Renewal>;
  abstract advance(id: string): Observable<void>;
  /** Completes an approved renewal — new contract period (or extension of the same contract). */
  abstract complete(id: string): Observable<Contract>;
  abstract cancel(id: string, reason: string): Observable<void>;
}

export abstract class TerminationApi {
  abstract list(contractId?: string): Observable<TerminationListItem[]>;
  abstract create(input: TerminationInput): Observable<Termination>;
  abstract advance(id: string): Observable<void>;
  abstract reject(id: string, reason: string): Observable<void>;
}

export abstract class ContractHistoryApi {
  abstract list(filter?: HistoryFilter): Observable<ContractHistoryEvent[]>;
}

export abstract class ContractReferenceApi {
  abstract get(): Observable<ContractReferenceData>;
}
