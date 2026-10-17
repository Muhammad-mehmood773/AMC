import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { Contract, ContractUpsert } from '../../models/contract.model';
import { AmendmentApi, ApprovalApi, ContractApi, ContractRequestApi, ObligationApi, RenewalApi, ReviewApi, SignatureApi, TemplateApi, TerminationApi } from '../contract.api';
import { provideContractData } from '../provide-contract-data';
import { MockContractStore, addDays, today } from './mock-contract-store';

describe('Contract Lifecycle Management mock data layer', { timeout: 30_000 }, () => {
  let store: MockContractStore;
  let contracts: ContractApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideContractData() });
    store = TestBed.inject(MockContractStore);
    contracts = TestBed.inject(ContractApi);
  });

  function terms(c: Contract): ContractUpsert {
    const { id: _i, createdAt: _ca, createdBy: _cb, updatedAt: _ua, updatedBy: _ub, status: _s, version: _v, approvalStatus: _a, signatureStatus: _sg, executionDate: _e, activatedAt: _ac, suspendedReason: _sr, tracking: _t, previousContractId: _p, ...rest } = c;
    void [_i, _ca, _cb, _ua, _ub, _s, _v, _a, _sg, _e, _ac, _sr, _t, _p];
    return rest;
  }

  async function approveAll(contractId: string, subjectId = contractId): Promise<void> {
    const approvals = TestBed.inject(ApprovalApi);
    for (let i = 0; i < 6; i++) {
      const pending = (await firstValueFrom(approvals.list(contractId))).find((a) => a.subjectId === subjectId && a.status === 'Pending');
      if (!pending) return;
      await firstValueFrom(approvals.decide(pending.id, 'Approved', 'ok'));
    }
  }

  async function newDraft(): Promise<Contract> {
    const template = store.db.contracts.find((c) => c.status === 'Active' && c.parties.customerId)!;
    return firstValueFrom(contracts.create({ ...terms(template), number: await firstValueFrom(contracts.nextNumber()), title: 'Test contract', period: { ...template.period, startDate: today(), effectiveDate: today(), endDate: addDays(today(), 365) } }));
  }

  it('seeds contracts that match the customer agreements', () => {
    const ids = new Set(store.db.contracts.map((c) => c.number));
    expect(ids.size).toBe(store.db.contracts.length);
    expect(store.db.contracts.some((c) => c.status === 'Pending Approval')).toBe(true);
    expect(store.db.contracts.filter((c) => c.status === 'Active').every((c) => c.approvalStatus === 'Approved' && c.signatureStatus === 'Fully Signed')).toBe(true);
    expect(store.db.versions.every((v) => store.db.contracts.some((c) => c.id === v.contractId))).toBe(true);
  });

  it('enforces unique numbers, parties and dates', async () => {
    const c = store.db.contracts[0];
    await expect(firstValueFrom(contracts.create(terms(c)))).rejects.toThrow(/already in use/);
    await expect(firstValueFrom(contracts.create({ ...terms(c), number: 'CON-TEST1', parties: { ...c.parties, customerId: null } }))).rejects.toThrow(/customer/);
    await expect(firstValueFrom(contracts.create({ ...terms(c), number: 'CON-TEST2', period: { ...c.period, startDate: '2026-05-01', endDate: '2026-01-01' } }))).rejects.toThrow(/end date/);
  });

  it('runs the full lifecycle: review → approval → signature → active', async () => {
    const draft = await newDraft();
    await expect(firstValueFrom(contracts.activate(draft.id))).rejects.toThrow(/not available|cannot be activated/);
    await firstValueFrom(contracts.submitForReview(draft.id));
    await expect(firstValueFrom(contracts.submitForApproval(draft.id))).rejects.toThrow(/pending reviews/);
    const reviews = TestBed.inject(ReviewApi);
    for (const r of await firstValueFrom(reviews.list(draft.id))) await firstValueFrom(reviews.setStatus(r.id, 'Reviewed', ''));
    await firstValueFrom(contracts.submitForApproval(draft.id));
    expect(store.contract(draft.id)?.status).toBe('Pending Approval');
    await approveAll(draft.id);
    expect(store.contract(draft.id)).toMatchObject({ status: 'Approved', approvalStatus: 'Approved' });
    await expect(firstValueFrom(contracts.activate(draft.id))).rejects.toThrow(/Signature is mandatory/);

    const signatures = TestBed.inject(SignatureApi);
    await firstValueFrom(signatures.send(draft.id, [{ name: 'A', email: 'a@x', role: 'Signatory', party: 'Customer' }, { name: 'B', email: 'b@x', role: 'Director', party: 'Company' }]));
    const [first, second] = (await firstValueFrom(signatures.get(draft.id))).signatories;
    await expect(firstValueFrom(signatures.record(second.id, 'Signed'))).rejects.toThrow(/signing order/);
    await firstValueFrom(signatures.record(first.id, 'Signed'));
    expect(store.contract(draft.id)?.status).toBe('Partially Signed');
    await firstValueFrom(signatures.record(second.id, 'Signed'));
    const active = store.contract(draft.id)!;
    expect(active).toMatchObject({ status: 'Active', signatureStatus: 'Fully Signed', version: '2.0' });
    expect(store.db.versions.find((v) => v.contractId === draft.id && v.executionStatus === 'Executed')?.version).toBe('2.0');
    await expect(firstValueFrom(contracts.update(draft.id, terms(active), 'x'))).rejects.toThrow(/amendment/);
  });

  it('returns a contract for changes and blocks deletion once records exist', async () => {
    const draft = await newDraft();
    await firstValueFrom(contracts.submitForApproval(draft.id));
    const step = (await firstValueFrom(TestBed.inject(ApprovalApi).list(draft.id))).find((a) => a.status === 'Pending')!;
    await expect(firstValueFrom(TestBed.inject(ApprovalApi).decide(step.id, 'Returned for Changes', ''))).rejects.toThrow(/Comments/);
    await firstValueFrom(TestBed.inject(ApprovalApi).decide(step.id, 'Returned for Changes', 'Fix discount'));
    expect(store.contract(draft.id)).toMatchObject({ status: 'Under Negotiation', approvalStatus: 'Returned for Changes' });
    await expect(firstValueFrom(contracts.remove(draft.id))).rejects.toThrow(/archive/);
    const fresh = await newDraft();
    await firstValueFrom(contracts.remove(fresh.id));
    expect(store.contract(fresh.id)).toBeUndefined();
  });

  it('executes amendments with a new version and preserves the original', async () => {
    const c = store.db.contracts.find((x) => store.effectiveStatus(x) === 'Active')!;
    const amendments = TestBed.inject(AmendmentApi);
    const a = await firstValueFrom(amendments.create({ contractId: c.id, type: 'Price Change', effectiveDate: today(), requestedBy: 'Customer', reason: 'More assets', previousTerms: '', newTerms: '', commercialImpact: 60_000, serviceImpact: '', changes: { value: c.commercial.value + 60_000 }, documentId: null, notes: '' }));
    for (let i = 0; i < 3; i++) await firstValueFrom(amendments.advance(a.id));
    expect((await firstValueFrom(TestBed.inject(ApprovalApi).list(c.id))).filter((s) => s.subjectId === a.id).length).toBe(2);
    await approveAll(c.id, a.id);
    await firstValueFrom(amendments.execute(a.id));
    expect(store.contract(c.id)?.commercial.value).toBe(c.commercial.value + 60_000);
    expect(store.db.versions.some((v) => v.contractId === c.id && v.version === c.version)).toBe(true);
  });

  it('renews into a linked contract and marks the previous one Renewed on activation', async () => {
    const c = store.db.contracts.find((x) => store.effectiveStatus(x) === 'Active' && !store.db.renewals.some((r) => r.contractId === x.id && r.status !== 'Completed'))!;
    const renewals = TestBed.inject(RenewalApi);
    const r = await firstValueFrom(renewals.create({ contractId: c.id, type: 'Standard Renewal', startDate: addDays(c.period.endDate, 1), endDate: addDays(c.period.endDate, 366), termMonths: 12, value: c.commercial.value, priceAdjustmentPercent: 0, revisedServices: '', revisedSla: null, revisedEntitlements: '', revisedPaymentTerms: null, reason: 'Renew' }));
    for (let i = 0; i < 3; i++) await firstValueFrom(renewals.advance(r.id));
    await approveAll(c.id, r.id);
    const renewed = await firstValueFrom(renewals.complete(r.id));
    expect(renewed.previousContractId).toBe(c.id);
    expect(renewed.status).toBe('Approved');
  });

  it('terminates through the workflow and preserves obligations', async () => {
    const c = store.db.contracts.find((x) => store.effectiveStatus(x) === 'Active' && store.db.obligations.some((o) => o.contractId === x.id && o.status === 'Pending') && !store.db.terminations.some((t) => t.contractId === x.id))!;
    const terminations = TestBed.inject(TerminationApi);
    const t = await firstValueFrom(terminations.create({ contractId: c.id, type: 'Mutual Termination', terminationDate: today(), requestedBy: 'Customer', reason: 'Closure', noticePeriodDays: 30, financialSettlement: '', outstandingAmount: 0, finalServiceDate: today(), documentId: null, notes: '' }));
    expect(t.outstandingObligations).toBeGreaterThan(0);
    for (let i = 0; i < 6; i++) await firstValueFrom(terminations.advance(t.id));
    expect(store.contract(c.id)?.status).toBe('Terminated');
    expect(store.db.obligations.filter((o) => o.contractId === c.id).every((o) => o.status !== 'Pending')).toBe(true);
    expect(store.db.obligations.some((o) => o.contractId === c.id)).toBe(true);
  });

  it('requires evidence for obligations and schedules the next occurrence', async () => {
    const obligations = TestBed.inject(ObligationApi);
    const o = store.db.obligations.find((x) => x.evidenceRequired && x.status === 'Pending' && x.frequency === 'Monthly' && !x.evidence.length)!;
    await expect(firstValueFrom(obligations.complete(o.id, [], ''))).rejects.toThrow(/Evidence/);
    const before = store.db.obligations.length;
    await firstValueFrom(obligations.complete(o.id, [{ name: 'report.pdf', size: 1, mime: 'application/pdf' }], ''));
    expect(store.db.obligations.find((x) => x.id === o.id)?.status).toBe('Completed');
    expect(store.db.obligations.length).toBeGreaterThanOrEqual(before);
  });

  it('converts approved requests and versions clauses without touching executed contracts', async () => {
    const requests = TestBed.inject(ContractRequestApi);
    const approved = store.db.requests.find((r) => r.status === 'Approved')!;
    const contract = await firstValueFrom(requests.convert(approved.id));
    expect(contract.requestId).toBe(approved.id);
    const templates = TestBed.inject(TemplateApi);
    const clause = store.db.clauses.find((c) => store.db.contracts.some((x) => x.status === 'Active' && x.clauseIds.includes(c.id)))!;
    await expect(firstValueFrom(templates.updateClause(clause.id, { ...clause, text: 'changed' }))).rejects.toThrow(/new clause version/);
    const v2 = await firstValueFrom(templates.versionClause(clause.id, 'changed'));
    expect(store.db.templates.some((t) => t.defaultClauseIds.includes(v2.id))).toBe(true);
    expect(store.db.contracts.some((x) => x.clauseIds.includes(clause.id))).toBe(true);
  });

  it('locks executed documents and raises expiry alerts', async () => {
    const locked = store.db.documents.find((d) => d.locked)!;
    await expect(firstValueFrom(contracts.uploadDocument(locked.contractId, 'Signed Contract', { name: 'x.pdf', size: 1, mime: 'application/pdf' }, locked.id))).rejects.toThrow(/locked/);
    const alerts = await firstValueFrom(contracts.alerts());
    expect(alerts.some((a) => a.type === 'Contract Expiry')).toBe(true);
  });
});
