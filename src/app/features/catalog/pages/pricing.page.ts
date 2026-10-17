import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors, Validators } from '@angular/forms';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { formatCurrency } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { priceRuleColumns } from '../components/catalog-columns';
import { CatalogReferenceStore } from '../data/catalog-reference.store';
import { PricingApi, ServiceCatalogApi } from '../data/catalog.api';
import { PRICING_MODELS, type PriceQuote, type PriceRuleListItem, type PricingModel } from '../models/pricing.model';

function effectiveRange(group: AbstractControl): ValidationErrors | null {
  const from = group.get('effectiveFrom')?.value as string;
  const to = group.get('effectiveTo')?.value as string;
  return from && to && to < from ? { range: true } : null;
}

/** SRS 4.8 — pricing maintained independently with effective dates and scoped rules. */
@Component({
  selector: 'amc-pricing-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, PageHeader, ReactiveFormsModule, Select, Spinner, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Service Pricing & Commercial Rules" subtitle="Prices by customer, customer category, contract / AMC, region, service type and effective date — independent of the service definition." [breadcrumbs]="[{ label: 'Service Catalog', path: '/app/catalog/dashboard' }, { label: 'Pricing' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Add Price Rule</button>
      </amc-page-header>

      <!-- Price simulator -->
      <section class="amc-card p-4 sm:p-5">
        <h2 class="text-sm font-semibold text-ink">Price simulator</h2>
        <p class="text-xs text-ink-muted">Resolves the applicable rule — the most specific matching scope with an effective date wins.</p>
        <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <amc-form-field label="Service" for="sim-service" class="lg:col-span-2"><amc-select inputId="sim-service" placeholder="Select service…" [options]="serviceOptions()" [(value)]="simService" /></amc-form-field>
          <amc-form-field label="Customer" for="sim-customer"><amc-select inputId="sim-customer" placeholder="Any customer" [options]="refs.customerOptions()" [clearable]="true" [(value)]="simCustomer" /></amc-form-field>
          <amc-form-field label="Contract / AMC" for="sim-agreement"><amc-select inputId="sim-agreement" placeholder="None" [options]="simAgreements()" [clearable]="true" [(value)]="simAgreement" /></amc-form-field>
          <amc-form-field label="Date" for="sim-date"><amc-date-picker inputId="sim-date" [(value)]="simDate" /></amc-form-field>
          <amc-form-field label="Quantity" for="sim-qty"><input id="sim-qty" type="number" min="1" class="amc-input tabular-nums" [value]="simQty()" (input)="simQty.set(+$any($event.target).value || 1)" /></amc-form-field>
        </div>
        <div class="mt-3 flex justify-end">
          <button type="button" class="amc-btn-primary" [disabled]="!simService() || quoting()" (click)="simulate()">@if (quoting()) { <amc-spinner [size]="14" /> } @else { <amc-icon name="receipt" /> } Calculate price</button>
        </div>
        @if (quote(); as q) {
          <div class="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-brand/30 bg-brand-subtle p-4 text-sm sm:grid-cols-5">
            <div class="col-span-2"><p class="text-xs text-ink-muted">Applied rule</p><p class="font-medium text-ink">{{ q.source }}</p></div>
            <div><p class="text-xs text-ink-muted">Model</p><p class="font-medium text-ink">{{ q.model }}</p></div>
            <div><p class="text-xs text-ink-muted">Unit price × qty</p><p class="font-medium tabular-nums text-ink">{{ formatCurrency(q.unitPrice, q.currency) }} × {{ q.quantity }}</p></div>
            <div><p class="text-xs text-ink-muted">Charge</p><p class="text-lg font-semibold tabular-nums text-ink">{{ formatCurrency(q.charged, q.currency) }}</p></div>
            @if (q.notes.length) {
              <ul class="col-span-2 space-y-0.5 text-xs text-ink-muted sm:col-span-5">@for (n of q.notes; track n) { <li>• {{ n }}</li> }</ul>
            }
          </div>
        }
      </section>

      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4">
          <amc-filter-bar searchPlaceholder="Search service, customer or contract…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" />
        </div>
        <amc-data-table tableId="catalog-pricing" [entity]="{ singular: 'price rule', plural: 'price rules' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="rules.isLoading()" [actions]="rowActions" emptyIcon="receipt" emptyTitle="No price rules match" emptyMessage="Try a different search or clear the filters." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Edit price rule' : 'Add price rule'" description="Leave scope fields empty to apply to everyone. Effective dates control when the price applies." [(open)]="formOpen">
      <form [formGroup]="form" id="price-form" novalidate (ngSubmit)="save()">
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Service" for="pr-service" [control]="form.controls.serviceId" class="sm:col-span-2">
            <amc-select inputId="pr-service" formControlName="serviceId" [options]="serviceOptions()" placeholder="Select service…" />
          </amc-form-field>
          <amc-form-field label="Price List" for="pr-pl" [control]="form.controls.priceListId"><amc-select inputId="pr-pl" formControlName="priceListId" [options]="refs.priceListOptions()" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Pricing Model" for="pr-model" [control]="form.controls.model"><amc-select inputId="pr-model" formControlName="model" [options]="modelOptions" /></amc-form-field>
          <amc-form-field label="Customer" for="pr-customer" [control]="form.controls.customerId" hint="Customer-specific price."><amc-select inputId="pr-customer" formControlName="customerId" [options]="refs.customerOptions()" placeholder="Any customer" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Contract / AMC" for="pr-agreement" [control]="form.controls.agreementId"><amc-select inputId="pr-agreement" formControlName="agreementId" [options]="formAgreements()" placeholder="Any agreement" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Customer Type" for="pr-ctype" [control]="form.controls.customerType"><amc-select inputId="pr-ctype" formControlName="customerType" [options]="refs.customerTypeOptions()" placeholder="Any type" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Customer Category" for="pr-ccat" [control]="form.controls.customerCategory"><amc-select inputId="pr-ccat" formControlName="customerCategory" [options]="refs.customerCategoryOptions()" placeholder="Any category" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Service Region" for="pr-region" [control]="form.controls.serviceRegion"><amc-select inputId="pr-region" formControlName="serviceRegion" [options]="refs.regionOptions()" placeholder="Any region" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Currency" for="pr-currency" [control]="form.controls.currency"><amc-select inputId="pr-currency" formControlName="currency" [options]="refs.currencyOptions()" /></amc-form-field>
          <amc-form-field label="Unit" for="pr-unit" [control]="form.controls.unit"><input id="pr-unit" class="amc-input" formControlName="unit" /></amc-form-field>
          <amc-form-field label="Base Price" for="pr-base" [control]="form.controls.basePrice"><input id="pr-base" type="number" min="0" class="amc-input tabular-nums" formControlName="basePrice" /></amc-form-field>
          <amc-form-field label="Minimum Charge" for="pr-min" [control]="form.controls.minCharge"><input id="pr-min" type="number" min="0" class="amc-input tabular-nums" formControlName="minCharge" /></amc-form-field>
          <amc-form-field label="Maximum Charge" for="pr-max" [control]="form.controls.maxCharge"><input id="pr-max" type="number" min="0" class="amc-input tabular-nums" formControlName="maxCharge" /></amc-form-field>
          <amc-form-field label="Tax Profile" for="pr-tax" [control]="form.controls.taxProfileId"><amc-select inputId="pr-tax" formControlName="taxProfileId" [options]="refs.taxProfileOptions()" [clearable]="true" /></amc-form-field>
          <div class="flex items-end pb-1"><amc-switch formControlName="discountAllowed" label="Discount Allowed" /></div>
          <amc-form-field label="Discount Limit (%)" for="pr-disc" [control]="form.controls.discountLimit"><input id="pr-disc" type="number" min="0" max="100" class="amc-input tabular-nums" formControlName="discountLimit" /></amc-form-field>
          <amc-form-field label="Effective From" for="pr-from" [control]="form.controls.effectiveFrom"><amc-date-picker inputId="pr-from" formControlName="effectiveFrom" /></amc-form-field>
          <amc-form-field label="Effective To" for="pr-to" [control]="form.controls.effectiveTo" hint="Leave empty for open-ended.">
            <amc-date-picker inputId="pr-to" formControlName="effectiveTo" />
            @if (form.hasError('range') && form.touched) { <p class="text-xs text-danger" role="alert">Effective To must be on or after Effective From.</p> }
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="price-form" class="amc-btn-primary" [disabled]="saving()">@if (saving()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class PricingPage {
  private readonly api = inject(PricingApi);
  private readonly servicesApi = inject(ServiceCatalogApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(CatalogReferenceStore);

  readonly serviceId = input<string>();

  protected readonly rules = rxResource({ stream: () => this.api.list() });
  private readonly services = rxResource({ stream: () => this.servicesApi.list() });
  protected readonly rows = computed(() => (this.rules.hasValue() ? this.rules.value() : []));
  protected readonly serviceOptions = computed(() => (this.services.hasValue() ? this.services.value() : []).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}`, hint: s.status })));
  protected readonly columns = priceRuleColumns();
  protected readonly trackById = (r: PriceRuleListItem) => r.id;
  protected readonly modelOptions = toOptions(PRICING_MODELS);
  protected readonly formatCurrency = formatCurrency;

  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.serviceId() ? { service: [this.serviceId()!], state: ['Active', 'Scheduled'] } : { state: ['Active', 'Scheduled'] }));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'service', label: 'Service', type: 'multiselect', options: this.serviceOptions() },
    { key: 'state', label: 'State', type: 'multiselect', options: toOptions(['Active', 'Scheduled', 'Expired'] as const) },
    { key: 'model', label: 'Pricing Model', type: 'multiselect', options: this.modelOptions },
    { key: 'priceList', label: 'Price List', type: 'multiselect', options: this.refs.priceListOptions() },
    { key: 'type', label: 'Service Type', type: 'multiselect', options: toOptions([...new Set(this.rows().map((r) => r.serviceType))].sort()) },
    { key: 'scope', label: 'Scope', type: 'multiselect', options: toOptions(['Customer', 'Contract / AMC', 'Customer Category', 'Customer Type', 'Service Region', 'All customers'] as const) },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const scopes = (f['scope'] as readonly string[] | undefined) ?? [];
    const hasScope = (r: PriceRuleListItem) =>
      !scopes.length ||
      scopes.some((s) => (s === 'Customer' && r.customerId) || (s === 'Contract / AMC' && r.agreementId) || (s === 'Customer Category' && r.customerCategory) || (s === 'Customer Type' && r.customerType) || (s === 'Service Region' && r.serviceRegion) || (s === 'All customers' && r.specificity <= 1));
    return this.rows().filter(
      (r) =>
        (!term || `${r.serviceCode} ${r.serviceName} ${r.scope} ${r.priceListName ?? ''}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'service', r.serviceId) && matchesAny(f, 'state', r.state) && matchesAny(f, 'model', r.model) && matchesAny(f, 'priceList', r.priceListId) && matchesAny(f, 'type', r.serviceType) && hasScope(r),
    );
  });
  protected readonly rowActions = (): MenuItem[] => [
    { id: 'edit', label: 'Edit', icon: 'pencil' },
    { id: 'copy', label: 'New version from this rule', icon: 'copy' },
    { id: 'simulate', label: 'Simulate', icon: 'receipt' },
  ];

  // ----- Simulator ------------------------------------------------------------
  protected readonly simService = signal<string | number | null>(null);
  protected readonly simCustomer = signal<string | number | null>(null);
  protected readonly simAgreement = signal<string | number | null>(null);
  protected readonly simDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly simQty = signal(1);
  protected readonly quote = signal<PriceQuote | null>(null);
  protected readonly quoting = signal(false);
  protected readonly simAgreements = computed(() => (this.simCustomer() ? [...this.refs.agreementOptions('Contract', String(this.simCustomer())), ...this.refs.agreementOptions('AMC', String(this.simCustomer()))] : []));

  protected async simulate(): Promise<void> {
    if (!this.simService()) return;
    this.quoting.set(true);
    try {
      this.quote.set(await firstValueFrom(this.api.quote({ serviceId: String(this.simService()), customerId: this.simCustomer() ? String(this.simCustomer()) : null, agreementId: this.simAgreement() ? String(this.simAgreement()) : null, serviceRegion: null, date: this.simDate(), quantity: this.simQty() })));
    } finally {
      this.quoting.set(false);
    }
  }

  // ----- Form -----------------------------------------------------------------
  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<PriceRuleListItem | null>(null);
  protected readonly form = this.fb.group(
    {
      serviceId: this.fb.control('', Validators.required),
      priceListId: this.fb.control('PL-STD'),
      customerId: this.fb.control(''),
      customerType: this.fb.control(''),
      customerCategory: this.fb.control(''),
      agreementId: this.fb.control(''),
      serviceRegion: this.fb.control(''),
      model: this.fb.control<PricingModel>('Fixed Price', Validators.required),
      currency: this.fb.control('SAR', Validators.required),
      unit: this.fb.control('Visit', Validators.required),
      basePrice: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
      minCharge: this.fb.control<number | null>(null, Validators.min(0)),
      maxCharge: this.fb.control<number | null>(null, Validators.min(0)),
      discountAllowed: this.fb.control(true),
      discountLimit: this.fb.control<number | null>(10, [Validators.min(0), Validators.max(100)]),
      taxProfileId: this.fb.control('TAX-STD'),
      effectiveFrom: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
      effectiveTo: this.fb.control(''),
    },
    { validators: effectiveRange },
  );
  private readonly formCustomer = signal('');
  protected readonly formAgreements = computed(() => [...this.refs.agreementOptions('Contract', this.formCustomer() || null), ...this.refs.agreementOptions('AMC', this.formCustomer() || null)]);

  constructor() {
    this.form.controls.customerId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => this.formCustomer.set(id));
    this.form.controls.serviceId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const s = (this.services.hasValue() ? this.services.value() : []).find((x) => x.id === id);
      if (s && !this.editing()) this.form.patchValue({ unit: s.operational.unit, basePrice: this.form.controls.basePrice.value ?? s.commercial.standardPrice, currency: s.commercial.currency });
    });
  }

  protected openForm(rule: PriceRuleListItem | null, asNewVersion = false): void {
    this.editing.set(asNewVersion ? null : rule);
    this.form.reset({
      serviceId: rule?.serviceId ?? this.serviceId() ?? '', priceListId: rule?.priceListId ?? 'PL-STD', customerId: rule?.customerId ?? '', customerType: rule?.customerType ?? '',
      customerCategory: rule?.customerCategory ?? '', agreementId: rule?.agreementId ?? '', serviceRegion: rule?.serviceRegion ?? '', model: rule?.model ?? 'Fixed Price',
      currency: rule?.currency ?? 'SAR', unit: rule?.unit ?? 'Visit', basePrice: rule?.basePrice ?? null, minCharge: rule?.minCharge ?? null, maxCharge: rule?.maxCharge ?? null,
      discountAllowed: rule?.discountAllowed ?? true, discountLimit: rule?.discountLimit ?? 10, taxProfileId: rule?.taxProfileId ?? 'TAX-STD',
      effectiveFrom: asNewVersion ? new Date().toISOString().slice(0, 10) : (rule?.effectiveFrom ?? new Date().toISOString().slice(0, 10)), effectiveTo: asNewVersion ? '' : (rule?.effectiveTo ?? ''),
    });
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const nul = (x: string) => x || null;
    const input = {
      ...v, priceListId: nul(v.priceListId), customerId: nul(v.customerId), customerType: nul(v.customerType), customerCategory: nul(v.customerCategory), agreementId: nul(v.agreementId),
      serviceRegion: nul(v.serviceRegion), taxProfileId: nul(v.taxProfileId), effectiveTo: nul(v.effectiveTo), basePrice: Number(v.basePrice),
    };
    this.saving.set(true);
    try {
      const rule = this.editing();
      await firstValueFrom(rule ? this.api.update(rule.id, input) : this.api.create(input));
      this.notify.success('Price rule saved.');
      this.formOpen.set(false);
      this.rules.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected onAction({ id, row }: RowAction<PriceRuleListItem>): void {
    if (id === 'edit') this.openForm(row);
    else if (id === 'copy') this.openForm(row, true);
    else {
      this.simService.set(row.serviceId);
      this.simCustomer.set(row.customerId);
      this.simAgreement.set(row.agreementId);
      void this.simulate();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  protected export(): void {
    downloadCsv(
      timestampedName('service-pricing', 'csv'),
      ['Service Code', 'Service', 'Price List', 'Applies To', 'Customer Type', 'Customer Category', 'Contract / AMC', 'Region', 'Model', 'Currency', 'Unit', 'Base Price', 'Min Charge', 'Max Charge', 'Discount Allowed', 'Discount Limit %', 'Tax Profile', 'Effective From', 'Effective To', 'State'],
      this.filtered().map((r) => [r.serviceCode, r.serviceName, r.priceListName, r.scope, r.customerType, r.customerCategory, r.agreementNumber, r.serviceRegion, r.model, r.currency, r.unit, r.basePrice, r.minCharge, r.maxCharge, r.discountAllowed ? 'Yes' : 'No', r.discountLimit, r.taxProfileName, r.effectiveFrom, r.effectiveTo, r.state]),
    );
  }
}
