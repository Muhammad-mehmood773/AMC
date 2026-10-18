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
import { RequestActionHost, requestActions } from '../components/request-action-host';
import { requestColumns } from '../components/sr-columns';
import { SrReferenceStore } from '../data/sr-reference.store';
import { RequestApi } from '../data/sr.api';
import { COVERAGE_RESULTS, HOLD_REASONS, PRIORITIES, REQUEST_SOURCES, REQUEST_STATUSES, type RequestListItem, REQUEST_TYPES } from '../models/request.model';

@Component({
  selector: 'amc-request-list-page',
  imports: [DataTable, FilterBar, Icon, PageHeader, RequestActionHost, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Service Requests" subtitle="All service demand — incidents, repairs, inspections, PM-generated and follow-up requests." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'List' }]">
        <button type="button" class="amc-btn-secondary" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <a routerLink="/app/service-requests/new" class="amc-btn-primary"><amc-icon name="plus" /> New Request</a>
      </amc-page-header>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search number, subject, description, customer, site, asset, serial, contact or reference…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="service-requests" [entity]="{ singular: 'request', plural: 'requests' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="requests.isLoading()" [error]="requests.error() ? 'Service requests could not be loaded.' : null" [actions]="rowActions" [selectable]="true" [bulkActions]="bulkActions" [(sort)]="sort" emptyIcon="ticket" [emptyTitle]="rows().length ? 'No requests match your filters' : 'No service requests yet'" emptyMessage="Try a different search or create a request." (action)="onAction($event)" (bulkAction)="onBulk($event)" (retry)="requests.reload()" />
      </section>
    </div>
    <amc-request-action-host (done)="requests.reload()" />
  `,
})
export class RequestListPage {
  private readonly api = inject(RequestApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SrReferenceStore);
  private readonly host = viewChild.required(RequestActionHost);

  readonly status = input<string>();
  readonly sla = input<string>();
  readonly hold = input<string>();
  readonly customer = input<string>();
  readonly asset = input<string>();

  protected readonly requests = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.requests.hasValue() ? this.requests.value() : []));
  protected readonly columns = requestColumns();
  protected readonly trackById = (r: RequestListItem) => r.id;
  protected readonly sort = signal<SortState | null>({ key: 'created', direction: 'desc' });
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = {};
    if (this.status()) seed['status'] = [this.status()!];
    if (this.sla()) seed['sla'] = [this.sla()!];
    if (this.hold()) seed['hold'] = [this.hold()!];
    if (this.customer()) seed['customer'] = [this.customer()!];
    if (this.asset()) seed['asset'] = [this.asset()!];
    return seed;
  });
  protected readonly filterFields = computed<FilterField[]>(() => {
    const cust = filterList(this.filters(), 'customer');
    const single = cust.length === 1 ? cust[0] : null;
    return [
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.siteOptions(single) },
      { key: 'asset', label: 'Asset', type: 'multiselect', options: this.refs.assetOptions(single, null, true) },
      { key: 'type', label: 'Request Type', type: 'multiselect', options: toOptions(REQUEST_TYPES) },
      { key: 'category', label: 'Service Category', type: 'multiselect', options: this.refs.categoryOptions() },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(REQUEST_STATUSES) },
      { key: 'priority', label: 'Priority', type: 'multiselect', options: toOptions(PRIORITIES) },
      { key: 'sla', label: 'SLA Status', type: 'multiselect', options: toOptions(['On Track', 'At Risk', 'Breached', 'Met', 'Paused', 'No SLA'] as const) },
      { key: 'coverage', label: 'Coverage', type: 'multiselect', options: toOptions(COVERAGE_RESULTS) },
      { key: 'agreement', label: 'Contract / AMC', type: 'multiselect', options: this.refs.agreementOptions() },
      { key: 'team', label: 'Team', type: 'multiselect', options: this.refs.teamOptions() },
      { key: 'technician', label: 'Technician', type: 'multiselect', options: this.refs.technicianOptions() },
      { key: 'channel', label: 'Channel', type: 'multiselect', options: toOptions(REQUEST_SOURCES) },
      { key: 'hold', label: 'Hold Reason', type: 'multiselect', options: toOptions(HOLD_REASONS) },
      { key: 'escalated', label: 'Escalated', type: 'multiselect', options: toOptions(['Yes', 'No'] as const) },
      { key: 'created', label: 'Request Date', type: 'date-range' },
      { key: 'due', label: 'Due Date', type: 'date-range' },
    ];
  });
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const escalated = filterList(f, 'escalated');
    return this.rows().filter((r) => {
      const asset = r.assetId ? this.refs.asset(r.assetId) : null;
      const haystack = `${r.number} ${r.subject} ${r.description} ${r.customerName} ${r.siteName} ${r.assetName ?? ''} ${asset?.serialNumber ?? ''} ${r.customer.contactName} ${r.customer.phone} ${r.customerReference} ${r.workOrders.map((w) => w.number).join(' ')}`.toLowerCase();
      return (
        (!term || haystack.includes(term)) && matchesAny(f, 'customer', r.customer.customerId) && matchesAny(f, 'site', r.location.siteId) && matchesAny(f, 'asset', r.assetId) &&
        matchesAny(f, 'type', r.type) && matchesAny(f, 'category', r.serviceCategory) && matchesAny(f, 'status', r.status) && matchesAny(f, 'priority', r.priority) &&
        matchesAny(f, 'sla', r.slaState) && matchesAny(f, 'coverage', r.coverage.result) &&
        (!filterList(f, 'agreement').length || filterList(f, 'agreement').includes(r.coverage.amcId ?? '') || filterList(f, 'agreement').includes(r.coverage.contractId ?? '')) &&
        matchesAny(f, 'team', r.assignment.team) && matchesAny(f, 'technician', r.assignment.technician) && matchesAny(f, 'channel', r.source) &&
        (!filterList(f, 'hold').length || (r.onHold !== null && filterList(f, 'hold').includes(r.onHold.reason))) &&
        (!escalated.length || escalated.includes(r.escalated ? 'Yes' : 'No')) &&
        withinRange(f, 'created', r.createdAt) && withinRange(f, 'due', r.dueAt)
      );
    });
  });
  protected readonly rowActions = (r: RequestListItem): MenuItem[] => [...requestActions(r), { id: 'export', label: 'Export', icon: 'download', dividerBefore: true }];
  protected readonly bulkActions: MenuItem[] = [{ id: 'export', label: 'Export', icon: 'download' }];

  protected onAction({ id, row }: RowAction<RequestListItem>): void {
    if (id === 'export') this.export([row]);
    else void this.host().run(id, row);
  }

  protected onBulk({ rows }: BulkAction<RequestListItem>): void {
    this.export(rows);
  }

  protected export(rows: readonly RequestListItem[] = this.filtered()): void {
    downloadCsv(timestampedName('service-requests', 'csv'), ['Number', 'Subject', 'Type', 'Request Date', 'Customer', 'Site', 'Asset', 'Category', 'Priority', 'Status', 'SLA', 'SLA Status', 'Coverage', 'Contract / AMC', 'Team', 'Technician', 'Due Date', 'Channel', 'Created By', 'Cost (SAR)'],
      rows.map((r) => [r.number, r.subject, r.type, r.createdAt, r.customerName, r.siteName, r.assetName, r.serviceCategory, r.priority, r.status, r.sla.slaNumber, r.slaState, r.coverage.result, r.amcNumber ?? r.contractNumber, r.assignment.team, r.assignment.technician, r.dueAt, r.source, r.createdBy, r.cost.total]));
    this.notify.success(`${rows.length} request${rows.length === 1 ? '' : 's'} exported.`);
  }
}
