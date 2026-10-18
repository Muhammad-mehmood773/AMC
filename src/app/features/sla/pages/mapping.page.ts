import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
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
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { firstValueFrom, map, startWith } from 'rxjs';
import { SelectionResult } from '../components/selection-result';
import { mappingColumns } from '../components/sla-columns';
import { SlaReferenceStore } from '../data/sla-reference.store';
import { SlaMappingApi } from '../data/sla.api';
import { MAPPING_LEVELS, type MappingLevel, type SlaMappingListItem, type SlaSelection } from '../models/operations.model';
import { PRIORITIES, type Priority } from '../models/sla.model';

@Component({
  selector: 'amc-mapping-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, PageHeader, Panel, ReactiveFormsModule, Select, SelectionResult, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="SLA Assignment / Mapping" subtitle="Which SLA is applied automatically — the most specific active mapping wins, then the assignment priority." [breadcrumbs]="[{ label: 'SLA Management', path: '/app/sla/dashboard' }, { label: 'Assignment / Mapping' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Add Mapping</button>
      </amc-page-header>
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <section class="amc-card overflow-hidden xl:col-span-3">
          <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search SLA, customer, site, service…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
          <amc-data-table tableId="sla-mappings" [entity]="{ singular: 'mapping', plural: 'mappings' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="mappings.isLoading()" [actions]="rowActions" [initialPageSize]="25" emptyIcon="link" emptyTitle="No mappings" emptyMessage="Add a mapping so SLAs are assigned automatically." (action)="onAction($event)" />
        </section>
        <amc-panel class="xl:col-span-2" title="SLA validation & selection" description="Customer + Contract/AMC + Site + Asset + Service + Priority → most specific SLA → clock activation" icon="shield-check">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <amc-form-field label="Customer" for="sim-cust" class="sm:col-span-2"><amc-select inputId="sim-cust" [options]="refs.customerOptions()" [(value)]="qCustomer" /></amc-form-field>
            <amc-form-field label="AMC / Contract" for="sim-amc"><amc-select inputId="sim-amc" [options]="refs.amcOptions(cust())" [(value)]="qAmc" [clearable]="true" /></amc-form-field>
            <amc-form-field label="Site" for="sim-site"><amc-select inputId="sim-site" [options]="refs.siteOptions(cust())" [(value)]="qSite" [clearable]="true" /></amc-form-field>
            <amc-form-field label="Asset" for="sim-asset"><amc-select inputId="sim-asset" [options]="refs.assetOptions(cust(), qSite() ? qSite()!.toString() : null)" [(value)]="qAsset" [clearable]="true" /></amc-form-field>
            <amc-form-field label="Service" for="sim-svc"><amc-select inputId="sim-svc" [options]="refs.serviceOptions()" [(value)]="qService" [clearable]="true" /></amc-form-field>
            <amc-form-field label="Priority" for="sim-prio"><amc-select inputId="sim-prio" [options]="priorityOptions" [(value)]="qPriority" /></amc-form-field>
            <div class="flex items-end"><button type="button" class="amc-btn-primary w-full" [disabled]="busy() || !qCustomer()" (click)="simulate()">@if (busy()) { <amc-spinner [size]="14" /> } Validate &amp; Select</button></div>
          </div>
          @if (selection(); as s) { <amc-selection-result class="mt-4" [selection]="s" /> }
        </amc-panel>
      </div>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Edit mapping' : 'Add mapping'" [(open)]="formOpen">
      <form [formGroup]="form" id="map-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="SLA" for="mp-sla" [control]="c.slaId" class="sm:col-span-2"><amc-select inputId="mp-sla" formControlName="slaId" [options]="refs.slaOptions()" /></amc-form-field>
          <amc-form-field label="Mapping Level" for="mp-level" [control]="c.level"><amc-select inputId="mp-level" formControlName="level" [options]="levelOptions" /></amc-form-field>
          <amc-form-field label="Customer" for="mp-cust" [control]="c.customerId"><amc-select inputId="mp-cust" formControlName="customerId" [options]="refs.customerOptions()" [clearable]="true" placeholder="Any customer" /></amc-form-field>
          <amc-form-field label="Contract" for="mp-con" [control]="c.contractId"><amc-select inputId="mp-con" formControlName="contractId" [options]="refs.contractOptions(fv().customerId || null)" [clearable]="true" /></amc-form-field>
          <amc-form-field label="AMC" for="mp-amc" [control]="c.amcId"><amc-select inputId="mp-amc" formControlName="amcId" [options]="refs.amcOptions(fv().customerId || null)" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Site" for="mp-site" [control]="c.siteId"><amc-select inputId="mp-site" formControlName="siteId" [options]="refs.siteOptions(fv().customerId || null)" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Asset" for="mp-asset" [control]="c.assetId"><amc-select inputId="mp-asset" formControlName="assetId" [options]="refs.assetOptions(fv().customerId || null, fv().siteId || null)" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Service" for="mp-svc" [control]="c.serviceId"><amc-select inputId="mp-svc" formControlName="serviceId" [options]="refs.serviceOptions()" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Service Category" for="mp-scat" [control]="c.serviceCategory"><amc-select inputId="mp-scat" formControlName="serviceCategory" [options]="refs.serviceCategoryOptions()" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Priority" for="mp-prio" [control]="c.priority"><amc-select inputId="mp-prio" formControlName="priority" [options]="priorityOptions" [clearable]="true" placeholder="Any priority" /></amc-form-field>
          <amc-form-field label="Assignment Priority" for="mp-ap" [control]="c.assignmentPriority" hint="Lower wins when specificity is equal."><input id="mp-ap" type="number" min="1" class="amc-input tabular-nums" formControlName="assignmentPriority" /></amc-form-field>
          <amc-form-field label="Effective Date" for="mp-eff" [control]="c.effectiveDate"><amc-date-picker inputId="mp-eff" formControlName="effectiveDate" /></amc-form-field>
          <amc-form-field label="Expiry Date" for="mp-exp" [control]="c.expiryDate"><amc-date-picker inputId="mp-exp" formControlName="expiryDate" /></amc-form-field>
          <amc-form-field label="Status" for="mp-status" [control]="c.status"><amc-select inputId="mp-status" formControlName="status" [options]="statusOptions" /></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="map-form" class="amc-btn-primary" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class MappingPage {
  private readonly api = inject(SlaMappingApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SlaReferenceStore);

  readonly slaId = input<string>();
  readonly action = input<string>();

  protected readonly mappings = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.mappings.hasValue() ? this.mappings.value() : []));
  protected readonly columns = mappingColumns();
  protected readonly trackById = (m: SlaMappingListItem) => m.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.slaId() ? { sla: [this.slaId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'sla', label: 'SLA', type: 'multiselect', options: this.refs.slaOptions() },
    { key: 'level', label: 'Mapping Level', type: 'multiselect', options: this.levelOptions },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'status', label: 'Status', type: 'multiselect', options: this.statusOptions },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((m) => (!term || `${m.slaNumber} ${m.slaName} ${m.scope}`.toLowerCase().includes(term)) && matchesAny(f, 'sla', m.slaId) && matchesAny(f, 'level', m.level) && matchesAny(f, 'customer', m.customerId) && matchesAny(f, 'status', m.status));
  });
  protected readonly rowActions = (): MenuItem[] => [{ id: 'edit', label: 'Edit', icon: 'pencil' }];
  protected readonly levelOptions = toOptions(MAPPING_LEVELS);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly statusOptions = toOptions(['Active', 'Inactive'] as const);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<SlaMappingListItem | null>(null);
  protected readonly form = this.fb.group({
    slaId: this.fb.control('', Validators.required), level: this.fb.control<MappingLevel>('Customer'),
    customerId: this.fb.control(''), contractId: this.fb.control(''), amcId: this.fb.control(''), siteId: this.fb.control(''), assetId: this.fb.control(''), serviceId: this.fb.control(''), serviceCategory: this.fb.control(''), priority: this.fb.control(''),
    assignmentPriority: this.fb.control(50, [Validators.required, Validators.min(1)]), effectiveDate: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required), expiryDate: this.fb.control(''), status: this.fb.control<'Active' | 'Inactive'>('Active'),
  });
  protected readonly fv = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });

  protected readonly qCustomer = signal<string | number | null>(null);
  protected readonly cust = computed(() => (this.qCustomer() ? String(this.qCustomer()) : '__none__'));
  protected readonly qAmc = signal<string | number | null>(null);
  protected readonly qSite = signal<string | number | null>(null);
  protected readonly qAsset = signal<string | number | null>(null);
  protected readonly qService = signal<string | number | null>(null);
  protected readonly qPriority = signal<string | number | null>('High');
  protected readonly selection = signal<SlaSelection | null>(null);

  constructor() {
    effect(() => {
      if (this.action() === 'new') untracked(() => this.openForm(null));
    });
  }

  protected openForm(m: SlaMappingListItem | null): void {
    this.editing.set(m);
    this.form.reset({
      slaId: m?.slaId ?? this.slaId() ?? '', level: m?.level ?? 'Customer', customerId: m?.customerId ?? '', contractId: m?.contractId ?? '', amcId: m?.amcId ?? '', siteId: m?.siteId ?? '', assetId: m?.assetId ?? '', serviceId: m?.serviceId ?? '', serviceCategory: m?.serviceCategory ?? '', priority: m?.priority ?? '',
      assignmentPriority: m?.assignmentPriority ?? 50, effectiveDate: m?.effectiveDate ?? new Date().toISOString().slice(0, 10), expiryDate: m?.expiryDate ?? '', status: m?.status ?? 'Active',
    });
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const n = (x: string) => x || null;
    const input = { slaId: v.slaId, level: v.level, customerId: n(v.customerId), contractId: n(v.contractId), amcId: n(v.amcId), siteId: n(v.siteId), assetId: n(v.assetId), serviceId: n(v.serviceId), serviceCategory: n(v.serviceCategory), priority: n(v.priority) as Priority | null, effectiveDate: v.effectiveDate, expiryDate: n(v.expiryDate), assignmentPriority: Number(v.assignmentPriority), status: v.status };
    const m = this.editing();
    this.busy.set(true);
    try {
      await firstValueFrom(m ? this.api.update(m.id, input) : this.api.create(input));
      this.notify.success(m ? 'Mapping updated.' : 'Mapping added.');
      this.formOpen.set(false);
      this.mappings.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async simulate(): Promise<void> {
    this.busy.set(true);
    const str = (x: string | number | null) => (x === null ? null : String(x));
    const amc = this.refs.data().amcs.find((a) => a.id === this.qAmc());
    try {
      this.selection.set(await firstValueFrom(this.api.resolve({ customerId: String(this.qCustomer()), contractId: amc?.contractId ?? null, amcId: str(this.qAmc()), siteId: str(this.qSite()), assetId: str(this.qAsset()), serviceId: str(this.qService()), priority: (this.qPriority() ?? 'Medium') as Priority, requestType: null, date: new Date().toISOString() })));
    } finally {
      this.busy.set(false);
    }
  }

  protected onAction({ row }: RowAction<SlaMappingListItem>): void {
    this.openForm(row);
  }

  protected export(): void {
    downloadCsv(timestampedName('sla-mappings', 'csv'), ['SLA', 'Mapping Level', 'Scope', 'Specificity', 'Assignment Priority', 'Effective Date', 'Expiry Date', 'Status'], this.filtered().map((m) => [m.slaNumber, m.level, m.scope, m.specificity, m.assignmentPriority, m.effectiveDate, m.expiryDate, m.status]));
  }
}
