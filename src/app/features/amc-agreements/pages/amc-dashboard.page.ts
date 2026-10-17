import { NgTemplateOutlet } from '@angular/common';
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
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, filterRange } from '@shared/utils/filters';
import { formatCurrency, formatDate, relativeTime } from '@shared/utils/format';
import { AmcReferenceStore } from '../data/amc-reference.store';
import { AmcApi } from '../data/amc.api';
import { AMC_RULES } from '../data/amc.config';
import { AMC_STATUSES, AMC_TYPES } from '../models/amc.model';
import { AMC_STATUS_TONE, PM_TONE } from '../models/display';
import type { AmcDashboardFilters } from '../models/operations.model';

@Component({
  selector: 'amc-amc-dashboard-page',
  imports: [EmptyState, ErrorState, FilterBar, Icon, KpiCard, MiniChart, NgTemplateOutlet, PageHeader, Panel, RouterLink, Skeleton, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <amc-page-header title="AMC Dashboard" subtitle="Operational overview of active and historical maintenance agreements." [breadcrumbs]="[{ label: 'AMC / Service Contracts' }, { label: 'Dashboard' }]">
        <button type="button" class="amc-btn-ghost" [disabled]="dashboard.isLoading()" (click)="dashboard.reload()" aria-label="Refresh"><amc-icon name="refresh" [class.animate-spin]="dashboard.isLoading()" /> <span class="hidden sm:inline">Refresh</span></button>
        <button type="button" class="amc-btn-secondary" [disabled]="!data()" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/amc-agreements/list" [queryParams]="{ status: 'Expiring Soon' }" class="amc-btn-secondary hidden lg:inline-flex"><amc-icon name="clock" /> View Expiring</a>
        <a routerLink="/app/amc-agreements/schedule" class="amc-btn-secondary hidden md:inline-flex"><amc-icon name="calendar-check" /> Schedule Maintenance</a>
        <a routerLink="/app/amc-agreements/list" class="amc-btn-secondary hidden md:inline-flex"><amc-icon name="list" /> View AMCs</a>
        <a routerLink="/app/amc-agreements/new" class="amc-btn-primary"><amc-icon name="plus" /> Create AMC</a>
      </amc-page-header>

      <section class="amc-card p-3" aria-label="Dashboard filters"><amc-filter-bar [showSearch]="false" [fields]="filterFields()" [(filters)]="filters" /></section>

      @if (dashboard.error()) {
        <div class="amc-card"><amc-error-state message="The AMC dashboard could not be loaded." (retry)="dashboard.reload()" /></div>
      } @else {
        @let k = data()?.kpis;
        @let loading = !k;
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7" aria-label="Key indicators">
          <amc-kpi-card label="Total AMCs" icon="shield-check" tone="brand" link="/app/amc-agreements/list" [loading]="loading" [value]="k?.total ?? 0" />
          <amc-kpi-card label="Draft AMCs" icon="pencil" link="/app/amc-agreements/list" [queryParams]="{ status: 'Draft' }" [loading]="loading" [value]="k?.draft ?? 0" hint="Incl. pending approval" />
          <amc-kpi-card label="Pending Activation" icon="clock" tone="accent" link="/app/amc-agreements/list" [queryParams]="{ status: 'Pending Activation' }" [loading]="loading" [value]="k?.pendingActivation ?? 0" />
          <amc-kpi-card label="Active AMCs" icon="check-circle" tone="ok" link="/app/amc-agreements/list" [queryParams]="{ status: 'Active' }" [loading]="loading" [value]="k?.active ?? 0" />
          <amc-kpi-card label="Expiring AMCs" icon="clock" tone="warn" link="/app/amc-agreements/list" [queryParams]="{ status: 'Expiring Soon' }" [loading]="loading" [value]="k?.expiring ?? 0" [hint]="'Within ' + expiringDays + ' days'" />
          <amc-kpi-card label="Expired AMCs" icon="alert-circle" tone="danger" link="/app/amc-agreements/list" [queryParams]="{ status: 'Expired' }" [loading]="loading" [value]="k?.expired ?? 0" />
          <amc-kpi-card label="Suspended AMCs" icon="pause" tone="warn" link="/app/amc-agreements/suspensions" [loading]="loading" [value]="k?.suspended ?? 0" />
          <amc-kpi-card label="Terminated AMCs" icon="ban" link="/app/amc-agreements/suspensions" [loading]="loading" [value]="k?.terminated ?? 0" />
          <amc-kpi-card label="Covered Assets" icon="box" tone="info" [loading]="loading" [value]="k?.coveredAssets ?? 0" hint="Active AMCs" />
          <amc-kpi-card label="Covered Sites" icon="map-pin" tone="info" [loading]="loading" [value]="k?.coveredSites ?? 0" hint="Active AMCs" />
          <amc-kpi-card label="Upcoming PM Visits" icon="calendar-check" tone="brand" link="/app/amc-agreements/schedule" [loading]="loading" [value]="k?.upcomingPm ?? 0" [hint]="'Next ' + upcomingDays + ' days'" />
          <amc-kpi-card label="Overdue PM Visits" icon="alert-triangle" tone="danger" link="/app/amc-agreements/schedule" [queryParams]="{ status: 'Overdue' }" [loading]="loading" [value]="k?.overduePm ?? 0" />
          <amc-kpi-card label="Open Service Requests" icon="ticket" tone="warn" [loading]="loading" [value]="k?.openRequests ?? 0" hint="At covered sites" />
          <amc-kpi-card label="Open Work Orders" icon="wrench" tone="warn" [loading]="loading" [value]="k?.openWorkOrders ?? 0" />
          <amc-kpi-card label="Completed Visits" icon="check-circle" tone="ok" link="/app/amc-agreements/visits" [loading]="loading" [value]="k?.completedVisits ?? 0" />
          <amc-kpi-card label="Remaining Visits" icon="activity" tone="accent" link="/app/amc-agreements/consumption" [loading]="loading" [value]="k?.remainingVisits ?? 0" hint="Active AMCs" />
          <amc-kpi-card label="Contract Value" icon="wallet" tone="brand" [loading]="loading" [value]="formatCurrency(k?.contractValue ?? 0, 'SAR', true)" />
          <amc-kpi-card label="Billed Amount" icon="receipt" tone="ok" link="/app/amc-agreements/billing" [loading]="loading" [value]="formatCurrency(k?.billed ?? 0, 'SAR', true)" />
          <amc-kpi-card label="Outstanding Amount" icon="alert-circle" tone="danger" link="/app/amc-agreements/billing" [queryParams]="{ status: 'Overdue' }" [loading]="loading" [value]="formatCurrency(k?.outstanding ?? 0, 'SAR', true)" />
        </section>

        @if (data(); as d) {
          <section class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <amc-panel title="AMC Utilization" description="Overall utilization of included services" icon="activity" [padded]="false">
              <ul class="space-y-3 p-4 sm:p-5">
                @for (row of d.utilization; track row.id) {
                  <li>
                    <div class="flex items-center justify-between text-sm"><a [routerLink]="['/app/amc-agreements', row.id]" class="font-mono text-xs text-ink hover:text-brand">{{ row.label }}</a><span class="tabular-nums" [class]="row.value > 100 ? 'text-danger' : row.value >= 80 ? 'text-warn' : 'text-ink-muted'">{{ row.value }}%</span></div>
                    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full rounded-full" [class]="row.value > 100 ? 'bg-danger' : row.value >= 80 ? 'bg-warn' : 'bg-brand'" [style.width.%]="row.value > 100 ? 100 : row.value"></div></div>
                  </li>
                } @empty { <li class="text-sm text-ink-muted">No active AMCs.</li> }
              </ul>
            </amc-panel>
            <amc-panel title="AMC Revenue, Cost & Profitability" icon="pie-chart">
              <dl class="grid grid-cols-2 gap-3 text-sm">
                <div class="rounded-xl bg-ok-subtle p-3"><dt class="text-xs text-ink-muted">AMC Revenue</dt><dd class="text-lg font-semibold tabular-nums text-ink">{{ formatCurrency(d.revenueCost.revenue, 'SAR', true) }}</dd></div>
                <div class="rounded-xl bg-warn-subtle p-3"><dt class="text-xs text-ink-muted">AMC Cost</dt><dd class="text-lg font-semibold tabular-nums text-ink">{{ formatCurrency(d.revenueCost.cost, 'SAR', true) }}</dd></div>
                <div class="rounded-xl bg-brand-subtle p-3"><dt class="text-xs text-ink-muted">Gross Profit</dt><dd class="text-lg font-semibold tabular-nums text-ink">{{ formatCurrency(d.revenueCost.profit, 'SAR', true) }}</dd></div>
                <div class="rounded-xl bg-surface-sunken p-3"><dt class="text-xs text-ink-muted">Gross Margin</dt><dd class="text-lg font-semibold tabular-nums" [class]="d.revenueCost.margin < 20 ? 'text-danger' : 'text-ok'">{{ d.revenueCost.margin }}%</dd></div>
              </dl>
            </amc-panel>
            <amc-panel title="AMC Profitability" description="Gross profit by AMC" icon="bar-chart" class="min-w-0">
              <div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="chart().labels" [values]="chart().values" [height]="200" ariaLabel="Gross profit by AMC" /></div>
            </amc-panel>
          </section>
        }

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <amc-panel title="AMCs Expiring Soon" icon="clock" [padded]="false">
            <a panelActions routerLink="/app/amc-agreements/list" [queryParams]="{ status: 'Expiring Soon' }" class="amc-link text-xs">View all</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.expiringSoon, mode: 'days', empty: 'No AMCs expiring soon.' }" />
          </amc-panel>
          <amc-panel title="Upcoming Preventive Maintenance" icon="calendar-check" [padded]="false">
            <a panelActions routerLink="/app/amc-agreements/schedule" class="amc-link text-xs">Schedule</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.upcomingPm, mode: 'pm', empty: 'Nothing scheduled.' }" />
          </amc-panel>
          <amc-panel title="Overdue Maintenance" icon="alert-triangle" [padded]="false">
            <a panelActions routerLink="/app/amc-agreements/schedule" [queryParams]="{ status: 'Overdue' }" class="amc-link text-xs">View all</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.overduePm, mode: 'pm', empty: 'No overdue maintenance.' }" />
          </amc-panel>
          <amc-panel title="Recent Service Visits" icon="check-circle" [padded]="false">
            <a panelActions routerLink="/app/amc-agreements/visits" class="amc-link text-xs">Visits</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.recentVisits, mode: 'relative', empty: 'No visits yet.' }" />
          </amc-panel>
          <amc-panel title="Open AMC Service Requests" icon="ticket" [padded]="false">
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.openRequests, mode: 'relative', empty: 'No open requests.' }" />
          </amc-panel>
          <amc-panel title="Assets Without Scheduled Maintenance" icon="box" [padded]="false">
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.unscheduledAssets, mode: 'none', empty: 'All covered assets are scheduled.' }" />
          </amc-panel>
        </div>
      }
    </div>

    <ng-template #rows let-items let-mode="mode" let-empty="empty">
      @if (!data()) {
        <div class="space-y-4 p-4 sm:p-5">@for (i of [1, 2, 3]; track i) { <amc-skeleton class="h-9 w-full" /> }</div>
      } @else if (!items?.length) {
        <amc-empty-state [compact]="true" icon="check-circle" title="All clear" [message]="empty" />
      } @else {
        <ul class="divide-y divide-line">
          @for (row of items; track row.id) {
            <li class="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div class="min-w-0 flex-1">
                <a [routerLink]="['/app/amc-agreements', row.amcId]" class="block truncate text-sm font-medium text-ink hover:text-brand">{{ row.title }}</a>
                <p class="truncate text-xs text-ink-muted">{{ row.subtitle }}</p>
              </div>
              <div class="shrink-0 text-right">
                <amc-status-badge [label]="row.status" [tone]="tone(mode, row.status)" />
                @if (row.date) { <p class="mt-1 text-xs tabular-nums text-ink-muted">{{ mode === 'days' ? row.value + ' days · ' + formatDate(row.date) : mode === 'relative' ? relativeTime(row.date) : formatDate(row.date) }}</p> }
              </div>
            </li>
          }
        </ul>
      }
    </ng-template>
  `,
})
export class AmcDashboardPage {
  private readonly api = inject(AmcApi);
  private readonly refs = inject(AmcReferenceStore);

  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => {
    const customers = filterList(this.filters(), 'customer');
    return [
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(customers.length === 1 ? customers[0] : null) },
      { key: 'type', label: 'AMC Type', type: 'multiselect', options: toOptions(AMC_TYPES) },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(AMC_STATUSES) },
      { key: 'manager', label: 'Contract Manager', type: 'multiselect', options: this.refs.managerOptions() },
      { key: 'region', label: 'Service Region', type: 'multiselect', options: this.refs.regionOptions() },
      { key: 'start', label: 'Start Date', type: 'date-range' },
      { key: 'end', label: 'End / Expiry Date', type: 'date-range' },
    ];
  });
  private readonly query = computed<AmcDashboardFilters>(() => {
    const f = this.filters();
    return { customers: filterList(f, 'customer'), sites: filterList(f, 'site'), types: filterList(f, 'type'), statuses: filterList(f, 'status'), managers: filterList(f, 'manager'), regions: filterList(f, 'region'), start: filterRange(f, 'start'), end: filterRange(f, 'end') };
  });
  protected readonly dashboard = rxResource({ params: () => this.query(), stream: ({ params }) => this.api.dashboard(params) });
  protected readonly data = computed(() => (this.dashboard.hasValue() ? this.dashboard.value() : null));
  protected readonly chart = computed(() => ({ labels: (this.data()?.profitByAmc ?? []).map((r) => r.label), values: (this.data()?.profitByAmc ?? []).map((r) => r.value) }));
  protected readonly expiringDays = AMC_RULES.expiringWindowDays;
  protected readonly upcomingDays = AMC_RULES.upcomingDays;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly relativeTime = relativeTime;

  protected tone(mode: string, status: string) {
    if (mode === 'pm') return PM_TONE[status as keyof typeof PM_TONE] ?? 'neutral';
    if (status === 'Covered') return 'ok';
    if (status === 'Billable' || status === 'No schedule') return 'warn';
    return AMC_STATUS_TONE[status as keyof typeof AMC_STATUS_TONE] ?? 'info';
  }

  protected export(): void {
    const k = this.data()?.kpis;
    if (!k) return;
    downloadCsv(timestampedName('amc-dashboard', 'csv'), ['Metric', 'Value'], [
      ['Total AMCs', k.total], ['Draft AMCs', k.draft], ['Pending Activation', k.pendingActivation], ['Active AMCs', k.active], ['Expiring AMCs', k.expiring], ['Expired AMCs', k.expired], ['Suspended AMCs', k.suspended],
      ['Terminated AMCs', k.terminated], ['Total Covered Assets', k.coveredAssets], ['Total Covered Sites', k.coveredSites], ['Upcoming Preventive Visits', k.upcomingPm], ['Overdue Preventive Visits', k.overduePm],
      ['Open Service Requests', k.openRequests], ['Open Work Orders', k.openWorkOrders], ['Completed Visits', k.completedVisits], ['Remaining Visits', k.remainingVisits], ['Contract Value', k.contractValue], ['Billed Amount', k.billed], ['Outstanding Amount', k.outstanding],
    ]);
  }
}
