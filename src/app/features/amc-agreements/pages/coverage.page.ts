import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { firstValueFrom, map, startWith } from 'rxjs';
import { coverageColumns } from '../components/amc-columns';
import { AmcReferenceStore } from '../data/amc-reference.store';
import { AmcApi, CoverageApi } from '../data/amc.api';
import { COVERAGE_RESULT_TONE } from '../models/display';
import { COVERAGE_LEVELS, COVERAGE_STATUSES, COVERAGE_TYPES, type CoverageDecision, type CoverageLevel, type CoverageListItem, type CoverageType, LABOR_COVERAGE, type LaborCoverage, PARTS_COVERAGE, type PartsCoverage } from '../models/operations.model';

@Component({
  selector: 'amc-coverage-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, PageHeader, ReactiveFormsModule, Select, Spinner, StatusBadge, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="AMC Coverage" subtitle="Exactly what is included in each service agreement — at customer, site, asset, category or service level." [breadcrumbs]="[{ label: 'AMC / Service Contracts', path: '/app/amc-agreements/dashboard' }, { label: 'Coverage' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-secondary" (click)="openValidate()"><amc-icon name="shield-check" /> Validate Coverage</button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Add Coverage</button>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search AMC, customer, site, asset or service…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="amc-coverage" [entity]="{ singular: 'coverage line', plural: 'coverage lines' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="lines.isLoading()" [actions]="rowActions" emptyIcon="shield-check" emptyTitle="No coverage lines" emptyMessage="Add coverage to define what an AMC includes." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Edit coverage' : 'Add coverage'" [(open)]="formOpen">
      <form [formGroup]="form" id="coverage-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="AMC" for="cv-amc" [control]="c.amcId" class="sm:col-span-2"><amc-select inputId="cv-amc" formControlName="amcId" [options]="amcOptions()" placeholder="Select AMC…" /></amc-form-field>
          <amc-form-field label="Coverage Level" for="cv-level" [control]="c.level"><amc-select inputId="cv-level" formControlName="level" [options]="levelOptions" /></amc-form-field>
          @switch (fv().level) {
            @case ('Site') { <amc-form-field label="Site" for="cv-site" [control]="c.siteId"><amc-select inputId="cv-site" formControlName="siteId" [options]="siteChoices()" /></amc-form-field> }
            @case ('Asset') { <amc-form-field label="Asset" for="cv-asset" [control]="c.assetId"><amc-select inputId="cv-asset" formControlName="assetId" [options]="assetChoices()" /></amc-form-field> }
            @case ('Asset Category') { <amc-form-field label="Asset Category" for="cv-cat" [control]="c.assetCategory"><amc-select inputId="cv-cat" formControlName="assetCategory" [options]="refs.assetCategoryOptions()" /></amc-form-field> }
            @case ('Service') { <amc-form-field label="Service" for="cv-svc" [control]="c.serviceId"><amc-select inputId="cv-svc" formControlName="serviceId" [options]="serviceChoices()" /></amc-form-field> }
            @default { <amc-form-field label="Customer" for="cv-cust"><input id="cv-cust" class="amc-input" [value]="selected()?.customerName ?? ''" readonly /></amc-form-field> }
          }
          <amc-form-field label="Coverage Type" for="cv-type" [control]="c.coverageType"><amc-select inputId="cv-type" formControlName="coverageType" [options]="typeOptions" /></amc-form-field>
          <amc-form-field label="Coverage Status" for="cv-status" [control]="c.status"><amc-select inputId="cv-status" formControlName="status" [options]="statusOptions" /></amc-form-field>
          <amc-form-field label="Labor Coverage" for="cv-labor" [control]="c.labor"><amc-select inputId="cv-labor" formControlName="labor" [options]="laborOptions" /></amc-form-field>
          <amc-form-field label="Parts Coverage" for="cv-parts" [control]="c.parts"><amc-select inputId="cv-parts" formControlName="parts" [options]="partsOptions" /></amc-form-field>
          <amc-form-field label="Start Date" for="cv-start" [control]="c.startDate"><amc-date-picker inputId="cv-start" formControlName="startDate" /></amc-form-field>
          <amc-form-field label="End Date" for="cv-end" [control]="c.endDate"><amc-date-picker inputId="cv-end" formControlName="endDate" /></amc-form-field>
          <p class="amc-overline sm:col-span-2">Coverage restrictions</p>
          <amc-form-field label="Maximum Visits" for="cv-mv" [control]="c.maxVisits"><input id="cv-mv" type="number" min="0" class="amc-input tabular-nums" formControlName="maxVisits" /></amc-form-field>
          <amc-form-field label="Maximum Hours" for="cv-mh" [control]="c.maxHours"><input id="cv-mh" type="number" min="0" class="amc-input tabular-nums" formControlName="maxHours" /></amc-form-field>
          <amc-form-field label="Maximum Parts Value" for="cv-mp" [control]="c.maxPartsValue"><input id="cv-mp" type="number" min="0" class="amc-input tabular-nums" formControlName="maxPartsValue" /></amc-form-field>
          <amc-form-field label="Maximum Call-Outs" for="cv-mc" [control]="c.maxCallOuts"><input id="cv-mc" type="number" min="0" class="amc-input tabular-nums" formControlName="maxCallOuts" /></amc-form-field>
          <amc-form-field label="Service Hours" for="cv-sh" [control]="c.serviceHours"><input id="cv-sh" class="amc-input" formControlName="serviceHours" /></amc-form-field>
          <amc-form-field label="Geographic Restrictions" for="cv-geo" [control]="c.geographicRestriction"><input id="cv-geo" class="amc-input" formControlName="geographicRestriction" /></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="coverage-form" class="amc-btn-primary" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>

    <amc-dialog size="lg" title="Coverage validation" description="Checks whether a service request or work order is AMC-covered (SRS 6.20)." [(open)]="validateOpen">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <amc-form-field label="Customer" for="vl-cust"><amc-select inputId="vl-cust" [options]="refs.customerOptions()" [(value)]="vCustomer" /></amc-form-field>
        <amc-form-field label="AMC" for="vl-amc" hint="Optional — the best matching active AMC is used."><amc-select inputId="vl-amc" [options]="customerAmcs()" [(value)]="vAmc" [clearable]="true" /></amc-form-field>
        <amc-form-field label="Site" for="vl-site"><amc-select inputId="vl-site" [options]="refs.siteOptions(vCustomerId())" [(value)]="vSite" [clearable]="true" /></amc-form-field>
        <amc-form-field label="Asset" for="vl-asset"><amc-select inputId="vl-asset" [options]="refs.assetOptions(vCustomerId(), vSite() ? [vSite()!.toString()] : [])" [(value)]="vAsset" [clearable]="true" /></amc-form-field>
        <amc-form-field label="Service" for="vl-svc"><amc-select inputId="vl-svc" [options]="refs.serviceOptions()" [(value)]="vService" [clearable]="true" /></amc-form-field>
        <amc-form-field label="Service Date" for="vl-date"><amc-date-picker inputId="vl-date" [(value)]="vDate" /></amc-form-field>
        <div class="flex items-end pb-1"><amc-switch label="Parts required" [(checked)]="vParts" /></div>
        @if (vParts()) { <amc-form-field label="Parts Value" for="vl-pv"><input id="vl-pv" type="number" min="0" class="amc-input tabular-nums" [value]="vPartsValue()" (input)="vPartsValue.set(+$any($event.target).value || 0)" /></amc-form-field> }
      </div>
      @if (decision(); as d) {
        <div class="mt-5 rounded-xl border border-line">
          <div class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <amc-status-badge [label]="d.result" [tone]="resultTone[d.result]" />
            <p class="flex-1 text-sm text-ink">{{ d.summary }}</p>
            <span class="text-xs font-medium" [class]="d.billable ? 'text-warn' : 'text-ok'">{{ d.billable ? 'Billable' : 'Non-billable' }}</span>
          </div>
          <ol class="divide-y divide-line">
            @for (s of d.steps; track s.step) {
              <li class="flex items-start gap-3 px-4 py-2 text-sm">
                <amc-icon [name]="s.result === 'pass' ? 'check-circle' : s.result === 'fail' ? 'x' : s.result === 'warn' ? 'alert-triangle' : 'clock'" [size]="15" class="mt-0.5" [class]="s.result === 'pass' ? 'text-ok' : s.result === 'fail' ? 'text-danger' : s.result === 'warn' ? 'text-warn' : 'text-ink-subtle'" />
                <span class="w-44 shrink-0 font-medium text-ink">{{ s.step }}</span>
                <span class="text-ink-muted">{{ s.detail }}</span>
              </li>
            }
          </ol>
        </div>
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="validateOpen.set(false)">Close</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || !vCustomer()" (click)="validate()">@if (busy()) { <amc-spinner [size]="14" /> } Validate</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class CoveragePage {
  private readonly api = inject(CoverageApi);
  private readonly amcApi = inject(AmcApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(AmcReferenceStore);

  readonly amcId = input<string>();

  protected readonly lines = rxResource({ stream: () => this.api.list() });
  private readonly amcs = rxResource({ stream: () => this.amcApi.list() });
  protected readonly rows = computed(() => (this.lines.hasValue() ? this.lines.value() : []));
  private readonly amcList = computed(() => (this.amcs.hasValue() ? this.amcs.value() : []));
  protected readonly amcOptions = computed(() => this.amcList().filter((a) => !['Terminated', 'Cancelled', 'Archived', 'Renewed'].includes(a.effectiveStatus)).map((a) => ({ value: a.id, label: `${a.number} · ${a.title}`, hint: a.customerName })));
  protected readonly columns = coverageColumns();
  protected readonly trackById = (c: CoverageListItem) => c.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.amcId() ? { amc: [this.amcId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'amc', label: 'AMC', type: 'multiselect', options: this.amcList().map((a) => ({ value: a.id, label: `${a.number} · ${a.title}` })) },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'level', label: 'Coverage Level', type: 'multiselect', options: this.levelOptions },
    { key: 'type', label: 'Coverage Type', type: 'multiselect', options: this.typeOptions },
    { key: 'labor', label: 'Labor Coverage', type: 'multiselect', options: this.laborOptions },
    { key: 'parts', label: 'Parts Coverage', type: 'multiselect', options: this.partsOptions },
    { key: 'status', label: 'Coverage Status', type: 'multiselect', options: this.statusOptions },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const customerOf = new Map(this.amcList().map((a) => [a.id, a.customer.customerId]));
    return this.rows().filter(
      (c) =>
        (!term || `${c.amcNumber} ${c.customerName} ${c.target} ${c.coverageType}`.toLowerCase().includes(term)) && matchesAny(f, 'amc', c.amcId) && matchesAny(f, 'customer', customerOf.get(c.amcId)) &&
        matchesAny(f, 'level', c.level) && matchesAny(f, 'type', c.coverageType) && matchesAny(f, 'labor', c.labor) && matchesAny(f, 'parts', c.parts) && matchesAny(f, 'status', c.effectiveStatus),
    );
  });
  protected readonly rowActions = (): MenuItem[] => [{ id: 'edit', label: 'Edit', icon: 'pencil' }, { id: 'validate', label: 'Validate for this AMC', icon: 'shield-check' }];

  protected readonly levelOptions = toOptions(COVERAGE_LEVELS);
  protected readonly typeOptions = toOptions(COVERAGE_TYPES);
  protected readonly laborOptions = toOptions(LABOR_COVERAGE);
  protected readonly partsOptions = toOptions(PARTS_COVERAGE);
  protected readonly statusOptions = toOptions(COVERAGE_STATUSES.filter((s) => s !== 'Expired'));
  protected readonly resultTone = COVERAGE_RESULT_TONE;
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<CoverageListItem | null>(null);
  protected readonly form = this.fb.group({
    amcId: this.fb.control('', Validators.required),
    level: this.fb.control<CoverageLevel>('Customer'),
    siteId: this.fb.control(''),
    assetId: this.fb.control(''),
    assetCategory: this.fb.control(''),
    serviceId: this.fb.control(''),
    coverageType: this.fb.control<CoverageType>('Preventive Maintenance'),
    labor: this.fb.control<LaborCoverage>('Included'),
    parts: this.fb.control<PartsCoverage>('Selected Parts'),
    maxVisits: this.fb.control<number | null>(null),
    maxHours: this.fb.control<number | null>(null),
    maxPartsValue: this.fb.control<number | null>(null),
    maxCallOuts: this.fb.control<number | null>(null),
    serviceHours: this.fb.control('Business Hours'),
    geographicRestriction: this.fb.control(''),
    startDate: this.fb.control('', Validators.required),
    endDate: this.fb.control('', Validators.required),
    status: this.fb.control<'Active' | 'Inactive'>('Active'),
  });
  protected readonly fv = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  protected readonly selected = computed(() => this.amcList().find((a) => a.id === this.fv().amcId));
  protected readonly siteChoices = computed(() => this.refs.siteOptions(null, this.selected()?.scope.siteIds ?? []));
  protected readonly assetChoices = computed(() => this.refs.assetOptions(null, [], this.selected()?.scope.assetIds ?? []));
  protected readonly serviceChoices = computed(() => this.refs.serviceOptions().filter((o) => this.selected()?.scope.serviceIds.includes(String(o.value))));

  protected readonly validateOpen = signal(false);
  protected readonly vCustomer = signal<string | number | null>(null);
  protected readonly vCustomerId = computed(() => (this.vCustomer() ? String(this.vCustomer()) : '__none__'));
  protected readonly vAmc = signal<string | number | null>(null);
  protected readonly vSite = signal<string | number | null>(null);
  protected readonly vAsset = signal<string | number | null>(null);
  protected readonly vService = signal<string | number | null>(null);
  protected readonly vDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly vParts = signal(false);
  protected readonly vPartsValue = signal(0);
  protected readonly decision = signal<CoverageDecision | null>(null);
  protected readonly customerAmcs = computed(() => this.amcList().filter((a) => a.customer.customerId === this.vCustomer()).map((a) => ({ value: a.id, label: `${a.number} · ${a.title}`, hint: a.effectiveStatus })));

  constructor() {
    this.form.controls.amcId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const a = this.amcList().find((x) => x.id === id);
      if (a && !this.editing()) this.form.patchValue({ startDate: a.period.startDate, endDate: a.period.endDate, serviceHours: a.sla.serviceHours, geographicRestriction: `${a.operational.serviceRegion} region` });
    });
  }

  protected openForm(c: CoverageListItem | null): void {
    this.editing.set(c);
    this.form.reset({
      amcId: c?.amcId ?? this.amcId() ?? '', level: c?.level ?? 'Customer', siteId: c?.siteId ?? '', assetId: c?.assetId ?? '', assetCategory: c?.assetCategory ?? '', serviceId: c?.serviceId ?? '',
      coverageType: c?.coverageType ?? 'Preventive Maintenance', labor: c?.labor ?? 'Included', parts: c?.parts ?? 'Selected Parts', maxVisits: c?.maxVisits ?? null, maxHours: c?.maxHours ?? null, maxPartsValue: c?.maxPartsValue ?? null,
      maxCallOuts: c?.maxCallOuts ?? null, serviceHours: c?.serviceHours ?? 'Business Hours', geographicRestriction: c?.geographicRestriction ?? '', startDate: c?.startDate ?? '', endDate: c?.endDate ?? '', status: c?.status === 'Inactive' ? 'Inactive' : 'Active',
    });
    if (!c && this.amcId()) this.form.controls.amcId.setValue(this.amcId()!);
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const input = { ...v, siteId: v.level === 'Site' ? v.siteId || null : null, assetId: v.level === 'Asset' ? v.assetId || null : null, assetCategory: v.level === 'Asset Category' ? v.assetCategory || null : null, serviceId: v.level === 'Service' ? v.serviceId || null : null };
    const c = this.editing();
    this.busy.set(true);
    try {
      await firstValueFrom(c ? this.api.update(c.id, input) : this.api.create(input));
      this.notify.success(c ? 'Coverage updated.' : 'Coverage added.');
      this.formOpen.set(false);
      this.lines.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected openValidate(amcId: string | null = null): void {
    const a = this.amcList().find((x) => x.id === (amcId ?? this.amcId()));
    this.vCustomer.set(a?.customer.customerId ?? null);
    this.vAmc.set(a?.id ?? null);
    this.vSite.set(a?.scope.siteIds[0] ?? null);
    this.vAsset.set(null);
    this.vService.set(null);
    this.decision.set(null);
    this.validateOpen.set(true);
  }

  protected async validate(): Promise<void> {
    this.busy.set(true);
    try {
      const str = (v: string | number | null) => (v === null ? null : String(v));
      this.decision.set(await firstValueFrom(this.api.validate({ customerId: String(this.vCustomer()), amcId: str(this.vAmc()), siteId: str(this.vSite()), assetId: str(this.vAsset()), serviceId: str(this.vService()), date: this.vDate(), needsParts: this.vParts(), partsValue: this.vPartsValue() })));
    } finally {
      this.busy.set(false);
    }
  }

  protected onAction({ id, row }: RowAction<CoverageListItem>): void {
    if (id === 'edit') this.openForm(row);
    else this.openValidate(row.amcId);
  }

  protected export(): void {
    downloadCsv(timestampedName('amc-coverage', 'csv'), ['AMC', 'Customer', 'Level', 'Covered', 'Coverage Type', 'Labor', 'Parts', 'Max Visits', 'Max Hours', 'Max Parts Value', 'Max Call-Outs', 'Service Hours', 'Geographic Restrictions', 'Start Date', 'End Date', 'Status'],
      this.filtered().map((c) => [c.amcNumber, c.customerName, c.level, c.target, c.coverageType, c.labor, c.parts, c.maxVisits, c.maxHours, c.maxPartsValue, c.maxCallOuts, c.serviceHours, c.geographicRestriction, c.startDate, c.endDate, c.effectiveStatus]));
  }
}
