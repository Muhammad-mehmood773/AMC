import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { SlaCalendar } from '../../models/operations.model';
import type { Sla, SlaUpsert } from '../../models/sla.model';
import { provideSlaData } from '../provide-sla-data';
import { SlaApi, SlaBreachApi, SlaClockApi, SlaMappingApi } from '../sla.api';
import { addBusinessMinutes, businessMinutes, elapsedMinutes } from '../sla-time';
import { MockSlaStore } from './mock-sla-store';
import { clockMetrics, slaStatus } from './sla-engine';

const BH: SlaCalendar = {
  id: 'T', name: 'Test BH', type: 'Business Hours', timeZone: 'UTC', breakStart: null, breakEnd: null, weekendRules: '', holidayCalendar: 'X', effectiveDate: '2024-01-01', status: 'Active', customerId: null,
  days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ working: d >= 1 && d <= 5, start: '09:00', end: '17:00' })),
};

describe('SLA Management mock data layer', { timeout: 30_000 }, () => {
  let store: MockSlaStore;
  let slas: SlaApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideSlaData() });
    store = TestBed.inject(MockSlaStore);
    slas = TestBed.inject(SlaApi);
  });

  function terms(s: Sla): SlaUpsert {
    const { id: _i, createdAt: _a, createdBy: _b, updatedAt: _c, updatedBy: _d, status: _e, approval: _f, version: _g, previousSlaId: _h, documents: _j, ...rest } = s;
    void [_i, _a, _b, _c, _d, _e, _f, _g, _h, _j];
    return rest;
  }

  it('calculates business time with working hours, weekends and holidays', () => {
    // Friday 16:00 → Monday 10:00 UTC = 1h Friday + 1h Monday.
    expect(businessMinutes(BH, [], '2026-01-02T16:00:00Z', '2026-01-05T10:00:00Z')).toBe(120);
    expect(new Date(addBusinessMinutes(BH, [], '2026-01-02T16:00:00Z', 120)).toISOString()).toBe('2026-01-05T10:00:00.000Z');
    const holiday = [{ id: 'h', name: 'H', date: '2026-01-05', type: 'Public Holiday', country: '', region: '', siteId: null, calendar: 'X', working: false, overrideAllowed: false }];
    expect(businessMinutes(BH, holiday, '2026-01-02T16:00:00Z', '2026-01-06T10:00:00Z')).toBe(120);
    const { elapsed, paused } = elapsedMinutes(BH, [], '2026-01-05T09:00:00Z', '2026-01-05T17:00:00Z', [{ id: 'p', reason: 'Waiting for Parts', requestedBy: '', approvedBy: '', startedAt: '2026-01-05T10:00:00Z', endedAt: '2026-01-05T12:00:00Z', resumeReason: '', notes: '' }]);
    expect(elapsed).toBe(360);
    expect(paused).toBe(120);
  });

  it('seeds SLAs, clocks and automatically detected breaches', () => {
    expect(store.db.slas.length).toBeGreaterThan(8);
    expect(store.db.clocks.length).toBeGreaterThan(10);
    for (const b of store.db.breaches) {
      const c = store.db.clocks.find((x) => x.id === b.clockId)!;
      expect(clockMetrics(store.db, c).consumption).toBeGreaterThanOrEqual(100);
    }
  });

  it('enforces unique numbers, valid types and targets before activation', async () => {
    const plt = store.sla('SLA-PLT')!;
    await expect(firstValueFrom(slas.create(terms(plt)))).rejects.toThrow(/already in use/);
    await expect(firstValueFrom(slas.create({ ...terms(plt), number: 'SLA-900', type: 'Nonsense' }))).rejects.toThrow(/valid SLA type/);
    const draft = await firstValueFrom(slas.create({ ...terms(plt), number: 'SLA-901', customer: { ...plt.customer, customerId: null }, priorityTargets: { ...plt.priorityTargets, Low: { response: 0, resolution: 0 } }, commercial: { ...plt.commercial, penaltyApplicable: false, serviceCreditApplicable: false } }));
    await expect(firstValueFrom(slas.activate(draft.id))).rejects.toThrow(/targets must be defined/);
  });

  it('selects the most specific active SLA and never assigns suspended or expired SLAs', async () => {
    const mapping = TestBed.inject(SlaMappingApi);
    const amcSla = store.db.slas.find((s) => s.type === 'AMC SLA' && slaStatus(s) === 'Active')!;
    const amc = store.db.reference.amcs.find((a) => a.id === amcSla.contract.amcId)!;
    const sel = await firstValueFrom(mapping.resolve({ customerId: amc.customerId, contractId: amc.contractId, amcId: amc.id, siteId: amc.siteIds[0], assetId: null, serviceId: null, priority: 'High', requestType: null, date: new Date().toISOString() }));
    expect(sel.result).toBe('SLA Applied');
    expect(sel.slaId).toBe(amcSla.id);
    expect(sel.candidates.length).toBeGreaterThan(1);
    await firstValueFrom(slas.suspend(amcSla.id, 'Review'));
    const after = await firstValueFrom(mapping.resolve(sel.request));
    expect(after.slaId).not.toBe(amcSla.id);
  });

  it('starts clocks, excludes pauses and records met / breached on stop', async () => {
    const clocks = TestBed.inject(SlaClockApi);
    const customer = store.db.reference.customers.find((c) => c.defaultSlaId === 'SLA-PLT' && store.db.reference.sites.some((s) => s.customerId === c.id))!;
    const site = store.db.reference.sites.find((s) => s.customerId === customer.id)!;
    const started = await firstValueFrom(clocks.start({ request: { customerId: customer.id, contractId: null, amcId: null, siteId: site.id, assetId: null, serviceId: null, priority: 'Medium', requestType: 'Breakdown', date: new Date().toISOString() }, transactionType: 'Service Request', subject: 'Test' }));
    expect(started.map((c) => c.targetType)).toEqual(['First Response', 'Resolution']);
    const resolution = started[1];
    await firstValueFrom(clocks.pause(resolution.id, 'Waiting for Parts', 'test'));
    expect(store.db.clocks.find((c) => c.id === resolution.id)?.status).toBe('Paused');
    await firstValueFrom(clocks.resume(resolution.id, 'Parts arrived'));
    await firstValueFrom(clocks.stop(started[0].id));
    expect(store.db.clocks.find((c) => c.id === started[0].id)?.status).toBe('Met');
    expect(store.db.history.some((h) => h.action === 'SLA Paused')).toBe(true);
  });

  it('keeps historical targets when an SLA is modified', async () => {
    const clock = store.db.clocks.find((c) => c.slaId === 'SLA-SLV')!;
    const before = clock.targetMinutes;
    const s = store.sla('SLA-SLV')!;
    await firstValueFrom(slas.update(s.id, { ...terms(s), priorityTargets: { ...s.priorityTargets, [clock.priority]: { response: 1, resolution: 2 } } }, 'Tighter'));
    expect(store.db.clocks.find((c) => c.id === clock.id)?.targetMinutes).toBe(before);
    expect(store.db.versions.filter((v) => v.slaId === s.id).length).toBeGreaterThan(1);
  });

  it('runs the breach workflow with authorized waivers', async () => {
    const api = TestBed.inject(SlaBreachApi);
    const b = store.db.breaches.find((x) => x.status === 'Detected')!;
    await expect(firstValueFrom(api.close(b.id))).rejects.toThrow(/root cause/);
    await firstValueFrom(api.acknowledge(b.id));
    await firstValueFrom(api.update(b.id, { reason: 'Technician Delay', rootCause: 'Traffic' }));
    await firstValueFrom(api.requestWaiver(b.id, 'Customer delay'));
    await firstValueFrom(api.approveWaiver(b.id, true));
    expect(store.db.breaches.find((x) => x.id === b.id)?.status).toBe('Waived');
    expect(store.db.breaches.find((x) => x.id === b.id)?.penalty).toBe(0);
  });

  it('renews an SLA as a new version linked to the previous one', async () => {
    const s = store.sla('SLA-BRZ')!;
    const renewed = await firstValueFrom(slas.renew(s.id, { termMonths: 12, revisedValue: 70_000, revisedTargets: s.priorityTargets, revisedCalendarId: 'CAL-KSA-BH', revisedEscalation: '', revisedCoverage: '', revisedCommercial: '' }));
    expect(renewed.previousSlaId).toBe(s.id);
    await firstValueFrom(slas.activate(renewed.id));
    if (renewed.validity.effectiveDate <= new Date().toISOString().slice(0, 10)) {
      expect(store.sla(s.id)?.status).toBe('Renewed');
      expect(store.db.mappings.some((m) => m.slaId === renewed.id)).toBe(true);
    }
  });
});
