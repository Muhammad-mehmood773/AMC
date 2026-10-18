import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { toOptions } from '@shared/models/select-option';
import { type DataColumn, DataTable } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { DetailItem } from '@shared/ui/detail-item';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { MiniChart } from '@shared/ui/mini-chart';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { SlaHistoryTimeline } from '../components/sla-history-timeline';
import { SlaReferenceStore } from '../data/sla-reference.store';
import { SlaPerformanceApi } from '../data/sla.api';
import { formatMinutes } from '../models/display';
import { PERFORMANCE_DIMENSIONS, type PerformanceDimension, type PerformanceRow } from '../models/operations.model';

type Granularity = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly';

/** SRS 7.15 / 7.22 / 7.23 — historical SLA compliance, dimensions, trends and history. */
@Component({
  selector: 'amc-performance-page',
  imports: [DataTable, DatePicker, DetailItem, FormField, Icon, MiniChart, PageHeader, Panel, Select, Skeleton, SlaHistoryTimeline, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="SLA Performance & History" subtitle="Compliance measured from actual operational data — feeds Reports & Analytics, Customer Performance and Cost & Profitability." [breadcrumbs]="[{ label: 'SLA Management', path: '/app/sla/dashboard' }, { label: 'Performance & History' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
      </amc-page-header>
      <amc-tabs [items]="tabs" [active]="tab()" (activeChange)="tab.set($any($event))" />
      @if (tab() === 'history') {
        <amc-sla-history-timeline [slaId]="slaFilter()" />
      } @else {
        <section class="amc-card flex flex-wrap items-end gap-3 p-3">
          <amc-form-field label="SLA" for="pf-sla" class="min-w-64"><amc-select inputId="pf-sla" [options]="refs.slaOptions()" [(value)]="sla" [clearable]="true" placeholder="All SLAs" /></amc-form-field>
          <amc-form-field label="From" for="pf-from"><amc-date-picker inputId="pf-from" [(value)]="from" /></amc-form-field>
          <amc-form-field label="To" for="pf-to"><amc-date-picker inputId="pf-to" [(value)]="to" /></amc-form-field>
        </section>
        @if (summary(); as p) {
          <amc-panel title="Performance metrics" icon="bar-chart">
            <dl class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
              <amc-detail-item label="Total SLA Transactions" [value]="p.total" />
              <amc-detail-item label="SLA Met" [value]="p.met" />
              <amc-detail-item label="SLA Breached" [value]="p.breached" />
              <amc-detail-item label="SLA Compliance %" [value]="pct(p.compliance)" />
              <amc-detail-item label="Response Compliance %" [value]="pct(p.responseCompliance)" />
              <amc-detail-item label="Resolution Compliance %" [value]="pct(p.resolutionCompliance)" />
              <amc-detail-item label="Average Response Time" [value]="fm(p.avgResponseMinutes)" />
              <amc-detail-item label="Average Resolution Time" [value]="fm(p.avgResolutionMinutes)" />
              <amc-detail-item label="Average Breach Duration" [value]="fm(p.avgBreachMinutes)" />
              <amc-detail-item label="Number of Escalations" [value]="p.escalations" />
              <amc-detail-item label="Repeated Breaches" [value]="p.repeatedBreaches" />
              <amc-detail-item label="First Response Compliance" [value]="pct(p.firstResponseCompliance)" />
              <amc-detail-item label="On-Time Resolution %" [value]="pct(p.onTimeResolution)" />
              <amc-detail-item label="SLA Availability %" [value]="pct(p.availability)" />
              <amc-detail-item label="First-Time Resolution %" [value]="pct(p.firstTimeResolution)" />
            </dl>
          </amc-panel>
        } @else { <amc-skeleton class="h-40 w-full" /> }

        <div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <amc-panel title="Trend analysis" icon="trending-up" class="min-w-0">
            <div panelActions class="flex items-center gap-2">
              <amc-select inputId="pf-gran" class="w-36" [options]="granularityOptions" [(value)]="granularity" ariaLabel="Granularity" />
              <amc-select inputId="pf-metric" class="w-48" [options]="metricOptions" [(value)]="metric" ariaLabel="Metric" />
            </div>
            <div class="px-1 pb-2"><amc-mini-chart type="bar" [labels]="trendLabels()" [values]="trendValues()" [height]="220" [ariaLabel]="metric() + ' trend'" /></div>
          </amc-panel>
          <amc-panel title="Compliance by dimension" icon="layers" class="min-w-0">
            <div panelActions><amc-select inputId="pf-dim" class="w-44" [options]="dimensionOptions" [(value)]="dimension" ariaLabel="Dimension" /></div>
            <div class="px-1 pb-2"><amc-mini-chart type="bar" [labels]="dimLabels()" [values]="dimValues()" [height]="220" ariaLabel="Compliance by dimension" /></div>
          </amc-panel>
        </div>
        <section class="amc-card overflow-hidden">
          <p class="border-b border-line px-4 py-3 text-sm font-medium text-ink sm:px-5">Performance by {{ dimension() }}</p>
          <amc-data-table tableId="sla-performance" [rows]="rows()" [columns]="columns()" [trackBy]="trackByKey" [loading]="breakdown.isLoading()" [initialPageSize]="25" emptyIcon="bar-chart" emptyTitle="No data" emptyMessage="No SLA transactions in this period." />
        </section>
      }
    </div>
  `,
})
export class PerformancePage {
  private readonly api = inject(SlaPerformanceApi);
  protected readonly refs = inject(SlaReferenceStore);

  readonly slaId = input<string>();

  protected readonly tabs: TabItem[] = [{ id: 'performance', label: 'Performance', icon: 'bar-chart' }, { id: 'history', label: 'SLA History & Audit', icon: 'history' }];
  protected readonly tab = signal<'performance' | 'history'>('performance');
  protected readonly sla = linkedSignal<string | number | null>(() => this.slaId() ?? null);
  protected readonly slaFilter = computed(() => (this.sla() ? String(this.sla()) : null));
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly dimension = signal<string | number | null>('Customer');
  protected readonly granularity = signal<string | number | null>('Weekly');
  protected readonly metric = signal<string | number | null>('SLA Compliance %');
  private readonly summaryRes = rxResource({ params: () => this.slaFilter(), stream: ({ params }) => this.api.summary(params ?? undefined) });
  protected readonly breakdown = rxResource({ params: () => ({ d: this.dimension() as PerformanceDimension, from: this.from(), to: this.to(), sla: this.slaFilter() }), stream: ({ params }) => this.api.breakdown(params.d, { from: params.from, to: params.to }, params.sla ?? undefined) });
  private readonly trendRes = rxResource({ params: () => ({ g: this.granularity() as Granularity, sla: this.slaFilter() }), stream: ({ params }) => this.api.trend(params.g, params.sla ?? undefined) });
  protected readonly summary = computed(() => (this.summaryRes.hasValue() ? this.summaryRes.value() : null));
  protected readonly rows = computed(() => (this.breakdown.hasValue() ? this.breakdown.value() : []));
  private readonly trend = computed(() => (this.trendRes.hasValue() ? this.trendRes.value() : []));
  protected readonly trendLabels = computed(() => this.trend().map((t) => t.label));
  protected readonly trendValues = computed(() =>
    this.trend().map((t) => ({ 'SLA Compliance %': t.compliance ?? 0, 'Response Time (min)': t.avgResponseMinutes ?? 0, 'Resolution Time (min)': t.avgResolutionMinutes ?? 0, Breaches: t.breaches, Escalations: t.escalations })[String(this.metric())] ?? 0),
  );
  protected readonly dimLabels = computed(() => this.rows().slice(0, 12).map((r) => r.label.slice(0, 18)));
  protected readonly dimValues = computed(() => this.rows().slice(0, 12).map((r) => r.compliance ?? 0));
  protected readonly columns = computed<DataColumn<PerformanceRow>[]>(() => [
    { key: 'label', label: String(this.dimension()), value: (r) => r.label, mobile: 'title', sortable: true, width: 280 },
    { key: 'total', label: 'SLA Transactions', value: (r) => r.total, type: 'number', sortable: true, width: 130 },
    { key: 'met', label: 'Met', value: (r) => r.met, type: 'number', sortable: true, visibility: 'md', width: 90 },
    { key: 'breached', label: 'Breached', value: (r) => r.breached, type: 'number', sortable: true, visibility: 'md', width: 100 },
    { key: 'compliance', label: 'Compliance', value: (r) => (r.compliance === null ? '—' : `${r.compliance}%`), type: 'badge', tone: (r) => (r.compliance === null ? 'neutral' : r.compliance >= 95 ? 'ok' : r.compliance >= 85 ? 'warn' : 'danger'), sortable: true, mobile: 'badge', width: 120 },
    { key: 'response', label: 'Avg Response', value: (r) => formatMinutes(r.avgResponseMinutes), visibility: 'lg', width: 120 },
    { key: 'resolution', label: 'Avg Resolution', value: (r) => formatMinutes(r.avgResolutionMinutes), visibility: 'lg', width: 120 },
    { key: 'escalations', label: 'Escalations', value: (r) => r.escalations, type: 'number', visibility: 'xl', width: 110 },
  ]);
  protected readonly trackByKey = (r: PerformanceRow) => r.key;
  protected readonly dimensionOptions = toOptions(PERFORMANCE_DIMENSIONS);
  protected readonly granularityOptions = toOptions(['Daily', 'Weekly', 'Monthly', 'Quarterly'] as const);
  protected readonly metricOptions = toOptions(['SLA Compliance %', 'Response Time (min)', 'Resolution Time (min)', 'Breaches', 'Escalations'] as const);
  protected readonly fm = formatMinutes;

  protected pct(v: number | null | undefined): string {
    return v === null || v === undefined ? '—' : `${v}%`;
  }

  protected export(): void {
    downloadCsv(timestampedName(`sla-performance-${String(this.dimension()).toLowerCase()}`, 'csv'), [String(this.dimension()), 'SLA Transactions', 'Met', 'Breached', 'Compliance %', 'Avg Response (min)', 'Avg Resolution (min)', 'Escalations'],
      this.rows().map((r) => [r.label, r.total, r.met, r.breached, r.compliance, r.avgResponseMinutes, r.avgResolutionMinutes, r.escalations]));
  }
}
