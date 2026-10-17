import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { ChoiceOption } from '@shared/ui/select';
import type { AmcReferenceData } from '../models/reference.model';
import { AmcReferenceApi } from './amc.api';

const EMPTY: AmcReferenceData = {
  customers: [], sites: [], assets: [], assetCategories: [], services: [], serviceCategories: [], contracts: [], technicians: [], requests: [], users: [], slas: [],
  paymentTerms: [], taxProfiles: [], territories: [], serviceRegions: [], currencies: [], currentUser: { id: '', name: '', role: '' },
};

const plain = (items: readonly string[]): ChoiceOption[] => items.map((v) => ({ value: v, label: v }));
const named = (items: readonly { id: string; name: string }[]): ChoiceOption[] => items.map((i) => ({ value: i.id, label: i.name }));

/** Feature-scoped cache of upstream master data with ready-made select options. */
@Injectable()
export class AmcReferenceStore {
  private readonly api = inject(AmcReferenceApi);
  private readonly resource = rxResource({ stream: () => this.api.get(), defaultValue: EMPTY });

  readonly data = computed(() => (this.resource.hasValue() ? this.resource.value() : EMPTY));
  readonly customerOptions = computed<ChoiceOption[]>(() => this.data().customers.map((c) => ({ value: c.id, label: c.name, hint: c.status === 'Active' ? c.code : `${c.code} · ${c.status}` })));
  readonly userOptions = computed<ChoiceOption[]>(() => this.data().users.map((u) => ({ value: u.id, label: u.name, hint: u.role })));
  readonly managerOptions = computed<ChoiceOption[]>(() => this.data().users.filter((u) => u.role === 'Contract Manager' || u.role === 'Service Coordinator').map((u) => ({ value: u.id, label: u.name, hint: u.role })));
  readonly accountManagerOptions = computed<ChoiceOption[]>(() => this.data().users.filter((u) => u.role === 'Account Manager').map((u) => ({ value: u.id, label: u.name })));
  readonly slaOptions = computed<ChoiceOption[]>(() => this.data().slas.map((s) => ({ value: s.id, label: `${s.name} · ${s.responseHours}h / ${s.resolutionHours}h` })));
  readonly paymentTermOptions = computed(() => named(this.data().paymentTerms));
  readonly taxProfileOptions = computed(() => named(this.data().taxProfiles));
  readonly territoryOptions = computed<ChoiceOption[]>(() => this.data().territories.map((t) => ({ value: t.id, label: t.name, hint: t.region })));
  readonly regionOptions = computed(() => plain(this.data().serviceRegions));
  readonly currencyOptions = computed(() => plain(this.data().currencies));
  readonly assetCategoryOptions = computed(() => plain(this.data().assetCategories));
  readonly serviceCategoryOptions = computed(() => plain(this.data().serviceCategories));
  readonly serviceOptions = computed<ChoiceOption[]>(() => this.data().services.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}`, hint: s.status === 'Active' ? s.category : `${s.category} · ${s.status}` })));

  siteOptions(customerId: string | null | undefined, only: readonly string[] | null = null): ChoiceOption[] {
    return this.data().sites.filter((s) => (!customerId || s.customerId === customerId) && (!only || only.includes(s.id))).map((s) => ({ value: s.id, label: s.name, hint: s.city }));
  }

  assetOptions(customerId: string | null | undefined, siteIds: readonly string[] = [], only: readonly string[] | null = null): ChoiceOption[] {
    return this.data()
      .assets.filter((a) => (!customerId || a.customerId === customerId) && (!siteIds.length || siteIds.includes(a.siteId)) && (!only || only.includes(a.id)))
      .map((a) => ({ value: a.id, label: `${a.id} · ${a.name}`, hint: `${a.category} · ${this.siteName(a.siteId)}` }));
  }

  contractOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().contracts.filter((c) => !customerId || c.customerId === customerId).map((c) => ({ value: c.id, label: `${c.number} · ${c.title}`, hint: c.status }));
  }

  technicianOptions(region?: string | null): ChoiceOption[] {
    return this.data().technicians.map((t) => ({ value: t.name, label: t.name, hint: `${t.team} · ${t.region}${region && t.region !== region ? ' · other region' : ''}` }));
  }

  customer(id: string | null | undefined) {
    return id ? this.data().customers.find((c) => c.id === id) : undefined;
  }

  siteName(id: string | null | undefined): string {
    return (id && this.data().sites.find((s) => s.id === id)?.name) || '';
  }

  userName(id: string | null | undefined): string {
    return (id && this.data().users.find((u) => u.id === id)?.name) || '';
  }

  serviceName(id: string | null | undefined): string {
    return (id && this.data().services.find((s) => s.id === id)?.name) || '';
  }

  named(list: 'slas' | 'paymentTerms' | 'taxProfiles' | 'territories', id: string | null | undefined): string | null {
    return id ? ((this.data()[list] as readonly { id: string; name: string }[]).find((x) => x.id === id)?.name ?? null) : null;
  }
}
