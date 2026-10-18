import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { toOptions } from '@shared/models/select-option';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { FilterBar } from '@shared/ui/filter-bar';
import { PageHeader } from '@shared/ui/page-header';
import { type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { formatDate } from '@shared/utils/format';
import { RequestActionHost, requestActions } from '../components/request-action-host';
import { RequestApi } from '../data/sr.api';
import { PRIORITY_TONE, formatMinutes } from '../models/display';
import { APPOINTMENT_TYPES, type RequestListItem } from '../models/request.model';

/** SRS 9.13 — Scheduling: appointments, visit windows and technician day loads. */
@Component({
  selector: 'amc-sr-scheduling-page',
  imports: [DataTable, FilterBar, PageHeader, RequestActionHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Scheduling" subtitle="Service appointments and visit windows — reschedule keeps the original target in history." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'Scheduling' }]" />
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search number, subject, customer or technician…" [(search)]="search" [fields]="filterFields" [(filters)]="filters" /></div>
        <amc-data-table tableId="sr-schedule" [entity]="{ singular: 'appointment', plural: 'appointments' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [actions]="actions" (action)="onAction($event)" [loading]="requests.isLoading()" emptyIcon="calendar-check" emptyTitle="Nothing scheduled" emptyMessage="Scheduled visits appear here." />
      </section>
      <section class="amc-card p-4 sm:p-5">
        <h2 class="text-sm font-semibold text-ink">Technician day load (scheduled visits)</h2>
        <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          @for (t of dayLoad(); track t.name) {
            <div class="rounded-xl border border-line p-3">
              <p class="truncate text-sm font-medium text-ink">{{ t.name }}</p>
              <p class="mt-1 text-xs text-ink-muted">{{ t.count }} visit{{ t.count === 1 ? '' : 's' }} · {{ fm(t.minutes) }}</p>
            </div>
          }
        </div>
      </section>
    </div>
    <amc-request-action-host (done)="requests.reload()" />
  `,
})
export class SchedulingPage {
  private readonly api = inject(RequestApi);
  private readonly host = viewChild.required(RequestActionHost);

  protected readonly requests = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.requests.hasValue() ? this.requests.value().filter((r) => r.schedule) : []));
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = [
    { key: 'type', label: 'Appointment Type', type: 'multiselect' as const, options: toOptions(APPOINTMENT_TYPES) },
    { key: 'date', label: 'Scheduled Date', type: 'date-range' as const },
    { key: 'priority', label: 'Priority', type: 'multiselect' as const, options: toOptions(['Critical', 'High', 'Medium', 'Low'] as const) },
  ];
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((r) => {
      const haystack = `${r.number} ${r.subject} ${r.customerName} ${r.assignment.technician ?? ''}`.toLowerCase();
      return (!term || haystack.includes(term)) && matchesAny(f, 'type', r.schedule!.appointmentType) && withinRange(f, 'date', r.schedule!.scheduledDate) && matchesAny(f, 'priority', r.priority);
    });
  });
  protected readonly dayLoad = computed(() => {
    const map = new Map<string, { count: number; minutes: number }>();
    for (const r of this.filtered()) {
      const tech = r.assignment.technician ?? 'Unassigned';
      const e = map.get(tech) ?? { count: 0, minutes: 0 };
      map.set(tech, { count: e.count + 1, minutes: e.minutes + (r.schedule?.durationMinutes ?? 0) });
    }
    return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
  });
  protected readonly trackById = (r: RequestListItem) => r.id;
  protected readonly fm = formatMinutes;
  protected readonly formatDate = formatDate;

  protected readonly columns: DataColumn<RequestListItem>[] = [
    { key: 'number', label: 'Request', value: (r) => r.number, secondary: (r) => r.subject, link: (r) => `/app/service-requests/${r.id}`, mobile: 'title', width: 200 },
    { key: 'date', label: 'Date', value: (r) => r.schedule!.scheduledDate, type: 'date', sortable: true, mobile: 'meta', width: 115 },
    { key: 'time', label: 'Window', value: (r) => `${r.schedule!.startTime}–${r.schedule!.endTime}`, secondary: (r) => formatMinutes(r.schedule!.durationMinutes), width: 120 },
    { key: 'type', label: 'Type', value: (r) => r.schedule!.appointmentType, width: 140 },
    { key: 'customer', label: 'Customer / Site', value: (r) => r.customerName, secondary: (r) => r.siteName, width: 190 },
    { key: 'technician', label: 'Technician', value: (r) => r.assignment.technician ?? '—', width: 150 },
    { key: 'availability', label: 'Availability', value: (r) => r.schedule!.customerAvailability || '—', visibility: 'xl', width: 130 },
    { key: 'priority', label: 'Priority', value: (r) => r.priority, type: 'badge', tone: (r) => PRIORITY_TONE[r.priority], mobile: 'badge', width: 95 },
    { key: 'reschedules', label: 'Reschedules', value: (r) => r.scheduleHistory.length, align: 'right', visibility: 'xl', width: 100 },
  ];
  protected readonly actions = (r: RequestListItem) => requestActions(r).filter((a) => ['view', 'schedule', 'assign', 'start'].includes(a.id));

  protected onAction({ id, row }: RowAction<RequestListItem>): void {
    void this.host().run(id, row);
  }
}
