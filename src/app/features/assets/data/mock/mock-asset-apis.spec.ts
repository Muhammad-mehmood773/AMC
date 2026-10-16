import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { AssetUpsert } from '../../models/asset.model';
import { AssetApi, ComponentApi, EntitlementApi, InstallationApi, TransferApi, WarrantyApi } from '../asset.api';
import { provideAssetData } from '../provide-asset-data';
import { MockAssetStore } from './mock-asset-store';

function toUpsert(store: MockAssetStore, id: string): AssetUpsert {
  const { id: _id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = store.asset(id)!;
  void [_id, createdAt, createdBy, updatedAt, updatedBy];
  return rest;
}

describe('Asset / Installed Base mock data layer', () => {
  let assets: AssetApi;
  let store: MockAssetStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideAssetData() });
    assets = TestBed.inject(AssetApi);
    store = TestBed.inject(MockAssetStore);
  });

  it('seeds a coherent installed base linked to customers and sites', () => {
    const { db } = store;
    expect(db.assets.length).toBeGreaterThan(100);
    expect(new Set(db.assets.map((a) => a.code)).size).toBe(db.assets.length);
    expect(new Set(db.assets.map((a) => a.tag)).size).toBe(db.assets.length);
    const sites = new Map(db.reference.sites.map((s) => [s.id, s]));
    expect(db.assets.every((a) => !a.siteId || sites.get(a.siteId)?.customerId === a.customerId)).toBe(true);
    expect(db.assets.some((a) => a.status === 'Received')).toBe(true);
    expect(db.lifecycle.every((e) => e.timestamp <= new Date().toISOString())).toBe(true);
    expect(db.components.some((c) => c.replacesId)).toBe(true);
  });

  it('enforces unique asset ID, tag and serial (per type and manufacturer)', async () => {
    const existing = store.db.assets[0];
    expect(await firstValueFrom(assets.isCodeAvailable(existing.code.toLowerCase()))).toBe(false);
    expect(await firstValueFrom(assets.isTagAvailable(existing.tag))).toBe(false);
    expect(await firstValueFrom(assets.isTagAvailable(existing.tag, existing.id))).toBe(true);
    expect(await firstValueFrom(assets.isSerialAvailable(existing))).toBe(false);
    expect(await firstValueFrom(assets.isSerialAvailable({ ...existing, manufacturer: 'Other Maker' }))).toBe(true);
    const code = await firstValueFrom(assets.nextCode());
    await expect(firstValueFrom(assets.create({ ...toUpsert(store, existing.id), code, tag: 'TAG-NEW-1' }))).rejects.toThrow(/Serial number/);
  });

  it('requires a site for installed customer assets and a customer unless company owned', async () => {
    const base = toUpsert(store, store.db.assets.find((a) => a.status === 'Active')!.id);
    const code = await firstValueFrom(assets.nextCode());
    const input = { ...base, code, tag: 'TAG-T-1', serialNumber: 'SN-T-1' };
    await expect(firstValueFrom(assets.create({ ...input, siteId: null }))).rejects.toThrow(/service site/);
    await expect(firstValueFrom(assets.create({ ...input, customerId: null, siteId: null }))).rejects.toThrow(/customer is required/);
    const created = await firstValueFrom(
      assets.create({ ...input, customerId: null, siteId: null, status: 'Planned', ownership: { ...input.ownership, type: 'Company Owned', owner: 'Gulf Facility Services Co.' } }),
    );
    expect(store.db.lifecycle.some((e) => e.assetId === created.id && e.eventType === 'Asset Created')).toBe(true);
  });

  it('validates status transitions and never deletes retired assets', async () => {
    const active = store.db.assets.find((a) => a.status === 'Active')!;
    await expect(firstValueFrom(assets.setStatus([active.id], 'Decommissioned'))).rejects.toThrow(/cannot be changed/);
    await firstValueFrom(assets.setStatus([active.id], 'Retired'));
    expect(store.asset(active.id)?.status).toBe('Retired');
    expect(store.db.lifecycle[0]).toMatchObject({ eventType: 'Asset Retired', previousValue: 'Active', newValue: 'Retired' });
    await expect(firstValueFrom(TestBed.inject(TransferApi).request({ assetId: active.id, to: { customerId: null, siteId: null, location: '' }, transferDate: '2026-01-01', reason: 'Other', requestedBy: 'x', reference: '', notes: '' }))).rejects.toThrow(/not available/);
  });

  it('runs the transfer workflow and preserves location history', async () => {
    const transfers = TestBed.inject(TransferApi);
    const asset = store.db.assets.find((a) => a.status === 'Active' && !store.db.transfers.some((t) => t.assetId === a.id))!;
    const target = store.db.reference.sites.find((s) => s.customerId === asset.customerId && s.id !== asset.siteId) ?? store.db.reference.sites.find((s) => s.id !== asset.siteId)!;
    const created = await firstValueFrom(transfers.request({ assetId: asset.id, to: { customerId: target.customerId, siteId: target.id, location: 'Plant Room 2' }, transferDate: '2026-10-20', reason: 'Site Relocation', requestedBy: 'Tester', reference: '', notes: '' }));
    await firstValueFrom(transfers.approve(created.id));
    expect(store.asset(asset.id)?.status).toBe('Transferred');
    await firstValueFrom(transfers.complete(created.id));
    expect(store.asset(asset.id)).toMatchObject({ siteId: target.id, status: 'Active' });
    const history = await firstValueFrom(assets.locationHistory(asset.id));
    expect(history[0]).toMatchObject({ current: true, siteId: target.id });
    expect(history[1]).toMatchObject({ current: false, siteId: asset.siteId });
  });

  it('runs installation and commissioning with checklist enforcement', async () => {
    const installations = TestBed.inject(InstallationApi);
    const record = store.db.installations.find((r) => r.installationStatus === 'Scheduled')!;
    await firstValueFrom(installations.startInstallation(record.id));
    await firstValueFrom(installations.completeInstallation(record.id));
    expect(store.asset(record.assetId)?.status).toBe('Installed');
    await firstValueFrom(installations.startCommissioning(record.id));
    const input = { commissioningDate: '2026-10-16', commissionedBy: 'Tester', initialMeterReading: 0, initialCondition: 'New', testResults: 'OK', outcome: 'Completed' as const };
    await expect(firstValueFrom(installations.completeCommissioning(record.id, { ...input, checklist: [{ item: 'x', done: false }] }))).rejects.toThrow(/checklist/);
    await firstValueFrom(installations.completeCommissioning(record.id, { ...input, checklist: [{ item: 'x', done: true }] }));
    expect(store.asset(record.assetId)?.status).toBe('Active');
  });

  it('preserves the component chain on replacement', async () => {
    const components = TestBed.inject(ComponentApi);
    const component = store.db.components.find((c) => c.status === 'Active')!;
    const { id: _i, assetId: _a, replacesId: _r, replacedById: _b, createdAt: _c, createdBy: _d, ...input } = component;
    void [_i, _a, _r, _b, _c, _d];
    const created = await firstValueFrom(components.replace(component.id, { replacementDate: '2026-10-16', reason: 'Failed', component: { ...input, serialNumber: 'NEW-SN' } }));
    expect(store.db.components.find((c) => c.id === component.id)).toMatchObject({ status: 'Replaced', replacedById: created.id });
    expect(created.replacesId).toBe(component.id);
  });

  it('derives warranty status from dates and evaluates entitlements', async () => {
    const warranties = TestBed.inject(WarrantyApi);
    const asset = store.db.assets.find((a) => a.status === 'Active')!;
    const future = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
    const start = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const created = await firstValueFrom(
      warranties.create({ assetId: asset.id, componentId: null, provider: 'Test', type: 'Extended Warranty', reference: 'EXT-1', startDate: start, endDate: future, coverageDetails: '', exclusions: '', cancelled: false, documentId: null, notes: '' }),
    );
    expect(store.warrantyStatus(created)).toBe('Active');
    const check = await firstValueFrom(TestBed.inject(EntitlementApi).evaluate(asset.id, 'Breakdown'));
    expect(check.warrantyActive).toBe(true);
    expect(check.covered).toBe(true);

    const uncovered = store.db.assets.find((a) => a.status === 'Active' && !store.db.coverages.some((c) => c.assetId === a.id) && !store.db.warranties.some((w) => w.assetId === a.id));
    if (uncovered) {
      const result = await firstValueFrom(TestBed.inject(EntitlementApi).evaluate(uncovered.id, 'Breakdown'));
      expect(result.covered).toBe(false);
    }
  });

  it('builds dashboard KPIs consistent with the list', async () => {
    const list = await firstValueFrom(assets.list());
    const dashboard = await firstValueFrom(
      assets.dashboard({ customers: [], sites: [], categories: [], types: [], manufacturers: [], models: [], statuses: [], warrantyStatuses: [], coverageStates: [], regions: [], installedFrom: '', installedTo: '', maintenanceFrom: '', maintenanceTo: '' }),
    );
    expect(dashboard.kpis.total).toBe(list.length);
    expect(dashboard.kpis.underBreakdown).toBe(list.filter((a) => a.status === 'Under Repair').length);
    expect(dashboard.recentlyAdded.length).toBeGreaterThan(0);
  });
});
