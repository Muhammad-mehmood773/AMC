import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { Amc, AmcUpsert } from '../../models/amc.model';
import { AmcApi, BillingApi, CoverageApi, ScheduleApi, VisitApi } from '../amc.api';
import { AMC_RULES } from '../amc.config';
import { provideAmcData } from '../provide-amc-data';
import { addDays, nextWorkingDay, today } from './amc-seed';
import { MockAmcStore } from './mock-amc-store';

describe('AMC / Service Contract Management mock data layer', { timeout: 30_000 }, () => {
  let store: MockAmcStore;
  let amcs: AmcApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideAmcData() });
    store = TestBed.inject(MockAmcStore);
    amcs = TestBed.inject(AmcApi);
  });

  const live = () => store.db.amcs.find((a) => store.effectiveStatus(a) === 'Active' && a.scope.assetIds.length > 1 && store.consumption(a).remainingVisits > 0)!;

  function terms(a: Amc): AmcUpsert {
    const { id: _i, createdAt: _ca, createdBy: _cb, updatedAt: _ua, updatedBy: _ub, status: _s, approval: _ap, version: _v, previousAmcId: _p, suspension: _su, activatedAt: _ac, ...rest } = a;
    void [_i, _ca, _cb, _ua, _ub, _s, _ap, _v, _p, _su, _ac];
    return rest;
  }

  it('seeds AMCs linked to the commercial contracts', () => {
    expect(store.db.amcs.length).toBeGreaterThan(5);
    expect(store.db.amcs.every((a) => store.db.reference.contracts.some((c) => c.id === a.parentContractId))).toBe(true);
    expect(store.db.events.length).toBeGreaterThan(0);
    expect(store.db.billing.length).toBeGreaterThan(0);
  });

  it('enforces customer, dates and scope ownership', async () => {
    const a = live();
    await expect(firstValueFrom(amcs.create(terms(a)))).rejects.toThrow(/already in use/);
    const other = store.db.reference.sites.find((s) => s.customerId !== a.customer.customerId)!;
    await expect(firstValueFrom(amcs.create({ ...terms(a), number: 'AMC-99001', scope: { ...a.scope, siteIds: [...a.scope.siteIds, other.id] } }))).rejects.toThrow(/belong to the customer/);
    await expect(firstValueFrom(amcs.create({ ...terms(a), number: 'AMC-99002', period: { ...a.period, endDate: '2000-01-01' } }))).rejects.toThrow(/end date/);
  });

  it('requires approval above the auto-approval limit before activation', async () => {
    const a = live();
    const draft = await firstValueFrom(amcs.create({ ...terms(a), number: 'AMC-99010', commercial: { ...a.commercial, value: AMC_RULES.autoApprovalLimit + 1 }, period: { ...a.period, startDate: today(), endDate: addDays(today(), 365) } }));
    await expect(firstValueFrom(amcs.activate(draft.id))).rejects.toThrow(/approvals/);
    await firstValueFrom(amcs.submitForApproval(draft.id));
    await firstValueFrom(amcs.decide(draft.id, true, 'ok'));
    const active = await firstValueFrom(amcs.activate(draft.id));
    expect(active.status).toBe('Active');
    expect(store.db.events.some((e) => e.amcId === draft.id)).toBe(true);
  });

  it('skips non-working days when generating schedules', () => {
    const generated = store.db.events.filter((e) => e.id.startsWith('PM-N') || e.status === 'Planned');
    for (const e of generated) {
      expect(AMC_RULES.nonWorkingDays.includes(new Date(`${e.scheduledDate}T00:00:00Z`).getUTCDay())).toBe(false);
    }
    expect(nextWorkingDay('2026-10-16')).not.toBe('2026-10-16');
  });

  it('consumes included visits automatically on completion', async () => {
    const a = live();
    const visits = TestBed.inject(VisitApi);
    const before = store.consumption(a).usedVisits;
    const asset = store.db.reference.assets.find((x) => x.id === a.scope.assetIds[0])!;
    const tech = store.db.reference.technicians.find((t) => t.region === store.db.reference.sites.find((s) => s.id === asset.siteId)?.region)!;
    await firstValueFrom(visits.create({ amcId: a.id, siteId: asset.siteId, assetIds: [asset.id], serviceId: a.scope.serviceIds[0] ?? null, plannedDate: today(), window: '24/7', type: 'Breakdown', team: 'HVAC Team', technician: tech.name }));
    const v = store.db.visits[store.db.visits.length - 1];
    await firstValueFrom(visits.start(v.id));
    await firstValueFrom(visits.complete(v.id, { hours: 3, partsValue: 0, consumablesValue: 0, firstTimeFix: true, report: 'Fixed' }));
    expect(store.consumption(store.amc(a.id)!).usedVisits).toBe(before + 1);
    expect(store.db.history[0].action).toBe('Entitlement Consumed');
  });

  it('blocks out-of-scope assets and wrong-territory technicians', async () => {
    const a = live();
    const visits = TestBed.inject(VisitApi);
    const outside = store.db.reference.assets.find((x) => x.customerId === a.customer.customerId && !a.scope.assetIds.includes(x.id) && a.scope.siteIds.includes(x.siteId));
    if (outside) await expect(firstValueFrom(visits.create({ amcId: a.id, siteId: outside.siteId, assetIds: [outside.id], serviceId: null, plannedDate: today(), window: '24/7', type: 'Breakdown', team: 'HVAC Team', technician: null }))).rejects.toThrow(/coverage scope/);
    const siteRegion = store.db.reference.sites.find((s) => s.id === a.scope.siteIds[0])!.region;
    const wrong = store.db.reference.technicians.find((t) => t.region !== siteRegion)!;
    await expect(firstValueFrom(visits.create({ amcId: a.id, siteId: a.scope.siteIds[0], assetIds: [], serviceId: null, plannedDate: today(), window: '24/7', type: 'Inspection', team: 'HVAC Team', technician: wrong.name }))).rejects.toThrow(/territory/);
  });

  it('validates coverage per SRS 6.20', async () => {
    const a = live();
    const coverage = TestBed.inject(CoverageApi);
    const asset = store.db.reference.assets.find((x) => x.id === a.scope.assetIds[0])!;
    const ok = await firstValueFrom(coverage.validate({ customerId: a.customer.customerId, amcId: a.id, siteId: asset.siteId, assetId: asset.id, serviceId: a.scope.serviceIds[0] ?? null, date: today(), needsParts: false, partsValue: 0 }));
    expect(['Fully Covered', 'Partially Covered']).toContain(ok.result);
    const other = store.db.reference.sites.find((s) => s.customerId === a.customer.customerId && !a.scope.siteIds.includes(s.id));
    if (other) expect((await firstValueFrom(coverage.validate({ customerId: a.customer.customerId, amcId: a.id, siteId: other.id, assetId: null, serviceId: null, date: today(), needsParts: false, partsValue: 0 }))).result).toBe('Site Not Covered');
    expect((await firstValueFrom(coverage.validate({ customerId: a.customer.customerId, amcId: a.id, siteId: null, assetId: null, serviceId: null, date: addDays(a.period.endDate, 10), needsParts: false, partsValue: 0 }))).result).toBe('Coverage Expired');
  });

  it('suspension blocks new services and holds billing; resume releases them', async () => {
    const a = live();
    await firstValueFrom(amcs.suspend(a.id, { reason: 'Payment overdue', requestedBy: 'Finance', periodDays: 30, pauseMaintenance: true, pauseBilling: true, notes: '' }));
    await expect(firstValueFrom(TestBed.inject(ScheduleApi).generate(a.id))).rejects.toThrow(/suspended/);
    const planned = store.db.billing.find((b) => b.amcId === a.id && b.status === 'Planned');
    if (planned) await expect(firstValueFrom(TestBed.inject(BillingApi).advance(planned.id))).rejects.toThrow(/on hold/);
    await firstValueFrom(amcs.resume(a.id));
    expect(store.amc(a.id)?.status).toBe('Active');
  });

  it('terminates while preserving history and renews with a link to the previous AMC', async () => {
    const [first, second] = store.db.amcs.filter((a) => store.effectiveStatus(a) === 'Active');
    const historyBefore = store.db.events.filter((e) => e.amcId === first.id && e.status === 'Completed').length;
    await firstValueFrom(amcs.terminate(first.id, { type: 'Mutual Termination', terminationDate: today(), requestedBy: 'Customer', reason: 'Closure', noticePeriodDays: 30, finalServiceDate: today(), settlementStatus: 'Pending', documents: [], notes: '' }));
    expect(store.amc(first.id)?.status).toBe('Terminated');
    expect(store.db.events.filter((e) => e.amcId === first.id && e.status === 'Completed').length).toBe(historyBefore);
    const renewed = await firstValueFrom(amcs.renew(second.id, { termMonths: 12, revisedValue: 50_000, revisedAssetIds: [], revisedServiceIds: [], scopeNotes: '' }));
    expect(renewed.previousAmcId).toBe(second.id);
    await firstValueFrom(amcs.activate(renewed.id));
    if (renewed.period.startDate <= today()) expect(store.amc(second.id)?.status).toBe('Renewed');
  });
});
