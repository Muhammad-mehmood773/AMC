import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MiniChart } from '@shared/ui/mini-chart';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { toOptions } from '@shared/models/select-option';
import { RANGE_PRESETS, rangeLabel } from '@shared/ui/date-picker';
import { EmptyState } from '@shared/ui/empty-state';
import { ErrorState } from '@shared/ui/error-state';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, filterRange } from '@shared/utils/filters';
import { formatCurrency, formatDate, relativeTime } from '@shared/utils/format';
import { CustomerApi } from '../../data/customer-site.api';
import { CustomerLookupsStore } from '../../data/lookups.store';
import { LOOKUP } from '../../data/customer-site.lookups';
import { CUSTOMER_STATUSES } from '../../models/customer.model';
import type { DashboardFilters } from '../../models/dashboard.model';
import { CUSTOMER_STATUS_TONE, recordTone } from '../../models/display';

const DEFAULT_RANGE = RANGE_PRESETS.find((p) => p.label === 'Last 90 days')!.range();

@Component({
  selector: 'amc-customer-dashboard-page',
  imports: [
    EmptyState,
    ErrorState,
    FilterBar,
    Icon,
    KpiCard,
    MiniChart,
    NgTemplateOutlet,
    PageHeader,
    Panel,
    RouterLink,
    Skeleton,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-dashboard.page.html',
})
export class CustomerDashboardPage {
  private readonly api = inject(CustomerApi);
  protected readonly lookups = inject(CustomerLookupsStore);
  private readonly lookupValues = inject(LookupValuesStore);

  protected readonly filters = signal<FilterValues>({ range: DEFAULT_RANGE });

  protected readonly filterFields = computed<FilterField[]>(() => {
    const companies = filterList(this.filters(), 'company');
    const branches = this.lookups
      .data()
      .branches.filter((b) => companies.length === 0 || companies.includes(b.companyId))
      .map((b) => ({ value: b.id, label: b.name, hint: this.lookups.name('companies', b.companyId) ?? undefined }));
    return [
      { key: 'range', label: 'Date Range', type: 'date-range', placeholder: 'All time' },
      { key: 'company', label: 'Company', type: 'multiselect', options: this.lookups.companyOptions() },
      { key: 'branch', label: 'Branch', type: 'multiselect', options: branches },
      { key: 'type', label: 'Customer Type', type: 'multiselect', options: this.lookupValues.options(LOOKUP.customerType)() },
      { key: 'status', label: 'Customer Status', type: 'multiselect', options: toOptions(CUSTOMER_STATUSES) },
      { key: 'category', label: 'Customer Category', type: 'multiselect', options: this.lookupValues.options(LOOKUP.customerCategory)() },
      { key: 'manager', label: 'Account Manager', type: 'multiselect', options: this.lookups.accountManagerOptions() },
    ];
  });

  private readonly query = computed<DashboardFilters>(() => {
    const f = this.filters();
    const range = filterRange(f, 'range');
    return {
      companies: filterList(f, 'company'),
      branches: filterList(f, 'branch'),
      types: filterList(f, 'type'),
      statuses: filterList(f, 'status'),
      categories: filterList(f, 'category'),
      managers: filterList(f, 'manager'),
      from: range.from,
      to: range.to,
    };
  });

  protected readonly periodLabel = computed(() => rangeLabel(filterRange(this.filters(), 'range')) || 'All time');

  protected readonly dashboard = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.dashboard(params),
  });
  protected readonly data = computed(() => (this.dashboard.hasValue() ? this.dashboard.value() : null));

  /** Donut chart: customer status distribution */
  protected readonly statusChartLabels = computed(() => {
    const k = this.data()?.kpis;
    if (!k) return [];
    return ['Active', 'On Hold / Inactive', 'New (period)'];
  });
  protected readonly statusChartValues = computed(() => {
    const k = this.data()?.kpis;
    if (!k) return [];
    return [k.activeCustomers, k.inactiveCustomers, k.newCustomers];
  });

  /** Bar chart: agreement coverage */
  protected readonly coverageChartLabels = computed(() => [
    'Active Contracts', 'Active AMCs', 'Open SRs', 'Open WOs', 'Overdue Invoices',
  ]);
  protected readonly coverageChartValues = computed(() => {
    const k = this.data()?.kpis;
    if (!k) return [];
    return [k.withActiveContracts, k.withActiveAmcs, k.withOpenServiceRequests, k.withOpenWorkOrders, k.withOutstandingInvoices];
  });

  protected readonly statusTone = CUSTOMER_STATUS_TONE;
  protected readonly recordTone = recordTone;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly relativeTime = relativeTime;
  protected readonly skeletons = [1, 2, 3, 4];

  // ── Widget Customization ────────────────────────────────────────
  private static readonly STORAGE_KEY = 'amc.dashboard.widgets';

  static readonly WIDGET_DEFS = [
    { id: 'kpis',              label: 'KPI Cards',              icon: 'layout-dashboard' as const },
    { id: 'charts',            label: 'Charts',                 icon: 'bar-chart' as const },
    { id: 'expiring',          label: 'Expiring Contracts',     icon: 'clock' as const },
    { id: 'outstanding',       label: 'Outstanding Amounts',    icon: 'wallet' as const },
    { id: 'service-requests',  label: 'Open Service Requests',  icon: 'ticket' as const },
    { id: 'maintenance',       label: 'Upcoming Maintenance',   icon: 'calendar-check' as const },
    { id: 'recent-customers',  label: 'Recent Customers',       icon: 'building' as const },
    { id: 'recent-sites',      label: 'Recently Added Sites',   icon: 'map-pin' as const },
    { id: 'activity',          label: 'Recent Activity',        icon: 'activity' as const },
  ] as const;

  protected readonly widgetDefs = CustomerDashboardPage.WIDGET_DEFS;

  private loadVisible(): Set<string> {
    try {
      const raw = localStorage.getItem(CustomerDashboardPage.STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    // Default: all visible
    return new Set(CustomerDashboardPage.WIDGET_DEFS.map((w) => w.id));
  }

  protected readonly visibleWidgets = signal<Set<string>>(this.loadVisible());
  protected readonly customizeOpen = signal(false);

  constructor() {
    effect(() => {
      localStorage.setItem(
        CustomerDashboardPage.STORAGE_KEY,
        JSON.stringify([...this.visibleWidgets()]),
      );
    });
  }

  protected isVisible(id: string): boolean {
    return this.visibleWidgets().has(id);
  }

  protected toggleWidget(id: string): void {
    this.visibleWidgets.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  protected resetWidgets(): void {
    this.visibleWidgets.set(new Set(CustomerDashboardPage.WIDGET_DEFS.map((w) => w.id)));
  }

  protected export(): void {
    const data = this.data();
    if (!data) return;
    const k = data.kpis;
    downloadCsv(
      timestampedName('customer-dashboard', 'csv'),
      ['Metric', 'Value'],
      [
        ['Total Customers', k.totalCustomers],
        ['Active Customers', k.activeCustomers],
        ['Inactive Customers', k.inactiveCustomers],
        [`New Customers (${this.periodLabel()})`, k.newCustomers],
        ['Customers with Active Contracts', k.withActiveContracts],
        ['Customers with Expiring Contracts', k.withExpiringContracts],
        ['Customers with Active AMCs', k.withActiveAmcs],
        ['Customers with Open Service Requests', k.withOpenServiceRequests],
        ['Customers with Open Work Orders', k.withOpenWorkOrders],
        ['Customers with Outstanding Invoices', k.withOutstandingInvoices],
        ['Outstanding Amount (SAR)', k.outstandingTotal],
      ],
    );
  }

  protected percent(part: number, total: number): string {
    return total ? `${Math.round((part / total) * 100)}% of customers` : '—';
  }

  protected barWidth(amount: number): number {
    const max = this.data()?.outstanding[0]?.amount ?? 0;
    return max ? Math.max(4, Math.round((amount / max) * 100)) : 0;
  }
}
