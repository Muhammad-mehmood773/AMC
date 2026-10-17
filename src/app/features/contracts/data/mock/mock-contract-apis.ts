import { Injectable, inject } from '@angular/core';
import { type Observable, defer } from 'rxjs';
import { fail, pad, respond } from '../../../customers/data/mock/mock-utils';
import { type Contract, type ContractFilter, type ContractListItem, type ContractStatus, type ContractUpsert, EDITABLE_STATUSES, isCustomerContract } from '../../models/contract.model';
import type { ContractDashboard, ContractDashboardFilters, ContractRow } from '../../models/dashboard.model';
import type { ContractReferenceData } from '../../models/shared.model';
import type {
  Amendment,
  AmendmentInput,
  AmendmentListItem,
  AmendmentStatus,
  ApprovalListItem,
  ApprovalStep,
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
  RenewalStatus,
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
} from '../../models/workflow.model';
import { TERMINATION_FLOW } from '../../models/workflow.model';
import {
  AmendmentApi,
  ApprovalApi,
  ContractApi,
  ContractHistoryApi,
  ContractReferenceApi,
  ContractRequestApi,
  type FileInput,
  ObligationApi,
  RenewalApi,
  ReviewApi,
  SignatureApi,
  type SignatoryInput,
  TemplateApi,
  TerminationApi,
} from '../contract.api';
import { ALLOWED_ACTIONS, CONTRACT_RULES, FX_TO_REPORTING, REPORTING_CURRENCY } from '../contract.config';
import { MockContractStore, addDays, addMonths, nextMajor, nextMinor, today } from './mock-contract-store';

const norm = (v: string) => v.trim().toLowerCase();

function mutate<T>(work: () => T | Error): Observable<T> {
  return defer(() => {
    const result = work();
    return result instanceof Error ? fail(result.message) : respond(result, 360);
  });
}

function query<T>(work: () => T): Observable<T> {
  return defer(() => respond(work()));
}

const allowed = (action: keyof typeof ALLOWED_ACTIONS, status: ContractStatus) => ALLOWED_ACTIONS[action].includes(status);
const OPEN_REVIEW: readonly ReviewStatus[] = ['Pending', 'In Review', 'Changes Requested'];

/** Shared contract helpers used by several adapters. */
@Injectable()
export class ContractOps {
  private readonly store = inject(MockContractStore);

  nextNumber(): string {
    const max = this.store.db.contracts.reduce((m, c) => Math.max(m, c.number.startsWith('CON-') ? Number(c.number.slice(4, 9)) || 0 : 0), 0);
    return `CON-${pad(max + 1, 5)}`;
  }

  checkInput(input: ContractUpsert, excludeId?: string): Error | null {
    const { db } = this.store;
    if (!input.number.trim()) return new Error('Contract number is required.');
    if (db.contracts.some((c) => c.id !== excludeId && norm(c.number) === norm(input.number))) return new Error(`Contract number ${input.number} is already in use.`);
    if (!input.type) return new Error('Every contract must have a defined contract type.');
    if (isCustomerContract(input.type) && !input.parties.customerId) return new Error('Customer contracts must identify the customer / contracting party.');
    if (!isCustomerContract(input.type) && !input.parties.vendorPartner.trim() && !input.parties.customerId) return new Error('Vendor / partner contracts must identify the vendor or partner.');
    if (!input.parties.contractingOrganizationId) return new Error('Select the contracting organization.');
    if (input.parties.customerId && !db.reference.customers.some((c) => c.id === input.parties.customerId)) return new Error('The selected customer does not exist.');
    if (input.period.timeBound && (!input.period.startDate || !input.period.endDate)) return new Error('Start and end dates are mandatory for time-bound contracts.');
    if (input.period.endDate && input.period.startDate && input.period.endDate < input.period.startDate) return new Error('The end date must be on or after the start date.');
    if (input.scopeInfo.siteIds.some((id) => db.reference.sites.find((s) => s.id === id)?.customerId !== input.parties.customerId)) return new Error('Covered sites must belong to the contracting customer.');
    if (input.commercial.value < 0) return new Error('Contract value cannot be negative.');
    return null;
  }

  createContract(input: ContractUpsert, summary = 'Original draft'): Contract {
    const contract: Contract = {
      ...input, number: input.number.trim().toUpperCase(), id: input.number.trim().toUpperCase(), status: 'Draft', version: '1.0', previousContractId: null, approvalStatus: 'Not Submitted', signatureStatus: 'Not Sent',
      executionDate: null, activatedAt: null, suspendedReason: null, tracking: { billed: 0, collected: 0, recognizedRevenue: 0, actualCost: 0, additionalCharges: 0, slaBreaches: 0 }, ...this.store.audit(),
    };
    this.store.db.contracts = [contract, ...this.store.db.contracts];
    this.store.addVersion(contract, summary, 'Not Executed');
    this.store.log('Contract Created', 'Contract', contract.id, contract.id, `${contract.type} “${contract.title}” created.`, null, contract.title);
    return contract;
  }

  /** Activation is only possible once approvals (and signatures where required) are complete — SRS 5.21. */
  activate(c: Contract, comment: string): Error | Contract {
    if (c.approvalStatus !== 'Approved') return new Error('A contract must not become Active before required approvals are completed.');
    if (c.signatureRequired && c.signatureStatus !== 'Fully Signed') return new Error('Signature is mandatory — all signatories must sign before activation.');
    let next: Contract = { ...c, status: 'Active', activatedAt: this.store.now(), executionDate: c.executionDate ?? today(), updatedAt: this.store.now(), updatedBy: this.store.user };
    if (!c.signatureRequired) {
      next = { ...next, version: nextMajor(c.version) };
      this.store.replace(next);
      this.store.addVersion(next, 'Executed contract (no signature required)', 'Executed');
    } else {
      this.store.replace(next);
    }
    this.store.log('Activated', 'Contract', c.id, c.id, comment, c.status, 'Active');
    if (c.previousContractId) {
      const prev = this.store.contract(c.previousContractId);
      if (prev && prev.status !== 'Renewed') {
        this.store.replace({ ...prev, status: 'Renewed' });
        this.store.log('Renewed', 'Contract', prev.id, prev.id, `Superseded by renewed contract ${c.number}.`, prev.status, 'Renewed', c.number);
      }
    }
    return next;
  }

  /** Approval decision outcome for each subject type. */
  onRouteComplete(step: ApprovalStep, outcome: 'Approved' | 'Rejected' | 'Returned for Changes', comments: string): void {
    const { db } = this.store;
    const c = this.store.contract(step.contractId);
    if (!c) return;
    if (step.subject === 'Contract') {
      const status: ContractStatus = outcome === 'Approved' ? 'Approved' : outcome === 'Rejected' ? 'Draft' : 'Under Negotiation';
      this.store.replace({ ...c, status, approvalStatus: outcome, updatedAt: this.store.now(), updatedBy: this.store.user });
      this.store.log(outcome === 'Approved' ? 'Approved' : 'Rejected', 'Approval', step.id, c.id, outcome === 'Approved' ? 'All approval levels completed — approved for execution.' : `${outcome} at ${step.levelName}: ${comments}`, 'Pending Approval', status);
    } else if (step.subject === 'Amendment') {
      const status: AmendmentStatus = outcome === 'Approved' ? 'Approved' : outcome === 'Rejected' ? 'Rejected' : 'Under Negotiation';
      db.amendments = db.amendments.map((a) => (a.id === step.subjectId ? { ...a, status } : a));
      this.store.log(outcome === 'Approved' ? 'Approved' : 'Rejected', 'Amendment', step.subjectId, c.id, `Amendment ${outcome.toLowerCase()}. ${comments}`.trim(), 'Pending Approval', status);
    } else if (step.subject === 'Renewal') {
      const status: RenewalStatus = outcome === 'Approved' ? 'Approved' : outcome === 'Rejected' ? 'Rejected' : 'Commercial Review';
      db.renewals = db.renewals.map((r) => (r.id === step.subjectId ? { ...r, status } : r));
      this.store.log(outcome === 'Approved' ? 'Approved' : 'Rejected', 'Renewal', step.subjectId, c.id, `Renewal ${outcome.toLowerCase()}. ${comments}`.trim(), 'Pending Approval', status);
    }
  }
}

@Injectable()
export class MockContractApi extends ContractApi {
  private readonly store = inject(MockContractStore);
  private readonly ops = inject(ContractOps);

  list(filter: ContractFilter = {}): Observable<ContractListItem[]> {
    return query(() =>
      this.store.db.contracts
        .filter((c) => !filter.customerId || c.parties.customerId === filter.customerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((c) => this.store.contractItem(c)),
    );
  }

  get(id: string): Observable<ContractListItem> {
    return defer(() => {
      const c = this.store.contract(id);
      return c ? respond(this.store.contractItem(c)) : fail(`Contract ${id} was not found.`);
    });
  }

  create(input: ContractUpsert, changeSummary?: string): Observable<Contract> {
    return mutate(() => this.ops.checkInput(input) ?? this.ops.createContract(input, changeSummary));
  }

  update(id: string, input: ContractUpsert, changeSummary: string): Observable<Contract> {
    return mutate(() => {
      const current = this.store.contract(id);
      if (!current) return new Error('Contract was not found.');
      if (!EDITABLE_STATUSES.includes(current.status)) return new Error(`${current.status} contracts cannot be edited — executed versions must not be overwritten. Create an amendment instead.`);
      const error = this.ops.checkInput({ ...input, number: current.number }, id);
      if (error) return error;
      const next: Contract = { ...current, ...input, id, number: current.number, version: nextMinor(current.version), updatedAt: this.store.now(), updatedBy: this.store.user };
      const before = this.store.snapshot(current);
      const after = this.store.snapshot(next);
      const changed = Object.keys(after).filter((k) => before[k] !== after[k]);
      this.store.replace(next);
      this.store.addVersion(next, changeSummary || (changed.length ? `Changed: ${changed.join(', ')}` : 'Minor changes'), 'Not Executed');
      this.store.log('Contract Updated', 'Contract', id, id, changeSummary || 'Contract updated.', current.version, next.version);
      return next;
    });
  }

  duplicate(id: string): Observable<Contract> {
    return mutate(() => {
      const c = this.store.contract(id);
      if (!c) return new Error('Contract was not found.');
      const { id: _id, createdAt: _ca, createdBy: _cb, updatedAt: _ua, updatedBy: _ub, status: _s, version: _v, approvalStatus: _a, signatureStatus: _sg, executionDate: _e, activatedAt: _ac, suspendedReason: _sr, tracking: _t, previousContractId: _p, ...terms } = c;
      void [_id, _ca, _cb, _ua, _ub, _s, _v, _a, _sg, _e, _ac, _sr, _t, _p];
      return this.ops.createContract({ ...terms, number: this.ops.nextNumber(), title: `${c.title} (Copy)`, requestId: null, parentContractId: null }, `Duplicated from ${c.number}`);
    });
  }

  remove(id: string): Observable<void> {
    return mutate(() => {
      const { db } = this.store;
      const c = this.store.contract(id);
      if (!c) return new Error('Contract was not found.');
      const hasRecords = c.status !== 'Draft' || db.reviews.some((r) => r.contractId === id) || db.approvals.some((a) => a.contractId === id) || db.envelopes.some((e) => e.contractId === id) || db.obligations.some((o) => o.contractId === id) || db.amendments.some((a) => a.contractId === id);
      if (hasRecords) return new Error('Contracts with transactional or legal records cannot be deleted — archive or cancel it instead.');
      db.contracts = db.contracts.filter((x) => x.id !== id);
      db.versions = db.versions.filter((v) => v.contractId !== id);
      db.documents = db.documents.filter((d) => d.contractId !== id);
      db.requests = db.requests.map((r) => (r.convertedContractId === id ? { ...r, status: 'Approved', convertedContractId: null } : r));
      this.store.log('Cancelled', 'Contract', id, null, `Draft ${c.number} deleted (no transactional records).`, 'Draft', null, c.number);
      return undefined;
    });
  }

  nextNumber(): Observable<string> {
    return query(() => this.ops.nextNumber());
  }

  isNumberAvailable(number: string, excludeId?: string): Observable<boolean> {
    return defer(() => respond(!this.store.db.contracts.some((c) => c.id !== excludeId && norm(c.number) === norm(number)), 200));
  }

  submitForReview(id: string, reviewerIds: Partial<Record<ReviewType, string>> = {}): Observable<void> {
    return this.transition(id, 'submitReview', (c) => {
      const defaults: Record<string, string> = { 'Commercial Review': c.parties.managerId, 'Legal Review': 'USR-11', 'Technical Review': 'USR-15', 'Financial Review': 'USR-12' };
      for (const type of CONTRACT_RULES.defaultReviews as ReviewType[]) {
        const open = this.store.db.reviews.find((r) => r.contractId === id && r.type === type);
        if (open) this.store.db.reviews = this.store.db.reviews.map((r) => (r.id === open.id ? { ...r, status: 'Pending', reviewDate: '', dueDate: addDays(today(), 7) } : r));
        else this.store.db.reviews.push({ id: this.store.uid('REV'), contractId: id, reviewerId: reviewerIds[type] ?? defaults[type], type, reviewDate: '', dueDate: addDays(today(), 7), status: 'Pending', comments: '', attachments: [], createdAt: this.store.now() });
      }
      return { status: 'Under Review', action: 'Submitted for Review', comment: `Submitted for ${CONTRACT_RULES.defaultReviews.length} reviews.` };
    });
  }

  startNegotiation(id: string, comment: string): Observable<void> {
    return this.transition(id, 'negotiate', () => {
      if (comment) this.store.db.negotiation.push({ id: this.store.uid('NEG'), contractId: id, at: this.store.now(), author: this.store.user, party: 'Company', visibility: 'Internal', kind: 'Review Note', section: 'General', original: null, proposed: null, text: comment, resolved: false });
      return { status: 'Under Negotiation', action: 'Negotiated', comment: comment || 'Negotiation started.' };
    });
  }

  submitForApproval(id: string): Observable<void> {
    return this.transition(id, 'submitApproval', (c) => {
      const open = this.store.db.reviews.filter((r) => r.contractId === id && OPEN_REVIEW.includes(r.status));
      if (open.length) return new Error(`Complete the pending reviews first: ${open.map((r) => r.type).join(', ')}.`);
      this.store.db.approvals = this.store.db.approvals.map((a) => (a.subjectId === id && (a.status === 'Pending' || a.status === 'Waiting') ? { ...a, status: 'Cancelled' } : a));
      const levels = this.store.contractLevels(c);
      this.store.createApprovalRoute(c, 'Contract', id, levels);
      return { status: 'Pending Approval', action: 'Submitted for Review', comment: `Submitted for approval — ${levels.map((l) => l.name).join(' → ')}.`, patch: { approvalStatus: 'Pending' } };
    });
  }

  activate(id: string): Observable<void> {
    return mutate(() => {
      const c = this.store.contract(id);
      if (!c) return new Error('Contract was not found.');
      if (!allowed('activate', c.status)) return new Error(`${c.status} contracts cannot be activated.`);
      const result = this.ops.activate(c, 'Contract activated.');
      return result instanceof Error ? result : undefined;
    });
  }

  suspend(id: string, reason: string): Observable<void> {
    return this.transition(id, 'suspend', () => ({ status: 'Suspended', action: 'Suspended', comment: reason || 'Contract suspended.', patch: { suspendedReason: reason || 'Suspended' } }));
  }

  reactivate(id: string): Observable<void> {
    return this.transition(id, 'reactivate', () => ({ status: 'Active', action: 'Reactivated', comment: 'Suspension lifted.', patch: { suspendedReason: null } }));
  }

  archive(id: string): Observable<void> {
    return this.transition(id, 'archive', () => ({ status: 'Archived', action: 'Archived', comment: 'Contract archived — records retained.' }));
  }

  cancel(id: string, reason: string): Observable<void> {
    return this.transition(id, 'cancel', (c) => {
      this.store.db.approvals = this.store.db.approvals.map((a) => (a.subjectId === id && (a.status === 'Pending' || a.status === 'Waiting') ? { ...a, status: 'Cancelled' } : a));
      this.store.db.envelopes = this.store.db.envelopes.map((e) => (e.contractId === id && e.status === 'Sent' ? { ...e, status: 'Cancelled' } : e));
      return { status: 'Cancelled', action: 'Cancelled', comment: reason || 'Contract cancelled.', patch: { approvalStatus: c.approvalStatus === 'Pending' ? 'Cancelled' : c.approvalStatus, signatureStatus: c.signatureStatus === 'Sent' || c.signatureStatus === 'Viewed' ? 'Cancelled' : c.signatureStatus } };
    });
  }

  versions(id: string): Observable<ContractVersion[]> {
    return query(() => this.store.db.versions.filter((v) => v.contractId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  documents(id?: string): Observable<ContractDocument[]> {
    return query(() => this.store.db.documents.filter((d) => !id || d.contractId === id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)));
  }

  /** Version-controlled upload; executed (locked) documents cannot be replaced. */
  uploadDocument(contractId: string, type: DocumentType, file: FileInput, replacesId?: string | null): Observable<ContractDocument> {
    return mutate(() => {
      const c = this.store.contract(contractId);
      if (!c) return new Error('Contract was not found.');
      const replaced = replacesId ? this.store.db.documents.find((d) => d.id === replacesId) : undefined;
      if (replaced?.locked) return new Error('Executed contract documents are locked and cannot be replaced. Record changes through an amendment.');
      if (replaced?.supersededById) return new Error('Only the latest version of a document can be replaced.');
      const doc: ContractDocument = {
        id: this.store.uid('CDOC'), contractId, name: file.name, type: replaced?.type ?? type, version: (replaced?.version ?? 0) + 1, size: file.size, mime: file.mime, uploadedBy: this.store.user,
        uploadedAt: this.store.now(), supersededById: null, locked: false, reference: c.version,
      };
      this.store.db.documents = [doc, ...this.store.db.documents.map((d) => (d.id === replacesId ? { ...d, supersededById: doc.id } : d))];
      this.store.log('Document Uploaded', 'Document', doc.id, contractId, `${doc.type} “${doc.name}” uploaded${replaced ? ` as version ${doc.version}` : ''}.`, replaced ? `v${replaced.version}` : null, `v${doc.version}`);
      return doc;
    });
  }

  alerts(contractId?: string): Observable<ContractAlert[]> {
    return query(() => this.store.alerts(contractId));
  }

  dashboard(f: ContractDashboardFilters): Observable<ContractDashboard> {
    return query(() => {
      const has = (list: readonly string[], v: string | null | undefined) => !list.length || list.includes(v ?? '');
      const inRange = (r: { from: string; to: string }, d: string | null) => (!r.from || (!!d && d >= r.from)) && (!r.to || (!!d && d <= r.to));
      const fx = (value: number, currency: string) => Math.round(value * (FX_TO_REPORTING[currency] ?? 1));
      const items = this.store.db.contracts
        .map((c) => this.store.contractItem(c))
        .filter(
          (c) =>
            has(f.companies, c.parties.contractingOrganizationId) && has(f.branches, c.parties.branchId) && has(f.customers, c.parties.customerId) && has(f.types, c.type) &&
            has(f.statuses, c.effectiveStatus) && has(f.managers, c.parties.managerId) && has(f.accountManagers, c.parties.accountManagerId) && inRange(f.start, c.period.startDate) &&
            inRange(f.end, c.period.endDate) && inRange(f.renewal, c.period.renewalDate) && (f.minValue === null || c.commercial.value >= f.minValue) && (f.maxValue === null || c.commercial.value <= f.maxValue),
        );
      const count = (...s: ContractStatus[]) => items.filter((c) => s.includes(c.effectiveStatus)).length;
      const live = items.filter((c) => c.effectiveStatus === 'Active' || c.effectiveStatus === 'Expiring Soon');
      const row = (c: ContractListItem, date: string | null): ContractRow => ({ id: c.id, number: c.number, title: c.title, subtitle: c.customerName ?? '', status: c.effectiveStatus, date, value: c.commercial.value, currency: c.commercial.currency });
      const ids = new Set(items.map((c) => c.id));
      const sum = <K extends string>(key: (c: ContractListItem) => K) =>
        [...items.reduce((m, c) => m.set(key(c), (m.get(key(c)) ?? 0) + fx(c.commercial.value, c.commercial.currency)), new Map<K, number>())].sort((a, b) => b[1] - a[1]);
      const latest = (actionIds: readonly { contractId: string; at: string }[]) =>
        actionIds.filter((x) => ids.has(x.contractId)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).map((x) => row(this.store.contractItem(this.store.contract(x.contractId)!), x.at));
      return {
        kpis: {
          total: items.length, draft: count('Draft'), underReview: count('Under Review', 'Under Negotiation'), pendingApproval: count('Pending Approval'), pendingSignature: count('Pending Signature', 'Partially Signed'),
          active: count('Active'), expiring: count('Expiring Soon'), expired: count('Expired'), terminated: count('Terminated'), renewed: count('Renewed') + items.filter((c) => c.previousContractId).length,
          withOutstandingObligations: items.filter((c) => c.openObligations > 0).length, withSlaBreaches: items.filter((c) => c.slaBreaches > 0).length, withOpenAmendments: items.filter((c) => c.openAmendments > 0).length,
          totalValue: items.reduce((s, c) => s + fx(c.commercial.value, c.commercial.currency), 0), activeValue: live.reduce((s, c) => s + fx(c.commercial.value, c.commercial.currency), 0), currency: REPORTING_CURRENCY,
        },
        expiringSoon: items.filter((c) => c.effectiveStatus === 'Expiring Soon').sort((a, b) => a.daysRemaining - b.daysRemaining).slice(0, 6).map((c) => row(c, c.period.endDate)),
        pendingApproval: items.filter((c) => c.effectiveStatus === 'Pending Approval').slice(0, 6).map((c) => row(c, c.updatedAt ?? c.createdAt)),
        pendingSignature: items.filter((c) => c.effectiveStatus === 'Pending Signature' || c.effectiveStatus === 'Partially Signed').slice(0, 6).map((c) => row(c, null)),
        recentlyCreated: [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((c) => row(c, c.createdAt)),
        recentlyRenewed: latest(this.store.db.renewals.filter((r) => r.status === 'Completed').map((r) => ({ contractId: r.newContractId ?? r.contractId, at: r.createdAt }))),
        recentlyAmended: latest(this.store.db.amendments.filter((a) => a.status === 'Executed').map((a) => ({ contractId: a.contractId, at: a.effectiveDate }))),
        obligationsDue: this.store.db.obligations
          .filter((o) => ids.has(o.contractId))
          .map((o) => this.store.obligationItem(o))
          .filter((o) => o.effectiveStatus === 'Pending' || o.effectiveStatus === 'In Progress' || o.effectiveStatus === 'Overdue')
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          .slice(0, 6)
          .map((o) => ({ id: o.contractId, number: o.number, title: o.type, subtitle: `${o.contractNumber} · ${o.customerName ?? ''}`, status: o.effectiveStatus, date: o.dueDate, value: 0, currency: '' })),
        upcomingRenewals: live.filter((c) => c.period.renewalDate).sort((a, b) => (a.period.renewalDate ?? '').localeCompare(b.period.renewalDate ?? '')).slice(0, 6).map((c) => row(c, c.period.renewalDate)),
        valueByCustomer: sum((c) => c.parties.customerId ?? c.parties.vendorPartner).slice(0, 8).map(([id, value]) => ({ id, label: this.store.customerName(id) ?? id, value })),
        valueByType: sum((c) => c.type).map(([label, value]) => ({ label, value })),
        statusDistribution: [...items.reduce((m, c) => m.set(c.effectiveStatus, (m.get(c.effectiveStatus) ?? 0) + 1), new Map<string, number>())].map(([label, value]) => ({ label, value })),
      };
    });
  }

  private transition(
    id: string,
    action: keyof typeof ALLOWED_ACTIONS,
    work: (c: Contract) => { status: ContractStatus; action: Parameters<MockContractStore['log']>[0]; comment: string; patch?: Partial<Contract> } | Error,
  ): Observable<void> {
    return mutate(() => {
      const c = this.store.contract(id);
      if (!c) return new Error('Contract was not found.');
      const effective = this.store.effectiveStatus(c);
      if (!allowed(action, effective) && !allowed(action, c.status)) return new Error(`This action is not available for ${effective.toLowerCase()} contracts.`);
      const result = work(c);
      if (result instanceof Error) return result;
      this.store.replace({ ...c, ...result.patch, status: result.status, updatedAt: this.store.now(), updatedBy: this.store.user });
      this.store.log(result.action, 'Contract', id, id, result.comment, effective, result.status);
      return undefined;
    });
  }
}

@Injectable()
export class MockContractRequestApi extends ContractRequestApi {
  private readonly store = inject(MockContractStore);
  private readonly ops = inject(ContractOps);

  list(): Observable<RequestListItem[]> {
    return query(() =>
      [...this.store.db.requests]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({
          ...r,
          customerName: this.store.customerName(r.customerId) ?? '',
          siteName: this.store.db.reference.sites.find((s) => s.id === r.siteId)?.name ?? null,
          ownerName: this.store.userName(r.ownerId),
          convertedNumber: r.convertedContractId ? (this.store.contract(r.convertedContractId)?.number ?? null) : null,
        })),
    );
  }

  create(input: RequestInput, submit: boolean): Observable<ContractRequest> {
    return mutate(() => {
      const error = this.check(input);
      if (error) return error;
      const n = Math.max(0, ...this.store.db.requests.map((r) => Number(r.number.slice(4)) || 0)) + 1;
      const request: ContractRequest = { ...input, id: `CRQ-${pad(n, 5)}`, number: `CRQ-${pad(n, 5)}`, status: submit ? 'Submitted' : 'Draft', convertedContractId: null, decisionComment: '', ...this.store.audit() };
      this.store.db.requests = [request, ...this.store.db.requests];
      this.store.log('Request Created', 'Request', request.id, null, `${input.requestType} request for ${this.store.customerName(input.customerId)}.`, null, request.status, request.number);
      return request;
    });
  }

  update(id: string, input: RequestInput): Observable<ContractRequest> {
    return mutate(() => {
      const current = this.store.db.requests.find((r) => r.id === id);
      if (!current) return new Error('Request was not found.');
      if (current.status !== 'Draft' && current.status !== 'Submitted') return new Error(`${current.status} requests cannot be edited.`);
      const error = this.check(input);
      if (error) return error;
      const next = { ...current, ...input, updatedAt: this.store.now(), updatedBy: this.store.user };
      this.store.db.requests = this.store.db.requests.map((r) => (r.id === id ? next : r));
      this.store.log('Request Updated', 'Request', id, null, 'Request updated.', null, null, current.number);
      return next;
    });
  }

  submit(id: string): Observable<void> {
    return this.move(id, ['Draft'], 'Submitted', 'Request submitted for review.');
  }

  startReview(id: string): Observable<void> {
    return this.move(id, ['Submitted'], 'Under Review', 'Request review started.');
  }

  decide(id: string, approve: boolean, comment: string): Observable<void> {
    return this.move(id, ['Submitted', 'Under Review'], approve ? 'Approved' : 'Rejected', comment || (approve ? 'Request approved.' : 'Request rejected.'), comment);
  }

  cancel(id: string, comment: string): Observable<void> {
    return this.move(id, ['Draft', 'Submitted', 'Under Review', 'Approved'], 'Cancelled', comment || 'Request cancelled.', comment);
  }

  convert(id: string): Observable<Contract> {
    return mutate(() => {
      const r = this.store.db.requests.find((x) => x.id === id);
      if (!r) return new Error('Request was not found.');
      if (r.status !== 'Approved') return new Error('Only approved requests can be converted to a contract.');
      const customer = this.store.db.reference.customers.find((c) => c.id === r.customerId);
      const contract = this.ops.createContract(
        {
          number: this.ops.nextNumber(), title: `${r.contractType} — ${customer?.name ?? ''}`, type: r.contractType as Contract['type'], category: 'Comprehensive', parentContractId: null, externalReference: r.number,
          requestId: r.id, templateId: null, clauseIds: this.store.db.clauses.filter((c) => c.mandatory && c.status === 'Active').map((c) => c.id), riskLevel: r.estimatedValue >= 900_000 ? 'High' : r.estimatedValue >= 300_000 ? 'Medium' : 'Low',
          signatureRequired: CONTRACT_RULES.signatureRequiredByDefault,
          parties: { customerId: r.customerId, legalEntity: customer?.legalName ?? '', contractingOrganizationId: customer?.companyId ?? 'CMP-01', branchId: customer?.branchId ?? null, vendorPartner: '', primaryContact: customer?.primaryContact ?? '', ownerId: r.ownerId, managerId: 'USR-10', accountManagerId: customer?.accountManagerId ?? null },
          period: { effectiveDate: r.requestedStart, startDate: r.requestedStart, endDate: r.requestedEnd, renewalDate: addDays(r.requestedEnd, -60), noticePeriodDays: 60, autoRenewal: false, renewalTermMonths: 12, timeBound: true },
          scopeInfo: { scope: r.requestedServices, serviceIds: [], siteIds: r.siteId ? [r.siteId] : [], assetIds: [], serviceCategories: [], slaId: r.requiredSla, maintenanceRequirements: r.requiredEntitlements, exclusions: '' },
          commercial: { value: r.estimatedValue, currency: r.currency, billingFrequency: 'Quarterly', paymentTermsId: customer?.paymentTermsId ?? null, billingMethod: 'Fixed Fee', taxProfileId: customer?.taxProfileId ?? null, discountPercent: 0, deposit: null, advancePayment: null, priceEscalationPercent: null, priceRevisionDate: null },
          financial: { estimatedRevenue: r.estimatedValue, estimatedCost: Math.round(r.estimatedValue * 0.7), billingAccount: `BA-${customer?.code ?? ''}`, revenueAccount: '4100-Service Revenue', costCenter: '', profitCenter: '' },
          service: { serviceFrequency: 'Quarterly', includedVisits: 4, laborCoverage: true, partsCoverage: false, travelCoverage: true, emergencyCoverage: false, serviceWindow: 'Business Hours (08:00–17:00)' },
          legal: { governingLaw: 'Kingdom of Saudi Arabia', jurisdiction: 'Riyadh Commercial Court', confidentiality: true, insuranceRequirement: '', complianceRequirements: '', penaltyTerms: '', liabilityLimit: r.estimatedValue, terminationConditions: '', disputeResolution: 'Negotiation' },
          notes: { internal: r.justification, customer: '', legal: '', manager: r.notes },
        },
        `Created from request ${r.number}`,
      );
      this.store.db.requests = this.store.db.requests.map((x) => (x.id === id ? { ...x, status: 'Converted to Contract', convertedContractId: contract.id } : x));
      this.store.log('Request Updated', 'Request', id, contract.id, `Converted to contract ${contract.number}.`, 'Approved', 'Converted to Contract', r.number);
      return contract;
    });
  }

  private check(input: RequestInput): Error | null {
    if (!this.store.db.reference.customers.some((c) => c.id === input.customerId)) return new Error('Select a valid customer.');
    if (input.requestedEnd && input.requestedStart && input.requestedEnd < input.requestedStart) return new Error('Requested end date must be after the start date.');
    return null;
  }

  private move(id: string, from: readonly ContractRequest['status'][], to: ContractRequest['status'], comment: string, decision = ''): Observable<void> {
    return mutate(() => {
      const r = this.store.db.requests.find((x) => x.id === id);
      if (!r) return new Error('Request was not found.');
      if (!from.includes(r.status)) return new Error(`${r.status} requests cannot be moved to ${to}.`);
      this.store.db.requests = this.store.db.requests.map((x) => (x.id === id ? { ...x, status: to, decisionComment: decision || x.decisionComment, updatedAt: this.store.now(), updatedBy: this.store.user } : x));
      this.store.log('Request Updated', 'Request', id, null, comment, r.status, to, r.number);
      return undefined;
    });
  }
}

@Injectable()
export class MockTemplateApi extends TemplateApi {
  private readonly store = inject(MockContractStore);

  templates(): Observable<TemplateListItem[]> {
    return query(() =>
      [...this.store.db.templates]
        .sort((a, b) => a.code.localeCompare(b.code) || b.version.localeCompare(a.version))
        .map((t) => ({ ...t, clauseNames: t.defaultClauseIds.map((id) => this.store.db.clauses.find((c) => c.id === id)?.name ?? id), usageCount: this.store.db.contracts.filter((c) => c.templateId === t.id).length })),
    );
  }

  createTemplate(input: TemplateInput): Observable<ContractTemplate> {
    return mutate(() => {
      if (this.store.db.templates.some((t) => norm(t.code) === norm(input.code))) return new Error(`Template code ${input.code} is already in use.`);
      const missing = this.missingMandatory(input.defaultClauseIds);
      if (input.status === 'Active' && missing.length) return new Error(`Active templates must include the mandatory clauses: ${missing.join(', ')}.`);
      const t: ContractTemplate = { ...input, code: input.code.toUpperCase(), id: input.code.toUpperCase(), previousVersionId: null, ...this.store.audit() };
      this.store.db.templates = [t, ...this.store.db.templates];
      this.store.log('Template Updated', 'Template', t.id, null, `Template ${t.code} created.`, null, t.version);
      return t;
    });
  }

  updateTemplate(id: string, input: TemplateInput): Observable<ContractTemplate> {
    return mutate(() => {
      const current = this.store.db.templates.find((t) => t.id === id);
      if (!current) return new Error('Template was not found.');
      const missing = this.missingMandatory(input.defaultClauseIds);
      if (input.status === 'Active' && missing.length) return new Error(`Active templates must include the mandatory clauses: ${missing.join(', ')}.`);
      const next = { ...current, ...input, code: current.code, updatedAt: this.store.now(), updatedBy: this.store.user };
      this.store.db.templates = this.store.db.templates.map((t) => (t.id === id ? next : t));
      if (next.status === 'Active') this.deactivateSiblings(next);
      this.store.log('Template Updated', 'Template', id, null, `Template ${next.code} v${next.version} updated.`);
      return next;
    });
  }

  duplicateTemplate(id: string): Observable<ContractTemplate> {
    return mutate(() => {
      const t = this.store.db.templates.find((x) => x.id === id);
      if (!t) return new Error('Template was not found.');
      let n = 1;
      while (this.store.db.templates.some((x) => x.code === `${t.code}-C${n}`)) n++;
      const copy: ContractTemplate = { ...t, id: `${t.code}-C${n}`, code: `${t.code}-C${n}`, name: `${t.name} (Copy)`, version: '1.0', status: 'Draft', previousVersionId: null, ...this.store.audit() };
      this.store.db.templates = [copy, ...this.store.db.templates];
      this.store.log('Template Updated', 'Template', copy.id, null, `Duplicated from ${t.code}.`);
      return copy;
    });
  }

  versionTemplate(id: string): Observable<ContractTemplate> {
    return mutate(() => {
      const t = this.store.db.templates.find((x) => x.id === id);
      if (!t) return new Error('Template was not found.');
      const version = nextMajor(t.version);
      const next: ContractTemplate = { ...t, id: `${t.code}-V${version.replace('.0', '')}-${Date.now() % 10000}`, version, status: 'Draft', previousVersionId: t.id, effectiveDate: today(), ...this.store.audit() };
      this.store.db.templates = [next, ...this.store.db.templates];
      this.store.log('Template Updated', 'Template', next.id, null, `New version ${version} of ${t.code} drafted.`, t.version, version);
      return next;
    });
  }

  setTemplateStatus(id: string, active: boolean): Observable<void> {
    return mutate(() => {
      const t = this.store.db.templates.find((x) => x.id === id);
      if (!t) return new Error('Template was not found.');
      if (active && this.missingMandatory(t.defaultClauseIds).length) return new Error('Add all mandatory clauses before activating the template.');
      const next: ContractTemplate = { ...t, status: active ? 'Active' : 'Inactive' };
      this.store.db.templates = this.store.db.templates.map((x) => (x.id === id ? next : x));
      if (active) this.deactivateSiblings(next);
      this.store.log('Template Updated', 'Template', id, null, `Template ${t.code} v${t.version} ${active ? 'activated' : 'deactivated'}.`, t.status, next.status);
      return undefined;
    });
  }

  clauses(): Observable<ClauseListItem[]> {
    return query(() =>
      [...this.store.db.clauses]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((c) => ({ ...c, templateCount: this.store.db.templates.filter((t) => t.defaultClauseIds.includes(c.id)).length, contractCount: this.store.db.contracts.filter((x) => x.clauseIds.includes(c.id)).length })),
    );
  }

  createClause(input: ClauseInput): Observable<ContractClause> {
    return mutate(() => {
      if (this.store.db.clauses.some((c) => norm(c.code) === norm(input.code))) return new Error(`Clause code ${input.code} is already in use.`);
      const c: ContractClause = { ...input, code: input.code.toUpperCase(), id: input.code.toUpperCase(), previousVersionId: null, ...this.store.audit() };
      this.store.db.clauses = [c, ...this.store.db.clauses];
      this.store.log('Clause Updated', 'Clause', c.id, null, `Clause ${c.code} created.`, null, c.version);
      return c;
    });
  }

  updateClause(id: string, input: ClauseInput): Observable<ContractClause> {
    return mutate(() => {
      const current = this.store.db.clauses.find((c) => c.id === id);
      if (!current) return new Error('Clause was not found.');
      if (current.text !== input.text && this.store.db.contracts.some((c) => c.clauseIds.includes(id) && !EDITABLE_STATUSES.includes(c.status))) return new Error('This clause is part of executed contracts — create a new clause version instead of changing its text.');
      const next = { ...current, ...input, code: current.code, updatedAt: this.store.now(), updatedBy: this.store.user };
      this.store.db.clauses = this.store.db.clauses.map((c) => (c.id === id ? next : c));
      this.store.log('Clause Updated', 'Clause', id, null, `Clause ${next.code} updated.`);
      return next;
    });
  }

  /** New clause version; templates move to the new version, existing contracts keep theirs. */
  versionClause(id: string, text: string): Observable<ContractClause> {
    return mutate(() => {
      const c = this.store.db.clauses.find((x) => x.id === id);
      if (!c) return new Error('Clause was not found.');
      const version = nextMinor(c.version);
      const next: ContractClause = { ...c, id: `${c.code}-v${version}`, text, version, status: 'Active', previousVersionId: c.id, effectiveDate: today(), ...this.store.audit() };
      this.store.db.clauses = [next, ...this.store.db.clauses.map((x) => (x.id === id ? { ...x, status: 'Inactive' as const } : x))];
      this.store.db.templates = this.store.db.templates.map((t) => ({ ...t, defaultClauseIds: t.defaultClauseIds.map((x) => (x === id ? next.id : x)) }));
      this.store.log('Clause Updated', 'Clause', next.id, null, `Clause ${c.code} versioned; templates updated, executed contracts unchanged.`, c.version, version);
      return next;
    });
  }

  setClauseFlags(id: string, changes: { mandatory?: boolean; active?: boolean }): Observable<void> {
    return mutate(() => {
      const c = this.store.db.clauses.find((x) => x.id === id);
      if (!c) return new Error('Clause was not found.');
      if (changes.active === false && this.store.db.templates.some((t) => t.status === 'Active' && t.defaultClauseIds.includes(id))) return new Error('This clause is used by active templates — remove it from them first.');
      const next: ContractClause = { ...c, mandatory: changes.mandatory ?? c.mandatory, status: changes.active === undefined ? c.status : changes.active ? 'Active' : 'Inactive' };
      this.store.db.clauses = this.store.db.clauses.map((x) => (x.id === id ? next : x));
      this.store.log('Clause Updated', 'Clause', id, null, `Clause ${c.code} marked ${changes.mandatory !== undefined ? (next.mandatory ? 'mandatory' : 'optional') : next.status.toLowerCase()}.`);
      return undefined;
    });
  }

  private missingMandatory(ids: readonly string[]): string[] {
    return this.store.db.clauses.filter((c) => c.mandatory && c.status === 'Active' && !ids.includes(c.id) && ['Payment Terms', 'Liability', 'Termination'].includes(c.type) && !ids.some((id) => this.store.db.clauses.find((x) => x.id === id)?.type === c.type)).map((c) => c.name);
  }

  private deactivateSiblings(t: ContractTemplate): void {
    this.store.db.templates = this.store.db.templates.map((x) => (x.code === t.code && x.id !== t.id && x.status === 'Active' ? { ...x, status: 'Inactive' } : x));
  }
}

@Injectable()
export class MockReviewApi extends ReviewApi {
  private readonly store = inject(MockContractStore);

  list(contractId?: string): Observable<ReviewListItem[]> {
    return query(() =>
      this.store.db.reviews
        .filter((r) => !contractId || r.contractId === contractId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => {
          const c = this.store.contract(r.contractId);
          return { ...r, contractNumber: c?.number ?? r.contractId, contractTitle: c?.title ?? '', customerName: this.store.customerName(c?.parties.customerId), reviewerName: this.store.userName(r.reviewerId), overdue: OPEN_REVIEW.includes(r.status) && r.dueDate < today() };
        }),
    );
  }

  add(contractId: string, type: ReviewType, reviewerId: string, dueDate: string): Observable<void> {
    return mutate(() => {
      const c = this.store.contract(contractId);
      if (!c) return new Error('Contract was not found.');
      if (!['Draft', 'Under Review', 'Under Negotiation'].includes(c.status)) return new Error('Reviews can only be added before the contract is submitted for approval.');
      this.store.db.reviews.push({ id: this.store.uid('REV'), contractId, reviewerId, type, reviewDate: '', dueDate, status: 'Pending', comments: '', attachments: [], createdAt: this.store.now() });
      this.store.log('Submitted for Review', 'Review', contractId, contractId, `${type} assigned to ${this.store.userName(reviewerId)}.`);
      return undefined;
    });
  }

  setStatus(id: string, status: ReviewStatus, comments: string): Observable<void> {
    return mutate(() => {
      const r = this.store.db.reviews.find((x) => x.id === id);
      if (!r) return new Error('Review was not found.');
      if ((status === 'Changes Requested' || status === 'Rejected') && !comments.trim()) return new Error('Add comments explaining the requested changes.');
      const final = !OPEN_REVIEW.includes(status);
      this.store.db.reviews = this.store.db.reviews.map((x) => (x.id === id ? { ...x, status, comments: comments || x.comments, reviewDate: final ? today() : x.reviewDate } : x));
      this.store.log('Reviewed', 'Review', id, r.contractId, `${r.type}: ${status}${comments ? ` — ${comments}` : ''}`, r.status, status);
      const c = this.store.contract(r.contractId);
      if (c && status === 'Changes Requested' && c.status === 'Under Review') {
        this.store.replace({ ...c, status: 'Under Negotiation' });
        this.store.log('Negotiated', 'Contract', c.id, c.id, `Changes requested in ${r.type} — moved to negotiation.`, 'Under Review', 'Under Negotiation');
      }
      return undefined;
    });
  }

  negotiation(contractId?: string): Observable<NegotiationEntry[]> {
    return query(() => this.store.db.negotiation.filter((n) => !contractId || n.contractId === contractId).sort((a, b) => b.at.localeCompare(a.at)));
  }

  addEntry(contractId: string, entry: { kind: NegotiationEntry['kind']; visibility: CommentVisibility; party: NegotiationEntry['party']; section: string; original: string | null; proposed: string | null; text: string }): Observable<void> {
    return mutate(() => {
      const c = this.store.contract(contractId);
      if (!c) return new Error('Contract was not found.');
      if (!EDITABLE_STATUSES.includes(c.status)) return new Error('Negotiation is closed once the contract is submitted for approval.');
      if (!entry.text.trim()) return new Error('Enter a comment.');
      this.store.db.negotiation.push({ ...entry, id: this.store.uid('NEG'), contractId, at: this.store.now(), author: this.store.user, resolved: false });
      if (entry.kind === 'Redline' || entry.kind === 'Clause Change') this.store.log('Negotiated', 'Contract', contractId, contractId, `${entry.kind} on ${entry.section}: ${entry.text}`, entry.original, entry.proposed);
      return undefined;
    });
  }

  resolveEntry(id: string): Observable<void> {
    return mutate(() => {
      this.store.db.negotiation = this.store.db.negotiation.map((n) => (n.id === id ? { ...n, resolved: true } : n));
      return undefined;
    });
  }
}

@Injectable()
export class MockApprovalApi extends ApprovalApi {
  private readonly store = inject(MockContractStore);
  private readonly ops = inject(ContractOps);

  list(contractId?: string): Observable<ApprovalListItem[]> {
    return query(() =>
      this.store.db.approvals
        .filter((a) => !contractId || a.contractId === contractId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.level - b.level)
        .map((a) => {
          const c = this.store.contract(a.contractId);
          const subject = a.subject === 'Amendment' ? this.store.db.amendments.find((x) => x.id === a.subjectId)?.number : a.subject === 'Renewal' ? this.store.db.renewals.find((x) => x.id === a.subjectId)?.number : null;
          const value = a.subject === 'Amendment' ? (this.store.db.amendments.find((x) => x.id === a.subjectId)?.commercialImpact ?? 0) : a.subject === 'Renewal' ? (this.store.db.renewals.find((x) => x.id === a.subjectId)?.value ?? 0) : (c?.commercial.value ?? 0);
          return {
            ...a, contractNumber: c?.number ?? a.contractId, contractTitle: c?.title ?? '', customerName: this.store.customerName(c?.parties.customerId), value, currency: c?.commercial.currency ?? 'SAR',
            approverName: this.store.userName(a.approverId), delegateName: a.delegateId ? this.store.userName(a.delegateId) : null, subjectLabel: subject ? `${a.subject} ${subject}` : a.subject,
          };
        }),
    );
  }

  decide(stepId: string, decision: 'Approved' | 'Rejected' | 'Returned for Changes', comments: string): Observable<void> {
    return mutate(() => {
      const step = this.store.db.approvals.find((a) => a.id === stepId);
      if (!step) return new Error('Approval step was not found.');
      if (step.status !== 'Pending') return new Error(`This step is ${step.status.toLowerCase()} and cannot be decided.`);
      if (decision !== 'Approved' && !comments.trim()) return new Error('Comments are required when rejecting or returning for changes.');
      const route = this.store.db.approvals.filter((a) => a.subjectId === step.subjectId && a.round === step.round).sort((a, b) => a.level - b.level);
      const next = route.find((a) => a.level > step.level && a.status === 'Waiting');
      this.store.db.approvals = this.store.db.approvals.map((a) => {
        if (a.id === stepId) return { ...a, status: decision, decidedAt: this.store.now(), comments };
        if (decision === 'Approved' && a.id === next?.id) return { ...a, status: 'Pending' };
        if (decision !== 'Approved' && a.subjectId === step.subjectId && a.round === step.round && a.status === 'Waiting') return { ...a, status: 'Cancelled' };
        return a;
      });
      if (decision === 'Approved' && next) {
        this.store.log('Approved', 'Approval', stepId, step.contractId, `${step.levelName} approved — routed to ${next.levelName}.`, null, step.levelName);
      } else {
        this.ops.onRouteComplete(step, decision, comments);
      }
      return undefined;
    });
  }

  delegate(stepId: string, delegateId: string): Observable<void> {
    return mutate(() => {
      const step = this.store.db.approvals.find((a) => a.id === stepId);
      if (!step || (step.status !== 'Pending' && step.status !== 'Waiting')) return new Error('Only open approval steps can be delegated.');
      this.store.db.approvals = this.store.db.approvals.map((a) => (a.id === stepId ? { ...a, delegateId } : a));
      this.store.log('Contract Updated', 'Approval', stepId, step.contractId, `${step.levelName} delegated to ${this.store.userName(delegateId)}.`, this.store.userName(step.approverId), this.store.userName(delegateId));
      return undefined;
    });
  }
}

@Injectable()
export class MockSignatureApi extends SignatureApi {
  private readonly store = inject(MockContractStore);
  private readonly ops = inject(ContractOps);

  list(): Observable<SignatureListItem[]> {
    return query(() =>
      this.store.db.contracts
        .filter((c) => ['Approved', 'Pending Signature', 'Partially Signed'].includes(c.status) || this.store.db.envelopes.some((e) => e.contractId === c.id))
        .map((c) => this.item(c.id))
        .sort((a, b) => (b.envelope?.sentAt ?? '9999').localeCompare(a.envelope?.sentAt ?? '9999')),
    );
  }

  get(contractId: string): Observable<SignatureListItem> {
    return query(() => this.item(contractId));
  }

  send(contractId: string, signatories: readonly SignatoryInput[]): Observable<void> {
    return mutate(() => {
      const c = this.store.contract(contractId);
      if (!c) return new Error('Contract was not found.');
      if (!c.signatureRequired) return new Error('This contract does not require signature — activate it directly.');
      if (c.approvalStatus !== 'Approved' || !['Approved', 'Pending Signature'].includes(c.status)) return new Error('Only approved contracts can be sent for signature.');
      if (!signatories.length) return new Error('Add at least one signatory.');
      const open = this.store.db.envelopes.find((e) => e.contractId === contractId && e.status === 'Sent');
      if (open) return new Error('An envelope is already out for signature. Cancel it before resending.');
      const envelopeId = this.store.uid('ENV');
      this.store.db.envelopes.push({ id: envelopeId, contractId, finalVersion: c.version, provider: 'DocuSign (simulated)', sentAt: this.store.now(), expiresAt: addDays(today(), CONTRACT_RULES.signatureExpiryDays), completedAt: null, status: 'Sent', signedDocumentId: null });
      signatories.forEach((s, i) =>
        this.store.db.signatories.push({ ...s, id: this.store.uid('SIG'), contractId, envelopeId, order: i + 1, status: i === 0 ? 'Sent' : 'Waiting', sentAt: i === 0 ? this.store.now() : null, viewedAt: null, signedAt: null, ipAddress: null }),
      );
      this.store.replace({ ...c, status: 'Pending Signature', signatureStatus: 'Sent', updatedAt: this.store.now(), updatedBy: this.store.user });
      this.store.log('Sent for Signature', 'Signature', envelopeId, contractId, `Final version ${c.version} sent to ${signatories.length} signatories in order.`, c.status, 'Pending Signature');
      return undefined;
    });
  }

  record(signatoryId: string, event: 'Viewed' | 'Signed' | 'Declined'): Observable<void> {
    return mutate(() => {
      const s = this.store.db.signatories.find((x) => x.id === signatoryId);
      if (!s) return new Error('Signatory was not found.');
      const env = this.store.db.envelopes.find((e) => e.id === s.envelopeId);
      if (env?.status !== 'Sent') return new Error('This envelope is no longer open.');
      if (s.status !== 'Sent' && s.status !== 'Viewed') return new Error(s.status === 'Waiting' ? 'Previous signatories must sign first (signing order).' : `This signatory has already ${s.status.toLowerCase()}.`);
      const c = this.store.contract(s.contractId)!;
      const stamp = this.store.now();
      if (event === 'Viewed') {
        this.patchSigner(s.id, { status: 'Viewed', viewedAt: stamp });
        if (c.signatureStatus === 'Sent') this.store.replace({ ...c, signatureStatus: 'Viewed' });
        this.store.log('Sent for Signature', 'Signature', s.id, c.id, `${s.name} viewed the document.`, null, 'Viewed');
        return undefined;
      }
      if (event === 'Declined') {
        this.patchSigner(s.id, { status: 'Declined' });
        this.store.db.envelopes = this.store.db.envelopes.map((e) => (e.id === env.id ? { ...e, status: 'Declined' } : e));
        this.store.db.signatories = this.store.db.signatories.map((x) => (x.envelopeId === env.id && x.status === 'Waiting' ? { ...x, status: 'Cancelled' } : x));
        this.store.replace({ ...c, status: 'Approved', signatureStatus: 'Declined' });
        this.store.log('Rejected', 'Signature', s.id, c.id, `${s.name} declined to sign — envelope closed.`, c.signatureStatus, 'Declined');
        return undefined;
      }
      this.patchSigner(s.id, { status: 'Signed', signedAt: stamp, viewedAt: s.viewedAt ?? stamp, ipAddress: '127.0.0.1' });
      const next = this.store.db.signatories.filter((x) => x.envelopeId === env.id && x.status === 'Waiting').sort((a, b) => a.order - b.order)[0];
      if (next) {
        this.patchSigner(next.id, { status: 'Sent', sentAt: stamp });
        this.store.replace({ ...c, status: 'Partially Signed', signatureStatus: 'Partially Signed' });
        this.store.log('Signed', 'Signature', s.id, c.id, `${s.name} signed — sent to ${next.name}.`, c.signatureStatus, 'Partially Signed');
        return undefined;
      }
      // Fully signed: store executed version + locked signed document, then activate.
      const docId = this.store.uid('CDOC');
      this.store.db.documents = [{ id: docId, contractId: c.id, name: `${c.number} Executed Contract.pdf`, type: 'Signed Contract', version: 1, size: 820_000, mime: 'application/pdf', uploadedBy: 'E-signature provider', uploadedAt: stamp, supersededById: null, locked: true, reference: env.id }, ...this.store.db.documents];
      this.store.db.envelopes = this.store.db.envelopes.map((e) => (e.id === env.id ? { ...e, status: 'Completed', completedAt: stamp, signedDocumentId: docId } : e));
      const executed: Contract = { ...c, version: nextMajor(c.version), signatureStatus: 'Fully Signed', executionDate: today(), status: 'Approved' };
      this.store.replace(executed);
      this.store.addVersion(executed, 'Executed contract — fully signed', 'Executed', docId);
      this.store.log('Signed', 'Signature', s.id, c.id, `Fully signed — executed version ${executed.version} stored and locked.`, 'Partially Signed', 'Fully Signed');
      const activated = this.ops.activate(executed, 'Activated after full execution.');
      return activated instanceof Error ? activated : undefined;
    });
  }

  cancel(contractId: string): Observable<void> {
    return mutate(() => {
      const env = this.store.db.envelopes.find((e) => e.contractId === contractId && e.status === 'Sent');
      if (!env) return new Error('No open envelope to cancel.');
      this.store.db.envelopes = this.store.db.envelopes.map((e) => (e.id === env.id ? { ...e, status: 'Cancelled' } : e));
      this.store.db.signatories = this.store.db.signatories.map((s) => (s.envelopeId === env.id && s.status !== 'Signed' ? { ...s, status: 'Cancelled' } : s));
      const c = this.store.contract(contractId)!;
      this.store.replace({ ...c, status: 'Approved', signatureStatus: 'Cancelled' });
      this.store.log('Cancelled', 'Signature', env.id, contractId, 'Signature envelope cancelled.', c.signatureStatus, 'Cancelled');
      return undefined;
    });
  }

  remind(contractId: string): Observable<void> {
    return mutate(() => {
      const pending = this.store.db.signatories.find((s) => s.contractId === contractId && (s.status === 'Sent' || s.status === 'Viewed'));
      if (!pending) return new Error('No signatory is currently awaiting signature.');
      this.store.log('Sent for Signature', 'Signature', pending.id, contractId, `Reminder sent to ${pending.name}.`);
      return undefined;
    });
  }

  private patchSigner(id: string, patch: Partial<SignatureListItem['signatories'][number]>): void {
    this.store.db.signatories = this.store.db.signatories.map((s) => (s.id === id ? { ...s, ...patch } : s));
  }

  private item(contractId: string): SignatureListItem {
    const c = this.store.contract(contractId)!;
    const envelope = this.store.db.envelopes.filter((e) => e.contractId === contractId).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0] ?? null;
    const signatories = envelope ? this.store.db.signatories.filter((s) => s.envelopeId === envelope.id).sort((a, b) => a.order - b.order) : [];
    return { contractId, contractNumber: c.number, contractTitle: c.title, customerName: this.store.customerName(c.parties.customerId) ?? c.parties.vendorPartner, envelope, signatories, signatureStatus: c.signatureStatus, signedCount: signatories.filter((s) => s.status === 'Signed').length, executionDate: c.executionDate };
  }
}

@Injectable()
export class MockObligationApi extends ObligationApi {
  private readonly store = inject(MockContractStore);

  list(contractId?: string): Observable<ObligationListItem[]> {
    return query(() => this.store.db.obligations.filter((o) => !contractId || o.contractId === contractId).map((o) => this.store.obligationItem(o)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
  }

  create(input: ObligationInput): Observable<Obligation> {
    return mutate(() => {
      const c = this.store.contract(input.contractId);
      if (!c) return new Error('Obligations must be traceable to an existing contract.');
      if (['Cancelled', 'Archived'].includes(c.status)) return new Error(`Obligations cannot be added to ${c.status.toLowerCase()} contracts.`);
      const o = this.build(input);
      this.store.log('Obligation Updated', 'Obligation', o.id, o.contractId, `${o.number} ${o.type} created — due ${o.dueDate}.`, null, o.status);
      return o;
    });
  }

  update(id: string, input: ObligationInput): Observable<Obligation> {
    return mutate(() => {
      const o = this.store.db.obligations.find((x) => x.id === id);
      if (!o) return new Error('Obligation was not found.');
      if (o.status === 'Completed' || o.status === 'Cancelled') return new Error(`${o.status} obligations cannot be edited.`);
      const next = { ...o, ...input, contractId: o.contractId, updatedAt: this.store.now(), updatedBy: this.store.user };
      this.store.db.obligations = this.store.db.obligations.map((x) => (x.id === id ? next : x));
      this.store.log('Obligation Updated', 'Obligation', id, o.contractId, `${o.number} updated.`, o.dueDate !== next.dueDate ? o.dueDate : null, o.dueDate !== next.dueDate ? next.dueDate : null);
      return next;
    });
  }

  start(id: string): Observable<void> {
    return this.move(id, ['Pending'], 'In Progress', 'Work started.');
  }

  complete(id: string, evidence: readonly FileInput[], notes: string): Observable<void> {
    return mutate(() => {
      const o = this.store.db.obligations.find((x) => x.id === id);
      if (!o) return new Error('Obligation was not found.');
      if (!['Pending', 'In Progress'].includes(o.status)) return new Error(`${o.status} obligations cannot be completed.`);
      if (o.evidenceRequired && !o.evidence.length && !evidence.length) return new Error('Evidence is required to complete this obligation.');
      const files = evidence.map((f) => ({ id: this.store.uid('EV'), name: f.name, size: f.size, type: f.mime, uploadedBy: this.store.user, uploadedAt: this.store.now() }));
      this.store.db.obligations = this.store.db.obligations.map((x) => (x.id === id ? { ...x, status: 'Completed', completionDate: today(), evidence: [...x.evidence, ...files], notes: notes || x.notes } : x));
      this.store.log('Obligation Updated', 'Obligation', id, o.contractId, `${o.number} completed${files.length ? ` with ${files.length} evidence file(s)` : ''}.`, this.store.obligationStatus(o), 'Completed');
      const months: Record<string, number> = { Monthly: 1, Quarterly: 3, 'Semi-Annual': 6, Annual: 12 };
      const c = this.store.contract(o.contractId);
      if (months[o.frequency] || o.frequency === 'Weekly') {
        const due = o.frequency === 'Weekly' ? addDays(o.dueDate, 7) : addMonths(o.dueDate, months[o.frequency]);
        if (c && due <= c.period.endDate) {
          const { id: _i, number: _n, evidence: _e, completionDate: _c, escalated: _s, createdAt: _ca, createdBy: _cb, updatedAt: _ua, updatedBy: _ub, ...rest } = o;
          void [_i, _n, _e, _c, _s, _ca, _cb, _ua, _ub];
          const nextOb = this.build({ ...rest, status: 'Pending', dueDate: due, notes: '' });
          this.store.log('Obligation Updated', 'Obligation', nextOb.id, o.contractId, `Next ${o.frequency.toLowerCase()} occurrence ${nextOb.number} scheduled for ${due}.`);
        }
      }
      return undefined;
    });
  }

  waive(id: string, reason: string): Observable<void> {
    return this.move(id, ['Pending', 'In Progress'], 'Waived', reason || 'Obligation waived.');
  }

  escalate(id: string): Observable<void> {
    return mutate(() => {
      const o = this.store.db.obligations.find((x) => x.id === id);
      if (!o) return new Error('Obligation was not found.');
      if (this.store.obligationStatus(o) !== 'Overdue') return new Error('Only overdue obligations can be escalated.');
      this.store.db.obligations = this.store.db.obligations.map((x) => (x.id === id ? { ...x, escalated: true, priority: 'Critical' } : x));
      const c = this.store.contract(o.contractId);
      this.store.log('Obligation Updated', 'Obligation', id, o.contractId, `${o.number} overdue — escalated to ${this.store.userName(c?.parties.managerId)}.`, o.priority, 'Critical');
      return undefined;
    });
  }

  private build(input: ObligationInput): Obligation {
    const n = Math.max(0, ...this.store.db.obligations.map((o) => Number(o.number.slice(4)) || 0)) + 1;
    const o: Obligation = { ...input, id: `OBL-${pad(n, 5)}`, number: `OBL-${pad(n, 5)}`, evidence: [], completionDate: null, escalated: false, ...this.store.audit() };
    this.store.db.obligations = [o, ...this.store.db.obligations];
    return o;
  }

  private move(id: string, from: readonly Obligation['status'][], to: Obligation['status'], comment: string): Observable<void> {
    return mutate(() => {
      const o = this.store.db.obligations.find((x) => x.id === id);
      if (!o) return new Error('Obligation was not found.');
      if (!from.includes(o.status)) return new Error(`${o.status} obligations cannot be moved to ${to}.`);
      this.store.db.obligations = this.store.db.obligations.map((x) => (x.id === id ? { ...x, status: to, notes: to === 'Waived' ? comment : x.notes } : x));
      this.store.log('Obligation Updated', 'Obligation', id, o.contractId, `${o.number}: ${comment}`, this.store.obligationStatus(o), to);
      return undefined;
    });
  }
}

@Injectable()
export class MockAmendmentApi extends AmendmentApi {
  private readonly store = inject(MockContractStore);

  list(contractId?: string): Observable<AmendmentListItem[]> {
    return query(() =>
      this.store.db.amendments
        .filter((a) => !contractId || a.contractId === contractId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a) => {
          const c = this.store.contract(a.contractId);
          return { ...a, contractNumber: c?.number ?? a.contractId, contractTitle: c?.title ?? '', customerName: this.store.customerName(c?.parties.customerId), currency: c?.commercial.currency ?? 'SAR' };
        }),
    );
  }

  create(input: AmendmentInput): Observable<Amendment> {
    return mutate(() => {
      const c = this.store.contract(input.contractId);
      if (!c) return new Error('Contract was not found.');
      if (!allowed('amend', this.store.effectiveStatus(c))) return new Error('Only active or executed contracts can be amended.');
      if (!input.reason.trim()) return new Error('A reason is required.');
      const n = Math.max(0, ...this.store.db.amendments.map((a) => Number(a.number.slice(4)) || 0)) + 1;
      const a: Amendment = { ...input, id: `AMD-${pad(n, 5)}`, number: `AMD-${pad(n, 5)}`, status: 'Requested', resultingVersion: null, ...this.store.audit() };
      this.store.db.amendments = [a, ...this.store.db.amendments];
      this.store.log('Contract Updated', 'Amendment', a.id, c.id, `Amendment ${a.number} (${a.type}) requested.`, null, 'Requested');
      return a;
    });
  }

  advance(id: string): Observable<void> {
    return mutate(() => {
      const a = this.store.db.amendments.find((x) => x.id === id);
      if (!a) return new Error('Amendment was not found.');
      const flow: Partial<Record<AmendmentStatus, AmendmentStatus>> = { Requested: 'Under Review', 'Under Review': 'Under Negotiation', 'Under Negotiation': 'Pending Approval' };
      const next = flow[a.status];
      if (!next) return new Error(a.status === 'Pending Approval' ? 'Waiting for approval decisions.' : `${a.status} amendments cannot be advanced.`);
      const c = this.store.contract(a.contractId)!;
      if (next === 'Pending Approval') {
        const levels = [
          { level: 1, name: 'Approval Level 1', role: 'Contract Manager', approverId: 'USR-10', reasons: ['All amendments'] },
          ...(Math.abs(a.commercialImpact) >= CONTRACT_RULES.amendmentFinanceThreshold ? [{ level: 2, name: 'Approval Level 2', role: 'Finance Manager', approverId: 'USR-12', reasons: [`Commercial impact ≥ ${CONTRACT_RULES.amendmentFinanceThreshold.toLocaleString('en-US')}`] }] : []),
          ...(a.type === 'Legal Change' ? [{ level: 3, name: 'Legal Approval', role: 'Legal Counsel', approverId: 'USR-11', reasons: ['Legal change'] }] : []),
        ];
        this.store.createApprovalRoute(c, 'Amendment', a.id, levels);
      }
      this.store.db.amendments = this.store.db.amendments.map((x) => (x.id === id ? { ...x, status: next } : x));
      this.store.log(next === 'Under Negotiation' ? 'Negotiated' : 'Submitted for Review', 'Amendment', id, c.id, `Amendment ${a.number}: ${a.status} → ${next}.`, a.status, next);
      return undefined;
    });
  }

  /** Applies the approved change; the original version is preserved and a new version is recorded. */
  execute(id: string): Observable<void> {
    return mutate(() => {
      const a = this.store.db.amendments.find((x) => x.id === id);
      if (!a) return new Error('Amendment was not found.');
      if (a.status !== 'Approved') return new Error('Only approved amendments can be executed.');
      const c = this.store.contract(a.contractId)!;
      const ch = a.changes;
      const without = (list: readonly string[], remove: readonly string[] = []) => list.filter((x) => !remove.includes(x));
      const next: Contract = {
        ...c,
        version: nextMinor(c.version),
        commercial: { ...c.commercial, value: ch.value ?? c.commercial.value },
        period: { ...c.period, endDate: ch.endDate ?? c.period.endDate, renewalDate: ch.endDate ? addDays(ch.endDate, -60) : c.period.renewalDate },
        scopeInfo: {
          ...c.scopeInfo,
          slaId: ch.slaId !== undefined ? ch.slaId : c.scopeInfo.slaId,
          siteIds: [...new Set([...without(c.scopeInfo.siteIds, ch.removeSiteIds), ...(ch.addSiteIds ?? [])])],
          assetIds: [...new Set([...without(c.scopeInfo.assetIds, ch.removeAssetIds), ...(ch.addAssetIds ?? [])])],
          serviceIds: [...new Set([...without(c.scopeInfo.serviceIds, ch.removeServiceIds), ...(ch.addServiceIds ?? [])])],
        },
        updatedAt: this.store.now(),
        updatedBy: this.store.user,
      };
      this.store.replace(next);
      this.store.addVersion(next, `Amendment ${a.number} — ${a.type}`, 'Executed', a.documentId);
      this.store.db.amendments = this.store.db.amendments.map((x) => (x.id === id ? { ...x, status: 'Executed', resultingVersion: next.version } : x));
      this.store.log('Amended', 'Amendment', id, c.id, `Amendment ${a.number} executed — contract updated to version ${next.version}; version ${c.version} preserved.`, c.version, next.version, a.number);
      return undefined;
    });
  }

  cancel(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const a = this.store.db.amendments.find((x) => x.id === id);
      if (!a) return new Error('Amendment was not found.');
      if (a.status === 'Executed' || a.status === 'Cancelled') return new Error(`${a.status} amendments cannot be cancelled.`);
      this.store.db.amendments = this.store.db.amendments.map((x) => (x.id === id ? { ...x, status: 'Cancelled', notes: reason } : x));
      this.store.db.approvals = this.store.db.approvals.map((s) => (s.subjectId === id && (s.status === 'Pending' || s.status === 'Waiting') ? { ...s, status: 'Cancelled' } : s));
      this.store.log('Cancelled', 'Amendment', id, a.contractId, `Amendment ${a.number} cancelled. ${reason}`.trim(), a.status, 'Cancelled');
      return undefined;
    });
  }
}

@Injectable()
export class MockRenewalApi extends RenewalApi {
  private readonly store = inject(MockContractStore);
  private readonly ops = inject(ContractOps);

  list(contractId?: string): Observable<RenewalListItem[]> {
    return query(() =>
      this.store.db.renewals
        .filter((r) => !contractId || r.contractId === contractId || r.newContractId === contractId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => {
          const c = this.store.contract(r.contractId);
          return {
            ...r, contractNumber: c?.number ?? r.contractId, contractTitle: c?.title ?? '', customerName: this.store.customerName(c?.parties.customerId), currentValue: c?.commercial.value ?? 0,
            currency: c?.commercial.currency ?? 'SAR', currentEnd: c?.period.endDate ?? '', newContractNumber: r.newContractId ? (this.store.contract(r.newContractId)?.number ?? null) : null,
          };
        }),
    );
  }

  candidates(): Observable<RenewalCandidate[]> {
    return query(() =>
      this.store.db.contracts
        .filter((c) => {
          const s = this.store.effectiveStatus(c);
          const days = this.store.contractItem(c).daysRemaining;
          return (s === 'Active' || s === 'Expiring Soon' || s === 'Expired') && days <= 180 && days >= -60 && !this.store.db.contracts.some((x) => x.previousContractId === c.id) && !this.store.db.terminations.some((t) => t.contractId === c.id && t.status !== 'Rejected' && t.status !== 'Cancelled');
        })
        .map((c) => {
          const item = this.store.contractItem(c);
          const renewal = this.store.db.renewals.find((r) => r.contractId === c.id && !['Rejected', 'Cancelled'].includes(r.status));
          return {
            contractId: c.id, number: c.number, title: c.title, customerName: item.customerName, endDate: c.period.endDate, daysRemaining: item.daysRemaining, value: c.commercial.value, currency: c.commercial.currency,
            autoRenewal: c.period.autoRenewal, noticeStarted: item.daysRemaining <= c.period.noticePeriodDays, renewalId: renewal?.id ?? null, renewalStatus: renewal?.status ?? null,
          };
        })
        .sort((a, b) => a.daysRemaining - b.daysRemaining),
    );
  }

  create(input: RenewalInput): Observable<Renewal> {
    return mutate(() => {
      const c = this.store.contract(input.contractId);
      if (!c) return new Error('Contract was not found.');
      if (!allowed('renew', this.store.effectiveStatus(c))) return new Error(`${this.store.effectiveStatus(c)} contracts cannot be renewed.`);
      if (this.store.db.renewals.some((r) => r.contractId === c.id && !['Completed', 'Rejected', 'Cancelled'].includes(r.status))) return new Error('A renewal is already in progress for this contract.');
      if (input.endDate <= input.startDate) return new Error('The renewal end date must be after the start date.');
      const n = Math.max(0, ...this.store.db.renewals.map((r) => Number(r.number.slice(4)) || 0)) + 1;
      const r: Renewal = { ...input, id: `RNW-${pad(n, 5)}`, number: `RNW-${pad(n, 5)}`, status: 'Requested', newContractId: null, ...this.store.audit() };
      this.store.db.renewals = [r, ...this.store.db.renewals];
      this.store.log('Contract Updated', 'Renewal', r.id, c.id, `${r.type} ${r.number} requested — ${r.startDate} to ${r.endDate}.`, null, 'Requested');
      return r;
    });
  }

  advance(id: string): Observable<void> {
    return mutate(() => {
      const r = this.store.db.renewals.find((x) => x.id === id);
      if (!r) return new Error('Renewal was not found.');
      const flow: Partial<Record<RenewalStatus, RenewalStatus>> = { Requested: 'Under Review', 'Under Review': 'Commercial Review', 'Commercial Review': 'Pending Approval' };
      const next = flow[r.status];
      if (!next) return new Error(r.status === 'Pending Approval' ? 'Waiting for approval decisions.' : `${r.status} renewals cannot be advanced.`);
      const c = this.store.contract(r.contractId)!;
      if (next === 'Pending Approval') {
        const levels = this.store.contractLevels({ ...c, commercial: { ...c.commercial, value: r.value }, period: { ...c.period, startDate: r.startDate, endDate: r.endDate } });
        this.store.createApprovalRoute(c, 'Renewal', r.id, levels);
      }
      this.store.db.renewals = this.store.db.renewals.map((x) => (x.id === id ? { ...x, status: next } : x));
      this.store.log('Submitted for Review', 'Renewal', id, c.id, `Renewal ${r.number}: ${r.status} → ${next}.`, r.status, next);
      return undefined;
    });
  }

  complete(id: string): Observable<Contract> {
    return mutate(() => {
      const r = this.store.db.renewals.find((x) => x.id === id);
      if (!r) return new Error('Renewal was not found.');
      if (r.status !== 'Approved') return new Error('Only approved renewals can be completed.');
      const c = this.store.contract(r.contractId)!;
      if (r.type === 'Extension') {
        const next: Contract = { ...c, version: nextMinor(c.version), period: { ...c.period, endDate: r.endDate, renewalDate: addDays(r.endDate, -60) }, commercial: { ...c.commercial, value: c.commercial.value + r.value }, status: c.status === 'Expired' ? 'Active' : c.status };
        this.store.replace(next);
        this.store.addVersion(next, `Extension ${r.number} to ${r.endDate}`, 'Executed');
        this.store.db.renewals = this.store.db.renewals.map((x) => (x.id === id ? { ...x, status: 'Completed', newContractId: c.id } : x));
        this.store.log('Renewed', 'Renewal', id, c.id, `Contract extended to ${r.endDate}.`, c.period.endDate, r.endDate, r.number);
        return next;
      }
      const base = c.number.replace(/-R\d+$/, '');
      let n = 1;
      while (this.store.db.contracts.some((x) => x.number === `${base}-R${n}`)) n++;
      const number = `${base}-R${n}`;
      const renewed: Contract = {
        ...c, id: number, number, version: nextMajor(c.version), status: 'Approved', previousContractId: c.id, approvalStatus: 'Approved', signatureStatus: 'Not Sent', executionDate: null, activatedAt: null, suspendedReason: null,
        period: { ...c.period, effectiveDate: r.startDate, startDate: r.startDate, endDate: r.endDate, renewalDate: addDays(r.endDate, -60), renewalTermMonths: r.termMonths },
        commercial: { ...c.commercial, value: r.value, paymentTermsId: r.revisedPaymentTerms ?? c.commercial.paymentTermsId },
        scopeInfo: { ...c.scopeInfo, slaId: r.revisedSla ?? c.scopeInfo.slaId },
        financial: { ...c.financial, estimatedRevenue: r.value, estimatedCost: Math.round(r.value * (c.financial.estimatedCost / Math.max(1, c.financial.estimatedRevenue))) },
        tracking: { billed: 0, collected: 0, recognizedRevenue: 0, actualCost: 0, additionalCharges: 0, slaBreaches: 0 },
        ...this.store.audit(),
      };
      this.store.db.contracts = [renewed, ...this.store.db.contracts];
      this.store.addVersion(renewed, `Renewed contract (from ${c.number}, ${r.type})`, 'Not Executed');
      this.store.db.renewals = this.store.db.renewals.map((x) => (x.id === id ? { ...x, status: 'Completed', newContractId: number } : x));
      this.store.log('Renewed', 'Renewal', id, c.id, `Renewal ${r.number} completed — new contract period ${number} created (linked to ${c.number}).`, c.period.endDate, r.endDate, number);
      this.store.log('Contract Created', 'Contract', number, number, `Renewal of ${c.number} — approved, ready for signature.`, null, renewed.title, r.number);
      if (!renewed.signatureRequired) this.ops.activate(renewed, 'Renewed contract activated.');
      return renewed;
    });
  }

  cancel(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const r = this.store.db.renewals.find((x) => x.id === id);
      if (!r) return new Error('Renewal was not found.');
      if (r.status === 'Completed' || r.status === 'Cancelled') return new Error(`${r.status} renewals cannot be cancelled.`);
      this.store.db.renewals = this.store.db.renewals.map((x) => (x.id === id ? { ...x, status: 'Cancelled', reason: `${x.reason} — Cancelled: ${reason}` } : x));
      this.store.db.approvals = this.store.db.approvals.map((s) => (s.subjectId === id && (s.status === 'Pending' || s.status === 'Waiting') ? { ...s, status: 'Cancelled' } : s));
      this.store.log('Cancelled', 'Renewal', id, r.contractId, `Renewal ${r.number} cancelled. ${reason}`.trim(), r.status, 'Cancelled');
      return undefined;
    });
  }
}

@Injectable()
export class MockTerminationApi extends TerminationApi {
  private readonly store = inject(MockContractStore);

  list(contractId?: string): Observable<TerminationListItem[]> {
    return query(() =>
      this.store.db.terminations
        .filter((t) => !contractId || t.contractId === contractId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((t) => {
          const c = this.store.contract(t.contractId);
          return { ...t, contractNumber: c?.number ?? t.contractId, contractTitle: c?.title ?? '', customerName: this.store.customerName(c?.parties.customerId) ?? c?.parties.vendorPartner ?? null, currency: c?.commercial.currency ?? 'SAR' };
        }),
    );
  }

  create(input: TerminationInput): Observable<Termination> {
    return mutate(() => {
      const c = this.store.contract(input.contractId);
      if (!c) return new Error('Contract was not found.');
      if (!allowed('terminate', this.store.effectiveStatus(c))) return new Error(`${this.store.effectiveStatus(c)} contracts cannot be terminated.`);
      if (this.store.db.terminations.some((t) => t.contractId === c.id && !['Closed', 'Rejected', 'Cancelled'].includes(t.status))) return new Error('A termination is already in progress for this contract.');
      if (!input.reason.trim()) return new Error('A termination reason is required.');
      const n = Math.max(0, ...this.store.db.terminations.map((t) => Number(t.number.slice(4)) || 0)) + 1;
      const open = this.store.db.obligations.filter((o) => o.contractId === c.id && ['Pending', 'In Progress'].includes(o.status)).length;
      const t: Termination = { ...input, id: `TRM-${pad(n, 5)}`, number: `TRM-${pad(n, 5)}`, status: 'Requested', approvedBy: null, outstandingObligations: open, ...this.store.audit() };
      this.store.db.terminations = [t, ...this.store.db.terminations];
      this.store.log('Contract Updated', 'Termination', t.id, c.id, `${t.type} requested effective ${t.terminationDate}.`, null, 'Requested');
      return t;
    });
  }

  advance(id: string): Observable<void> {
    return mutate(() => {
      const t = this.store.db.terminations.find((x) => x.id === id);
      if (!t) return new Error('Termination was not found.');
      const index = TERMINATION_FLOW.indexOf(t.status);
      if (index < 0 || index === TERMINATION_FLOW.length - 1) return new Error(`${t.status} terminations cannot be advanced.`);
      const next = TERMINATION_FLOW[index + 1];
      const c = this.store.contract(t.contractId)!;
      this.store.db.terminations = this.store.db.terminations.map((x) => (x.id === id ? { ...x, status: next, approvedBy: next === 'Approved' ? this.store.user : x.approvedBy } : x));
      if (next === 'Closed') {
        // History is preserved: open items are cancelled, never deleted.
        this.store.db.obligations = this.store.db.obligations.map((o) => (o.contractId === c.id && ['Pending', 'In Progress'].includes(o.status) ? { ...o, status: 'Cancelled', notes: `Cancelled on termination ${t.number}` } : o));
        this.store.db.amendments = this.store.db.amendments.map((a) => (a.contractId === c.id && !['Executed', 'Rejected', 'Cancelled'].includes(a.status) ? { ...a, status: 'Cancelled' } : a));
        this.store.db.renewals = this.store.db.renewals.map((r) => (r.contractId === c.id && !['Completed', 'Rejected', 'Cancelled'].includes(r.status) ? { ...r, status: 'Cancelled' } : r));
        this.store.replace({ ...c, status: 'Terminated', updatedAt: this.store.now(), updatedBy: this.store.user });
        this.store.log('Terminated', 'Termination', id, c.id, `${t.type} closed — contract terminated; history preserved.`, this.store.effectiveStatus(c), 'Terminated', t.number);
      } else {
        this.store.log('Contract Updated', 'Termination', id, c.id, `Termination ${t.number}: ${t.status} → ${next}.`, t.status, next);
      }
      return undefined;
    });
  }

  reject(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const t = this.store.db.terminations.find((x) => x.id === id);
      if (!t) return new Error('Termination was not found.');
      if (!['Requested', 'Under Review'].includes(t.status)) return new Error('Only requested or under-review terminations can be rejected.');
      this.store.db.terminations = this.store.db.terminations.map((x) => (x.id === id ? { ...x, status: 'Rejected', notes: reason } : x));
      this.store.log('Rejected', 'Termination', id, t.contractId, `Termination ${t.number} rejected. ${reason}`.trim(), t.status, 'Rejected');
      return undefined;
    });
  }
}

@Injectable()
export class MockContractHistoryApi extends ContractHistoryApi {
  private readonly store = inject(MockContractStore);

  list(filter: HistoryFilter = {}): Observable<ContractHistoryEvent[]> {
    return query(() => this.store.db.history.filter((h) => (!filter.contractId || h.contractId === filter.contractId) && (!filter.entity || h.entity === filter.entity)));
  }
}

@Injectable()
export class MockContractReferenceApi extends ContractReferenceApi {
  private readonly store = inject(MockContractStore);

  get(): Observable<ContractReferenceData> {
    return defer(() => respond(this.store.db.reference, 150));
  }
}
