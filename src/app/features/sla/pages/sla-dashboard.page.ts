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
import { SlaReferenceStore } from '../data/sla-reference.store';
import { SlaApi } from '../data/sla.api';
import { CLOCK_TONE, PRIORITY_TONE, formatMinutes } from '../models/display';
import type { PerformanceRow, SlaDashboardFilters } from '../models/operations.model';
import { PRIORITIES, SLA_STATUSES, SLA_TYPES } from '../models/sla.model';

@Component({
  selector: 'amc-sla-dashboard-page',
  imports: [EmptyState, ErrorState, FilterBar, Icon, KpiCard, MiniChart, PageHeader, Panel, RouterLink, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <amc-page-header title="SLA Dashboard" subtitle="SLA commitments, active clocks, approaching breaches, escalations and compliance." [breadcrumbs]="[{ label: 'SLA Management' }, { label: 'Dashboard' }]">
        <button type="button" class="amc-btn-ghost" [disabled]="dashboard.isLoading()" (click)="dashboard.reload()" aria-label="Refresh"><amc-icon name="refresh" [class.animate-spin]="dashboard.isLoading()" /> <span class="hidden sm:inline">Refresh</span></button>
        <button type="button" class="amc-btn-secondary" [disabled]="!data()" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/sla/monitoring" class="amc-btn-secondary hidden lg:inline-flex"><amc-icon name="clock" /> Active Clocks</a>
        <a routerLink="/app/sla/breaches" class="amc-btn-secondary hidden lg:inline-flex"><amc-icon name="alert-circle" /> Breaches</a>
        <a routerLink="/app/sla/escalations" class="amc-btn-secondary hidden xl:inline-flex"><amc-icon name="alert-triangle" /> Escalations</a>
        <a routerLink="/app/sla/performance" class="amc-btn-secondary hidden xl:inline-flex"><amc-icon name="bar-chart" /> Performance</a>
        <a routerLink="/app/sla/list" class="amc-btn-secondary hidden md:inline-flex"><amc-icon name="list" /> View SLAs</a>
        <a routerLink="/app/sla/new" class="amc-btn-primary"><amc-icon name="plus" /> Create SLA</a>
      </amc-page-header>

      <section class="amc-card p-3" aria-label="Dashboard filters"><amc-filter-bar [showSearch]="false" [fields]="filterFields()" [(filters)]="filters" /></section>

      @if (dashboard.error()) {
        <div class="amc-card"><amc-error-state message="The SLA dashboard could not be loaded." (retry)="dashboard.reload()" /></div>
      } @else {
        @let k = data()?.kpis;
        @let loading = !k;
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Key indicators">
          <amc-kpi-card label="Total SLAs" icon="clock" tone="brand" link="/app/sla/list" [loading]="loading" [value]="k?.total ?? 0" />
          <amc-kpi-card label="Draft SLAs" icon="pencil" link="/app/sla/list" [queryParams]="{ status: 'Draft' }" [loading]="loading" [value]="k?.draft ?? 0" />
          <amc-kpi-card label="Pending Approval" icon="send" tone="warn" link="/app/sla/list" [queryParams]="{ status: 'Pending Approval' }" [loading]="loading" [value]="k?.pendingApproval ?? 0" />
          <amc-kpi-card label="Active SLAs" icon="check-circle" tone="ok" link="/app/sla/list" [queryParams]="{ status: 'Active' }" [loading]="loading" [value]="k?.active ?? 0" />
          <amc-kpi-card label="Expiring SLAs" icon="clock" tone="warn" link="/app/sla/list" [queryParams]="{ status: 'Expiring Soon' }" [loading]="loading" [value]="k?.expiring ?? 0" />
          <amc-kpi-card label="Expired SLAs" icon="alert-circle" tone="danger" link="/app/sla/list" [queryParams]="{ status: 'Expired' }" [loading]="loading" [value]="k?.expired ?? 0" />
          <amc-kpi-card label="Suspended SLAs" icon="pause" tone="warn" link="/app/sla/list" [queryParams]="{ status: 'Suspended' }" [loading]="loading" [value]="k?.suspended ?? 0" />
          <amc-kpi-card label="Active SLA Clocks" icon="activity" tone="info" link="/app/sla/monitoring" [loading]="loading" [value]="k?.activeClocks ?? 0" />
          <amc-kpi-card label="Requests Under SLA" icon="ticket" tone="info" link="/app/sla/monitoring" [loading]="loading" [value]="k?.requestsUnderSla ?? 0" />
          <amc-kpi-card label="Work Orders Under SLA" icon="wrench" tone="info" link="/app/sla/monitoring" [loading]="loading" [value]="k?.workOrdersUnderSla ?? 0" />
          <amc-kpi-card label="SLA Targets Due Soon" icon="clock" tone="warn" link="/app/sla/monitoring" [queryParams]="{ status: 'Warning' }" [loading]="loading" [value]="k?.dueSoon ?? 0" hint="Within 4 hours" />
          <amc-kpi-card label="SLA Breaches" icon="alert-circle" tone="danger" link="/app/sla/breaches" [loading]="loading" [value]="k?.breaches ?? 0" />
          <amc-kpi-card label="Response Breaches" icon="alert-circle" tone="danger" link="/app/sla/breaches" [queryParams]="{ type: 'Response Breach' }" [loading]="loading" [value]="k?.responseBreaches ?? 0" />
          <amc-kpi-card label="Resolution Breaches" icon="alert-circle" tone="danger" link="/app/sla/breaches" [queryParams]="{ type: 'Resolution Breach' }" [loading]="loading" [value]="k?.resolutionBreaches ?? 0" />
          <amc-kpi-card label="Open Escalations" icon="alert-triangle" tone="warn" link="/app/sla/escalations" [loading]="loading" [value]="k?.openEscalations ?? 0" />
          <amc-kpi-card label="SLA Compliance %" icon="shield-check" [tone]="(k?.compliance ?? 100) >= 90 ? 'ok' : 'danger'" link="/app/sla/performance" [loading]="loading" [value]="pctText(k?.compliance)" />
          <amc-kpi-card label="First Response Compliance" icon="check-circle" tone="ok" [loading]="loading" [value]="pctText(k?.firstResponseCompliance)" />
          <amc-kpi-card label="Resolution Compliance" icon="check-circle" tone="ok" [loading]="loading" [value]="pctText(k?.resolutionCompliance)" />
          <amc-kpi-card label="Avg Response Time" icon="clock" [loading]="loading" [value]="fm(k?.avgResponseMinutes)" />
          <amc-kpi-card label="Avg Resolution Time" icon="clock" [loading]="loading" [value]="fm(k?.avgResolutionMinutes)" />
        </section>

        @if (data(); as d) {
          <section class="grid grid-cols-3 gap-3">
            <a routerLink="/app/sla/breaches" class="amc-card flex items-center gap-3 p-4 hover:border-danger/40"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-subtle text-danger"><amc-icon name="alert-circle" /></span><div><p class="text-2xl font-semibold tabular-nums">{{ d.breachesToday }}</p><p class="text-xs text-ink-muted">SLA Breaches Today</p></div></a>
            <a routerLink="/app/sla/breaches" class="amc-card flex items-center gap-3 p-4 hover:border-danger/40"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-warn-subtle text-warn"><amc-icon name="calendar" /></span><div><p class="text-2xl font-semibold tabular-nums">{{ d.breachesWeek }}</p><p class="text-xs text-ink-muted">This Week</p></div></a>
            <a routerLink="/app/sla/breaches" class="amc-card flex items-center gap-3 p-4 hover:border-danger/40"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken text-ink-muted"><amc-icon name="calendar" /></span><div><p class="text-2xl font-semibold tabular-nums">{{ d.breachesMonth }}</p><p class="text-xs text-ink-muted">This Month</p></div></a>
          </section>

          <section class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <amc-panel title="SLA Compliance Trend" description="Weekly compliance %" icon="trending-up" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="trendLabels()" [values]="complianceTrend()" [height]="180" ariaLabel="SLA compliance trend" /></div></amc-panel>
            <amc-panel title="Response Time Trend" description="Average minutes per week" icon="clock" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="trendLabels()" [values]="responseTrend()" [height]="180" ariaLabel="Response time trend" /></div></amc-panel>
            <amc-panel title="Resolution Time Trend" description="Average minutes per week" icon="clock" class="min-w-0"><div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="trendLabels()" [values]="resolutionTrend()" [height]="180" ariaLabel="Resolution time trend" /></div></amc-panel>
          </section>

          <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            @for (w of clockWidgets(); track w.title) {
              <amc-panel [title]="w.title" [icon]="w.icon" [padded]="false">
                <a panelActions routerLink="/app/sla/monitoring" class="amc-link text-xs">Monitor</a>
                @if (!w.rows.length) { <amc-empty-state [compact]="true" icon="check-circle" title="All clear" [message]="w.empty" /> } @else {
                  <ul class="divide-y divide-line">
                    @for (c of w.rows; track c.id) {
                      <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-medium text-ink">{{ c.transactionNumber }} · {{ c.targetType }}</p>
                          <p class="truncate text-xs text-ink-muted">{{ c.customerName }} · {{ c.slaNumber }}</p>
                        </div>
                        <div class="shrink-0 text-right">
                          <amc-status-badge [label]="c.monitoringStatus" [tone]="clockTone[c.monitoringStatus]" />
                          <p class="mt-1 text-xs tabular-nums text-ink-muted">{{ c.consumption }}% · {{ c.remainingMinutes >= 0 ? fm(c.remainingMinutes) + ' left' : fm(-c.remainingMinutes) + ' over' }}</p>
                        </div>
                      </li>
                    }
                  </ul>
                }
              </amc-panel>
            }
            <amc-panel title="Open Escalations" icon="alert-triangle" [padded]="false">
              <a panelActions routerLink="/app/sla/escalations" class="amc-link text-xs">View all</a>
              @if (!d.escalations.length) { <amc-empty-state [compact]="true" icon="check-circle" title="All clear" message="No open escalations." /> } @else {
                <ul class="divide-y divide-line">
                  @for (e of d.escalations; track e.id) {
                    <li class="px-4 py-2.5 sm:px-5"><p class="truncate text-sm font-medium text-ink">{{ e.levelName }}</p><p class="truncate text-xs text-ink-muted">{{ e.transactionNumber }} · {{ e.customerName }} · {{ relativeTime(e.triggeredAt) }}</p></li>
                  }
                </ul>
              }
            </amc-panel>
            @for (w of rowWidgets(); track w.title) {
              <amc-panel [title]="w.title" [icon]="w.icon" [padded]="false">
                @if (!w.rows.length) { <amc-empty-state [compact]="true" icon="check-circle" title="All clear" message="No data for the current filters." /> } @else {
                  <ul class="divide-y divide-line">
                    @for (r of w.rows; track r.key) {
                      <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-medium text-ink">{{ r.label }}</p>
                          <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full rounded-full" [class]="(r.compliance ?? 100) >= 95 ? 'bg-ok' : (r.compliance ?? 100) >= 85 ? 'bg-warn' : 'bg-danger'" [style.width.%]="r.compliance ?? 0"></div></div>
                        </div>
                        <div class="shrink-0 text-right text-xs tabular-nums">
                          <p class="font-semibold text-ink">{{ pctText(r.compliance) }}</p>
                          <p class="text-ink-muted">{{ r.breached }} breach{{ r.breached === 1 ? '' : 'es' }} · {{ r.total }}</p>
                        </div>
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
export class SlaDashboardPage {
  private readonly api = inject(SlaApi);
  private readonly refs = inject(SlaReferenceStore);

  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => {
    const customers = filterList(this.filters(), 'customer');
    const cust = customers.length === 1 ? customers[0] : null;
    return [
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'contract', label: 'Contract', type: 'multiselect', options: this.refs.contractOptions(cust) },
      { key: 'amc', label: 'AMC', type: 'multiselect', options: this.refs.amcOptions(cust) },
      { key: 'sla', label: 'SLA', type: 'multiselect', options: this.refs.slaOptions() },
      { key: 'service', label: 'Service', type: 'multiselect', options: this.refs.serviceOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(cust) },
      { key: 'asset', label: 'Asset', type: 'multiselect', options: this.refs.assetOptions(cust) },
      { key: 'priority', label: 'Priority', type: 'multiselect', options: toOptions(PRIORITIES) },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(SLA_STATUSES) },
      { key: 'type', label: 'SLA Type', type: 'multiselect', options: toOptions(SLA_TYPES) },
      { key: 'region', label: 'Service Region', type: 'multiselect', options: this.refs.regionOptions() },
      { key: 'team', label: 'Service Team', type: 'multiselect', options: this.refs.teamOptions() },
      { key: 'technician', label: 'Technician', type: 'multiselect', options: this.refs.technicianOptions() },
      { key: 'period', label: 'Start / End Date', type: 'date-range' },
    ];
  });
  private readonly query = computed<SlaDashboardFilters>(() => {
    const f = this.filters();
    return {
      customers: filterList(f, 'customer'), contracts: filterList(f, 'contract'), amcs: filterList(f, 'amc'), slas: filterList(f, 'sla'), services: filterList(f, 'service'), sites: filterList(f, 'site'), assets: filterList(f, 'asset'),
      priorities: filterList(f, 'priority'), statuses: filterList(f, 'status'), types: filterList(f, 'type'), regions: filterList(f, 'region'), teams: filterList(f, 'team'), technicians: filterList(f, 'technician'), period: filterRange(f, 'period'),
    };
  });
  protected readonly dashboard = rxResource({ params: () => this.query(), stream: ({ params }) => this.api.dashboard(params) });
  protected readonly data = computed(() => (this.dashboard.hasValue() ? this.dashboard.value() : null));
  protected readonly trendLabels = computed(() => (this.data()?.trend ?? []).map((t) => t.label));
  protected readonly complianceTrend = computed(() => (this.data()?.trend ?? []).map((t) => t.compliance ?? 0));
  protected readonly responseTrend = computed(() => (this.data()?.trend ?? []).map((t) => t.avgResponseMinutes ?? 0));
  protected readonly resolutionTrend = computed(() => (this.data()?.trend ?? []).map((t) => t.avgResolutionMinutes ?? 0));
  protected readonly clockWidgets = computed(() => {
    const d = this.data();
    return [
      { title: 'SLA Targets Due Soon', icon: 'clock' as const, rows: d?.dueSoon ?? [], empty: 'Nothing due in the next 4 hours.' },
      { title: 'Active SLA Clocks', icon: 'activity' as const, rows: d?.activeClocks ?? [], empty: 'No running clocks.' },
      { title: 'Critical SLA Requests', icon: 'alert-triangle' as const, rows: d?.critical ?? [], empty: 'No critical requests under SLA.' },
    ];
  });
  protected readonly rowWidgets = computed<{ title: string; icon: 'building' | 'list' | 'users' | 'layers'; rows: readonly PerformanceRow[] }[]>(() => {
    const d = this.data();
    return [
      { title: 'Customers with SLA Breaches', icon: 'building', rows: d?.customersWithBreaches ?? [] },
      { title: 'Services with SLA Breaches', icon: 'list', rows: d?.servicesWithBreaches ?? [] },
      { title: 'SLA Performance by Customer', icon: 'building', rows: d?.byCustomer ?? [] },
      { title: 'SLA Performance by Service', icon: 'list', rows: d?.byService ?? [] },
      { title: 'SLA Performance by Priority', icon: 'layers', rows: d?.byPriority ?? [] },
      { title: 'SLA Performance by Technician Team', icon: 'users', rows: d?.byTeam ?? [] },
    ];
  });
  protected readonly clockTone = CLOCK_TONE;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly fm = formatMinutes;
  protected readonly relativeTime = relativeTime;
  protected pctText(v: number | null | undefined): string {
    return v === null || v === undefined ? '—' : `${v}%`;
  }

  protected export(): void {
    const k = this.data()?.kpis;
    if (!k) return;
    downloadCsv(timestampedName('sla-dashboard', 'csv'), ['Metric', 'Value'], [
      ['Total SLAs', k.total], ['Draft SLAs', k.draft], ['Pending Approval', k.pendingApproval], ['Active SLAs', k.active], ['Expiring SLAs', k.expiring], ['Expired SLAs', k.expired], ['Suspended SLAs', k.suspended],
      ['Active SLA Clocks', k.activeClocks], ['Requests Under SLA', k.requestsUnderSla], ['Work Orders Under SLA', k.workOrdersUnderSla], ['SLA Targets Due Soon', k.dueSoon], ['SLA Breaches', k.breaches],
      ['Response SLA Breaches', k.responseBreaches], ['Resolution SLA Breaches', k.resolutionBreaches], ['Open Escalations', k.openEscalations], ['SLA Compliance %', k.compliance], ['First Response Compliance %', k.firstResponseCompliance],
      ['Resolution Compliance %', k.resolutionCompliance], ['Average Response Time (min)', k.avgResponseMinutes], ['Average Resolution Time (min)', k.avgResolutionMinutes],
    ]);
  }
}
