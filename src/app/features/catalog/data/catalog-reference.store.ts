import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { ChoiceOption } from '@shared/ui/select';
import type { CatalogReferenceData } from '../models/reference.model';
import { CatalogReferenceApi } from './catalog.api';

const EMPTY: CatalogReferenceData = {
  customers: [], sites: [], assets: [], agreements: [], slas: [], priceLists: [], taxProfiles: [], territories: [],
  serviceRegions: [], currencies: [], customerTypes: [], customerCategories: [], technicians: [], currentUser: '',
};

const plain = (items: readonly string[]): ChoiceOption[] => items.map((value) => ({ value, label: value }));

/** Feature-scoped cache of upstream master data with ready-made select options. */
@Injectable()
export class CatalogReferenceStore {
  private readonly api = inject(CatalogReferenceApi);
  private readonly resource = rxResource({ stream: () => this.api.get(), defaultValue: EMPTY });

  readonly data = computed(() => (this.resource.hasValue() ? this.resource.value() : EMPTY));

  readonly customerOptions = computed<ChoiceOption[]>(() => this.data().customers.map((c) => ({ value: c.id, label: c.name, hint: c.status === 'Active' ? c.code : `${c.code} · ${c.status}` })));
  readonly slaOptions = computed<ChoiceOption[]>(() => this.data().slas.map((s) => ({ value: s.id, label: `${s.name} · ${s.responseHours}h / ${s.resolutionHours}h` })));
  readonly priceListOptions = computed<ChoiceOption[]>(() => this.data().priceLists.map((p) => ({ value: p.id, label: p.name })));
  readonly taxProfileOptions = computed<ChoiceOption[]>(() => this.data().taxProfiles.map((t) => ({ value: t.id, label: t.name })));
  readonly territoryOptions = computed<ChoiceOption[]>(() => this.data().territories.map((t) => ({ value: t.id, label: t.name, hint: t.region })));
  readonly regionOptions = computed(() => plain(this.data().serviceRegions));
  readonly currencyOptions = computed(() => plain(this.data().currencies));
  readonly customerTypeOptions = computed(() => plain(this.data().customerTypes));
  readonly customerCategoryOptions = computed(() => plain(this.data().customerCategories));
  readonly technicianOptions = computed(() => plain(this.data().technicians));
  readonly contractOptions = computed(() => this.agreementOptions('Contract', null));
  readonly amcOptions = computed(() => this.agreementOptions('AMC', null));

  customerName(id: string | null | undefined): string | null {
    return id ? (this.data().customers.find((c) => c.id === id)?.name ?? null) : null;
  }

  siteOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().sites.filter((s) => !customerId || s.customerId === customerId).map((s) => ({ value: s.id, label: s.name, hint: s.status === 'Active' ? s.city : `${s.city} · ${s.status}` }));
  }

  assetOptions(customerId: string | null | undefined, siteIds: readonly string[] = []): ChoiceOption[] {
    return this.data()
      .assets.filter((a) => (!customerId || a.customerId === customerId) && (!siteIds.length || (a.siteId && siteIds.includes(a.siteId))))
      .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: a.status }));
  }

  agreementOptions(kind: 'Contract' | 'AMC', customerId: string | null | undefined): ChoiceOption[] {
    return this.data()
      .agreements.filter((a) => a.kind === kind && (!customerId || a.customerId === customerId))
      .map((a) => ({ value: a.id, label: `${a.number} · ${a.title}`, hint: a.status }));
  }

  slaName(id: string | null | undefined): string | null {
    return id ? (this.data().slas.find((s) => s.id === id)?.name ?? null) : null;
  }

  priceListName(id: string | null | undefined): string | null {
    return id ? (this.data().priceLists.find((p) => p.id === id)?.name ?? null) : null;
  }

  taxProfileName(id: string | null | undefined): string | null {
    return id ? (this.data().taxProfiles.find((t) => t.id === id)?.name ?? null) : null;
  }

  territoryName(id: string | null | undefined): string | null {
    return id ? (this.data().territories.find((t) => t.id === id)?.name ?? null) : null;
  }
}
