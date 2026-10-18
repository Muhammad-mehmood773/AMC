import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { ChoiceOption } from '@shared/ui/select';
import type { PmReferenceData } from '../models/reference.model';
import { PmReferenceApi } from './pm.api';

const EMPTY: PmReferenceData = { customers: [], sites: [], assets: [], assetCategories: [], services: [], serviceCategories: [], contracts: [], amcs: [], slas: [], technicians: [], teams: [], regions: [], users: [], holidays: [], currentUser: { id: '', name: '', role: '' } };
const plain = (items: readonly string[]): ChoiceOption[] => items.map((v) => ({ value: v, label: v }));

/** Feature-scoped cache of master data, parts, plans, checklists and tasks. */
@Injectable()
export class PmReferenceStore {
  private readonly api = inject(PmReferenceApi);
  private readonly version = signal(0);
  private readonly resource = rxResource({ stream: () => this.api.get(), defaultValue: EMPTY });
  private readonly partsRes = rxResource({ params: () => this.version(), stream: () => this.api.parts(), defaultValue: [] });
  private readonly plansRes = rxResource({ params: () => this.version(), stream: () => this.api.planOptions(), defaultValue: [] });
  private readonly checklistsRes = rxResource({ params: () => this.version(), stream: () => this.api.checklists(), defaultValue: [] });
  private readonly tasksRes = rxResource({ params: () => this.version(), stream: () => this.api.tasks(), defaultValue: [] });

  readonly data = computed(() => (this.resource.hasValue() ? this.resource.value() : EMPTY));
  readonly parts = computed(() => (this.partsRes.hasValue() ? this.partsRes.value() : []));
  readonly customerOptions = computed<ChoiceOption[]>(() => this.data().customers.map((c) => ({ value: c.id, label: c.name, hint: c.code })));
  readonly categoryOptions = computed(() => plain(this.data().assetCategories));
  readonly serviceOptions = computed<ChoiceOption[]>(() => this.data().services.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}`, hint: s.category })));
  readonly serviceCategoryOptions = computed(() => plain(this.data().serviceCategories));
  readonly slaOptions = computed<ChoiceOption[]>(() => this.data().slas.map((s) => ({ value: s.id, label: s.name, hint: `${s.responseHours}h / ${s.resolutionHours}h` })));
  readonly teamOptions = computed(() => plain(this.data().teams));
  readonly regionOptions = computed(() => plain(this.data().regions));
  readonly technicianOptions = computed<ChoiceOption[]>(() => this.data().technicians.map((t) => ({ value: t.name, label: t.name, hint: `${t.team} · ${t.region}` })));
  readonly partOptions = computed<ChoiceOption[]>(() => this.parts().map((p) => ({ value: p.partNumber, label: `${p.partNumber} · ${p.description}`, hint: `${p.kind} · ${p.stock - p.reserved} ${p.unit} available` })));
  readonly planOptions = computed<ChoiceOption[]>(() => (this.plansRes.hasValue() ? this.plansRes.value() : []).map((p) => ({ value: p.id, label: `${p.number} · ${p.name}`, hint: p.status })));
  readonly checklistOptions = computed<ChoiceOption[]>(() => (this.checklistsRes.hasValue() ? this.checklistsRes.value() : []).map((c) => ({ value: c.id, label: c.name, hint: `${c.items} items` })));
  readonly taskOptions = computed<ChoiceOption[]>(() => (this.tasksRes.hasValue() ? this.tasksRes.value() : []).map((t) => ({ value: t.id, label: `${t.sequence}. ${t.name}` })));

  refresh(): void {
    this.version.update((v) => v + 1);
  }

  siteOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().sites.filter((s) => !customerId || s.customerId === customerId).map((s) => ({ value: s.id, label: s.name, hint: s.city }));
  }

  assetOptions(customerId: string | null | undefined, siteId?: string | null): ChoiceOption[] {
    return this.data().assets.filter((a) => (!customerId || a.customerId === customerId) && (!siteId || a.siteId === siteId)).map((a) => ({ value: a.id, label: `${a.id} · ${a.name}`, hint: `${a.category} · ${a.serialNumber}` }));
  }

  contractOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().contracts.filter((c) => !customerId || c.customerId === customerId).map((c) => ({ value: c.id, label: `${c.number} · ${c.name}`, hint: c.status }));
  }

  amcOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data().amcs.filter((a) => !customerId || a.customerId === customerId).map((a) => ({ value: a.id, label: `${a.number} · ${a.name}`, hint: a.status }));
  }

  asset(id: string | null | undefined) {
    return id ? this.data().assets.find((a) => a.id === id) : undefined;
  }

  customer(id: string | null | undefined) {
    return id ? this.data().customers.find((c) => c.id === id) : undefined;
  }

  part(partNumber: string) {
    return this.parts().find((p) => p.partNumber === partNumber);
  }

  siteName(id: string | null | undefined): string {
    return (id && this.data().sites.find((s) => s.id === id)?.name) || '';
  }
}
