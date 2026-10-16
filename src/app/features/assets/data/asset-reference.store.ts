import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { ChoiceOption } from '@shared/ui/select';
import type { AgreementKind } from '../models/coverage.model';
import type { AssetReferenceData, CustomerRef, SiteRef } from '../models/reference.model';
import { AssetReferenceApi } from './asset.api';

const EMPTY: AssetReferenceData = {
  customers: [],
  sites: [],
  agreements: [],
  slas: [],
  territories: [],
  serviceRegions: [],
  technicians: [],
  users: [],
  currencies: [],
  currentUser: '',
};

const plain = (items: readonly string[]): ChoiceOption[] => items.map((value) => ({ value, label: value }));

/** Feature-scoped cache of upstream master data with ready-made select options. */
@Injectable()
export class AssetReferenceStore {
  private readonly api = inject(AssetReferenceApi);
  private readonly resource = rxResource({ stream: () => this.api.get(), defaultValue: EMPTY });

  readonly data = computed(() => (this.resource.hasValue() ? this.resource.value() : EMPTY));
  readonly loading = this.resource.isLoading;

  private readonly customerMap = computed(() => new Map(this.data().customers.map((c) => [c.id, c])));
  private readonly siteMap = computed(() => new Map(this.data().sites.map((s) => [s.id, s])));

  readonly customerOptions = computed<ChoiceOption[]>(() =>
    this.data().customers.map((c) => ({ value: c.id, label: c.name, hint: c.status === 'Active' ? c.code : `${c.code} · ${c.status}` })),
  );
  readonly slaOptions = computed<ChoiceOption[]>(() =>
    this.data().slas.map((s) => ({ value: s.id, label: `${s.name} · ${s.responseHours}h response` })),
  );
  readonly regionOptions = computed(() => plain(this.data().serviceRegions));
  readonly technicianOptions = computed(() => plain(this.data().technicians));
  readonly userOptions = computed(() => plain(this.data().users));
  readonly currencyOptions = computed(() => plain(this.data().currencies));
  readonly allSiteOptions = computed<ChoiceOption[]>(() =>
    this.data().sites.map((s) => ({ value: s.id, label: s.name, hint: this.customer(s.customerId)?.name })),
  );

  customer(id: string | null | undefined): CustomerRef | undefined {
    return id ? this.customerMap().get(id) : undefined;
  }

  site(id: string | null | undefined): SiteRef | undefined {
    return id ? this.siteMap().get(id) : undefined;
  }

  siteOptions(customerId: string | null | undefined): ChoiceOption[] {
    return this.data()
      .sites.filter((s) => !customerId || s.customerId === customerId)
      .map((s) => ({ value: s.id, label: s.name, hint: s.status === 'Active' ? s.city : `${s.city} · ${s.status}` }));
  }

  agreementOptions(kind: AgreementKind, customerId: string | null | undefined, siteId: string | null | undefined): ChoiceOption[] {
    return this.data()
      .agreements.filter(
        (a) => a.kind === kind && (!customerId || a.customerId === customerId) && (!siteId || a.siteIds.includes(siteId)),
      )
      .map((a) => ({ value: a.id, label: `${a.number} · ${a.title}`, hint: a.status }));
  }

  territoryOptions(region: string | null | undefined): ChoiceOption[] {
    return this.data()
      .territories.filter((t) => !region || t.region === region)
      .map((t) => ({ value: t.id, label: t.name }));
  }

  slaName(id: string | null | undefined): string | null {
    return id ? (this.data().slas.find((s) => s.id === id)?.name ?? null) : null;
  }

  territoryName(id: string | null | undefined): string | null {
    return id ? (this.data().territories.find((t) => t.id === id)?.name ?? null) : null;
  }

  agreementLabel(id: string | null | undefined): string | null {
    const agreement = id ? this.data().agreements.find((a) => a.id === id) : undefined;
    return agreement ? `${agreement.number} · ${agreement.title}` : null;
  }
}
