import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { toOptions } from '@shared/models/select-option';
import { type DataColumn, DataTable } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { PageHeader } from '@shared/ui/page-header';
import { type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { RequestApi } from '../data/sr.api';
import { ACTIVITY_TYPES, type Activity } from '../models/request.model';

interface ActivityRow extends Activity {
  readonly requestId: string;
  readonly number: string;
  readonly subject: string;
  readonly customer: string;
}

/** SRS 9.14 — Communication & Activity: every call, message and note across open requests. */
@Component({
  selector: 'amc-sr-communication-page',
  imports: [DataTable, FilterBar, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Communication & Activity" subtitle="Calls, emails, portal messages and notes across all service requests." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'Communication' }]" />
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search message, user or request…" [(search)]="search" [fields]="filterFields" [(filters)]="filters" /></div>
        <amc-data-table tableId="sr-comm" [entity]="{ singular: 'activity', plural: 'activities' }" [totalCount]="total()" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="requests.isLoading()" emptyIcon="inbox" emptyTitle="No activity" emptyMessage="Communication on service requests appears here." />
      </section>
    </div>
  `,
})
export class CommunicationPage {
  private readonly api = inject(RequestApi);

  protected readonly requests = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.requests.hasValue() ? this.requests.value() : []));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = [
    { key: 'type', label: 'Type', type: 'multiselect' as const, options: toOptions(ACTIVITY_TYPES) },
    { key: 'direction', label: 'Direction', type: 'multiselect' as const, options: toOptions(['Inbound', 'Outbound', 'Internal'] as const) },
    { key: 'visibility', label: 'Visibility', type: 'multiselect' as const, options: toOptions(['Customer Visible', 'Internal Only'] as const) },
    { key: 'at', label: 'Date', type: 'date-range' as const },
  ];
  protected readonly flat = computed<ActivityRow[]>(() => this.rows().flatMap((r) => r.activities.map((a) => ({ ...a, requestId: r.id, number: r.number, subject: r.subject, customer: r.customerName }))));
  protected readonly total = computed(() => this.flat().length);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.flat()
      .filter((a) => {
        const haystack = `${a.message} ${a.user} ${a.number} ${a.subject}`.toLowerCase();
        return (!term || haystack.includes(term)) && matchesAny(f, 'type', a.type) && matchesAny(f, 'direction', a.direction) && matchesAny(f, 'visibility', a.visibility) && withinRange(f, 'at', a.at);
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  });
  protected readonly trackById = (a: ActivityRow) => a.id;

  protected readonly columns: DataColumn<ActivityRow>[] = [
    { key: 'at', label: 'When', value: (a) => a.at, type: 'datetime', sortable: true, width: 150 },
    { key: 'request', label: 'Request', value: (a) => a.number, secondary: (a) => a.subject, link: (a) => `/app/service-requests/${a.requestId}`, mobile: 'title', width: 220 },
    { key: 'type', label: 'Type', value: (a) => a.type, type: 'badge', tone: (a) => (a.direction === 'Inbound' ? 'info' : a.direction === 'Outbound' ? 'brand' : 'neutral'), mobile: 'badge', width: 140 },
    { key: 'message', label: 'Message', value: (a) => a.message },
    { key: 'by', label: 'By', value: (a) => a.user, visibility: 'lg', width: 140 },
    { key: 'visibility', label: 'Visibility', value: (a) => a.visibility, visibility: 'xl', width: 130 },
    { key: 'followup', label: 'Follow-up', value: (a) => a.followUp ?? '—', visibility: '2xl', width: 110 },
  ];
}
