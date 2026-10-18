import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { RequestActionHost, requestActions } from '../components/request-action-host';
import { RequestApi } from '../data/sr.api';
import { COVERAGE_TONE, STATUS_TONE } from '../models/display';
import type { RequestListItem } from '../models/request.model';

/** SRS 9.10 — Contract / AMC / entitlement validation queue and chargeable approvals. */
@Component({
  selector: 'amc-sr-coverage-page',
  imports: [DataTable, Icon, PageHeader, RequestActionHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Coverage Validation" subtitle="Warranty, contract, AMC and entitlement checks — non-covered work waits for customer approval." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'Coverage' }]">
        <button type="button" class="amc-btn-secondary" [disabled]="requests.isLoading()" (click)="requests.reload()"><amc-icon name="refresh" /> Re-check all</button>
      </amc-page-header>
      <section class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <amc-data-table tableId="sr-cov-pending" [entity]="{ singular: 'request', plural: 'requests' }" [rows]="pendingApproval()" [columns]="columns" [trackBy]="trackById" [actions]="actions" (action)="onAction($event)" [loading]="requests.isLoading()" emptyIcon="shield-check" emptyTitle="Nothing awaiting approval" emptyMessage="Chargeable requests appear here until the customer approves the quotation." [compact]="true" />
        <amc-data-table tableId="sr-cov-check" [entity]="{ singular: 'request', plural: 'requests' }" [rows]="pendingValidation()" [columns]="columns" [trackBy]="trackById" [actions]="actions" (action)="onAction($event)" emptyIcon="shield-check" emptyTitle="Nothing to validate" emptyMessage="Requests with coverage pending validation appear here." [compact]="true" />
        <amc-data-table tableId="sr-cov-not" [entity]="{ singular: 'request', plural: 'requests' }" [rows]="notCovered()" [columns]="columns" [trackBy]="trackById" [actions]="actions" (action)="onAction($event)" emptyIcon="shield-check" emptyTitle="No uncovered work" emptyMessage="Open requests without coverage appear here." [compact]="true" />
      </section>
    </div>
    <amc-request-action-host (done)="requests.reload()" />
  `,
})
export class SrCoveragePage {
  private readonly api = inject(RequestApi);
  protected readonly requests = rxResource({ stream: () => this.api.list() });
  private readonly rows = computed(() => (this.requests.hasValue() ? this.requests.value() : []));
  protected readonly pendingApproval = computed(() => this.rows().filter((r) => r.coverage.chargeable && r.coverage.approval === 'Pending'));
  protected readonly pendingValidation = computed(() => this.rows().filter((r) => r.coverage.result === 'Coverage Pending Validation'));
  protected readonly notCovered = computed(() => this.rows().filter((r) => ['Not Covered', 'Expired Coverage'].includes(r.coverage.result) && r.coverage.approval !== 'Rejected'));
  protected readonly trackById = (r: RequestListItem) => r.id;
  private readonly host = viewChild.required(RequestActionHost);

  protected readonly columns: DataColumn<RequestListItem>[] = [
    { key: 'number', label: 'Request', value: (r) => r.number, secondary: (r) => r.subject, link: (r) => `/app/service-requests/${r.id}`, mobile: 'title', width: 200 },
    { key: 'customer', label: 'Customer', value: (r) => r.customerName, secondary: (r) => r.amcNumber ?? r.contractNumber, width: 180 },
    { key: 'coverage', label: 'Coverage', value: (r) => r.coverage.result, type: 'badge', tone: (r) => COVERAGE_TONE[r.coverage.result], mobile: 'badge', width: 170 },
    { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => STATUS_TONE[r.status], width: 130 },
  ];
  protected readonly actions = (r: RequestListItem) => requestActions(r).filter((a) => ['view', 'coverage', 'validate', 'assign', 'reject', 'cancel'].includes(a.id));

  protected onAction({ id, row }: RowAction<RequestListItem>): void {
    void this.host().run(id, row);
  }
}
