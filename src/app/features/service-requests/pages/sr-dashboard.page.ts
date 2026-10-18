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
import { relativeTime } from '@shared/utils/format';
import { SrReferenceStore } from '../data/sr-reference.store';
import { RequestApi } from '../data/sr.api';
import { PRIORITY_TONE, SLA_TONE, STATUS_TONE, formatMinutes } from '../models/display';
import type { CountRow, SrDashboardFilters } from '../models/operations.model';
import { PRIORITIES, REQUEST_SOURCES, REQUEST_STATUSES, REQUEST_TYPES } from '../models/request.model';

@Component({
  selector: 'amc-sr-dashboard-page',
  imports: [EmptyState, ErrorState, FilterBar, Icon, KpiCard, MiniChart, PageHeader, Panel, RouterLink, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <amc-page-header title="Service Request Dashboard" subtitle="Service demand, SLA health, workload and resolution performance." [breadcrumbs]="[{ label: 'Service Requests' }, { label: 'Dashboard' }]">
        <button type="button" class="amc-btn-ghost" [disabled]="dashboard.isLoading()" (click)="dashboard.reload()" aria-label="Refresh"><amc-icon name="refresh" [class.animate-spin]="dashboard.isLoading()" /> <span class="hidden sm:inline">Refresh</span></button>
        <button type="button" class="amc-btn-secondary" [disabled]="!data()" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/service-requests/escalations" class="amc-btn-secondary hidden xl:inline-flex"><amc-icon name="alert-triangle" /> Escalations</a>
        <a routerLink="/app/service-requests/performance" class="amc-btn-secondary hidden xl:inline-flex"><amc-icon name="bar-chart" /> Performance</a>
        <a routerLink="/app/service-requests/list" class="amc-btn-secondary hidden md:inline-flex"><amc-icon name="list" /> View Requests</a>
        <a routerLink="/app/service-requests/new" class="amc-btn-primary"><amc-icon name="plus" /> New Request</a>
      </amc-page-header>

      <section class="amc-card p-3" aria-label="Dashboard filters"><amc-filter-bar [showSearch]="false" [fields]="filterFields()" [(filters)]="filters" /></section>

      @if (dashboard.error()) {
        <div class="amc-card"><amc-error-state message="The service request dashboard could not be loaded." (retry)="dashboard.reload()" /></div>
      } @else {
        @let k = data()?.kpis;
        @let loading = !k;
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Key indicators">
          <amc-kpi-card label="Total Requests" icon="ticket" tone="brand" link="/app/service-requests/list" [loading]="loading" [value]="k?.total ?? 0" />
          <amc-kpi-card label="New" icon="plus" link="/app/service-requests/list" [queryParams]="{ status: 'New' }" [loading]="loading" [value]="k?.new ?? 0" />
          <amc-kpi-card label="Unassigned" icon="user-check" tone="warn" link="/app/service-requests/assignment" [loading]="loading" [value]="k?.unassigned ?? 0" />
          <amc-kpi-card label="Assigned" icon="user-check" link="/app/service-requests/list" [queryParams]="{ status: 'Assigned' }" [loading]="loading" [value]="k?.assigned ?? 0" />
          <amc-kpi-card label="In Progress" icon="activity" tone="info" link="/app/service-requests/list" [queryParams]="{ status: 'In Progress' }" [loading]="loading" [value]="k?.inProgress ?? 0" />
          <amc-kpi-card label="Scheduled" icon="calendar-check" link="/app/service-requests/scheduling" [loading]="loading" [value]="k?.scheduled ?? 0" />
          <amc-kpi-card label="Pending Customer" icon="pause" tone="warn" link="/app/service-requests/list" [queryParams]="{ hold: 'Waiting for Customer' }" [loading]="loading" [value]="k?.pendingCustomer ?? 0" />
          <amc-kpi-card label="Pending Parts" icon="box" tone="warn" link="/app/service-requests/list" [queryParams]="{ hold: 'Waiting for Parts' }" [loading]="loading" [value]="k?.pendingParts ?? 0" />
          <amc-kpi-card label="Pending Approval" icon="send" tone="warn" link="/app/service-requests/list" [queryParams]="{ hold: 'Waiting for Approval' }" [loading]="loading" [value]="k?.pendingApproval ?? 0" />
          <amc-kpi-card label="Escalated" icon="alert-triangle" tone="danger" link="/app/service-requests/escalations" [loading]="loading" [value]="k?.escalated ?? 0" />
          <amc-kpi-card label="SLA At Risk" icon="clock" tone="warn" link="/app/service-requests/list" [queryParams]="{ sla: 'At Risk' }" [loading]="loading" [value]="k?.atRisk ?? 0" />
          <amc-kpi-card label="SLA Breached" icon="alert-circle" tone="danger" link="/app/service-requests/list" [queryParams]="{ sla: 'Breached' }" [loading]="loading" [value]="k?.breached ?? 0" />
          <amc-kpi-card label="Resolved" icon="check-circle" tone="ok" link="/app/service-requests/list" [queryParams]="{ status: 'Resolved' }" [loading]="loading" [value]="k?.resolved ?? 0" />
          <amc-kpi-card label="Closed" icon="lock" link="/app/service-requests/list" [queryParams]="{ status: 'Closed' }" [loading]="loading" [value]="k?.closed ?? 0" />
          <amc-kpi-card label="Reopened" icon="rotate-ccw" tone="warn" link="/app/service-requests/list" [queryParams]="{ status: 'Reopened' }" [loading]="loading" [value]="k?.reopened ?? 0" />
          <amc-kpi-card label="Avg Response Time" icon="clock" [loading]="loading" [value]="fm(k?.avgResponseMinutes)" />
          <amc-kpi-card label="Avg Resolution Time" icon="clock" [loading]="loading" [value]="fm(k?.avgResolutionMinutes)" />
          <amc-kpi-card label="First-Time Resolution" icon="check-circle" [tone]="(k?.firstTimeResolution ?? 100) >= 80 ? 'ok' : 'warn'" link="/app/service-requests/performance" [loading]="loading" [value]="pct(k?.firstTimeResolution)" />
        </section>

        @if (data(); as d) {
          <section class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <amc-panel title="Requests by Priority" icon="alert-triangle" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="donut" [labels]="labels(d.byPriority)" [values]="values(d.byPriority)" [height]="180" ariaLabel="Requests by priority" /></div></amc-panel>
            <amc-panel title="Requests by Type" icon="ticket" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="donut" [labels]="labels(d.byType)" [values]="values(d.byType)" [height]="180" ariaLabel="Requests by type" /></div></amc-panel>
            <amc-panel title="Requests by Channel" icon="inbox" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="donut" [labels]="labels(d.byChannel)" [values]="values(d.byChannel)" [height]="180" ariaLabel="Requests by channel" /></div></amc-panel>
            <amc-panel title="Volume Trend" description="Requests created per week" icon="trending-up" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="labels(d.trend)" [values]="values(d.trend)" [height]="180" ariaLabel="Request volume trend" /></div></amc-panel>
            <amc-panel title="Requests by Customer" icon="building" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="labels(d.byCustomer)" [values]="values(d.byCustomer)" [height]="180" ariaLabel="Requests by customer" /></div></amc-panel>
            <amc-panel title="Requests by Technician" icon="users" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="labels(d.byTechnician)" [values]="values(d.byTechnician)" [height]="180" ariaLabel="Requests by technician" /></div></amc-panel>
          </section>

          <section class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <amc-panel title="SLA At Risk / Breached" icon="alert-circle" [padded]="false">
              <a panelActions routerLink="/app/service-requests/list" [queryParams]="{ sla: 'At Risk' }" class="amc-link text-xs">View all</a>
              @if (!d.atRiskList.length) { <amc-empty-state [compact]="true" icon="check-circle" title="All clear" message="No open requests are at risk or breached." /> } @else {
                <ul class="divide-y divide-line">
                  @for (r of d.atRiskList; track r.id) {
                    <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <div class="min-w-0 flex-1">
                        <a [routerLink]="['/app/service-requests', r.id]" class="block truncate text-sm font-medium text-ink hover:text-brand">{{ r.number }} · {{ r.subject }}</a>
                        <p class="truncate text-xs text-ink-muted">{{ r.customerName }} · {{ r.siteName }}</p>
                      </div>
                      <div class="shrink-0 text-right">
                        <amc-status-badge [label]="r.slaState" [tone]="slaTone[r.slaState]" />
                        <p class="mt-1 text-xs tabular-nums text-ink-muted">{{ r.resolutionClock.remainingMinutes !== null ? (r.resolutionClock.remainingMinutes >= 0 ? fm(r.resolutionClock.remainingMinutes) + ' left' : fm(-r.resolutionClock.remainingMinutes) + ' over') : '—' }}</p>
                      </div>
                    </li>
                  }
                </ul>
              }
            </amc-panel>
            <amc-panel title="Unassigned Requests" icon="user-check" [padded]="false">
              <a panelActions routerLink="/app/service-requests/assignment" class="amc-link text-xs">Assign</a>
              @if (!d.unassignedList.length) { <amc-empty-state [compact]="true" icon="check-circle" title="All clear" message="Every open request has a team or technician." /> } @else {
                <ul class="divide-y divide-line">
                  @for (r of d.unassignedList; track r.id) {
                    <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <div class="min-w-0 flex-1">
                        <a [routerLink]="['/app/service-requests', r.id]" class="block truncate text-sm font-medium text-ink hover:text-brand">{{ r.number }} · {{ r.subject }}</a>
                        <p class="truncate text-xs text-ink-muted">{{ r.customerName }} · created {{ relativeTime(r.createdAt) }}</p>
                      </div>
                      <amc-status-badge [label]="r.priority" [tone]="priorityTone[r.priority]" />
                    </li>
                  }
                </ul>
              }
            </amc-panel>
            @for (w of rowWidgets(); track w.title) {
              <amc-panel [title]="w.title" [icon]="w.icon" [padded]="false">
                @if (!w.rows.length) { <amc-empty-state [compact]="true" icon="list" title="No data" message="No data for the current filters." /> } @else {
                  <ul class="divide-y divide-line">
                    @for (row of w.rows; track row.key) {
                      <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                        <p class="min-w-0 flex-1 truncate text-sm text-ink">{{ row.label }}</p>
                        <p class="shrink-0 text-sm font-semibold tabular-nums text-ink">{{ row.value }}</p>
                      </li>
                    }
                  </ul>
                }
              </amc-panel>
            }
          </section>
        }
      }
    </div>
  `,
})
export class SrDashboardPage {
  private readonly api = inject(RequestApi);
  private readonly refs = inject(SrReferenceStore);

  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => {
    const cust = filterList(this.filters(), 'customer');
    const single = cust.length === 1 ? cust[0] : null;
    return [
      { key: 'company', label: 'Company', type: 'multiselect', options: this.refs.companyOptions() },
      { key: 'branch', label: 'Branch', type: 'multiselect', options: this.refs.branchOptions() },
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(single) },
      { key: 'asset', label: 'Asset', type: 'multiselect', options: this.refs.assetOptions(single) },
      { key: 'category', label: 'Service Category', type: 'multiselect', options: toOptions(this.refs.data().serviceCategories) },
      { key: 'type', label: 'Request Type', type: 'multiselect', options: toOptions(REQUEST_TYPES) },
      { key: 'priority', label: 'Priority', type: 'multiselect', options: toOptions(PRIORITIES) },
      { key: 'sla', label: 'SLA', type: 'multiselect', options: this.refs.slaOptions() },
      { key: 'agreement', label: 'Contract / AMC', type: 'multiselect', options: this.refs.agreementOptions() },
      { key: 'team', label: 'Team', type: 'multiselect', options: this.refs.teamOptions() },
      { key: 'technician', label: 'Technician', type: 'multiselect', options: this.refs.technicianOptions() },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(REQUEST_STATUSES) },
      { key: 'channel', label: 'Channel', type: 'multiselect', options: toOptions(REQUEST_SOURCES) },
      { key: 'period', label: 'Request Date', type: 'date-range' },
    ];
  });
  private readonly query = computed<SrDashboardFilters>(() => {
    const f = this.filters();
    return {
      companies: filterList(f, 'company'), branches: filterList(f, 'branch'), customers: filterList(f, 'customer'), sites: filterList(f, 'site'), assets: filterList(f, 'asset'),
      categories: filterList(f, 'category'), types: filterList(f, 'type'), priorities: filterList(f, 'priority'), slas: filterList(f, 'sla'), agreements: filterList(f, 'agreement'),
      teams: filterList(f, 'team'), technicians: filterList(f, 'technician'), statuses: filterList(f, 'status'), period: filterRange(f, 'period'),
    };
  });
  protected readonly dashboard = rxResource({ params: () => this.query(), stream: ({ params }) => this.api.dashboard(params) });
  protected readonly data = computed(() => (this.dashboard.hasValue() ? this.dashboard.value() : null));
  protected readonly rowWidgets = computed<{ title: string; icon: 'map-pin' | 'box' | 'layers' | 'wallet'; rows: readonly CountRow[] }[]>(() => {
    const d = this.data();
    return [
      { title: 'Requests by Site', icon: 'map-pin', rows: d?.bySite ?? [] },
      { title: 'Requests by Asset', icon: 'box', rows: d?.byAsset ?? [] },
      { title: 'Requests by Contract / AMC', icon: 'layers', rows: d?.byAgreement ?? [] },
    ];
  });
  protected readonly slaTone = SLA_TONE;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly statusTone = STATUS_TONE;
  protected readonly fm = formatMinutes;
  protected readonly relativeTime = relativeTime;
  protected readonly labels = (rows: readonly CountRow[]) => rows.map((r) => r.label);
  protected readonly values = (rows: readonly CountRow[]) => rows.map((r) => r.value);
  protected pct(v: number | null | undefined): string {
    return v === null || v === undefined ? '—' : `${v}%`;
  }

  protected export(): void {
    const k = this.data()?.kpis;
    if (!k) return;
    downloadCsv(timestampedName('sr-dashboard', 'csv'), ['Metric', 'Value'], [
      ['Total Requests', k.total], ['New', k.new], ['Unassigned', k.unassigned], ['Assigned', k.assigned], ['In Progress', k.inProgress], ['Scheduled', k.scheduled],
      ['Pending Customer', k.pendingCustomer], ['Pending Parts', k.pendingParts], ['Pending Approval', k.pendingApproval], ['Escalated', k.escalated],
      ['SLA At Risk', k.atRisk], ['SLA Breached', k.breached], ['Resolved', k.resolved], ['Closed', k.closed], ['Reopened', k.reopened],
      ['Avg Response (min)', k.avgResponseMinutes], ['Avg Resolution (min)', k.avgResolutionMinutes], ['First-Time Resolution %', k.firstTimeResolution],
    ]);
  }
}
