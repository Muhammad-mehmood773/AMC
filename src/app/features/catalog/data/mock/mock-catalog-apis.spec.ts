import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { ServiceUpsert } from '../../models/catalog.model';
import type { EntitlementUpsert } from '../../models/entitlement.model';
import { CategoryApi, EntitlementApi, PricingApi, ServiceCatalogApi } from '../catalog.api';
import { provideCatalogData } from '../provide-catalog-data';
import { MockCatalogStore } from './mock-catalog-store';

const today = () => new Date().toISOString().slice(0, 10);

describe('Service Catalog & Entitlements mock data layer', () => {
  let store: MockCatalogStore;
  let services: ServiceCatalogApi;
  let entitlements: EntitlementApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideCatalogData() });
    store = TestBed.inject(MockCatalogStore);
    services = TestBed.inject(ServiceCatalogApi);
    entitlements = TestBed.inject(EntitlementApi);
  });

  function serviceInput(id: string): ServiceUpsert {
    const { id: _id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = store.service(id)!;
    void [_id, createdAt, createdBy, updatedAt, updatedBy];
    return rest;
  }

  function entitlementInput(id: string): EntitlementUpsert {
    const { id: _id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = store.entitlement(id)!;
    void [_id, createdAt, createdBy, updatedAt, updatedBy];
    return rest;
  }

  it('seeds a coherent catalog', () => {
    const { db } = store;
    expect(db.services.length).toBeGreaterThan(30);
    expect(new Set(db.services.map((s) => s.code)).size).toBe(db.services.length);
    expect(db.services.filter((s) => s.status === 'Active').every((s) => store.category(s.categoryId)?.status === 'Active')).toBe(true);
    expect(db.entitlements.length).toBeGreaterThan(10);
    expect(db.entitlements.every((e) => db.reference.customers.some((c) => c.id === e.customerId))).toBe(true);
  });

  it('enforces unique service codes and active categories', async () => {
    const existing = store.db.services[0];
    expect(await firstValueFrom(services.isCodeAvailable(existing.code.toLowerCase()))).toBe(false);
    await expect(firstValueFrom(services.create(serviceInput(existing.id)))).rejects.toThrow(/already in use/);
    const inactive = store.db.categories[0];
    store.db.categories = store.db.categories.map((c) => (c.id === inactive.id ? { ...c, status: 'Inactive' } : c));
    await expect(firstValueFrom(services.create({ ...serviceInput(existing.id), code: 'NEW-1', categoryId: inactive.id, subcategoryId: null, status: 'Active' }))).rejects.toThrow(/active category/);
  });

  it('blocks deactivating a category that has active services', async () => {
    const cat = store.db.categories.find((c) => store.db.services.some((s) => s.status === 'Active' && s.categoryId === c.id))!;
    await expect(firstValueFrom(TestBed.inject(CategoryApi).setStatus(cat.id, 'Inactive'))).rejects.toThrow(/active service/);
  });

  it('resolves the most specific effective price', async () => {
    const pricing = TestBed.inject(PricingApi);
    const service = store.db.services.find((s) => s.status === 'Active')!;
    const gov = store.db.reference.customers.find((c) => c.type === 'Government')!;
    const corp = store.db.reference.customers.find((c) => c.type === 'Corporate' && c.category !== 'Enterprise' && c.serviceRegion !== 'GCC')!;
    const govQuote = await firstValueFrom(pricing.quote({ serviceId: service.id, customerId: gov.id, agreementId: null, serviceRegion: null, date: today(), quantity: 1 }));
    const stdQuote = await firstValueFrom(pricing.quote({ serviceId: service.id, customerId: corp.id, agreementId: null, serviceRegion: null, date: today(), quantity: 1 }));
    expect(govQuote.rule?.customerType).toBe('Government');
    expect(govQuote.unitPrice).toBeLessThan(stdQuote.unitPrice);
    const created = await firstValueFrom(pricing.create({ ...govQuote.rule!, customerType: null, customerId: corp.id, basePrice: 1, effectiveFrom: today(), effectiveTo: null }));
    const specific = await firstValueFrom(pricing.quote({ serviceId: service.id, customerId: corp.id, agreementId: null, serviceRegion: null, date: today(), quantity: 2 }));
    expect(specific.rule?.id).toBe(created.id);
    expect(specific.subtotal).toBe(2);
    await expect(firstValueFrom(pricing.create({ ...govQuote.rule! }))).rejects.toThrow(/overlaps/);
  });

  it('validates entitlements against coverage, exclusions and usage', async () => {
    const e = store.db.entitlements.find((x) => store.effectiveStatus(x) === 'Active' && x.coverage.serviceIds.length && x.siteIds.length && (!x.usage.limitApplicable || store.usageSummary(x).remaining! > 0) && store.db.reference.customers.find((c) => c.id === x.customerId)?.status === 'Active')!;
    const request = { customerId: e.customerId, siteId: e.siteIds[0], assetId: null, serviceId: e.coverage.serviceIds[0], date: today(), emergency: false, entitlementId: e.id };
    const ok = await firstValueFrom(entitlements.validate(request));
    expect(ok.covered).toBe(true);
    expect(ok.checks.length).toBeGreaterThanOrEqual(13);

    await firstValueFrom(entitlements.update(e.id, { ...entitlementInput(e.id), coverage: { ...e.coverage, serviceIds: e.coverage.serviceIds.slice(1) }, exclusions: { ...e.exclusions, serviceIds: [e.coverage.serviceIds[0]] } }));
    const excluded = await firstValueFrom(entitlements.validate(request));
    expect(excluded.covered).toBe(false);
    expect(excluded.billable).toBe(true);

    await firstValueFrom(entitlements.suspend(e.id, 'test'));
    expect((await firstValueFrom(entitlements.validate(request))).checks.find((c) => c.question === 'Is the entitlement active?')?.result).toBe('fail');
  });

  it('updates usage automatically and renews with a usage reset', async () => {
    const e = store.db.entitlements.find((x) => store.effectiveStatus(x) === 'Active' && x.usage.maxVisits !== null && x.coverage.serviceIds.length)!;
    const before = store.usageSummary(e).consumed;
    await firstValueFrom(entitlements.recordUsage(e.id, { date: new Date().toISOString(), serviceId: e.coverage.serviceIds[0], siteId: e.siteIds[0] ?? null, assetId: null, visits: 1, hours: 2, quantity: 1, reference: 'WO-TEST', technician: 'Tester', notes: '' }));
    expect(store.usageSummary(store.entitlement(e.id)!).consumed).toBe(before + 1);
    expect(store.db.history[0]).toMatchObject({ action: 'Usage Updated', entityId: e.id });
    const renewed = await firstValueFrom(entitlements.renew(e.id, 12));
    expect(renewed.usage.usedVisits).toBe(0);
    expect(renewed.validity.startDate > e.validity.startDate).toBe(true);
  });

  it('rejects inactive services on new entitlements', async () => {
    const e = store.db.entitlements[0];
    const inactive = store.db.services.find((s) => s.status === 'Inactive')!;
    await expect(firstValueFrom(entitlements.create({ ...entitlementInput(e.id), number: 'ENT-99999', coverage: { ...e.coverage, serviceIds: [inactive.id] } }))).rejects.toThrow(/Inactive services/);
  });
});
