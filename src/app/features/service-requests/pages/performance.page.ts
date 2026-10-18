import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { NotificationPort } from '@core/notification/notification.port';
import { RequestApi } from '../data/sr.api';
import { formatMinutes } from '../models/display';
import type { CountRow } from '../models/operations.model';

/** SRS 9.27 — Request Performance: volume, aging, SLA compliance, first-time resolution and breakdowns. */
@Component({
  selector: 'amc-sr-performance-page',
  imports: [Icon, KpiCard, PageHeader, Panel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Request Performance" subtitle="Volume, aging, response and resolution times, SLA compliance and resolution quality." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'Performance' }]">
        <button type="button" class="amc-btn-secondary" [disabled]="!perf()" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
      </amc-page-header>
      @if (perf(); as p) {
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Performance metrics">
          <amc-kpi-card label="Request Volume" icon="ticket" tone="brand" [value]="p.volume" [hint]="p.newRequests + ' new in period'" />
          <amc-kpi-card label="Open Requests" icon="activity" tone="info" [value]="p.open" />
          <amc-kpi-card label="Average Age" icon="clock" [value]="p.avgAgeHours === null ? '—' : fm(p.avgAgeHours * 60)" />
          <amc-kpi-card label="Avg Response Time" icon="clock" [value]="fm(p.avgResponseMinutes)" />
          <amc-kpi-card label="Avg Resolution Time" icon="clock" [value]="fm(p.avgResolutionMinutes)" />
          <amc-kpi-card label="Avg Assignment Time" icon="user-check" [value]="fm(p.avgAssignmentMinutes)" />
          <amc-kpi-card label="Avg Pending Time" icon="pause" [value]="p.avgPendingHours === null ? '—' : fm(p.avgPendingHours * 60)" />
          <amc-kpi-card label="Schedule Delay" icon="calendar-check" [value]="p.scheduleDelayDays === null ? '—' : p.scheduleDelayDays + 'd'" hint="Scheduled date vs requested date" />
          <amc-kpi-card label="Response Compliance" icon="check-circle" [tone]="tone(p.responseCompliance)" [value]="pct(p.responseCompliance)" />
          <amc-kpi-card label="Resolution Compliance" icon="check-circle" [tone]="tone(p.resolutionCompliance)" [value]="pct(p.resolutionCompliance)" />
          <amc-kpi-card label="SLA Breach Rate" icon="alert-circle" [tone]="(p.breachRate ?? 0) > 10 ? 'danger' : 'ok'" [value]="pct(p.breachRate)" />
          <amc-kpi-card label="First-Time Resolution" icon="check-circle" [tone]="tone(p.firstTimeResolution)" [value]="pct(p.firstTimeResolution)" />
          <amc-kpi-card label="Reopen Rate" icon="rotate-ccw" [tone]="(p.reopenRate ?? 0) > 10 ? 'warn' : 'ok'" [value]="pct(p.reopenRate)" />
          <amc-kpi-card label="Cancellation Rate" icon="ban" [value]="pct(p.cancellationRate)" />
          <amc-kpi-card label="Escalation Rate" icon="alert-triangle" [tone]="(p.escalationRate ?? 0) > 15 ? 'warn' : 'ok'" [value]="pct(p.escalationRate)" />
          <amc-kpi-card label="Confirmation Rate" icon="pen-tool" [value]="pct(p.confirmationRate)" hint="Customer confirmations received" />
        </section>
        <section class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          @for (w of widgets(); track w.title) {
            <amc-panel [title]="w.title" [icon]="w.icon" [padded]="false">
              @if (!w.rows.length) { <p class="p-4 text-sm text-ink-muted sm:px-5">No data.</p> } @else {
                <ul class="divide-y divide-line">
                  @for (r of w.rows; track r.key) {
                    <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <p class="min-w-0 flex-1 truncate text-sm text-ink">{{ r.label }}</p>
                      <div class="h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full bg-brand" [style.width.%]="w.share(r)"></div></div>
                      <span class="w-10 text-right text-sm font-semibold tabular-nums text-ink">{{ r.value }}</span>
                    </li>
                  }
                </ul>
              }
            </amc-panel>
          }
        </section>
      } @else {
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">@for (i of [1, 2, 3, 4, 5, 6, 7, 8]; track i) { <div class="amc-card h-24 animate-pulse"></div> }</div>
      }
    </div>
  `,
})
export class SrPerformancePage {
  private readonly api = inject(RequestApi);
  private readonly notify = inject(NotificationPort);
  protected readonly res = rxResource({ stream: () => this.api.performance() });
  protected readonly perf = computed(() => (this.res.hasValue() ? this.res.value() : null));
  protected readonly fm = formatMinutes;
  protected readonly widgets = computed(() => {
    const p = this.perf();
    const share = (rows: readonly CountRow[]) => {
      const max = Math.max(1, ...rows.map((r) => r.value));
      return (r: CountRow) => Math.round((r.value / max) * 100);
    };
    return [
      { title: 'Volume by Customer', icon: 'building' as const, rows: p?.byCustomer ?? [], share: share(p?.byCustomer ?? []) },
      { title: 'Volume by Category', icon: 'list' as const, rows: p?.byCategory ?? [], share: share(p?.byCategory ?? []) },
      { title: 'Volume by Technician', icon: 'users' as const, rows: p?.byTechnician ?? [], share: share(p?.byTechnician ?? []) },
      { title: 'Volume by Asset', icon: 'box' as const, rows: p?.byAsset ?? [], share: share(p?.byAsset ?? []) },
      { title: 'Volume by Contract / AMC', icon: 'layers' as const, rows: p?.byAgreement ?? [], share: share(p?.byAgreement ?? []) },
      { title: 'Root Causes', icon: 'alert-circle' as const, rows: p?.byRootCause ?? [], share: share(p?.byRootCause ?? []) },
    ];
  });

  protected pct(v: number | null): string {
    return v === null ? '—' : `${v}%`;
  }

  protected tone(v: number | null): 'ok' | 'warn' | 'danger' | 'neutral' {
    return v === null ? 'neutral' : v >= 90 ? 'ok' : v >= 75 ? 'warn' : 'danger';
  }

  protected export(): void {
    const p = this.perf();
    if (!p) return;
    downloadCsv(timestampedName('sr-performance', 'csv'), ['Metric', 'Value'], [
      ['Volume', p.volume], ['New', p.newRequests], ['Open', p.open], ['Avg Age (h)', p.avgAgeHours], ['Avg Response (min)', p.avgResponseMinutes], ['Avg Resolution (min)', p.avgResolutionMinutes],
      ['Response Compliance %', p.responseCompliance], ['Resolution Compliance %', p.resolutionCompliance], ['Breach Rate %', p.breachRate], ['First-Time Resolution %', p.firstTimeResolution],
      ['Reopen Rate %', p.reopenRate], ['Cancellation Rate %', p.cancellationRate], ['Escalation Rate %', p.escalationRate], ['Avg Pending (h)', p.avgPendingHours], ['Avg Assignment (min)', p.avgAssignmentMinutes],
      ['Schedule Delay (d)', p.scheduleDelayDays], ['Confirmation Rate %', p.confirmationRate],
    ]);
    this.notify.success('Performance metrics exported.');
  }
}
