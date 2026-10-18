import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { ChoiceOption } from '@shared/ui/select';
import type { SrReferenceData } from '../models/reference.model';
import { SrReferenceApi } from './sr.api';
import { SUBCATEGORIES } from './sr.config';

const EMPTY: SrReferenceData = { customers: [], contacts: [], sites: [], assets: [], services: [], serviceCategories: [], contracts: [], amcs: [], slas: [], technicians: [], teams: [], regions: [], branches: [], companies: [], parts: [], users: [], currentUser: { id: '', name: '', role: '' } };
const plain = (items: readonly string[]): ChoiceOption[] => items.map((v) => ({ value: v, label: v }));
const INACTIVE_ASSET = ['Retired', 'Decommissioned', 'Disposed', 'Inactive'];

/** Feature-scoped cache of upstream master data with ready-made options. */
@Injectable()
export class SrReferenceStore {
  private readonly api = inject(SrReferenceApi);
  private readonly resource = rxResource({ stream: () => this.api.get(), defaultValue: EMPTY });

  readonly data = computed(() => (this.resource.hasValue() ? this.resource.value() : EMPTY));
  readonly customerOptions = computed<ChoiceOption[]>(() => this.data().customers.map((c) => ({ value: c.id, label: c.name, hint: c.status === 'Active' ? c.code : `${c.code} · ${c.status}` })));
  readonly categoryOptions = computed(() => plain(this.data().serviceCategories));
  readonly teamOptions = computed(() => plain(this.data().teams));
  readonly technicianOptions = computed<ChoiceOption[]>(() => this.data().technicians.map((t) => ({ value: t.name, label: t.name, hint: `${t.team} · ${t.region}` })));
  readonly regionOptions = computed(() => plain(this.data().regions));
  readonly branchOptions = computed(() => plain(this.data().branches));
  readonly companyOptions = computed(() => plain(this.data().companies));
  readonly slaOptions = computed<ChoiceOption[]>(() => this.data().slas.map((s) => ({ value: s.id, label: `${s.number} · ${s.name}` })));
  readonly agreementOptions = computed<ChoiceOption[]>(() => [...this.data().amcs.map((a) => ({ value: a.id, label: a.number, hint: 'AMC' })), ...this.data().contracts.map((c) => ({ value: c.id, label: c.number, hint: 'Contract' }))]);
  readonly serviceOptions = computed<ChoiceOption[]>(() => this.data().services.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}`, hint: s.category })));
  readonly partOptions = computed<ChoiceOption[]>(() => this.data().parts.map((p) => ({ value: p.partNumber, label: `${p.partNumber} · ${p.description}` })));

  siteOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().sites.filter((s) => !customerId || s.customerId === customerId).map((s) => ({ value: s.id, label: s.name, hint: s.city }));
  }

  /** Only active assets of the selected site / customer (SRS 9.9). */
  assetOptions(customerId: string | null | undefined, siteId?: string | null, includeInactive = false): ChoiceOption[] {
    return this.data().assets.filter((a) => (!customerId || a.customerId === customerId) && (!siteId || a.siteId === siteId) && (includeInactive || !INACTIVE_ASSET.includes(a.status))).map((a) => ({ value: a.id, label: `${a.id} · ${a.name}`, hint: `${a.serialNumber} · ${a.warrantyStatus}` }));
  }

  contactOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().contacts.filter((c) => c.customerId === customerId).map((c) => ({ value: c.id, label: c.name, hint: c.phone }));
  }

  subcategoryOptions(category: string | null | undefined): ChoiceOption[] {
    return plain(SUBCATEGORIES[category ?? ''] ?? []);
  }

  customer(id: string | null | undefined) {
    return id ? this.data().customers.find((c) => c.id === id) : undefined;
  }

  site(id: string | null | undefined) {
    return id ? this.data().sites.find((s) => s.id === id) : undefined;
  }

  asset(id: string | null | undefined) {
    return id ? this.data().assets.find((a) => a.id === id) : undefined;
  }

  contact(id: string | null | undefined) {
    return id ? this.data().contacts.find((c) => c.id === id) : undefined;
  }
}
