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
import { AmcActionHost, amcActions } from '../components/amc-action-host';
import { amcColumns } from '../components/amc-columns';
import { AmcReferenceStore } from '../data/amc-reference.store';
import { AmcApi } from '../data/amc.api';
import { AMC_STATUSES, AMC_TYPES, type AmcListItem } from '../models/amc.model';

@Component({
  selector: 'amc-amc-list-page',
  imports: [AmcActionHost, DataTable, FilterBar, Icon, PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="AMC / Service Contracts" subtitle="All maintenance and service agreements with coverage and consumption." [breadcrumbs]="[{ label: 'AMC / Service Contracts', path: '/app/amc-agreements/dashboard' }, { label: 'List' }]">
        <button type="button" class="amc-btn-secondary" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/amc-agreements/new" class="amc-btn-primary"><amc-icon name="plus" /> Create AMC</a>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4">
          <amc-filter-bar searchPlaceholder="Search AMC number, title, customer, contract number, asset or site…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" />
        </div>
        <amc-data-table
          tableId="amc-agreements"
          [entity]="{ singular: 'AMC', plural: 'AMCs' }"
          [totalCount]="rows().length"
          [rows]="filtered()"
          [columns]="columns"
          [trackBy]="trackById"
          [loading]="amcs.isLoading()"
          [error]="amcs.error() ? 'AMCs could not be loaded.' : null"
          [actions]="rowActions"
          [selectable]="true"
          [bulkActions]="bulkActions"
          [(sort)]="sort"
          emptyIcon="shield-check"
          [emptyTitle]="rows().length ? 'No AMCs match your filters' : 'No AMCs yet'"
          emptyMessage="Try a different search or clear the filters."
          (action)="onAction($event)"
          (bulkAction)="onBulk($event)"
          (retry)="amcs.reload()"
        />
      </section>
    </div>
    <amc-amc-action-host (done)="amcs.reload()" />
  `,
})
export class AmcListPage {
  private readonly api = inject(AmcApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(AmcReferenceStore);
  private readonly host = viewChild.required(AmcActionHost);

  readonly status = input<string>();
  readonly customer = input<string>();

  protected readonly amcs = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.amcs.hasValue() ? this.amcs.value() : []));
  protected readonly columns = amcColumns();
  protected readonly trackById = (a: AmcListItem) => a.id;
  protected readonly sort = signal<SortState | null>(null);
  protected readonly search = signal('');
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
      { key: 'type', label: 'AMC Type', type: 'multiselect', options: toOptions(AMC_TYPES) },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(AMC_STATUSES) },
      { key: 'contract', label: 'Contract', type: 'multiselect', options: this.refs.contractOptions(customerId) },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(customerId) },
      { key: 'region', label: 'Service Region', type: 'multiselect', options: this.refs.regionOptions() },
      { key: 'start', label: 'Start Date', type: 'date-range' },
      { key: 'end', label: 'End Date', type: 'date-range' },
      { key: 'renewal', label: 'Renewal Date', type: 'date-range' },
    ];
  });
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const sites = filterList(f, 'site');
    return this.rows().filter((a) => {
      const haystack = `${a.number} ${a.title} ${a.customerName} ${a.parentContractNumber ?? ''} ${a.scope.assetIds.join(' ')} ${a.siteNames.join(' ')}`.toLowerCase();
      return (
        (!term || haystack.includes(term)) && matchesAny(f, 'customer', a.customer.customerId) && matchesAny(f, 'type', a.type) && matchesAny(f, 'status', a.effectiveStatus) &&
        matchesAny(f, 'contract', a.parentContractId) && (!sites.length || a.scope.siteIds.some((s) => sites.includes(s))) && matchesAny(f, 'region', a.operational.serviceRegion) &&
        withinRange(f, 'start', a.period.startDate) && withinRange(f, 'end', a.period.endDate) && withinRange(f, 'renewal', a.period.renewalDate)
      );
    });
  });
  protected readonly rowActions = (a: AmcListItem): MenuItem[] => [...amcActions(a, true), { id: 'export', label: 'Export', icon: 'download', dividerBefore: true }];
  protected readonly bulkActions: MenuItem[] = [{ id: 'export', label: 'Export', icon: 'download' }];

  protected onAction({ id, row }: RowAction<AmcListItem>): void {
    if (id === 'export') this.export([row]);
    else void this.host().run(id, row);
  }

  protected onBulk({ rows }: BulkAction<AmcListItem>): void {
    this.export(rows);
  }

  protected export(rows: readonly AmcListItem[] = this.filtered()): void {
    downloadCsv(
      timestampedName('amc-agreements', 'csv'),
      ['AMC Number', 'AMC Title', 'AMC Type', 'Customer', 'Contract', 'Covered Sites', 'Covered Assets', 'Start Date', 'End Date', 'Renewal Date', 'Contract Value', 'Currency', 'Visits Included', 'Visits Used', 'Visits Remaining', 'Status'],
      rows.map((a) => [a.number, a.title, a.type, a.customerName, a.parentContractNumber, a.scope.siteIds.length, a.scope.assetIds.length, a.period.startDate, a.period.endDate, a.period.renewalDate, a.commercial.value, a.commercial.currency, a.consumption.includedVisits, a.consumption.usedVisits, a.consumption.remainingVisits, a.effectiveStatus]),
    );
    this.notify.success(`${rows.length} AMC${rows.length === 1 ? '' : 's'} exported.`);
  }
}
