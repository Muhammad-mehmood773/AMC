import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { ChoiceOption } from '@shared/ui/select';
import type { ContractReferenceData } from '../models/shared.model';
import { ContractReferenceApi } from './contract.api';

const EMPTY: ContractReferenceData = {
  customers: [], sites: [], assets: [], services: [], entitlements: [], serviceHistory: [], users: [], companies: [], branches: [], slas: [],
  paymentTerms: [], taxProfiles: [], currencies: [], serviceCategories: [], currentUser: { id: '', name: '', role: '', email: '' },
};

const named = (items: readonly { id: string; name: string }[]): ChoiceOption[] => items.map((i) => ({ value: i.id, label: i.name }));

/** Feature-scoped cache of upstream master data with ready-made select options. */
@Injectable()
export class ContractReferenceStore {
  private readonly api = inject(ContractReferenceApi);
  private readonly resource = rxResource({ stream: () => this.api.get(), defaultValue: EMPTY });

  readonly data = computed(() => (this.resource.hasValue() ? this.resource.value() : EMPTY));
  readonly customerOptions = computed<ChoiceOption[]>(() => this.data().customers.map((c) => ({ value: c.id, label: c.name, hint: c.status === 'Active' ? c.code : `${c.code} · ${c.status}` })));
  readonly userOptions = computed<ChoiceOption[]>(() => this.data().users.map((u) => ({ value: u.id, label: u.name, hint: u.role })));
  readonly companyOptions = computed(() => named(this.data().companies));
  readonly branchOptions = computed(() => named(this.data().branches));
  readonly slaOptions = computed<ChoiceOption[]>(() => this.data().slas.map((s) => ({ value: s.id, label: `${s.name} · ${s.responseHours}h / ${s.resolutionHours}h` })));
  readonly paymentTermOptions = computed(() => named(this.data().paymentTerms));
  readonly taxProfileOptions = computed(() => named(this.data().taxProfiles));
  readonly currencyOptions = computed<ChoiceOption[]>(() => this.data().currencies.map((c) => ({ value: c, label: c })));
  readonly categoryOptions = computed<ChoiceOption[]>(() => this.data().serviceCategories.map((c) => ({ value: c, label: c })));
  readonly serviceOptions = computed<ChoiceOption[]>(() =>
    this.data().services.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}`, hint: s.status === 'Active' ? s.category : `${s.category} · ${s.status}` })),
  );

  usersByRole(...roles: string[]): ChoiceOption[] {
    return this.data().users.filter((u) => roles.includes(u.role)).map((u) => ({ value: u.id, label: u.name, hint: u.role }));
  }

  siteOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().sites.filter((s) => !customerId || s.customerId === customerId).map((s) => ({ value: s.id, label: s.name, hint: s.city }));
  }

  assetOptions(customerId: string | null | undefined, siteIds: readonly string[] = []): ChoiceOption[] {
    return this.data()
      .assets.filter((a) => (!customerId || a.customerId === customerId) && (!siteIds.length || siteIds.includes(a.siteId)))
      .map((a) => ({ value: a.id, label: `${a.id} · ${a.name}`, hint: a.category }));
  }

  userName(id: string | null | undefined): string | null {
    return id ? (this.data().users.find((u) => u.id === id)?.name ?? null) : null;
  }

  customer(id: string | null | undefined) {
    return id ? this.data().customers.find((c) => c.id === id) : undefined;
  }

  name(list: 'sites' | 'services' | 'slas' | 'paymentTerms' | 'taxProfiles' | 'companies' | 'branches', id: string | null | undefined): string | null {
    if (!id) return null;
    const item = (this.data()[list] as readonly { id: string; name: string }[]).find((x) => x.id === id);
    return item?.name ?? null;
  }
}
