import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
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
import { CUSTOMER_CATEGORIES, CUSTOMER_STATUSES, CUSTOMER_TYPES } from '../../models/customer.model';
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
      { key: 'type', label: 'Customer Type', type: 'multiselect', options: toOptions(CUSTOMER_TYPES) },
      { key: 'status', label: 'Customer Status', type: 'multiselect', options: toOptions(CUSTOMER_STATUSES) },
      { key: 'category', label: 'Customer Category', type: 'multiselect', options: toOptions(CUSTOMER_CATEGORIES) },
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

  protected readonly statusTone = CUSTOMER_STATUS_TONE;
  protected readonly recordTone = recordTone;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly relativeTime = relativeTime;
  protected readonly skeletons = [1, 2, 3, 4];

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
