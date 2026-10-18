import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { MaintenancePlan, PlanUpsert } from '../../models/plan.model';
import { MeterApi, PlanApi, ScheduleApi } from '../pm.api';
import { addDays, planDates, today } from '../pm-recurrence';
import { providePmData } from '../provide-pm-data';
import { MockPmStore } from './mock-pm-store';
import { effectiveStatus } from './pm-engine';

describe('Preventive Maintenance mock data layer', { timeout: 30_000 }, () => {
  let store: MockPmStore;
  let plans: PlanApi;
  let schedule: ScheduleApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: providePmData() });
    store = TestBed.inject(MockPmStore);
    plans = TestBed.inject(PlanApi);
    schedule = TestBed.inject(ScheduleApi);
  });

  const upsert = (p: MaintenancePlan): PlanUpsert => {
    const { id: _i, number: _n, status: _s, approval: _a, version: _v, documents: _d, createdAt: _c, createdBy: _b, updatedAt: _u, updatedBy: _y, ...rest } = p;
    void [_i, _n, _s, _a, _v, _d, _c, _b, _u, _y];
    return rest;
  };
  const activeTimePlan = () => store.db.plans.find((p) => p.status === 'Active' && p.strategy.strategy === 'Time-Based')!;

  it('calculates recurrence dates with calendar rules and weekend handling', () => {
    const p = { ...activeTimePlan(), strategy: { ...activeTimePlan().strategy, strategy: 'Calendar-Based' as const }, frequency: { ...activeTimePlan().frequency, type: 'Monthly' as const, calendarRule: 'Specific Week of Month' as const, weekOfMonth: 2, dayOfWeek: 2, startDate: '2026-01-01', endDate: null } };
    const dates = planDates(p, '2026-01-01', '2026-03-31', []);
    expect(dates.map((d) => d.ruleDate)).toEqual(['2026-01-13', '2026-02-10', '2026-03-10']);
    const eom = planDates({ ...p, frequency: { ...p.frequency, calendarRule: 'End of Month' } }, '2026-01-01', '2026-02-28', []);
    // 31 Jan 2026 is a Saturday → moved to Sunday 1 Feb.
    expect(eom[0]).toEqual({ ruleDate: '2026-01-31', scheduledDate: '2026-02-01' });
  });

  it('seeds plans with history, automation and no duplicate events', () => {
    expect(store.db.plans.length).toBeGreaterThan(8);
    store.monitor();
    const keys = store.db.occurrences.filter((o) => o.status !== 'Cancelled').map((o) => `${o.planId}|${o.assetId}|${o.originalDate}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(store.db.workOrders.some((w) => w.kind === 'Corrective')).toBe(true);
  });

  it('generates without duplicates and only for active plans', async () => {
    const p = activeTimePlan();
    expect(await firstValueFrom(schedule.generate(p.id))).toBe(0);
    await firstValueFrom(plans.suspend(p.id, 'Test'));
    await expect(firstValueFrom(schedule.generate(p.id))).rejects.toThrow(/Only active/);
  });

  it('preserves the original date and the overdue condition when rescheduling', async () => {
    store.monitor();
    const o = store.db.occurrences.find((x) => effectiveStatus(x) === 'Overdue' && x.technician)!;
    const original = o.originalDate;
    let to = addDays(today(), 2);
    while ([5, 6].includes(new Date(`${to}T00:00:00Z`).getUTCDay())) to = addDays(to, 1);
    await firstValueFrom(schedule.reschedule(o.id, { toDate: to, toWindow: o.window, reason: 'Parts Unavailable', requestedBy: 'Customer', customerApproval: true, notes: '' }));
    const after = store.occurrence(o.id)!;
    expect(after.originalDate).toBe(original);
    expect(after.reschedules.at(-1)?.fromDate).toBe(o.scheduledDate);
    expect(effectiveStatus(after)).toBe('Overdue');
  });

  it('requires checklist items, consumes parts and calculates the next occurrence on completion', async () => {
    const o = store.db.occurrences.find((x) => ['Assigned', 'Scheduled'].includes(x.status) && x.technician && store.plan(x.planId)?.status === 'Active' && store.plan(x.planId)?.strategy.strategy === 'Time-Based')!;
    const p = store.plan(o.planId)!;
    const checklist = store.db.checklists.find((c) => c.id === p.procedure.checklistId)!;
    const base = { startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), durationMinutes: 60, tasksDone: [], partsUsed: p.parts.required, toolsUsed: '', assetCondition: 'Good', defects: '', correctiveActions: '', recommendations: '', technicianNotes: '', customerNotes: '', customerSignature: true, technicianSignature: true, photos: 0, result: 'Maintenance Completed Successfully' as const };
    await expect(firstValueFrom(schedule.complete(o.id, { ...base, checklist: [] }))).rejects.toThrow(/required/);
    const stock = store.db.parts.find((x) => x.partNumber === p.parts.required[0]?.partNumber)?.stock ?? 0;
    const results = checklist.items.map((i) => ({ itemId: i.id, value: i.type === 'Measurement' || i.type === 'Numeric' ? String(i.min ?? 1) : i.type === 'Pass / Fail' ? 'Pass' : i.type === 'Yes / No' ? 'Yes' : i.type === 'Selection' ? i.options[0] : 'Captured', pass: null }));
    await firstValueFrom(schedule.complete(o.id, { ...base, checklist: results }));
    expect(store.occurrence(o.id)?.status).toBe('Completed');
    if (p.parts.required.length) expect(store.db.parts.find((x) => x.partNumber === p.parts.required[0].partNumber)?.stock).toBe(stock - p.parts.required[0].quantity);
    expect(store.db.history.some((h) => h.action === 'Parts Consumed' || h.action === 'Maintenance Completed')).toBe(true);
  });

  it('creates linked corrective work orders from findings', async () => {
    const o = store.db.occurrences.find((x) => x.status === 'Completed')!;
    const number = await firstValueFrom(schedule.corrective(o.id, { defect: 'Bearing noise', severity: 'High', priority: 'High', recommendedAction: 'Replace bearing', partNumber: 'BRG-6205', skill: '', estimatedCost: 300, targetDate: addDays(today(), 3) }));
    const wo = store.db.workOrders.find((w) => w.number === number)!;
    expect(wo.kind).toBe('Corrective');
    expect(wo.occurrenceId).toBe(o.id);
    expect(store.occurrence(o.id)?.correctiveWorkOrderIds).toContain(wo.id);
  });

  it('triggers meter-based maintenance at the threshold', async () => {
    const meters = TestBed.inject(MeterApi);
    const m = store.db.meters.find((x) => x.kind === 'Meter')!;
    const current = m.readings.at(-1)!.value;
    const triggered = await firstValueFrom(meters.record(m.id, Math.max(current, m.lastTriggerReading + m.interval) + 1));
    expect(triggered).toBeTruthy();
    expect(store.db.occurrences.find((o) => o.number === triggered)?.generatedBy).toContain(m.number);
    await expect(firstValueFrom(meters.record(m.id, 1))).rejects.toThrow(/cannot decrease/);
  });

  it('versions frequency changes and recalculates only future events', async () => {
    const p = activeTimePlan();
    const completedBefore = store.db.occurrences.filter((o) => o.planId === p.id && o.status === 'Completed').map((o) => o.scheduledDate);
    const type = p.frequency.type === 'Monthly' ? 'Bi-Weekly' : 'Monthly';
    await firstValueFrom(plans.update(p.id, { ...upsert(p), frequency: { ...p.frequency, type, effectiveDate: today() } }, 'Frequency changed'));
    expect(store.plan(p.id)?.version).not.toBe(p.version);
    expect(store.db.occurrences.filter((o) => o.planId === p.id && o.status === 'Completed').map((o) => o.scheduledDate)).toEqual(completedBefore);
    expect(store.db.occurrences.some((o) => o.planId === p.id && o.cancelReason?.startsWith('Superseded'))).toBe(true);
  });
});
