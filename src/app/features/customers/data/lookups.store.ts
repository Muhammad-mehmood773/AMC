import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { SelectOption } from '@shared/models/select-option';
import type { CustomerLookups, LookupItem } from '../models/lookup.model';
import { LookupApi } from './customer-site.api';

const EMPTY: CustomerLookups = {
  companies: [],
  branches: [],
  users: [],
  accountManagers: [],
  salesReps: [],
  paymentTerms: [],
  currencies: [],
  taxProfiles: [],
  priceLists: [],
  slas: [],
  serviceRegions: [],
  territories: [],
  countries: [],
};

const toOptions = (items: readonly LookupItem[]): SelectOption[] =>
  items.map((item) => ({ value: item.id, label: item.name }));
const toPlain = (items: readonly string[]): SelectOption[] =>
  items.map((item) => ({ value: item, label: item }));

/** Feature-scoped cache of master/reference data with ready-made select options. */
@Injectable()
export class CustomerLookupsStore {
  private readonly api = inject(LookupApi);
  private readonly resource = rxResource({
    stream: () => this.api.get(),
    defaultValue: EMPTY,
  });

  readonly data = computed(() => (this.resource.hasValue() ? this.resource.value() : EMPTY));
  readonly loading = this.resource.isLoading;

  readonly companyOptions = computed(() => toOptions(this.data().companies));
  readonly accountManagerOptions = computed(() => toOptions(this.data().accountManagers));
  readonly salesRepOptions = computed(() => toOptions(this.data().salesReps));
  readonly userOptions = computed(() => toOptions(this.data().users));
  readonly paymentTermOptions = computed(() => toOptions(this.data().paymentTerms));
  readonly currencyOptions = computed(() => toPlain(this.data().currencies));
  readonly taxProfileOptions = computed(() => toOptions(this.data().taxProfiles));
  readonly priceListOptions = computed(() => toOptions(this.data().priceLists));
  readonly slaOptions = computed(() =>
    this.data().slas.map((sla) => ({
      value: sla.id,
      label: `${sla.name} · ${sla.responseHours}h response`,
    })),
  );
  readonly serviceRegionOptions = computed(() => toPlain(this.data().serviceRegions));
  readonly countryOptions = computed(() => toPlain(this.data().countries.map((c) => c.name)));

  branchOptions(companyId: string): SelectOption[] {
    return toOptions(this.data().branches.filter((b) => !companyId || b.companyId === companyId));
  }

  territoryOptions(region: string | null): SelectOption[] {
    return toOptions(this.data().territories.filter((t) => !region || t.region === region));
  }

  regionOptions(country: string): SelectOption[] {
    const match = this.data().countries.find((c) => c.name === country);
    return toPlain(match?.regions.map((r) => r.name) ?? []);
  }

  cityOptions(country: string, region: string): SelectOption[] {
    const match = this.data().countries.find((c) => c.name === country);
    return toPlain(match?.regions.find((r) => r.name === region)?.cities ?? []);
  }

  allRegionOptions(): SelectOption[] {
    return toPlain([...new Set(this.data().countries.flatMap((c) => c.regions.map((r) => r.name)))]);
  }

  allCityOptions(): SelectOption[] {
    return toPlain(
      [...new Set(this.data().countries.flatMap((c) => c.regions.flatMap((r) => r.cities)))].sort(),
    );
  }

  name(
    collection: 'users' | 'slas' | 'territories' | 'paymentTerms' | 'taxProfiles' | 'priceLists' | 'companies' | 'branches',
    id: string | null | undefined,
  ): string | null {
    if (!id) return null;
    const items: readonly LookupItem[] = this.data()[collection];
    return items.find((item) => item.id === id)?.name ?? null;
  }
}
