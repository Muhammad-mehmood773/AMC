import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { toOptions } from '@shared/models/select-option';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { DetailItem } from '@shared/ui/detail-item';
import { Dialog } from '@shared/ui/dialog';
import { EmptyState } from '@shared/ui/empty-state';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon, type IconName } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { MiniChart } from '@shared/ui/mini-chart';
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { formatCurrency, formatDate, formatNumber } from '@shared/utils/format';
import { ServiceHistoryApi } from '../data/asset.api';
import { SERVICE_RESULT_TONE, SERVICE_TYPE_ICON, SERVICE_TYPE_TONE, TONE_CLASSES } from '../models/display';
import { FAILURE_SERVICE_TYPES, MAINTENANCE_SERVICE_TYPES, SERVICE_RESULTS, SERVICE_TYPES, type ServiceRecordListItem } from '../models/history.model';
import { partsColumns } from './asset-columns';

type View = 'timeline' | 'records' | 'technicians' | 'parts' | 'failures' | 'maintenance' | 'costs';

const VIEWS: readonly { id: View; label: string; icon: IconName }[] = [
  { id: 'timeline', label: 'Timeline', icon: 'history' },
  { id: 'records', label: 'All Services', icon: 'list' },
  { id: 'technicians', label: 'Technicians', icon: 'users' },
  { id: 'parts', label: 'Parts Consumption', icon: 'box' },
  { id: 'failures', label: 'Failures', icon: 'alert-triangle' },
  { id: 'maintenance', label: 'Maintenance', icon: 'calendar-check' },
  { id: 'costs', label: 'Costs', icon: 'wallet' },
];

/** SRS 3.13 — complete chronological service record of one asset or the installed base. */
@Component({
  selector: 'amc-service-history-view',
  imports: [DataTable, DetailItem, Dialog, EmptyState, FilterBar, Icon, KpiCard, MiniChart, RouterLink, Skeleton, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-4' },
  template: `
    <section class="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Service indicators">
      <amc-kpi-card label="Service Visits" icon="wrench" tone="brand" [loading]="!records.hasValue()" [value]="filtered().length" [hint]="lastVisit()" />
      <amc-kpi-card label="Failures" icon="alert-triangle" tone="danger" [loading]="!records.hasValue()" [value]="failures().length" hint="Corrective, breakdown & emergency" />
      <amc-kpi-card label="Maintenance Visits" icon="calendar-check" tone="ok" [loading]="!records.hasValue()" [value]="maintenance().length" hint="Preventive, inspection & calibration" />
      <amc-kpi-card label="Parts Used" icon="box" tone="accent" [loading]="!records.hasValue()" [value]="partsQty()" [hint]="partRows().length + ' part lines'" />
      <amc-kpi-card label="Service Cost" icon="wallet" tone="info" [loading]="!records.hasValue()" [value]="formatCurrency(totalCost(), currency(), true)" hint="Labor + parts" />
    </section>

    <section class="amc-card overflow-hidden">
      <div class="flex flex-wrap gap-1 border-b border-line px-3 py-2 sm:px-4" role="tablist" aria-label="Service history views">
        @for (v of views; track v.id) {
          <button type="button" role="tab" class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors" [class]="view() === v.id ? 'bg-brand-subtle text-brand' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'" [attr.aria-selected]="view() === v.id" (click)="view.set(v.id)">
            <amc-icon [name]="v.icon" [size]="13" /> {{ v.label }}
          </button>
        }
      </div>
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar searchPlaceholder="Search problem, work performed, WO, SR or technician…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters">
          <ng-container actions>
            <button type="button" class="amc-btn-ghost" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
          </ng-container>
        </amc-filter-bar>
      </div>

      @switch (view()) {
        @case ('timeline') {
          @if (!records.hasValue()) {
            <div class="space-y-4 p-5">@for (i of [1, 2, 3, 4]; track i) { <amc-skeleton class="h-12 w-full" /> }</div>
          } @else if (!filtered().length) {
            <amc-empty-state icon="history" title="No services found" message="Services performed on the asset will appear here." />
          } @else {
            <div class="px-4 py-2 sm:px-6">
              @for (group of months(); track group.key) {
                <div class="pt-3 pb-2"><h3 class="amc-overline">{{ group.label }}</h3></div>
                <ol class="relative mb-2 ml-4 border-l border-line">
                  @for (r of group.items; track r.id) {
                    <li class="relative pb-5 pl-7 last:pb-3">
                      <span class="absolute top-0 -left-4 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-surface" [class]="typeTone(r)"><amc-icon [name]="typeIcon[r.serviceType]" [size]="14" /></span>
                      <button type="button" class="w-full text-left" (click)="open(r)">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p class="text-sm font-semibold text-ink">{{ r.serviceType }}</p>
                          <amc-status-badge [label]="r.result" [tone]="resultTone[r.result]" />
                          @if (r.warrantyService) { <amc-status-badge label="Warranty" tone="info" [dot]="false" /> }
                          @if (r.coveredBy) { <amc-status-badge [label]="'Covered · ' + r.coveredBy" tone="ok" [dot]="false" /> }
                        </div>
                        <p class="mt-0.5 text-sm text-ink-muted">{{ r.problemReported }} — {{ r.workPerformed }}</p>
                        <p class="mt-1 text-xs text-ink-subtle">
                          {{ formatDate(r.date) }} · {{ r.technician }}{{ r.workOrder ? ' · ' + r.workOrder : '' }}{{ r.partsCount ? ' · ' + r.partsCount + ' parts' : '' }} · {{ formatCurrency(r.serviceCost, r.currency) }}
                          @if (!assetId()) { · {{ r.assetCode }} {{ r.assetName }} }
                        </p>
                      </button>
                    </li>
                  }
                </ol>
              }
            </div>
          }
        }
        @case ('technicians') {
          <amc-data-table [tableId]="'svc-technicians'" [entity]="{ singular: 'technician', plural: 'technicians' }" [rows]="technicians()" [columns]="technicianCols" [trackBy]="trackByName" [loading]="records.isLoading()" emptyIcon="users" emptyTitle="No technician history" emptyMessage="" />
        }
        @case ('parts') {
          <div class="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div class="min-w-0 overflow-hidden rounded-xl border border-line">
              <amc-data-table [tableId]="'svc-parts'" [entity]="{ singular: 'part line', plural: 'part lines' }" [rows]="partRows()" [columns]="partCols" [trackBy]="trackById" [loading]="records.isLoading()" emptyIcon="box" emptyTitle="No parts consumed" emptyMessage="" />
            </div>
            <div class="rounded-xl border border-line p-4">
              <h3 class="text-sm font-semibold text-ink">Most used parts</h3>
              <ul class="mt-3 space-y-3">
                @for (p of topParts(); track p.name) {
                  <li>
                    <div class="flex justify-between gap-2 text-sm"><span class="truncate text-ink">{{ p.name }}</span><span class="tabular-nums text-ink-muted">{{ p.qty }}</span></div>
                    <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full rounded-full bg-brand" [style.width.%]="p.pct"></div></div>
                  </li>
                } @empty {
                  <li class="text-sm text-ink-muted">No parts consumed.</li>
                }
              </ul>
            </div>
          </div>
        }
        @case ('costs') {
          <div class="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
            <div class="rounded-xl border border-line p-4">
              <h3 class="text-sm font-semibold text-ink">Service cost by year</h3>
              <amc-mini-chart class="mt-3" type="bar" [labels]="costByYear().labels" [values]="costByYear().values" [height]="220" ariaLabel="Service cost by year" />
            </div>
            <div class="rounded-xl border border-line p-4">
              <h3 class="text-sm font-semibold text-ink">Cost by service type</h3>
              <ul class="mt-3 space-y-3">
                @for (row of costByType(); track row.type) {
                  <li>
                    <div class="flex justify-between gap-2 text-sm"><span class="text-ink">{{ row.type }}</span><span class="tabular-nums text-ink-muted">{{ formatCurrency(row.cost, currency(), true) }}</span></div>
                    <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full rounded-full bg-brand" [style.width.%]="row.pct"></div></div>
                  </li>
                }
              </ul>
              <dl class="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
                <amc-detail-item label="Labor Cost" [value]="formatCurrency(laborCost(), currency())" />
                <amc-detail-item label="Parts Cost" [value]="formatCurrency(totalCost() - laborCost(), currency())" />
              </dl>
            </div>
          </div>
        }
        @default {
          <amc-data-table
            [tableId]="assetId() ? 'asset-service-history' : 'service-history'"
            [entity]="{ singular: 'service', plural: 'services' }"
            [totalCount]="rows().length"
            [rows]="tableRows()"
            [columns]="columns()"
            [trackBy]="trackById"
            [loading]="records.isLoading()"
            [error]="records.error() ? 'Service history could not be loaded.' : null"
            [actions]="rowActions"
            emptyIcon="wrench"
            emptyTitle="No services found"
            emptyMessage="Try a different search or clear the filters."
            (action)="onAction($event)"
            (retry)="records.reload()"
          />
        }
      }
    </section>

    <amc-dialog size="lg" [title]="selected() ? selected()!.serviceType + ' · ' + formatDate(selected()!.date) : 'Service'" [description]="selected() ? selected()!.assetCode + ' · ' + selected()!.assetName : ''" [(open)]="detailsOpen">
      @if (selected(); as r) {
        <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <amc-detail-item label="Service Date" [value]="formatDate(r.date)" />
          <amc-detail-item label="Service Type" [value]="r.serviceType" />
          <div><dt class="text-xs font-medium text-ink-muted">Service Result</dt><dd class="mt-1"><amc-status-badge [label]="r.result" [tone]="resultTone[r.result]" /></dd></div>
          <amc-detail-item label="Service Request" [value]="r.serviceRequest" [mono]="true" />
          <amc-detail-item label="Work Order" [value]="r.workOrder" [mono]="true" />
          <amc-detail-item label="Technician" [value]="r.technician" />
          <amc-detail-item class="col-span-2 sm:col-span-3" label="Service Location" [value]="r.serviceLocation" />
          <amc-detail-item class="col-span-2 sm:col-span-3" label="Problem Reported" [value]="r.problemReported" />
          <amc-detail-item class="col-span-2 sm:col-span-3" label="Diagnosis" [value]="r.diagnosis" />
          <amc-detail-item class="col-span-2 sm:col-span-3" label="Work Performed" [value]="r.workPerformed" />
          <amc-detail-item label="Component" [value]="r.componentName ?? 'Whole asset'" />
          <amc-detail-item label="Labor" [value]="r.laborHours + ' h · ' + formatCurrency(r.laborCost, r.currency)" />
          <amc-detail-item label="Meter Reading" [value]="r.meterReading === null ? null : formatNumber(r.meterReading)" />
          <amc-detail-item label="Customer Confirmation" [value]="r.customerConfirmation" />
          <amc-detail-item label="Warranty Service" [value]="r.warrantyService ? 'Yes' : 'No'" />
          <amc-detail-item label="Covered By" [value]="r.coveredBy ?? 'Chargeable'" />
        </dl>
        <h3 class="mt-5 text-sm font-semibold text-ink">Parts used</h3>
        <ul class="mt-2 divide-y divide-line rounded-xl border border-line">
          @for (p of r.partsUsed; track p.partNumber + $index) {
            <li class="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
              <span class="min-w-0 truncate text-ink">{{ p.name }} <span class="font-mono text-xs text-ink-muted">{{ p.partNumber }}</span></span>
              <span class="shrink-0 tabular-nums text-ink-muted">{{ p.quantity }} × {{ formatCurrency(p.unitCost, r.currency) }}</span>
            </li>
          } @empty {
            <li class="px-3.5 py-3 text-center text-sm text-ink-muted">No parts used.</li>
          }
        </ul>
        <p class="mt-3 text-right text-sm font-semibold text-ink">Service cost: {{ formatCurrency(r.serviceCost, r.currency) }}</p>
        @if (!assetId()) {
          <a class="amc-link mt-2 inline-block text-sm" [routerLink]="['/app/assets', r.assetId]" [queryParams]="{ tab: 'service-history' }">Open asset service history</a>
        }
      }
    </amc-dialog>
  `,
})
export class ServiceHistoryView {
  private readonly api = inject(ServiceHistoryApi);

  readonly assetId = input<string | null>(null);
  readonly refreshKey = input(0);

  protected readonly views = VIEWS;
  protected readonly view = signal<View>('timeline');
  protected readonly typeIcon = SERVICE_TYPE_ICON;
  protected readonly resultTone = SERVICE_RESULT_TONE;
  protected readonly formatDate = formatDate;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatNumber = formatNumber;
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly trackByName = (r: { name: string }) => r.name;

  protected readonly records = rxResource({ params: () => ({ assetId: this.assetId() ?? undefined, key: this.refreshKey() }), stream: ({ params }) => this.api.list({ assetId: params.assetId }) });
  protected readonly rows = computed(() => (this.records.hasValue() ? this.records.value() : []));

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'type', label: 'Service Type', type: 'multiselect', options: toOptions(SERVICE_TYPES) },
    { key: 'result', label: 'Service Result', type: 'multiselect', options: toOptions(SERVICE_RESULTS) },
    { key: 'technician', label: 'Technician', type: 'multiselect', options: toOptions([...new Set(this.rows().map((r) => r.technician))].sort()) },
    { key: 'coverage', label: 'Coverage', type: 'multiselect', options: toOptions(['Covered', 'Warranty', 'Chargeable'] as const) },
    { key: 'date', label: 'Service Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (r) =>
        (!term || `${r.problemReported} ${r.workPerformed} ${r.diagnosis} ${r.workOrder ?? ''} ${r.serviceRequest ?? ''} ${r.technician} ${r.assetCode} ${r.assetName}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'type', r.serviceType) &&
        matchesAny(f, 'result', r.result) &&
        matchesAny(f, 'technician', r.technician) &&
        matchesAny(f, 'coverage', r.warrantyService ? 'Warranty' : r.coveredBy ? 'Covered' : 'Chargeable') &&
        withinRange(f, 'date', r.date),
    );
  });

  protected readonly failures = computed(() => this.filtered().filter((r) => FAILURE_SERVICE_TYPES.includes(r.serviceType) || r.serviceType === 'Warranty Service'));
  protected readonly maintenance = computed(() => this.filtered().filter((r) => MAINTENANCE_SERVICE_TYPES.includes(r.serviceType)));
  protected readonly tableRows = computed(() => (this.view() === 'failures' ? this.failures() : this.view() === 'maintenance' ? this.maintenance() : this.filtered()));
  protected readonly totalCost = computed(() => this.filtered().reduce((s, r) => s + r.serviceCost, 0));
  protected readonly laborCost = computed(() => this.filtered().reduce((s, r) => s + r.laborCost, 0));
  protected readonly partsQty = computed(() => this.filtered().reduce((s, r) => s + r.partsCount, 0));
  protected readonly currency = computed(() => this.rows()[0]?.currency ?? 'SAR');
  protected readonly lastVisit = computed(() => (this.filtered()[0] ? `Last ${formatDate(this.filtered()[0].date)}` : 'No visits'));

  protected readonly months = computed(() => {
    const groups: { key: string; label: string; items: ServiceRecordListItem[] }[] = [];
    for (const r of this.filtered().slice(0, 200)) {
      const key = r.date.slice(0, 7);
      let group = groups.at(-1);
      if (group?.key !== key) {
        group = { key, label: new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), items: [] };
        groups.push(group);
      }
      group.items.push(r);
    }
    return groups;
  });

  protected readonly technicians = computed(() => {
    const map = new Map<string, { name: string; visits: number; failures: number; hours: number; last: string }>();
    for (const r of this.filtered()) {
      const row = map.get(r.technician) ?? { name: r.technician, visits: 0, failures: 0, hours: 0, last: r.date };
      row.visits++;
      row.hours += r.laborHours;
      if (FAILURE_SERVICE_TYPES.includes(r.serviceType)) row.failures++;
      if (r.date > row.last) row.last = r.date;
      map.set(r.technician, row);
    }
    return [...map.values()].sort((a, b) => b.visits - a.visits);
  });
  protected readonly technicianCols: DataColumn<{ name: string; visits: number; failures: number; hours: number; last: string }>[] = [
    { key: 'name', label: 'Technician', value: (t) => t.name, sortable: true, mobile: 'title' },
    { key: 'visits', label: 'Visits', value: (t) => t.visits, type: 'number', sortable: true, mobile: 'meta' },
    { key: 'failures', label: 'Failure Calls', value: (t) => t.failures, type: 'number', sortable: true },
    { key: 'hours', label: 'Labor Hours', value: (t) => t.hours, type: 'number', sortable: true },
    { key: 'last', label: 'Last Visit', value: (t) => t.last, type: 'date', sortable: true, mobile: 'meta' },
  ];

  protected readonly partRows = computed(() =>
    this.filtered().flatMap((r) => r.partsUsed.map((p, i) => ({ ...p, id: `${r.id}-${i}`, serviceRecordId: r.id, date: r.date, serviceType: r.serviceType, workOrder: r.workOrder, technician: r.technician, totalCost: p.quantity * p.unitCost, currency: r.currency }))),
  );
  protected readonly partCols = partsColumns();
  protected readonly topParts = computed(() => {
    const map = new Map<string, number>();
    for (const p of this.partRows()) map.set(p.name, (map.get(p.name) ?? 0) + p.quantity);
    const list = [...map].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 6);
    const max = list[0]?.qty ?? 1;
    return list.map((p) => ({ ...p, pct: Math.max(4, Math.round((p.qty / max) * 100)) }));
  });

  protected readonly costByYear = computed(() => {
    const map = new Map<string, number>();
    for (const r of [...this.filtered()].reverse()) map.set(r.date.slice(0, 4), (map.get(r.date.slice(0, 4)) ?? 0) + r.serviceCost);
    return { labels: [...map.keys()], values: [...map.values()].map((v) => Math.round(v)) };
  });
  protected readonly costByType = computed(() => {
    const map = new Map<string, number>();
    for (const r of this.filtered()) map.set(r.serviceType, (map.get(r.serviceType) ?? 0) + r.serviceCost);
    const list = [...map].map(([type, cost]) => ({ type, cost })).sort((a, b) => b.cost - a.cost);
    const max = list[0]?.cost || 1;
    return list.map((r) => ({ ...r, pct: Math.max(3, Math.round((r.cost / max) * 100)) }));
  });

  protected readonly columns = computed<DataColumn<ServiceRecordListItem>[]>(() => [
    { key: 'date', label: 'Service Date', value: (r) => r.date, type: 'date', sortable: true, mobile: 'meta', width: 120 },
    ...(this.assetId() ? [] : [{ key: 'asset', label: 'Asset', value: (r: ServiceRecordListItem) => r.assetName, secondary: (r: ServiceRecordListItem) => `${r.assetCode} · ${r.customerName ?? ''}`, link: (r: ServiceRecordListItem) => `/app/assets/${r.assetId}`, sortable: true, mobile: 'title' as const, width: 220 }]),
    { key: 'type', label: 'Service Type', value: (r) => r.serviceType, secondary: (r) => r.problemReported, sortable: true, mobile: this.assetId() ? 'title' : 'meta', width: 240 },
    { key: 'wo', label: 'Work Order', value: (r) => r.workOrder, type: 'mono', secondary: (r) => r.serviceRequest, visibility: 'lg', width: 120 },
    { key: 'technician', label: 'Technician', value: (r) => r.technician, sortable: true, visibility: 'md', width: 150 },
    { key: 'work', label: 'Work Performed', value: (r) => r.workPerformed, visibility: '2xl', width: 260 },
    { key: 'parts', label: 'Parts', value: (r) => r.partsCount, type: 'number', sortable: true, visibility: 'xl', width: 80 },
    { key: 'labor', label: 'Labor (h)', value: (r) => r.laborHours, type: 'number', visibility: '2xl', width: 90 },
    { key: 'meter', label: 'Meter', value: (r) => r.meterReading, type: 'number', visibility: '2xl', width: 100 },
    { key: 'confirmation', label: 'Customer Confirmation', value: (r) => r.customerConfirmation, visibility: '2xl', width: 150 },
    { key: 'cost', label: 'Service Cost', value: (r) => r.serviceCost, type: 'currency', currency: (r) => r.currency, sortable: true, visibility: 'lg', width: 130 },
    { key: 'result', label: 'Result', value: (r) => r.result, type: 'badge', tone: (r) => SERVICE_RESULT_TONE[r.result], sortable: true, mobile: 'badge', width: 140 },
  ]);
  protected readonly rowActions = () => [{ id: 'view', label: 'View Service', icon: 'eye' as const }];

  protected readonly selected = signal<ServiceRecordListItem | null>(null);
  protected readonly detailsOpen = signal(false);

  protected typeTone(r: ServiceRecordListItem): string {
    return TONE_CLASSES[SERVICE_TYPE_TONE[r.serviceType]];
  }

  protected open(r: ServiceRecordListItem): void {
    this.selected.set(r);
    this.detailsOpen.set(true);
  }

  protected onAction({ row }: RowAction<ServiceRecordListItem>): void {
    this.open(row);
  }

  protected export(): void {
    downloadCsv(
      timestampedName('asset-service-history', 'csv'),
      ['Service Date', 'Asset ID', 'Asset', 'Service Type', 'Service Request', 'Work Order', 'Technician', 'Service Location', 'Problem Reported', 'Diagnosis', 'Work Performed', 'Parts Used', 'Labor (h)', 'Service Result', 'Meter Reading', 'Customer Confirmation', 'Warranty Service', 'Covered By', 'Service Cost'],
      this.filtered().map((r) => [
        r.date.slice(0, 10), r.assetCode, r.assetName, r.serviceType, r.serviceRequest, r.workOrder, r.technician, r.serviceLocation, r.problemReported, r.diagnosis, r.workPerformed,
        r.partsUsed.map((p) => `${p.quantity}× ${p.name}`).join('; '), r.laborHours, r.result, r.meterReading, r.customerConfirmation, r.warrantyService ? 'Yes' : 'No', r.coveredBy, r.serviceCost,
      ]),
    );
  }
}
