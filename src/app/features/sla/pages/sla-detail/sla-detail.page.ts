import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ActionMenu, type MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable } from '@shared/ui/data-table';
import { DetailItem } from '@shared/ui/detail-item';
import { ErrorState } from '@shared/ui/error-state';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { MiniChart } from '@shared/ui/mini-chart';
import { Breadcrumbs } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { formatCurrency, formatDate, formatDateTime, formatFileSize } from '@shared/utils/format';
import { firstValueFrom, of } from 'rxjs';
import { SlaActionHost, slaActions } from '../../components/sla-action-host';
import { breachColumns, clockColumns, coverageColumns, eventColumns, mappingColumns, ruleColumns, targetColumns } from '../../components/sla-columns';
import { SlaHistoryTimeline } from '../../components/sla-history-timeline';
import { SlaReferenceStore } from '../../data/sla-reference.store';
import { EscalationApi, SlaApi, SlaBreachApi, SlaCalendarApi, SlaClockApi, SlaCoverageApi, SlaMappingApi, SlaPerformanceApi, SlaTargetApi } from '../../data/sla.api';
import { SLA_STATUS_TONE, formatMinutes } from '../../models/display';
import type { SlaClockListItem } from '../../models/operations.model';
import { PRIORITIES, type SlaDocument } from '../../models/sla.model';

const TABS = ['overview', 'contract', 'amc', 'customers', 'sites', 'assets', 'services', 'priorities', 'targets', 'hours', 'calendar', 'escalations', 'requests', 'work-orders', 'clocks', 'breaches', 'visits', 'performance', 'documents', 'history'] as const;
type Tab = (typeof TABS)[number];

interface ScopeRow {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly source: string;
  readonly link: string | null;
}

interface TxRow {
  readonly id: string;
  readonly number: string;
  readonly subject: string;
  readonly customer: string;
  readonly priority: string;
  readonly response: SlaClockListItem | undefined;
  readonly resolution: SlaClockListItem | undefined;
  readonly status: string;
}

@Component({
  selector: 'amc-sla-detail-page',
  imports: [ActionMenu, Breadcrumbs, DataTable, DetailItem, ErrorState, Icon, KpiCard, MiniChart, Panel, RouterLink, Select, Skeleton, SlaActionHost, SlaHistoryTimeline, StatusBadge, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sla-detail.page.html',
})
export class SlaDetailPage {
  private readonly api = inject(SlaApi);
  private readonly targetApi = inject(SlaTargetApi);
  private readonly coverageApi = inject(SlaCoverageApi);
  private readonly mappingApi = inject(SlaMappingApi);
  private readonly escalationApi = inject(EscalationApi);
  private readonly clockApi = inject(SlaClockApi);
  private readonly breachApi = inject(SlaBreachApi);
  private readonly performanceApi = inject(SlaPerformanceApi);
  private readonly calendarApi = inject(SlaCalendarApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SlaReferenceStore);
  private readonly host = viewChild.required(SlaActionHost);

  readonly slaId = input.required<string>();
  readonly tab = input<string>();

  protected readonly refreshKey = signal(0);
  protected readonly activeTab = linkedSignal<Tab>(() => (TABS.includes(this.tab() as Tab) ? (this.tab() as Tab) : 'overview'));
  private readonly key = computed(() => ({ id: this.slaId(), k: this.refreshKey() }));
  protected readonly res = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.get(params.id) });
  private readonly targetsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.targetApi.list(params.id) });
  private readonly coverageRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.coverageApi.list(params.id) });
  private readonly mappingRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.mappingApi.list(params.id) });
  private readonly rulesRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.escalationApi.rules(params.id) });
  private readonly eventsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.escalationApi.events(params.id) });
  private readonly clocksRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.clockApi.list({ slaId: params.id }) });
  private readonly breachesRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.breachApi.list(params.id) });
  private readonly perfRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.performanceApi.summary(params.id) });
  private readonly trendRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.performanceApi.trend('Weekly', params.id) });
  private readonly versionsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.versions(params.id) });
  private readonly holidaysRes = rxResource({ params: () => (this.activeTab() === 'calendar' ? 1 : null), stream: ({ params }) => (params ? this.calendarApi.holidays() : of([])) });

  protected readonly s = computed(() => (this.res.hasValue() ? this.res.value() : null));
  private readonly v = <T>(r: { hasValue(): boolean; value(): T[] | undefined }) => (r.hasValue() ? (r.value() ?? []) : []);
  protected readonly targets = computed(() => this.v(this.targetsRes));
  protected readonly coverage = computed(() => this.v(this.coverageRes));
  protected readonly mappings = computed(() => this.v(this.mappingRes));
  protected readonly rules = computed(() => this.v(this.rulesRes));
  protected readonly events = computed(() => this.v(this.eventsRes));
  protected readonly clocks = computed(() => this.v(this.clocksRes));
  protected readonly breaches = computed(() => this.v(this.breachesRes));
  protected readonly versions = computed(() => this.v(this.versionsRes));
  protected readonly perf = computed(() => (this.perfRes.hasValue() ? this.perfRes.value() : null));
  protected readonly trend = computed(() => this.v(this.trendRes));
  protected readonly calendar = computed(() => this.refs.calendars().find((c) => c.id === this.s()?.serviceHours.calendarId));
  protected readonly holidays = computed(() => this.v(this.holidaysRes).filter((h) => h.calendar === this.calendar()?.holidayCalendar));
  protected readonly amc = computed(() => this.refs.data().amcs.find((a) => a.id === this.s()?.contract.amcId));
  protected readonly contract = computed(() => this.refs.data().contracts.find((c) => c.id === this.s()?.contract.contractId));

  protected readonly customerRows = computed<ScopeRow[]>(() => {
    const ids = new Map<string, string>();
    const s = this.s();
    if (s?.customer.customerId) ids.set(s.customer.customerId, 'SLA customer');
    this.coverage().filter((c) => c.level === 'Customer' && c.customerId).forEach((c) => ids.set(c.customerId!, 'Coverage'));
    this.mappings().filter((m) => m.customerId).forEach((m) => ids.set(m.customerId!, ids.get(m.customerId!) ?? `${m.level} mapping`));
    return [...ids.entries()].map(([id, source]) => {
      const c = this.refs.customer(id);
      return { id, name: c?.name ?? id, detail: `${c?.code ?? ''} · ${c?.segment ?? ''}`, source, link: `/app/customers/${id}` };
    });
  });
  protected readonly siteRows = computed<ScopeRow[]>(() => {
    const ids = new Map<string, string>();
    this.amc()?.siteIds.forEach((x) => ids.set(x, 'AMC'));
    this.coverage().filter((c) => c.siteId).forEach((c) => ids.set(c.siteId!, 'Coverage'));
    this.mappings().filter((m) => m.siteId).forEach((m) => ids.set(m.siteId!, ids.get(m.siteId!) ?? 'Mapping'));
    return [...ids.entries()].map(([id, source]) => {
      const site = this.refs.data().sites.find((x) => x.id === id);
      return { id, name: site?.name ?? id, detail: `${site?.city ?? ''} · ${site?.region ?? ''}`, source, link: `/app/customers/sites/${id}` };
    });
  });
  protected readonly assetRows = computed<ScopeRow[]>(() => {
    const ids = new Map<string, string>();
    const sites = this.amc()?.siteIds ?? [];
    this.refs.data().assets.filter((a) => sites.includes(a.siteId)).forEach((a) => ids.set(a.id, 'AMC site'));
    this.coverage().filter((c) => c.assetId).forEach((c) => ids.set(c.assetId!, 'Coverage'));
    const cats = this.coverage().filter((c) => c.level === 'Asset Category').map((c) => c.assetCategory);
    const rows = [...ids.entries()].map(([id, source]) => {
      const a = this.refs.data().assets.find((x) => x.id === id);
      return { id, name: `${id} · ${a?.name ?? ''}`, detail: `${a?.category ?? ''}`, source, link: `/app/assets/${id}` };
    });
    return [...rows, ...cats.map((c) => ({ id: `cat-${c}`, name: c ?? '', detail: 'Asset category', source: 'Coverage', link: null }))];
  });
  protected readonly serviceRows = computed<ScopeRow[]>(() => {
    const s = this.s();
    if (!s) return [];
    const rows: ScopeRow[] = s.scope.serviceIds.map((id) => {
      const svc = this.refs.data().services.find((x) => x.id === id);
      return { id, name: svc?.name ?? id, detail: `${svc?.code ?? ''} · ${svc?.category ?? ''}`, source: 'Service scope', link: `/app/catalog/services/${id}` };
    });
    s.scope.serviceCategories.forEach((c) => rows.push({ id: `cat-${c}`, name: c, detail: 'Service category', source: 'Service scope', link: null }));
    this.coverage().filter((c) => c.serviceCategory && !s.scope.serviceCategories.includes(c.serviceCategory)).forEach((c) => rows.push({ id: c.id, name: c.serviceCategory!, detail: `Service category${c.priority ? ` · ${c.priority}` : ''}`, source: 'Coverage', link: null }));
    return rows;
  });
  private tx(kind: 'Service Request' | 'Work Order'): TxRow[] {
    const map = new Map<string, SlaClockListItem[]>();
    this.clocks().filter((c) => c.transactionType === kind).forEach((c) => map.set(c.transactionId, [...(map.get(c.transactionId) ?? []), c]));
    return [...map.values()].map((list) => {
      const first = list[0];
      const response = list.find((c) => c.targetType !== 'Resolution');
      const resolution = list.find((c) => c.targetType === 'Resolution');
      const status = list.some((c) => c.monitoringStatus === 'Breached') ? 'Breached' : list.every((c) => c.monitoringStatus === 'Met') ? 'Met' : (resolution ?? first).monitoringStatus;
      return { id: first.transactionId, number: first.transactionNumber, subject: first.subject, customer: first.customerName, priority: first.priority, response, resolution, status };
    });
  }
  protected readonly requests = computed(() => this.tx('Service Request'));
  protected readonly workOrders = computed(() => this.tx('Work Order'));
  protected readonly visits = computed(() => this.clocks().filter((c) => c.targetType === 'On-Site Arrival'));

  protected readonly tabs = computed<TabItem[]>(() => [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'contract', label: 'Contract' },
    { id: 'amc', label: 'AMC' },
    { id: 'customers', label: 'Customers', count: this.customerRows().length },
    { id: 'sites', label: 'Sites', count: this.siteRows().length },
    { id: 'assets', label: 'Assets', count: this.assetRows().length },
    { id: 'services', label: 'Services', count: this.serviceRows().length },
    { id: 'priorities', label: 'Priorities' },
    { id: 'targets', label: 'Targets', count: this.targets().length },
    { id: 'hours', label: 'Service Hours' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'escalations', label: 'Escalations', count: this.rules().length },
    { id: 'requests', label: 'Service Requests', count: this.requests().length },
    { id: 'work-orders', label: 'Work Orders', count: this.workOrders().length },
    { id: 'clocks', label: 'SLA Clocks', count: this.clocks().length },
    { id: 'breaches', label: 'SLA Breaches', count: this.breaches().length },
    { id: 'visits', label: 'Service Visits', count: this.visits().length },
    { id: 'performance', label: 'Performance' },
    { id: 'documents', label: 'Documents', count: this.s()?.documents.length },
    { id: 'history', label: 'History' },
  ]);
  protected readonly menu = computed<MenuItem[]>(() => (this.s() ? slaActions(this.s()!).filter((i) => i.id !== 'edit') : []));
  protected readonly scopeColumns: DataColumn<ScopeRow>[] = [
    { key: 'name', label: 'Name', value: (r) => r.name, secondary: (r) => r.detail, link: (r) => r.link, mobile: 'title', width: 320 },
    { key: 'source', label: 'Source', value: (r) => r.source, type: 'badge', tone: () => 'info', mobile: 'badge', width: 150 },
  ];
  protected readonly txColumns: DataColumn<TxRow>[] = [
    { key: 'number', label: 'Transaction', value: (r) => r.number, secondary: (r) => r.subject, mobile: 'title', width: 260 },
    { key: 'customer', label: 'Customer', value: (r) => r.customer, visibility: 'md', mobile: 'meta', width: 200 },
    { key: 'priority', label: 'Priority', value: (r) => r.priority, visibility: 'lg', width: 100 },
    { key: 'response', label: 'Response / Arrival', value: (r) => (r.response ? `${r.response.monitoringStatus} · ${r.response.consumption}%` : '—'), visibility: 'md', width: 160 },
    { key: 'resolution', label: 'Resolution', value: (r) => (r.resolution ? `${r.resolution.monitoringStatus} · ${r.resolution.consumption}%` : '—'), visibility: 'md', width: 160 },
    { key: 'status', label: 'SLA Status', value: (r) => r.status, type: 'badge', tone: (r) => (r.status === 'Met' ? 'ok' : r.status === 'Breached' || r.status === 'Critical' ? 'danger' : r.status === 'Warning' ? 'warn' : 'info'), mobile: 'badge', width: 120 },
  ];
  protected readonly targetCols = targetColumns(false);
  protected readonly coverageCols = coverageColumns(false);
  protected readonly mappingCols = mappingColumns(false);
  protected readonly ruleCols = ruleColumns(false);
  protected readonly eventCols = eventColumns();
  protected readonly clockCols = clockColumns(false);
  protected readonly breachCols = breachColumns(false);
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly priorities = PRIORITIES;
  protected readonly statusTone = SLA_STATUS_TONE;
  protected readonly fm = formatMinutes;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatFileSize = formatFileSize;
  protected readonly trendLabels = computed(() => this.trend().map((t) => t.label));
  protected readonly trendValues = computed(() => this.trend().map((t) => t.compliance ?? 0));
  protected readonly docTypeOptions = ['SLA Document', 'Contract Attachment', 'Customer Approval', 'Supporting Document'].map((t) => ({ value: t, label: t }));
  protected readonly uploadType = signal<string | number | null>('Supporting Document');
  protected readonly days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  protected pctText(v: number | null | undefined): string {
    return v === null || v === undefined ? '—' : `${v}%`;
  }

  protected refresh(): void {
    this.refreshKey.update((k) => k + 1);
  }

  protected selectTab(tab: string): void {
    this.activeTab.set(tab as Tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onAction(id: string): void {
    const s = this.s();
    if (!s) return;
    if (id === 'performance') this.selectTab('performance');
    else if (id === 'breaches') this.selectTab('breaches');
    else void this.host().run(id, s);
  }

  protected async upload(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = '';
    for (const f of files) {
      try {
        await firstValueFrom(this.api.uploadDocument(this.slaId(), (this.uploadType() ?? 'Supporting Document') as SlaDocument['type'], { name: f.name, size: f.size }));
        this.notify.success(`${f.name} uploaded.`);
      } catch (error) {
        this.notify.error((error as Error).message);
      }
    }
    this.refresh();
  }
}
