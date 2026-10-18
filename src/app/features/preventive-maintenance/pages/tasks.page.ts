import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { LookupSelect } from '@shared/ui/lookup-select';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { firstValueFrom } from 'rxjs';
import { PmReferenceStore } from '../data/pm-reference.store';
import { TaskApi } from '../data/pm.api';
import { PM_LOOKUP } from '../data/pm.lookups';
import { formatDuration } from '../models/display';
import { TASK_TYPES, type TaskListItem } from '../models/operations.model';

/** SRS 8.12 — activities required to complete preventive maintenance. */
@Component({
  selector: 'amc-tasks-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, LookupSelect, PageHeader, Panel, ReactiveFormsModule, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Maintenance Tasks & Procedures" subtitle="Task library with durations, skills, tools, parts, safety requirements and dependencies." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'Tasks & Procedures' }]">
        <button type="button" class="amc-btn-primary" (click)="open(null)"><amc-icon name="plus" /> New Task</button>
      </amc-page-header>
      <amc-panel title="Task dependency" description="Tasks may be configured sequentially" icon="list">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          @for (t of chain(); track t.id; let last = $last) { <span class="rounded-full bg-brand-subtle px-2.5 py-1 font-medium text-brand">{{ t.name }}</span>@if (!last) { <amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /> } }
        </div>
        <div class="mt-3 flex items-end gap-3"><amc-form-field label="Show chain ending at" for="tk-chain" class="min-w-72"><amc-select inputId="tk-chain" [options]="refs.taskOptions()" [(value)]="chainEnd" /></amc-form-field></div>
      </amc-panel>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search task…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="pm-tasks" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="tasks.isLoading()" [actions]="rowActions" [initialPageSize]="25" emptyIcon="list" emptyTitle="No tasks" emptyMessage="Create a task." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Edit task' : 'New task'" [(open)]="formOpen">
      <form [formGroup]="form" id="task-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-3">
          <amc-form-field label="Task Name" for="tk-name" [control]="c.name" class="sm:col-span-2"><input id="tk-name" class="amc-input" formControlName="name" /></amc-form-field>
          <amc-form-field label="Task Type" for="tk-type" [control]="c.type"><amc-select inputId="tk-type" formControlName="type" [options]="typeOptions" /></amc-form-field>
          <amc-form-field label="Task Description" for="tk-desc" [control]="c.description" class="sm:col-span-3"><input id="tk-desc" class="amc-input" formControlName="description" /></amc-form-field>
          <amc-form-field label="Sequence" for="tk-seq" [control]="c.sequence"><input id="tk-seq" type="number" min="1" class="amc-input tabular-nums" formControlName="sequence" /></amc-form-field>
          <amc-form-field label="Estimated Duration (min)" for="tk-dur" [control]="c.durationMinutes"><input id="tk-dur" type="number" min="1" class="amc-input tabular-nums" formControlName="durationMinutes" /></amc-form-field>
          <amc-form-field label="Depends On" for="tk-dep" [control]="c.dependsOn"><amc-select inputId="tk-dep" formControlName="dependsOn" [options]="refs.taskOptions()" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Required Skill" for="tk-skill" [control]="c.skill"><amc-lookup-select inputId="tk-skill" formControlName="skill" [type]="lookup.skill" /></amc-form-field>
          <amc-form-field label="Required Certification" for="tk-cert" [control]="c.certification"><amc-lookup-select inputId="tk-cert" formControlName="certification" [type]="lookup.certification" /></amc-form-field>
          <amc-form-field label="Asset Category" for="tk-cat" [control]="c.assetCategory"><amc-select inputId="tk-cat" formControlName="assetCategory" [options]="categoryOptions()" /></amc-form-field>
          <amc-form-field label="Required Tool" for="tk-tool" [control]="c.tool"><input id="tk-tool" class="amc-input" formControlName="tool" /></amc-form-field>
          <amc-form-field label="Required Part" for="tk-part" [control]="c.partNumber"><amc-select inputId="tk-part" formControlName="partNumber" [options]="refs.partOptions()" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Required Consumable" for="tk-cons" [control]="c.consumable"><input id="tk-cons" class="amc-input" formControlName="consumable" /></amc-form-field>
          <amc-form-field label="Safety Requirement" for="tk-safe" [control]="c.safety" class="sm:col-span-3"><input id="tk-safe" class="amc-input" formControlName="safety" /></amc-form-field>
          <amc-form-field label="Procedure" for="tk-proc" [control]="c.procedure" class="sm:col-span-2"><textarea id="tk-proc" class="amc-textarea min-h-14" formControlName="procedure"></textarea></amc-form-field>
          <amc-form-field label="Acceptance Criteria" for="tk-acc" [control]="c.acceptance"><textarea id="tk-acc" class="amc-textarea min-h-14" formControlName="acceptance"></textarea></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="task-form" class="amc-btn-primary" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class TasksPage {
  private readonly api = inject(TaskApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(PmReferenceStore);

  protected readonly tasks = rxResource({ stream: () => this.api.list() });
  private readonly rows = computed(() => (this.tasks.hasValue() ? this.tasks.value() : []));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly categoryOptions = computed(() => [{ value: 'General', label: 'General' }, ...this.refs.categoryOptions()]);
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'type', label: 'Task Type', type: 'multiselect', options: this.typeOptions },
    { key: 'category', label: 'Asset Category', type: 'multiselect', options: this.categoryOptions() },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((t) => (!term || `${t.number} ${t.name} ${t.description}`.toLowerCase().includes(term)) && matchesAny(f, 'type', t.type) && matchesAny(f, 'category', t.assetCategory));
  });
  protected readonly columns: DataColumn<TaskListItem>[] = [
    { key: 'name', label: 'Task', value: (t) => t.name, secondary: (t) => `${t.number} · ${t.description}`, mobile: 'title', sortable: true, width: 300 },
    { key: 'type', label: 'Task Type', value: (t) => t.type, type: 'badge', tone: () => 'info', sortable: true, mobile: 'badge', width: 140 },
    { key: 'seq', label: 'Sequence', value: (t) => t.sequence, type: 'number', sortable: true, visibility: 'md', width: 90 },
    { key: 'duration', label: 'Estimated Duration', value: (t) => formatDuration(t.durationMinutes), visibility: 'md', width: 130 },
    { key: 'dep', label: 'Depends On', value: (t) => t.dependsOnName ?? '—', visibility: 'lg', width: 170 },
    { key: 'skill', label: 'Skill / Certification', value: (t) => t.skill || '—', secondary: (t) => (t.certification && t.certification !== 'None' ? t.certification : null), visibility: 'xl', width: 200 },
    { key: 'tool', label: 'Tool / Part', value: (t) => t.tool || '—', secondary: (t) => t.partName, visibility: 'xl', width: 200 },
    { key: 'safety', label: 'Safety', value: (t) => t.safety || '—', visibility: '2xl', width: 220 },
    { key: 'category', label: 'Asset Category', value: (t) => t.assetCategory, visibility: 'lg', mobile: 'meta', width: 140 },
    { key: 'plans', label: 'Used by Plans', value: (t) => t.planCount, type: 'number', visibility: 'lg', width: 110 },
  ];
  protected readonly trackById = (t: TaskListItem) => t.id;
  protected readonly rowActions = (): MenuItem[] => [{ id: 'edit', label: 'Edit', icon: 'pencil' }];
  protected readonly typeOptions = toOptions(TASK_TYPES);
  protected readonly lookup = PM_LOOKUP;
  protected readonly chainEnd = signal<string | number | null>('TSK-008');
  protected readonly chain = computed(() => {
    const out: TaskListItem[] = [];
    let cur = this.rows().find((t) => t.id === this.chainEnd());
    for (let i = 0; cur && i < 20; i++) {
      out.unshift(cur);
      cur = this.rows().find((t) => t.id === cur!.dependsOn);
    }
    return out;
  });
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<TaskListItem | null>(null);
  protected readonly form = this.fb.group({
    name: this.fb.control('', Validators.required), description: this.fb.control(''), type: this.fb.control('Inspection'), sequence: this.fb.control(1), durationMinutes: this.fb.control(15, [Validators.required, Validators.min(1)]),
    skill: this.fb.control(''), certification: this.fb.control('None'), tool: this.fb.control(''), partNumber: this.fb.control(''), consumable: this.fb.control(''), safety: this.fb.control(''), procedure: this.fb.control(''), acceptance: this.fb.control(''), dependsOn: this.fb.control(''), assetCategory: this.fb.control('General'),
  });

  protected open(t: TaskListItem | null): void {
    this.editing.set(t);
    this.form.reset({ name: t?.name ?? '', description: t?.description ?? '', type: t?.type ?? 'Inspection', sequence: t?.sequence ?? this.rows().length + 1, durationMinutes: t?.durationMinutes ?? 15, skill: t?.skill ?? '', certification: t?.certification || 'None', tool: t?.tool ?? '', partNumber: t?.partNumber ?? '', consumable: t?.consumable ?? '', safety: t?.safety ?? '', procedure: t?.procedure ?? '', acceptance: t?.acceptance ?? '', dependsOn: t?.dependsOn ?? '', assetCategory: t?.assetCategory ?? 'General' });
    this.formOpen.set(true);
  }

  protected onAction({ row }: RowAction<TaskListItem>): void {
    this.open(row);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const input = { ...v, sequence: Number(v.sequence), durationMinutes: Number(v.durationMinutes), partNumber: v.partNumber || null, dependsOn: v.dependsOn || null };
    const t = this.editing();
    this.busy.set(true);
    try {
      await firstValueFrom(t ? this.api.update(t.id, input) : this.api.create(input));
      this.notify.success(t ? 'Task updated.' : 'Task created.');
      this.formOpen.set(false);
      this.tasks.reload();
      this.refs.refresh();
    } catch (e) {
      this.notify.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
