import { TestBed } from '@angular/core/testing';
import { LookupValuesApi } from '@shared/lookups/lookup';
import { firstValueFrom } from 'rxjs';
import { ContactApi, CustomerApi, DocumentApi, SiteApi } from '../customer-site.api';
import { provideCustomerSiteData } from '../provide-customer-site-data';
import { MockCustomerSiteStore } from './mock-store';

describe('Customer & Site mock data layer', () => {
  let customers: CustomerApi;
  let sites: SiteApi;
  let contacts: ContactApi;
  let documents: DocumentApi;
  let store: MockCustomerSiteStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideCustomerSiteData() });
    customers = TestBed.inject(CustomerApi);
    sites = TestBed.inject(SiteApi);
    contacts = TestBed.inject(ContactApi);
    documents = TestBed.inject(DocumentApi);
    store = TestBed.inject(MockCustomerSiteStore);
  });

  it('seeds a coherent dataset', () => {
    const { db } = store;
    expect(db.customers.length).toBeGreaterThan(20);
    expect(db.sites.every((s) => db.customers.some((c) => c.id === s.customerId))).toBe(true);
    expect(new Set(db.customers.map((c) => c.code)).size).toBe(db.customers.length);
    expect(new Set(db.sites.map((s) => s.code)).size).toBe(db.sites.length);
    expect(db.activities.every((a) => a.timestamp <= new Date().toISOString())).toBe(true);
  });

  it('enforces unique customer codes (case-insensitive)', async () => {
    expect(await firstValueFrom(customers.isCodeAvailable('cus-00101'))).toBe(false);
    expect(await firstValueFrom(customers.isCodeAvailable('CUS-00101', 'CUS-00101'))).toBe(true);
    const next = await firstValueFrom(customers.nextCode());
    expect(await firstValueFrom(customers.isCodeAvailable(next))).toBe(true);
  });

  it('detects duplicates on configured criteria', async () => {
    const existing = store.db.customers[0];
    const matches = await firstValueFrom(customers.findDuplicates({ vatNumber: existing.vatNumber, crNumber: existing.crNumber }));
    expect(matches[0]?.customerId).toBe(existing.id);
    expect(matches[0]?.matchedOn).toEqual(expect.arrayContaining(['crNumber', 'vatNumber']));
    expect(await firstValueFrom(customers.findDuplicates({ vatNumber: existing.vatNumber }, existing.id))).toHaveLength(0);
  });

  it('blocks new sites for inactive customers and logs status history', async () => {
    const id = store.db.customers[0].id;
    await firstValueFrom(customers.setStatus([id], 'Inactive'));
    expect(store.db.activities[0]).toMatchObject({ action: 'Status Changed', previousValue: 'Active', newValue: 'Inactive' });
    const base = store.db.sites[0];
    const { id: _id, createdAt, createdBy, updatedAt, updatedBy, ...input } = base;
    void [_id, createdAt, createdBy, updatedAt, updatedBy];
    await expect(firstValueFrom(sites.create({ ...input, code: 'SITE-TEST', customerId: id }))).rejects.toThrow(/inactive/i);
  });

  it('keeps a single primary contact per type and scope', async () => {
    const customer = store.db.customers[1];
    const billing = store.db.contacts.find((c) => c.customerId === customer.id && c.type === 'Billing' && c.siteId === null)!;
    const created = await firstValueFrom(contacts.create({ ...billing, firstName: 'New', lastName: 'Billing', isPrimary: true }));
    const primaries = store.db.contacts.filter((c) => c.customerId === customer.id && c.siteId === null && c.type === 'Billing' && c.isPrimary);
    expect(primaries.map((c) => c.id)).toEqual([created.id]);
  });

  it('manages generic lookup values with duplicate, system and cascade rules', async () => {
    const lookups = TestBed.inject(LookupValuesApi);
    const types = await firstValueFrom(lookups.list(['customer-type']));
    const corporate = types.find((v) => v.name === 'Corporate')!;
    await expect(firstValueFrom(lookups.create('customer-type', ' corporate '))).rejects.toThrow(/already exists/);
    const created = await firstValueFrom(lookups.create('customer-type', 'Semi-Government'));
    expect(created).toMatchObject({ type: 'customer-type', name: 'Semi-Government', status: 'Active' });

    const before = store.db.customers.filter((c) => c.type === 'Corporate').length;
    await firstValueFrom(lookups.update(corporate.id, { name: 'Enterprise Corporate' }));
    expect(store.db.customers.filter((c) => c.type === 'Enterprise Corporate')).toHaveLength(before);
    expect(store.db.customers.some((c) => c.type === 'Corporate')).toBe(false);

    const primary = (await firstValueFrom(lookups.list(['contact-type']))).find((v) => v.name === 'Primary')!;
    expect(primary.isSystem).toBe(true);
    await expect(firstValueFrom(lookups.update(primary.id, { name: 'Main' }))).rejects.toThrow(/System values/);
  });

  it('versions documents on replace and computes expiry status', async () => {
    const doc = store.db.documents.find((d) => d.expiryDate)!;
    const next = await firstValueFrom(
      documents.replace(doc.id, { file: { name: 'renewed.pdf', size: 1000, type: 'application/pdf' }, note: 'Renewed', issueDate: null, expiryDate: '2099-01-01' }),
    );
    expect(next.version).toBe(doc.version + 1);
    expect(next.versions.at(-1)?.fileName).toBe('renewed.pdf');
    expect(store.documentListItem(next).status).toMatch(/Valid|Renewal In Progress/);
  });
});
