import { Injectable, inject } from '@angular/core';
import { type LookupStatus, type LookupValue, LookupValuesApi } from '@shared/lookups/lookup';
import { type Observable, defer } from 'rxjs';
import { fail, respond, uid } from '../../../customers/data/mock/mock-utils';
import type { Classification } from '../../models/request.model';
import { SR_LOOKUP, SR_LOOKUP_SEED } from '../sr.lookups';
import { MockSrStore } from './mock-sr-store';

const FIELD: Record<string, keyof Classification> = { [SR_LOOKUP.problemCode]: 'problemCode', [SR_LOOKUP.failureType]: 'failureType', [SR_LOOKUP.symptom]: 'symptom', [SR_LOOKUP.cause]: 'cause' };

/** In-memory generic lookup API for classification lists; renames cascade to requests. */
@Injectable()
export class MockSrLookupValuesApi extends LookupValuesApi {
  private readonly store = inject(MockSrStore);
  private readonly values: LookupValue[] = Object.entries(SR_LOOKUP_SEED).flatMap(([type, names]) =>
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
      const field = FIELD[current.type];
      if (field && name !== current.name) this.store.db.requests = this.store.db.requests.map((r) => (r.classification[field] === current.name ? { ...r, classification: { ...r.classification, [field]: name } } : r));
      return respond(next, 380);
    });
  }

  private isDuplicate(type: string, name: string, excludeId?: string): boolean {
    return this.values.some((v) => v.type === type && v.id !== excludeId && v.name.toLowerCase() === name.toLowerCase());
  }
}
