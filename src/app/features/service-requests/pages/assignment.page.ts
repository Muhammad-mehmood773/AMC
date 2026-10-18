import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NotificationPort } from '@core/notification/notification.port';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { StatusBadge } from '@shared/ui/status-badge';
import { formatMinutes } from '../models/display';
import { firstValueFrom } from 'rxjs';
import { RequestActionHost, requestActions } from '../components/request-action-host';
import { SrReferenceStore } from '../data/sr-reference.store';
import { RequestApi } from '../data/sr.api';
import { PRIORITY_TONE } from '../models/display';
import { ACTIVE_WORK_STATUSES, type RequestListItem } from '../models/request.model';

const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/** SRS 9.12 — Assignment & Routing: unassigned queue, team workload and technician capacity. */
@Component({
  selector: 'amc-sr-assignment-page',
  imports: [DataTable, Icon, PageHeader, Panel, RequestActionHost, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Assignment & Routing" subtitle="Route requests to the right team and technician — skill, territory and workload aware." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'Assignment' }]">
        <button type="button" class="amc-btn-primary" [disabled]="!unassigned().length || busy()" (click)="autoAssignAll()">@if (busy()) { <amc-icon name="refresh" class="animate-spin" /> } Auto-assign all</button>
      </amc-page-header>
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div class="amc-card overflow-hidden xl:col-span-2">
          <amc-data-table tableId="sr-unassigned" [entity]="{ singular: 'request', plural: 'requests' }" [totalCount]="rows().length" [rows]="unassigned()" [columns]="columns" [trackBy]="trackById" [actions]="actions" (action)="onAction($event)" [loading]="requests.isLoading()" emptyIcon="user-check" emptyTitle="Nothing to assign" emptyMessage="Every validated request already has a team or technician." />
        </div>
        <div class="space-y-5">
          <amc-panel title="Team Workload" description="Open requests per team." icon="users" [padded]="false">
            <ul class="divide-y divide-line">
              @for (t of teamLoad(); track t.team) {
                <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <p class="min-w-0 flex-1 truncate text-sm text-ink">{{ t.team }}</p>
                  <div class="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full bg-brand" [style.width.%]="t.share"></div></div>
                  <span class="w-8 text-right text-sm font-semibold tabular-nums text-ink">{{ t.count }}</span>
                </li>
              }
            </ul>
          </amc-panel>
          <amc-panel title="Technicians" description="Region, skills and open load." icon="user-check" [padded]="false">
            <ul class="divide-y divide-line">
              @for (t of techLoad(); track t.name) {
                <li class="px-4 py-2.5 sm:px-5">
                  <div class="flex items-center justify-between gap-2"><p class="truncate text-sm font-medium text-ink">{{ t.name }}</p><amc-status-badge [label]="t.open + ' open'" [tone]="t.open >= t.capacity ? 'danger' : t.open >= t.capacity - 1 ? 'warn' : 'ok'" /></div>
                  <p class="mt-0.5 truncate text-xs text-ink-muted">{{ t.team }} · {{ t.region }} · {{ t.skills.join(', ') }}</p>
                </li>
              }
            </ul>
          </amc-panel>
        </div>
      </div>
    </div>
    <amc-request-action-host (done)="requests.reload()" />
  `,
})
export class AssignmentPage {
  private readonly api = inject(RequestApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SrReferenceStore);
  private readonly host = viewChild.required(RequestActionHost);

  protected readonly requests = rxResource({ stream: () => this.api.list() });
  protected readonly busy = signal(false);
  protected readonly rows = computed(() => (this.requests.hasValue() ? this.requests.value() : []));
  protected readonly unassigned = computed(() => this.rows().filter((r) => ACTIVE_WORK_STATUSES.includes(r.status) && !r.assignment.technician).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]));
  protected readonly teamLoad = computed(() => {
    const open = this.rows().filter((r) => ACTIVE_WORK_STATUSES.includes(r.status));
    const max = Math.max(1, ...open.map((r) => open.filter((x) => x.assignment.team === r.assignment.team).length));
    return [...new Set(open.map((r) => r.assignment.team ?? 'Unassigned'))].map((team) => ({ team, count: open.filter((r) => (r.assignment.team ?? 'Unassigned') === team).length, share: 0 })).map((t) => ({ ...t, share: Math.round((t.count / max) * 100) })).sort((a, b) => b.count - a.count);
  });
  protected readonly techLoad = computed(() => {
    const open = this.rows().filter((r) => ACTIVE_WORK_STATUSES.includes(r.status));
    return this.refs.data().technicians.map((t) => ({ ...t, capacity: t.dailyCapacity * 2, open: open.filter((r) => r.assignment.technician === t.name).length }));
  });
  protected readonly trackById = (r: RequestListItem) => r.id;
  protected readonly priorityTone = PRIORITY_TONE;

  protected readonly columns: DataColumn<RequestListItem>[] = [
    { key: 'number', label: 'Request', value: (r) => r.number, secondary: (r) => r.subject, link: (r) => `/app/service-requests/${r.id}`, mobile: 'title', width: 210 },
    { key: 'priority', label: 'Priority', value: (r) => r.priority, type: 'badge', tone: (r) => PRIORITY_TONE[r.priority], mobile: 'badge', width: 95 },
    { key: 'customer', label: 'Customer / Site', value: (r) => r.customerName, secondary: (r) => r.siteName + ' · ' + r.region, width: 200 },
    { key: 'skill', label: 'Required Skill', value: (r) => r.classification.requiredSkill || '—', visibility: 'lg', width: 160 },
    { key: 'team', label: 'Team', value: (r) => r.assignment.team ?? '—', width: 140 },
    { key: 'age', label: 'Age', value: (r) => formatMinutes(r.ageHours * 60), width: 90 },
    { key: 'due', label: 'Resolution Due', value: (r) => r.resolutionClock.dueAt, type: 'datetime', visibility: 'xl', width: 140 },
  ];
  protected readonly actions = (r: RequestListItem) => requestActions(r).filter((a) => ['view', 'assign', 'autoassign', 'escalate'].includes(a.id));

  protected onAction({ id, row }: RowAction<RequestListItem>): void {
    void this.host().run(id, row);
  }

  protected async autoAssignAll(): Promise<void> {
    this.busy.set(true);
    let done = 0;
    for (const r of this.unassigned()) {
      try {
        await firstValueFrom(this.api.autoAssign(r.id));
        done++;
      } catch {
        /* routed team may have no free technician — left for manual assignment */
      }
    }
    this.busy.set(false);
    this.notify.success(done ? `${done} request${done === 1 ? '' : 's'} assigned.` : 'No requests could be auto-assigned.');
    this.requests.reload();
  }
}
