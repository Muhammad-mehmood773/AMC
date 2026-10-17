import { Injectable, inject } from '@angular/core';
import { type LookupStatus, type LookupValue, LookupValuesApi } from '@shared/lookups/lookup';
import { type Observable, defer } from 'rxjs';
import { fail, respond, uid } from '../../../customers/data/mock/mock-utils';
import { AMC_LOOKUP, AMC_LOOKUP_SEED, type AmcLookupType } from '../amc.lookups';
import { MockAmcStore } from './mock-amc-store';

/** In-memory generic lookup API for AMC lists; renames cascade to AMCs and service plans. */
@Injectable()
export class MockAmcLookupValuesApi extends LookupValuesApi {
  private readonly store = inject(MockAmcStore);
  private readonly values: LookupValue[] = Object.entries(AMC_LOOKUP_SEED).flatMap(([type, names]) =>
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
      const value: LookupValue = { id: uid('LKP'), type, name: clean, status: 'Active', isSystem: false, sortOrder: Math.max(0, ...this.values.filter((v) => v.type === type).map((v) => v.sortOrder)) + 10 };
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
      if (name !== current.name) this.cascade(current.type as AmcLookupType, current.name, name);
      return respond(next, 380);
    });
  }

  private isDuplicate(type: string, name: string, excludeId?: string): boolean {
    return this.values.some((v) => v.type === type && v.id !== excludeId && v.name.toLowerCase() === name.toLowerCase());
  }

  private cascade(type: AmcLookupType, from: string, to: string): void {
    const swap = (v: string) => (v === from ? to : v);
    const { db } = this.store;
    if (type === AMC_LOOKUP.maintenanceType) db.amcs = db.amcs.map((a) => ({ ...a, maintenance: { ...a.maintenance, maintenanceType: swap(a.maintenance.maintenanceType) } }));
    if (type === AMC_LOOKUP.team) {
      db.amcs = db.amcs.map((a) => ({ ...a, operational: { ...a.operational, serviceTeam: swap(a.operational.serviceTeam), technicianTeam: swap(a.operational.technicianTeam) } }));
      db.plans = db.plans.map((p) => ({ ...p, team: swap(p.team) }));
    }
    if (type === AMC_LOOKUP.checklist) db.plans = db.plans.map((p) => ({ ...p, checklist: swap(p.checklist) }));
  }
}
