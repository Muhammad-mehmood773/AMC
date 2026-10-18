import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { PageHeader } from '@shared/ui/page-header';
import { RequestActionHost, requestActions } from '../components/request-action-host';
import { SrReferenceStore } from '../data/sr-reference.store';
import { RequestApi } from '../data/sr.api';
import { STATUS_TONE, formatMinutes } from '../models/display';
import type { RequestListItem } from '../models/request.model';

/** SRS 9.16 — Resolution & Closure: open work, resolved items awaiting confirmation and closure checks. */
@Component({
  selector: 'amc-sr-resolution-page',
  imports: [DataTable, PageHeader, RequestActionHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Resolution & Closure" subtitle="Resolved requests awaiting customer confirmation or closure, with the closure checklist." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'Resolution & Closure' }]" />
      <section class="amc-card overflow-hidden">
        <amc-data-table tableId="sr-resolved" [entity]="{ singular: 'request', plural: 'requests' }" [totalCount]="rows().length" [rows]="queue()" [columns]="columns" [trackBy]="trackById" [actions]="actions" (action)="onAction($event)" [loading]="requests.isLoading()" emptyIcon="check-circle" emptyTitle="Nothing awaiting closure" emptyMessage="Resolved and open requests appear here with their closure checks." />
      </section>
    </div>
    <amc-request-action-host (done)="requests.reload()" />
  `,
})
export class ResolutionPage {
  private readonly api = inject(RequestApi);
  protected readonly refs = inject(SrReferenceStore);
  private readonly host = viewChild.required(RequestActionHost);

  protected readonly requests = rxResource({ stream: () => this.api.list() });
  private readonly rows = computed(() => (this.requests.hasValue() ? this.requests.value() : []));
  /** Resolved awaiting confirmation/closure first, then active work that still needs resolution. */
  protected readonly queue = computed(() => {
    const list = this.rows().filter((r) => ['Resolved', 'In Progress', 'Scheduled', 'Assigned', 'Reopened'].includes(r.status));
    const rank = (r: RequestListItem) => (r.status === 'Resolved' ? (r.coverage.requiresCustomerConfirmation || ['Critical', 'High'].includes(r.priority) ? 0 : 1) : 2);
    return list.sort((a, b) => rank(a) - rank(b));
  });
  protected readonly trackById = (r: RequestListItem) => r.id;
  protected readonly fm = formatMinutes;

  protected readonly columns: DataColumn<RequestListItem>[] = [
    { key: 'number', label: 'Request', value: (r) => r.number, secondary: (r) => r.subject, link: (r) => `/app/service-requests/${r.id}`, mobile: 'title', width: 210 },
    { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => STATUS_TONE[r.status], mobile: 'badge', width: 130 },
    { key: 'customer', label: 'Customer', value: (r) => r.customerName, width: 180 },
    { key: 'resolution', label: 'Resolution', value: (r) => r.resolution?.code ?? '—', secondary: (r) => (r.resolution ? r.resolution.category : null), width: 160 },
    { key: 'confirmation', label: 'Confirmation', value: (r) => (r.resolution?.confirmation ? (r.resolution.confirmation.confirmed ? 'Confirmed' : 'Not accepted') : r.coverage.requiresCustomerConfirmation ? 'Required' : 'Not required'), type: 'badge', tone: (r) => (r.resolution?.confirmation?.confirmed ? 'ok' : r.coverage.requiresCustomerConfirmation ? 'warn' : 'neutral'), width: 140 },
    { key: 'resolved', label: 'Resolved', value: (r) => r.resolution?.completedAt ?? '—', type: 'datetime', visibility: 'lg', width: 140 },
    { key: 'labour', label: 'Labour', value: (r) => (r.resolution ? formatMinutes(r.resolution.labourMinutes) : '—'), align: 'right', visibility: 'xl', width: 90 },
  ];
  protected readonly actions = (r: RequestListItem) => requestActions(r).filter((a) => ['view', 'resolve', 'confirm', 'close', 'reopen', 'complete-wo'].includes(a.id));

  protected onAction({ id, row }: RowAction<RequestListItem>): void {
    void this.host().run(id, row);
  }
}
