import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { firstValueFrom } from 'rxjs';
import { PmReferenceStore } from '../data/pm-reference.store';
import { ChecklistApi } from '../data/pm.api';
import { CHECKLIST_ITEM_TYPES, type ChecklistItem, type ChecklistListItem } from '../models/operations.model';

/** SRS 8.11 — standardized inspection and maintenance checklists. */
@Component({
  selector: 'amc-checklists-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, PageHeader, Select, Spinner, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Maintenance Checklists" subtitle="Inspection points, measurements with limits, pass / fail, photos and signatures." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'Checklists' }]">
        <button type="button" class="amc-btn-primary" (click)="open(null)"><amc-icon name="plus" /> New Checklist</button>
      </amc-page-header>
      <ol class="flex flex-wrap items-center gap-2 text-xs" aria-label="Checklist workflow">
        @for (s of flow; track s; let last = $last) { <li class="flex items-center gap-2"><span class="rounded-full bg-surface-sunken px-2.5 py-1 font-medium text-ink-muted">{{ s }}</span>@if (!last) { <amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /> }</li> }
      </ol>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search checklist…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="pm-checklists" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="lists.isLoading()" [actions]="rowActions" emptyIcon="clipboard-list" emptyTitle="No checklists" emptyMessage="Create a checklist." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="xl" [title]="editing() ? 'Edit checklist — new version' : 'New checklist'" [(open)]="formOpen">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <amc-form-field label="Checklist Name" for="ck-name" [required]="true" class="sm:col-span-2"><input id="ck-name" class="amc-input" [value]="name()" (input)="name.set($any($event.target).value)" /></amc-form-field>
        <amc-form-field label="Asset Category" for="ck-cat"><amc-select inputId="ck-cat" [options]="categoryOptions()" [(value)]="category" /></amc-form-field>
        <amc-form-field label="Status" for="ck-status"><amc-select inputId="ck-status" [options]="statusOptions" [(value)]="status" /></amc-form-field>
        <amc-form-field label="Service" for="ck-svc" class="sm:col-span-2"><amc-select inputId="ck-svc" [options]="refs.serviceOptions()" [(value)]="service" [clearable]="true" /></amc-form-field>
      </div>
      <p class="amc-overline mt-5">Checklist items</p>
      <div class="mt-2 space-y-2">
        @for (it of items(); track it.id; let i = $index; let first = $first; let last = $last) {
          <div class="rounded-xl border border-line p-3">
            <div class="flex flex-wrap items-end gap-2">
              <span class="pb-2 text-xs font-semibold tabular-nums text-ink-muted">{{ i + 1 }}</span>
              <amc-form-field label="Task" [for]="'ci-task-' + i" class="min-w-56 flex-1"><input [id]="'ci-task-' + i" class="amc-input" [value]="it.task" (input)="patch(i, { task: $any($event.target).value })" /></amc-form-field>
              <amc-form-field label="Type" [for]="'ci-type-' + i" class="w-44"><amc-select [inputId]="'ci-type-' + i" [options]="typeOptions" [value]="it.type" (valueChange)="patch(i, { type: $any($event) })" /></amc-form-field>
              <amc-form-field label="Inspection Point" [for]="'ci-ip-' + i" class="w-44"><input [id]="'ci-ip-' + i" class="amc-input" [value]="it.inspectionPoint" (input)="patch(i, { inspectionPoint: $any($event.target).value })" /></amc-form-field>
              <div class="flex items-center gap-1 pb-1">
                <button type="button" class="amc-btn-ghost amc-btn-sm" aria-label="Move up" [disabled]="first" (click)="reorder(i, -1)"><amc-icon name="chevron-left" [size]="14" class="rotate-90" /></button>
                <button type="button" class="amc-btn-ghost amc-btn-sm" aria-label="Move down" [disabled]="last" (click)="reorder(i, 1)"><amc-icon name="chevron-right" [size]="14" class="rotate-90" /></button>
                <button type="button" class="amc-btn-ghost amc-btn-sm" aria-label="Remove item" (click)="remove(i)"><amc-icon name="x" [size]="14" /></button>
              </div>
            </div>
            <div class="mt-2 flex flex-wrap items-end gap-2">
              <amc-switch [checked]="it.required" (checkedChange)="patch(i, { required: $event })" label="Required" />
              @if (it.type === 'Measurement' || it.type === 'Numeric') {
                <amc-form-field label="Unit" [for]="'ci-unit-' + i" class="w-24"><input [id]="'ci-unit-' + i" class="amc-input" [value]="it.unit" (input)="patch(i, { unit: $any($event.target).value })" /></amc-form-field>
                <amc-form-field label="Minimum" [for]="'ci-min-' + i" class="w-28"><input [id]="'ci-min-' + i" type="number" class="amc-input tabular-nums" [value]="it.min ?? ''" (input)="patch(i, { min: num($any($event.target).value) })" /></amc-form-field>
                <amc-form-field label="Maximum" [for]="'ci-max-' + i" class="w-28"><input [id]="'ci-max-' + i" type="number" class="amc-input tabular-nums" [value]="it.max ?? ''" (input)="patch(i, { max: num($any($event.target).value) })" /></amc-form-field>
              }
              @if (it.type === 'Yes / No' || it.type === 'Pass / Fail' || it.type === 'Text') { <amc-form-field label="Expected Result" [for]="'ci-exp-' + i" class="w-40"><input [id]="'ci-exp-' + i" class="amc-input" [value]="it.expected" (input)="patch(i, { expected: $any($event.target).value })" /></amc-form-field> }
              @if (it.type === 'Selection') { <amc-form-field label="Options (comma separated)" [for]="'ci-opt-' + i" class="min-w-64 flex-1"><input [id]="'ci-opt-' + i" class="amc-input" [value]="it.options.join(', ')" (input)="patch(i, { options: splitOptions($any($event.target).value) })" /></amc-form-field> }
            </div>
          </div>
        }
        <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="add()"><amc-icon name="plus" [size]="14" /> Add item</button>
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="save()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ChecklistsPage {
  private readonly api = inject(ChecklistApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(PmReferenceStore);

  protected readonly lists = rxResource({ stream: () => this.api.list() });
  private readonly rows = computed(() => (this.lists.hasValue() ? this.lists.value() : []));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly categoryOptions = computed(() => [{ value: 'General', label: 'General' }, ...this.refs.categoryOptions()]);
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'category', label: 'Asset Category', type: 'multiselect', options: this.categoryOptions() },
    { key: 'status', label: 'Status', type: 'multiselect', options: this.statusOptions },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((c) => (!term || `${c.number} ${c.name}`.toLowerCase().includes(term)) && matchesAny(f, 'category', c.assetCategory) && matchesAny(f, 'status', c.status));
  });
  protected readonly columns: DataColumn<ChecklistListItem>[] = [
    { key: 'name', label: 'Checklist', value: (c) => c.name, secondary: (c) => `${c.number} · v${c.version}`, mobile: 'title', sortable: true, width: 300 },
    { key: 'category', label: 'Asset Category', value: (c) => c.assetCategory, mobile: 'meta', sortable: true, width: 160 },
    { key: 'service', label: 'Service', value: (c) => this.refs.data().services.find((s) => s.id === c.serviceId)?.name ?? 'Any', visibility: 'xl', width: 180 },
    { key: 'items', label: 'Items', value: (c) => c.items.length, type: 'number', visibility: 'md', width: 80 },
    { key: 'measurements', label: 'Measurements', value: (c) => c.measurementCount, type: 'number', visibility: 'lg', width: 120 },
    { key: 'required', label: 'Required Items', value: (c) => c.items.filter((i) => i.required).length, type: 'number', visibility: 'lg', width: 120 },
    { key: 'plans', label: 'Used by Plans', value: (c) => c.planCount, type: 'number', visibility: 'md', width: 120 },
    { key: 'status', label: 'Status', value: (c) => c.status, type: 'badge', tone: (c) => (c.status === 'Active' ? 'ok' : 'neutral'), mobile: 'badge', width: 100 },
  ];
  protected readonly trackById = (c: ChecklistListItem) => c.id;
  protected readonly rowActions = (): MenuItem[] => [{ id: 'edit', label: 'Edit (new version)', icon: 'pencil' }, { id: 'duplicate', label: 'Duplicate', icon: 'copy' }];
  protected readonly flow = ['Maintenance Work Order', 'Checklist Assigned', 'Technician Performs Tasks', 'Inspection Results', 'Measurements', 'Pass / Fail', 'Corrective Action if Required', 'Checklist Completion'];
  protected readonly typeOptions = toOptions(CHECKLIST_ITEM_TYPES);
  protected readonly statusOptions = toOptions(['Active', 'Inactive'] as const);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ChecklistListItem | null>(null);
  protected readonly name = signal('');
  protected readonly category = signal<string | number | null>('General');
  protected readonly status = signal<string | number | null>('Active');
  protected readonly service = signal<string | number | null>(null);
  protected readonly items = signal<ChecklistItem[]>([]);
  private seq = 1;

  protected open(c: ChecklistListItem | null, copy = false): void {
    this.editing.set(copy ? null : c);
    this.name.set(c ? `${c.name}${copy ? ' (Copy)' : ''}` : '');
    this.category.set(c?.assetCategory ?? 'General');
    this.status.set(c?.status ?? 'Active');
    this.service.set(c?.serviceId ?? null);
    this.items.set(c ? c.items.map((i) => ({ ...i, options: [...i.options] })) : []);
    if (!c) this.add();
    this.formOpen.set(true);
  }

  protected onAction({ id, row }: RowAction<ChecklistListItem>): void {
    this.open(row, id === 'duplicate');
  }

  protected add(): void {
    this.items.update((l) => [...l, { id: `NEW-${this.seq++}`, sequence: l.length + 1, task: '', type: 'Pass / Fail', required: true, inspectionPoint: '', expected: '', unit: '', min: null, max: null, options: [] }]);
  }

  protected remove(i: number): void {
    this.items.update((l) => l.filter((_, idx) => idx !== i));
  }

  protected reorder(i: number, step: number): void {
    this.items.update((l) => {
      const next = [...l];
      [next[i], next[i + step]] = [next[i + step], next[i]];
      return next;
    });
  }

  protected patch(i: number, p: Partial<ChecklistItem>): void {
    this.items.update((l) => l.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  }

  protected num(v: string): number | null {
    return v === '' ? null : Number(v);
  }

  protected splitOptions(v: string): string[] {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }

  protected async save(): Promise<void> {
    const input = { name: this.name().trim(), assetCategory: String(this.category() ?? 'General'), serviceId: this.service() ? String(this.service()) : null, status: (this.status() ?? 'Active') as 'Active' | 'Inactive', items: this.items().map((it, idx) => ({ ...it, sequence: idx + 1 })) };
    const c = this.editing();
    this.busy.set(true);
    try {
      await firstValueFrom(c ? this.api.update(c.id, input) : this.api.create(input));
      this.notify.success(c ? `${input.name} saved as a new version.` : `${input.name} created.`);
      this.formOpen.set(false);
      this.lists.reload();
      this.refs.refresh();
    } catch (e) {
      this.notify.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
