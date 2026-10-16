import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { toOptions } from '@shared/models/select-option';
import { EmptyState } from '@shared/ui/empty-state';
import { ErrorState } from '@shared/ui/error-state';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon, type IconName } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { MiniChart } from '@shared/ui/mini-chart';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, filterRange } from '@shared/utils/filters';
import { formatDate, relativeTime } from '@shared/utils/format';
import { AssetPickerDialog } from '../../components/asset-picker-dialog';
import { type AssetHandoffAction, AssetHandoff } from '../../data/asset-handoff.service';
import { AssetReferenceStore } from '../../data/asset-reference.store';
import { AssetApi } from '../../data/asset.api';
import { ASSET_RULES } from '../../data/asset.config';
import { ASSET_LOOKUP } from '../../data/asset.lookups';
import { ASSET_STATUSES, type AssetListItem, type AssetStatus } from '../../models/asset.model';
import { COVERAGE_STATES } from '../../models/coverage.model';
import type { AssetDashboardFilters, DashboardAssetRow } from '../../models/dashboard.model';
import { ASSET_STATUS_TONE } from '../../models/display';
import { WARRANTY_STATUSES } from '../../models/warranty.model';

interface WidgetDef {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
}

const STORAGE_KEY = 'amc.asset-dashboard.widgets';
const WIDGETS: readonly WidgetDef[] = [
  { id: 'kpis', label: 'KPI Cards', icon: 'layout-dashboard' },
  { id: 'charts', label: 'Charts', icon: 'bar-chart' },
  { id: 'recently-added', label: 'Recently Added', icon: 'box' },
  { id: 'recently-installed', label: 'Recently Installed', icon: 'wrench' },
  { id: 'warranty-expiry', label: 'Warranty Expiry', icon: 'shield-check' },
  { id: 'upcoming-maintenance', label: 'Upcoming Maintenance', icon: 'calendar-check' },
  { id: 'open-requests', label: 'Open Service Requests', icon: 'ticket' },
  { id: 'open-work-orders', label: 'Open Work Orders', icon: 'wrench' },
  { id: 'repeated-failures', label: 'Repeated Failures', icon: 'alert-triangle' },
  { id: 'attention', label: 'Requiring Attention', icon: 'alert-circle' },
  { id: 'transferred', label: 'Recently Transferred', icon: 'arrow-right' },
];

@Component({
  selector: 'amc-asset-dashboard-page',
  imports: [AssetPickerDialog, EmptyState, ErrorState, FilterBar, Icon, KpiCard, MiniChart, NgTemplateOutlet, PageHeader, Panel, RouterLink, Skeleton, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './asset-dashboard.page.html',
})
export class AssetDashboardPage {
  private readonly api = inject(AssetApi);
  private readonly handoff = inject(AssetHandoff);
  protected readonly refs = inject(AssetReferenceStore);
  private readonly lookupValues = inject(LookupValuesStore);

  protected readonly filters = signal<FilterValues>({});
  private readonly assets = rxResource({ stream: () => this.api.list() });

  protected readonly filterFields = computed<FilterField[]>(() => {
    const customers = filterList(this.filters(), 'customer');
    const assets = this.assets.hasValue() ? this.assets.value() : [];
    const unique = (values: string[]) => toOptions([...new Set(values.filter(Boolean))].sort());
    return [
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.allSiteOptions().filter((s) => !customers.length || customers.includes(this.refs.site(String(s.value))?.customerId ?? '')) },
      { key: 'category', label: 'Asset Category', type: 'multiselect', options: this.lookupValues.options(ASSET_LOOKUP.category)() },
      { key: 'type', label: 'Asset Type', type: 'multiselect', options: this.lookupValues.options(ASSET_LOOKUP.type)() },
      { key: 'manufacturer', label: 'Manufacturer', type: 'multiselect', options: this.lookupValues.options(ASSET_LOOKUP.manufacturer)() },
      { key: 'model', label: 'Model', type: 'multiselect', options: unique(assets.map((a) => a.model)) },
      { key: 'status', label: 'Asset Status', type: 'multiselect', options: toOptions(ASSET_STATUSES) },
      { key: 'warranty', label: 'Warranty Status', type: 'multiselect', options: toOptions([...WARRANTY_STATUSES, 'No Warranty']) },
      { key: 'coverage', label: 'Contract / AMC Status', type: 'multiselect', options: toOptions(COVERAGE_STATES) },
      { key: 'region', label: 'Service Region', type: 'multiselect', options: this.refs.regionOptions() },
      { key: 'installed', label: 'Installation Date', type: 'date-range' },
      { key: 'maintenance', label: 'Maintenance Due Date', type: 'date-range' },
    ];
  });

  private readonly query = computed<AssetDashboardFilters>(() => {
    const f = this.filters();
    const installed = filterRange(f, 'installed');
    const maintenance = filterRange(f, 'maintenance');
    return {
      customers: filterList(f, 'customer'),
      sites: filterList(f, 'site'),
      categories: filterList(f, 'category'),
      types: filterList(f, 'type'),
      manufacturers: filterList(f, 'manufacturer'),
      models: filterList(f, 'model'),
      statuses: filterList(f, 'status'),
      warrantyStatuses: filterList(f, 'warranty'),
      coverageStates: filterList(f, 'coverage'),
      regions: filterList(f, 'region'),
      installedFrom: installed.from,
      installedTo: installed.to,
      maintenanceFrom: maintenance.from,
      maintenanceTo: maintenance.to,
    };
  });

  protected readonly dashboard = rxResource({ params: () => this.query(), stream: ({ params }) => this.api.dashboard(params) });
  protected readonly data = computed(() => (this.dashboard.hasValue() ? this.dashboard.value() : null));

  protected readonly charts = computed(() => {
    const d = this.data();
    const split = (items: readonly { label: string; value: number }[] = []) => ({ labels: items.map((i) => i.label), values: items.map((i) => i.value) });
    return { status: split(d?.byStatus), category: split(d?.byCategory), criticality: split(d?.byCriticality) };
  });

  /** Query params that keep the dashboard's main filters when drilling into the list. */
  protected readonly listParams = computed(() => {
    const q = this.query();
    const params: Record<string, string> = {};
    if (q.customers.length === 1) params['customer'] = q.customers[0];
    if (q.categories.length === 1) params['category'] = q.categories[0];
    return params;
  });

  protected link(extra: Record<string, string>): Record<string, string> {
    return { ...this.listParams(), ...extra };
  }

  protected readonly statusTone = ASSET_STATUS_TONE;
  protected readonly formatDate = formatDate;
  protected readonly relativeTime = relativeTime;
  protected readonly skeletons = [1, 2, 3, 4];
  protected readonly widgetDefs = WIDGETS;
  protected readonly expiringDays = ASSET_RULES.warrantyExpiringDays;
  protected readonly pmWindow = ASSET_RULES.pmDueWindowDays;

  protected tone(status: string) {
    return ASSET_STATUS_TONE[status as AssetStatus] ?? 'neutral';
  }

  protected percent(part: number, total: number): string {
    return total ? `${Math.round((part / total) * 100)}% of assets` : '—';
  }

  // ----- Widgets customisation ------------------------------------------------

  protected readonly visibleWidgets = signal<Set<string>>(this.loadVisible());
  protected readonly customizeOpen = signal(false);

  constructor() {
    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.visibleWidgets()])));
  }

  private loadVisible(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    return new Set(WIDGETS.map((w) => w.id));
  }

  protected isVisible(id: string): boolean {
    return this.visibleWidgets().has(id);
  }

  protected toggleWidget(id: string): void {
    this.visibleWidgets.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected resetWidgets(): void {
    this.visibleWidgets.set(new Set(WIDGETS.map((w) => w.id)));
  }

  // ----- Actions ----------------------------------------------------------------

  protected readonly pickerOpen = signal(false);
  protected readonly pickerAction = signal<AssetHandoffAction>('Create Service Request');

  protected startAction(action: AssetHandoffAction): void {
    this.pickerAction.set(action);
    this.pickerOpen.set(true);
  }

  protected onPicked(asset: AssetListItem): void {
    this.handoff.open(this.pickerAction(), { id: asset.id, code: asset.code, name: asset.name, customerName: asset.customerName, siteName: asset.siteName });
  }

  protected refresh(): void {
    this.dashboard.reload();
    this.assets.reload();
  }

  protected export(): void {
    const d = this.data();
    if (!d) return;
    const k = d.kpis;
    const widget = (title: string, rows: readonly DashboardAssetRow[]) => rows.map((r) => [title, r.code, r.name, r.customerName, r.siteName, r.status, r.date ? r.date.slice(0, 10) : '', r.detail]);
    downloadCsv(timestampedName('asset-dashboard', 'csv'), ['Section', 'Metric / Asset ID', 'Value / Asset', 'Customer', 'Site', 'Status', 'Date', 'Detail'], [
      ...([
        ['Total Assets', k.total], ['Active Assets', k.active], ['Inactive Assets', k.inactive], ['Installed Assets', k.installed], ['Under Warranty', k.underWarranty],
        ['Warranty Expiring', k.warrantyExpiring], ['Under AMC', k.underAmc], ['Assets with Active SLA', k.withActiveSla], ['Assets Requiring Maintenance', k.requiringMaintenance],
        ['Assets with Open Service Requests', k.withOpenServiceRequests], ['Assets with Open Work Orders', k.withOpenWorkOrders], ['Assets Due for Preventive Maintenance', k.duePreventiveMaintenance],
        ['Assets Under Breakdown', k.underBreakdown], ['Retired / Decommissioned Assets', k.retired],
      ] as const).map(([label, value]) => ['KPI', label, value, '', '', '', '', '']),
      ...widget('Warranty Expiry', d.warrantyExpiry),
      ...widget('Upcoming Maintenance', d.upcomingMaintenance),
      ...widget('Repeated Failures', d.repeatedFailures),
      ...widget('Requiring Attention', d.requiringAttention),
    ]);
  }
}
