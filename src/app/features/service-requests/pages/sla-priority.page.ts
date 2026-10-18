import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { toOptions } from '@shared/models/select-option';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { PageHeader } from '@shared/ui/page-header';
import { type FilterValues, filterList, matchesAny } from '@shared/utils/filters';
import { RequestActionHost, requestActions } from '../components/request-action-host';
import { SrReferenceStore } from '../data/sr-reference.store';
import { RequestApi } from '../data/sr.api';
import { PRIORITY_TONE, SLA_TONE, formatMinutes } from '../models/display';
import { OPEN_STATUSES, PRIORITIES, type RequestListItem } from '../models/request.model';

/** SRS 9.11 — SLA & Priority: live clocks against the applied SLA with priority reasoning. */
@Component({
  selector: 'amc-sr-sla-page',
  imports: [DataTable, FilterBar, PageHeader, RequestActionHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="SLA & Priority" subtitle="Which SLA applies, its targets and live response / resolution clocks." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'SLA & Priority' }]" />
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search number, subject or customer…" [(search)]="search" [fields]="filterFields" [(filters)]="filters" /></div>
        <amc-data-table tableId="sr-sla" [entity]="{ singular: 'request', plural: 'requests' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [actions]="actions" (action)="onAction($event)" [loading]="requests.isLoading()" emptyIcon="clock" emptyTitle="No requests under SLA" emptyMessage="Open requests with an applicable SLA appear here." />
      </section>
    </div>
    <amc-request-action-host (done)="requests.reload()" />
  `,
})
export class SlaPriorityPage {
  private readonly api = inject(RequestApi);
  protected readonly refs = inject(SrReferenceStore);
  private readonly host = viewChild.required(RequestActionHost);

  protected readonly requests = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.requests.hasValue() ? this.requests.value() : []));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = [
    { key: 'sla', label: 'SLA', type: 'multiselect' as const, options: this.refs.slaOptions() },
    { key: 'state', label: 'SLA Status', type: 'multiselect' as const, options: toOptions(['On Track', 'At Risk', 'Breached', 'Met', 'Paused', 'No SLA'] as const) },
    { key: 'priority', label: 'Priority', type: 'multiselect' as const, options: toOptions(PRIORITIES) },
  ];
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const states = filterList(f, 'state');
    return this.rows().filter((r) => {
      const open = OPEN_STATUSES.includes(r.status) || r.slaState === 'Met';
      const haystack = `${r.number} ${r.subject} ${r.customerName}`.toLowerCase();
      return open && (!term || haystack.includes(term)) && (!filterList(f, 'sla').length || filterList(f, 'sla').includes(r.sla.slaId ?? '')) && (!states.length || states.includes(r.slaState)) && matchesAny(f, 'priority', r.priority);
    });
  });
  protected readonly trackById = (r: RequestListItem) => r.id;

  protected readonly columns: DataColumn<RequestListItem>[] = [
    { key: 'number', label: 'Request', value: (r) => r.number, secondary: (r) => r.subject, link: (r) => `/app/service-requests/${r.id}`, mobile: 'title', width: 210 },
    { key: 'priority', label: 'Priority', value: (r) => r.priority, type: 'badge', tone: (r) => PRIORITY_TONE[r.priority], secondary: (r) => r.priorityReason, mobile: 'badge', width: 110 },
    { key: 'sla', label: 'SLA', value: (r) => r.sla.slaNumber ?? '—', secondary: (r) => r.sla.applicability, link: (r) => (r.sla.slaId ? `/app/sla/${r.sla.slaId}` : null), width: 170 },
    { key: 'response', label: 'Response', value: (r) => (r.response.remainingMinutes === null ? r.response.state : `${formatMinutes(Math.abs(r.response.remainingMinutes))} ${r.response.remainingMinutes < 0 ? 'over' : 'left'}`), secondary: (r) => (r.response.targetMinutes !== null ? `target ${formatMinutes(r.response.targetMinutes)}` : null), width: 140 },
    { key: 'resolution', label: 'Resolution', value: (r) => (r.resolutionClock.remainingMinutes === null ? r.resolutionClock.state : `${formatMinutes(Math.abs(r.resolutionClock.remainingMinutes))} ${r.resolutionClock.remainingMinutes < 0 ? 'over' : 'left'}`), secondary: (r) => (r.resolutionClock.targetMinutes !== null ? `target ${formatMinutes(r.resolutionClock.targetMinutes)}` : null), width: 140 },
    { key: 'consumption', label: 'Consumed', value: (r) => `${r.resolutionClock.consumption}%`, align: 'right', width: 100 },
    { key: 'state', label: 'SLA Status', value: (r) => r.slaState, type: 'badge', tone: (r) => SLA_TONE[r.slaState], width: 105 },
  ];
  protected readonly actions = (r: RequestListItem) => requestActions(r).filter((a) => ['view', 'priority', 'sla', 'escalate', 'assign'].includes(a.id));

  protected onAction({ id, row }: RowAction<RequestListItem>): void {
    void this.host().run(id, row);
  }
}
