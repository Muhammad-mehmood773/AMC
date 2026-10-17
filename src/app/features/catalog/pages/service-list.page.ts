import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type BulkAction, DataTable, type RowAction, type SortState } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { firstValueFrom } from 'rxjs';
import { serviceColumns } from '../components/catalog-columns';
import { CategoryApi, ServiceCatalogApi } from '../data/catalog.api';
import { BILLING_METHODS, SERVICE_STATUSES, SERVICE_TYPES, type ServiceListItem, type ServiceStatus } from '../models/catalog.model';

@Component({
  selector: 'amc-service-list-page',
  imports: [DataTable, FilterBar, Icon, PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Service Catalog" subtitle="All services that can be offered, sold, scheduled, performed or included in contracts and AMCs." [breadcrumbs]="[{ label: 'Service Catalog', path: '/app/catalog/dashboard' }, { label: 'Services' }]">
        <button type="button" class="amc-btn-secondary" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/catalog/services/new" class="amc-btn-primary"><amc-icon name="plus" /> Add Service</a>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4">
          <amc-filter-bar searchPlaceholder="Search service code, name or description…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" />
        </div>
        <amc-data-table
          tableId="catalog-services"
          [entity]="{ singular: 'service', plural: 'services' }"
          [totalCount]="rows().length"
          [rows]="filtered()"
          [columns]="columns"
          [trackBy]="trackById"
          [loading]="services.isLoading()"
          [error]="services.error() ? 'Services could not be loaded.' : null"
          [actions]="rowActions"
          [selectable]="true"
          [bulkActions]="bulkActions"
          [(selected)]="selected"
          [(sort)]="sort"
          emptyIcon="list"
          [emptyTitle]="rows().length ? 'No services match your filters' : 'No services yet'"
          [emptyMessage]="rows().length ? 'Try a different search or clear the filters.' : 'Define the services your organization offers.'"
          (action)="onAction($event)"
          (bulkAction)="onBulk($event)"
          (retry)="services.reload()"
        />
      </section>
    </div>
  `,
})
export class ServiceListPage {
  private readonly api = inject(ServiceCatalogApi);
  private readonly categoriesApi = inject(CategoryApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);

  readonly status = input<string>();
  readonly billing = input<string>();
  readonly eligible = input<string>();
  readonly category = input<string>();
  readonly type = input<string>();

  protected readonly services = rxResource({ stream: () => this.api.list() });
  private readonly categories = rxResource({ stream: () => this.categoriesApi.list() });
  protected readonly rows = computed(() => (this.services.hasValue() ? this.services.value() : []));
  protected readonly columns = serviceColumns();
  protected readonly trackById = (s: ServiceListItem) => s.id;
  protected readonly selected = signal<readonly string[]>([]);
  protected readonly sort = signal<SortState | null>(null);
  protected readonly search = signal('');

  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = {};
    if (this.status()) seed['status'] = this.status() === 'Inactive' ? ['Inactive', 'Draft'] : [this.status()!];
    if (this.billing()) seed['billable'] = [this.billing()!];
    if (this.eligible()) seed['eligible'] = [this.eligible() === 'amc' ? 'AMC-eligible' : 'Contract-eligible'];
    if (this.category()) seed['category'] = [this.category()!];
    if (this.type()) seed['type'] = [this.type()!];
    return seed;
  });

  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'category', label: 'Service Category', type: 'multiselect', options: (this.categories.hasValue() ? this.categories.value() : []).map((c) => ({ value: c.id, label: c.parentName ? `${c.parentName} › ${c.name}` : c.name })) },
    { key: 'type', label: 'Service Type', type: 'multiselect', options: toOptions(SERVICE_TYPES) },
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(SERVICE_STATUSES) },
    { key: 'billingMethod', label: 'Billing Type', type: 'multiselect', options: toOptions(BILLING_METHODS) },
    { key: 'billable', label: 'Billable / Non-Billable', type: 'multiselect', options: toOptions(['Billable', 'Non-Billable'] as const) },
    { key: 'sla', label: 'SLA Eligibility', type: 'multiselect', options: toOptions(['SLA Eligible', 'Not SLA Eligible'] as const) },
    { key: 'eligible', label: 'Contract / AMC Eligibility', type: 'multiselect', options: toOptions(['Contract-eligible', 'AMC-eligible'] as const) },
    { key: 'created', label: 'Created Date', type: 'date-range' },
  ]);

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const eligible = (f['eligible'] as readonly string[] | undefined) ?? [];
    return this.rows().filter(
      (s) =>
        (!term || `${s.code} ${s.name} ${s.shortName} ${s.description} ${s.customerDescription}`.toLowerCase().includes(term)) &&
        (matchesAny(f, 'category', s.categoryId) || matchesAny(f, 'category', s.subcategoryId)) &&
        matchesAny(f, 'type', s.type) &&
        matchesAny(f, 'status', s.status) &&
        matchesAny(f, 'billingMethod', s.commercial.billingMethod) &&
        matchesAny(f, 'billable', s.commercial.billable ? 'Billable' : 'Non-Billable') &&
        matchesAny(f, 'sla', s.sla.applicable ? 'SLA Eligible' : 'Not SLA Eligible') &&
        (!eligible.includes('Contract-eligible') || s.commercial.contractEligible) &&
        (!eligible.includes('AMC-eligible') || s.commercial.amcEligible) &&
        withinRange(f, 'created', s.createdAt),
    );
  });

  protected readonly bulkActions: MenuItem[] = [
    { id: 'activate', label: 'Activate', icon: 'check-circle' },
    { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true },
    { id: 'export', label: 'Export', icon: 'download' },
  ];

  protected readonly rowActions = (s: ServiceListItem): MenuItem[] => [
    { id: 'view', label: 'View', icon: 'eye' },
    { id: 'edit', label: 'Edit', icon: 'pencil' },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { id: 'usage', label: 'View Usage', icon: 'activity' },
    { id: 'entitlement', label: 'Create Entitlement', icon: 'shield-check', disabled: s.status !== 'Active', hint: s.status !== 'Active' ? 'Inactive services cannot be used in new entitlements' : undefined },
    { id: 'export', label: 'Export', icon: 'download' },
    s.status === 'Active'
      ? { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, dividerBefore: true }
      : { id: 'activate', label: 'Activate', icon: 'check-circle', dividerBefore: true },
  ];

  protected async onAction({ id, row }: RowAction<ServiceListItem>): Promise<void> {
    switch (id) {
      case 'view':
        void this.router.navigate(['/app/catalog/services', row.id]);
        break;
      case 'edit':
        void this.router.navigate(['/app/catalog/services', row.id, 'edit']);
        break;
      case 'duplicate':
        await this.duplicate(row);
        break;
      case 'usage':
        void this.router.navigate(['/app/catalog/services', row.id], { queryParams: { tab: 'usage' } });
        break;
      case 'entitlement':
        void this.router.navigate(['/app/catalog/entitlements/new'], { queryParams: { serviceId: row.id } });
        break;
      case 'export':
        this.export([row]);
        break;
      default:
        await this.setStatus([row.id], id === 'activate' ? 'Active' : 'Inactive');
    }
  }

  protected async onBulk({ id, rows }: BulkAction<ServiceListItem>): Promise<void> {
    if (id === 'export') this.export(rows);
    else await this.setStatus(rows.map((r) => r.id), id === 'activate' ? 'Active' : 'Inactive');
  }

  private async duplicate(row: ServiceListItem): Promise<void> {
    try {
      const copy = await firstValueFrom(this.api.duplicate(row.id));
      this.notify.success(`${copy.code} created as a draft copy of ${row.code}.`);
      void this.router.navigate(['/app/catalog/services', copy.id, 'edit']);
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  private async setStatus(ids: readonly string[], status: ServiceStatus): Promise<void> {
    if (status === 'Inactive') {
      const ok = await this.confirm.open({
        title: `Deactivate ${ids.length === 1 ? 'service' : ids.length + ' services'}?`,
        message: 'Inactive services cannot be selected for new operational transactions. Historical transactions using them remain unchanged.',
        confirmLabel: 'Deactivate',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await firstValueFrom(this.api.setStatus(ids, status));
      this.notify.success(`${ids.length} service${ids.length === 1 ? '' : 's'} ${status === 'Active' ? 'activated' : 'deactivated'}.`);
      this.selected.set([]);
      this.services.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  protected export(rows: readonly ServiceListItem[] = this.filtered()): void {
    downloadCsv(
      timestampedName('service-catalog', 'csv'),
      ['Service Code', 'Service Name', 'Service Category', 'Subcategory', 'Service Type', 'Service Status', 'Billing Type', 'Billable', 'Unit', 'Standard Duration (h)', 'Standard Price', 'Currency', 'SLA Eligible', 'Contract Eligible', 'AMC Eligible', 'Created Date'],
      rows.map((s) => [s.code, s.name, s.categoryName, s.subcategoryName, s.type, s.status, s.commercial.billingMethod, s.commercial.billable ? 'Yes' : 'No', s.operational.unit, s.operational.standardDuration, s.commercial.standardPrice, s.commercial.currency, s.sla.applicable ? 'Yes' : 'No', s.commercial.contractEligible ? 'Yes' : 'No', s.commercial.amcEligible ? 'Yes' : 'No', s.createdAt.slice(0, 10)]),
    );
    this.notify.success(`${rows.length} service${rows.length === 1 ? '' : 's'} exported.`);
  }
}
