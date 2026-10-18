import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { toOptions } from '@shared/models/select-option';
import { EmptyState } from '@shared/ui/empty-state';
import { ErrorState } from '@shared/ui/error-state';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { MiniChart } from '@shared/ui/mini-chart';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, filterRange } from '@shared/utils/filters';
import { formatCurrency, formatDate } from '@shared/utils/format';
import { PmReferenceStore } from '../data/pm-reference.store';
import { PlanApi } from '../data/pm.api';
import { OCC_TONE, WO_TONE, formatDuration } from '../models/display';
import { type CountRow, OCCURRENCE_STATUSES, type OccurrenceListItem, type PmDashboardFilters } from '../models/operations.model';
import { PM_TYPES } from '../models/plan.model';

@Component({
  selector: 'amc-pm-dashboard-page',
  imports: [EmptyState, ErrorState, FilterBar, Icon, KpiCard, MiniChart, PageHeader, Panel, RouterLink, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <amc-page-header title="Preventive Maintenance Dashboard" subtitle="Planned, scheduled, due, overdue, completed and missed recurring maintenance." [breadcrumbs]="[{ label: 'Preventive Maintenance' }, { label: 'Dashboard' }]">
        <button type="button" class="amc-btn-ghost" (click)="dashboard.reload()" aria-label="Refresh"><amc-icon name="refresh" [class.animate-spin]="dashboard.isLoading()" /> <span class="hidden sm:inline">Refresh</span></button>
        <button type="button" class="amc-btn-secondary" [disabled]="!data()" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/preventive-maintenance/due" class="amc-btn-secondary hidden lg:inline-flex"><amc-icon name="alert-circle" /> Due / Overdue</a>
        <a routerLink="/app/preventive-maintenance/work-orders" class="amc-btn-secondary hidden xl:inline-flex"><amc-icon name="wrench" /> Generate Work Orders</a>
        <a routerLink="/app/preventive-maintenance/schedule" class="amc-btn-secondary hidden xl:inline-flex"><amc-icon name="calendar-check" /> Schedule</a>
        <a routerLink="/app/preventive-maintenance/dispatch" class="amc-btn-secondary hidden xl:inline-flex"><amc-icon name="user-check" /> Assign Technician</a>
        <a routerLink="/app/preventive-maintenance/list" class="amc-btn-secondary hidden md:inline-flex"><amc-icon name="list" /> View Plans</a>
        <a routerLink="/app/preventive-maintenance/new" class="amc-btn-primary"><amc-icon name="plus" /> Create Plan</a>
      </amc-page-header>

      <section class="amc-card p-3" aria-label="Dashboard filters"><amc-filter-bar [showSearch]="false" [fields]="filterFields()" [(filters)]="filters" /></section>

      @if (dashboard.error()) {
        <div class="amc-card"><amc-error-state message="The dashboard could not be loaded." (retry)="dashboard.reload()" /></div>
      } @else {
        @let k = data()?.kpis;
        @let loading = !k;
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Key indicators">
          <amc-kpi-card label="Total Maintenance Plans" icon="calendar-check" tone="brand" link="/app/preventive-maintenance/list" [loading]="loading" [value]="k?.totalPlans ?? 0" />
          <amc-kpi-card label="Active Plans" icon="check-circle" tone="ok" link="/app/preventive-maintenance/list" [queryParams]="{ status: 'Active' }" [loading]="loading" [value]="k?.activePlans ?? 0" />
          <amc-kpi-card label="Draft Plans" icon="pencil" link="/app/preventive-maintenance/list" [queryParams]="{ status: 'Draft' }" [loading]="loading" [value]="k?.draftPlans ?? 0" />
          <amc-kpi-card label="Suspended Plans" icon="pause" tone="warn" link="/app/preventive-maintenance/list" [queryParams]="{ status: 'Suspended' }" [loading]="loading" [value]="k?.suspendedPlans ?? 0" />
          <amc-kpi-card label="Total Covered Assets" icon="box" tone="info" [loading]="loading" [value]="k?.coveredAssets ?? 0" />
          <amc-kpi-card label="Scheduled Maintenance" icon="calendar" tone="info" link="/app/preventive-maintenance/schedule" [loading]="loading" [value]="k?.scheduled ?? 0" />
          <amc-kpi-card label="Due Maintenance" icon="clock" tone="warn" link="/app/preventive-maintenance/due" [loading]="loading" [value]="k?.due ?? 0" hint="Within 7 days" />
          <amc-kpi-card label="Upcoming Maintenance" icon="calendar" link="/app/preventive-maintenance/schedule" [loading]="loading" [value]="k?.upcoming ?? 0" hint="Next 30 days" />
          <amc-kpi-card label="Overdue Maintenance" icon="alert-circle" tone="danger" link="/app/preventive-maintenance/due" [queryParams]="{ category: 'Overdue' }" [loading]="loading" [value]="k?.overdue ?? 0" />
          <amc-kpi-card label="Completed Maintenance" icon="check-circle" tone="ok" [loading]="loading" [value]="k?.completed ?? 0" />
          <amc-kpi-card label="Missed Maintenance" icon="x" tone="danger" link="/app/preventive-maintenance/due" [queryParams]="{ category: 'Missed' }" [loading]="loading" [value]="k?.missed ?? 0" />
          <amc-kpi-card label="Cancelled Maintenance" icon="ban" [loading]="loading" [value]="k?.cancelled ?? 0" />
          <amc-kpi-card label="Rescheduled Maintenance" icon="calendar" tone="warn" [loading]="loading" [value]="k?.rescheduled ?? 0" />
          <amc-kpi-card label="Open Maintenance Work Orders" icon="wrench" tone="accent" link="/app/preventive-maintenance/work-orders" [loading]="loading" [value]="k?.openWorkOrders ?? 0" />
          <amc-kpi-card label="Completed Work Orders" icon="check-circle" tone="ok" [loading]="loading" [value]="k?.completedWorkOrders ?? 0" />
          <amc-kpi-card label="Maintenance Compliance %" icon="shield-check" [tone]="(k?.compliance ?? 100) >= 90 ? 'ok' : 'danger'" link="/app/preventive-maintenance/performance" [loading]="loading" [value]="pct(k?.compliance)" />
          <amc-kpi-card label="PM Completion % (on time)" icon="check-circle" tone="ok" [loading]="loading" [value]="pct(k?.completionRate)" />
          <amc-kpi-card label="Overdue Maintenance %" icon="alert-triangle" [tone]="(k?.overdueRate ?? 0) > 5 ? 'danger' : 'ok'" [loading]="loading" [value]="pct(k?.overdueRate)" />
          <amc-kpi-card label="Avg Completion Time" icon="clock" [loading]="loading" [value]="fd(k?.avgCompletionMinutes)" />
          <amc-kpi-card label="Maintenance Cost" icon="wallet" tone="accent" [loading]="loading" [value]="formatCurrency(k?.cost ?? 0, 'SAR', true)" />
        </section>

        @if (data(); as d) {
          <section class="grid grid-cols-3 gap-3">
            <a routerLink="/app/preventive-maintenance/due" class="amc-card flex items-center gap-3 p-4"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-warn-subtle text-warn"><amc-icon name="clock" /></span><div><p class="text-2xl font-semibold tabular-nums">{{ d.dueToday.length }}</p><p class="text-xs text-ink-muted">Maintenance Due Today</p></div></a>
            <a routerLink="/app/preventive-maintenance/due" class="amc-card flex items-center gap-3 p-4"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-info-subtle text-info"><amc-icon name="calendar" /></span><div><p class="text-2xl font-semibold tabular-nums">{{ d.dueWeek.length }}</p><p class="text-xs text-ink-muted">Due This Week</p></div></a>
            <a routerLink="/app/preventive-maintenance/due" class="amc-card flex items-center gap-3 p-4"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken text-ink-muted"><amc-icon name="calendar" /></span><div><p class="text-2xl font-semibold tabular-nums">{{ d.dueMonth }}</p><p class="text-xs text-ink-muted">Due This Month</p></div></a>
          </section>

          <section class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <amc-panel title="Maintenance Compliance Trend" description="Monthly compliance %" icon="trending-up" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="labels(d.complianceTrend)" [values]="values(d.complianceTrend)" [height]="180" ariaLabel="Compliance trend" /></div></amc-panel>
            <amc-panel title="Maintenance Cost Trend" description="Monthly cost (SAR)" icon="wallet" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="labels(d.costTrend)" [values]="values(d.costTrend)" [height]="180" ariaLabel="Cost trend" /></div></amc-panel>
            <amc-panel title="Maintenance by Asset Category" icon="layers" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="donut" [labels]="labels(d.byCategory)" [values]="values(d.byCategory)" [height]="180" ariaLabel="Maintenance by asset category" /></div></amc-panel>
          </section>

          <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            @for (w of occWidgets(); track w.title) {
              <amc-panel [title]="w.title" [icon]="w.icon" [padded]="false">
                <a panelActions [routerLink]="w.link" class="amc-link text-xs">View all</a>
                @if (!w.rows.length) { <amc-empty-state [compact]="true" icon="check-circle" title="All clear" [message]="w.empty" /> } @else {
                  <ul class="divide-y divide-line">
                    @for (o of w.rows; track o.id) {
                      <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                        <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-ink">{{ o.assetName }}</p><p class="truncate text-xs text-ink-muted">{{ o.planNumber }} · {{ o.siteName }}</p></div>
                        <div class="shrink-0 text-right"><amc-status-badge [label]="o.effectiveStatus" [tone]="occTone[o.effectiveStatus]" /><p class="mt-1 text-xs tabular-nums text-ink-muted">{{ o.daysOverdue ? o.daysOverdue + ' days overdue' : formatDate(o.scheduledDate) }}</p></div>
                      </li>
                    }
                  </ul>
                }
              </amc-panel>
            }
            <amc-panel title="Maintenance Work Orders" icon="wrench" [padded]="false">
              <a panelActions routerLink="/app/preventive-maintenance/work-orders" class="amc-link text-xs">View all</a>
              @if (!d.workOrders.length) { <amc-empty-state [compact]="true" icon="check-circle" title="All clear" message="No open work orders." /> } @else {
                <ul class="divide-y divide-line">
                  @for (w of d.workOrders; track w.id) { <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5"><div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-ink">{{ w.number }}</p><p class="truncate text-xs text-ink-muted">{{ w.assetName }} · {{ formatDate(w.plannedDate) }}</p></div><amc-status-badge [label]="w.status" [tone]="woTone[w.status]" /></li> }
                </ul>
              }
            </amc-panel>
            @for (w of countWidgets(); track w.title) {
              <amc-panel [title]="w.title" [icon]="w.icon" [padded]="false">
                @if (!w.rows.length) { <amc-empty-state [compact]="true" icon="check-circle" title="Nothing to show" [message]="w.empty" /> } @else {
                  <ul class="divide-y divide-line">
                    @for (r of w.rows; track r.key) {
                      <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                        <p class="min-w-0 flex-1 truncate text-sm text-ink">{{ r.label }}</p>
                        <span class="shrink-0 text-sm font-semibold tabular-nums">{{ r.value }}</span>
                        @if (r.secondary !== undefined) { <span class="shrink-0 text-xs text-ink-muted tabular-nums">{{ r.secondary }} done</span> }
                      </li>
                    }
                  </ul>
                }
              </amc-panel>
            }
          </div>
        }
      }
    </div>
  `,
})
export class PmDashboardPage {
  private readonly api = inject(PlanApi);
  private readonly refs = inject(PmReferenceStore);

  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => {
    const customers = filterList(this.filters(), 'customer');
    const cust = customers.length === 1 ? customers[0] : null;
    return [
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(cust) },
      { key: 'asset', label: 'Asset', type: 'multiselect', options: this.refs.assetOptions(cust) },
      { key: 'category', label: 'Asset Category', type: 'multiselect', options: this.refs.categoryOptions() },
      { key: 'plan', label: 'Maintenance Plan', type: 'multiselect', options: this.refs.planOptions() },
      { key: 'type', label: 'Maintenance Type', type: 'multiselect', options: toOptions(PM_TYPES) },
      { key: 'service', label: 'Service', type: 'multiselect', options: this.refs.serviceOptions() },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(OCCURRENCE_STATUSES) },
      { key: 'team', label: 'Technician Team', type: 'multiselect', options: this.refs.teamOptions() },
      { key: 'technician', label: 'Technician', type: 'multiselect', options: this.refs.technicianOptions() },
      { key: 'region', label: 'Region', type: 'multiselect', options: this.refs.regionOptions() },
      { key: 'due', label: 'Due Date', type: 'date-range' },
      { key: 'scheduled', label: 'Schedule Date', type: 'date-range' },
    ];
  });
  private readonly query = computed<PmDashboardFilters>(() => {
    const f = this.filters();
    return { customers: filterList(f, 'customer'), sites: filterList(f, 'site'), assets: filterList(f, 'asset'), categories: filterList(f, 'category'), plans: filterList(f, 'plan'), types: filterList(f, 'type'), services: filterList(f, 'service'), statuses: filterList(f, 'status'), teams: filterList(f, 'team'), technicians: filterList(f, 'technician'), regions: filterList(f, 'region'), due: filterRange(f, 'due'), scheduled: filterRange(f, 'scheduled') };
  });
  protected readonly dashboard = rxResource({ params: () => this.query(), stream: ({ params }) => this.api.dashboard(params) });
  protected readonly data = computed(() => (this.dashboard.hasValue() ? this.dashboard.value() : null));
  protected readonly occWidgets = computed<{ title: string; icon: 'clock' | 'calendar' | 'alert-circle' | 'x' | 'calendar-check'; rows: readonly OccurrenceListItem[]; link: string; empty: string }[]>(() => {
    const d = this.data();
    return [
      { title: 'Maintenance Due Today', icon: 'clock', rows: d?.dueToday ?? [], link: '/app/preventive-maintenance/due', empty: 'Nothing due today.' },
      { title: 'Maintenance Due This Week', icon: 'calendar', rows: d?.dueWeek ?? [], link: '/app/preventive-maintenance/due', empty: 'Nothing due this week.' },
      { title: 'Overdue Maintenance', icon: 'alert-circle', rows: d?.overdue ?? [], link: '/app/preventive-maintenance/due', empty: 'No overdue maintenance.' },
      { title: 'Upcoming Preventive Maintenance', icon: 'calendar', rows: d?.upcoming ?? [], link: '/app/preventive-maintenance/schedule', empty: 'Nothing upcoming.' },
      { title: 'Missed Maintenance', icon: 'x', rows: d?.missed ?? [], link: '/app/preventive-maintenance/due', empty: 'No missed maintenance.' },
      { title: 'Recurring Maintenance Schedule', icon: 'calendar-check', rows: d?.recurring ?? [], link: '/app/preventive-maintenance/calendar', empty: 'No open events.' },
    ];
  });
  protected readonly countWidgets = computed<{ title: string; icon: 'box' | 'alert-triangle' | 'map-pin' | 'users' | 'layers'; rows: readonly CountRow[]; empty: string }[]>(() => {
    const d = this.data();
    return [
      { title: 'Assets Without Maintenance Plans', icon: 'box', rows: d?.assetsWithoutPlans ?? [], empty: 'All assets are covered.' },
      { title: 'Assets with Repeated Maintenance Failures', icon: 'alert-triangle', rows: d?.repeatedFailures ?? [], empty: 'No repeated failures.' },
      { title: 'Maintenance by Site', icon: 'map-pin', rows: d?.bySite ?? [], empty: 'No data.' },
      { title: 'Maintenance by Technician Team', icon: 'users', rows: d?.byTeam ?? [], empty: 'No data.' },
      { title: 'Parts Consumption', icon: 'layers', rows: d?.parts ?? [], empty: 'No parts consumed.' },
    ];
  });
  protected readonly occTone = OCC_TONE;
  protected readonly woTone = WO_TONE;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly fd = formatDuration;
  protected readonly labels = (rows: readonly CountRow[]) => rows.map((r) => r.label);
  protected readonly values = (rows: readonly CountRow[]) => rows.map((r) => r.value);

  protected pct(v: number | null | undefined): string {
    return v === null || v === undefined ? '—' : `${v}%`;
  }

  protected export(): void {
    const k = this.data()?.kpis;
    if (!k) return;
    downloadCsv(timestampedName('pm-dashboard', 'csv'), ['Metric', 'Value'], [
      ['Total Maintenance Plans', k.totalPlans], ['Active Maintenance Plans', k.activePlans], ['Draft Maintenance Plans', k.draftPlans], ['Suspended Maintenance Plans', k.suspendedPlans], ['Total Covered Assets', k.coveredAssets], ['Scheduled Maintenance', k.scheduled],
      ['Due Maintenance', k.due], ['Upcoming Maintenance', k.upcoming], ['Overdue Maintenance', k.overdue], ['Completed Maintenance', k.completed], ['Missed Maintenance', k.missed], ['Cancelled Maintenance', k.cancelled], ['Rescheduled Maintenance', k.rescheduled],
      ['Open Maintenance Work Orders', k.openWorkOrders], ['Completed Work Orders', k.completedWorkOrders], ['Maintenance Compliance %', k.compliance], ['Preventive Maintenance Completion %', k.completionRate], ['Overdue Maintenance %', k.overdueRate], ['Average Completion Time (min)', k.avgCompletionMinutes], ['Maintenance Cost', k.cost],
    ]);
  }
}
