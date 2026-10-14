import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { ActionMenu, type MenuItem } from '@shared/ui/action-menu';
import { Avatar } from '@shared/ui/avatar';
import { type DataColumn, DataTable } from '@shared/ui/data-table';
import { DetailItem } from '@shared/ui/detail-item';
import { ErrorState } from '@shared/ui/error-state';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { Breadcrumbs } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Skeleton } from '@shared/ui/skeleton';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { formatCurrency, formatDate, formatDateTime } from '@shared/utils/format';
import { firstValueFrom, of } from 'rxjs';
import { ActivityTimeline } from '../../components/activity-timeline';
import { ContactManager } from '../../components/contact-manager';
import { DocumentManager } from '../../components/document-manager';
import {
  agreementColumns,
  assetColumns,
  invoiceColumns,
  serviceHistoryColumns,
  serviceRequestColumns,
  workOrderColumns,
} from '../../components/related-columns';
import { ActivityApi, CustomerApi, RelatedRecordsApi, SiteApi } from '../../data/customer-site.api';
import { TRANSACTION_BLOCKED_CUSTOMER_STATUSES } from '../../data/customer-site.config';
import { CustomerLookupsStore } from '../../data/lookups.store';
import { type HandoffAction, ModuleHandoff } from '../../data/module-handoff.service';
import { CUSTOMER_STATUS_TONE, PRIORITY_TONE, SITE_STATUS_TONE } from '../../models/display';
import type { SiteListItem } from '../../models/site.model';

const TABS = [
  'overview',
  'contacts',
  'sites',
  'assets',
  'contracts',
  'amcs',
  'service-requests',
  'work-orders',
  'service-history',
  'invoices',
  'documents',
  'notes',
  'comms',
  'activity',
] as const;
type CustomerTab = (typeof TABS)[number];

export interface HealthScore {
  score: 'Good' | 'At Risk' | 'Critical';
  tone: 'ok' | 'warn' | 'danger';
  reasons: string[];
}

@Component({
  selector: 'amc-customer-detail-page',
  imports: [
    ActionMenu,
    ActivityTimeline,
    Avatar,
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
    Spinner,
    StatusBadge,
    Tabs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-detail.page.html',
})
export class CustomerDetailPage {
  private readonly customersApi = inject(CustomerApi);
  private readonly sitesApi = inject(SiteApi);
  private readonly relatedApi = inject(RelatedRecordsApi);
  private readonly activityApi = inject(ActivityApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly handoff = inject(ModuleHandoff);
  protected readonly lookups = inject(CustomerLookupsStore);

  readonly customerId = input.required<string>();
  readonly tab = input<string>();
  readonly action = input<string>();

  protected readonly activeTab = linkedSignal<CustomerTab>(() =>
    TABS.includes(this.tab() as CustomerTab) ? (this.tab() as CustomerTab) : 'overview',
  );
  /** Deep-link actions are consumed once so they do not re-trigger on tab changes. */
  protected readonly pendingAction = linkedSignal(() => this.action() ?? null);

  protected readonly customer = rxResource({
    params: () => this.customerId(),
    stream: ({ params }) => this.customersApi.get(params),
  });
  protected readonly related = rxResource({
    params: () => this.customerId(),
    stream: ({ params }) => this.relatedApi.forCustomer(params),
  });
  protected readonly sites = rxResource({
    params: () => this.customerId(),
    stream: ({ params }) => this.sitesApi.list({ customerId: params }),
  });
  protected readonly recentActivity = rxResource({
    params: () => (this.activeTab() === 'overview' ? this.customerId() : undefined),
    stream: ({ params }) => (params ? this.activityApi.list({ customerId: params }) : of([])),
  });

  protected readonly c = computed(() => (this.customer.hasValue() ? this.customer.value() : null));
  protected readonly r = computed(() => (this.related.hasValue() ? this.related.value() : null));
  protected readonly siteRows = computed(() => (this.sites.hasValue() ? this.sites.value() : []));
  protected readonly activityPreview = computed(() =>
    (this.recentActivity.hasValue() ? (this.recentActivity.value() ?? []) : []).slice(0, 6),
  );
  protected readonly blocked = computed(() => {
    const c = this.c();
    return !!c && TRANSACTION_BLOCKED_CUSTOMER_STATUSES.includes(c.status);
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const c = this.c();
    const r = this.r();
    return [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'contacts', label: 'Contacts', count: c?.totalContacts },
      { id: 'sites', label: 'Sites', count: this.siteRows().length },
      { id: 'assets', label: 'Assets', count: r?.assets.length },
      { id: 'contracts', label: 'Contracts', count: r?.contracts.length },
      { id: 'amcs', label: 'AMCs', count: r?.amcs.length },
      { id: 'service-requests', label: 'Service Requests', count: r?.serviceRequests.length },
      { id: 'work-orders', label: 'Work Orders', count: r?.workOrders.length },
      { id: 'service-history', label: 'Service History', count: r?.serviceHistory.length },
      { id: 'invoices', label: 'Invoices', count: r?.invoices.length },
      { id: 'documents', label: 'Documents', count: c?.totalDocuments },
      { id: 'notes', label: 'Notes' },
      { id: 'comms', label: 'Communications' },
      { id: 'activity', label: 'Activity' },
    ];
  });

  private readonly siteName = (id: string) => this.siteRows().find((s) => s.id === id)?.name ?? id;
  protected readonly assetCols = assetColumns(this.siteName);
  protected readonly contractCols = agreementColumns();
  protected readonly requestCols = serviceRequestColumns(this.siteName);
  protected readonly workOrderCols = workOrderColumns(this.siteName);
  protected readonly historyCols = serviceHistoryColumns(this.siteName);
  protected readonly invoiceCols = invoiceColumns();
  protected readonly siteCols: DataColumn<SiteListItem>[] = [
    { key: 'name', label: 'Site', value: (s) => s.name, secondary: (s) => s.code, link: (s) => `/app/customers/sites/${s.id}`, sortable: true, mobile: 'title' },
    { key: 'type', label: 'Site Type', value: (s) => s.type, sortable: true, visibility: 'md', mobile: 'meta' },
    { key: 'city', label: 'City', value: (s) => s.location.city, secondary: (s) => s.location.region, sortable: true, visibility: 'lg', mobile: 'meta' },
    { key: 'contact', label: 'Site Contact', value: (s) => s.primaryContactName, visibility: 'xl' },
    { key: 'assets', label: 'Assets', value: (s) => s.totalAssets, type: 'number', sortable: true, visibility: 'lg' },
    { key: 'contracts', label: 'Contracts', value: (s) => s.activeContracts, type: 'number', sortable: true, visibility: 'xl' },
    { key: 'requests', label: 'Open SRs', value: (s) => s.openServiceRequests, type: 'number', sortable: true, visibility: 'xl' },
    { key: 'status', label: 'Status', value: (s) => s.status, type: 'badge', tone: (s) => SITE_STATUS_TONE[s.status], sortable: true, mobile: 'badge' },
  ];
  protected readonly trackById = (row: { id: string }) => row.id;

  protected readonly moreActions = computed<MenuItem[]>(() => {
    const blocked = this.blocked();
    const hint = blocked ? 'Not available for inactive customers' : undefined;
    const c = this.c();
    return [
      { id: 'add-contact', label: 'Add Contact', icon: 'user-plus' },
      { id: 'add-asset', label: 'Add Asset', icon: 'box', disabled: blocked, hint },
      { id: 'create-contract', label: 'Create Contract', icon: 'file-check', disabled: blocked, hint },
      { id: 'create-amc', label: 'Create AMC', icon: 'shield-check', disabled: blocked, hint },
      { id: 'create-request', label: 'Create Service Request', icon: 'ticket', disabled: blocked, hint },
      { id: 'upload-document', label: 'Upload Document', icon: 'upload' },
      c && (c.status === 'Active' || c.status === 'On Hold')
        ? { id: 'deactivate', label: 'Deactivate Customer', icon: 'ban', danger: true, dividerBefore: true }
        : { id: 'activate', label: 'Activate Customer', icon: 'check-circle', dividerBefore: true },
    ];
  });

  // Notes tab
  protected readonly internalNotes = linkedSignal(() => this.c()?.internalNotes ?? '');
  protected readonly customerNotes = linkedSignal(() => this.c()?.customerNotes ?? '');
  protected readonly notesDirty = computed(
    () => this.internalNotes() !== (this.c()?.internalNotes ?? '') || this.customerNotes() !== (this.c()?.customerNotes ?? ''),
  );
  protected readonly savingNotes = signal(false);

  protected readonly statusTone = CUSTOMER_STATUS_TONE;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly siteStatusTone = SITE_STATUS_TONE;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;

  // ── #19 Health score ───────────────────────────────────────────
  protected readonly healthScore = computed<HealthScore>(() => {
    const c = this.c();
    if (!c) return { score: 'Good', tone: 'ok', reasons: [] };
    const reasons: string[] = [];
    if (c.openServiceRequests > 3) reasons.push(`${c.openServiceRequests} open service requests`);
    if (c.outstandingAmount > 0) reasons.push('Outstanding invoices');
    if (c.activeContracts === 0 && c.activeAmcs === 0) reasons.push('No active contract or AMC');
    if (c.status === 'On Hold') reasons.push('Account on hold');
    if (c.status === 'Inactive' || c.status === 'Archived') reasons.push('Account inactive');
    const score = reasons.length === 0 ? 'Good' : reasons.length <= 1 ? 'At Risk' : 'Critical';
    const tone = score === 'Good' ? 'ok' : score === 'At Risk' ? 'warn' : 'danger';
    return { score, tone, reasons };
  });

  // ── #24 Site status summary ────────────────────────────────────
  protected readonly siteStatusSummary = computed(() => {
    const rows = this.siteRows();
    return {
      active:   rows.filter((s) => s.status === 'Active').length,
      inactive: rows.filter((s) => s.status === 'Inactive').length,
      planned:  rows.filter((s) => s.status === 'Planned').length,
      total:    rows.length,
    };
  });

  // ── #20 Quick notes (localStorage) ────────────────────────────
  private get quickNotesKey(): string { return `amc.quicknotes.${this.customerId()}`; }
  protected readonly quickNote = signal('');
  protected readonly quickNotes = signal<Array<{ id: string; text: string; ts: number }>>([]);

  private loadQuickNotes(): void {
    try {
      const raw = localStorage.getItem(this.quickNotesKey);
      this.quickNotes.set(raw ? (JSON.parse(raw) as Array<{ id: string; text: string; ts: number }>) : []);
    } catch { this.quickNotes.set([]); }
  }

  private saveQuickNotes(): void {
    try { localStorage.setItem(this.quickNotesKey, JSON.stringify(this.quickNotes())); } catch { /* ignore */ }
  }

  protected addQuickNote(): void {
    const text = this.quickNote().trim();
    if (!text) return;
    this.quickNotes.update((n) => [{ id: crypto.randomUUID(), text, ts: Date.now() }, ...n]);
    this.quickNote.set('');
    this.saveQuickNotes();
  }

  protected removeQuickNote(id: string): void {
    this.quickNotes.update((n) => n.filter((x) => x.id !== id));
    this.saveQuickNotes();
  }

  // ── #21 Relationship map ───────────────────────────────────────
  protected readonly relMapExpanded = signal<Set<string>>(new Set());
  protected toggleRelNode(id: string): void {
    this.relMapExpanded.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── #22 Mock comms history ─────────────────────────────────────
  protected readonly mockComms = computed(() => {
    const c = this.c();
    if (!c) return [];
    const base = new Date('2026-08-01').getTime();
    return [
      { id: '1', type: 'Email', direction: 'Outbound', subject: 'Contract renewal proposal', contact: c.primaryContactName ?? 'Primary Contact', date: new Date(base + 1e7), outcome: 'Sent' },
      { id: '2', type: 'Call',  direction: 'Inbound',  subject: 'Service request follow-up', contact: c.primaryContactName ?? 'Primary Contact', date: new Date(base + 2e7), outcome: 'Completed' },
      { id: '3', type: 'Email', direction: 'Inbound',  subject: 'Invoice query',              contact: c.primaryContactName ?? 'Primary Contact', date: new Date(base + 3e7), outcome: 'Received' },
      { id: '4', type: 'Visit', direction: 'Outbound', subject: 'Quarterly account review',   contact: c.primaryContactName ?? 'Primary Contact', date: new Date(base + 4e7), outcome: 'Completed' },
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
  });

  constructor() {
    // Strip one-shot action params from the URL after they have been handed to child components.
    effect(() => {
      if (this.action()) {
        untracked(() =>
          void this.router.navigate([], { queryParams: { action: null }, queryParamsHandling: 'merge', replaceUrl: true }),
        );
      }
    });
    // Load quick notes whenever customer changes.
    effect(() => {
      if (this.customerId()) untracked(() => this.loadQuickNotes());
    });
  }

  protected print(): void {
    window.print();
  }

  protected selectTab(tab: string): void {
    this.activeTab.set(tab as CustomerTab);
    this.pendingAction.set(null);
    void this.router.navigate([], {
      queryParams: { tab: tab === 'overview' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected handoffId(action: string): string {
    const ids: Record<string, string> = {
      'Add Asset': 'add-asset',
      'Create Contract': 'create-contract',
      'Create AMC': 'create-amc',
      'Create Service Request': 'create-request',
    };
    return ids[action] ?? '';
  }

  protected tabLink(tab: CustomerTab): Record<string, string> {
    return { tab };
  }

  protected refresh(): void {
    this.customer.reload();
    this.related.reload();
    this.sites.reload();
  }

  protected async onMoreAction(id: string): Promise<void> {
    const c = this.c();
    if (!c) return;
    const handoffs: Record<string, HandoffAction> = {
      'add-asset': 'Add Asset',
      'create-contract': 'Create Contract',
      'create-amc': 'Create AMC',
      'create-request': 'Create Service Request',
    };
    if (handoffs[id]) {
      this.handoff.open(handoffs[id], { customerName: c.name });
      return;
    }
    switch (id) {
      case 'add-contact':
        this.openWithAction('contacts', 'add-contact');
        break;
      case 'upload-document':
        this.openWithAction('documents', 'upload');
        break;
      case 'deactivate': {
        const ok = await this.confirm.open({
          title: 'Deactivate customer?',
          message: `${c.name} will be restricted from new sites, contracts, AMCs and service requests. All history is retained and the customer can be reactivated.`,
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
    const c = this.c();
    if (!c) return;
    try {
      await firstValueFrom(this.customersApi.setStatus([c.id], status));
      this.notify.success(`${c.name} ${status === 'Active' ? 'activated' : 'deactivated'}.`);
      this.customer.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  protected async saveNotes(): Promise<void> {
    const c = this.c();
    if (!c) return;
    this.savingNotes.set(true);
    try {
      await firstValueFrom(
        this.customersApi.updateNotes(c.id, { internalNotes: this.internalNotes(), customerNotes: this.customerNotes() }),
      );
      this.notify.success('Notes saved.');
      this.customer.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.savingNotes.set(false);
    }
  }

  protected onNotesInput(target: 'internal' | 'customer', event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    (target === 'internal' ? this.internalNotes : this.customerNotes).set(value);
  }

  private openWithAction(tab: CustomerTab, action: string): void {
    this.activeTab.set(tab);
    this.pendingAction.set(action);
  }
}
