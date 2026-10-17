import { Injectable, inject } from '@angular/core';
import { type LookupStatus, type LookupValue, LookupValuesApi } from '@shared/lookups/lookup';
import { type Observable, defer } from 'rxjs';
import { fail, respond, uid } from '../../../customers/data/mock/mock-utils';
import { CONTRACT_LOOKUP, CONTRACT_LOOKUP_SEED, type ContractLookupType } from '../contract.lookups';
import { MockContractStore } from './mock-contract-store';

/** In-memory generic lookup API for contract lists; renames cascade to referencing contracts. */
@Injectable()
export class MockContractLookupValuesApi extends LookupValuesApi {
  private readonly store = inject(MockContractStore);
  private readonly values: LookupValue[] = Object.entries(CONTRACT_LOOKUP_SEED).flatMap(([type, names]) =>
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
      if (name !== current.name) this.cascade(current.type as ContractLookupType, current.name, name);
      return respond(next, 380);
    });
  }

  private isDuplicate(type: string, name: string, excludeId?: string): boolean {
    return this.values.some((v) => v.type === type && v.id !== excludeId && v.name.toLowerCase() === name.toLowerCase());
  }

  private cascade(type: ContractLookupType, from: string, to: string): void {
    const swap = (v: string) => (v === from ? to : v);
    this.store.db.contracts = this.store.db.contracts.map((c) => {
      switch (type) {
        case CONTRACT_LOOKUP.category:
          return { ...c, category: swap(c.category) };
        case CONTRACT_LOOKUP.governingLaw:
          return { ...c, legal: { ...c.legal, governingLaw: swap(c.legal.governingLaw) } };
        case CONTRACT_LOOKUP.jurisdiction:
          return { ...c, legal: { ...c.legal, jurisdiction: swap(c.legal.jurisdiction) } };
        case CONTRACT_LOOKUP.costCenter:
          return { ...c, financial: { ...c.financial, costCenter: swap(c.financial.costCenter) } };
        default:
          return { ...c, financial: { ...c.financial, profitCenter: swap(c.financial.profitCenter) } };
      }
    });
  }
}
