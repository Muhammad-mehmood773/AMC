import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { BulkOperationService } from '@core/ui/bulk-operation.service';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type BulkAction, type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { firstValueFrom } from 'rxjs';
import { ImportButton } from '../../components/import-button';
import { SiteApi } from '../../data/customer-site.api';
import {
  TRANSACTION_BLOCKED_CUSTOMER_STATUSES,
  TRANSACTION_BLOCKED_SITE_STATUSES,
} from '../../data/customer-site.config';
import { ModuleHandoff } from '../../data/module-handoff.service';
import { AGREEMENT_STATES, type CustomerStatus } from '../../models/customer.model';
import { SITE_STATUS_TONE } from '../../models/display';
import { LOOKUP } from '../../data/customer-site.lookups';
import { SITE_STATUSES, type SiteListItem } from '../../models/site.model';

@Component({
  selector: 'amc-site-list-page',
  imports: [DataTable, FilterBar, Icon, ImportButton, PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header
        title="Sites"
        subtitle="All customer service locations with assets, agreements and open service activity."
        [breadcrumbs]="[
          { label: 'Customers & Sites', path: '/app/customers/dashboard' },
          { label: 'Sites' },
        ]"
      >
        <amc-import-button entity="sites" (imported)="sites.reload()" />
        <button type="button" class="amc-btn-secondary" [disabled]="!filtered().length" (click)="export()">
          <amc-icon name="download" />
          <span class="hidden sm:inline">Export</span>
        </button>
        <a routerLink="/app/customers/sites/new" [queryParams]="customerId() ? { customerId: customerId() } : {}" class="amc-btn-primary">
          <amc-icon name="plus" />
          Add Site
        </a>
      </amc-page-header>

      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4">
          <amc-filter-bar
            searchPlaceholder="Search site code, name, customer or city…"
            [(search)]="search"
            [fields]="filterFields()"
            [(filters)]="filters"
          />
        </div>
        <amc-data-table
          tableId="sites"
          [entity]="{ singular: 'site', plural: 'sites' }"
          [totalCount]="rows().length"
          [selectable]="true"
          [bulkActions]="bulkActions"
          (bulkAction)="onBulk($event)"
          [rows]="filtered()"
          [columns]="columns"
          [trackBy]="trackById"
          [loading]="sites.isLoading()"
          [error]="sites.error() ? 'Sites could not be loaded.' : null"
          [actions]="rowActions"
          emptyIcon="map-pin"
          [emptyTitle]="rows().length ? 'No sites match your filters' : 'No sites yet'"
          [emptyMessage]="rows().length ? 'Try a different search or clear the filters.' : 'Add a service location for one of your customers.'"
          (action)="onAction($event)"
          (retry)="sites.reload()"
        />
      </section>
    </div>
  `,
})
export class SiteListPage {
  private readonly api = inject(SiteApi);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly notify = inject(NotificationPort);
  private readonly handoff = inject(ModuleHandoff);
  private readonly bulk = inject(BulkOperationService);
  private readonly lookupValues = inject(LookupValuesStore);

  readonly customerId = input<string>();

  protected readonly sites = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.sites.hasValue() ? this.sites.value() : []));

  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.customerId() ? { customer: [this.customerId()!] } : {}));

  protected readonly filterFields = computed<FilterField[]>(() => {
    const rows = this.rows();
    const unique = (values: string[]) => toOptions([...new Set(values)].sort());
    const customers = new Map(rows.map((s) => [s.customerId, s.customerName]));
    return [
      { key: 'customer', label: 'Customer', type: 'multiselect', options: [...customers].map(([value, label]) => ({ value, label })).sort((x, y) => x.label.localeCompare(y.label)) },
      { key: 'type', label: 'Site Type', type: 'multiselect', options: this.lookupValues.options(LOOKUP.siteType)() },
      { key: 'region', label: 'Region', type: 'multiselect', options: unique(rows.map((s) => s.location.region)) },
      { key: 'city', label: 'City', type: 'multiselect', options: unique(rows.map((s) => s.location.city)) },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(SITE_STATUSES) },
      { key: 'contract', label: 'Contract Status', type: 'multiselect', options: toOptions(AGREEMENT_STATES) },
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (s) =>
        (!term || `${s.code} ${s.name} ${s.customerName} ${s.location.city}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'customer', s.customerId) &&
        matchesAny(f, 'type', s.type) &&
        matchesAny(f, 'region', s.location.region) &&
        matchesAny(f, 'city', s.location.city) &&
        matchesAny(f, 'status', s.status) &&
        matchesAny(f, 'contract', s.contractState),
    );
  });

  protected readonly bulkActions: MenuItem[] = [
    { id: 'activate', label: 'Activate', icon: 'check-circle' },
    { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true },
    { id: 'export', label: 'Export', icon: 'download' },
  ];

  protected readonly columns: readonly DataColumn<SiteListItem>[] = [
    { key: 'code', label: 'Site Code', value: (s) => s.code, type: 'mono', sortable: true, visibility: 'xl', mobile: 'hidden', width: 120 },
    { key: 'name', label: 'Site Name', value: (s) => s.name, secondary: (s) => s.code, link: (s) => `/app/customers/sites/${s.id}`, sortable: true, mobile: 'title', width: 260, hideable: false },
    { key: 'customer', label: 'Customer', value: (s) => s.customerName, link: (s) => `/app/customers/${s.customerId}`, sortable: true, mobile: 'meta', width: 240 },
    { key: 'type', label: 'Site Type', value: (s) => s.type, sortable: true, mobile: 'meta', width: 160 },
    { key: 'city', label: 'City', value: (s) => s.location.city, sortable: true, mobile: 'meta', width: 140 },
    { key: 'region', label: 'Region', value: (s) => s.location.region, sortable: true, visibility: 'xl', width: 150 },
    { key: 'contact', label: 'Primary Contact', value: (s) => s.primaryContactName, sortable: true, visibility: 'xl', width: 190 },
    { key: 'assets', label: 'Total Assets', value: (s) => s.totalAssets, type: 'number', sortable: true, visibility: 'lg', width: 120 },
    { key: 'contracts', label: 'Active Contracts', value: (s) => s.activeContracts, type: 'number', sortable: true, visibility: 'lg', width: 140 },
    { key: 'requests', label: 'Open SRs', value: (s) => s.openServiceRequests, type: 'number', sortable: true, visibility: 'lg', width: 110 },
    { key: 'status', label: 'Status', value: (s) => s.status, type: 'badge', tone: (s) => SITE_STATUS_TONE[s.status], sortable: true, mobile: 'badge', width: 150 },
  ];

  protected readonly rowActions = (s: SiteListItem): MenuItem[] => {
    const blocked =
      TRANSACTION_BLOCKED_SITE_STATUSES.includes(s.status) ||
      TRANSACTION_BLOCKED_CUSTOMER_STATUSES.includes(s.customerStatus as CustomerStatus);
    const hint = blocked ? 'Not available for inactive sites or customers' : undefined;
    return [
      { id: 'view', label: 'View', icon: 'eye' },
      { id: 'edit', label: 'Edit', icon: 'pencil' },
      { id: 'add-contact', label: 'Add Contact', icon: 'user-plus', dividerBefore: true },
      { id: 'add-asset', label: 'Add Asset', icon: 'box', disabled: blocked, hint },
      { id: 'create-request', label: 'Create Service Request', icon: 'ticket', disabled: blocked, hint },
      { id: 'create-work-order', label: 'Create Work Order', icon: 'wrench', disabled: blocked, hint },
      s.status === 'Inactive' || s.status === 'Archived'
        ? { id: 'activate', label: 'Activate', icon: 'check-circle', dividerBefore: true }
        : { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, dividerBefore: true },
    ];
  };

  protected readonly trackById = (s: SiteListItem) => s.id;

  protected async onBulk({ id, rows }: BulkAction<SiteListItem>): Promise<void> {
    if (id === 'export') {
      this.export(rows);
      return;
    }
    const status = id === 'activate' ? 'Active' : 'Inactive';
    if (status === 'Inactive') {
      const ok = await this.confirm.open({
        title: `Deactivate ${rows.length} site${rows.length === 1 ? '' : 's'}?`,
        message: 'Deactivated sites are restricted from new service requests and work orders. Assets, agreements and history are retained.',
        confirmLabel: 'Deactivate',
        danger: true,
      });
      if (!ok) return;
    }
    await this.bulk.run(
      `${status === 'Active' ? 'Activating' : 'Deactivating'} ${rows.length} site${rows.length === 1 ? '' : 's'}`,
      rows,
      (site) => firstValueFrom(this.api.setStatus(site.id, status)),
      (site) => site.name,
    );
    this.sites.reload();
  }

  protected async onAction({ id, row }: RowAction<SiteListItem>): Promise<void> {
    const context = { customerName: row.customerName, siteName: row.name };
    switch (id) {
      case 'view':
        void this.router.navigate(['/app/customers/sites', row.id]);
        break;
      case 'edit':
        void this.router.navigate(['/app/customers/sites', row.id, 'edit']);
        break;
      case 'add-contact':
        void this.router.navigate(['/app/customers/sites', row.id], { queryParams: { tab: 'contacts', action: 'add-contact' } });
        break;
      case 'add-asset':
        this.handoff.open('Add Asset', context);
        break;
      case 'create-request':
        this.handoff.open('Create Service Request', context);
        break;
      case 'create-work-order':
        this.handoff.open('Create Work Order', context);
        break;
      case 'deactivate': {
        const dependents = row.totalAssets + row.activeContracts + row.openServiceRequests + row.openWorkOrders;
        const ok = await this.confirm.open({
          title: 'Deactivate site?',
          message: `${row.name} will be restricted from new service requests and work orders.${dependents ? ' Linked assets, agreements and history are retained.' : ''}`,
          confirmLabel: 'Deactivate',
          danger: true,
        });
        if (ok) await this.setStatus(row, 'Inactive');
        break;
      }
      case 'activate':
        await this.setStatus(row, 'Active');
        break;
    }
  }

  private async setStatus(site: SiteListItem, status: 'Active' | 'Inactive'): Promise<void> {
    try {
      await firstValueFrom(this.api.setStatus(site.id, status));
      this.notify.success(`${site.name} ${status === 'Active' ? 'activated' : 'deactivated'}.`);
      this.sites.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  protected export(rows: readonly SiteListItem[] = this.filtered()): void {
    downloadCsv(
      timestampedName('sites', 'csv'),
      ['Site Code', 'Site Name', 'Customer', 'Site Type', 'City', 'Region', 'Primary Contact', 'Total Assets', 'Active Contracts', 'Open Service Requests', 'Status'],
      rows.map((s) => [s.code, s.name, s.customerName, s.type, s.location.city, s.location.region, s.primaryContactName, s.totalAssets, s.activeContracts, s.openServiceRequests, s.status]),
    );
    this.notify.success(`${rows.length} sites exported.`);
  }
}
