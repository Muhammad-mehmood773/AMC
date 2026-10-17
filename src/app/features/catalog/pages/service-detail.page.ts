import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
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
import { formatCurrency, formatDate, formatDateTime, formatFileSize } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { entitlementColumns, priceRuleColumns, usageColumns } from '../components/catalog-columns';
import { CatalogHistoryTimeline } from '../components/catalog-history-timeline';
import { CatalogReferenceStore } from '../data/catalog-reference.store';
import { EntitlementApi, PricingApi, ServiceCatalogApi } from '../data/catalog.api';
import { MAINTENANCE_SERVICE_TYPES } from '../models/catalog.model';
import { PRIORITY_TONE, SERVICE_STATUS_TONE, SERVICE_TYPE_ICON } from '../models/display';

const TABS = ['overview', 'description', 'operational', 'pricing', 'sla', 'maintenance', 'resources', 'agreements', 'entitlements', 'usage', 'documents', 'history'] as const;
type ServiceTab = (typeof TABS)[number];

@Component({
  selector: 'amc-service-detail-page',
  imports: [ActionMenu, Breadcrumbs, CatalogHistoryTimeline, DataTable, DetailItem, ErrorState, Icon, KpiCard, Panel, RouterLink, Skeleton, StatusBadge, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (serviceRes.error()) {
      <div class="amc-card">
        <amc-error-state title="Service not found" message="This service could not be loaded." (retry)="serviceRes.reload()" />
        <div class="-mt-6 pb-8 text-center"><a routerLink="/app/catalog/services" class="amc-link text-sm">Back to services</a></div>
      </div>
    } @else if (!s()) {
      <div class="space-y-5"><div class="amc-card space-y-3 p-5"><amc-skeleton class="h-6 w-72" /><amc-skeleton class="h-4 w-48" /></div></div>
    } @else {
      @let svc = s()!;
      <div class="space-y-5">
        <amc-breadcrumbs [items]="[{ label: 'Service Catalog', path: '/app/catalog/dashboard' }, { label: 'Services', path: '/app/catalog/services' }, { label: svc.name }]" />
        <header class="amc-card p-4 sm:p-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="flex min-w-0 items-start gap-4">
              <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand"><amc-icon [name]="typeIcon[svc.type]" [size]="24" /></span>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{{ svc.name }}</h1>
                  <amc-status-badge [label]="svc.status" [tone]="statusTone[svc.status]" />
                </div>
                <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                  <span class="font-mono text-[13px]">{{ svc.code }}</span><span class="text-ink-subtle">·</span>
                  <a [routerLink]="'/app/catalog/services'" [queryParams]="{ category: svc.categoryId }" class="hover:text-brand">{{ svc.categoryName }}{{ svc.subcategoryName ? ' › ' + svc.subcategoryName : '' }}</a><span class="text-ink-subtle">·</span>
                  <span>{{ svc.type }}</span>
                </p>
                <dl class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <div class="flex items-center gap-1.5"><dt class="text-ink-muted">Billing</dt><dd class="font-medium text-ink">{{ svc.commercial.billingMethod }}</dd></div>
                  <div class="flex items-center gap-1.5"><dt class="text-ink-muted">Standard Price</dt><dd class="font-medium text-ink">{{ formatCurrency(svc.commercial.standardPrice, svc.commercial.currency) }} / {{ svc.operational.unit.toLowerCase() }}</dd></div>
                  <div class="flex items-center gap-1.5"><dt class="text-ink-muted">SLA</dt><dd class="font-medium text-ink">{{ svc.sla.applicable ? (svc.slaName ?? 'Custom') : 'Not applicable' }}</dd></div>
                </dl>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 lg:shrink-0">
              <a [routerLink]="['/app/catalog/entitlements/new']" [queryParams]="{ serviceId: svc.id }" class="amc-btn-secondary hidden sm:inline-flex" [class]="svc.status !== 'Active' ? 'pointer-events-none opacity-50' : ''"><amc-icon name="shield-check" /> Create Entitlement</a>
              <a [routerLink]="['/app/catalog/services', svc.id, 'edit']" class="amc-btn-primary"><amc-icon name="pencil" /> Edit</a>
              <amc-action-menu label="Actions" [items]="actions()" (action)="onAction($event)" />
            </div>
          </div>
        </header>

        @if (svc.status !== 'Active') {
          <div class="flex items-center gap-3 rounded-xl border border-line-strong bg-surface-sunken p-4" role="status">
            <amc-icon name="lock" [size]="18" class="text-ink-muted" />
            <p class="text-sm text-ink-muted">This service is <span class="font-medium text-ink">{{ svc.status.toLowerCase() }}</span> and cannot be selected for new operational transactions. Historical transactions remain unchanged.</p>
          </div>
        }

        <amc-tabs [items]="tabs()" [active]="activeTab()" [maxVisible]="9" (activeChange)="selectTab($event)" />

        @switch (activeTab()) {
          @case ('overview') {
            <div class="space-y-5">
              <section class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                <amc-kpi-card label="Standard Duration" icon="clock" [value]="svc.operational.standardDuration !== null ? svc.operational.standardDuration + ' h' : '—'" [hint]="'Unit: ' + svc.operational.unit" />
                <amc-kpi-card label="Standard Price" icon="wallet" tone="brand" [value]="formatCurrency(svc.commercial.standardPrice, svc.commercial.currency)" [hint]="svc.commercial.billable ? 'Billable' : 'Non-billable'" />
                <amc-kpi-card label="Price Rules" icon="receipt" tone="accent" [value]="svc.priceRuleCount" [link]="'/app/catalog/services/' + svc.id" [queryParams]="{ tab: 'pricing' }" />
                <amc-kpi-card label="Active Entitlements" icon="shield-check" tone="ok" [value]="svc.activeEntitlementCount" [hint]="svc.entitlementCount + ' total'" [link]="'/app/catalog/services/' + svc.id" [queryParams]="{ tab: 'entitlements' }" />
                <amc-kpi-card label="Usage" icon="activity" tone="info" [value]="svc.usageCount" hint="Covered services consumed" [link]="'/app/catalog/services/' + svc.id" [queryParams]="{ tab: 'usage' }" />
                <amc-kpi-card label="Contracts / AMCs" icon="file-check" tone="neutral" [value]="agreements().length" [link]="'/app/catalog/services/' + svc.id" [queryParams]="{ tab: 'agreements' }" />
              </section>
              <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <amc-panel class="xl:col-span-2" title="Service definition" icon="list">
                  <dl class="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
                    <amc-detail-item label="Service Code" [value]="svc.code" [mono]="true" />
                    <amc-detail-item label="Short Name" [value]="svc.shortName" />
                    <amc-detail-item label="Service Class" [value]="svc.serviceClass" />
                    <div><dt class="text-xs font-medium text-ink-muted">Priority</dt><dd class="mt-1"><amc-status-badge [label]="svc.priority" [tone]="priorityTone[svc.priority]" /></dd></div>
                    <amc-detail-item label="Service Hours" [value]="svc.operational.serviceHours" />
                    <amc-detail-item label="Emergency Allowed" [value]="svc.operational.emergencyAllowed ? 'Yes' : 'No'" />
                    <amc-detail-item label="Contract-eligible" [value]="svc.commercial.contractEligible ? 'Yes' : 'No'" />
                    <amc-detail-item label="AMC-eligible" [value]="svc.commercial.amcEligible ? 'Yes' : 'No'" />
                    <amc-detail-item label="Required Skill" [value]="svc.resources.skill" />
                    <amc-detail-item class="col-span-2 lg:col-span-3" label="Description" [value]="svc.description" />
                  </dl>
                </amc-panel>
                <amc-panel title="Record" icon="info">
                  <dl class="space-y-3">
                    <amc-detail-item label="Created" [value]="formatDateTime(svc.createdAt) + ' · ' + svc.createdBy" />
                    <amc-detail-item label="Last Updated" [value]="svc.updatedAt ? formatDateTime(svc.updatedAt) + ' · ' + svc.updatedBy : null" />
                  </dl>
                </amc-panel>
              </div>
            </div>
          }
          @case ('description') {
            <amc-panel title="Description" icon="file-text">
              <dl class="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <amc-detail-item label="Description" [value]="svc.description" />
                <amc-detail-item label="Customer-Facing Description" [value]="svc.customerDescription" />
                <amc-detail-item label="Internal Description" [value]="svc.internalDescription" />
              </dl>
            </amc-panel>
          }
          @case ('operational') {
            <amc-panel title="Operational requirements" icon="clock">
              <dl class="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
                <amc-detail-item label="Standard Duration" [value]="svc.operational.standardDuration !== null ? svc.operational.standardDuration + ' h' : null" />
                <amc-detail-item label="Minimum Duration" [value]="svc.operational.minDuration !== null ? svc.operational.minDuration + ' h' : null" />
                <amc-detail-item label="Maximum Duration" [value]="svc.operational.maxDuration !== null ? svc.operational.maxDuration + ' h' : null" />
                <amc-detail-item label="Service Unit" [value]="svc.operational.unit" />
                <amc-detail-item label="Service Territory" [value]="refs.territoryName(svc.operational.territoryId) ?? 'All territories'" />
                <amc-detail-item label="Service Hours" [value]="svc.operational.serviceHours" />
                <amc-detail-item label="Emergency Service Allowed" [value]="svc.operational.emergencyAllowed ? 'Yes' : 'No'" />
              </dl>
            </amc-panel>
          }
          @case ('pricing') {
            <section class="amc-card overflow-hidden">
              <div class="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <div>
                  <h2 class="text-sm font-semibold text-ink">Pricing &amp; commercial rules</h2>
                  <p class="text-xs text-ink-muted">Standard {{ formatCurrency(svc.commercial.standardPrice, svc.commercial.currency) }} · {{ svc.commercial.billingMethod }} · cost rate {{ formatCurrency(svc.commercial.costRate, svc.commercial.currency) }} · {{ refs.taxProfileName(svc.commercial.taxProfileId) ?? 'No tax profile' }} · discount {{ svc.commercial.discountAllowed ? 'allowed' : 'not allowed' }}</p>
                </div>
                <a routerLink="/app/catalog/pricing" [queryParams]="{ serviceId: svc.id }" class="amc-btn-secondary amc-btn-sm"><amc-icon name="receipt" [size]="14" /> Manage pricing</a>
              </div>
              <amc-data-table [rows]="prices()" [columns]="priceCols" [trackBy]="trackById" [loading]="pricesRes.isLoading()" emptyIcon="receipt" emptyTitle="No price rules" emptyMessage="The standard price applies." />
            </section>
          }
          @case ('sla') {
            <amc-panel title="SLA" description="Service-specific SLA rules override the default SLA where configured" icon="shield-check">
              <dl class="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
                <amc-detail-item label="SLA Applicable" [value]="svc.sla.applicable ? 'Yes' : 'No'" />
                <amc-detail-item label="Default SLA" [value]="svc.slaName" />
                <div><dt class="text-xs font-medium text-ink-muted">Service Priority</dt><dd class="mt-1"><amc-status-badge [label]="svc.sla.priority" [tone]="priorityTone[svc.sla.priority]" /></dd></div>
                <amc-detail-item label="Response Time" [value]="svc.sla.responseHours !== null ? svc.sla.responseHours + ' hours' : null" />
                <amc-detail-item label="Resolution Time" [value]="svc.sla.resolutionHours !== null ? svc.sla.resolutionHours + ' hours' : null" />
                <amc-detail-item label="Escalation Required" [value]="svc.sla.escalationRequired ? 'Yes' : 'No'" />
              </dl>
            </amc-panel>
          }
          @case ('maintenance') {
            <amc-panel title="Maintenance" [description]="isMaintenance() ? 'Maintenance-related service' : 'Not a maintenance service type'" icon="calendar-check">
              <dl class="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
                <amc-detail-item label="Maintenance Type" [value]="svc.maintenance.maintenanceType" />
                <amc-detail-item label="Recommended Frequency" [value]="svc.maintenance.recommendedFrequency ? 'Every ' + svc.maintenance.recommendedFrequency + ' ' + (svc.maintenance.frequencyUnit ?? '').toLowerCase() : null" />
                <amc-detail-item label="Checklist Required" [value]="svc.maintenance.checklistRequired ? 'Yes' : 'No'" />
                <amc-detail-item label="Inspection Required" [value]="svc.maintenance.inspectionRequired ? 'Yes' : 'No'" />
                <amc-detail-item label="Meter-Based Service" [value]="svc.maintenance.meterBased ? 'Yes' : 'No'" />
                <amc-detail-item label="Condition-Based Service" [value]="svc.maintenance.conditionBased ? 'Yes' : 'No'" />
              </dl>
            </amc-panel>
          }
          @case ('resources') {
            <amc-panel title="Resource requirements" icon="users">
              <dl class="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
                <amc-detail-item label="Technician Skill" [value]="svc.resources.skill" />
                <amc-detail-item label="Technician Certification" [value]="svc.resources.certification" />
                <amc-detail-item label="Required Team" [value]="svc.resources.team" />
                <amc-detail-item label="Required Equipment" [value]="svc.resources.equipment" />
                <amc-detail-item label="Required Tools" [value]="svc.resources.tools" />
                <amc-detail-item label="Required Parts" [value]="svc.resources.parts" />
                <amc-detail-item label="Required Consumables" [value]="svc.resources.consumables" />
              </dl>
            </amc-panel>
          }
          @case ('agreements') {
            <amc-panel title="Contracts / AMCs including this service" icon="file-check" [padded]="false">
              <ul class="divide-y divide-line">
                @for (a of agreements(); track a.id) {
                  <li class="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span class="font-mono text-[13px] text-ink-muted">{{ a.number }}</span>
                    <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-ink">{{ a.title }}</p><p class="text-xs text-ink-muted">{{ a.kind }} · {{ a.customer }} · {{ formatDate(a.startDate) }} – {{ formatDate(a.endDate) }}</p></div>
                    <amc-status-badge [label]="a.status" [tone]="a.status === 'Active' ? 'ok' : a.status === 'Expiring' ? 'warn' : 'danger'" />
                  </li>
                } @empty {
                  <li class="p-5 text-center text-sm text-ink-muted">This service is not included in any contract or AMC yet.</li>
                }
              </ul>
            </amc-panel>
          }
          @case ('entitlements') {
            <section class="amc-card overflow-hidden">
              <amc-data-table tableId="service-entitlements" [entity]="{ singular: 'entitlement', plural: 'entitlements' }" [rows]="entitlements()" [columns]="entitlementCols" [trackBy]="trackById" [loading]="entitlementsRes.isLoading()" emptyIcon="shield-check" emptyTitle="No entitlements" emptyMessage="Entitlements that cover this service will appear here." />
            </section>
          }
          @case ('usage') {
            <section class="amc-card overflow-hidden">
              <amc-data-table tableId="service-usage" [entity]="{ singular: 'usage record', plural: 'usage records' }" [rows]="usage()" [columns]="usageCols" [trackBy]="trackById" [loading]="usageRes.isLoading()" emptyIcon="activity" emptyTitle="No usage" emptyMessage="Covered services consumed under entitlements will appear here." />
            </section>
          }
          @case ('documents') {
            <amc-panel title="Documentation" icon="file-text">
              <dl class="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <amc-detail-item label="Service Instructions" [value]="svc.documentation.serviceInstructions" />
                <amc-detail-item label="Technician Instructions" [value]="svc.documentation.technicianInstructions" />
                <amc-detail-item label="Customer Instructions" [value]="svc.documentation.customerInstructions" />
              </dl>
              <h3 class="mt-5 text-sm font-semibold text-ink">Attachments</h3>
              <ul class="mt-2 divide-y divide-line rounded-xl border border-line">
                @for (f of svc.attachments; track f.id) {
                  <li class="flex items-center gap-3 px-3 py-2"><amc-icon name="paperclip" class="text-ink-subtle" /><span class="min-w-0 flex-1 truncate text-sm">{{ f.name }}</span><span class="text-xs text-ink-muted">{{ formatFileSize(f.size) }} · {{ f.uploadedBy }} · {{ formatDate(f.uploadedAt) }}</span></li>
                } @empty {
                  <li class="px-3 py-4 text-center text-sm text-ink-muted">No attachments.</li>
                }
              </ul>
            </amc-panel>
          }
          @case ('history') {
            <amc-catalog-history-timeline entity="Service" [entityId]="svc.id" [refreshKey]="refreshKey()" />
          }
        }
      </div>
    }
  `,
})
export class ServiceDetailPage {
  private readonly api = inject(ServiceCatalogApi);
  private readonly pricingApi = inject(PricingApi);
  private readonly entitlementsApi = inject(EntitlementApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);
  protected readonly refs = inject(CatalogReferenceStore);

  readonly serviceId = input.required<string>();
  readonly tab = input<string>();

  protected readonly refreshKey = signal(0);
  protected readonly activeTab = linkedSignal<ServiceTab>(() => (TABS.includes(this.tab() as ServiceTab) ? (this.tab() as ServiceTab) : 'overview'));
  protected readonly serviceRes = rxResource({ params: () => ({ id: this.serviceId(), k: this.refreshKey() }), stream: ({ params }) => this.api.get(params.id) });
  protected readonly pricesRes = rxResource({ params: () => ({ id: this.serviceId(), k: this.refreshKey() }), stream: ({ params }) => this.pricingApi.list({ serviceId: params.id }) });
  protected readonly entitlementsRes = rxResource({ params: () => ({ id: this.serviceId(), k: this.refreshKey() }), stream: ({ params }) => this.entitlementsApi.list({ serviceId: params.id }) });
  protected readonly usageRes = rxResource({ params: () => ({ id: this.serviceId(), k: this.refreshKey() }), stream: ({ params }) => this.entitlementsApi.usage({ serviceId: params.id }) });

  protected readonly s = computed(() => (this.serviceRes.hasValue() ? this.serviceRes.value() : null));
  protected readonly prices = computed(() => (this.pricesRes.hasValue() ? this.pricesRes.value() : []));
  protected readonly entitlements = computed(() => (this.entitlementsRes.hasValue() ? this.entitlementsRes.value() : []));
  protected readonly usage = computed(() => (this.usageRes.hasValue() ? this.usageRes.value() : []));
  protected readonly isMaintenance = computed(() => !!this.s() && MAINTENANCE_SERVICE_TYPES.includes(this.s()!.type));
  protected readonly agreements = computed(() => {
    const ids = new Set(this.entitlements().flatMap((e) => [e.contractId, e.amcId]).filter((id): id is string => !!id));
    return this.refs.data().agreements.filter((a) => ids.has(a.id)).map((a) => ({ ...a, customer: this.refs.customerName(a.customerId) ?? '' }));
  });

  protected readonly tabs = computed<TabItem[]>(() => [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'description', label: 'Description' },
    { id: 'operational', label: 'Operational Requirements' },
    { id: 'pricing', label: 'Pricing', count: this.prices().length },
    { id: 'sla', label: 'SLA' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'resources', label: 'Resources' },
    { id: 'agreements', label: 'Contracts / AMCs', count: this.agreements().length },
    { id: 'entitlements', label: 'Entitlements', count: this.entitlements().length },
    { id: 'usage', label: 'Usage', count: this.usage().length },
    { id: 'documents', label: 'Documents', count: this.s()?.attachments.length },
    { id: 'history', label: 'History' },
  ]);

  protected readonly actions = computed<MenuItem[]>(() => {
    const s = this.s();
    return [
      { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
      { id: 'entitlement', label: 'Create Entitlement', icon: 'shield-check', disabled: s?.status !== 'Active' },
      { id: 'usage', label: 'View Usage', icon: 'activity' },
      s?.status === 'Active' ? { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, dividerBefore: true } : { id: 'activate', label: 'Activate', icon: 'check-circle', dividerBefore: true },
    ];
  });

  protected readonly priceCols = priceRuleColumns(false);
  protected readonly entitlementCols = entitlementColumns();
  protected readonly usageCols = usageColumns();
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly statusTone = SERVICE_STATUS_TONE;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly typeIcon = SERVICE_TYPE_ICON;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatFileSize = formatFileSize;

  protected selectTab(tab: string): void {
    this.activeTab.set(tab as ServiceTab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected async onAction(id: string): Promise<void> {
    const s = this.s();
    if (!s) return;
    try {
      switch (id) {
        case 'duplicate': {
          const copy = await firstValueFrom(this.api.duplicate(s.id));
          this.notify.success(`${copy.code} created as a draft copy.`);
          void this.router.navigate(['/app/catalog/services', copy.id, 'edit']);
          break;
        }
        case 'entitlement':
          void this.router.navigate(['/app/catalog/entitlements/new'], { queryParams: { serviceId: s.id } });
          break;
        case 'usage':
          this.selectTab('usage');
          break;
        case 'deactivate':
          if (!(await this.confirm.open({ title: 'Deactivate service?', message: `${s.name} will no longer be selectable for new transactions. Historical transactions remain unchanged.`, confirmLabel: 'Deactivate', danger: true }))) return;
          await firstValueFrom(this.api.setStatus([s.id], 'Inactive'));
          this.notify.success(`${s.name} deactivated.`);
          this.refreshKey.update((k) => k + 1);
          break;
        case 'activate':
          await firstValueFrom(this.api.setStatus([s.id], 'Active'));
          this.notify.success(`${s.name} activated.`);
          this.refreshKey.update((k) => k + 1);
          break;
      }
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }
}
