import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { firstValueFrom, map, startWith } from 'rxjs';
import { SelectionResult } from '../components/selection-result';
import { coverageColumns } from '../components/sla-columns';
import { SlaReferenceStore } from '../data/sla-reference.store';
import { SlaCoverageApi, SlaMappingApi } from '../data/sla.api';
import { APPLICABILITY_RESULTS, SLA_COVERAGE_LEVELS, type SlaCoverageLevel, type SlaCoverageListItem, type SlaSelection } from '../models/operations.model';
import { PRIORITIES, type Priority } from '../models/sla.model';

@Component({
  selector: 'amc-sla-coverage-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, PageHeader, ReactiveFormsModule, Select, SelectionResult, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="SLA Coverage & Applicability" subtitle="Where and when each SLA applies — customer, contract, AMC, site, asset, category, service and priority." [breadcrumbs]="[{ label: 'SLA Management', path: '/app/sla/dashboard' }, { label: 'Coverage' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-secondary" (click)="checkOpen.set(true)"><amc-icon name="shield-check" /> Check Applicability</button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Add Coverage</button>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search SLA, customer, site, asset or service…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="sla-coverage" [entity]="{ singular: 'coverage line', plural: 'coverage lines' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="lines.isLoading()" [actions]="rowActions" [initialPageSize]="25" emptyIcon="shield-check" emptyTitle="No coverage" emptyMessage="Add coverage to define where an SLA applies." (action)="onAction($event)" />
      </section>
      <p class="text-xs text-ink-subtle">Applicability results: {{ results }}.</p>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Edit coverage' : 'Add coverage'" [(open)]="formOpen">
      <form [formGroup]="form" id="cov-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="SLA" for="cv-sla" [control]="c.slaId" class="sm:col-span-2"><amc-select inputId="cv-sla" formControlName="slaId" [options]="refs.slaOptions()" /></amc-form-field>
          <amc-form-field label="Coverage Level" for="cv-level" [control]="c.level"><amc-select inputId="cv-level" formControlName="level" [options]="levelOptions" /></amc-form-field>
          <amc-form-field label="Customer" for="cv-cust" [control]="c.customerId" hint="Empty = all mapped customers."><amc-select inputId="cv-cust" formControlName="customerId" [options]="refs.customerOptions()" [clearable]="true" /></amc-form-field>
          @switch (fv().level) {
            @case ('Contract') { <amc-form-field label="Contract" for="cv-con" [control]="c.contractId"><amc-select inputId="cv-con" formControlName="contractId" [options]="refs.contractOptions(fv().customerId || null)" /></amc-form-field> }
            @case ('AMC') { <amc-form-field label="AMC" for="cv-amc" [control]="c.amcId"><amc-select inputId="cv-amc" formControlName="amcId" [options]="refs.amcOptions(fv().customerId || null)" /></amc-form-field> }
            @case ('Site') { <amc-form-field label="Site" for="cv-site" [control]="c.siteId"><amc-select inputId="cv-site" formControlName="siteId" [options]="refs.siteOptions(fv().customerId || null)" /></amc-form-field> }
            @case ('Asset') { <amc-form-field label="Asset" for="cv-asset" [control]="c.assetId"><amc-select inputId="cv-asset" formControlName="assetId" [options]="refs.assetOptions(fv().customerId || null)" /></amc-form-field> }
            @case ('Asset Category') { <amc-form-field label="Asset Category" for="cv-acat" [control]="c.assetCategory"><amc-select inputId="cv-acat" formControlName="assetCategory" [options]="refs.assetCategoryOptions()" /></amc-form-field> }
            @case ('Service') { <amc-form-field label="Service" for="cv-svc" [control]="c.serviceId"><amc-select inputId="cv-svc" formControlName="serviceId" [options]="refs.serviceOptions()" /></amc-form-field> }
            @case ('Service Category') { <amc-form-field label="Service Category" for="cv-scat" [control]="c.serviceCategory"><amc-select inputId="cv-scat" formControlName="serviceCategory" [options]="refs.serviceCategoryOptions()" /></amc-form-field> }
            @default { <div></div> }
          }
          <amc-form-field label="Priority" for="cv-prio" [control]="c.priority"><amc-select inputId="cv-prio" formControlName="priority" [options]="priorityOptions" [clearable]="true" placeholder="All priorities" /></amc-form-field>
          <amc-form-field label="Coverage Start Date" for="cv-start" [control]="c.startDate"><amc-date-picker inputId="cv-start" formControlName="startDate" /></amc-form-field>
          <amc-form-field label="Coverage End Date" for="cv-end" [control]="c.endDate"><amc-date-picker inputId="cv-end" formControlName="endDate" /></amc-form-field>
          <amc-form-field label="Coverage Status" for="cv-status" [control]="c.status"><amc-select inputId="cv-status" formControlName="status" [options]="statusOptions" /></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="cov-form" class="amc-btn-primary" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>

    <amc-dialog size="lg" title="SLA applicability" description="Determines which SLA applies to a request based on customer, contract, AMC, site, asset, service, category and priority." [(open)]="checkOpen">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <amc-form-field label="Customer" for="ck-cust"><amc-select inputId="ck-cust" [options]="refs.customerOptions()" [(value)]="qCustomer" /></amc-form-field>
        <amc-form-field label="AMC" for="ck-amc"><amc-select inputId="ck-amc" [options]="refs.amcOptions(cust())" [(value)]="qAmc" [clearable]="true" /></amc-form-field>
        <amc-form-field label="Site" for="ck-site"><amc-select inputId="ck-site" [options]="refs.siteOptions(cust())" [(value)]="qSite" [clearable]="true" /></amc-form-field>
        <amc-form-field label="Asset" for="ck-asset"><amc-select inputId="ck-asset" [options]="refs.assetOptions(cust(), qSite() ? qSite()!.toString() : null)" [(value)]="qAsset" [clearable]="true" /></amc-form-field>
        <amc-form-field label="Service" for="ck-svc"><amc-select inputId="ck-svc" [options]="refs.serviceOptions()" [(value)]="qService" [clearable]="true" /></amc-form-field>
        <amc-form-field label="Priority" for="ck-prio"><amc-select inputId="ck-prio" [options]="priorityOptions" [(value)]="qPriority" /></amc-form-field>
      </div>
      @if (selection(); as s) { <amc-selection-result class="mt-5" [selection]="s" /> }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="checkOpen.set(false)">Close</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || !qCustomer()" (click)="check()">@if (busy()) { <amc-spinner [size]="14" /> } Check</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class SlaCoveragePage {
  private readonly api = inject(SlaCoverageApi);
  private readonly mappingApi = inject(SlaMappingApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SlaReferenceStore);

  readonly slaId = input<string>();

  protected readonly lines = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.lines.hasValue() ? this.lines.value() : []));
  protected readonly columns = coverageColumns();
  protected readonly trackById = (c: SlaCoverageListItem) => c.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.slaId() ? { sla: [this.slaId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'sla', label: 'SLA', type: 'multiselect', options: this.refs.slaOptions() },
    { key: 'level', label: 'Coverage Level', type: 'multiselect', options: this.levelOptions },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: this.priorityOptions },
    { key: 'status', label: 'Coverage Status', type: 'multiselect', options: toOptions(['Active', 'Inactive', 'Expired'] as const) },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((c) => (!term || `${c.slaNumber} ${c.slaName} ${c.target}`.toLowerCase().includes(term)) && matchesAny(f, 'sla', c.slaId) && matchesAny(f, 'level', c.level) && matchesAny(f, 'customer', c.customerId) && matchesAny(f, 'priority', c.priority) && matchesAny(f, 'status', c.effectiveStatus));
  });
  protected readonly rowActions = (): MenuItem[] => [{ id: 'edit', label: 'Edit', icon: 'pencil' }];
  protected readonly levelOptions = toOptions(SLA_COVERAGE_LEVELS);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly statusOptions = toOptions(['Active', 'Inactive'] as const);
  protected readonly results = APPLICABILITY_RESULTS.join(' · ');
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<SlaCoverageListItem | null>(null);
  protected readonly form = this.fb.group({
    slaId: this.fb.control('', Validators.required),
    level: this.fb.control<SlaCoverageLevel>('Customer'),
    customerId: this.fb.control(''), contractId: this.fb.control(''), amcId: this.fb.control(''), siteId: this.fb.control(''), assetId: this.fb.control(''), assetCategory: this.fb.control(''), serviceId: this.fb.control(''), serviceCategory: this.fb.control(''),
    priority: this.fb.control(''),
    startDate: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    endDate: this.fb.control(''),
    status: this.fb.control<'Active' | 'Inactive'>('Active'),
  });
  protected readonly fv = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });

  protected readonly checkOpen = signal(false);
  protected readonly qCustomer = signal<string | number | null>(null);
  protected readonly cust = computed(() => (this.qCustomer() ? String(this.qCustomer()) : '__none__'));
  protected readonly qAmc = signal<string | number | null>(null);
  protected readonly qSite = signal<string | number | null>(null);
  protected readonly qAsset = signal<string | number | null>(null);
  protected readonly qService = signal<string | number | null>(null);
  protected readonly qPriority = signal<string | number | null>('High');
  protected readonly selection = signal<SlaSelection | null>(null);

  protected openForm(c: SlaCoverageListItem | null): void {
    this.editing.set(c);
    this.form.reset({ slaId: c?.slaId ?? this.slaId() ?? '', level: c?.level ?? 'Customer', customerId: c?.customerId ?? '', contractId: c?.contractId ?? '', amcId: c?.amcId ?? '', siteId: c?.siteId ?? '', assetId: c?.assetId ?? '', assetCategory: c?.assetCategory ?? '', serviceId: c?.serviceId ?? '', serviceCategory: c?.serviceCategory ?? '', priority: c?.priority ?? '', startDate: c?.startDate ?? new Date().toISOString().slice(0, 10), endDate: c?.endDate ?? '', status: c?.status ?? 'Active' });
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const keep = (level: SlaCoverageLevel, value: string) => (v.level === level && value ? value : null);
    const input = {
      slaId: v.slaId, level: v.level, customerId: v.customerId || null, contractId: keep('Contract', v.contractId), amcId: keep('AMC', v.amcId), siteId: keep('Site', v.siteId), assetId: keep('Asset', v.assetId), assetCategory: keep('Asset Category', v.assetCategory),
      serviceId: keep('Service', v.serviceId), serviceCategory: keep('Service Category', v.serviceCategory), priority: (v.priority || null) as Priority | null, startDate: v.startDate, endDate: v.endDate || null, status: v.status,
    };
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

  protected async check(): Promise<void> {
    this.busy.set(true);
    const str = (x: string | number | null) => (x === null ? null : String(x));
    const amc = this.refs.data().amcs.find((a) => a.id === this.qAmc());
    try {
      this.selection.set(await firstValueFrom(this.mappingApi.resolve({ customerId: String(this.qCustomer()), contractId: amc?.contractId ?? null, amcId: str(this.qAmc()), siteId: str(this.qSite()), assetId: str(this.qAsset()), serviceId: str(this.qService()), priority: (this.qPriority() ?? 'Medium') as Priority, requestType: null, date: new Date().toISOString() })));
    } finally {
      this.busy.set(false);
    }
  }

  protected onAction({ row }: RowAction<SlaCoverageListItem>): void {
    this.openForm(row);
  }

  protected export(): void {
    downloadCsv(timestampedName('sla-coverage', 'csv'), ['SLA', 'Coverage Level', 'Covered', 'Customer', 'Priority', 'Coverage Start', 'Coverage End', 'Coverage Status'], this.filtered().map((c) => [c.slaNumber, c.level, c.target, c.customerId, c.priority, c.startDate, c.endDate, c.effectiveStatus]));
  }
}
