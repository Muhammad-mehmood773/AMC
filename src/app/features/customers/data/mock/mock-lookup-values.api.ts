import { Injectable, inject } from '@angular/core';
import { type LookupStatus, type LookupValue, LookupValuesApi } from '@shared/lookups/lookup';
import { type Observable, defer } from 'rxjs';
import { type CustomerSiteLookupType, LOOKUP, LOOKUP_SEED } from '../customer-site.lookups';
import { MockCustomerSiteStore } from './mock-store';
import { fail, respond, uid } from './mock-utils';

/**
 * In-memory implementation of the generic lookup API (one "table" of LookupType + Id + Name +
 * Status). Records currently reference lookup values by name, so renames are cascaded here to
 * simulate the referential integrity a backend would provide.
 */
@Injectable()
export class MockLookupValuesApi extends LookupValuesApi {
  private readonly store = inject(MockCustomerSiteStore);
  private readonly values: LookupValue[] = Object.entries(LOOKUP_SEED).flatMap(([type, seed]) =>
    seed.values.map((name, index) => ({
      id: `LKP-${type}-${index + 1}`,
      type,
      name,
      status: 'Active' as LookupStatus,
      isSystem: seed.system?.includes(name) ?? false,
      sortOrder: (index + 1) * 10,
    })),
  );

  list(types?: readonly string[]): Observable<LookupValue[]> {
    return defer(() => respond(this.values.filter((v) => !types || types.includes(v.type)), 150));
  }

  create(type: string, name: string): Observable<LookupValue> {
    return defer(() => {
      const clean = name.trim();
      if (!clean) return fail('Name is required.');
      if (this.isDuplicate(type, clean)) return fail(`“${clean}” already exists.`);
      const siblings = this.values.filter((v) => v.type === type);
      const value: LookupValue = {
        id: uid('LKP'),
        type,
        name: clean,
        status: 'Active',
        isSystem: false,
        sortOrder: Math.max(0, ...siblings.map((v) => v.sortOrder)) + 10,
      };
      this.values.push(value);
      return respond(value, 380);
    });
  }

  update(id: string, changes: { readonly name?: string; readonly status?: LookupStatus }): Observable<LookupValue> {
    return defer(() => {
      const index = this.values.findIndex((v) => v.id === id);
      if (index < 0) return fail('This value no longer exists.');
      const current = this.values[index];
      const name = changes.name?.trim() ?? current.name;
      if (!name) return fail('Name is required.');
      if (current.isSystem && name !== current.name) return fail('System values cannot be renamed.');
      if (this.isDuplicate(current.type, name, id)) return fail(`“${name}” already exists.`);
      const next: LookupValue = { ...current, name, status: changes.status ?? current.status };
      this.values[index] = next;
      if (name !== current.name) this.cascadeRename(current.type as CustomerSiteLookupType, current.name, name);
      return respond(next, 380);
    });
  }

  private isDuplicate(type: string, name: string, excludeId?: string): boolean {
    return this.values.some((v) => v.type === type && v.id !== excludeId && v.name.toLowerCase() === name.toLowerCase());
  }

  private cascadeRename(type: CustomerSiteLookupType, from: string, to: string): void {
    const { db } = this.store;
    const swap = (value: string) => (value === from ? to : value);
    switch (type) {
      case LOOKUP.customerType:
        db.customers = db.customers.map((c) => ({ ...c, type: swap(c.type) }));
        break;
      case LOOKUP.customerCategory:
        db.customers = db.customers.map((c) => ({ ...c, category: swap(c.category) }));
        break;
      case LOOKUP.industry:
        db.customers = db.customers.map((c) => ({ ...c, industry: swap(c.industry) }));
        break;
      case LOOKUP.communicationMethod:
        db.contacts = db.contacts.map((c) => ({ ...c, preferredCommunication: swap(c.preferredCommunication) }));
        break;
      case LOOKUP.preferredLanguage:
        db.contacts = db.contacts.map((c) => ({ ...c, preferredLanguage: swap(c.preferredLanguage) }));
        break;
      case LOOKUP.contactType:
        db.contacts = db.contacts.map((c) => ({ ...c, type: swap(c.type) }));
        break;
      case LOOKUP.siteType:
        db.sites = db.sites.map((s) => ({ ...s, type: swap(s.type) }));
        break;
      case LOOKUP.documentCategory:
        db.documents = db.documents.map((d) => ({ ...d, category: swap(d.category) }));
        break;
    }
  }
}
