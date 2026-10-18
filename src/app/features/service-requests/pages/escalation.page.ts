import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { relativeTime } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { NotificationPort } from '@core/notification/notification.port';
import { RequestActionHost, requestActions } from '../components/request-action-host';
import { RequestApi } from '../data/sr.api';
import { ESCALATION_LEVELS, ESCALATION_TRIGGERS } from '../models/request.model';
import type { EscalationEvent, RequestListItem } from '../models/request.model';

interface EscRow extends EscalationEvent {
  readonly requestId: string;
  readonly number: string;
  readonly subject: string;
  readonly customer: string;
  readonly priority: string;
}

/** SRS 9.15 — Escalation: automatic triggers, escalation events and manual escalation. */
@Component({
  selector: 'amc-sr-escalation-page',
  imports: [DataTable, Icon, PageHeader, RequestActionHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Escalation" subtitle="Automatic triggers — SLA risk, breaches, unassigned criticals and excessive pending — plus manual escalations." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'Escalation' }]">
        <button type="button" class="amc-btn-secondary" (click)="runAutomation()"><amc-icon name="refresh" /> Run automation</button>
      </amc-page-header>
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div class="amc-card overflow-hidden xl:col-span-2">
          <amc-data-table tableId="sr-escalated" [entity]="{ singular: 'request', plural: 'requests' }" [rows]="escalated()" [columns]="columns" [trackBy]="trackById" [actions]="actions" (action)="onAction($event)" [loading]="requests.isLoading()" emptyIcon="check-circle" emptyTitle="No escalated requests" emptyMessage="Requests escalated by rule or manually appear here." />
        </div>
        <div class="space-y-5">
          <div class="amc-card overflow-hidden">
            <div class="border-b border-line px-4 py-3 sm:px-5"><h2 class="text-sm font-semibold text-ink">Escalation Events</h2></div>
            <amc-data-table tableId="sr-esc-events" [entity]="{ singular: 'event', plural: 'events' }" [rows]="events()" [columns]="eventColumns" [trackBy]="trackEvent" [compact]="true" [paginate]="false" emptyIcon="alert-triangle" emptyTitle="No events" emptyMessage="Escalation events appear here." />
          </div>
          <div class="amc-card p-4 sm:p-5">
            <h2 class="text-sm font-semibold text-ink">Automatic Triggers</h2>
            <ul class="mt-2 space-y-1.5 text-xs text-ink-muted">
              @for (t of triggers; track t) { <li class="flex gap-2"><amc-icon name="alert-triangle" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />{{ t }}</li> }
            </ul>
            <h2 class="mt-4 text-sm font-semibold text-ink">Escalation Levels</h2>
            <ol class="mt-2 list-decimal space-y-1 pl-5 text-xs text-ink-muted">@for (l of levels; track l) { <li>{{ l }}</li> }</ol>
          </div>
        </div>
      </div>
    </div>
    <amc-request-action-host (done)="requests.reload()" />
  `,
})
export class EscalationPage {
  private readonly api = inject(RequestApi);
  private readonly notify = inject(NotificationPort);
  private readonly host = viewChild.required(RequestActionHost);

  protected readonly requests = rxResource({ stream: () => this.api.list() });
  private readonly rows = computed(() => (this.requests.hasValue() ? this.requests.value() : []));
  protected readonly escalated = computed(() => this.rows().filter((r) => r.escalated));
  protected readonly events = computed<EscRow[]>(() => this.rows().flatMap((r) => r.escalation.events.map((e) => ({ ...e, requestId: r.id, number: r.number, subject: r.subject, customer: r.customerName, priority: r.priority }))).sort((a, b) => b.at.localeCompare(a.at)));
  protected readonly triggers = ESCALATION_TRIGGERS;
  protected readonly levels = ESCALATION_LEVELS;
  protected readonly trackById = (r: RequestListItem) => r.id;
  protected readonly trackEvent = (e: EscRow) => `${e.requestId}-${e.at}-${e.level}`;

  protected readonly columns: DataColumn<RequestListItem>[] = [
    { key: 'number', label: 'Request', value: (r) => r.number, secondary: (r) => r.subject, link: (r) => `/app/service-requests/${r.id}`, mobile: 'title', width: 210 },
    { key: 'level', label: 'Level', value: (r) => `Level ${r.escalation.level}`, type: 'badge', tone: (r) => (r.escalation.level >= 3 ? 'danger' : r.escalation.level === 2 ? 'warn' : 'info'), mobile: 'badge', width: 90 },
    { key: 'customer', label: 'Customer', value: (r) => r.customerName, secondary: (r) => r.siteName, width: 180 },
    { key: 'last', label: 'Last Escalation', value: (r) => (r.escalation.events.length ? relativeTime(r.escalation.events[r.escalation.events.length - 1].at) : '—'), secondary: (r) => (r.escalation.events.length ? r.escalation.events[r.escalation.events.length - 1].trigger : null), width: 180 },
    { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: () => 'neutral', width: 120 },
  ];
  protected readonly eventColumns: DataColumn<EscRow>[] = [
    { key: 'at', label: 'When', value: (e) => relativeTime(e.at), width: 110 },
    { key: 'request', label: 'Request', value: (e) => e.number, link: (e) => `/app/service-requests/${e.requestId}`, mobile: 'title', width: 130 },
    { key: 'trigger', label: 'Trigger', value: (e) => e.trigger, secondary: (e) => `L${e.level} · ${e.action}` },
  ];
  protected readonly actions = (r: RequestListItem) => requestActions(r).filter((a) => ['view', 'escalate', 'assign', 'note'].includes(a.id));

  protected onAction({ id, row }: RowAction<RequestListItem>): void {
    void this.host().run(id, row);
  }

  protected async runAutomation(): Promise<void> {
    const n = await firstValueFrom(this.api.runAutomation());
    this.notify.success(n ? `${n} automation action${n === 1 ? '' : 's'} performed.` : 'Nothing to escalate right now.');
    this.requests.reload();
  }
}
