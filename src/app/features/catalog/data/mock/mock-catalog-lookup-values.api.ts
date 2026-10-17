import { Injectable, inject } from '@angular/core';
import { type LookupStatus, type LookupValue, LookupValuesApi } from '@shared/lookups/lookup';
import { type Observable, defer } from 'rxjs';
import { fail, respond, uid } from '../../../customers/data/mock/mock-utils';
import { CATALOG_LOOKUP, CATALOG_LOOKUP_SEED, type CatalogLookupType } from '../catalog.lookups';
import { MockCatalogStore } from './mock-catalog-store';

/** In-memory generic lookup API for catalog lists; renames cascade to referencing services. */
@Injectable()
export class MockCatalogLookupValuesApi extends LookupValuesApi {
  private readonly store = inject(MockCatalogStore);
  private readonly values: LookupValue[] = Object.entries(CATALOG_LOOKUP_SEED).flatMap(([type, names]) =>
    names.map((name, index) => ({ id: `LKP-${type}-${index + 1}`, type, name, status: 'Active' as LookupStatus, isSystem: false, sortOrder: (index + 1) * 10 })),
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
      const value: LookupValue = { id: uid('LKP'), type, name: clean, status: 'Active', isSystem: false, sortOrder: Math.max(0, ...siblings.map((v) => v.sortOrder)) + 10 };
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
      if (this.isDuplicate(current.type, name, id)) return fail(`“${name}” already exists.`);
      const next: LookupValue = { ...current, name, status: changes.status ?? current.status };
      this.values[index] = next;
      if (name !== current.name) this.cascade(current.type as CatalogLookupType, current.name, name);
      return respond(next, 380);
    });
  }

  private isDuplicate(type: string, name: string, excludeId?: string): boolean {
    return this.values.some((v) => v.type === type && v.id !== excludeId && v.name.toLowerCase() === name.toLowerCase());
  }

  private cascade(type: CatalogLookupType, from: string, to: string): void {
    const swap = (value: string) => (value === from ? to : value);
    const { db } = this.store;
    db.services = db.services.map((s) => {
      switch (type) {
        case CATALOG_LOOKUP.serviceClass:
          return { ...s, serviceClass: swap(s.serviceClass) };
        case CATALOG_LOOKUP.skill:
          return { ...s, resources: { ...s.resources, skill: swap(s.resources.skill) } };
        case CATALOG_LOOKUP.certification:
          return { ...s, resources: { ...s.resources, certification: swap(s.resources.certification) } };
        case CATALOG_LOOKUP.team:
          return { ...s, resources: { ...s.resources, team: swap(s.resources.team) } };
        default:
          return { ...s, maintenance: { ...s.maintenance, maintenanceType: swap(s.maintenance.maintenanceType) } };
      }
    });
  }
}
