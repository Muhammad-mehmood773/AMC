import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { OccurrenceActionHost, occurrenceActions } from '../components/occurrence-action-host';
import { dueColumns } from '../components/pm-columns';
import { PmReferenceStore } from '../data/pm-reference.store';
import { ScheduleApi } from '../data/pm.api';
import { DUE_CATEGORIES, type DueCategory, OVERDUE_REASONS, type OccurrenceListItem } from '../models/operations.model';

/** SRS 8.16 — maintenance approaching or exceeding due dates. */
@Component({
  selector: 'amc-due-page',
  imports: [DataTable, FilterBar, Icon, OccurrenceActionHost, PageHeader, Panel, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Maintenance Due / Overdue" subtitle="Continuously identified — overdue events escalate to the supervisor, then management." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'Due / Overdue' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
      </amc-page-header>
      <ol class="flex flex-wrap items-center gap-2 text-xs" aria-label="Overdue escalation">
        @for (s of flow; track s; let last = $last) { <li class="flex items-center gap-2"><span class="rounded-full bg-danger-subtle px-2.5 py-1 font-medium text-danger">{{ s }}</span>@if (!last) { <amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /> }</li> }
      </ol>
      <amc-tabs [items]="tabs()" [active]="active()" [maxVisible]="8" (activeChange)="active.set($any($event))" />
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <section class="amc-card overflow-hidden xl:col-span-3">
          <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search plan, asset, site or customer…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
          <amc-data-table tableId="pm-due" [entity]="{ singular: 'event', plural: 'events' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="events.isLoading()" [actions]="rowActions" [initialPageSize]="25" emptyIcon="check-circle" emptyTitle="All clear" emptyMessage="No maintenance in this category." (action)="onAction($event)" />
        </section>
        <amc-panel title="Overdue reasons" icon="alert-circle" [padded]="false">
          <ul class="divide-y divide-line">
            @for (r of reasons(); track r.reason) { <li class="flex items-center justify-between px-4 py-2.5 text-sm"><span class="text-ink">{{ r.reason }}</span><span class="font-semibold tabular-nums">{{ r.count }}</span></li> }
          </ul>
        </amc-panel>
      </div>
    </div>
    <amc-occurrence-action-host (done)="events.reload()" />
  `,
})
export class DuePage {
  private readonly api = inject(ScheduleApi);
  protected readonly refs = inject(PmReferenceStore);
  private readonly host = viewChild.required(OccurrenceActionHost);

  readonly category = input<string>();

  protected readonly events = rxResource({ stream: () => this.api.list() });
  private readonly rows = computed(() => (this.events.hasValue() ? this.events.value() : []).filter((o) => o.dueCategory));
  protected readonly active = linkedSignal<DueCategory>(() => (DUE_CATEGORIES.includes(this.category() as DueCategory) ? (this.category() as DueCategory) : 'Overdue'));
  protected readonly tabs = computed<TabItem[]>(() => DUE_CATEGORIES.map((c) => ({ id: c, label: c, count: this.rows().filter((o) => o.dueCategory === c).length })));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'plan', label: 'Plan', type: 'multiselect', options: this.refs.planOptions() },
    { key: 'technician', label: 'Technician', type: 'multiselect', options: this.refs.technicianOptions() },
    { key: 'reason', label: 'Reason', type: 'multiselect', options: OVERDUE_REASONS.map((r) => ({ value: r, label: r })) },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((o) => o.dueCategory === this.active() && (!term || `${o.planName} ${o.planNumber} ${o.assetName} ${o.siteName} ${o.customerName}`.toLowerCase().includes(term)) && matchesAny(f, 'customer', o.customerId) && matchesAny(f, 'plan', o.planId) && matchesAny(f, 'technician', o.technician) && matchesAny(f, 'reason', o.overdueReason)).sort((a, b) => b.daysOverdue - a.daysOverdue || a.scheduledDate.localeCompare(b.scheduledDate));
  });
  protected readonly reasons = computed(() => OVERDUE_REASONS.map((reason) => ({ reason, count: this.rows().filter((o) => o.overdueReason === reason && (o.dueCategory === 'Overdue' || o.dueCategory === 'Severely Overdue' || o.dueCategory === 'Missed')).length })).filter((r) => r.count).sort((a, b) => b.count - a.count));
  protected readonly columns = dueColumns();
  protected readonly trackById = (o: OccurrenceListItem) => o.id;
  protected readonly rowActions = (o: OccurrenceListItem): MenuItem[] => occurrenceActions(o);
  protected readonly flow = ['Maintenance Due', 'Reminder', 'Due Date', 'Overdue', 'Supervisor Notification', 'Management Escalation', 'Rescheduling / Corrective Action', 'Completion'];

  protected onAction({ id, row }: RowAction<OccurrenceListItem>): void {
    void this.host().run(id, row);
  }

  protected export(): void {
    downloadCsv(timestampedName('pm-due-overdue', 'csv'), ['Maintenance Plan', 'Schedule', 'Asset', 'Site', 'Customer', 'Original Due Date', 'Days Overdue', 'Assigned Technician', 'Work Order', 'Priority', 'Reason', 'Escalation Status', 'Category'],
      this.filtered().map((o) => [o.planNumber, o.number, o.assetName, o.siteName, o.customerName, o.dueDate, o.daysOverdue, o.technician, o.workOrderNumber, o.priority, o.overdueReason, o.escalationLevel === 2 ? 'Management' : o.escalationLevel === 1 ? 'Supervisor' : 'None', o.dueCategory]));
  }
}
