import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type BulkAction, DataTable, type RowAction } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, matchesAny, withinRange } from '@shared/utils/filters';
import { firstValueFrom } from 'rxjs';
import { entitlementColumns } from '../components/catalog-columns';
import { EntitlementActionDialog, type EntitlementActionMode } from '../components/entitlement-action-dialog';
import { EntitlementValidationDialog } from '../components/entitlement-validation-dialog';
import { CatalogReferenceStore } from '../data/catalog-reference.store';
import { EntitlementApi, ServiceCatalogApi } from '../data/catalog.api';
import { COVERAGE_TYPES, ENTITLEMENT_STATUSES, type EntitlementListItem } from '../models/entitlement.model';

const FLAGS: Record<string, string> = { expiring: 'Expiring soon', limited: 'With usage limits', 'near-limit': 'Near usage limit' };

@Component({
  selector: 'amc-entitlement-list-page',
  imports: [DataTable, EntitlementActionDialog, EntitlementValidationDialog, FilterBar, Icon, PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Entitlements" subtitle="Customer service rights and coverage across contracts, AMCs, sites and assets." [breadcrumbs]="[{ label: 'Service Catalog', path: '/app/catalog/dashboard' }, { label: 'Entitlements' }]">
        <button type="button" class="amc-btn-secondary" (click)="validateOpen.set(true)"><amc-icon name="shield-check" /> <span class="hidden sm:inline">Validate Entitlement</span></button>
        <button type="button" class="amc-btn-secondary" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/catalog/entitlements/new" class="amc-btn-primary"><amc-icon name="plus" /> Add Entitlement</a>
      </amc-page-header>

      @if (flagLabel()) {
        <div class="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-subtle px-4 py-2.5 text-sm">
          <amc-icon name="sliders" [size]="15" class="text-brand" />
          <p class="flex-1 text-ink">Showing: <span class="font-medium">{{ flagLabel() }}</span></p>
          <button type="button" class="amc-btn-ghost amc-btn-sm text-xs" (click)="activeFlag.set('')">Clear</button>
        </div>
      }

      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4">
          <amc-filter-bar searchPlaceholder="Search entitlement number, customer, contract, AMC, asset or service…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" />
        </div>
        <amc-data-table
          tableId="catalog-entitlements"
          [entity]="{ singular: 'entitlement', plural: 'entitlements' }"
          [totalCount]="rows().length"
          [rows]="filtered()"
          [columns]="columns"
          [trackBy]="trackById"
          [loading]="entitlements.isLoading()"
          [error]="entitlements.error() ? 'Entitlements could not be loaded.' : null"
          [actions]="rowActions"
          [selectable]="true"
          [bulkActions]="bulkActions"
          emptyIcon="shield-check"
          [emptyTitle]="rows().length ? 'No entitlements match your filters' : 'No entitlements yet'"
          emptyMessage="Try a different search or clear the filters."
          (action)="onAction($event)"
          (bulkAction)="onBulk($event)"
          (retry)="entitlements.reload()"
        />
      </section>
    </div>

    <amc-entitlement-action-dialog [entitlement]="selected()" [(mode)]="actionMode" (done)="entitlements.reload()" />
    <amc-entitlement-validation-dialog [(open)]="validateOpen" (consumed)="entitlements.reload()" />
  `,
})
export class EntitlementListPage {
  private readonly api = inject(EntitlementApi);
  private readonly servicesApi = inject(ServiceCatalogApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(CatalogReferenceStore);

  readonly status = input<string>();
  readonly flag = input<string>();
  readonly customer = input<string>();

  protected readonly entitlements = rxResource({ stream: () => this.api.list() });
  private readonly services = rxResource({ stream: () => this.servicesApi.list() });
  protected readonly rows = computed(() => (this.entitlements.hasValue() ? this.entitlements.value() : []));
  protected readonly columns = entitlementColumns();
  protected readonly trackById = (e: EntitlementListItem) => e.id;
  protected readonly validateOpen = signal(false);
  protected readonly actionMode = signal<EntitlementActionMode | null>(null);
  protected readonly selected = signal<EntitlementListItem | null>(null);

  protected readonly search = signal('');
  protected readonly activeFlag = linkedSignal(() => this.flag() ?? '');
  protected readonly flagLabel = computed(() => FLAGS[this.activeFlag()] ?? null);
  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = {};
    if (this.status()) seed['status'] = [this.status()!];
    if (this.customer()) seed['customer'] = [this.customer()!];
    return seed;
  });

  protected readonly filterFields = computed<FilterField[]>(() => {
    const customers = filterList(this.filters(), 'customer');
    const customerId = customers.length === 1 ? customers[0] : null;
    return [
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(customerId) },
      { key: 'asset', label: 'Asset', type: 'multiselect', options: this.refs.assetOptions(customerId) },
      { key: 'contract', label: 'Contract', type: 'multiselect', options: this.refs.agreementOptions('Contract', customerId) },
      { key: 'amc', label: 'AMC', type: 'multiselect', options: this.refs.agreementOptions('AMC', customerId) },
      { key: 'service', label: 'Service', type: 'multiselect', options: (this.services.hasValue() ? this.services.value() : []).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` })) },
      { key: 'coverage', label: 'Coverage Type', type: 'multiselect', options: toOptions(COVERAGE_TYPES) },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(ENTITLEMENT_STATUSES) },
      { key: 'expiry', label: 'Expiry Date', type: 'date-range' },
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const flag = this.activeFlag();
    const any = (key: string, values: readonly string[]) => { const sel = filterList(f, key); return !sel.length || values.some((v) => sel.includes(v)); };
    return this.rows().filter(
      (e) =>
        (!term || `${e.number} ${e.name} ${e.customerName} ${e.agreementNumber ?? ''} ${e.assetLabels.join(' ')} ${e.serviceNames.join(' ')}`.toLowerCase().includes(term)) &&
        (flag !== 'expiring' || e.expiring) &&
        (flag !== 'limited' || (e.effectiveStatus === 'Active' && e.usage.limitApplicable)) &&
        (flag !== 'near-limit' || (e.effectiveStatus === 'Active' && ['Near Limit', 'Exhausted', 'Overused'].includes(e.usageSummary.state))) &&
        matchesAny(f, 'customer', e.customerId) &&
        any('site', e.siteIds) &&
        any('asset', e.assetIds) &&
        matchesAny(f, 'contract', e.contractId) &&
        matchesAny(f, 'amc', e.amcId) &&
        any('service', e.coverage.serviceIds) &&
        matchesAny(f, 'coverage', e.coverage.coverageType) &&
        matchesAny(f, 'status', e.effectiveStatus) &&
        withinRange(f, 'expiry', e.validity.endDate),
    );
  });

  protected readonly bulkActions: MenuItem[] = [{ id: 'export', label: 'Export', icon: 'download' }];

  protected readonly rowActions = (e: EntitlementListItem): MenuItem[] => [
    { id: 'view', label: 'View', icon: 'eye' },
    { id: 'edit', label: 'Edit', icon: 'pencil', disabled: e.status === 'Cancelled' },
    { id: 'usage', label: 'View Usage', icon: 'activity', dividerBefore: true },
    { id: 'history', label: 'View Service History', icon: 'history' },
    { id: 'extend', label: 'Extend', icon: 'calendar', disabled: e.status === 'Cancelled', dividerBefore: true },
    { id: 'renew', label: 'Renew', icon: 'refresh', disabled: e.status === 'Cancelled' },
    e.effectiveStatus === 'Suspended' || e.effectiveStatus === 'Draft'
      ? { id: 'activate', label: e.effectiveStatus === 'Draft' ? 'Activate' : 'Reactivate', icon: 'check-circle' }
      : { id: 'suspend', label: 'Suspend', icon: 'ban', danger: true, disabled: e.effectiveStatus !== 'Active' },
  ];

  protected async onAction({ id, row }: RowAction<EntitlementListItem>): Promise<void> {
    this.selected.set(row);
    switch (id) {
      case 'view':
        void this.router.navigate(['/app/catalog/entitlements', row.id]);
        break;
      case 'edit':
        void this.router.navigate(['/app/catalog/entitlements', row.id, 'edit']);
        break;
      case 'usage':
        void this.router.navigate(['/app/catalog/entitlements', row.id], { queryParams: { tab: 'usage' } });
        break;
      case 'history':
        void this.router.navigate(['/app/catalog/entitlements', row.id], { queryParams: { tab: 'service-history' } });
        break;
      case 'activate':
        try {
          await firstValueFrom(this.api.activate(row.id));
          this.notify.success(`${row.number} activated.`);
          this.entitlements.reload();
        } catch (error) {
          this.notify.error((error as Error).message);
        }
        break;
      default:
        this.actionMode.set(id as EntitlementActionMode);
    }
  }

  protected onBulk({ rows }: BulkAction<EntitlementListItem>): void {
    this.export(rows);
  }

  protected export(rows: readonly EntitlementListItem[] = this.filtered()): void {
    downloadCsv(
      timestampedName('entitlements', 'csv'),
      ['Entitlement Number', 'Name', 'Customer', 'Sites', 'Assets', 'Contract / AMC', 'Services', 'Coverage Type', 'Start Date', 'End Date', 'Usage Limit', 'Used', 'Remaining', 'Status'],
      rows.map((e) => [e.number, e.name, e.customerName, e.siteNames.join('; ') || 'All sites', e.assetLabels.join('; ') || 'All assets', e.agreementNumber, e.serviceNames.join('; '), e.coverage.coverageType, e.validity.startDate, e.validity.endDate, e.usageSummary.allowed ?? 'Unlimited', e.usageSummary.consumed, e.usageSummary.remaining, e.effectiveStatus]),
    );
  }
}
