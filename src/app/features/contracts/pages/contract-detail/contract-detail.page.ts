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
import { ContractActionHost, contractActions } from '../../components/contract-action-host';
import { amendmentColumns, approvalColumns, obligationColumns, renewalColumns } from '../../components/contract-columns';
import { ContractHistoryTimeline } from '../../components/contract-history-timeline';
import { LifecycleStepper } from '../../components/lifecycle-stepper';
import { VersionCompare } from '../../components/version-compare';
import { ContractReferenceStore } from '../../data/contract-reference.store';
import { AmendmentApi, ApprovalApi, ContractApi, ObligationApi, RenewalApi, SignatureApi } from '../../data/contract.api';
import { APPROVAL_TONE, CONTRACT_STATUS_TONE, SIGNATURE_TONE, SIGNER_TONE } from '../../models/display';
import { DOCUMENT_TYPES, type ContractDocument, type DocumentType } from '../../models/workflow.model';

const TABS = ['overview', 'parties', 'scope', 'services', 'sites', 'assets', 'sla', 'entitlements', 'billing', 'obligations', 'amendments', 'renewals', 'documents', 'versions', 'approvals', 'signatures', 'service-history', 'financials', 'activity'] as const;
type Tab = (typeof TABS)[number];

interface RefRow {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly extra: string;
  readonly status: string;
}

@Component({
  selector: 'amc-contract-detail-page',
  imports: [
    ActionMenu, Breadcrumbs, ContractActionHost, ContractHistoryTimeline, DataTable, DetailItem, ErrorState, Icon, KpiCard, LifecycleStepper, Panel, RouterLink, Select, Skeleton, StatusBadge, Tabs, VersionCompare,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contract-detail.page.html',
})
export class ContractDetailPage {
  private readonly api = inject(ContractApi);
  private readonly obligationsApi = inject(ObligationApi);
  private readonly amendmentsApi = inject(AmendmentApi);
  private readonly renewalsApi = inject(RenewalApi);
  private readonly approvalsApi = inject(ApprovalApi);
  private readonly signaturesApi = inject(SignatureApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(ContractReferenceStore);
  private readonly host = viewChild.required(ContractActionHost);

  readonly contractId = input.required<string>();
  readonly tab = input<string>();

  protected readonly refreshKey = signal(0);
  protected readonly activeTab = linkedSignal<Tab>(() => (TABS.includes(this.tab() as Tab) ? (this.tab() as Tab) : 'overview'));
  private readonly key = computed(() => ({ id: this.contractId(), k: this.refreshKey() }));
  protected readonly res = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.get(params.id) });
  private readonly obligationsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.obligationsApi.list(params.id) });
  private readonly amendmentsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.amendmentsApi.list(params.id) });
  private readonly renewalsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.renewalsApi.list(params.id) });
  private readonly approvalsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.approvalsApi.list(params.id) });
  private readonly signatureRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.signaturesApi.get(params.id) });
  private readonly documentsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.documents(params.id) });
  private readonly versionsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.versions(params.id) });
  private readonly alertsRes = rxResource({ params: () => this.key(), stream: ({ params }) => this.api.alerts(params.id) });

  protected readonly c = computed(() => (this.res.hasValue() ? this.res.value() : null));
  protected readonly obligations = computed(() => (this.obligationsRes.hasValue() ? this.obligationsRes.value() : []));
  protected readonly amendments = computed(() => (this.amendmentsRes.hasValue() ? this.amendmentsRes.value() : []));
  protected readonly renewals = computed(() => (this.renewalsRes.hasValue() ? this.renewalsRes.value() : []));
  protected readonly approvals = computed(() => (this.approvalsRes.hasValue() ? this.approvalsRes.value() : []));
  protected readonly signature = computed(() => (this.signatureRes.hasValue() ? this.signatureRes.value() : null));
  protected readonly documents = computed(() => (this.documentsRes.hasValue() ? this.documentsRes.value() : []));
  protected readonly versions = computed(() => (this.versionsRes.hasValue() ? this.versionsRes.value() : []));
  protected readonly alerts = computed(() => (this.alertsRes.hasValue() ? this.alertsRes.value() : []));

  protected readonly services = computed<RefRow[]>(() => (this.c()?.scopeInfo.serviceIds ?? []).map((id) => {
    const s = this.refs.data().services.find((x) => x.id === id);
    return { id, name: s?.name ?? id, code: s?.code ?? id, extra: s?.category ?? '', status: s?.status ?? '' };
  }));
  protected readonly sites = computed<RefRow[]>(() => (this.c()?.scopeInfo.siteIds ?? []).map((id) => {
    const s = this.refs.data().sites.find((x) => x.id === id);
    return { id, name: s?.name ?? id, code: s?.code ?? id, extra: s?.city ?? '', status: 'Covered' };
  }));
  protected readonly assets = computed<RefRow[]>(() => (this.c()?.scopeInfo.assetIds ?? []).map((id) => {
    const a = this.refs.data().assets.find((x) => x.id === id);
    return { id, name: a?.name ?? id, code: id, extra: `${a?.category ?? ''} · ${this.refs.name('sites', a?.siteId) ?? ''}`, status: 'Covered' };
  }));
  protected readonly entitlements = computed(() => this.refs.data().entitlements.filter((e) => e.agreementId === this.contractId() || (this.c()?.previousContractId && e.agreementId === this.c()!.previousContractId)));
  protected readonly serviceHistory = computed(() => {
    const c = this.c();
    if (!c) return [];
    return this.refs.data().serviceHistory.filter((h) => c.scopeInfo.siteIds.includes(h.siteId) && h.date.slice(0, 10) >= c.period.startDate && h.date.slice(0, 10) <= c.period.endDate).sort((a, b) => b.date.localeCompare(a.date));
  });
  protected readonly entitlementRows = computed<RefRow[]>(() => this.entitlements().map((e) => ({ id: e.id, name: e.coverageType, code: e.number, extra: e.allowed !== null ? `${e.used} / ${e.allowed} visits used · ends ${formatDate(e.endDate)}` : `Unlimited · ends ${formatDate(e.endDate)}`, status: e.status })));
  protected readonly historyRows = computed<RefRow[]>(() => this.serviceHistory().map((h) => ({ id: h.id, name: h.summary, code: h.reference, extra: `${formatDate(h.date)} · ${h.visitType} · ${h.technician} · ${this.refs.name('sites', h.siteId) ?? ''}`, status: h.outcome })));
  protected readonly financials = computed(() => {
    const c = this.c();
    if (!c) return null;
    const t = c.tracking;
    const grossProfit = t.recognizedRevenue - t.actualCost;
    const discount = Math.round((c.commercial.value * c.commercial.discountPercent) / 100);
    const tax = this.refs.name('taxProfiles', c.commercial.taxProfileId)?.includes('15') ? Math.round(t.billed * 0.15) : 0;
    return { ...t, outstanding: Math.max(0, t.billed - t.collected), grossProfit, grossMargin: t.recognizedRevenue ? Math.round((grossProfit / t.recognizedRevenue) * 100) : 0, discount, tax, billedPct: c.commercial.value ? Math.round((t.billed / c.commercial.value) * 100) : 0 };
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const c = this.c();
    return [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'parties', label: 'Parties' },
      { id: 'scope', label: 'Scope' },
      { id: 'services', label: 'Services', count: c?.scopeInfo.serviceIds.length },
      { id: 'sites', label: 'Sites', count: c?.scopeInfo.siteIds.length },
      { id: 'assets', label: 'Assets', count: c?.scopeInfo.assetIds.length },
      { id: 'sla', label: 'SLA' },
      { id: 'entitlements', label: 'Entitlements', count: this.entitlements().length },
      { id: 'billing', label: 'Billing' },
      { id: 'obligations', label: 'Obligations', count: c?.openObligations || undefined },
      { id: 'amendments', label: 'Amendments', count: this.amendments().length || undefined },
      { id: 'renewals', label: 'Renewals', count: this.renewals().length || undefined },
      { id: 'documents', label: 'Documents', count: this.documents().length },
      { id: 'versions', label: 'Versions', count: this.versions().length },
      { id: 'approvals', label: 'Approvals', count: this.approvals().length || undefined },
      { id: 'signatures', label: 'Signatures' },
      { id: 'service-history', label: 'Service History', count: this.serviceHistory().length || undefined },
      { id: 'financials', label: 'Financials' },
      { id: 'activity', label: 'Activity' },
    ];
  });

  protected readonly menu = computed<MenuItem[]>(() => {
    const c = this.c();
    return c ? [...contractActions(c).filter((i) => i.id !== 'edit'), { id: 'upload', label: 'Upload Document', icon: 'upload', dividerBefore: true }, { id: 'financials', label: 'View Financials', icon: 'wallet' }] : [];
  });

  protected readonly obligationCols = obligationColumns(false);
  protected readonly amendmentCols = amendmentColumns(false);
  protected readonly renewalCols = renewalColumns(false);
  protected readonly approvalCols = approvalColumns(false);
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly statusTone = CONTRACT_STATUS_TONE;
  protected readonly approvalTone = APPROVAL_TONE;
  protected readonly signatureTone = SIGNATURE_TONE;
  protected readonly signerTone = SIGNER_TONE;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatFileSize = formatFileSize;
  protected readonly docTypeOptions = DOCUMENT_TYPES.filter((t) => t !== 'Signed Contract').map((t) => ({ value: t, label: t }));
  protected readonly uploadType = signal<string | number | null>('Supporting Document');

  protected refColumns(label: string, extra: string, link: (r: RefRow) => string | null): DataColumn<RefRow>[] {
    return [
      { key: 'name', label, value: (r) => r.name, secondary: (r) => r.code, link, mobile: 'title', width: 280 },
      { key: 'extra', label: extra, value: (r) => r.extra, mobile: 'meta', width: 320 },
      { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => (['Active', 'Covered', 'Completed', 'Resolved'].includes(r.status) ? 'ok' : ['Expired', 'Cancelled', 'Inactive'].includes(r.status) ? 'neutral' : 'warn'), mobile: 'badge', width: 130 },
    ];
  }

  protected readonly serviceLink = (r: RefRow) => `/app/catalog/services/${r.id}`;
  protected readonly siteLink = (r: RefRow) => `/app/customers/sites/${r.id}`;
  protected readonly assetLink = (r: RefRow) => `/app/assets/${r.id}`;
  protected readonly entitlementLink = (r: RefRow) => `/app/catalog/entitlements/${r.id}`;
  protected readonly noLink = () => null;

  protected refresh(): void {
    this.refreshKey.update((k) => k + 1);
  }

  protected selectTab(tab: string): void {
    this.activeTab.set(tab as Tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onAction(id: string): void {
    const c = this.c();
    if (!c) return;
    if (id === 'upload') this.selectTab('documents');
    else if (id === 'financials') this.selectTab('financials');
    else void this.host().run(id, c);
  }

  protected async upload(event: Event, replaces: ContractDocument | null = null): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const f of files) {
      try {
        await firstValueFrom(this.api.uploadDocument(this.contractId(), (replaces?.type ?? this.uploadType() ?? 'Supporting Document') as DocumentType, { name: f.name, size: f.size, mime: f.type || 'application/octet-stream' }, replaces?.id ?? null));
        this.notify.success(`${f.name} uploaded${replaces ? ` as version ${replaces.version + 1}` : ''}.`);
      } catch (error) {
        this.notify.error((error as Error).message);
      }
    }
    this.refresh();
  }
}
