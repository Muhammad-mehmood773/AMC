import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type BulkAction, DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, matchesAny, withinRange } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { OccurrenceActionHost, occurrenceActions } from '../components/occurrence-action-host';
import { occurrenceColumns } from '../components/pm-columns';
import { PmReferenceStore } from '../data/pm-reference.store';
import { PmWorkOrderApi, ScheduleApi } from '../data/pm.api';
import { OCCURRENCE_STATUSES, OPEN_STATUSES, OVERDUE_REASONS, type OccurrenceListItem } from '../models/operations.model';
import { PM_TYPES } from '../models/plan.model';

/** SRS 8.9 — individual scheduled maintenance events. */
@Component({
  selector: 'amc-schedule-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, OccurrenceActionHost, PageHeader, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Recurring Maintenance Schedule" subtitle="Maintenance events generated from plans — assign, reschedule, generate work orders and complete." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'Schedule' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="generateOpen.set(true)"><amc-icon name="calendar-check" /> Generate Schedule</button>
      </amc-page-header>
      <ol class="flex flex-wrap items-center gap-2 text-xs" aria-label="Workflow">
        @for (s of flow; track s; let last = $last) { <li class="flex items-center gap-2"><span class="rounded-full bg-surface-sunken px-2.5 py-1 font-medium text-ink-muted">{{ s }}</span>@if (!last) { <amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /> }</li> }
      </ol>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search schedule number, plan, customer, site or asset…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="pm-schedule" [entity]="{ singular: 'event', plural: 'events' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="events.isLoading()" [actions]="rowActions" [selectable]="true" [bulkActions]="bulkActions" [initialPageSize]="25" emptyIcon="calendar" emptyTitle="No events match" emptyMessage="Try different filters." (action)="onAction($event)" (bulkAction)="onBulk($event)" />
      </section>
    </div>

    <amc-dialog size="md" title="Generate schedule" description="Automatic schedule generation for the next 12 months — existing events are never duplicated." [(open)]="generateOpen">
      <amc-form-field label="Maintenance Plan" for="gs-plan"><amc-select inputId="gs-plan" [options]="refs.planOptions()" [(value)]="genPlan" /></amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="generateOpen.set(false)">Close</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || !genPlan()" (click)="generate()">@if (busy()) { <amc-spinner [size]="14" /> } Generate</button>
      </ng-container>
    </amc-dialog>

    <amc-dialog size="md" [title]="bulkMode() === 'assign' ? 'Bulk assignment' : 'Bulk rescheduling'" [description]="bulkIds().length + ' event(s) selected'" [open]="!!bulkMode()" (openChange)="!$event && bulkMode.set(null)">
      @if (bulkMode() === 'assign') {
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <amc-form-field label="Team" for="ba-team"><amc-select inputId="ba-team" [options]="refs.teamOptions()" [(value)]="team" /></amc-form-field>
          <amc-form-field label="Technician" for="ba-tech"><amc-select inputId="ba-tech" [options]="refs.technicianOptions()" [(value)]="technician" [clearable]="true" /></amc-form-field>
        </div>
        <p class="mt-2 text-xs text-ink-muted">Skill, certification, territory and daily capacity are checked for each event.</p>
      } @else {
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <amc-form-field label="Shift (days)" for="br-days"><input id="br-days" type="number" class="amc-input tabular-nums" [value]="days()" (input)="days.set(+$any($event.target).value || 0)" /></amc-form-field>
          <amc-form-field label="Reason" for="br-reason"><amc-select inputId="br-reason" [options]="reasonOptions" [(value)]="reason" /></amc-form-field>
        </div>
        <p class="mt-2 text-xs text-ink-muted">New dates are moved off weekends and holidays. Original planned dates are preserved.</p>
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="bulkMode.set(null)">Close</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || (bulkMode() === 'assign' ? !team() : !days() || !reason())" (click)="applyBulk()">@if (busy()) { <amc-spinner [size]="14" /> } Apply</button>
      </ng-container>
    </amc-dialog>
    <amc-occurrence-action-host (done)="events.reload()" />
  `,
})
export class SchedulePage {
  private readonly api = inject(ScheduleApi);
  private readonly woApi = inject(PmWorkOrderApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(PmReferenceStore);
  private readonly host = viewChild.required(OccurrenceActionHost);

  readonly planId = input<string>();

  protected readonly events = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.events.hasValue() ? this.events.value() : []));
  protected readonly columns = occurrenceColumns();
  protected readonly trackById = (o: OccurrenceListItem) => o.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.planId() ? { plan: [this.planId()!] } : { status: ['Planned', 'Scheduled', 'Assigned', 'Confirmed', 'In Progress', 'Rescheduled', 'Overdue'] }));
  protected readonly filterFields = computed<FilterField[]>(() => {
    const customers = filterList(this.filters(), 'customer');
    return [
      { key: 'plan', label: 'Maintenance Plan', type: 'multiselect', options: this.refs.planOptions() },
      { key: 'status', label: 'Maintenance Status', type: 'multiselect', options: toOptions(OCCURRENCE_STATUSES) },
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(customers.length === 1 ? customers[0] : null) },
      { key: 'type', label: 'Maintenance Type', type: 'multiselect', options: toOptions(PM_TYPES) },
      { key: 'team', label: 'Assigned Team', type: 'multiselect', options: this.refs.teamOptions() },
      { key: 'technician', label: 'Assigned Technician', type: 'multiselect', options: this.refs.technicianOptions() },
      { key: 'scheduled', label: 'Scheduled Date', type: 'date-range' },
      { key: 'due', label: 'Due Date', type: 'date-range' },
    ];
  });
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((o) => (!term || `${o.number} ${o.planNumber} ${o.planName} ${o.customerName} ${o.siteName} ${o.assetName}`.toLowerCase().includes(term)) && matchesAny(f, 'plan', o.planId) && matchesAny(f, 'status', o.effectiveStatus) && matchesAny(f, 'customer', o.customerId) && matchesAny(f, 'site', o.siteId) && matchesAny(f, 'type', o.maintenanceType) && matchesAny(f, 'team', o.team) && matchesAny(f, 'technician', o.technician) && withinRange(f, 'scheduled', o.scheduledDate) && withinRange(f, 'due', o.dueDate));
  });
  protected readonly rowActions = (o: OccurrenceListItem): MenuItem[] => occurrenceActions(o);
  protected readonly bulkActions: MenuItem[] = [
    { id: 'assign', label: 'Bulk Assign', icon: 'user-check' },
    { id: 'reschedule', label: 'Bulk Reschedule', icon: 'calendar' },
    { id: 'wo', label: 'Generate Work Orders', icon: 'wrench' },
    { id: 'export', label: 'Export', icon: 'download', dividerBefore: true },
  ];
  protected readonly flow = ['Plan', 'Frequency', 'Recurrence Rule', 'Schedule Generation', 'Events', 'Work Order', 'Technician', 'Service Visit', 'Completion', 'Next Recurrence'];
  protected readonly reasonOptions = toOptions(OVERDUE_REASONS);
  protected readonly busy = signal(false);
  protected readonly generateOpen = signal(false);
  protected readonly genPlan = signal<string | number | null>(null);
  protected readonly bulkMode = signal<'assign' | 'reschedule' | null>(null);
  protected readonly bulkIds = signal<string[]>([]);
  protected readonly team = signal<string | number | null>(null);
  protected readonly technician = signal<string | number | null>(null);
  protected readonly days = signal(7);
  protected readonly reason = signal<string | number | null>('Scheduling Conflict');

  protected onAction({ id, row }: RowAction<OccurrenceListItem>): void {
    void this.host().run(id, row);
  }

  protected async onBulk({ id, rows }: BulkAction<OccurrenceListItem>): Promise<void> {
    const open = rows.filter((o) => OPEN_STATUSES.includes(o.status));
    if (id === 'export') return this.export(rows);
    if (!open.length) return this.notify.warning('Select open events.');
    if (id === 'wo') {
      let n = 0;
      for (const o of open.filter((x) => !x.workOrderId)) {
        try {
          await firstValueFrom(this.woApi.generate(o.id));
          n++;
        } catch {
          /* reported in summary */
        }
      }
      this.notify.success(`${n} work order(s) generated.`);
      this.events.reload();
      return;
    }
    this.bulkIds.set(open.map((o) => o.id));
    this.bulkMode.set(id as 'assign' | 'reschedule');
  }

  protected async applyBulk(): Promise<void> {
    const work: Observable<number> = this.bulkMode() === 'assign' ? this.api.bulkAssign(this.bulkIds(), { team: String(this.team()), technician: this.technician() ? String(this.technician()) : null }) : this.api.bulkReschedule(this.bulkIds(), this.days(), String(this.reason()));
    if (await this.exec(work, (n) => `${n} event(s) updated.`)) this.bulkMode.set(null);
  }

  protected async generate(): Promise<void> {
    if (await this.exec(this.api.generate(String(this.genPlan())), (n) => (n ? `${n} event(s) generated.` : 'Schedule is already up to date — no duplicates created.'))) this.generateOpen.set(false);
  }

  private async exec(work: Observable<number>, message: (n: number) => string): Promise<boolean> {
    this.busy.set(true);
    try {
      this.notify.success(message(await firstValueFrom(work)));
      this.events.reload();
      return true;
    } catch (e) {
      this.notify.error((e as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected export(rows: readonly OccurrenceListItem[] = this.filtered()): void {
    downloadCsv(timestampedName('pm-schedule', 'csv'), ['Schedule Number', 'Maintenance Plan', 'Customer', 'Site', 'Asset', 'Service', 'Maintenance Type', 'Original Date', 'Scheduled Date', 'Due Date', 'Maintenance Window', 'Assigned Team', 'Assigned Technician', 'Priority', 'Status', 'Work Order', 'Generated By'],
      rows.map((o) => [o.number, o.planNumber, o.customerName, o.siteName, o.assetName, o.serviceName, o.maintenanceType, o.originalDate, o.scheduledDate, o.dueDate, o.window, o.team, o.technician, o.priority, o.effectiveStatus, o.workOrderNumber, o.generatedBy]));
  }
}
