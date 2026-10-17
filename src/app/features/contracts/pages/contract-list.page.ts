import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type BulkAction, DataTable, type RowAction, type SortState } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, matchesAny, withinRange } from '@shared/utils/filters';
import { ContractActionHost, contractActions } from '../components/contract-action-host';
import { contractColumns } from '../components/contract-columns';
import { VALUE_BANDS, inBands } from '../components/value-bands';
import { ContractReferenceStore } from '../data/contract-reference.store';
import { ContractApi } from '../data/contract.api';
import { APPROVAL_STATUSES, CONTRACT_STATUSES, CONTRACT_TYPES, type ContractListItem, SIGNATURE_STATUSES } from '../models/contract.model';

@Component({
  selector: 'amc-contract-list-page',
  imports: [ContractActionHost, DataTable, FilterBar, Icon, PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contracts" subtitle="Customer, vendor, partner and service contracts across their lifecycle." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'List' }]">
        <button type="button" class="amc-btn-secondary" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/contracts/requests" [queryParams]="{ action: 'new' }" class="amc-btn-secondary hidden sm:inline-flex"><amc-icon name="inbox" /> Contract Request</a>
        <a routerLink="/app/contracts/new" class="amc-btn-primary"><amc-icon name="plus" /> Create Contract</a>
      </amc-page-header>
      @if (activeFlag() === 'sla') {
        <div class="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-subtle px-4 py-2.5 text-sm">
          <amc-icon name="sliders" [size]="15" class="text-brand" /><p class="flex-1 text-ink">Showing: <span class="font-medium">Contracts with SLA breaches</span></p>
          <button type="button" class="amc-btn-ghost amc-btn-sm text-xs" (click)="activeFlag.set('')">Clear</button>
        </div>
      }
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4">
          <amc-filter-bar searchPlaceholder="Search contract number, title, customer, customer code or reference…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" />
        </div>
        <amc-data-table
          tableId="contracts"
          [entity]="{ singular: 'contract', plural: 'contracts' }"
          [totalCount]="rows().length"
          [rows]="filtered()"
          [columns]="columns"
          [trackBy]="trackById"
          [loading]="contracts.isLoading()"
          [error]="contracts.error() ? 'Contracts could not be loaded.' : null"
          [actions]="rowActions"
          [selectable]="true"
          [bulkActions]="bulkActions"
          [(sort)]="sort"
          emptyIcon="file-text"
          [emptyTitle]="rows().length ? 'No contracts match your filters' : 'No contracts yet'"
          emptyMessage="Try a different search or clear the filters."
          (action)="onAction($event)"
          (bulkAction)="onBulk($event)"
          (retry)="contracts.reload()"
        />
      </section>
    </div>
    <amc-contract-action-host (done)="contracts.reload()" />
  `,
})
export class ContractListPage {
  private readonly api = inject(ContractApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(ContractReferenceStore);
  private readonly host = viewChild.required(ContractActionHost);

  readonly status = input<string>();
  readonly customer = input<string>();
  readonly flag = input<string>();

  protected readonly contracts = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.contracts.hasValue() ? this.contracts.value() : []));
  protected readonly columns = contractColumns();
  protected readonly trackById = (c: ContractListItem) => c.id;
  protected readonly sort = signal<SortState | null>(null);
  protected readonly search = signal('');
  protected readonly activeFlag = linkedSignal(() => this.flag() ?? '');
  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = {};
    if (this.status()) seed['status'] = [this.status()!];
    if (this.customer()) seed['customer'] = [this.customer()!];
    return seed;
  });

  protected readonly filterFields = computed<FilterField[]>(() => {
    const customers = filterList(this.filters(), 'customer');
    return [
      { key: 'type', label: 'Contract Type', type: 'multiselect', options: toOptions(CONTRACT_TYPES) },
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(customers.length === 1 ? customers[0] : null) },
      { key: 'status', label: 'Contract Status', type: 'multiselect', options: toOptions(CONTRACT_STATUSES) },
      { key: 'approval', label: 'Approval Status', type: 'multiselect', options: toOptions(APPROVAL_STATUSES) },
      { key: 'signature', label: 'Signature Status', type: 'multiselect', options: toOptions(SIGNATURE_STATUSES) },
      { key: 'owner', label: 'Contract Owner', type: 'multiselect', options: this.refs.userOptions() },
      { key: 'manager', label: 'Contract Manager', type: 'multiselect', options: this.refs.usersByRole('Contract Manager') },
      { key: 'start', label: 'Start Date', type: 'date-range' },
      { key: 'end', label: 'End Date', type: 'date-range' },
      { key: 'renewal', label: 'Renewal Date', type: 'date-range' },
      { key: 'value', label: 'Value Range', type: 'multiselect', options: VALUE_BANDS.map((b) => ({ value: b.label, label: b.label })) },
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const sites = filterList(f, 'site');
    return this.rows().filter(
      (c) =>
        (!term || `${c.number} ${c.title} ${c.customerName ?? ''} ${c.customerCode ?? ''} ${c.requestId ?? ''} ${c.externalReference} ${c.parties.vendorPartner}`.toLowerCase().includes(term)) &&
        (this.activeFlag() !== 'sla' || c.slaBreaches > 0) &&
        matchesAny(f, 'type', c.type) && matchesAny(f, 'customer', c.parties.customerId) && (!sites.length || c.scopeInfo.siteIds.some((s) => sites.includes(s))) &&
        matchesAny(f, 'status', c.effectiveStatus) && matchesAny(f, 'approval', c.approvalStatus) && matchesAny(f, 'signature', c.signatureStatus) && matchesAny(f, 'owner', c.parties.ownerId) &&
        matchesAny(f, 'manager', c.parties.managerId) && withinRange(f, 'start', c.period.startDate) && withinRange(f, 'end', c.period.endDate) && withinRange(f, 'renewal', c.period.renewalDate) &&
        inBands(filterList(f, 'value'), c.commercial.value),
    );
  });

  protected readonly rowActions = (c: ContractListItem): MenuItem[] => [...contractActions(c, true), { id: 'export', label: 'Export', icon: 'download', dividerBefore: true }];
  protected readonly bulkActions: MenuItem[] = [{ id: 'export', label: 'Export', icon: 'download' }];

  protected onAction({ id, row }: RowAction<ContractListItem>): void {
    if (id === 'export') this.export([row]);
    else void this.host().run(id, row);
  }

  protected onBulk({ rows }: BulkAction<ContractListItem>): void {
    this.export(rows);
  }

  protected export(rows: readonly ContractListItem[] = this.filtered()): void {
    downloadCsv(
      timestampedName('contracts', 'csv'),
      ['Contract Number', 'Contract Title', 'Contract Type', 'Customer', 'Site', 'Contract Owner', 'Start Date', 'End Date', 'Renewal Date', 'Contract Value', 'Currency', 'Status', 'Approval Status', 'Signature Status', 'Version', 'Created Date'],
      rows.map((c) => [c.number, c.title, c.type, c.customerName, c.siteNames.join('; '), c.ownerName, c.period.startDate, c.period.endDate, c.period.renewalDate, c.commercial.value, c.commercial.currency, c.effectiveStatus, c.approvalStatus, c.signatureStatus, c.version, c.createdAt.slice(0, 10)]),
    );
    this.notify.success(`${rows.length} contract${rows.length === 1 ? '' : 's'} exported.`);
  }
}
