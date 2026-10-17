import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { LookupSelect } from '@shared/ui/lookup-select';
import { PageHeader } from '@shared/ui/page-header';
import { MultiSelect, Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { firstValueFrom, map, startWith } from 'rxjs';
import { planColumns } from '../components/amc-columns';
import { AmcReferenceStore } from '../data/amc-reference.store';
import { AmcApi, ScheduleApi, ServicePlanApi } from '../data/amc.api';
import { FREQUENCY_PER_YEAR } from '../data/amc.config';
import { AMC_LOOKUP } from '../data/amc.lookups';
import { LIVE_AMC_STATUSES, PRIORITIES, type Priority, SERVICE_FREQUENCIES, SERVICE_WINDOWS, type ServiceFrequency } from '../models/amc.model';
import type { ServicePlanListItem } from '../models/operations.model';

@Component({
  selector: 'amc-service-plan-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, LookupSelect, MultiSelect, PageHeader, ReactiveFormsModule, Select, Spinner, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="AMC Service Plan" subtitle="Services to be delivered during each AMC period — frequency, resources, parts and checklist." [breadcrumbs]="[{ label: 'AMC / Service Contracts', path: '/app/amc-agreements/dashboard' }, { label: 'Service Plan' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Add Plan Line</button>
      </amc-page-header>
      <div class="rounded-xl border border-line bg-surface-muted px-4 py-3 text-xs text-ink-muted">
        <span class="font-medium text-ink">Example — HVAC AMC:</span> Service: Preventive Maintenance · Frequency: Quarterly · Covered Assets: 25 · Visits per Asset: 4 / Year · Checklist: HVAC Preventive Maintenance Checklist · Required Skill: HVAC Technician
      </div>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search AMC, service, skill or checklist…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="amc-plans" [entity]="{ singular: 'plan line', plural: 'plan lines' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="plans.isLoading()" [actions]="rowActions" emptyIcon="clipboard-list" emptyTitle="No service plans" emptyMessage="Add the services each AMC must deliver." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Edit plan line' : 'Add plan line'" [(open)]="formOpen">
      <form [formGroup]="form" id="plan-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="AMC" for="pl-amc" [control]="c.amcId" class="sm:col-span-2"><amc-select inputId="pl-amc" formControlName="amcId" [options]="amcOptions()" placeholder="Select AMC…" /></amc-form-field>
          <amc-form-field label="Service" for="pl-svc" [control]="c.serviceId" hint="Services within the AMC coverage scope."><amc-select inputId="pl-svc" formControlName="serviceId" [options]="serviceChoices()" /></amc-form-field>
          <amc-form-field label="Service Type" for="pl-type" [control]="c.serviceType"><input id="pl-type" class="amc-input" formControlName="serviceType" /></amc-form-field>
          <amc-form-field label="Frequency" for="pl-freq" [control]="c.frequency"><amc-select inputId="pl-freq" formControlName="frequency" [options]="frequencyOptions" /></amc-form-field>
          <amc-form-field label="Number of Occurrences" for="pl-occ" [control]="c.occurrences" hint="Per asset per year."><input id="pl-occ" type="number" min="0" class="amc-input tabular-nums" formControlName="occurrences" [readonly]="fixedFrequency()" /></amc-form-field>
          <amc-form-field label="Covered Assets" for="pl-assets" [control]="c.assetIds" class="sm:col-span-2" hint="Leave empty to apply to all AMC assets."><amc-multi-select inputId="pl-assets" formControlName="assetIds" [options]="assetChoices()" [maxChips]="4" placeholder="All AMC assets" /></amc-form-field>
          <amc-form-field label="Standard Duration (hours)" for="pl-dur" [control]="c.durationHours"><input id="pl-dur" type="number" min="0" step="0.5" class="amc-input tabular-nums" formControlName="durationHours" /></amc-form-field>
          <amc-form-field label="Required Skill" for="pl-skill" [control]="c.skill"><input id="pl-skill" class="amc-input" formControlName="skill" /></amc-form-field>
          <amc-form-field label="Required Team" for="pl-team" [control]="c.team"><amc-lookup-select inputId="pl-team" formControlName="team" [type]="lookup.team" /></amc-form-field>
          <amc-form-field label="Required Checklist" for="pl-check" [control]="c.checklist"><amc-lookup-select inputId="pl-check" formControlName="checklist" [type]="lookup.checklist" /></amc-form-field>
          <amc-form-field label="Required Parts" for="pl-parts" [control]="c.parts" class="sm:col-span-2"><input id="pl-parts" class="amc-input" formControlName="parts" /></amc-form-field>
          <amc-form-field label="Service Window" for="pl-window" [control]="c.serviceWindow"><amc-select inputId="pl-window" formControlName="serviceWindow" [options]="windowOptions" /></amc-form-field>
          <amc-form-field label="Priority" for="pl-prio" [control]="c.priority"><amc-select inputId="pl-prio" formControlName="priority" [options]="priorityOptions" /></amc-form-field>
          <amc-switch formControlName="active" label="Active" description="Inactive plan lines are skipped by schedule generation." />
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="plan-form" class="amc-btn-primary" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ServicePlanPage {
  private readonly api = inject(ServicePlanApi);
  private readonly amcApi = inject(AmcApi);
  private readonly scheduleApi = inject(ScheduleApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(AmcReferenceStore);

  readonly amcId = input<string>();

  protected readonly plans = rxResource({ stream: () => this.api.list() });
  private readonly amcs = rxResource({ stream: () => this.amcApi.list() });
  protected readonly rows = computed(() => (this.plans.hasValue() ? this.plans.value() : []));
  private readonly amcList = computed(() => (this.amcs.hasValue() ? this.amcs.value() : []));
  protected readonly amcOptions = computed(() => this.amcList().filter((a) => !['Terminated', 'Cancelled', 'Archived', 'Renewed', 'Expired'].includes(a.effectiveStatus)).map((a) => ({ value: a.id, label: `${a.number} · ${a.title}`, hint: a.customerName })));
  protected readonly columns = planColumns();
  protected readonly trackById = (p: ServicePlanListItem) => p.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.amcId() ? { amc: [this.amcId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'amc', label: 'AMC', type: 'multiselect', options: this.amcList().map((a) => ({ value: a.id, label: `${a.number} · ${a.title}` })) },
    { key: 'frequency', label: 'Frequency', type: 'multiselect', options: this.frequencyOptions },
    { key: 'team', label: 'Required Team', type: 'multiselect', options: toOptions([...new Set(this.rows().map((p) => p.team))].sort()) },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: this.priorityOptions },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((p) => (!term || `${p.amcNumber} ${p.customerName} ${p.serviceName} ${p.skill} ${p.checklist}`.toLowerCase().includes(term)) && matchesAny(f, 'amc', p.amcId) && matchesAny(f, 'frequency', p.frequency) && matchesAny(f, 'team', p.team) && matchesAny(f, 'priority', p.priority));
  });
  protected readonly rowActions = (p: ServicePlanListItem): MenuItem[] => {
    const live = LIVE_AMC_STATUSES.includes(this.amcList().find((a) => a.id === p.amcId)?.effectiveStatus ?? 'Draft');
    return [{ id: 'edit', label: 'Edit', icon: 'pencil' }, { id: 'generate', label: 'Generate Schedule', icon: 'calendar-check', disabled: !live || !p.active, hint: live ? undefined : 'AMC is not active' }];
  };

  protected readonly lookup = AMC_LOOKUP;
  protected readonly frequencyOptions = toOptions(SERVICE_FREQUENCIES);
  protected readonly windowOptions = toOptions(SERVICE_WINDOWS);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ServicePlanListItem | null>(null);
  protected readonly form = this.fb.group({
    amcId: this.fb.control('', Validators.required),
    serviceId: this.fb.control('', Validators.required),
    serviceType: this.fb.control('Preventive Maintenance', Validators.required),
    frequency: this.fb.control<ServiceFrequency>('Quarterly'),
    occurrences: this.fb.control(4, Validators.min(0)),
    assetIds: this.fb.control<(string | number)[]>([]),
    durationHours: this.fb.control(2, [Validators.required, Validators.min(0)]),
    skill: this.fb.control(''),
    team: this.fb.control(''),
    parts: this.fb.control(''),
    checklist: this.fb.control(''),
    serviceWindow: this.fb.control<string>('Business Hours (08:00–17:00)'),
    priority: this.fb.control<Priority>('Medium'),
    active: this.fb.control(true),
  });
  private readonly fv = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  private readonly selected = computed(() => this.amcList().find((a) => a.id === this.fv().amcId));
  protected readonly serviceChoices = computed(() => this.refs.serviceOptions().filter((o) => this.selected()?.scope.serviceIds.includes(String(o.value))));
  protected readonly assetChoices = computed(() => this.refs.assetOptions(null, [], this.selected()?.scope.assetIds ?? []));
  protected readonly fixedFrequency = computed(() => FREQUENCY_PER_YEAR[this.fv().frequency] > 0);

  constructor() {
    const c = this.form.controls;
    c.frequency.valueChanges.pipe(takeUntilDestroyed()).subscribe((f) => {
      if (FREQUENCY_PER_YEAR[f]) c.occurrences.setValue(FREQUENCY_PER_YEAR[f]);
    });
    c.serviceId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const s = this.refs.data().services.find((x) => x.id === id);
      if (s && !this.editing()) this.form.patchValue({ serviceType: s.type, durationHours: s.durationHours, skill: s.skill, team: s.team });
    });
  }

  protected openForm(p: ServicePlanListItem | null): void {
    this.editing.set(p);
    this.form.reset({
      amcId: p?.amcId ?? this.amcId() ?? '', serviceId: p?.serviceId ?? '', serviceType: p?.serviceType ?? 'Preventive Maintenance', frequency: p?.frequency ?? 'Quarterly', occurrences: p?.occurrences ?? 4, assetIds: [...(p?.assetIds ?? [])],
      durationHours: p?.durationHours ?? 2, skill: p?.skill ?? '', team: p?.team ?? '', parts: p?.parts ?? '', checklist: p?.checklist ?? '', serviceWindow: p?.serviceWindow ?? 'Business Hours (08:00–17:00)', priority: p?.priority ?? 'Medium', active: p?.active ?? true,
    });
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const input = { ...v, assetIds: v.assetIds.map(String), occurrences: Number(v.occurrences), durationHours: Number(v.durationHours) };
    const p = this.editing();
    this.busy.set(true);
    try {
      await firstValueFrom(p ? this.api.update(p.id, input) : this.api.create(input));
      this.notify.success(p ? 'Plan updated.' : 'Plan line added.');
      this.formOpen.set(false);
      this.plans.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async onAction({ id, row }: RowAction<ServicePlanListItem>): Promise<void> {
    if (id === 'edit') return this.openForm(row);
    try {
      const n = await firstValueFrom(this.scheduleApi.generate(row.amcId));
      this.notify.success(n ? `${n} maintenance events generated for ${row.amcNumber}.` : 'The schedule is already up to date.');
      this.plans.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('amc-service-plan', 'csv'), ['AMC', 'Service', 'Service Type', 'Frequency', 'Occurrences', 'Assets', 'Standard Duration', 'Required Skill', 'Required Team', 'Required Parts', 'Required Checklist', 'Service Window', 'Priority', 'Active'],
      this.filtered().map((p) => [p.amcNumber, p.serviceName, p.serviceType, p.frequency, p.occurrences, p.assetCount, p.durationHours, p.skill, p.team, p.parts, p.checklist, p.serviceWindow, p.priority, p.active ? 'Yes' : 'No']));
  }
}
