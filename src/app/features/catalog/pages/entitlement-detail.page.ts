import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ActionMenu, type MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { DetailItem } from '@shared/ui/detail-item';
import { Dialog } from '@shared/ui/dialog';
import { ErrorState } from '@shared/ui/error-state';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { Breadcrumbs } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Skeleton } from '@shared/ui/skeleton';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { formatCurrency, formatDate, formatDateTime, formatFileSize } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { usageColumns } from '../components/catalog-columns';
import { CatalogHistoryTimeline } from '../components/catalog-history-timeline';
import { EntitlementActionDialog, type EntitlementActionMode } from '../components/entitlement-action-dialog';
import { EntitlementValidationDialog } from '../components/entitlement-validation-dialog';
import { UsageMeter } from '../components/usage-meter';
import { CatalogReferenceStore } from '../data/catalog-reference.store';
import { EntitlementApi, ServiceCatalogApi } from '../data/catalog.api';
import type { ServiceListItem } from '../models/catalog.model';
import { COVERAGE_DESCRIPTIONS, type EntitlementListItem, type EntitlementUpsert } from '../models/entitlement.model';
import { ENTITLEMENT_STATUS_TONE, PRIORITY_TONE, SERVICE_STATUS_TONE } from '../models/display';

const TABS = ['overview', 'services', 'sites', 'assets', 'sla', 'usage', 'included', 'exclusions', 'service-history', 'documents', 'activity'] as const;
type EntTab = (typeof TABS)[number];

interface Row {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly extra: string;
  readonly status: string;
  readonly excluded: boolean;
}

function toUpsert(e: EntitlementListItem): EntitlementUpsert {
  return {
    number: e.number, name: e.name, customerId: e.customerId, contractId: e.contractId, amcId: e.amcId, siteIds: e.siteIds, assetIds: e.assetIds, status: e.status,
    coverage: e.coverage, validity: e.validity, usage: e.usage, laborParts: e.laborParts, sla: e.sla, exclusions: e.exclusions, commercial: e.commercial, attachments: e.attachments,
  };
}

/** SRS 4.11 — complete view of what a customer is entitled to receive. */
@Component({
  selector: 'amc-entitlement-detail-page',
  imports: [
    ActionMenu, Breadcrumbs, CatalogHistoryTimeline, DataTable, DatePicker, DetailItem, Dialog, EntitlementActionDialog, EntitlementValidationDialog, ErrorState, FormField, Icon, KpiCard,
    Panel, RouterLink, Select, Skeleton, Spinner, StatusBadge, Tabs, UsageMeter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (res.error()) {
      <div class="amc-card">
        <amc-error-state title="Entitlement not found" message="This entitlement could not be loaded." (retry)="res.reload()" />
        <div class="-mt-6 pb-8 text-center"><a routerLink="/app/catalog/entitlements" class="amc-link text-sm">Back to entitlements</a></div>
      </div>
    } @else if (!e()) {
      <div class="amc-card space-y-3 p-5"><amc-skeleton class="h-6 w-72" /><amc-skeleton class="h-4 w-48" /></div>
    } @else {
      @let ent = e()!;
      @let u = ent.usageSummary;
      <div class="space-y-5">
        <amc-breadcrumbs [items]="[{ label: 'Service Catalog', path: '/app/catalog/dashboard' }, { label: 'Entitlements', path: '/app/catalog/entitlements' }, { label: ent.number }]" />
        <header class="amc-card p-4 sm:p-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="flex min-w-0 items-start gap-4">
              <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand"><amc-icon name="shield-check" [size]="24" /></span>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{{ ent.number }}</h1>
                  <amc-status-badge [label]="ent.effectiveStatus" [tone]="statusTone[ent.effectiveStatus]" />
                  <span class="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-muted">{{ ent.coverage.coverageType }}</span>
                </div>
                <p class="mt-1 text-sm text-ink-muted">{{ ent.name }}</p>
                <dl class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <div class="flex items-center gap-1.5"><dt class="text-ink-muted">Customer</dt><dd><a [routerLink]="['/app/customers', ent.customerId]" class="font-medium text-ink hover:text-brand">{{ ent.customerName }}</a></dd></div>
                  <div class="flex items-center gap-1.5"><dt class="text-ink-muted">{{ ent.agreementKind ?? 'Contract / AMC' }}</dt><dd class="font-mono text-[13px] font-medium text-ink">{{ ent.agreementNumber ?? '—' }}</dd></div>
                  <div class="flex items-center gap-1.5"><dt class="text-ink-muted">Start</dt><dd class="font-medium text-ink">{{ formatDate(ent.validity.startDate) }}</dd></div>
                  <div class="flex items-center gap-1.5"><dt class="text-ink-muted">End</dt><dd class="font-medium text-ink">{{ formatDate(ent.validity.endDate) }}</dd></div>
                </dl>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 lg:shrink-0">
              <button type="button" class="amc-btn-secondary hidden sm:inline-flex" (click)="validateOpen.set(true)"><amc-icon name="shield-check" /> Validate</button>
              @if (ent.effectiveStatus === 'Draft' || ent.effectiveStatus === 'Suspended') {
                <button type="button" class="amc-btn-secondary" (click)="activate()"><amc-icon name="check-circle" /> {{ ent.effectiveStatus === 'Draft' ? 'Activate' : 'Reactivate' }}</button>
              }
              <a [routerLink]="['/app/catalog/entitlements', ent.id, 'edit']" class="amc-btn-primary" [class]="ent.status === 'Cancelled' ? 'pointer-events-none opacity-50' : ''"><amc-icon name="pencil" /> Edit</a>
              <amc-action-menu label="Actions" [items]="actions()" (action)="onAction($event)" />
            </div>
          </div>
        </header>

        @if (ent.effectiveStatus !== 'Active' && ent.effectiveStatus !== 'Draft') {
          <div class="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-subtle p-4" role="alert">
            <amc-icon name="alert-triangle" [size]="18" class="text-danger" />
            <p class="text-sm text-ink">This entitlement is <span class="font-semibold">{{ ent.effectiveStatus.toLowerCase() }}</span> and does not provide active service coverage{{ ent.effectiveStatus === 'Expired' ? ' — expired entitlements cannot be used for new covered services' : '' }}.</p>
          </div>
        } @else if (u.state === 'Near Limit' || u.state === 'Exhausted' || u.state === 'Overused') {
          <div class="flex items-center gap-3 rounded-xl border border-warn/30 bg-warn-subtle p-4" role="status">
            <amc-icon name="alert-triangle" [size]="18" class="text-warn" />
            <p class="text-sm text-ink">Usage alert: {{ u.consumed }} of {{ u.allowed }} {{ u.unit.toLowerCase() }} consumed ({{ u.percentage }}%). {{ u.state === 'Near Limit' ? 'The remaining quantity has reached the alert threshold.' : 'Further services are billable.' }}</p>
          </div>
        } @else if (ent.expiring) {
          <div class="flex items-center gap-3 rounded-xl border border-warn/30 bg-warn-subtle p-4" role="status">
            <amc-icon name="clock" [size]="18" class="text-warn" />
            <p class="flex-1 text-sm text-ink">Expires in {{ ent.daysRemaining }} days{{ ent.validity.autoRenewal ? ' — auto renewal is enabled.' : '.' }}</p>
            <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="openAction('renew')">Renew</button>
          </div>
        }

        <section class="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Coverage KPIs">
          <amc-kpi-card label="Covered Services" icon="list" tone="brand" [value]="ent.coverage.serviceIds.length" />
          <amc-kpi-card label="Covered Sites" icon="map-pin" tone="info" [value]="ent.siteIds.length || 'All'" />
          <amc-kpi-card label="Covered Assets" icon="box" tone="info" [value]="coveredAssets().length" [hint]="ent.assetIds.length ? 'Asset-level' : 'All assets at sites'" />
          <amc-kpi-card label="Included Visits" icon="calendar-check" [value]="ent.usage.maxVisits ?? ent.coverage.includedVisits ?? '—'" />
          <amc-kpi-card label="Used Visits" icon="activity" tone="accent" [value]="ent.usage.usedVisits" />
          <amc-kpi-card label="Remaining Visits" icon="check-circle" [tone]="ent.usage.maxVisits !== null && ent.usage.maxVisits - ent.usage.usedVisits <= 1 ? 'danger' : 'ok'" [value]="ent.usage.maxVisits !== null ? max0(ent.usage.maxVisits - ent.usage.usedVisits) : '—'" />
          <amc-kpi-card label="Included Hours" icon="clock" [value]="ent.usage.maxHours ?? '—'" />
          <amc-kpi-card label="Used Hours" icon="clock" tone="accent" [value]="ent.usage.usedHours" />
          <amc-kpi-card label="Remaining Hours" icon="clock" tone="ok" [value]="ent.usage.maxHours !== null ? max0(ent.usage.maxHours - ent.usage.usedHours) : '—'" />
          <amc-kpi-card label="Days Remaining" icon="calendar" [tone]="ent.daysRemaining < 0 ? 'danger' : ent.expiring ? 'warn' : 'neutral'" [value]="ent.daysRemaining < 0 ? 'Ended' : ent.daysRemaining" />
        </section>

        <amc-tabs [items]="tabs()" [active]="activeTab()" [maxVisible]="8" (activeChange)="selectTab($event)" />

        @switch (activeTab()) {
          @case ('overview') {
            <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <amc-panel class="xl:col-span-2" title="Entitlement summary" icon="shield-check">
                <dl class="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
                  <amc-detail-item label="Coverage Type" [value]="ent.coverage.coverageType" />
                  <amc-detail-item label="Service Frequency" [value]="ent.coverage.serviceFrequency" />
                  <amc-detail-item label="Effective Date" [value]="formatDate(ent.validity.effectiveDate)" />
                  <amc-detail-item label="Auto Renewal" [value]="ent.validity.autoRenewal ? 'Yes · ' + ent.validity.renewalPeriodMonths + ' months' : 'No'" />
                  <amc-detail-item label="SLA" [value]="ent.sla.applicable ? (ent.slaName ?? 'Custom') + ' · ' + ent.sla.responseHours + 'h / ' + ent.sla.resolutionHours + 'h' : 'Not applicable'" />
                  <amc-detail-item label="Labor / Parts" [value]="(ent.laborParts.labor ? 'Labor' : 'No labor') + ' · ' + (ent.laborParts.parts ? 'Parts' : 'No parts')" />
                  <amc-detail-item class="col-span-2 lg:col-span-3" label="Coverage model" [value]="coverageDescriptions[ent.coverage.coverageType]" />
                  <amc-detail-item class="col-span-2 lg:col-span-3" label="Included Services" [value]="ent.coverage.includedServices" />
                </dl>
              </amc-panel>
              <amc-panel title="Usage" icon="activity"><amc-usage-meter [usage]="u" /></amc-panel>
            </div>
          }
          @case ('services') {
            <section class="amc-card overflow-hidden">
              <amc-data-table [rows]="serviceRows()" [columns]="rowColumns('Service', 'Type · Category')" [trackBy]="trackById" emptyIcon="list" emptyTitle="No services" emptyMessage="Add covered services to this entitlement." />
            </section>
          }
          @case ('sites') {
            <section class="amc-card overflow-hidden">
              @if (!ent.siteIds.length) { <p class="border-b border-line bg-surface-muted px-4 py-2 text-xs text-ink-muted">No site restriction — all of the customer’s sites are covered.</p> }
              <amc-data-table [rows]="siteRows()" [columns]="rowColumns('Site', 'City')" [trackBy]="trackById" emptyIcon="map-pin" emptyTitle="No sites" emptyMessage="This customer has no sites." />
            </section>
          }
          @case ('assets') {
            <section class="amc-card overflow-hidden">
              <p class="border-b border-line bg-surface-muted px-4 py-2 text-xs text-ink-muted">{{ ent.assetIds.length ? 'Asset-level entitlement — validated against each asset’s current location and status.' : 'No asset restriction — all assets at the covered sites are covered.' }}</p>
              <amc-data-table [rows]="assetRows()" [columns]="rowColumns('Asset', 'Category')" [trackBy]="trackById" emptyIcon="box" emptyTitle="No assets" emptyMessage="No assets at the covered sites." />
            </section>
          }
          @case ('sla') {
            <amc-panel title="SLA coverage" icon="clock">
              <dl class="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
                <amc-detail-item label="SLA Applicable" [value]="ent.sla.applicable ? 'Yes' : 'No'" />
                <amc-detail-item label="SLA" [value]="ent.slaName" />
                <amc-detail-item label="Response Time" [value]="ent.sla.responseHours !== null ? ent.sla.responseHours + ' hours' : null" />
                <amc-detail-item label="Resolution Time" [value]="ent.sla.resolutionHours !== null ? ent.sla.resolutionHours + ' hours' : null" />
                <div><dt class="text-xs font-medium text-ink-muted">Priority</dt><dd class="mt-1"><amc-status-badge [label]="ent.sla.priority" [tone]="priorityTone[ent.sla.priority]" /></dd></div>
                <amc-detail-item label="Service Window" [value]="ent.sla.serviceWindow" />
                <amc-detail-item label="Escalation Policy" [value]="ent.sla.escalationPolicy" />
              </dl>
            </amc-panel>
          }
          @case ('usage') {
            <div class="space-y-5">
              <amc-panel title="Usage management" description="Allowed, consumed and remaining quantity" icon="activity">
                <button panelActions type="button" class="amc-btn-secondary amc-btn-sm" [disabled]="ent.effectiveStatus !== 'Active'" (click)="openUsage()"><amc-icon name="plus" [size]="14" /> Record Usage</button>
                <amc-usage-meter [usage]="u" />
                <dl class="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-4">
                  <amc-detail-item label="Visits" [value]="ent.usage.usedVisits + (ent.usage.maxVisits !== null ? ' / ' + ent.usage.maxVisits : '')" />
                  <amc-detail-item label="Hours" [value]="ent.usage.usedHours + (ent.usage.maxHours !== null ? ' / ' + ent.usage.maxHours : '')" />
                  <amc-detail-item label="Quantity" [value]="ent.usage.usedQuantity + (ent.usage.maxQuantity !== null ? ' / ' + ent.usage.maxQuantity : '')" />
                  <amc-detail-item label="Reset Frequency" [value]="ent.usage.resetFrequency" />
                </dl>
              </amc-panel>
              <section class="amc-card overflow-hidden">
                <amc-data-table tableId="entitlement-usage" [entity]="{ singular: 'usage record', plural: 'usage records' }" [rows]="usage()" [columns]="usageCols" [trackBy]="trackById" [loading]="usageRes.isLoading()" emptyIcon="activity" emptyTitle="No usage yet" emptyMessage="Consumption is recorded automatically when covered services are performed." />
              </section>
            </div>
          }
          @case ('included') {
            <amc-panel title="Included coverage" icon="check-circle">
              <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                @for (item of included(); track item.label) {
                  <li class="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                    <amc-icon [name]="item.on ? 'check-circle' : 'x'" [size]="16" [class]="item.on ? 'text-ok' : 'text-ink-subtle'" />
                    <span class="text-sm" [class]="item.on ? 'text-ink' : 'text-ink-muted line-through'">{{ item.label }}</span>
                  </li>
                }
              </ul>
              <dl class="mt-5 grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
                <amc-detail-item label="Covered Service Types" [value]="ent.coverage.coveredServiceTypes.join(', ')" />
                <amc-detail-item label="Customer Price" [value]="ent.commercial.customerPrice !== null ? formatCurrency(ent.commercial.customerPrice, ent.commercial.currency) : null" />
                <amc-detail-item label="Tax Treatment" [value]="ent.commercial.taxTreatment" />
                <amc-detail-item label="Billable Services" [value]="names(ent.commercial.billableServiceIds)" />
                <amc-detail-item label="Discount Rules" [value]="ent.commercial.discountRules" />
                <amc-detail-item label="Additional Charges" [value]="ent.commercial.additionalCharges" />
              </dl>
            </amc-panel>
          }
          @case ('exclusions') {
            <amc-panel title="Exclusions" description="Excluded services and assets are never treated as covered" icon="ban">
              <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <amc-detail-item label="Excluded Services" [value]="names(ent.exclusions.serviceIds) || 'None'" />
                <amc-detail-item label="Excluded Assets" [value]="ent.exclusions.assetIds.join(', ') || 'None'" />
                <amc-detail-item label="Excluded Parts" [value]="ent.exclusions.parts" />
                <amc-detail-item label="Excluded Locations" [value]="ent.exclusions.locations" />
                <amc-detail-item label="Excluded Service Hours" [value]="ent.exclusions.serviceHours" />
                <amc-detail-item label="Excluded Service (description)" [value]="ent.coverage.excludedServices" />
                <amc-detail-item class="sm:col-span-2 lg:col-span-3" label="Exclusion Notes" [value]="ent.exclusions.notes" />
              </dl>
            </amc-panel>
          }
          @case ('service-history') {
            <section class="amc-card overflow-hidden">
              <amc-data-table tableId="entitlement-service-history" [entity]="{ singular: 'service', plural: 'services' }" [rows]="usage()" [columns]="usageCols" [trackBy]="trackById" [loading]="usageRes.isLoading()" emptyIcon="history" emptyTitle="No services performed" emptyMessage="Services performed under this entitlement will appear here." />
            </section>
          }
          @case ('documents') {
            <amc-panel title="Documents" icon="file-text" [padded]="false">
              <label panelActions for="ent-files" class="amc-btn-secondary amc-btn-sm cursor-pointer"><amc-icon name="upload" [size]="14" /> Upload<input id="ent-files" type="file" multiple class="sr-only" (change)="upload($event)" /></label>
              <ul class="divide-y divide-line">
                @for (f of ent.attachments; track f.id) {
                  <li class="flex items-center gap-3 px-4 py-3 sm:px-5"><amc-icon name="paperclip" class="text-ink-subtle" /><span class="min-w-0 flex-1 truncate text-sm">{{ f.name }}</span><span class="text-xs text-ink-muted">{{ formatFileSize(f.size) }} · {{ f.uploadedBy }} · {{ formatDate(f.uploadedAt) }}</span></li>
                } @empty {
                  <li class="p-6 text-center text-sm text-ink-muted">No documents. Upload the signed schedule, coverage terms or customer approvals.</li>
                }
              </ul>
            </amc-panel>
          }
          @case ('activity') {
            <amc-catalog-history-timeline entity="Entitlement" [entityId]="ent.id" [refreshKey]="refreshKey()" />
          }
        }
      </div>

      <amc-entitlement-action-dialog [entitlement]="ent" [(mode)]="actionMode" (done)="refresh()" />
      <amc-entitlement-validation-dialog [(open)]="validateOpen" [presetCustomerId]="ent.customerId" [presetEntitlementId]="ent.id" (consumed)="refresh()" />

      <amc-dialog size="md" title="Record usage" description="Consumption updates the entitlement usage automatically." [(open)]="usageOpen">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <amc-form-field label="Service" for="us-service" [required]="true" class="sm:col-span-2"><amc-select inputId="us-service" [options]="coveredServiceOptions()" [(value)]="uService" /></amc-form-field>
          <amc-form-field label="Site" for="us-site"><amc-select inputId="us-site" [options]="siteOptions()" [clearable]="true" [(value)]="uSite" /></amc-form-field>
          <amc-form-field label="Asset" for="us-asset"><amc-select inputId="us-asset" [options]="assetOptions()" [clearable]="true" [(value)]="uAsset" /></amc-form-field>
          <amc-form-field label="Date" for="us-date"><amc-date-picker inputId="us-date" [min]="ent.validity.startDate" [max]="ent.validity.endDate" [(value)]="uDate" /></amc-form-field>
          <amc-form-field label="Technician" for="us-tech"><amc-select inputId="us-tech" [options]="refs.technicianOptions()" [clearable]="true" [(value)]="uTech" /></amc-form-field>
          <amc-form-field label="Visits" for="us-visits"><input id="us-visits" type="number" min="0" class="amc-input tabular-nums" [value]="uVisits()" (input)="uVisits.set(+$any($event.target).value)" /></amc-form-field>
          <amc-form-field label="Hours" for="us-hours"><input id="us-hours" type="number" min="0" step="0.5" class="amc-input tabular-nums" [value]="uHours()" (input)="uHours.set(+$any($event.target).value)" /></amc-form-field>
          <amc-form-field label="Reference (SR / WO)" for="us-ref" class="sm:col-span-2"><input id="us-ref" class="amc-input font-mono" [value]="uRef()" (input)="uRef.set($any($event.target).value)" /></amc-form-field>
        </div>
        <ng-container dialogFooter>
          <button type="button" class="amc-btn-secondary" (click)="usageOpen.set(false)">Cancel</button>
          <button type="button" class="amc-btn-primary" [disabled]="!uService() || busy()" (click)="recordUsage()">@if (busy()) { <amc-spinner [size]="14" /> } Record</button>
        </ng-container>
      </amc-dialog>
    }
  `,
})
export class EntitlementDetailPage {
  private readonly api = inject(EntitlementApi);
  private readonly servicesApi = inject(ServiceCatalogApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(CatalogReferenceStore);

  readonly entitlementId = input.required<string>();
  readonly tab = input<string>();

  protected readonly refreshKey = signal(0);
  protected readonly activeTab = linkedSignal<EntTab>(() => (TABS.includes(this.tab() as EntTab) ? (this.tab() as EntTab) : 'overview'));
  protected readonly res = rxResource({ params: () => ({ id: this.entitlementId(), k: this.refreshKey() }), stream: ({ params }) => this.api.get(params.id) });
  protected readonly usageRes = rxResource({ params: () => ({ id: this.entitlementId(), k: this.refreshKey() }), stream: ({ params }) => this.api.usage({ entitlementId: params.id }) });
  private readonly servicesRes = rxResource({ stream: () => this.servicesApi.list() });

  protected readonly e = computed(() => (this.res.hasValue() ? this.res.value() : null));
  protected readonly usage = computed(() => (this.usageRes.hasValue() ? this.usageRes.value() : []));
  private readonly services = computed<ServiceListItem[]>(() => (this.servicesRes.hasValue() ? this.servicesRes.value() : []));

  protected readonly serviceRows = computed<Row[]>(() => {
    const e = this.e();
    if (!e) return [];
    const ids = [...e.coverage.serviceIds, ...e.exclusions.serviceIds];
    return ids.map((id) => {
      const s = this.services().find((x) => x.id === id);
      return { id, code: s?.code ?? id, name: s?.name ?? id, extra: s ? `${s.type} · ${s.categoryName}` : '', status: e.exclusions.serviceIds.includes(id) ? 'Excluded' : (s?.status ?? ''), excluded: e.exclusions.serviceIds.includes(id) };
    });
  });
  protected readonly siteRows = computed<Row[]>(() => {
    const e = this.e();
    if (!e) return [];
    const sites = this.refs.data().sites.filter((s) => s.customerId === e.customerId && (!e.siteIds.length || e.siteIds.includes(s.id)));
    return sites.map((s) => ({ id: s.id, code: s.code, name: s.name, extra: s.city, status: s.status, excluded: false }));
  });
  protected readonly coveredAssets = computed(() => {
    const e = this.e();
    if (!e) return [];
    return this.refs.data().assets.filter((a) => a.customerId === e.customerId && (e.assetIds.length ? e.assetIds.includes(a.id) : !e.siteIds.length || (a.siteId !== null && e.siteIds.includes(a.siteId))) && !e.exclusions.assetIds.includes(a.id));
  });
  protected readonly assetRows = computed<Row[]>(() => {
    const excluded = this.refs.data().assets.filter((a) => this.e()?.exclusions.assetIds.includes(a.id));
    return [
      ...this.coveredAssets().map((a) => ({ id: a.id, code: a.code, name: a.name, extra: a.category, status: a.status, excluded: false })),
      ...excluded.map((a) => ({ id: a.id, code: a.code, name: a.name, extra: a.category, status: 'Excluded', excluded: true })),
    ];
  });
  protected readonly included = computed(() => {
    const e = this.e();
    if (!e) return [];
    const lp = e.laborParts;
    return [
      { label: 'Labor', on: lp.labor }, { label: 'Parts', on: lp.parts }, { label: 'Consumables', on: lp.consumables }, { label: 'Travel', on: lp.travel },
      { label: 'Call-out charges', on: lp.callOut }, { label: 'Overtime', on: lp.overtime }, { label: 'Emergency service', on: e.coverage.emergencyService }, { label: 'After-hours service', on: e.coverage.afterHoursService },
      { label: 'SLA coverage', on: e.sla.applicable },
    ];
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const e = this.e();
    return [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'services', label: 'Services', count: e?.coverage.serviceIds.length },
      { id: 'sites', label: 'Sites', count: this.siteRows().length },
      { id: 'assets', label: 'Assets', count: this.coveredAssets().length },
      { id: 'sla', label: 'SLA' },
      { id: 'usage', label: 'Usage' },
      { id: 'included', label: 'Included Coverage' },
      { id: 'exclusions', label: 'Exclusions', count: (e?.exclusions.serviceIds.length ?? 0) + (e?.exclusions.assetIds.length ?? 0) || undefined },
      { id: 'service-history', label: 'Service History', count: this.usage().length },
      { id: 'documents', label: 'Documents', count: e?.attachments.length },
      { id: 'activity', label: 'Activity' },
    ];
  });

  protected readonly actions = computed<MenuItem[]>(() => {
    const e = this.e();
    const cancelled = e?.status === 'Cancelled';
    return [
      { id: 'extend', label: 'Extend', icon: 'calendar', disabled: cancelled },
      { id: 'renew', label: 'Renew', icon: 'refresh', disabled: cancelled },
      { id: 'usage', label: 'View Usage', icon: 'activity' },
      { id: 'service-history', label: 'View Service History', icon: 'history' },
      { id: 'suspend', label: 'Suspend', icon: 'ban', danger: true, disabled: e?.effectiveStatus !== 'Active', dividerBefore: true },
      { id: 'cancel', label: 'Cancel Entitlement', icon: 'x', danger: true, disabled: cancelled },
    ];
  });

  protected rowColumns(label: string, extra: string): DataColumn<Row>[] {
    const link = label === 'Service' ? (r: Row) => `/app/catalog/services/${r.id}` : label === 'Site' ? (r: Row) => `/app/customers/sites/${r.id}` : (r: Row) => `/app/assets/${r.id}`;
    return [
      { key: 'name', label, value: (r) => r.name, secondary: (r) => r.code, link, mobile: 'title', width: 280 },
      { key: 'extra', label: extra, value: (r) => r.extra, mobile: 'meta', width: 240 },
      { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => (r.excluded ? 'danger' : (SERVICE_STATUS_TONE[r.status as keyof typeof SERVICE_STATUS_TONE] ?? (r.status === 'Active' ? 'ok' : 'neutral'))), mobile: 'badge', width: 120 },
    ];
  }

  protected readonly usageCols = usageColumns(false);
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly statusTone = ENTITLEMENT_STATUS_TONE;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly coverageDescriptions = COVERAGE_DESCRIPTIONS;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatFileSize = formatFileSize;
  protected readonly validateOpen = signal(false);
  protected readonly actionMode = signal<EntitlementActionMode | null>(null);
  protected readonly busy = signal(false);

  protected max0(n: number): number {
    return Math.max(0, n);
  }

  protected names(ids: readonly string[]): string {
    return ids.map((id) => this.services().find((s) => s.id === id)?.name ?? id).join(', ');
  }

  protected refresh(): void {
    this.refreshKey.update((k) => k + 1);
  }

  protected selectTab(tab: string): void {
    this.activeTab.set(tab as EntTab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected openAction(mode: EntitlementActionMode): void {
    this.actionMode.set(mode);
  }

  protected onAction(id: string): void {
    if (id === 'usage' || id === 'service-history') this.selectTab(id);
    else this.openAction(id as EntitlementActionMode);
  }

  protected async activate(): Promise<void> {
    const e = this.e();
    if (!e) return;
    try {
      await firstValueFrom(this.api.activate(e.id));
      this.notify.success(`${e.number} activated.`);
      this.refresh();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  protected async upload(event: Event): Promise<void> {
    const e = this.e();
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!e || !files.length) return;
    const attachments = [...e.attachments, ...files.map((f) => ({ id: `ATT-${Date.now()}-${f.name}`, name: f.name, size: f.size, type: f.type, uploadedBy: this.refs.data().currentUser, uploadedAt: new Date().toISOString() }))];
    try {
      await firstValueFrom(this.api.update(e.id, { ...toUpsert(e), attachments }));
      this.notify.success(`${files.length} document${files.length === 1 ? '' : 's'} uploaded.`);
      this.refresh();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  // ----- Record usage ---------------------------------------------------------
  protected readonly usageOpen = signal(false);
  protected readonly uService = signal<string | number | null>(null);
  protected readonly uSite = signal<string | number | null>(null);
  protected readonly uAsset = signal<string | number | null>(null);
  protected readonly uDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly uTech = signal<string | number | null>(null);
  protected readonly uVisits = signal(1);
  protected readonly uHours = signal(2);
  protected readonly uRef = signal('');
  protected readonly coveredServiceOptions = computed(() => (this.e()?.coverage.serviceIds ?? []).map((id) => ({ value: id, label: this.names([id]) })));
  protected readonly siteOptions = computed(() => this.siteRows().map((s) => ({ value: s.id, label: s.name })));
  protected readonly assetOptions = computed(() => this.coveredAssets().filter((a) => !this.uSite() || a.siteId === this.uSite()).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })));

  protected openUsage(): void {
    const e = this.e();
    this.uService.set(e?.coverage.serviceIds[0] ?? null);
    this.uSite.set(e?.siteIds[0] ?? null);
    this.uAsset.set(null);
    this.uRef.set(`WO-${Math.floor(8000 + Math.random() * 1999)}`);
    this.usageOpen.set(true);
  }

  protected async recordUsage(): Promise<void> {
    const e = this.e();
    if (!e || !this.uService()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.recordUsage(e.id, {
          date: `${this.uDate()}T${new Date().toISOString().slice(11)}`, serviceId: String(this.uService()), siteId: this.uSite() ? String(this.uSite()) : null, assetId: this.uAsset() ? String(this.uAsset()) : null,
          visits: this.uVisits(), hours: this.uHours(), quantity: 1, reference: this.uRef(), technician: this.uTech() ? String(this.uTech()) : '', notes: '',
        }),
      );
      this.notify.success('Usage recorded — remaining entitlement updated.');
      this.usageOpen.set(false);
      this.refresh();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
