import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ActionMenu, type MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { DetailItem } from '@shared/ui/detail-item';
import { ErrorState } from '@shared/ui/error-state';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { Breadcrumbs } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { formatCurrency, formatDate, formatDateTime, formatFileSize } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { OccurrenceActionHost, occurrenceActions } from '../../components/occurrence-action-host';
import { PlanActionHost, planActions } from '../../components/plan-action-host';
import { meterColumns, occurrenceColumns, workOrderColumns } from '../../components/pm-columns';
import { PmHistoryTimeline } from '../../components/pm-history-timeline';
import { PmReferenceStore } from '../../data/pm-reference.store';
import { ChecklistApi, MeterApi, PlanApi, PmPerformanceApi, PmWorkOrderApi, ScheduleApi, TaskApi } from '../../data/pm.api';
import { PM_RULES } from '../../data/pm.config';
import { OCC_TONE, PLAN_STATUS_TONE, formatDuration } from '../../models/display';
import type { OccurrenceListItem, StockPart } from '../../models/operations.model';
import type { PlanDocument } from '../../models/plan.model';

const TABS = ['overview', 'customer', 'site', 'asset', 'contract', 'amc', 'sla', 'strategy', 'schedule', 'calendar', 'checklist', 'tasks', 'work-orders', 'visits', 'parts', 'consumables', 'meters', 'conditions', 'history', 'cost', 'documents', 'audit'] as const;
type Tab = (typeof TABS)[number];

interface PartRow extends StockPart {
  readonly required: number;
  readonly used: number;
  readonly available: number;
}

@Component({
  selector: 'amc-plan-detail-page',
  imports: [ActionMenu, Breadcrumbs, DataTable, DetailItem, ErrorState, Icon, KpiCard, OccurrenceActionHost, Panel, PlanActionHost, PmHistoryTimeline, RouterLink, Select, Skeleton, StatusBadge, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-detail.page.html',
})
export class PlanDetailPage {
  private readonly api = inject(PlanApi);
  private readonly scheduleApi = inject(ScheduleApi);
  private readonly woApi = inject(PmWorkOrderApi);
  private readonly meterApi = inject(MeterApi);
  private readonly checklistApi = inject(ChecklistApi);
  private readonly taskApi = inject(TaskApi);
  private readonly perfApi = inject(PmPerformanceApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(PmReferenceStore);
  private readonly planHost = viewChild.required(PlanActionHost);
  private readonly occHost = viewChild.required(OccurrenceActionHost);

  readonly planId = input.required<string>();
  readonly tab = input<string>();

  protected readonly refreshKey = signal(0);
  protected readonly activeTab = linkedSignal<Tab>(() => (TABS.includes(this.tab() as Tab) ? (this.tab() as Tab) : 'overview'));
  private readonly key = computed(() => ({ id: this.planId(), k: this.refreshKey() }));
  protected readonly res = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.get(params.id) });
  private readonly occRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.scheduleApi.list(params.id) });
  private readonly woRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.woApi.list(params.id) });
  private readonly meterRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.meterApi.list(params.id) });
  private readonly checklistRes = rxResource({ params: () => this.key(), stream: () => this.checklistApi.list() });
  private readonly taskRes = rxResource({ params: () => this.key(), stream: () => this.taskApi.list() });
  private readonly versionsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.versions(params.id) });
  private readonly perfRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.perfApi.summary(params.id) });

  protected readonly p = computed(() => (this.res.hasValue() ? this.res.value() : null));
  private readonly list = <T>(r: { hasValue(): boolean; value(): T[] | undefined }) => (r.hasValue() ? (r.value() ?? []) : []);
  protected readonly occurrences = computed(() => this.list(this.occRes));
  protected readonly workOrders = computed(() => this.list(this.woRes));
  protected readonly meters = computed(() => this.list(this.meterRes).filter((m) => m.kind === 'Meter'));
  protected readonly conditions = computed(() => this.list(this.meterRes).filter((m) => m.kind === 'Condition'));
  protected readonly versions = computed(() => this.list(this.versionsRes));
  protected readonly perf = computed(() => (this.perfRes.hasValue() ? this.perfRes.value() : null));
  protected readonly checklist = computed(() => this.list(this.checklistRes).find((c) => c.id === this.p()?.procedure.checklistId));
  protected readonly tasks = computed(() => {
    const ids = this.p()?.procedure.taskIds ?? [];
    return this.list(this.taskRes).filter((t) => ids.includes(t.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  });
  protected readonly customer = computed(() => this.refs.customer(this.p()?.location.customerId));
  protected readonly site = computed(() => this.refs.data().sites.find((s) => s.id === this.p()?.location.siteId));
  protected readonly assets = computed(() => (this.p()?.assetIds ?? []).map((id) => this.refs.asset(id)).filter((a) => !!a));
  protected readonly amc = computed(() => this.refs.data().amcs.find((a) => a.id === this.p()?.service.amcId));
  protected readonly contract = computed(() => this.refs.data().contracts.find((c) => c.id === this.p()?.service.contractId));
  protected readonly sla = computed(() => this.refs.data().slas.find((s) => s.id === this.p()?.service.slaId));
  protected readonly visits = computed(() => this.occurrences().filter((o) => o.completion));
  protected readonly upcomingByMonth = computed(() => {
    const groups = new Map<string, OccurrenceListItem[]>();
    this.occurrences().filter((o) => !['Cancelled'].includes(o.status)).forEach((o) => groups.set(o.scheduledDate.slice(0, 7), [...(groups.get(o.scheduledDate.slice(0, 7)) ?? []), o]));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => ({ month, rows }));
  });
  protected readonly partRows = computed<PartRow[]>(() => {
    const p = this.p();
    if (!p) return [];
    const used = new Map<string, number>();
    this.visits().forEach((o) => o.completion!.partsUsed.forEach((u) => used.set(u.partNumber, (used.get(u.partNumber) ?? 0) + u.quantity)));
    const numbers = new Set([...p.parts.required.map((r) => r.partNumber), ...used.keys()]);
    return [...numbers].map((n) => {
      const s = this.refs.part(n);
      return s ? { ...s, required: p.parts.required.find((r) => r.partNumber === n)?.quantity ?? 0, used: used.get(n) ?? 0, available: s.stock - s.reserved } : null;
    }).filter((x): x is PartRow => !!x);
  });
  protected readonly partsOnly = computed(() => this.partRows().filter((r) => r.kind === 'Part'));
  protected readonly consumables = computed(() => this.partRows().filter((r) => r.kind === 'Consumable'));
  protected readonly cost = computed(() => {
    const visits = this.visits();
    const labour = visits.reduce((s, o) => s + (o.completion!.durationMinutes / 60) * PM_RULES.laborRatePerHour, 0);
    const parts = visits.reduce((s, o) => s + o.completion!.partsUsed.reduce((a, u) => a + (this.refs.part(u.partNumber)?.kind === 'Part' ? (this.refs.part(u.partNumber)?.unitCost ?? 0) * u.quantity : 0), 0), 0);
    const consumables = visits.reduce((s, o) => s + o.completion!.partsUsed.reduce((a, u) => a + (this.refs.part(u.partNumber)?.kind === 'Consumable' ? (this.refs.part(u.partNumber)?.unitCost ?? 0) * u.quantity : 0), 0), 0);
    const travel = visits.length * PM_RULES.travelCostPerVisit;
    const tools = visits.length * PM_RULES.toolCostPerVisit;
    return { labour: Math.round(labour), parts: Math.round(parts), consumables: Math.round(consumables), travel, tools, subcontractor: 0, other: 0, total: Math.round(labour + parts + consumables + travel + tools) };
  });

  protected readonly tabs = computed<TabItem[]>(() => [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'customer', label: 'Customer' },
    { id: 'site', label: 'Site' },
    { id: 'asset', label: 'Asset', count: this.p()?.assetIds.length },
    { id: 'contract', label: 'Contract' },
    { id: 'amc', label: 'AMC' },
    { id: 'sla', label: 'SLA' },
    { id: 'strategy', label: 'Maintenance Strategy' },
    { id: 'schedule', label: 'Schedule', count: this.occurrences().length },
    { id: 'calendar', label: 'Calendar' },
    { id: 'checklist', label: 'Checklist', count: this.checklist()?.items.length },
    { id: 'tasks', label: 'Tasks', count: this.tasks().length },
    { id: 'work-orders', label: 'Work Orders', count: this.workOrders().length },
    { id: 'visits', label: 'Service Visits', count: this.visits().length },
    { id: 'parts', label: 'Parts', count: this.partsOnly().length },
    { id: 'consumables', label: 'Consumables', count: this.consumables().length },
    { id: 'meters', label: 'Meter Readings', count: this.meters().length },
    { id: 'conditions', label: 'Condition Rules', count: this.conditions().length },
    { id: 'history', label: 'Maintenance History' },
    { id: 'cost', label: 'Cost' },
    { id: 'documents', label: 'Documents', count: this.p()?.documents.length },
    { id: 'audit', label: 'Audit History' },
  ]);
  protected readonly menu = computed<MenuItem[]>(() => (this.p() ? planActions(this.p()!) : []));
  protected readonly occCols = occurrenceColumns(false);
  protected readonly woCols = workOrderColumns(false);
  protected readonly meterCols = meterColumns();
  protected readonly visitCols: DataColumn<OccurrenceListItem>[] = [
    { key: 'number', label: 'Visit', value: (o) => o.completion?.reportNumber, secondary: (o) => o.number, type: 'mono', mobile: 'title', width: 170 },
    { key: 'asset', label: 'Asset', value: (o) => o.assetName, visibility: 'md', mobile: 'meta', width: 220 },
    { key: 'date', label: 'Completed', value: (o) => o.completion?.endedAt, type: 'datetime', sortable: true, width: 150 },
    { key: 'tech', label: 'Technician', value: (o) => o.technician, visibility: 'lg', width: 160 },
    { key: 'duration', label: 'Duration', value: (o) => formatDuration(o.completion?.durationMinutes), visibility: 'lg', width: 100 },
    { key: 'condition', label: 'Asset Condition', value: (o) => o.completion?.assetCondition, visibility: 'xl', width: 130 },
    { key: 'defects', label: 'Defects', value: (o) => o.completion?.defects || '—', visibility: 'xl', width: 180 },
    { key: 'result', label: 'Result', value: (o) => o.completion?.result.replace('Maintenance ', ''), type: 'badge', tone: (o) => (o.completion?.result === 'Maintenance Completed Successfully' ? 'ok' : o.completion?.result === 'Maintenance Failed' ? 'danger' : 'warn'), mobile: 'badge', width: 200 },
  ];
  protected readonly partCols: DataColumn<PartRow>[] = [
    { key: 'part', label: 'Part', value: (r) => r.description, secondary: (r) => r.partNumber, mobile: 'title', width: 260 },
    { key: 'category', label: 'Category', value: (r) => r.category, visibility: 'lg', width: 130 },
    { key: 'required', label: 'Required / Visit', value: (r) => `${r.required} ${r.unit}`, width: 130 },
    { key: 'used', label: 'Actual Used', value: (r) => `${r.used} ${r.unit}`, visibility: 'md', width: 120 },
    { key: 'warehouse', label: 'Warehouse', value: (r) => r.warehouse, visibility: 'xl', width: 140 },
    { key: 'available', label: 'Availability', value: (r) => (r.available >= r.required ? `${r.available} available` : `Short — ${r.available} available`), type: 'badge', tone: (r) => (r.available >= r.required ? 'ok' : 'danger'), mobile: 'badge', width: 160 },
  ];
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly trackByPart = (r: PartRow) => r.partNumber;
  protected readonly occActions = (o: OccurrenceListItem) => occurrenceActions(o);
  protected readonly statusTone = PLAN_STATUS_TONE;
  protected readonly occTone = OCC_TONE;
  protected readonly fd = formatDuration;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatFileSize = formatFileSize;
  protected readonly days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  protected readonly docTypeOptions = ['Maintenance Manual', 'Manufacturer Guidelines', 'Technical Document', 'Safety Document', 'Supporting Document'].map((t) => ({ value: t, label: t }));
  protected readonly uploadType = signal<string | number | null>('Supporting Document');
  protected readonly laborRate = PM_RULES.laborRatePerHour;
  protected readonly isOpen = (o: OccurrenceListItem) => ['Planned', 'Scheduled', 'Assigned', 'Confirmed', 'Rescheduled', 'In Progress'].includes(o.status);
  protected readonly inAmc = (id: string) => !!this.amc()?.assetIds.includes(id);
  protected readonly dayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

  protected pct(v: number | null | undefined): string {
    return v === null || v === undefined ? '—' : `${v}%`;
  }

  protected refresh(): void {
    this.refreshKey.update((k) => k + 1);
  }

  protected selectTab(tab: string): void {
    this.activeTab.set(tab as Tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onPlanAction(id: string): void {
    const p = this.p();
    if (!p) return;
    if (id === 'history') this.selectTab('audit');
    else if (id === 'generate-wo') this.selectTab('schedule');
    else void this.planHost().run(id, p);
  }

  protected onOccurrence({ id, row }: RowAction<OccurrenceListItem>): void {
    void this.occHost().run(id, row);
  }

  protected nextOpen(): OccurrenceListItem | undefined {
    return this.occurrences().find((o) => ['Planned', 'Scheduled', 'Assigned', 'Confirmed', 'Rescheduled'].includes(o.status));
  }

  protected act(action: string): void {
    const o = this.nextOpen();
    if (o) void this.occHost().run(action, o);
    else this.notify.info('There is no open maintenance event on this plan.');
  }

  protected async upload(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = '';
    for (const f of files) {
      try {
        await firstValueFrom(this.api.uploadDocument(this.planId(), (this.uploadType() ?? 'Supporting Document') as PlanDocument['type'], { name: f.name, size: f.size }));
        this.notify.success(`${f.name} uploaded.`);
      } catch (e) {
        this.notify.error((e as Error).message);
      }
    }
    this.refresh();
  }
}
