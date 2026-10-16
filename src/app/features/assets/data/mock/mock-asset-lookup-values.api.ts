import { Injectable, inject } from '@angular/core';
import { type LookupStatus, type LookupValue, LookupValuesApi } from '@shared/lookups/lookup';
import { type Observable, defer } from 'rxjs';
import { fail, respond, uid } from '../../../customers/data/mock/mock-utils';
import { ASSET_LOOKUP, ASSET_LOOKUP_SEED, type AssetLookupType } from '../asset.lookups';
import { MockAssetStore } from './mock-asset-store';

/**
 * In-memory implementation of the generic lookup API for asset classification lists. Records
 * reference lookup values by name, so renames are cascaded to simulate referential integrity.
 */
@Injectable()
export class MockAssetLookupValuesApi extends LookupValuesApi {
  private readonly store = inject(MockAssetStore);
  private readonly values: LookupValue[] = Object.entries(ASSET_LOOKUP_SEED).flatMap(([type, names]) =>
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
      if (name !== current.name) this.cascadeRename(current.type as AssetLookupType, current.name, name);
      return respond(next, 380);
    });
  }

  private isDuplicate(type: string, name: string, excludeId?: string): boolean {
    return this.values.some((v) => v.type === type && v.id !== excludeId && v.name.toLowerCase() === name.toLowerCase());
  }

  private cascadeRename(type: AssetLookupType, from: string, to: string): void {
    const { db } = this.store;
    const swap = (value: string) => (value === from ? to : value);
    switch (type) {
      case ASSET_LOOKUP.category:
        db.assets = db.assets.map((a) => ({ ...a, category: swap(a.category) }));
        break;
      case ASSET_LOOKUP.type:
        db.assets = db.assets.map((a) => ({ ...a, type: swap(a.type) }));
        break;
      case ASSET_LOOKUP.manufacturer:
        db.assets = db.assets.map((a) => ({ ...a, manufacturer: swap(a.manufacturer) }));
        db.components = db.components.map((c) => ({ ...c, manufacturer: swap(c.manufacturer) }));
        break;
      case ASSET_LOOKUP.serviceClass:
        db.assets = db.assets.map((a) => ({ ...a, serviceClass: swap(a.serviceClass) }));
        break;
      case ASSET_LOOKUP.maintenanceClass:
        db.assets = db.assets.map((a) => ({ ...a, maintenanceClass: swap(a.maintenanceClass) }));
        break;
      case ASSET_LOOKUP.meterType:
        db.assets = db.assets.map((a) => ({ ...a, operational: { ...a.operational, meterType: swap(a.operational.meterType) } }));
        break;
      case ASSET_LOOKUP.fuelType:
        db.assets = db.assets.map((a) => ({ ...a, technical: { ...a.technical, fuelType: swap(a.technical.fuelType) } }));
        break;
      case ASSET_LOOKUP.refrigerantType:
        db.assets = db.assets.map((a) => ({ ...a, technical: { ...a.technical, refrigerantType: swap(a.technical.refrigerantType) } }));
        break;
      case ASSET_LOOKUP.servicePlan:
        db.assets = db.assets.map((a) => ({ ...a, service: { ...a.service, servicePlan: swap(a.service.servicePlan) } }));
        break;
      case ASSET_LOOKUP.maintenancePlan:
        db.assets = db.assets.map((a) => ({ ...a, service: { ...a.service, maintenancePlan: swap(a.service.maintenancePlan) } }));
        break;
      case ASSET_LOOKUP.responsibleTeam:
        db.assets = db.assets.map((a) => ({ ...a, operational: { ...a.operational, responsibleTeam: swap(a.operational.responsibleTeam) } }));
        break;
      case ASSET_LOOKUP.componentType:
        db.components = db.components.map((c) => ({ ...c, componentType: swap(c.componentType) }));
        break;
      case ASSET_LOOKUP.documentType:
        db.documents = db.documents.map((d) => ({ ...d, type: swap(d.type) }));
        break;
    }
  }
}
