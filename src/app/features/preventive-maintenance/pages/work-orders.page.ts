import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type BulkAction, type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Spinner } from '@shared/ui/spinner';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { firstValueFrom } from 'rxjs';
import { occurrenceColumns, workOrderColumns } from '../components/pm-columns';
import { PmReferenceStore } from '../data/pm-reference.store';
import { PlanApi, PmWorkOrderApi, ScheduleApi } from '../data/pm.api';
import { addDays, today } from '../data/pm-recurrence';
import { OPEN_STATUSES, type OccurrenceListItem, PM_WO_STATUSES, type PmWorkOrderListItem } from '../models/operations.model';
import type { PlanListItem } from '../models/plan.model';

/** SRS 8.14 — work orders generated from schedules by automation rules. */
@Component({
  selector: 'amc-pm-work-orders-page',
  imports: [DataTable, FilterBar, Icon, PageHeader, Spinner, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Automatic Work Order Generation" subtitle="Work orders created X days before the due date, on meter thresholds and condition triggers — each traceable to its rule." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'Work Order Generation' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="run()">@if (busy()) { <amc-spinner [size]="14" /> } @else { <amc-icon name="play" /> } Run Automation Now</button>
      </amc-page-header>
      <ol class="flex flex-wrap items-center gap-2 text-xs" aria-label="Automation example">
        @for (s of flow; track s; let last = $last) { <li class="flex items-center gap-2"><span class="rounded-full bg-accent-subtle px-2.5 py-1 font-medium text-accent">{{ s }}</span>@if (!last) { <amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /> }</li> }
      </ol>
      <amc-tabs [items]="tabs()" [active]="tab()" (activeChange)="tab.set($any($event))" />
      <section class="amc-card overflow-hidden">
        @switch (tab()) {
          @case ('orders') {
            <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search work order, plan, customer or asset…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
            <amc-data-table tableId="pm-wos" [entity]="{ singular: 'work order', plural: 'work orders' }" [rows]="filteredOrders()" [columns]="woCols" [trackBy]="trackById" [loading]="orders.isLoading()" [actions]="woActions" [initialPageSize]="25" emptyIcon="wrench" emptyTitle="No work orders" emptyMessage="No work orders match." (action)="onWo($event)" />
          }
          @case ('pending') {
            <p class="border-b border-line px-4 py-3 text-sm text-ink-muted sm:px-5">Open events in the next 30 days without a work order. Select events to generate work orders now.</p>
            <amc-data-table tableId="pm-pending" [rows]="pending()" [columns]="occCols" [trackBy]="trackById" [loading]="events.isLoading()" [selectable]="true" [bulkActions]="bulk" [actions]="pendingActions" [initialPageSize]="25" emptyIcon="check-circle" emptyTitle="Nothing pending" emptyMessage="Every upcoming event has a work order." (action)="onPending($event)" (bulkAction)="onBulk($event)" />
          }
          @default {
            <amc-data-table tableId="pm-gen-rules" [rows]="plans()" [columns]="ruleCols" [trackBy]="trackById" [loading]="plansRes.isLoading()" [initialPageSize]="25" emptyIcon="wrench" emptyTitle="No plans" emptyMessage="No maintenance plans." />
          }
        }
      </section>
    </div>
  `,
})
export class WorkOrdersPage {
  private readonly api = inject(PmWorkOrderApi);
  private readonly scheduleApi = inject(ScheduleApi);
  private readonly planApi = inject(PlanApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(PmReferenceStore);

  readonly planId = input<string>();

  protected readonly tab = signal<'orders' | 'pending' | 'rules'>('orders');
  protected readonly orders = rxResource({ stream: () => this.api.list() });
  protected readonly events = rxResource({ stream: () => this.scheduleApi.list() });
  protected readonly plansRes = rxResource({ stream: () => this.planApi.list() });
  private readonly orderRows = computed(() => (this.orders.hasValue() ? this.orders.value() : []));
  protected readonly plans = computed(() => (this.plansRes.hasValue() ? this.plansRes.value() : []));
  protected readonly pending = computed(() => (this.events.hasValue() ? this.events.value() : []).filter((o) => OPEN_STATUSES.includes(o.status) && !o.workOrderId && o.scheduledDate <= addDays(today(), 30) && (!this.planId() || o.planId === this.planId())));
  protected readonly tabs = computed<TabItem[]>(() => [{ id: 'orders', label: 'Generated Work Orders', count: this.orderRows().length }, { id: 'pending', label: 'Pending Generation', count: this.pending().length }, { id: 'rules', label: 'Generation Rules' }]);
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.planId() ? { plan: [this.planId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'kind', label: 'Kind', type: 'multiselect', options: toOptions(['Preventive', 'Corrective'] as const) },
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(PM_WO_STATUSES) },
    { key: 'plan', label: 'Plan', type: 'multiselect', options: this.refs.planOptions() },
    { key: 'team', label: 'Team', type: 'multiselect', options: this.refs.teamOptions() },
  ]);
  protected readonly filteredOrders = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.orderRows().filter((w) => (!term || `${w.number} ${w.planNumber} ${w.customerName} ${w.assetName}`.toLowerCase().includes(term)) && matchesAny(f, 'kind', w.kind) && matchesAny(f, 'status', w.status) && matchesAny(f, 'plan', w.planId) && matchesAny(f, 'team', w.team));
  });
  protected readonly woCols = workOrderColumns();
  protected readonly occCols = occurrenceColumns();
  protected readonly ruleCols: DataColumn<PlanListItem>[] = [
    { key: 'plan', label: 'Plan', value: (p) => p.name, secondary: (p) => `${p.number} · ${p.status}`, link: (p) => `/app/preventive-maintenance/${p.id}`, mobile: 'title', width: 280 },
    { key: 'rule', label: 'Generation Rule', value: (p) => (!p.automation.autoGenerate ? 'Manual' : p.strategy.strategy === 'Meter-Based' ? 'Generate on meter threshold' : p.strategy.strategy === 'Condition-Based' ? 'Generate on condition trigger' : p.automation.leadDays === 0 ? 'Generate on schedule date' : `Generate ${p.automation.leadDays} days before due date`), mobile: 'meta', width: 240 },
    { key: 'type', label: 'Work Order Type / Priority', value: (p) => p.automation.woType, secondary: (p) => p.automation.priority, visibility: 'lg', width: 170 },
    { key: 'assign', label: 'Assignment', value: (p) => (p.automation.autoAssign ? `Auto → ${p.automation.technician}` : 'Manual'), secondary: (p) => (p.automation.autoDispatch ? 'Auto dispatch' : null), visibility: 'md', width: 200 },
    { key: 'next', label: 'Next Due Date', value: (p) => p.nextDueDate, type: 'date', visibility: 'md', width: 120 },
    { key: 'wos', label: 'Work Orders', value: (p) => p.kpis.workOrders, type: 'number', visibility: 'lg', width: 110 },
    { key: 'auto', label: 'Auto Generate', value: (p) => (p.automation.autoGenerate && p.status === 'Active' ? 'On' : 'Off'), type: 'badge', tone: (p) => (p.automation.autoGenerate && p.status === 'Active' ? 'ok' : 'neutral'), mobile: 'badge', width: 120 },
  ];
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly woActions = (w: PmWorkOrderListItem): MenuItem[] => (['Open', 'Assigned'].includes(w.status) ? [{ id: 'dispatch', label: 'Dispatch', icon: 'send', disabled: !w.technician, hint: w.technician ? undefined : 'Assign a technician first' }] : []);
  protected readonly pendingActions = (): MenuItem[] => [{ id: 'generate', label: 'Generate Work Order', icon: 'wrench' }];
  protected readonly bulk: MenuItem[] = [{ id: 'generate', label: 'Generate Work Orders', icon: 'wrench' }];
  protected readonly flow = ['Maintenance Plan', 'Quarterly Frequency', 'Next Due Date', '7 Days Before Due Date', 'Automatic Work Order', 'Technician Assignment', 'Notification', 'Service Visit', 'Completion', 'Next Recurrence'];
  protected readonly busy = signal(false);

  protected async run(): Promise<void> {
    this.busy.set(true);
    try {
      const n = await firstValueFrom(this.api.runAutomation());
      this.notify.success(n ? `${n} automation action(s) performed.` : 'Everything is up to date.');
      this.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected async onWo({ row }: RowAction<PmWorkOrderListItem>): Promise<void> {
    try {
      await firstValueFrom(this.api.dispatch(row.id));
      this.notify.success(`${row.number} dispatched.`);
      this.orders.reload();
    } catch (e) {
      this.notify.error((e as Error).message);
    }
  }

  protected onPending({ row }: RowAction<OccurrenceListItem>): void {
    void this.generate([row]);
  }

  protected onBulk({ rows }: BulkAction<OccurrenceListItem>): void {
    void this.generate(rows);
  }

  private async generate(rows: readonly OccurrenceListItem[]): Promise<void> {
    let n = 0;
    let error = '';
    for (const o of rows) {
      try {
        await firstValueFrom(this.api.generate(o.id));
        n++;
      } catch (e) {
        error ||= (e as Error).message;
      }
    }
    if (n) this.notify.success(`${n} work order(s) generated.`);
    if (error) this.notify.error(error);
    this.reload();
  }

  private reload(): void {
    this.orders.reload();
    this.events.reload();
    this.plansRes.reload();
  }

  protected export(): void {
    downloadCsv(timestampedName('pm-work-orders', 'csv'), ['Work Order Number', 'Kind', 'Maintenance Plan', 'Maintenance Schedule', 'Customer', 'Site', 'Asset', 'Service', 'Maintenance Type', 'Priority', 'Planned Date', 'Due Date', 'Assigned Team', 'Assigned Technician', 'Checklist', 'Required Parts', 'Required Tools', 'Generated By', 'Status'],
      this.filteredOrders().map((w) => [w.number, w.kind, w.planNumber, w.occurrenceNumber, w.customerName, w.siteName, w.assetName, w.serviceName, w.maintenanceType, w.priority, w.plannedDate, w.dueDate, w.team, w.technician, w.checklistId, w.parts.map((p) => `${p.quantity} × ${p.partNumber}`).join('; '), w.tools, w.generatedBy, w.status]));
  }
}
