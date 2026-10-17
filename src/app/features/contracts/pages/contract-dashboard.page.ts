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
import { VALUE_BANDS } from '../components/value-bands';
import { ContractReferenceStore } from '../data/contract-reference.store';
import { ContractApi } from '../data/contract.api';
import { CONTRACT_RULES } from '../data/contract.config';
import { CONTRACT_STATUSES, CONTRACT_TYPES } from '../models/contract.model';
import type { ContractDashboardFilters } from '../models/dashboard.model';
import { CONTRACT_STATUS_TONE, OBLIGATION_TONE } from '../models/display';

@Component({
  selector: 'amc-contract-dashboard-page',
  imports: [EmptyState, ErrorState, FilterBar, Icon, KpiCard, MiniChart, NgTemplateOutlet, PageHeader, Panel, RouterLink, Skeleton, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <amc-page-header title="Contract Dashboard" subtitle="Centralized overview of the contract portfolio across its lifecycle." [breadcrumbs]="[{ label: 'Contracts' }, { label: 'Dashboard' }]">
        <button type="button" class="amc-btn-ghost" [disabled]="dashboard.isLoading()" (click)="dashboard.reload()" aria-label="Refresh"><amc-icon name="refresh" [class.animate-spin]="dashboard.isLoading()" /> <span class="hidden sm:inline">Refresh</span></button>
        <button type="button" class="amc-btn-secondary" [disabled]="!data()" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/contracts/list" [queryParams]="{ status: 'Expiring Soon' }" class="amc-btn-secondary hidden lg:inline-flex"><amc-icon name="clock" /> View Expiring</a>
        <a routerLink="/app/contracts/list" class="amc-btn-secondary hidden md:inline-flex"><amc-icon name="list" /> View Contracts</a>
        <a routerLink="/app/contracts/requests" [queryParams]="{ action: 'new' }" class="amc-btn-secondary"><amc-icon name="inbox" /> <span class="hidden sm:inline">Contract Request</span></a>
        <a routerLink="/app/contracts/new" class="amc-btn-primary"><amc-icon name="plus" /> Create Contract</a>
      </amc-page-header>

      <section class="amc-card p-3" aria-label="Dashboard filters">
        <amc-filter-bar [showSearch]="false" [fields]="filterFields()" [(filters)]="filters" />
      </section>

      @if (dashboard.error()) {
        <div class="amc-card"><amc-error-state message="The contract dashboard could not be loaded." (retry)="dashboard.reload()" /></div>
      } @else {
        @let k = data()?.kpis;
        @let loading = !k;
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Key indicators">
          <amc-kpi-card label="Total Contracts" icon="file-text" tone="brand" link="/app/contracts/list" [loading]="loading" [value]="k?.total ?? 0" />
          <amc-kpi-card label="Draft Contracts" icon="pencil" link="/app/contracts/list" [queryParams]="{ status: 'Draft' }" [loading]="loading" [value]="k?.draft ?? 0" />
          <amc-kpi-card label="Under Review" icon="eye" tone="info" link="/app/contracts/review" [loading]="loading" [value]="k?.underReview ?? 0" hint="Incl. negotiation" />
          <amc-kpi-card label="Pending Approval" icon="check-circle" tone="warn" link="/app/contracts/approvals" [loading]="loading" [value]="k?.pendingApproval ?? 0" />
          <amc-kpi-card label="Pending Signature" icon="pen-tool" tone="warn" link="/app/contracts/execution" [loading]="loading" [value]="k?.pendingSignature ?? 0" />
          <amc-kpi-card label="Active Contracts" icon="check-circle" tone="ok" link="/app/contracts/list" [queryParams]="{ status: 'Active' }" [loading]="loading" [value]="k?.active ?? 0" />
          <amc-kpi-card label="Expiring Contracts" icon="clock" tone="warn" link="/app/contracts/list" [queryParams]="{ status: 'Expiring Soon' }" [loading]="loading" [value]="k?.expiring ?? 0" [hint]="'Within ' + expiringDays + ' days'" />
          <amc-kpi-card label="Expired Contracts" icon="alert-circle" tone="danger" link="/app/contracts/list" [queryParams]="{ status: 'Expired' }" [loading]="loading" [value]="k?.expired ?? 0" />
          <amc-kpi-card label="Terminated Contracts" icon="ban" link="/app/contracts/terminations" [loading]="loading" [value]="k?.terminated ?? 0" />
          <amc-kpi-card label="Contracts Renewed" icon="refresh" tone="info" link="/app/contracts/renewals" [loading]="loading" [value]="k?.renewed ?? 0" />
          <amc-kpi-card label="Outstanding Obligations" icon="clipboard-list" tone="warn" link="/app/contracts/obligations" [loading]="loading" [value]="k?.withOutstandingObligations ?? 0" hint="Contracts with open obligations" />
          <amc-kpi-card label="With SLA Breaches" icon="alert-triangle" tone="danger" link="/app/contracts/list" [queryParams]="{ flag: 'sla' }" [loading]="loading" [value]="k?.withSlaBreaches ?? 0" />
          <amc-kpi-card label="Open Amendments" icon="layers" tone="accent" link="/app/contracts/amendments" [loading]="loading" [value]="k?.withOpenAmendments ?? 0" hint="Contracts with open amendments" />
          <amc-kpi-card label="Contract Value" icon="wallet" tone="brand" [loading]="loading" [value]="formatCurrency(k?.totalValue ?? 0, k?.currency ?? 'SAR', true)" hint="Portfolio, reporting currency" />
          <amc-kpi-card label="Active Contract Value" icon="trending-up" tone="ok" [loading]="loading" [value]="formatCurrency(k?.activeValue ?? 0, k?.currency ?? 'SAR', true)" hint="Active + expiring" />
        </section>

        @if (data(); as d) {
          <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <amc-panel title="Contract Status Distribution" icon="pie-chart" class="min-w-0">
              <div class="px-4 pb-4 pt-2"><amc-mini-chart type="donut" [labels]="charts().status.labels" [values]="charts().status.values" [height]="220" ariaLabel="Contract status distribution" /></div>
            </amc-panel>
            <amc-panel title="Contract Value by Contract Type" icon="bar-chart" class="min-w-0">
              <div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="charts().type.labels" [values]="charts().type.values" [height]="220" ariaLabel="Contract value by type" /></div>
            </amc-panel>
            <amc-panel title="Contract Value by Customer" icon="users" class="min-w-0" [padded]="false">
              <ul class="space-y-3 p-4 sm:p-5">
                @for (row of d.valueByCustomer; track row.id) {
                  <li>
                    <div class="flex items-center justify-between gap-2 text-sm"><span class="truncate font-medium text-ink">{{ row.label }}</span><span class="tabular-nums text-ink-muted">{{ formatCurrency(row.value, d.kpis.currency, true) }}</span></div>
                    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full rounded-full bg-brand" [style.width.%]="pct(row.value, d.valueByCustomer[0].value)"></div></div>
                  </li>
                } @empty { <li class="text-sm text-ink-muted">No contracts match the filters.</li> }
              </ul>
            </amc-panel>
          </section>
        }

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <amc-panel title="Contracts Expiring Soon" icon="clock" [padded]="false">
            <a panelActions routerLink="/app/contracts/list" [queryParams]="{ status: 'Expiring Soon' }" class="amc-link text-xs">View all</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.expiringSoon, mode: 'days', empty: 'No contracts expiring soon.' }" />
          </amc-panel>
          <amc-panel title="Contracts Pending Approval" icon="check-circle" [padded]="false">
            <a panelActions routerLink="/app/contracts/approvals" class="amc-link text-xs">Approvals</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.pendingApproval, mode: 'value', empty: 'Nothing awaiting approval.' }" />
          </amc-panel>
          <amc-panel title="Contracts Pending Signature" icon="pen-tool" [padded]="false">
            <a panelActions routerLink="/app/contracts/execution" class="amc-link text-xs">E-Signature</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.pendingSignature, mode: 'value', empty: 'Nothing awaiting signature.' }" />
          </amc-panel>
          <amc-panel title="Obligation Due Dates" icon="clipboard-list" [padded]="false">
            <a panelActions routerLink="/app/contracts/obligations" class="amc-link text-xs">View all</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.obligationsDue, mode: 'obligation', empty: 'No open obligations.' }" />
          </amc-panel>
          <amc-panel title="Upcoming Renewal Dates" icon="calendar" [padded]="false">
            <a panelActions routerLink="/app/contracts/renewals" class="amc-link text-xs">Renewals</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.upcomingRenewals, mode: 'date', empty: 'No upcoming renewals.' }" />
          </amc-panel>
          <amc-panel title="Recently Created Contracts" icon="plus" [padded]="false">
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.recentlyCreated, mode: 'relative', empty: 'No contracts yet.' }" />
          </amc-panel>
          <amc-panel title="Recently Renewed Contracts" icon="refresh" [padded]="false">
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.recentlyRenewed, mode: 'relative', empty: 'No recent renewals.' }" />
          </amc-panel>
          <amc-panel class="lg:col-span-2" title="Recently Amended Contracts" icon="layers" [padded]="false">
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.recentlyAmended, mode: 'relative', empty: 'No recent amendments.' }" />
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
          @for (row of items; track row.id + row.number) {
            <li class="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div class="min-w-0 flex-1">
                <a [routerLink]="['/app/contracts', row.id]" class="block truncate text-sm font-medium text-ink hover:text-brand">{{ row.title }}</a>
                <p class="truncate text-xs text-ink-muted"><span class="font-mono">{{ row.number }}</span> · {{ row.subtitle }}</p>
              </div>
              <div class="shrink-0 text-right">
                <amc-status-badge [label]="row.status" [tone]="mode === 'obligation' ? obligationTone(row.status) : statusTone(row.status)" />
                <p class="mt-1 text-xs text-ink-muted tabular-nums">
                  @switch (mode) {
                    @case ('days') { {{ daysTo(row.date) }} days · {{ formatDate(row.date) }} }
                    @case ('value') { {{ formatCurrency(row.value, row.currency, true) }} }
                    @case ('relative') { {{ relativeTime(row.date) }} }
                    @default { {{ formatDate(row.date) }} }
                  }
                </p>
              </div>
            </li>
          }
        </ul>
      }
    </ng-template>
  `,
})
export class ContractDashboardPage {
  private readonly api = inject(ContractApi);
  private readonly refs = inject(ContractReferenceStore);

  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'company', label: 'Company', type: 'multiselect', options: this.refs.companyOptions() },
    { key: 'branch', label: 'Branch', type: 'multiselect', options: this.refs.branchOptions() },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'type', label: 'Contract Type', type: 'multiselect', options: toOptions(CONTRACT_TYPES) },
    { key: 'status', label: 'Contract Status', type: 'multiselect', options: toOptions(CONTRACT_STATUSES) },
    { key: 'manager', label: 'Contract Manager', type: 'multiselect', options: this.refs.usersByRole('Contract Manager') },
    { key: 'am', label: 'Account Manager', type: 'multiselect', options: this.refs.usersByRole('Account Manager') },
    { key: 'start', label: 'Start Date', type: 'date-range' },
    { key: 'end', label: 'End Date', type: 'date-range' },
    { key: 'renewal', label: 'Renewal Date', type: 'date-range' },
    { key: 'value', label: 'Contract Value', type: 'multiselect', options: VALUE_BANDS.map((b) => ({ value: b.label, label: b.label })) },
  ]);

  private readonly query = computed<ContractDashboardFilters>(() => {
    const f = this.filters();
    const bands = VALUE_BANDS.filter((b) => filterList(f, 'value').includes(b.label));
    return {
      companies: filterList(f, 'company'), branches: filterList(f, 'branch'), customers: filterList(f, 'customer'), types: filterList(f, 'type'), statuses: filterList(f, 'status'),
      managers: filterList(f, 'manager'), accountManagers: filterList(f, 'am'), start: filterRange(f, 'start'), end: filterRange(f, 'end'), renewal: filterRange(f, 'renewal'),
      minValue: bands.length ? Math.min(...bands.map((b) => b.min)) : null, maxValue: bands.length && bands.every((b) => b.max !== null) ? Math.max(...bands.map((b) => b.max!)) : null,
    };
  });

  protected readonly dashboard = rxResource({ params: () => this.query(), stream: ({ params }) => this.api.dashboard(params) });
  protected readonly data = computed(() => (this.dashboard.hasValue() ? this.dashboard.value() : null));
  protected readonly charts = computed(() => {
    const d = this.data();
    const split = (items: readonly { label: string; value: number }[] = []) => ({ labels: items.map((i) => i.label), values: items.map((i) => i.value) });
    return { status: split(d?.statusDistribution), type: split(d?.valueByType) };
  });

  protected readonly expiringDays = CONTRACT_RULES.expiringWindowDays;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly relativeTime = relativeTime;

  protected statusTone(status: string) {
    return CONTRACT_STATUS_TONE[status as keyof typeof CONTRACT_STATUS_TONE] ?? 'neutral';
  }

  protected obligationTone(status: string) {
    return OBLIGATION_TONE[status as keyof typeof OBLIGATION_TONE] ?? 'neutral';
  }

  protected daysTo(date: string | null): number {
    return date ? Math.round((new Date(date).getTime() - Date.now()) / 86_400_000) : 0;
  }

  protected pct(value: number, max: number): number {
    return max ? Math.max(4, Math.round((value / max) * 100)) : 0;
  }

  protected export(): void {
    const d = this.data();
    if (!d) return;
    const k = d.kpis;
    downloadCsv(timestampedName('contract-dashboard', 'csv'), ['Metric', 'Value'], [
      ['Total Contracts', k.total], ['Draft Contracts', k.draft], ['Under Review', k.underReview], ['Pending Approval', k.pendingApproval], ['Pending Signature', k.pendingSignature],
      ['Active Contracts', k.active], ['Expiring Contracts', k.expiring], ['Expired Contracts', k.expired], ['Terminated Contracts', k.terminated], ['Contracts Renewed', k.renewed],
      ['Contracts with Outstanding Obligations', k.withOutstandingObligations], ['Contracts with SLA Breaches', k.withSlaBreaches], ['Contracts with Open Amendments', k.withOpenAmendments],
      [`Contract Value (${k.currency})`, k.totalValue], [`Active Contract Value (${k.currency})`, k.activeValue],
      ...d.valueByType.map((r) => [`Value · ${r.label}`, r.value]),
      ...d.statusDistribution.map((r) => [`Status · ${r.label}`, r.value]),
    ]);
  }
}
