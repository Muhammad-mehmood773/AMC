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
import { formatDate, relativeTime } from '@shared/utils/format';
import { EntitlementValidationDialog } from '../components/entitlement-validation-dialog';
import { CatalogReferenceStore } from '../data/catalog-reference.store';
import { CategoryApi, ServiceCatalogApi } from '../data/catalog.api';
import { CATALOG_RULES } from '../data/catalog.config';
import { SERVICE_STATUSES, SERVICE_TYPES } from '../models/catalog.model';
import type { CatalogDashboardFilters } from '../models/dashboard.model';
import { ENTITLEMENT_STATUS_TONE, SERVICE_STATUS_TONE } from '../models/display';

@Component({
  selector: 'amc-catalog-dashboard-page',
  imports: [EmptyState, EntitlementValidationDialog, ErrorState, FilterBar, Icon, KpiCard, MiniChart, NgTemplateOutlet, PageHeader, Panel, RouterLink, Skeleton, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <amc-page-header title="Service Catalog Dashboard" subtitle="Overview of available services and customer entitlement coverage." [breadcrumbs]="[{ label: 'Service Catalog' }, { label: 'Dashboard' }]">
        <button type="button" class="amc-btn-ghost" [disabled]="dashboard.isLoading()" (click)="dashboard.reload()" aria-label="Refresh"><amc-icon name="refresh" [class.animate-spin]="dashboard.isLoading()" /> <span class="hidden sm:inline">Refresh</span></button>
        <button type="button" class="amc-btn-secondary" [disabled]="!data()" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-secondary hidden lg:inline-flex" (click)="validateOpen.set(true)"><amc-icon name="shield-check" /> Validate Entitlement</button>
        <a routerLink="/app/catalog/services" class="amc-btn-secondary hidden md:inline-flex"><amc-icon name="list" /> View Services</a>
        <a routerLink="/app/catalog/categories" [queryParams]="{ action: 'add' }" class="amc-btn-secondary hidden md:inline-flex"><amc-icon name="tag" /> Add Category</a>
        <a routerLink="/app/catalog/entitlements/new" class="amc-btn-secondary"><amc-icon name="shield-check" /> Add Entitlement</a>
        <a routerLink="/app/catalog/services/new" class="amc-btn-primary"><amc-icon name="plus" /> Add Service</a>
      </amc-page-header>

      <section class="amc-card p-3" aria-label="Dashboard filters">
        <amc-filter-bar [showSearch]="false" [fields]="filterFields()" [(filters)]="filters" />
      </section>

      @if (dashboard.error()) {
        <div class="amc-card"><amc-error-state message="The catalog dashboard could not be loaded." (retry)="dashboard.reload()" /></div>
      } @else {
        @let k = data()?.kpis;
        @let loading = !k;
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" aria-label="Key indicators">
          <amc-kpi-card label="Total Services" icon="list" tone="brand" link="/app/catalog/services" [loading]="loading" [value]="k?.totalServices ?? 0" hint="In the catalog" />
          <amc-kpi-card label="Active Services" icon="check-circle" tone="ok" link="/app/catalog/services" [queryParams]="{ status: 'Active' }" [loading]="loading" [value]="k?.activeServices ?? 0" hint="Selectable for transactions" />
          <amc-kpi-card label="Inactive Services" icon="ban" link="/app/catalog/services" [queryParams]="{ status: 'Inactive' }" [loading]="loading" [value]="k?.inactiveServices ?? 0" hint="Inactive or draft" />
          <amc-kpi-card label="Service Categories" icon="tag" tone="info" link="/app/catalog/categories" [loading]="loading" [value]="k?.categories ?? 0" hint="Active categories" />
          <amc-kpi-card label="Contract-Eligible" icon="file-check" tone="accent" link="/app/catalog/services" [queryParams]="{ eligible: 'contract' }" [loading]="loading" [value]="k?.contractEligible ?? 0" hint="Can be included in contracts" />
          <amc-kpi-card label="AMC-Eligible" icon="shield-check" tone="accent" link="/app/catalog/services" [queryParams]="{ eligible: 'amc' }" [loading]="loading" [value]="k?.amcEligible ?? 0" hint="Can be included in AMCs" />
          <amc-kpi-card label="Billable Services" icon="wallet" tone="warn" link="/app/catalog/services" [queryParams]="{ billing: 'Billable' }" [loading]="loading" [value]="k?.billable ?? 0" />
          <amc-kpi-card label="Non-Billable Services" icon="receipt" link="/app/catalog/services" [queryParams]="{ billing: 'Non-Billable' }" [loading]="loading" [value]="k?.nonBillable ?? 0" hint="Contract included / non-billable" />
          <amc-kpi-card label="Active Entitlements" icon="shield-check" tone="ok" link="/app/catalog/entitlements" [queryParams]="{ status: 'Active' }" [loading]="loading" [value]="k?.activeEntitlements ?? 0" />
          <amc-kpi-card label="Expiring Entitlements" icon="clock" tone="warn" link="/app/catalog/entitlements" [queryParams]="{ flag: 'expiring' }" [loading]="loading" [value]="k?.expiringEntitlements ?? 0" [hint]="'Within ' + expiringDays + ' days'" />
          <amc-kpi-card label="With Usage Limits" icon="activity" tone="info" link="/app/catalog/entitlements" [queryParams]="{ flag: 'limited' }" [loading]="loading" [value]="k?.withUsageLimits ?? 0" hint="Active, usage-based" />
          <amc-kpi-card label="Near Usage Limit" icon="alert-triangle" tone="danger" link="/app/catalog/entitlements" [queryParams]="{ flag: 'near-limit' }" [loading]="loading" [value]="k?.nearLimit ?? 0" [hint]="'≤ ' + nearLimit + '% remaining or exhausted'" />
        </section>

        @if (data(); as d) {
          <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <amc-panel title="Service Requests by Service Type" description="Covered services consumed" icon="bar-chart" class="min-w-0">
              <div class="px-4 pb-4 pt-2"><amc-mini-chart type="bar" [labels]="charts().types.labels" [values]="charts().types.values" [height]="220" ariaLabel="Requests by service type" /></div>
            </amc-panel>
            <amc-panel title="Service Usage by Customer" description="Covered services consumed per customer" icon="users" class="min-w-0" [padded]="false">
              <ul class="space-y-3 p-4 sm:p-5">
                @for (row of d.usageByCustomer; track row.id) {
                  <li>
                    <div class="flex items-center justify-between gap-2 text-sm"><a [routerLink]="['/app/customers', row.id]" class="truncate font-medium text-ink hover:text-brand">{{ row.label }}</a><span class="tabular-nums text-ink-muted">{{ row.value }}</span></div>
                    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full rounded-full bg-brand" [style.width.%]="pct(row.value, d.usageByCustomer[0].value)"></div></div>
                  </li>
                } @empty {
                  <li class="text-sm text-ink-muted">No usage in the selected period.</li>
                }
              </ul>
            </amc-panel>
            <amc-panel title="Services by Category" icon="pie-chart" class="min-w-0">
              <div class="px-4 pb-4 pt-2"><amc-mini-chart type="donut" [labels]="charts().categories.labels" [values]="charts().categories.values" [height]="220" ariaLabel="Services by category" /></div>
            </amc-panel>
          </section>
        }

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <amc-panel title="Expiring Entitlements" [description]="'Ending within ' + expiringDays + ' days'" icon="clock" [padded]="false">
            <a panelActions routerLink="/app/catalog/entitlements" [queryParams]="{ flag: 'expiring' }" class="amc-link text-xs">View all</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.expiringEntitlements, kind: 'entitlement', mode: 'days', empty: 'No entitlements expiring soon.' }" />
          </amc-panel>
          <amc-panel title="Entitlements Near Usage Limit" icon="alert-triangle" [padded]="false">
            <a panelActions routerLink="/app/catalog/entitlements" [queryParams]="{ flag: 'near-limit' }" class="amc-link text-xs">View all</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.nearLimit, kind: 'entitlement', mode: 'usage', empty: 'No entitlements near their limit.' }" />
          </amc-panel>
          <amc-panel title="Most Used Services" icon="trending-up" [padded]="false">
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.mostUsedServices, kind: 'service', mode: 'count', empty: 'No usage recorded.' }" />
          </amc-panel>
          <amc-panel title="Recently Added Services" icon="list" [padded]="false">
            <a panelActions routerLink="/app/catalog/services" class="amc-link text-xs">View all</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.recentServices, kind: 'service', mode: 'relative', empty: 'No services yet.' }" />
          </amc-panel>
          <amc-panel class="lg:col-span-2" title="Recently Created Entitlements" icon="shield-check" [padded]="false">
            <a panelActions routerLink="/app/catalog/entitlements" class="amc-link text-xs">View all</a>
            <ng-container *ngTemplateOutlet="rows; context: { $implicit: data()?.recentEntitlements, kind: 'entitlement', mode: 'relative', empty: 'No entitlements yet.' }" />
          </amc-panel>
        </div>
      }
    </div>

    <amc-entitlement-validation-dialog [(open)]="validateOpen" (consumed)="dashboard.reload()" />

    <ng-template #rows let-items let-kind="kind" let-mode="mode" let-empty="empty">
      @if (!data()) {
        <div class="space-y-4 p-4 sm:p-5">@for (i of [1, 2, 3, 4]; track i) { <amc-skeleton class="h-9 w-full" /> }</div>
      } @else if (!items?.length) {
        <amc-empty-state [compact]="true" icon="check-circle" title="All clear" [message]="empty" />
      } @else {
        <ul class="divide-y divide-line">
          @for (row of items; track row.id) {
            <li class="flex items-center gap-3 px-4 py-3 sm:px-5">
              @if (mode === 'days') {
                <span class="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-center leading-none" [class]="row.value <= 14 ? 'bg-danger-subtle text-danger' : 'bg-warn-subtle text-warn'">
                  <span class="text-sm font-semibold tabular-nums">{{ row.value }}</span><span class="text-[10px]">days</span>
                </span>
              }
              <div class="min-w-0 flex-1">
                <a [routerLink]="[kind === 'service' ? '/app/catalog/services' : '/app/catalog/entitlements', row.id]" class="block truncate text-sm font-medium text-ink hover:text-brand">{{ kind === 'service' ? row.title : row.code + ' · ' + row.title }}</a>
                <p class="truncate text-xs text-ink-muted">{{ kind === 'service' ? row.code + ' · ' + row.subtitle : row.subtitle }}</p>
                @if (mode === 'usage') {
                  <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full rounded-full" [class]="(row.percentage ?? 0) >= 100 ? 'bg-danger' : 'bg-warn'" [style.width.%]="row.percentage > 100 ? 100 : row.percentage"></div></div>
                }
              </div>
              <div class="shrink-0 text-right">
                @if (mode === 'count') {
                  <span class="text-sm font-semibold tabular-nums text-ink">{{ row.value }}</span><p class="text-xs text-ink-muted">uses</p>
                } @else if (mode === 'usage') {
                  <span class="text-sm font-semibold tabular-nums text-ink">{{ row.percentage }}%</span><p class="text-xs text-ink-muted">{{ row.value }} left</p>
                } @else {
                  <amc-status-badge [label]="row.status" [tone]="tone(kind, row.status)" />
                  @if (row.date) { <p class="mt-1 text-xs text-ink-muted tabular-nums">{{ mode === 'relative' ? relativeTime(row.date) : formatDate(row.date) }}</p> }
                }
              </div>
            </li>
          }
        </ul>
      }
    </ng-template>
  `,
})
export class CatalogDashboardPage {
  private readonly api = inject(ServiceCatalogApi);
  private readonly categoriesApi = inject(CategoryApi);
  private readonly refs = inject(CatalogReferenceStore);

  protected readonly filters = signal<FilterValues>({});
  protected readonly validateOpen = signal(false);
  private readonly categories = rxResource({ stream: () => this.categoriesApi.list() });

  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'category', label: 'Service Category', type: 'multiselect', options: (this.categories.hasValue() ? this.categories.value() : []).filter((c) => !c.parentId).map((c) => ({ value: c.id, label: c.name })) },
    { key: 'type', label: 'Service Type', type: 'multiselect', options: toOptions(SERVICE_TYPES) },
    { key: 'status', label: 'Service Status', type: 'multiselect', options: toOptions(SERVICE_STATUSES) },
    { key: 'billing', label: 'Billable / Non-Billable', type: 'multiselect', options: toOptions(['Billable', 'Non-Billable'] as const) },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'contract', label: 'Contract', type: 'multiselect', options: this.refs.contractOptions() },
    { key: 'amc', label: 'AMC', type: 'multiselect', options: this.refs.amcOptions() },
    { key: 'range', label: 'Date Range', type: 'date-range' },
  ]);

  private readonly query = computed<CatalogDashboardFilters>(() => {
    const f = this.filters();
    const range = filterRange(f, 'range');
    return { categories: filterList(f, 'category'), types: filterList(f, 'type'), statuses: filterList(f, 'status'), billing: filterList(f, 'billing'), customers: filterList(f, 'customer'), contracts: filterList(f, 'contract'), amcs: filterList(f, 'amc'), from: range.from, to: range.to };
  });

  protected readonly dashboard = rxResource({ params: () => this.query(), stream: ({ params }) => this.api.dashboard(params) });
  protected readonly data = computed(() => (this.dashboard.hasValue() ? this.dashboard.value() : null));
  protected readonly charts = computed(() => {
    const d = this.data();
    const split = (items: readonly { label: string; value: number }[] = []) => ({ labels: items.map((i) => i.label), values: items.map((i) => i.value) });
    return { types: split(d?.requestsByType), categories: split(d?.servicesByCategory) };
  });

  protected readonly expiringDays = CATALOG_RULES.expiringWindowDays;
  protected readonly nearLimit = CATALOG_RULES.nearLimitPercent;
  protected readonly formatDate = formatDate;
  protected readonly relativeTime = relativeTime;

  protected tone(kind: string, status: string) {
    return kind === 'service' ? (SERVICE_STATUS_TONE[status as keyof typeof SERVICE_STATUS_TONE] ?? 'neutral') : (ENTITLEMENT_STATUS_TONE[status as keyof typeof ENTITLEMENT_STATUS_TONE] ?? 'neutral');
  }

  protected pct(value: number, max: number): number {
    return max ? Math.max(4, Math.round((value / max) * 100)) : 0;
  }

  protected export(): void {
    const d = this.data();
    if (!d) return;
    const k = d.kpis;
    downloadCsv(timestampedName('service-catalog-dashboard', 'csv'), ['Metric', 'Value'], [
      ['Total Services', k.totalServices], ['Active Services', k.activeServices], ['Inactive Services', k.inactiveServices], ['Service Categories', k.categories],
      ['Contract-Eligible Services', k.contractEligible], ['AMC-Eligible Services', k.amcEligible], ['Billable Services', k.billable], ['Non-Billable Services', k.nonBillable],
      ['Total Active Entitlements', k.activeEntitlements], ['Expiring Entitlements', k.expiringEntitlements], ['Entitlements with Usage Limits', k.withUsageLimits], ['Entitlements Near Limit', k.nearLimit],
      ...d.requestsByType.map((r) => [`Usage · ${r.label}`, r.value]),
      ...d.usageByCustomer.map((r) => [`Usage · ${r.label}`, r.value]),
    ]);
  }
}
