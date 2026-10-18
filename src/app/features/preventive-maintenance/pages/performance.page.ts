import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
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
import { formatCurrency } from '@shared/utils/format';
import { PlanActionHost } from '../components/plan-action-host';
import { PmHistoryTimeline } from '../components/pm-history-timeline';
import { PmReferenceStore } from '../data/pm-reference.store';
import { PlanApi, PmPerformanceApi } from '../data/pm.api';
import { formatDuration } from '../models/display';
import type { AssetPerformanceRow } from '../models/operations.model';
import type { PlanListItem } from '../models/plan.model';

/** SRS 8.27 performance, 8.28 history & audit, 8.29 plan review. */
@Component({
  selector: 'amc-pm-performance-page',
  imports: [DataTable, DetailItem, FormField, Icon, MiniChart, PageHeader, Panel, PlanActionHost, PmHistoryTimeline, Select, Skeleton, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Maintenance History & Performance" subtitle="Compliance, completion, failures, cost and asset performance — feeds Reports, Asset, AMC, SLA and Cost & Profitability." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'History & Performance' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
      </amc-page-header>
      <amc-tabs [items]="tabs" [active]="tab()" (activeChange)="tab.set($any($event))" />
      @switch (tab()) {
        @case ('performance') {
          <section class="amc-card flex flex-wrap items-end gap-3 p-3"><amc-form-field label="Maintenance Plan" for="pp-plan" class="min-w-72"><amc-select inputId="pp-plan" [options]="refs.planOptions()" [(value)]="plan" [clearable]="true" placeholder="All plans" /></amc-form-field></section>
          @if (summary(); as s) {
            <amc-panel title="Performance metrics" icon="bar-chart">
              <dl class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-8">
                <amc-detail-item label="Planned" [value]="s.planned" />
                <amc-detail-item label="Scheduled" [value]="s.scheduled" />
                <amc-detail-item label="Completed" [value]="s.completed" />
                <amc-detail-item label="Due" [value]="s.due" />
                <amc-detail-item label="Overdue" [value]="s.overdue" />
                <amc-detail-item label="Missed" [value]="s.missed" />
                <amc-detail-item label="Rescheduled" [value]="s.rescheduled" />
                <amc-detail-item label="Compliance %" [value]="pct(s.compliance)" />
                <amc-detail-item label="On-Time Completion %" [value]="pct(s.onTime)" />
                <amc-detail-item label="Avg Completion Time" [value]="fd(s.avgCompletionMinutes)" />
                <amc-detail-item label="Repeat Failure Rate" [value]="s.repeatFailureRate + '%'" />
                <amc-detail-item label="Corrective Actions" [value]="s.correctiveGenerated" />
                <amc-detail-item label="Preventive vs Corrective" [value]="s.preventiveVsCorrective" />
                <amc-detail-item label="Parts Consumption" [value]="s.partsConsumption" />
                <amc-detail-item label="Maintenance Cost" [value]="formatCurrency(s.cost, 'SAR', true)" />
                <amc-detail-item label="Technician Hours" [value]="s.technicianHours" />
              </dl>
            </amc-panel>
          } @else { <amc-skeleton class="h-36 w-full" /> }
          <div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <amc-panel title="Breakdowns by asset" description="Top 10" icon="alert-triangle" class="min-w-0"><div class="px-1 pb-2"><amc-mini-chart type="bar" [labels]="topLabels()" [values]="topBreakdowns()" [height]="200" ariaLabel="Breakdowns by asset" /></div></amc-panel>
            <amc-panel title="Maintenance cost by asset" description="Top 10 (SAR)" icon="wallet" class="min-w-0"><div class="px-1 pb-2"><amc-mini-chart type="bar" [labels]="costLabels()" [values]="costValues()" [height]="200" ariaLabel="Cost by asset" /></div></amc-panel>
          </div>
          <section class="amc-card overflow-hidden">
            <p class="border-b border-line px-4 py-3 text-sm font-medium text-ink sm:px-5">Asset performance</p>
            <amc-data-table tableId="pm-asset-perf" [rows]="assets()" [columns]="assetCols" [trackBy]="trackByAsset" [loading]="assetsRes.isLoading()" [initialPageSize]="25" emptyIcon="box" emptyTitle="No data" emptyMessage="No maintenance history yet." />
          </section>
        }
        @case ('review') {
          <section class="amc-card overflow-hidden">
            <p class="border-b border-line px-4 py-3 text-sm text-ink-muted sm:px-5">Performance review → failure analysis → history → cost → condition → frequency / checklist / parts review → technician feedback → revised plan → new version.</p>
            <amc-data-table tableId="pm-review" [rows]="plans()" [columns]="reviewCols" [trackBy]="trackByPlan" [actions]="reviewActions" [initialPageSize]="25" emptyIcon="refresh" emptyTitle="No plans" emptyMessage="No plans to review." (action)="onReview($event)" />
          </section>
        }
        @default { <amc-pm-history-timeline /> }
      }
    </div>
    <amc-plan-action-host (done)="plansRes.reload()" />
  `,
})
export class PerformancePage {
  private readonly api = inject(PmPerformanceApi);
  private readonly planApi = inject(PlanApi);
  protected readonly refs = inject(PmReferenceStore);
  private readonly host = viewChild.required(PlanActionHost);

  protected readonly tabs: TabItem[] = [{ id: 'performance', label: 'Performance', icon: 'bar-chart' }, { id: 'review', label: 'Plan Review', icon: 'refresh' }, { id: 'history', label: 'History & Audit', icon: 'history' }];
  protected readonly tab = signal<'performance' | 'review' | 'history'>('performance');
  protected readonly plan = signal<string | number | null>(null);
  private readonly summaryRes = rxResource({ params: () => (this.plan() ? String(this.plan()) : ''), stream: ({ params }) => this.api.summary(params || undefined) });
  protected readonly summary = computed(() => (this.summaryRes.hasValue() ? this.summaryRes.value() : null));
  protected readonly assetsRes = rxResource({ stream: () => this.api.assets() });
  protected readonly assets = computed(() => (this.assetsRes.hasValue() ? this.assetsRes.value() : []));
  protected readonly plansRes = rxResource({ stream: () => this.planApi.list() });
  protected readonly plans = computed(() => (this.plansRes.hasValue() ? this.plansRes.value() : []));
  protected readonly topLabels = computed(() => this.assets().slice(0, 10).map((a) => a.assetId));
  protected readonly topBreakdowns = computed(() => this.assets().slice(0, 10).map((a) => a.breakdowns));
  private readonly byCost = computed(() => [...this.assets()].sort((a, b) => b.cost - a.cost).slice(0, 10));
  protected readonly costLabels = computed(() => this.byCost().map((a) => a.assetId));
  protected readonly costValues = computed(() => this.byCost().map((a) => a.cost));
  protected readonly assetCols: DataColumn<AssetPerformanceRow>[] = [
    { key: 'asset', label: 'Asset', value: (a) => a.assetName, secondary: (a) => `${a.category} · ${a.siteName}`, link: (a) => `/app/assets/${a.assetId}`, mobile: 'title', sortable: true, width: 280 },
    { key: 'freq', label: 'Maintenance Frequency', value: (a) => a.maintenanceFrequency, type: 'number', sortable: true, visibility: 'md', width: 150 },
    { key: 'breakdowns', label: 'Breakdown Frequency', value: (a) => a.breakdowns, type: 'number', sortable: true, width: 150 },
    { key: 'repeat', label: 'Repeat Failures', value: (a) => a.repeatFailures, type: 'number', sortable: true, visibility: 'lg', width: 120 },
    { key: 'cost', label: 'Maintenance Cost', value: (a) => a.cost, type: 'currency', currency: () => 'SAR', sortable: true, visibility: 'md', width: 140 },
    { key: 'downtime', label: 'Downtime (h)', value: (a) => a.downtimeHours, type: 'number', visibility: 'xl', width: 110 },
    { key: 'availability', label: 'Availability', value: (a) => `${a.availability}%`, visibility: 'lg', width: 110 },
    { key: 'compliance', label: 'PM Compliance', value: (a) => (a.compliance === null ? '—' : `${a.compliance}%`), type: 'badge', tone: (a) => (a.compliance === null ? 'neutral' : a.compliance >= 90 ? 'ok' : a.compliance >= 75 ? 'warn' : 'danger'), sortable: true, mobile: 'badge', width: 120 },
    { key: 'corrective', label: 'Corrective Generated', value: (a) => a.corrective, type: 'number', visibility: 'xl', width: 140 },
  ];
  protected readonly reviewCols: DataColumn<PlanListItem>[] = [
    { key: 'plan', label: 'Plan', value: (p) => p.name, secondary: (p) => `${p.number} · v${p.version}`, link: (p) => `/app/preventive-maintenance/${p.id}`, mobile: 'title', width: 280 },
    { key: 'freq', label: 'Frequency', value: (p) => p.frequencyLabel, visibility: 'md', width: 170 },
    { key: 'completed', label: 'Completed', value: (p) => p.kpis.completed, type: 'number', visibility: 'lg', width: 100 },
    { key: 'missed', label: 'Missed / Overdue', value: (p) => `${p.kpis.missed} / ${p.kpis.overdue}`, visibility: 'lg', width: 130 },
    { key: 'cost', label: 'Cost', value: (p) => p.kpis.cost, type: 'currency', currency: () => 'SAR', visibility: 'xl', width: 120 },
    { key: 'compliance', label: 'Compliance', value: (p) => (p.kpis.compliance === null ? '—' : `${p.kpis.compliance}%`), type: 'badge', tone: (p) => (p.kpis.compliance === null ? 'neutral' : p.kpis.compliance >= 90 ? 'ok' : p.kpis.compliance >= 75 ? 'warn' : 'danger'), mobile: 'badge', width: 120 },
  ];
  protected readonly trackByAsset = (a: AssetPerformanceRow) => a.assetId;
  protected readonly trackByPlan = (p: PlanListItem) => p.id;
  protected readonly reviewActions = (p: PlanListItem): MenuItem[] => (['Cancelled', 'Archived'].includes(p.status) ? [] : [{ id: 'review', label: 'Review Plan', icon: 'refresh' }]);
  protected readonly formatCurrency = formatCurrency;
  protected readonly fd = formatDuration;

  protected pct(v: number | null | undefined): string {
    return v === null || v === undefined ? '—' : `${v}%`;
  }

  protected onReview({ row }: RowAction<PlanListItem>): void {
    void this.host().run('review', row);
  }

  protected export(): void {
    downloadCsv(timestampedName('pm-asset-performance', 'csv'), ['Asset', 'Category', 'Site', 'Maintenance Frequency', 'Breakdown Frequency', 'Repeat Failures', 'Maintenance Cost', 'Downtime (h)', 'Availability %', 'PM Compliance %', 'Corrective Generated'],
      this.assets().map((a) => [a.assetName, a.category, a.siteName, a.maintenanceFrequency, a.breakdowns, a.repeatFailures, a.cost, a.downtimeHours, a.availability, a.compliance, a.corrective]));
  }
}
