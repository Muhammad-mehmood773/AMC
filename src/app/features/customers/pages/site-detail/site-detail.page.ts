import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { ActionMenu, type MenuItem } from '@shared/ui/action-menu';
import { DataTable } from '@shared/ui/data-table';
import { DetailItem } from '@shared/ui/detail-item';
import { ErrorState } from '@shared/ui/error-state';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { Breadcrumbs } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Skeleton } from '@shared/ui/skeleton';
import { StatusBadge } from '@shared/ui/status-badge';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { formatDate, formatDateTime } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { ActivityTimeline } from '../../components/activity-timeline';
import { ContactManager } from '../../components/contact-manager';
import { DocumentManager } from '../../components/document-manager';
import {
  agreementColumns,
  assetColumns,
  maintenanceColumns,
  serviceHistoryColumns,
  serviceRequestColumns,
  workOrderColumns,
} from '../../components/related-columns';
import { RelatedRecordsApi, SiteApi } from '../../data/customer-site.api';
import {
  TRANSACTION_BLOCKED_CUSTOMER_STATUSES,
  TRANSACTION_BLOCKED_SITE_STATUSES,
} from '../../data/customer-site.config';
import { CustomerLookupsStore } from '../../data/lookups.store';
import { type HandoffAction, ModuleHandoff } from '../../data/module-handoff.service';
import type { CustomerStatus } from '../../models/customer.model';
import { PRIORITY_TONE, SITE_STATUS_TONE, recordTone } from '../../models/display';

const TABS = [
  'overview',
  'contacts',
  'assets',
  'contracts',
  'amcs',
  'service-requests',
  'work-orders',
  'maintenance',
  'service-history',
  'documents',
  'activity',
] as const;
type SiteTab = (typeof TABS)[number];

const HANDOFFS: Record<string, HandoffAction> = {
  'add-asset': 'Add Asset',
  'create-request': 'Create Service Request',
  'create-work-order': 'Create Work Order',
};

@Component({
  selector: 'amc-site-detail-page',
  imports: [
    ActionMenu,
    ActivityTimeline,
    Breadcrumbs,
    ContactManager,
    DataTable,
    DetailItem,
    DocumentManager,
    ErrorState,
    Icon,
    KpiCard,
    NgTemplateOutlet,
    Panel,
    RouterLink,
    Skeleton,
    StatusBadge,
    Tabs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './site-detail.page.html',
})
export class SiteDetailPage {
  private readonly sitesApi = inject(SiteApi);
  private readonly relatedApi = inject(RelatedRecordsApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly handoff = inject(ModuleHandoff);
  protected readonly lookups = inject(CustomerLookupsStore);

  readonly siteId = input.required<string>();
  readonly tab = input<string>();
  readonly action = input<string>();

  protected readonly activeTab = linkedSignal<SiteTab>(() =>
    TABS.includes(this.tab() as SiteTab) ? (this.tab() as SiteTab) : 'overview',
  );
  protected readonly pendingAction = linkedSignal(() => this.action() ?? null);

  protected readonly siteRes = rxResource({
    params: () => this.siteId(),
    stream: ({ params }) => this.sitesApi.get(params),
  });
  protected readonly related = rxResource({
    params: () => this.siteId(),
    stream: ({ params }) => this.relatedApi.forSite(params),
  });

  protected readonly s = computed(() => (this.siteRes.hasValue() ? this.siteRes.value() : null));
  protected readonly r = computed(() => (this.related.hasValue() ? this.related.value() : null));
  protected readonly blocked = computed(() => {
    const s = this.s();
    return (
      !!s &&
      (TRANSACTION_BLOCKED_SITE_STATUSES.includes(s.status) ||
        TRANSACTION_BLOCKED_CUSTOMER_STATUSES.includes(s.customerStatus as CustomerStatus))
    );
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const r = this.r();
    return [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'contacts', label: 'Contacts' },
      { id: 'assets', label: 'Assets', count: r?.assets.length },
      { id: 'contracts', label: 'Contracts', count: r?.contracts.length },
      { id: 'amcs', label: 'AMCs', count: r?.amcs.length },
      { id: 'service-requests', label: 'Service Requests', count: r?.serviceRequests.length },
      { id: 'work-orders', label: 'Work Orders', count: r?.workOrders.length },
      { id: 'maintenance', label: 'Maintenance', count: r?.maintenance.length },
      { id: 'service-history', label: 'Service History', count: r?.serviceHistory.length },
      { id: 'documents', label: 'Documents' },
      { id: 'activity', label: 'Activity' },
    ];
  });

  protected readonly assetCols = assetColumns();
  protected readonly contractCols = agreementColumns();
  protected readonly requestCols = serviceRequestColumns();
  protected readonly workOrderCols = workOrderColumns();
  protected readonly maintenanceCols = maintenanceColumns();
  protected readonly historyCols = serviceHistoryColumns();
  protected readonly trackById = (row: { id: string }) => row.id;

  protected readonly moreActions = computed<MenuItem[]>(() => {
    const blocked = this.blocked();
    const hint = blocked ? 'Not available for inactive sites or customers' : undefined;
    const s = this.s();
    return [
      { id: 'add-contact', label: 'Add Contact', icon: 'user-plus' },
      { id: 'add-asset', label: 'Add Asset', icon: 'box', disabled: blocked, hint },
      { id: 'create-request', label: 'Create Service Request', icon: 'ticket', disabled: blocked, hint },
      { id: 'create-work-order', label: 'Create Work Order', icon: 'wrench', disabled: blocked, hint },
      { id: 'upload-document', label: 'Upload Document', icon: 'upload' },
      s && (s.status === 'Inactive' || s.status === 'Archived')
        ? { id: 'activate', label: 'Activate Site', icon: 'check-circle', dividerBefore: true }
        : { id: 'deactivate', label: 'Deactivate Site', icon: 'ban', danger: true, dividerBefore: true },
    ];
  });

  protected readonly statusTone = SITE_STATUS_TONE;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly recordTone = recordTone;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;

  constructor() {
    effect(() => {
      if (this.action()) {
        untracked(() =>
          void this.router.navigate([], { queryParams: { action: null }, queryParamsHandling: 'merge', replaceUrl: true }),
        );
      }
    });
  }

  protected selectTab(tab: string): void {
    this.activeTab.set(tab as SiteTab);
    this.pendingAction.set(null);
    void this.router.navigate([], {
      queryParams: { tab: tab === 'overview' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected isVisitDay(day: string): boolean {
    return (this.s()?.preferredVisitDays as readonly string[] | undefined)?.includes(day) ?? false;
  }

  protected tabLink(tab: SiteTab): Record<string, string> {
    return { tab };
  }

  protected refresh(): void {
    this.siteRes.reload();
    this.related.reload();
  }

  protected async onAction(id: string): Promise<void> {
    const s = this.s();
    if (!s) return;
    if (HANDOFFS[id]) {
      this.handoff.open(HANDOFFS[id], { customerName: s.customerName, siteName: s.name });
      return;
    }
    switch (id) {
      case 'add-contact':
        this.activeTab.set('contacts');
        this.pendingAction.set('add-contact');
        break;
      case 'upload-document':
        this.activeTab.set('documents');
        this.pendingAction.set('upload');
        break;
      case 'deactivate': {
        const ok = await this.confirm.open({
          title: 'Deactivate site?',
          message: `${s.name} has ${s.totalAssets} assets and ${s.activeContracts + s.activeAmcs} active agreements. Deactivation blocks new service requests and work orders; the site is never deleted and its history is retained.`,
          confirmLabel: 'Deactivate',
          danger: true,
        });
        if (ok) await this.setStatus('Inactive');
        break;
      }
      case 'activate':
        await this.setStatus('Active');
        break;
    }
  }

  protected async setStatus(status: 'Active' | 'Inactive'): Promise<void> {
    const s = this.s();
    if (!s) return;
    try {
      await firstValueFrom(this.sitesApi.setStatus(s.id, status));
      this.notify.success(`${s.name} ${status === 'Active' ? 'activated' : 'deactivated'}.`);
      this.siteRes.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }
}
