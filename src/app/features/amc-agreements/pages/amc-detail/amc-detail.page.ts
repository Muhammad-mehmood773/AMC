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
import { Breadcrumbs } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { formatCurrency, formatDate, formatDateTime, formatFileSize } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { AmcActionHost, amcActions } from '../../components/amc-action-host';
import { billingColumns, coverageColumns, planColumns, pmColumns, visitColumns } from '../../components/amc-columns';
import { AmcHistoryTimeline } from '../../components/amc-history-timeline';
import { ConsumptionMeters } from '../../components/consumption-meters';
import { AmcReferenceStore } from '../../data/amc-reference.store';
import { AmcApi, BillingApi, CoverageApi, ScheduleApi, ServicePlanApi, VisitApi } from '../../data/amc.api';
import type { AmcDocument } from '../../models/amc.model';
import { AMC_STATUS_TONE } from '../../models/display';

const TABS = ['overview', 'contract', 'sites', 'assets', 'services', 'entitlements', 'sla', 'plan', 'schedule', 'work-orders', 'visits', 'parts', 'billing', 'consumption', 'costs', 'revenue', 'documents', 'history'] as const;
type Tab = (typeof TABS)[number];

interface Row {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly extra: string;
  readonly status: string;
  readonly link: string | null;
}

@Component({
  selector: 'amc-amc-detail-page',
  imports: [ActionMenu, AmcActionHost, AmcHistoryTimeline, Breadcrumbs, ConsumptionMeters, DataTable, DetailItem, ErrorState, Icon, KpiCard, Panel, RouterLink, Select, Skeleton, StatusBadge, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './amc-detail.page.html',
})
export class AmcDetailPage {
  private readonly api = inject(AmcApi);
  private readonly coverageApi = inject(CoverageApi);
  private readonly planApi = inject(ServicePlanApi);
  private readonly scheduleApi = inject(ScheduleApi);
  private readonly visitApi = inject(VisitApi);
  private readonly billingApi = inject(BillingApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(AmcReferenceStore);
  private readonly host = viewChild.required(AmcActionHost);

  readonly amcId = input.required<string>();
  readonly tab = input<string>();

  protected readonly refreshKey = signal(0);
  protected readonly activeTab = linkedSignal<Tab>(() => (TABS.includes(this.tab() as Tab) ? (this.tab() as Tab) : 'overview'));
  private readonly key = computed(() => ({ id: this.amcId(), k: this.refreshKey() }));
  protected readonly res = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.get(params.id) });
  private readonly performanceRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.performance(params.id) });
  private readonly coverageRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.coverageApi.list(params.id) });
  private readonly planRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.planApi.list(params.id) });
  private readonly scheduleRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.scheduleApi.list(params.id) });
  private readonly visitRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.visitApi.list(params.id) });
  private readonly billingRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.billingApi.list(params.id) });

  protected readonly a = computed(() => (this.res.hasValue() ? this.res.value() : null));
  protected readonly perf = computed(() => (this.performanceRes.hasValue() ? this.performanceRes.value() : null));
  protected readonly coverage = computed(() => (this.coverageRes.hasValue() ? this.coverageRes.value() : []));
  protected readonly plans = computed(() => (this.planRes.hasValue() ? this.planRes.value() : []));
  protected readonly events = computed(() => (this.scheduleRes.hasValue() ? this.scheduleRes.value() : []));
  protected readonly visits = computed(() => (this.visitRes.hasValue() ? this.visitRes.value() : []));
  protected readonly billing = computed(() => (this.billingRes.hasValue() ? this.billingRes.value() : []));
  protected readonly partsVisits = computed(() => this.visits().filter((v) => v.partsValue > 0 || v.consumablesValue > 0));

  protected readonly siteRows = computed<Row[]>(() => (this.a()?.scope.siteIds ?? []).map((id) => {
    const s = this.refs.data().sites.find((x) => x.id === id);
    return { id, name: s?.name ?? id, code: s?.code ?? id, extra: `${s?.city ?? ''} · ${this.a()!.scope.assetIds.filter((x) => this.refs.data().assets.find((y) => y.id === x)?.siteId === id).length} covered assets`, status: this.a()!.scope.excludedSiteIds.includes(id) ? 'Excluded' : 'Covered', link: `/app/customers/sites/${id}` };
  }));
  protected readonly assetRows = computed<Row[]>(() => {
    const a = this.a();
    if (!a) return [];
    const scheduled = new Set(this.events().filter((e) => e.scheduledDate >= new Date().toISOString().slice(0, 10)).map((e) => e.assetId));
    return [...a.scope.assetIds, ...a.scope.excludedAssetIds].map((id) => {
      const x = this.refs.data().assets.find((y) => y.id === id);
      const excluded = a.scope.excludedAssetIds.includes(id);
      return { id, name: x?.name ?? id, code: id, extra: `${x?.category ?? ''} · ${this.refs.siteName(x?.siteId)}`, status: excluded ? 'Excluded' : scheduled.has(id) ? 'Scheduled' : 'No upcoming PM', link: `/app/assets/${id}` };
    });
  });
  protected readonly serviceRows = computed<Row[]>(() => {
    const a = this.a();
    if (!a) return [];
    return [...a.scope.serviceIds, ...a.scope.excludedServiceIds.filter((x) => !a.scope.serviceIds.includes(x))].map((id) => {
      const s = this.refs.data().services.find((y) => y.id === id);
      return { id, name: s?.name ?? id, code: s?.code ?? id, extra: `${s?.type ?? ''} · ${s?.category ?? ''}`, status: a.scope.excludedServiceIds.includes(id) ? 'Excluded' : 'Covered', link: `/app/catalog/services/${id}` };
    });
  });
  protected readonly workOrderRows = computed<Row[]>(() => {
    const a = this.a();
    if (!a) return [];
    const fromVisits = this.visits().filter((v) => v.workOrder).map((v) => ({ id: v.id, name: `${v.type} · ${v.siteName}`, code: v.workOrder!, extra: `${formatDate(v.plannedDate)} · ${v.technician ?? 'Unassigned'}`, status: v.status, link: null }));
    const external = this.refs.data().requests.filter((r) => a.scope.siteIds.includes(r.siteId)).map((r) => ({ id: r.id, name: r.subject, code: r.number, extra: `${r.kind} · ${this.refs.siteName(r.siteId)} · ${formatDate(r.createdAt)}`, status: r.status, link: null }));
    return [...fromVisits, ...external];
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const a = this.a();
    return [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'contract', label: 'Contract' },
      { id: 'sites', label: 'Sites', count: a?.scope.siteIds.length },
      { id: 'assets', label: 'Assets', count: a?.scope.assetIds.length },
      { id: 'services', label: 'Services', count: a?.scope.serviceIds.length },
      { id: 'entitlements', label: 'Entitlements', count: this.coverage().length },
      { id: 'sla', label: 'SLA' },
      { id: 'plan', label: 'Service Plan', count: this.plans().length },
      { id: 'schedule', label: 'Maintenance Schedule', count: this.events().length },
      { id: 'work-orders', label: 'Work Orders', count: this.workOrderRows().length },
      { id: 'visits', label: 'Service Visits', count: this.visits().length },
      { id: 'parts', label: 'Parts', count: this.partsVisits().length },
      { id: 'billing', label: 'Billing', count: this.billing().length },
      { id: 'consumption', label: 'Consumption' },
      { id: 'costs', label: 'Costs' },
      { id: 'revenue', label: 'Revenue' },
      { id: 'documents', label: 'Documents', count: a?.documents.length },
      { id: 'history', label: 'History' },
    ];
  });

  protected readonly laborText = computed(() => {
    const l = this.a()?.labor;
    return l ? [l.included && 'Labor', l.technicianVisitsIncluded && 'Technician visits', l.overtime && 'Overtime', l.emergencyLabor && 'Emergency labor', l.travel && 'Travel', l.callOut && 'Call-out'].filter((x) => !!x).join(' � ') || 'Not included' : '';
  });
  protected readonly partsText = computed(() => {
    const p = this.a()?.parts;
    return p ? [p.partsIncluded && 'Parts', p.minorParts && 'Minor parts', p.majorComponents && 'Major components', p.consumablesIncluded && 'Consumables', p.replacementCoverage && 'Replacement'].filter((x) => !!x).join(' � ') || 'Not included' : '';
  });
  protected readonly menu = computed<MenuItem[]>(() => (this.a() ? amcActions(this.a()!).filter((i) => i.id !== 'edit') : []));
  protected readonly coverageCols = coverageColumns(false);
  protected readonly planCols = planColumns(false);
  protected readonly pmCols = pmColumns(false);
  protected readonly visitCols = visitColumns(false);
  protected readonly billingCols = billingColumns(false);
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly statusTone = AMC_STATUS_TONE;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatFileSize = formatFileSize;
  protected readonly docTypeOptions = ['AMC Document', 'Customer PO', 'Quotation', 'Supporting Document', 'Service Report'].map((t) => ({ value: t, label: t }));
  protected readonly uploadType = signal<string | number | null>('Supporting Document');

  protected rowColumns(label: string, extra: string): DataColumn<Row>[] {
    return [
      { key: 'name', label, value: (r) => r.name, secondary: (r) => r.code, link: (r) => r.link, mobile: 'title', width: 280 },
      { key: 'extra', label: extra, value: (r) => r.extra, mobile: 'meta', width: 320 },
      { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => (['Covered', 'Scheduled', 'Completed', 'Resolved', 'Closed'].includes(r.status) ? 'ok' : r.status === 'Excluded' ? 'danger' : r.status === 'No upcoming PM' ? 'warn' : 'info'), mobile: 'badge', width: 140 },
    ];
  }

  protected refresh(): void {
    this.refreshKey.update((k) => k + 1);
  }

  protected selectTab(tab: string): void {
    this.activeTab.set(tab as Tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onAction(id: string): void {
    const a = this.a();
    if (!a) return;
    if (id === 'history') this.selectTab('visits');
    else void this.host().run(id, a);
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const f of files) {
      try {
        await firstValueFrom(this.api.uploadDocument(this.amcId(), (this.uploadType() ?? 'Supporting Document') as AmcDocument['type'], { name: f.name, size: f.size }));
        this.notify.success(`${f.name} uploaded.`);
      } catch (error) {
        this.notify.error((error as Error).message);
      }
    }
    this.refresh();
  }
}
