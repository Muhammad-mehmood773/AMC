import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { ChoiceOption } from '@shared/ui/select';
import type { SlaReferenceData } from '../models/reference.model';
import { SlaReferenceApi } from './sla.api';

const EMPTY: SlaReferenceData = {
  customers: [], sites: [], assets: [], assetCategories: [], services: [], serviceCategories: [], serviceTypes: [], contracts: [], amcs: [], users: [], teams: [], technicians: [], regions: [], currencies: [], currentUser: { id: '', name: '', role: '' },
};

const plain = (items: readonly string[]): ChoiceOption[] => items.map((v) => ({ value: v, label: v }));

/** Feature-scoped cache of upstream master data, SLAs and calendars with ready-made options. */
@Injectable()
export class SlaReferenceStore {
  private readonly api = inject(SlaReferenceApi);
  private readonly version = signal(0);
  private readonly resource = rxResource({ stream: () => this.api.get(), defaultValue: EMPTY });
  private readonly calendarsRes = rxResource({ params: () => this.version(), stream: () => this.api.calendars(), defaultValue: [] });
  private readonly slasRes = rxResource({ params: () => this.version(), stream: () => this.api.slaOptions(), defaultValue: [] });

  readonly data = computed(() => (this.resource.hasValue() ? this.resource.value() : EMPTY));
  readonly calendars = computed(() => (this.calendarsRes.hasValue() ? this.calendarsRes.value() : []));
  readonly slas = computed(() => (this.slasRes.hasValue() ? this.slasRes.value() : []));

  readonly customerOptions = computed<ChoiceOption[]>(() => this.data().customers.map((c) => ({ value: c.id, label: c.name, hint: c.status === 'Active' ? c.code : `${c.code} · ${c.status}` })));
  readonly userOptions = computed<ChoiceOption[]>(() => this.data().users.map((u) => ({ value: u.id, label: u.name, hint: u.role })));
  readonly serviceOptions = computed<ChoiceOption[]>(() => this.data().services.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}`, hint: s.category })));
  readonly serviceCategoryOptions = computed(() => plain(this.data().serviceCategories));
  readonly serviceTypeOptions = computed(() => plain(this.data().serviceTypes));
  readonly assetCategoryOptions = computed(() => plain(this.data().assetCategories));
  readonly regionOptions = computed(() => plain(this.data().regions));
  readonly teamOptions = computed(() => plain(this.data().teams));
  readonly currencyOptions = computed(() => plain(this.data().currencies));
  readonly technicianOptions = computed<ChoiceOption[]>(() => this.data().technicians.map((t) => ({ value: t.name, label: t.name, hint: `${t.team} · ${t.region}` })));
  readonly calendarOptions = computed<ChoiceOption[]>(() => this.calendars().map((c) => ({ value: c.id, label: c.name, hint: `${c.type} · ${c.timeZone}${c.status === 'Active' ? '' : ' · Inactive'}` })));
  readonly slaOptions = computed<ChoiceOption[]>(() => this.slas().map((s) => ({ value: s.id, label: `${s.number} · ${s.name}`, hint: s.status })));

  refresh(): void {
    this.version.update((v) => v + 1);
  }

  siteOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().sites.filter((s) => !customerId || s.customerId === customerId).map((s) => ({ value: s.id, label: s.name, hint: s.city }));
  }

  assetOptions(customerId: string | null | undefined, siteId?: string | null): ChoiceOption[] {
    return this.data().assets.filter((a) => (!customerId || a.customerId === customerId) && (!siteId || a.siteId === siteId)).map((a) => ({ value: a.id, label: `${a.id} · ${a.name}`, hint: a.category }));
  }

  contractOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().contracts.filter((c) => !customerId || c.customerId === customerId).map((c) => ({ value: c.id, label: `${c.number} · ${c.name}`, hint: c.status }));
  }

  amcOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().amcs.filter((a) => !customerId || a.customerId === customerId).map((a) => ({ value: a.id, label: `${a.number} · ${a.name}`, hint: a.status }));
  }

  customer(id: string | null | undefined) {
    return id ? this.data().customers.find((c) => c.id === id) : undefined;
  }

  userName(id: string | null | undefined): string {
    return (id && this.data().users.find((u) => u.id === id)?.name) || '';
  }

  calendarName(id: string | null | undefined): string {
    return (id && this.calendars().find((c) => c.id === id)?.name) || '';
  }
}
