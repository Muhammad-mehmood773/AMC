import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { formatDateTime } from '@shared/utils/format';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { SelectionResult } from '../components/selection-result';
import { clockColumns } from '../components/sla-columns';
import { SlaReferenceStore } from '../data/sla-reference.store';
import { SlaClockApi, SlaMappingApi } from '../data/sla.api';
import { formatMinutes } from '../models/display';
import { CLOCK_STATUSES, PAUSE_REASONS, type PauseReason, type SlaClockListItem, type SlaSelection } from '../models/operations.model';
import { PRIORITIES, type Priority } from '../models/sla.model';

type Mode = 'pause' | 'resume' | 'reassign' | 'note' | 'history' | 'start';

/** SRS 7.13 — real-time monitoring of active SLA commitments (refreshes every 30 s). */
@Component({
  selector: 'amc-monitoring-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, KpiCard, PageHeader, Select, SelectionResult, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="SLA Monitoring" subtitle="Live SLA clocks — elapsed, remaining, consumption and breach risk. Approved pauses are excluded." [breadcrumbs]="[{ label: 'SLA Management', path: '/app/sla/dashboard' }, { label: 'Monitoring' }]">
        <button type="button" class="amc-btn-ghost" (click)="clocks.reload()"><amc-icon name="refresh" [class.animate-spin]="clocks.isLoading()" /> <span class="hidden sm:inline">Refresh</span></button>
        <button type="button" class="amc-btn-primary" (click)="open('start', null)"><amc-icon name="play" /> Start SLA Clock</button>
      </amc-page-header>
      <section class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        @for (k of kpis(); track k.label) { <amc-kpi-card [label]="k.label" [icon]="k.icon" [tone]="k.tone" [value]="k.value" /> }
      </section>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search request, work order, customer, site, asset or SLA…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="sla-monitoring" [entity]="{ singular: 'clock', plural: 'clocks' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="clocks.isLoading() && !rows().length" [actions]="rowActions" [initialPageSize]="25" emptyIcon="clock" emptyTitle="No clocks match" emptyMessage="Try different filters." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog [size]="mode() === 'start' || mode() === 'history' ? 'lg' : 'sm'" [title]="title()" [description]="target() ? target()!.transactionNumber + ' · ' + target()!.targetType + ' · ' + target()!.slaNumber : ''" [open]="!!mode()" (openChange)="!$event && mode.set(null)">
      @switch (mode()) {
        @case ('pause') {
          <div class="space-y-4">
            <amc-form-field label="Pause Reason" for="mn-reason"><amc-select inputId="mn-reason" [options]="pauseOptions" [(value)]="reason" /></amc-form-field>
            <amc-form-field label="Supporting Notes" for="mn-notes"><textarea id="mn-notes" class="amc-textarea min-h-16" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
            <p class="text-xs text-ink-muted">Approved pause periods are excluded from SLA consumption. Requester, approver and timestamps are audited.</p>
          </div>
        }
        @case ('resume') { <amc-form-field label="Resume Reason" for="mn-resume"><input id="mn-resume" class="amc-input" [value]="text()" (input)="text.set($any($event.target).value)" /></amc-form-field> }
        @case ('reassign') {
          <div class="space-y-4">
            <amc-form-field label="Service Team" for="mn-team"><amc-select inputId="mn-team" [options]="refs.teamOptions()" [(value)]="team" /></amc-form-field>
            <amc-form-field label="Technician" for="mn-tech"><amc-select inputId="mn-tech" [options]="refs.technicianOptions()" [(value)]="technician" [clearable]="true" /></amc-form-field>
          </div>
        }
        @case ('note') { <amc-form-field label="Note" for="mn-note"><textarea id="mn-note" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field> }
        @case ('history') {
          @if (target(); as c) {
            <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt class="text-xs text-ink-muted">Start</dt><dd>{{ fdt(c.startedAt) }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Due</dt><dd>{{ fdt(c.dueAt) }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Stop</dt><dd>{{ c.stoppedAt ? fdt(c.stoppedAt) : '—' }}</dd></div>
              <div><dt class="text-xs text-ink-muted">Elapsed / Target</dt><dd>{{ fm(c.elapsedMinutes) }} / {{ fm(c.targetMinutes) }}</dd></div>
              <div class="col-span-2 sm:col-span-4"><dt class="text-xs text-ink-muted">SLA selection</dt><dd class="text-ink-muted">{{ c.selection }} (v{{ c.slaVersion }})</dd></div>
              <div class="col-span-2 sm:col-span-4"><dt class="text-xs text-ink-muted">Events</dt><dd class="text-ink-muted">{{ c.startEvent }} → {{ c.stopEvent }}</dd></div>
            </dl>
            <p class="amc-overline mt-4">Pause / resume</p>
            <ul class="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
              @for (p of c.pauses; track p.id) { <li class="px-3 py-2"><span class="font-medium">{{ p.reason }}</span> <span class="text-ink-muted">· {{ fdt(p.startedAt) }} → {{ p.endedAt ? fdt(p.endedAt) : 'paused now' }} · requested {{ p.requestedBy }}, approved {{ p.approvedBy }}{{ p.resumeReason ? ' · ' + p.resumeReason : '' }}</span></li> } @empty { <li class="px-3 py-3 text-ink-muted">No pauses.</li> }
            </ul>
            <p class="amc-overline mt-4">Notes</p>
            <ul class="mt-2 space-y-1 text-sm">@for (n of c.notes; track n.at) { <li><span class="text-ink-muted">{{ fdt(n.at) }} · {{ n.by }}:</span> {{ n.text }}</li> } @empty { <li class="text-ink-muted">No notes.</li> }</ul>
          }
        }
        @case ('start') {
          <p class="mb-3 text-sm text-ink-muted">Simulates a new service request or work order: SLA applicability is validated, the most specific SLA is selected and recorded, and the response and resolution clocks start.</p>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <amc-form-field label="Transaction" for="st-type"><amc-select inputId="st-type" [options]="txOptions" [(value)]="txType" /></amc-form-field>
            <amc-form-field label="Customer" for="st-cust" class="sm:col-span-2"><amc-select inputId="st-cust" [options]="refs.customerOptions()" [(value)]="qCustomer" /></amc-form-field>
            <amc-form-field label="AMC" for="st-amc"><amc-select inputId="st-amc" [options]="refs.amcOptions(cust())" [(value)]="qAmc" [clearable]="true" /></amc-form-field>
            <amc-form-field label="Site" for="st-site"><amc-select inputId="st-site" [options]="refs.siteOptions(cust())" [(value)]="qSite" /></amc-form-field>
            <amc-form-field label="Asset" for="st-asset"><amc-select inputId="st-asset" [options]="refs.assetOptions(cust(), qSite() ? qSite()!.toString() : null)" [(value)]="qAsset" [clearable]="true" /></amc-form-field>
            <amc-form-field label="Service" for="st-svc"><amc-select inputId="st-svc" [options]="refs.serviceOptions()" [(value)]="qService" [clearable]="true" /></amc-form-field>
            <amc-form-field label="Priority" for="st-prio"><amc-select inputId="st-prio" [options]="priorityOptions" [(value)]="qPriority" /></amc-form-field>
            <amc-form-field label="Subject" for="st-subj"><input id="st-subj" class="amc-input" [value]="text()" (input)="text.set($any($event.target).value)" /></amc-form-field>
          </div>
          @if (preview(); as s) { <amc-selection-result class="mt-4" [selection]="s" /> }
        }
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="mode.set(null)">Close</button>
        @if (mode() === 'start') { <button type="button" class="amc-btn-secondary" [disabled]="busy() || !canStart()" (click)="validate()">Validate</button> }
        @if (mode() !== 'history') { <button type="button" class="amc-btn-primary" [disabled]="busy() || !valid()" (click)="confirm()">@if (busy()) { <amc-spinner [size]="14" /> } {{ confirmLabel() }}</button> }
      </ng-container>
    </amc-dialog>
  `,
})
export class MonitoringPage {
  private readonly api = inject(SlaClockApi);
  private readonly mappingApi = inject(SlaMappingApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SlaReferenceStore);

  readonly slaId = input<string>();
  readonly status = input<string>();

  private readonly tickKey = signal(0);
  protected readonly clocks = rxResource({ params: () => this.tickKey(), stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.clocks.hasValue() ? this.clocks.value() : []));
  protected readonly columns = clockColumns();
  protected readonly trackById = (c: SlaClockListItem) => c.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = { status: this.status() ? [this.status()!] : ['Running', 'Paused', 'Warning', 'Critical', 'Breached'], open: ['open'] };
    if (this.slaId()) seed['sla'] = [this.slaId()!];
    return seed;
  });
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'open', label: 'Clock', type: 'select', options: [{ value: 'open', label: 'Open clocks only' }] },
    { key: 'status', label: 'Monitoring Status', type: 'multiselect', options: toOptions(CLOCK_STATUSES) },
    { key: 'sla', label: 'SLA', type: 'multiselect', options: this.refs.slaOptions() },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: this.priorityOptions },
    { key: 'kind', label: 'Transaction', type: 'multiselect', options: this.txOptions },
    { key: 'risk', label: 'Breach Risk', type: 'multiselect', options: toOptions(['Low', 'Medium', 'High', 'Breached'] as const) },
    { key: 'team', label: 'Service Team', type: 'multiselect', options: this.refs.teamOptions() },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const openOnly = !!f['open'] && (Array.isArray(f['open']) ? f['open'].length > 0 : true);
    return this.rows().filter(
      (c) =>
        (!openOnly || (!c.stoppedAt && c.status !== 'Cancelled')) &&
        (!term || `${c.transactionNumber} ${c.subject} ${c.customerName} ${c.siteName} ${c.assetName ?? ''} ${c.slaNumber}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'status', c.monitoringStatus) && matchesAny(f, 'sla', c.slaId) && matchesAny(f, 'customer', c.customerId) && matchesAny(f, 'priority', c.priority) && matchesAny(f, 'kind', c.transactionType) && matchesAny(f, 'risk', c.breachRisk) && matchesAny(f, 'team', c.team),
    );
  });
  protected readonly kpis = computed(() => {
    const open = this.rows().filter((c) => !c.stoppedAt && c.status !== 'Cancelled');
    const n = (s: string) => open.filter((c) => c.monitoringStatus === s).length;
    return [
      { label: 'Running', icon: 'play' as const, tone: 'info' as const, value: n('Running') },
      { label: 'Warning', icon: 'alert-triangle' as const, tone: 'warn' as const, value: n('Warning') },
      { label: 'Critical', icon: 'alert-triangle' as const, tone: 'danger' as const, value: n('Critical') },
      { label: 'Breached (open)', icon: 'alert-circle' as const, tone: 'danger' as const, value: n('Breached') },
      { label: 'Paused', icon: 'pause' as const, tone: 'accent' as const, value: n('Paused') },
      { label: 'Met', icon: 'check-circle' as const, tone: 'ok' as const, value: this.rows().filter((c) => c.monitoringStatus === 'Met').length },
      { label: 'Breached (closed)', icon: 'x' as const, tone: 'neutral' as const, value: this.rows().filter((c) => c.stoppedAt && c.monitoringStatus === 'Breached').length },
    ];
  });
  protected readonly rowActions = (c: SlaClockListItem): MenuItem[] => {
    const open = !c.stoppedAt && c.status !== 'Cancelled';
    return [
      { id: 'history', label: 'View History', icon: 'history' },
      ...(c.status === 'Running' ? [{ id: 'pause', label: 'Pause SLA', icon: 'pause' as const, dividerBefore: true }] : []),
      ...(c.status === 'Paused' ? [{ id: 'resume', label: 'Resume SLA', icon: 'play' as const, dividerBefore: true }] : []),
      ...(open ? [{ id: 'stop', label: `Stop — ${c.stopEvent}`, icon: 'check-circle' as const }, { id: 'escalate', label: 'Escalate', icon: 'alert-triangle' as const }, { id: 'reassign', label: 'Reassign', icon: 'user-check' as const }] : []),
      { id: 'note', label: 'Add Note', icon: 'pencil', dividerBefore: true },
    ];
  };

  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly pauseOptions = toOptions(PAUSE_REASONS);
  protected readonly txOptions = toOptions(['Service Request', 'Work Order'] as const);
  protected readonly fm = formatMinutes;
  protected readonly fdt = formatDateTime;
  protected readonly busy = signal(false);
  protected readonly mode = signal<Mode | null>(null);
  protected readonly target = signal<SlaClockListItem | null>(null);
  protected readonly reason = signal<string | number | null>('Waiting for Customer');
  protected readonly text = signal('');
  protected readonly team = signal<string | number | null>(null);
  protected readonly technician = signal<string | number | null>(null);
  protected readonly txType = signal<string | number | null>('Service Request');
  protected readonly qCustomer = signal<string | number | null>(null);
  protected readonly cust = computed(() => (this.qCustomer() ? String(this.qCustomer()) : '__none__'));
  protected readonly qAmc = signal<string | number | null>(null);
  protected readonly qSite = signal<string | number | null>(null);
  protected readonly qAsset = signal<string | number | null>(null);
  protected readonly qService = signal<string | number | null>(null);
  protected readonly qPriority = signal<string | number | null>('High');
  protected readonly preview = signal<SlaSelection | null>(null);
  protected readonly canStart = computed(() => !!this.qCustomer() && !!this.qSite());
  protected readonly title = computed(() => ({ pause: 'Pause SLA clock', resume: 'Resume SLA clock', reassign: 'Reassign', note: 'Add note', history: 'Clock history', start: 'Start SLA clock' })[this.mode() ?? 'note']);
  protected readonly confirmLabel = computed(() => ({ pause: 'Pause', resume: 'Resume', reassign: 'Reassign', note: 'Add Note', history: '', start: 'Start Clocks' })[this.mode() ?? 'note']);
  protected readonly valid = computed(() => (this.mode() === 'note' ? !!this.text().trim() : this.mode() === 'start' ? this.canStart() : this.mode() === 'reassign' ? !!this.team() : true));

  constructor() {
    const timer = setInterval(() => this.tickKey.update((k) => k + 1), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected open(mode: Mode, c: SlaClockListItem | null): void {
    this.target.set(c);
    this.text.set('');
    this.preview.set(null);
    this.team.set(c?.team ?? null);
    this.technician.set(c?.technician ?? null);
    this.mode.set(mode);
  }

  protected onAction({ id, row }: RowAction<SlaClockListItem>): void {
    if (id === 'stop') void this.exec(this.api.stop(row.id), `${row.transactionNumber} · ${row.targetType} stopped.`);
    else if (id === 'escalate') void this.exec(this.api.escalate(row.id), `${row.transactionNumber} escalated.`);
    else this.open(id as Mode, row);
  }

  private request() {
    const str = (x: string | number | null) => (x === null ? null : String(x));
    const amc = this.refs.data().amcs.find((a) => a.id === this.qAmc());
    return { customerId: String(this.qCustomer()), contractId: amc?.contractId ?? null, amcId: str(this.qAmc()), siteId: str(this.qSite()), assetId: str(this.qAsset()), serviceId: str(this.qService()), priority: (this.qPriority() ?? 'Medium') as Priority, requestType: 'Breakdown', date: new Date().toISOString() };
  }

  protected async validate(): Promise<void> {
    this.preview.set(await firstValueFrom(this.mappingApi.resolve(this.request())));
  }

  protected async confirm(): Promise<void> {
    const c = this.target();
    let work: Observable<unknown>;
    let message: string;
    switch (this.mode()) {
      case 'pause':
        work = this.api.pause(c!.id, this.reason() as PauseReason, this.text());
        message = 'SLA clock paused.';
        break;
      case 'resume':
        work = this.api.resume(c!.id, this.text());
        message = 'SLA clock resumed.';
        break;
      case 'reassign':
        work = this.api.reassign(c!.id, String(this.team()), this.technician() ? String(this.technician()) : null);
        message = 'Reassigned.';
        break;
      case 'note':
        work = this.api.addNote(c!.id, this.text());
        message = 'Note added.';
        break;
      default:
        work = this.api.start({ request: this.request(), transactionType: this.txType() as 'Service Request' | 'Work Order', subject: this.text() || 'New request' });
        message = 'SLA applied — clocks started.';
    }
    if (await this.exec(work, message)) this.mode.set(null);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.clocks.reload();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
