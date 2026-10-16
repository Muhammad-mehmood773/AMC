import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { ActionMenu, type MenuItem } from '@shared/ui/action-menu';
import { Barcode, QrCode } from '@shared/ui/codes';
import { DataTable } from '@shared/ui/data-table';
import { DetailItem } from '@shared/ui/detail-item';
import { Dialog } from '@shared/ui/dialog';
import { ErrorState } from '@shared/ui/error-state';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { MiniChart } from '@shared/ui/mini-chart';
import { Breadcrumbs } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { type MapPin, SiteMap } from '@shared/ui/site-map';
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { daysBetween, formatCurrency, formatDate, formatDateTime, formatNumber, relativeTime } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { AssetDocumentManager } from '../../components/asset-document-manager';
import { coverageColumns, maintenanceColumns, partsColumns, serviceRequestColumns, workOrderColumns } from '../../components/asset-columns';
import { ComponentManager } from '../../components/component-manager';
import { EntitlementView } from '../../components/entitlement-view';
import { LifecycleTimeline } from '../../components/lifecycle-timeline';
import { ServiceHistoryView } from '../../components/service-history-view';
import { TransferManager } from '../../components/transfer-manager';
import { WarrantyManager } from '../../components/warranty-manager';
import { attentionReasons } from '../../data/asset-flags';
import { type AssetHandoffAction, AssetHandoff } from '../../data/asset-handoff.service';
import { AssetApi, EntitlementApi, ServiceHistoryApi } from '../../data/asset.api';
import { CRITICALITY_PROFILE, STATUS_TRANSITIONS, TECHNICAL_FIELDS, TRANSACTION_BLOCKED_STATUSES, categoryProfile } from '../../data/asset.config';
import { END_OF_LIFE_STATUSES, INACTIVE_STATUSES, PRE_INSTALLATION_STATUSES } from '../../models/asset.model';
import { ASSET_STATUS_TONE, COVERAGE_STATE_TONE, CRITICALITY_TONE, MAINTENANCE_STATUS_TONE, SERVICE_RESULT_TONE, SERVICE_TYPE_ICON, WARRANTY_STATUS_TONE } from '../../models/display';
import { FAILURE_SERVICE_TYPES, LIFECYCLE_STAGES, MAINTENANCE_SERVICE_TYPES } from '../../models/history.model';
import { trackRecentAsset } from '../asset-list/asset-list.page';

const TABS = [
  'overview', 'technical', 'location', 'components', 'warranty', 'contracts', 'entitlements', 'maintenance',
  'service-requests', 'work-orders', 'parts', 'service-history', 'documents', 'costs', 'activity',
] as const;
type AssetTab = (typeof TABS)[number];

@Component({
  selector: 'amc-asset-detail-page',
  imports: [
    ActionMenu, AssetDocumentManager, Barcode, Breadcrumbs, ComponentManager, DataTable, DetailItem, Dialog, EntitlementView, ErrorState, Icon, KpiCard,
    LifecycleTimeline, MiniChart, Panel, QrCode, RouterLink, ServiceHistoryView, SiteMap, Skeleton, StatusBadge, Tabs, TransferManager, WarrantyManager,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './asset-detail.page.html',
})
export class AssetDetailPage {
  private readonly api = inject(AssetApi);
  private readonly entitlementsApi = inject(EntitlementApi);
  private readonly historyApi = inject(ServiceHistoryApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly handoff = inject(AssetHandoff);

  readonly assetId = input.required<string>();
  readonly tab = input<string>();
  readonly action = input<string>();

  protected readonly activeTab = linkedSignal<AssetTab>(() => (TABS.includes(this.tab() as AssetTab) ? (this.tab() as AssetTab) : 'overview'));
  protected readonly pendingAction = linkedSignal(() => this.action() ?? null);
  protected readonly refreshKey = signal(0);

  protected readonly assetRes = rxResource({ params: () => ({ id: this.assetId(), key: this.refreshKey() }), stream: ({ params }) => this.api.get(params.id) });
  protected readonly relatedRes = rxResource({ params: () => ({ id: this.assetId(), key: this.refreshKey() }), stream: ({ params }) => this.api.related(params.id) });
  protected readonly locationsRes = rxResource({ params: () => ({ id: this.assetId(), key: this.refreshKey() }), stream: ({ params }) => this.api.locationHistory(params.id) });
  protected readonly coveragesRes = rxResource({ params: () => ({ id: this.assetId(), key: this.refreshKey() }), stream: ({ params }) => this.entitlementsApi.list({ assetId: params.id }) });
  protected readonly servicesRes = rxResource({ params: () => ({ id: this.assetId(), key: this.refreshKey() }), stream: ({ params }) => this.historyApi.list({ assetId: params.id }) });
  protected readonly partsRes = rxResource({ params: () => ({ id: this.assetId(), key: this.refreshKey() }), stream: ({ params }) => this.historyApi.parts({ assetId: params.id }) });

  protected readonly a = computed(() => (this.assetRes.hasValue() ? this.assetRes.value() : null));
  protected readonly r = computed(() => (this.relatedRes.hasValue() ? this.relatedRes.value() : null));
  protected readonly services = computed(() => (this.servicesRes.hasValue() ? this.servicesRes.value() : []));
  protected readonly coverages = computed(() => (this.coveragesRes.hasValue() ? this.coveragesRes.value() : []));
  protected readonly blocked = computed(() => !!this.a() && TRANSACTION_BLOCKED_STATUSES.includes(this.a()!.status));

  protected readonly tabs = computed<TabItem[]>(() => {
    const a = this.a();
    const r = this.r();
    return [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'technical', label: 'Technical Details' },
      { id: 'location', label: 'Location' },
      { id: 'components', label: 'Components', count: a?.componentCount },
      { id: 'warranty', label: 'Warranty' },
      { id: 'contracts', label: 'Contracts / AMCs', count: this.coverages().length },
      { id: 'entitlements', label: 'SLA / Entitlements' },
      { id: 'maintenance', label: 'Maintenance', count: r?.maintenance.length },
      { id: 'service-requests', label: 'Service Requests', count: r?.serviceRequests.length },
      { id: 'work-orders', label: 'Work Orders', count: r?.workOrders.length },
      { id: 'parts', label: 'Parts Used', count: this.partsRes.hasValue() ? this.partsRes.value().length : null },
      { id: 'service-history', label: 'Service History', count: a?.totalServiceVisits },
      { id: 'documents', label: 'Documents', count: a?.totalDocuments },
      { id: 'costs', label: 'Costs' },
      { id: 'activity', label: 'Activity' },
    ];
  });

  protected readonly requestCols = serviceRequestColumns();
  protected readonly workOrderCols = workOrderColumns();
  protected readonly maintenanceCols = maintenanceColumns();
  protected readonly partCols = partsColumns();
  protected readonly coverageCols = coverageColumns(false);
  protected readonly trackById = (row: { id: string }) => row.id;

  protected readonly statusTone = ASSET_STATUS_TONE;
  protected readonly criticalityTone = CRITICALITY_TONE;
  protected readonly warrantyTone = WARRANTY_STATUS_TONE;
  protected readonly coverageTone = COVERAGE_STATE_TONE;
  protected readonly maintenanceTone = MAINTENANCE_STATUS_TONE;
  protected readonly resultTone = SERVICE_RESULT_TONE;
  protected readonly typeIcon = SERVICE_TYPE_ICON;
  protected readonly technicalFields = TECHNICAL_FIELDS;
  protected readonly stages = LIFECYCLE_STAGES;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatNumber = formatNumber;
  protected readonly relativeTime = relativeTime;

  protected readonly criticality = computed(() => (this.a() ? CRITICALITY_PROFILE[this.a()!.criticality] : null));
  protected readonly attention = computed(() => (this.a() ? attentionReasons(this.a()!) : []));
  protected readonly attributeLabels = computed(() => {
    const a = this.a();
    if (!a) return [];
    const profile = categoryProfile(a.category);
    return Object.entries(a.customAttributes).map(([key, value]) => ({ label: profile.attributes.find((x) => x.key === key)?.label ?? key, value }));
  });
  protected readonly qrValue = computed(() => (this.a() ? `${window.location.origin}/app/assets/${this.a()!.id}` : ''));

  // ----- KPIs (SRS 3.6) ----------------------------------------------------------

  protected readonly age = computed(() => {
    const a = this.a();
    if (!a?.installation.date) return a ? 'Not installed' : '';
    const days = daysBetween(a.installation.date, new Date());
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return years ? `${years}y ${months}m` : `${months}m ${days % 30}d`;
  });
  protected readonly warrantyRemaining = computed(() => {
    const a = this.a();
    if (!a?.warrantyEnd) return 'No warranty';
    const days = daysBetween(new Date(), a.warrantyEnd);
    return a.warrantyStatus === 'Cancelled' ? 'Cancelled' : days < 0 ? 'Expired' : `${days} days`;
  });
  protected readonly nextMaintenance = computed(() => this.r()?.maintenance[0] ?? null);

  /** SRS 3.15 — current lifecycle stage index. */
  protected readonly stageIndex = computed(() => {
    const a = this.a();
    if (!a) return 0;
    if (a.status === 'Decommissioned') return 14;
    if (a.status === 'Retired') return 13;
    if (a.status === 'Planned') return 0;
    if (a.status === 'Ordered') return 1;
    if (a.status === 'Received') return 2;
    if (a.status === 'Transferred') return 11;
    if (!a.installation.commissioningDate) return 3;
    if (a.status === 'Under Repair') return 10;
    if (a.openWorkOrders) return 9;
    if (a.openServiceRequests) return 8;
    if (a.coverageState === 'Expired' || a.warrantyStatus === 'Expired') return 12;
    if (a.coverageState === 'Active' || a.coverageState === 'Expiring') return 7;
    if (a.warrantyStatus === 'Active' || a.warrantyStatus === 'Expiring Soon') return 5;
    return 4;
  });

  // ----- Costs -------------------------------------------------------------------

  protected readonly costs = computed(() => {
    const records = this.services();
    const labor = records.reduce((s, r) => s + r.laborCost, 0);
    const parts = records.reduce((s, r) => s + r.partsCost, 0);
    const maintenance = records.filter((r) => MAINTENANCE_SERVICE_TYPES.includes(r.serviceType)).reduce((s, r) => s + r.serviceCost, 0);
    const repairs = records.filter((r) => FAILURE_SERVICE_TYPES.includes(r.serviceType) || r.serviceType === 'Warranty Service').reduce((s, r) => s + r.serviceCost, 0);
    const chargeable = records.filter((r) => !r.coveredBy && !r.warrantyService).reduce((s, r) => s + r.serviceCost, 0);
    const byYear = new Map<string, number>();
    for (const r of [...records].reverse()) byYear.set(r.date.slice(0, 4), (byYear.get(r.date.slice(0, 4)) ?? 0) + r.serviceCost);
    const byType = new Map<string, { count: number; cost: number }>();
    for (const r of records) {
      const row = byType.get(r.serviceType) ?? { count: 0, cost: 0 };
      byType.set(r.serviceType, { count: row.count + 1, cost: row.cost + r.serviceCost });
    }
    return {
      labor, parts, total: labor + parts, maintenance, repairs, chargeable, covered: labor + parts - chargeable,
      years: { labels: [...byYear.keys()], values: [...byYear.values()].map(Math.round) },
      types: [...byType].map(([type, v]) => ({ type, ...v })).sort((x, y) => y.cost - x.cost),
    };
  });

  protected readonly pins = computed<MapPin[]>(() => {
    const a = this.a();
    return a?.latitude != null && a.longitude != null ? [{ id: a.siteId ?? a.id, lat: a.latitude, lng: a.longitude, label: a.siteName ?? a.name, status: a.status }] : [];
  });

  // ----- Actions ------------------------------------------------------------------

  protected readonly moreActions = computed<MenuItem[]>(() => {
    const a = this.a();
    const blocked = this.blocked();
    const hint = blocked ? `Not available for ${a?.status.toLowerCase()} assets` : undefined;
    const items: MenuItem[] = [
      { id: 'create-request', label: 'Create Service Request', icon: 'ticket', disabled: blocked, hint },
      { id: 'create-work-order', label: 'Create Work Order', icon: 'wrench', disabled: blocked, hint },
      { id: 'schedule-maintenance', label: 'Schedule Maintenance', icon: 'calendar-check', disabled: blocked, hint },
      { id: 'transfer', label: 'Transfer Asset', icon: 'arrow-right', disabled: blocked || a?.status === 'Transferred', hint, dividerBefore: true },
      { id: 'add-component', label: 'Add Component', icon: 'layers', disabled: blocked, hint },
      { id: 'add-document', label: 'Add Document', icon: 'upload' },
      { id: 'service-history', label: 'View Service History', icon: 'history' },
      { id: 'label', label: 'Print Asset Label', icon: 'qr-code' },
    ];
    if (a && PRE_INSTALLATION_STATUSES.includes(a.status)) items.push({ id: 'install', label: 'Schedule Installation', icon: 'wrench', dividerBefore: true });
    if (a && INACTIVE_STATUSES.includes(a.status) && a.status !== 'Transferred') items.push({ id: 'reactivate', label: 'Reactivate Asset', icon: 'check-circle', dividerBefore: true });
    else if (a && STATUS_TRANSITIONS[a.status].includes('Temporarily Out of Service')) items.push({ id: 'deactivate', label: 'Deactivate Asset', icon: 'ban', dividerBefore: true });
    if (a?.status === 'Retired') items.push({ id: 'decommission', label: 'Decommission Asset', icon: 'ban', danger: true, dividerBefore: true });
    else if (a && STATUS_TRANSITIONS[a.status].includes('Retired')) items.push({ id: 'retire', label: 'Retire Asset', icon: 'archive', danger: true, dividerBefore: true });
    return items;
  });

  constructor() {
    effect(() => {
      if (this.action()) untracked(() => void this.router.navigate([], { queryParams: { action: null }, queryParamsHandling: 'merge', replaceUrl: true }));
    });
    effect(() => {
      const a = this.a();
      if (a) untracked(() => trackRecentAsset({ id: a.id, code: a.code, name: a.name, status: a.status }));
    });
  }

  protected selectTab(tab: string): void {
    this.activeTab.set(tab as AssetTab);
    this.pendingAction.set(null);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected refresh(): void {
    this.refreshKey.update((k) => k + 1);
  }

  protected startHandoff(action: AssetHandoffAction): void {
    const a = this.a();
    if (a) this.handoff.open(action, { id: a.id, code: a.code, name: a.name, customerName: a.customerName, siteName: a.siteName });
  }

  protected async onAction(id: string): Promise<void> {
    const a = this.a();
    if (!a) return;
    const goto = (tab: AssetTab, action: string | null = null) => {
      this.activeTab.set(tab);
      this.pendingAction.set(action);
    };
    switch (id) {
      case 'create-request':
        this.startHandoff('Create Service Request');
        break;
      case 'create-work-order':
        this.startHandoff('Create Work Order');
        break;
      case 'schedule-maintenance':
        this.startHandoff('Schedule Maintenance');
        break;
      case 'transfer':
        goto('location', 'transfer');
        break;
      case 'add-component':
        goto('components', 'add-component');
        break;
      case 'add-document':
        goto('documents', 'upload');
        break;
      case 'service-history':
        goto('service-history');
        break;
      case 'label':
        this.labelOpen.set(true);
        break;
      case 'install':
        void this.router.navigate(['/app/assets/installations'], { queryParams: { assetId: a.id } });
        break;
      case 'reactivate':
        await this.setStatus('Active', 'Asset reactivated.');
        break;
      case 'deactivate':
        if (await this.confirm.open({ title: 'Deactivate asset?', message: `${a.name} will be set to Temporarily Out of Service. History is preserved and it can be reactivated.`, confirmLabel: 'Deactivate', danger: true })) {
          await this.setStatus('Temporarily Out of Service', 'Asset deactivated.');
        }
        break;
      case 'retire':
        if (await this.confirm.open({ title: 'Retire asset?', message: `${a.name} (${a.code}) will be retired. New service requests, work orders and maintenance are blocked; the asset is never deleted and its history is retained.`, confirmLabel: 'Retire asset', danger: true })) {
          await this.setStatus('Retired', 'Asset retired.');
        }
        break;
      case 'decommission':
        if (await this.confirm.open({ title: 'Decommission asset?', message: `${a.name} (${a.code}) will be permanently decommissioned. This is the final lifecycle status.`, confirmLabel: 'Decommission', danger: true })) {
          await this.setStatus('Decommissioned', 'Asset decommissioned.');
        }
        break;
    }
  }

  private async setStatus(status: 'Active' | 'Temporarily Out of Service' | 'Retired' | 'Decommissioned', message: string): Promise<void> {
    try {
      await firstValueFrom(this.api.setStatus([this.assetId()], status));
      this.notify.success(message);
      this.refresh();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  // ----- Label ---------------------------------------------------------------------

  protected readonly labelOpen = signal(false);

  protected printLabel(): void {
    const label = document.getElementById('asset-label');
    const popup = window.open('', '_blank', 'width=480,height=600');
    if (!label || !popup) return;
    popup.document.write(`<!doctype html><html><head><title>${this.a()?.code ?? 'Asset'} label</title><style>body{font-family:system-ui,sans-serif;margin:24px}svg{display:block;margin:0 auto}</style></head><body>${label.outerHTML}</body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  protected isEndOfLife(): boolean {
    return !!this.a() && END_OF_LIFE_STATUSES.includes(this.a()!.status);
  }
}
