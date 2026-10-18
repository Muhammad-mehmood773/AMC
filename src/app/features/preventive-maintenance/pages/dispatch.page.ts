import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { OccurrenceActionHost, occurrenceActions } from '../components/occurrence-action-host';
import { PmReferenceStore } from '../data/pm-reference.store';
import { PlanApi, ScheduleApi } from '../data/pm.api';
import { addDays, today } from '../data/pm-recurrence';
import { ASSIGN_TONE, PRIORITY_TONE } from '../models/display';
import { ASSIGNMENT_STATUSES, OPEN_STATUSES, type OccurrenceListItem } from '../models/operations.model';

/** SRS 8.15 — allocation of preventive maintenance to technicians and teams. */
@Component({
  selector: 'amc-dispatch-page',
  imports: [DataTable, FilterBar, Icon, KpiCard, OccurrenceActionHost, PageHeader, Panel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Maintenance Assignment & Dispatch" subtitle="Assign by skill, certification, availability, territory, preference, workload, priority and window." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'Assignment & Dispatch' }]" />
      <section class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        @for (s of statuses; track s) { <amc-kpi-card [label]="s" icon="user-check" [tone]="tone[s]" [value]="count(s)" /> }
      </section>
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <section class="amc-card overflow-hidden xl:col-span-3">
          <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search schedule, work order, customer, site or asset…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
          <amc-data-table tableId="pm-dispatch" [entity]="{ singular: 'assignment', plural: 'assignments' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="events.isLoading()" [actions]="rowActions" [initialPageSize]="25" emptyIcon="user-check" emptyTitle="Nothing to dispatch" emptyMessage="No events match." (action)="onAction($event)" />
        </section>
        <amc-panel title="Assignment rules" icon="shield-check">
          <ul class="space-y-2 text-sm">
            @for (r of rules; track r.name) { <li class="flex items-start gap-2"><amc-icon name="check-circle" [size]="15" class="mt-0.5 text-ok" /><div><p class="font-medium text-ink">{{ r.name }}</p><p class="text-xs text-ink-muted">{{ r.detail }}</p></div></li> }
          </ul>
        </amc-panel>
      </div>
    </div>
    <amc-occurrence-action-host (done)="events.reload()" />
  `,
})
export class DispatchPage {
  private readonly api = inject(ScheduleApi);
  protected readonly refs = inject(PmReferenceStore);
  private readonly host = viewChild.required(OccurrenceActionHost);

  protected readonly events = rxResource({ stream: () => this.api.list() });
  private readonly planApi = inject(PlanApi);
  private readonly plans = rxResource({ stream: () => this.planApi.list() });
  protected readonly planResources = computed(() => new Map((this.plans.hasValue() ? this.plans.value() : []).map((p) => [p.id, p.resources])));
  private readonly rows = computed(() => (this.events.hasValue() ? this.events.value() : []).filter((o) => (OPEN_STATUSES.includes(o.status) || o.status === 'In Progress') && o.scheduledDate <= addDays(today(), 30)));
  protected readonly statuses = ASSIGNMENT_STATUSES;
  protected readonly tone = ASSIGN_TONE;
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'assignment', label: 'Assignment Status', type: 'multiselect', options: toOptions(ASSIGNMENT_STATUSES) },
    { key: 'team', label: 'Team', type: 'multiselect', options: this.refs.teamOptions() },
    { key: 'technician', label: 'Technician', type: 'multiselect', options: this.refs.technicianOptions() },
    { key: 'region', label: 'Territory', type: 'multiselect', options: this.refs.regionOptions() },
    { key: 'date', label: 'Scheduled Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((o) => (!term || `${o.number} ${o.workOrderNumber ?? ''} ${o.customerName} ${o.siteName} ${o.assetName}`.toLowerCase().includes(term)) && matchesAny(f, 'assignment', o.assignment) && matchesAny(f, 'team', o.team) && matchesAny(f, 'technician', o.technician) && matchesAny(f, 'region', o.region) && withinRange(f, 'date', o.scheduledDate));
  });
  protected readonly columns: DataColumn<OccurrenceListItem>[] = [
    { key: 'wo', label: 'Work Order / Schedule', value: (o) => o.workOrderNumber ?? 'Not generated', secondary: (o) => o.number, mobile: 'title', width: 200 },
    { key: 'customer', label: 'Customer / Site', value: (o) => o.customerName, secondary: (o) => o.siteName, visibility: 'md', mobile: 'meta', width: 220 },
    { key: 'asset', label: 'Asset / Service', value: (o) => o.assetName, secondary: (o) => o.serviceName, visibility: 'lg', width: 220 },
    { key: 'skill', label: 'Skill / Certification', value: (o) => this.skill(o).skill, secondary: (o) => this.skill(o).cert, visibility: 'xl', width: 200 },
    { key: 'territory', label: 'Territory', value: (o) => o.region, visibility: 'xl', width: 110 },
    { key: 'date', label: 'Scheduled Date', value: (o) => o.scheduledDate, type: 'date', sortable: true, width: 120 },
    { key: 'window', label: 'Time Window', value: (o) => o.window, visibility: '2xl', width: 200 },
    { key: 'priority', label: 'Priority', value: (o) => o.priority, type: 'badge', tone: (o) => PRIORITY_TONE[o.priority], visibility: 'lg', width: 100 },
    { key: 'tech', label: 'Team / Technician', value: (o) => o.technician ?? 'Unassigned', secondary: (o) => o.team, visibility: 'md', width: 180 },
    { key: 'assignment', label: 'Assignment Status', value: (o) => o.assignment, type: 'badge', tone: (o) => ASSIGN_TONE[o.assignment], sortable: true, mobile: 'badge', width: 140 },
  ];
  protected readonly trackById = (o: OccurrenceListItem) => o.id;
  protected readonly rowActions = (o: OccurrenceListItem): MenuItem[] => occurrenceActions(o).filter((a) => ['validate', 'assign', 'accept', 'reject', 'confirm', 'wo', 'start', 'complete', 'reschedule'].includes(a.id));
  protected readonly rules = [
    { name: 'Required skill', detail: 'Technician skills must include the plan skill.' },
    { name: 'Technician certification', detail: 'Required certifications are enforced.' },
    { name: 'Technician availability', detail: 'Daily capacity (4 jobs) — double bookings are blocked.' },
    { name: 'Service territory', detail: 'Technician region must match the site region.' },
    { name: 'Customer preference', detail: "The plan's default technician scores higher." },
    { name: 'Asset location & workload', detail: 'Suggestions rank by territory and current load.' },
    { name: 'Priority & maintenance window', detail: 'Critical / high priority and window shown on each event.' },
  ];

  protected count(s: string): number {
    return this.rows().filter((o) => o.assignment === s).length;
  }

  protected skill(o: OccurrenceListItem): { skill: string; cert: string | null } {
    const r = this.planResources().get(o.planId);
    return { skill: r?.skill || '—', cert: r?.certification && r.certification !== 'None' ? r.certification : null };
  }

  protected onAction({ id, row }: RowAction<OccurrenceListItem>): void {
    void this.host().run(id, row);
  }
}
