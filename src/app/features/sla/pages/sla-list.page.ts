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
import { SlaActionHost, slaActions } from '../components/sla-action-host';
import { slaColumns } from '../components/sla-columns';
import { SlaReferenceStore } from '../data/sla-reference.store';
import { SlaApi } from '../data/sla.api';
import { formatMinutes } from '../models/display';
import { PRIORITIES, SLA_STATUSES, SLA_TYPES, type SlaListItem } from '../models/sla.model';

@Component({
  selector: 'amc-sla-list-page',
  imports: [DataTable, FilterBar, Icon, PageHeader, RouterLink, SlaActionHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="SLAs" subtitle="All configured service-level agreements with targets, validity and compliance." [breadcrumbs]="[{ label: 'SLA Management', path: '/app/sla/dashboard' }, { label: 'List' }]">
        <button type="button" class="amc-btn-secondary" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/sla/new" class="amc-btn-primary"><amc-icon name="plus" /> Create SLA</a>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search SLA number, name, customer, contract, AMC, service, site or asset…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="slas" [entity]="{ singular: 'SLA', plural: 'SLAs' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="slas.isLoading()" [error]="slas.error() ? 'SLAs could not be loaded.' : null" [actions]="rowActions" [selectable]="true" [bulkActions]="bulkActions" [(sort)]="sort" emptyIcon="clock" [emptyTitle]="rows().length ? 'No SLAs match your filters' : 'No SLAs yet'" emptyMessage="Try a different search or clear the filters." (action)="onAction($event)" (bulkAction)="onBulk($event)" (retry)="slas.reload()" />
      </section>
    </div>
    <amc-sla-action-host (done)="slas.reload()" />
  `,
})
export class SlaListPage {
  private readonly api = inject(SlaApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SlaReferenceStore);
  private readonly host = viewChild.required(SlaActionHost);

  readonly status = input<string>();
  readonly customer = input<string>();

  protected readonly slas = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.slas.hasValue() ? this.slas.value() : []));
  protected readonly columns = slaColumns();
  protected readonly trackById = (s: SlaListItem) => s.id;
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
    const cust = customers.length === 1 ? customers[0] : null;
    return [
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'type', label: 'SLA Type', type: 'multiselect', options: toOptions(SLA_TYPES) },
      { key: 'contract', label: 'Contract', type: 'multiselect', options: this.refs.contractOptions(cust) },
      { key: 'amc', label: 'AMC', type: 'multiselect', options: this.refs.amcOptions(cust) },
      { key: 'service', label: 'Service', type: 'multiselect', options: this.refs.serviceOptions() },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(SLA_STATUSES) },
      { key: 'priority', label: 'Priority', type: 'multiselect', options: toOptions(PRIORITIES) },
      { key: 'region', label: 'Service Region', type: 'multiselect', options: this.refs.regionOptions() },
      { key: 'effective', label: 'Effective Date', type: 'date-range' },
      { key: 'expiry', label: 'Expiry Date', type: 'date-range' },
    ];
  });
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const regions = filterList(f, 'region');
    const priorities = filterList(f, 'priority');
    const services = filterList(f, 'service');
    return this.rows().filter((s) => {
      const region = s.customer.customerId ? this.refs.customer(s.customer.customerId)?.region : null;
      const haystack = `${s.number} ${s.name} ${s.customerName ?? ''} ${s.contractNumber ?? ''} ${s.amcNumber ?? ''} ${s.serviceNames.join(' ')} ${s.scope.serviceCategories.join(' ')}`.toLowerCase();
      return (
        (!term || haystack.includes(term)) && (matchesAny(f, 'customer', s.customer.customerId) || (!s.customer.customerId && filterList(f, 'customer').length === 0)) && matchesAny(f, 'type', s.type) && matchesAny(f, 'contract', s.contract.contractId) && matchesAny(f, 'amc', s.contract.amcId) &&
        (!services.length || s.scope.serviceIds.some((x) => services.includes(x))) && matchesAny(f, 'status', s.effectiveStatus) && (!priorities.length || (s.scope.servicePriority !== null && priorities.includes(s.scope.servicePriority)) || !s.scope.servicePriority) &&
        (!regions.length || (region !== null && region !== undefined && regions.includes(region))) && withinRange(f, 'effective', s.validity.effectiveDate) && withinRange(f, 'expiry', s.validity.expiryDate)
      );
    });
  });
  protected readonly rowActions = (s: SlaListItem): MenuItem[] => [...slaActions(s, true), { id: 'export', label: 'Export', icon: 'download', dividerBefore: true }];
  protected readonly bulkActions: MenuItem[] = [{ id: 'export', label: 'Export', icon: 'download' }];

  protected onAction({ id, row }: RowAction<SlaListItem>): void {
    if (id === 'export') this.export([row]);
    else void this.host().run(id, row);
  }

  protected onBulk({ rows }: BulkAction<SlaListItem>): void {
    this.export(rows);
  }

  protected export(rows: readonly SlaListItem[] = this.filtered()): void {
    downloadCsv(timestampedName('slas', 'csv'), ['SLA Number', 'SLA Name', 'SLA Type', 'Customer', 'Contract', 'AMC', 'Service', 'Response Target (Medium)', 'Resolution Target (Medium)', 'Service Hours', 'Effective Date', 'Expiry Date', 'Version', 'Compliance %', 'Status'],
      rows.map((s) => [s.number, s.name, s.type, s.customerName, s.contractNumber, s.amcNumber, [...s.serviceNames, ...s.scope.serviceCategories].join('; '), formatMinutes(s.priorityTargets.Medium.response), formatMinutes(s.priorityTargets.Medium.resolution), s.calendarName, s.validity.effectiveDate, s.validity.expiryDate, s.version, s.compliance, s.effectiveStatus]));
    this.notify.success(`${rows.length} SLA${rows.length === 1 ? '' : 's'} exported.`);
  }
}
