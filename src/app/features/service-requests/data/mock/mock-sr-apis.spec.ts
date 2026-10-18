import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { RequestDraft } from '../../models/request.model';
import { provideSrData } from '../provide-sr-data';
import { RequestApi } from '../sr.api';
import { MockSrStore } from './mock-sr-store';
import { toItem } from './sr-engine';

describe('Service Request mock data layer', { timeout: 30_000 }, () => {
  let store: MockSrStore;
  let api: RequestApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideSrData() });
    store = TestBed.inject(MockSrStore);
    api = TestBed.inject(RequestApi);
  });

  const draft = (over: Partial<RequestDraft> = {}): RequestDraft => {
    const amc = store.db.reference.amcs.find((a) => a.status === 'Active' && a.assetIds.length)!;
    const asset = store.db.reference.assets.find((a) => amc.assetIds.includes(a.id) && !['Retired', 'Decommissioned', 'Inactive'].includes(a.status))!;
    return {
      type: 'Incident / Breakdown', serviceCategory: '', subcategory: '', subject: 'AC not cooling in server room', description: 'Unit running but supply air is warm, room temperature rising fast.', source: 'Phone', requestedDate: null, requestedTime: '', priority: null, customerReference: '',
      customer: { customerId: asset.customerId, contactId: null, contactName: 'Site Engineer', phone: '+966500000000', email: '' }, location: { siteId: asset.siteId, building: '', area: '', accessInstructions: '' }, assetId: asset.id,
      classification: { problemCategory: '', problemCode: '', serviceCode: '', failureType: '', symptom: '', cause: '', requestedServiceId: null, urgency: 'High', businessImpact: 'High', affectedUsers: 20, requiredSkill: '', suggestedBy: null },
      notes: { customer: '', internal: '' }, parentRequestId: null, ...over,
    };
  };

  it('seeds requests with Customer 360 numbers, SLA targets and coverage', () => {
    expect(store.db.requests.length).toBeGreaterThan(20);
    expect(store.db.requests.some((r) => r.sla.slaId)).toBe(true);
    expect(store.db.requests.some((r) => r.origin.process === 'PM Plan' && r.origin.planId)).toBe(true);
    expect(new Set(store.db.requests.map((r) => r.number)).size).toBe(store.db.requests.length);
  });

  it('validates customer / site / asset and description', async () => {
    await expect(firstValueFrom(api.create(draft({ customer: { customerId: '', contactId: null, contactName: '', phone: '1', email: '' } }), 'continue', null))).rejects.toThrow(/Customer is mandatory/);
    const other = store.db.reference.sites.find((s) => s.customerId !== draft().customer.customerId)!;
    await expect(firstValueFrom(api.create(draft({ location: { siteId: other.id, building: '', area: '', accessInstructions: '' } }), 'continue', null))).rejects.toThrow(/site does not belong/);
    await expect(firstValueFrom(api.create(draft({ description: 'short' }), 'continue', null))).rejects.toThrow(/sufficient/);
  });

  it('classifies, prioritises, validates coverage and applies the SLA automatically', async () => {
    const r = await firstValueFrom(api.create(draft(), 'continue', null));
    expect(r.serviceCategory).toBe('HVAC Services');
    expect(['Critical', 'High']).toContain(r.priority);
    expect(r.coverage.result).toMatch(/Covered/);
    expect(r.sla.resolutionMinutes).toBeGreaterThan(0);
    expect(store.db.history.some((h) => h.requestId === r.id && h.source.startsWith('Automation rule'))).toBe(true);
  });

  it('warns about duplicates before creating', async () => {
    await firstValueFrom(api.create(draft(), 'continue', null));
    await expect(firstValueFrom(api.create(draft(), 'none', null))).rejects.toThrow(/Possible duplicate/);
    const dups = await firstValueFrom(api.duplicates(draft()));
    expect(dups.length).toBeGreaterThan(0);
  });

  it('pauses the SLA only for approved hold reasons and requires a reason', async () => {
    const r = store.db.requests.find((x) => x.status === 'In Progress' && x.sla.slaId)!;
    await firstValueFrom(api.hold(r.id, { reason: 'Waiting for Parts', expectedResume: null, notes: '', responsible: 'Stores' }));
    expect(store.request(r.id)?.status).toBe('Pending');
    expect(store.request(r.id)?.holds.at(-1)?.pausesSla).toBe(true);
    await firstValueFrom(api.resume(r.id, 'Parts arrived'));
    expect(store.request(r.id)?.status).toBe('In Progress');
    await firstValueFrom(api.hold(r.id, { reason: 'Waiting for Technician', expectedResume: null, notes: '', responsible: 'Team' }));
    expect(store.request(r.id)?.holds.at(-1)?.pausesSla).toBe(false);
  });

  it('runs the work order → resolution → confirmation → closure flow with closure validation', async () => {
    const r = await firstValueFrom(api.create(draft({ subject: 'Generator will not start', description: 'Generator failed weekly test run, no crank on start.' }), 'continue', null));
    if (store.request(r.id)!.status === 'Under Validation') await firstValueFrom(api.decideChargeable(r.id, true, 'Quote accepted'));
    const created = store.request(r.id)!;
    if (created.status !== 'Assigned') {
      const tech = store.db.reference.technicians.find((t) => t.skills.includes(created.classification.requiredSkill))!;
      await firstValueFrom(api.assign(r.id, { team: tech.team, technician: tech.name, dispatcher: null, method: 'Manual Assignment', reason: 'test' }));
    }
    const wo = await firstValueFrom(api.createWorkOrder(r.id));
    await expect(firstValueFrom(api.resolve(r.id, { code: 'Repaired', category: 'Fixed', description: 'Fixed', rootCause: '', correctiveAction: '', recommendation: '', findings: '', labourMinutes: 30 }))).rejects.toThrow(new RegExp(wo));
    const woId = store.request(r.id)!.workOrders[0].id;
    await firstValueFrom(api.completeWorkOrder(r.id, woId, { labourMinutes: 60, parts: [], checklistCompleted: true }));
    await firstValueFrom(api.resolve(r.id, { code: 'Repaired', category: 'Fixed', description: 'Starter relay replaced.', rootCause: 'Relay', correctiveAction: '', recommendation: '', findings: '', labourMinutes: 60 }));
    const needs = store.request(r.id)!.priority === 'Critical' || store.request(r.id)!.priority === 'High' || !!store.request(r.id)!.coverage.amcId;
    if (needs) await expect(firstValueFrom(api.close(r.id, ''))).rejects.toThrow(/confirmation/);
    await firstValueFrom(api.confirm(r.id, true, 'Site Engineer', 'OK'));
    await firstValueFrom(api.close(r.id, 'Done'));
    expect(store.request(r.id)?.status).toBe('Closed');
    await expect(firstValueFrom(api.cancel(r.id, 'Other', ''))).rejects.toThrow(/protected/);
  });

  it('reopens with the previous resolution retained', async () => {
    const r = store.db.requests.find((x) => x.status === 'Resolved' && x.resolution && Date.now() - new Date(x.resolution.completedAt).getTime() < 20 * 86_400_000)!;
    await firstValueFrom(api.reopen(r.id, 'Issue Recurred', 'Back again'));
    const after = store.request(r.id)!;
    expect(after.status).toBe('Reopened');
    expect(after.previousResolutions.length).toBeGreaterThan(0);
    expect(after.resolution).toBeNull();
  });

  it('flags non-covered work as chargeable and blocks assignment until approved', async () => {
    const asset = store.db.reference.assets.find((a) => !store.db.reference.amcs.some((m) => m.assetIds.includes(a.id)) && a.warrantyStatus !== 'Active' && !['Retired', 'Decommissioned', 'Inactive'].includes(a.status) && !store.db.reference.amcs.some((m) => m.siteIds.includes(a.siteId) && m.status === 'Active'))!;
    const customer = store.db.reference.customers.find((c) => c.id === asset.customerId)!;
    if (customer.status !== 'Active') return;
    const r = await firstValueFrom(api.create(draft({ customer: { customerId: asset.customerId, contactId: null, contactName: 'X', phone: '1', email: '' }, location: { siteId: asset.siteId, building: '', area: '', accessInstructions: '' }, assetId: asset.id }), 'continue', null));
    expect(r.coverage.chargeable).toBe(true);
    expect(store.request(r.id)?.status).toBe('Under Validation');
    await expect(firstValueFrom(api.assign(r.id, { team: 'HVAC Team', technician: null, dispatcher: null, method: 'Manual Assignment', reason: '' }))).rejects.toThrow(/approval/);
    await firstValueFrom(api.decideChargeable(r.id, true, 'Quote accepted'));
    expect(store.request(r.id)?.status).toBe('Validated');
    expect(toItem(store.db, store.request(r.id)!).coverage.approval).toBe('Approved');
  });
});
