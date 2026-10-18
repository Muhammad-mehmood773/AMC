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
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { formatCurrency, formatDate, formatDateTime, formatFileSize, relativeTime } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { RequestActionHost, requestActions } from '../../components/request-action-host';
import { SrHistoryTimeline } from '../../components/sr-history-timeline';
import { SrValidationView } from '../../components/sr-validation-view';
import { SrReferenceStore } from '../../data/sr-reference.store';
import { RequestApi } from '../../data/sr.api';
import { COVERAGE_TONE, PRIORITY_TONE, SLA_TONE, STATUS_TONE, formatMinutes } from '../../models/display';
import type { ValidationGroup } from '../../models/operations.model';
import type { RequestListItem } from '../../models/request.model';

const TABS = ['overview', 'customer', 'asset', 'classification', 'coverage', 'sla', 'assignment', 'schedule', 'activity', 'work-orders', 'resolution', 'escalation', 'attachments', 'linked', 'cost', 'notes', 'validation', 'history'] as const;
type Tab = (typeof TABS)[number];

@Component({
  selector: 'amc-request-detail-page',
  imports: [ActionMenu, Breadcrumbs, DataTable, DetailItem, ErrorState, Icon, KpiCard, Panel, RequestActionHost, RouterLink, Skeleton, SrHistoryTimeline, SrValidationView, StatusBadge, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-detail.page.html',
})
export class RequestDetailPage {
  private readonly api = inject(RequestApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SrReferenceStore);
  private readonly host = viewChild.required(RequestActionHost);

  readonly requestId = input.required<string>();
  readonly tab = input<string>();

  protected readonly refreshKey = signal(0);
  protected readonly activeTab = linkedSignal<Tab>(() => (TABS.includes(this.tab() as Tab) ? (this.tab() as Tab) : 'overview'));
  private readonly key = computed(() => ({ id: this.requestId(), k: this.refreshKey() }));
  protected readonly res = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.get(params.id) });
  private readonly validationRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.validation(params.id) });
  private readonly all = rxResource({ stream: () => this.api.list() });

  protected readonly r = computed(() => (this.res.hasValue() ? this.res.value() : null));
  protected readonly validation = computed<ValidationGroup[]>(() => (this.validationRes.hasValue() ? this.validationRes.value() : []));
  protected readonly customer = computed(() => this.refs.customer(this.r()?.customer.customerId));
  protected readonly site = computed(() => this.refs.site(this.r()?.location.siteId));
  protected readonly asset = computed(() => this.refs.asset(this.r()?.assetId));
  protected readonly linked = computed(() => {
    const all = this.all.hasValue() ? this.all.value() : [];
    const r = this.r();
    return r ? all.filter((x) => r.linkedRequestIds.includes(x.id) || x.id === r.duplicateOf) : [];
  });
  protected readonly parent = computed(() => {
    const r = this.r();
    const all = this.all.hasValue() ? this.all.value() : [];
    return r?.origin.parentRequestId ? (all.find((x) => x.id === r.origin.parentRequestId) ?? null) : null;
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const r = this.r();
    return [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'customer', label: 'Customer & Site' },
      { id: 'asset', label: 'Asset' },
      { id: 'classification', label: 'Classification' },
      { id: 'coverage', label: 'Coverage' },
      { id: 'sla', label: 'SLA & Priority' },
      { id: 'assignment', label: 'Assignment', count: r?.assignmentHistory.length },
      { id: 'schedule', label: 'Schedule', count: r?.scheduleHistory.length },
      { id: 'activity', label: 'Communication', count: r?.activities.length },
      { id: 'work-orders', label: 'Work Orders', count: r?.workOrders.length },
      { id: 'resolution', label: 'Resolution' },
      { id: 'escalation', label: 'Escalation', count: r?.escalation.events.length },
      { id: 'attachments', label: 'Attachments', count: r?.attachments.length },
      { id: 'linked', label: 'Linked Requests', count: this.linked().length },
      { id: 'cost', label: 'Cost & Billing' },
      { id: 'notes', label: 'Notes' },
      { id: 'validation', label: 'Validation' },
      { id: 'history', label: 'History' },
    ];
  });
  protected readonly menu = computed<MenuItem[]>(() => (this.r() ? requestActions(this.r()!).filter((i) => i.id !== 'view') : []));
  protected readonly statusTone = STATUS_TONE;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly slaTone = SLA_TONE;
  protected readonly coverageTone = COVERAGE_TONE;
  protected readonly fm = formatMinutes;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatFileSize = formatFileSize;
  protected readonly relativeTime = relativeTime;
  protected readonly trackById = (x: { id: string }) => x.id;
  protected readonly trackHold = (h: RequestListItem['holds'][number]) => h.startedAt;
  protected readonly locationOf = (a: { building: string; floor: string; area: string }) => [a.building, a.floor, a.area].filter(Boolean).join(' · ') || '—';

  protected readonly woColumns: DataColumn<RequestListItem['workOrders'][number]>[] = [
    { key: 'number', label: 'Work Order', value: (w) => w.number, secondary: (w) => w.createdAt, mobile: 'title', width: 190 },
    { key: 'status', label: 'Status', value: (w) => w.status, type: 'badge', tone: (w) => (w.status === 'Completed' ? 'ok' : w.status === 'Cancelled' ? 'danger' : 'info'), mobile: 'badge', width: 120 },
    { key: 'team', label: 'Team / Technician', value: (w) => w.team ?? '—', secondary: (w) => w.technician, width: 180 },
    { key: 'date', label: 'Scheduled', value: (w) => w.scheduledDate, visibility: 'lg', width: 130 },
    { key: 'labour', label: 'Labour', value: (w) => (w.labourMinutes ? formatMinutes(w.labourMinutes) : '—'), align: 'right', width: 100 },
    { key: 'billable', label: 'Billable', value: (w) => (w.billable ? 'Yes' : 'No'), type: 'badge', tone: (w) => (w.billable ? 'warn' : 'neutral'), width: 90 },
  ];
  protected readonly activityColumns: DataColumn<RequestListItem['activities'][number]>[] = [
    { key: 'at', label: 'When', value: (a) => a.at, type: 'datetime', sortable: true, width: 150 },
    { key: 'type', label: 'Type', value: (a) => a.type, type: 'badge', tone: (a) => (a.direction === 'Inbound' ? 'info' : a.direction === 'Outbound' ? 'brand' : 'neutral'), mobile: 'badge', width: 140 },
    { key: 'message', label: 'Message', value: (a) => a.message, mobile: 'title' },
    { key: 'by', label: 'By', value: (a) => a.user, visibility: 'lg', width: 140 },
    { key: 'visibility', label: 'Visibility', value: (a) => a.visibility, visibility: 'xl', width: 130 },
  ];
  protected readonly holdColumns: DataColumn<RequestListItem['holds'][number]>[] = [
    { key: 'reason', label: 'Reason', value: (h) => h.reason, mobile: 'title', width: 190 },
    { key: 'started', label: 'From', value: (h) => h.startedAt, type: 'datetime', width: 150 },
    { key: 'ended', label: 'Until', value: (h) => h.endedAt ?? 'On hold', type: 'datetime', width: 150 },
    { key: 'sla', label: 'SLA Clock', value: (h) => (h.pausesSla ? 'Paused' : 'Kept running'), type: 'badge', tone: (h) => (h.pausesSla ? 'warn' : 'neutral'), width: 120 },
    { key: 'by', label: 'Responsible', value: (h) => h.responsible, visibility: 'lg', width: 140 },
  ];

  protected refresh(): void {
    this.refreshKey.update((k) => k + 1);
  }

  protected selectTab(tab: string): void {
    this.activeTab.set(tab as Tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onAction(id: string): void {
    const r = this.r();
    if (!r) return;
    if (id === 'edit') {
      void this.router.navigate(['/app/service-requests', r.id, 'edit']);
      return;
    }
    if (id === 'classify') {
      this.selectTab('classification');
      return;
    }
    void this.host().run(id, r);
  }

  protected async addActivity(input: Parameters<RequestApi['addActivity']>[1]): Promise<void> {
    const r = this.r();
    if (!r) return;
    try {
      await firstValueFrom(this.api.addActivity(r.id, input));
      this.notify.success('Activity added.');
      this.refresh();
    } catch (e) {
      this.notify.error((e as Error).message);
    }
  }
}
