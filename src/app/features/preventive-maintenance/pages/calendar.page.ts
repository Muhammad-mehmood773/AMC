import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { toOptions } from '@shared/models/select-option';
import { EmptyState } from '@shared/ui/empty-state';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { StatusBadge } from '@shared/ui/status-badge';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { formatDate } from '@shared/utils/format';
import { OccurrenceActionHost, occurrenceActions } from '../components/occurrence-action-host';
import { PmReferenceStore } from '../data/pm-reference.store';
import { ScheduleApi } from '../data/pm.api';
import { addDays, addMonths, isNonWorking, today } from '../data/pm-recurrence';
import { OCC_TONE, PRIORITY_TONE } from '../models/display';
import { OPEN_STATUSES, type OccurrenceListItem } from '../models/operations.model';
import { ActionMenu } from '@shared/ui/action-menu';

type View = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Annual';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Component({
  selector: 'amc-pm-calendar-page',
  imports: [ActionMenu, EmptyState, FormField, Icon, OccurrenceActionHost, PageHeader, Panel, Select, StatusBadge, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Maintenance Calendar" subtitle="Drag an event to another day to reschedule it. Holidays, weekends and conflicts are highlighted." [breadcrumbs]="[{ label: 'Preventive Maintenance', path: '/app/preventive-maintenance/dashboard' }, { label: 'Calendar' }]" />
      <section class="amc-card flex flex-wrap items-end gap-3 p-3">
        <div class="flex items-center gap-1">
          <button type="button" class="amc-btn-ghost amc-btn-sm" aria-label="Previous" (click)="move(-1)"><amc-icon name="chevron-left" /></button>
          <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="anchor.set(todayIso)">Today</button>
          <button type="button" class="amc-btn-ghost amc-btn-sm" aria-label="Next" (click)="move(1)"><amc-icon name="chevron-right" /></button>
          <span class="ml-2 text-sm font-semibold text-ink">{{ rangeLabel() }}</span>
        </div>
        <amc-form-field label="Customer" for="cal-cust" class="ml-auto min-w-48"><amc-select inputId="cal-cust" [options]="refs.customerOptions()" [(value)]="customer" [clearable]="true" placeholder="All customers" /></amc-form-field>
        <amc-form-field label="Team" for="cal-team" class="min-w-40"><amc-select inputId="cal-team" [options]="refs.teamOptions()" [(value)]="team" [clearable]="true" placeholder="All teams" /></amc-form-field>
        <amc-form-field label="Technician" for="cal-tech" class="min-w-44"><amc-select inputId="cal-tech" [options]="refs.technicianOptions()" [(value)]="technician" [clearable]="true" placeholder="All technicians" /></amc-form-field>
        <amc-form-field label="Status" for="cal-status" class="min-w-36"><amc-select inputId="cal-status" [options]="statusOptions" [(value)]="status" [clearable]="true" placeholder="All" /></amc-form-field>
      </section>
      <amc-tabs [items]="views" [active]="view()" (activeChange)="view.set($any($event))" />

      @switch (view()) {
        @case ('Daily') {
          <amc-panel [title]="formatDate(anchor())" [description]="dayEvents(anchor()).length + ' event(s)' + (holiday(anchor()) ? ' · non-working day' : '')" icon="calendar" [padded]="false">
            <ul class="divide-y divide-line">
              @for (o of dayEvents(anchor()); track o.id) {
                <li class="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <div class="min-w-0 flex-1"><p class="text-sm font-medium text-ink">{{ o.assetName }}</p><p class="text-xs text-ink-muted">{{ o.planName }} · {{ o.customerName }} · {{ o.siteName }} · {{ o.window }}</p></div>
                  <span class="text-xs text-ink-muted">{{ o.technician ?? 'Unassigned' }} · {{ o.team }}</span>
                  <amc-status-badge [label]="o.priority" [tone]="priorityTone[o.priority]" />
                  <amc-status-badge [label]="o.effectiveStatus" [tone]="occTone[o.effectiveStatus]" />
                  @if (o.workOrderNumber) { <span class="font-mono text-xs text-ink-muted">{{ o.workOrderNumber }}</span> }
                  <amc-action-menu label="Actions" [items]="actions(o)" (action)="run($event, o)" />
                </li>
              } @empty { <li><amc-empty-state [compact]="true" icon="calendar" title="No maintenance" message="Nothing scheduled on this day." /></li> }
            </ul>
          </amc-panel>
        }
        @case ('Weekly') {
          <div class="grid grid-cols-1 gap-3 md:grid-cols-7">
            @for (d of weekDays(); track d) {
              <div class="amc-card min-h-48 p-2" [class]="holiday(d) ? 'bg-surface-muted' : ''" (dragover)="$event.preventDefault()" (drop)="drop($event, d)">
                <p class="mb-2 flex items-center justify-between text-xs font-semibold" [class]="d === todayIso ? 'text-brand' : 'text-ink-muted'"><span>{{ dayName(d) }} {{ d.slice(8) }}</span>@if (holiday(d)) { <span class="font-normal text-ink-subtle">off</span> }</p>
                <div class="space-y-1">@for (o of dayEvents(d); track o.id) { <button type="button" draggable="true" (dragstart)="drag($event, o)" (click)="select(o)" class="block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px]" [class]="chip(o)" [attr.title]="o.assetName + ' · ' + o.planName">{{ o.assetName }}</button> }</div>
              </div>
            }
          </div>
        }
        @case ('Monthly') {
          <section class="amc-card overflow-hidden">
            <div class="grid grid-cols-7 border-b border-line bg-surface-muted text-center text-xs font-medium text-ink-muted">@for (n of dayNames; track n) { <div class="py-2">{{ n }}</div> }</div>
            <div class="grid grid-cols-7">
              @for (d of monthCells(); track d.date) {
                <div class="min-h-28 border-b border-r border-line p-1.5" [class]="(d.inMonth ? '' : 'opacity-50 ') + (holiday(d.date) ? 'bg-surface-muted' : '')" (dragover)="$event.preventDefault()" (drop)="drop($event, d.date)">
                  <button type="button" class="mb-1 text-xs font-semibold hover:text-brand" [class]="d.date === todayIso ? 'text-brand' : 'text-ink-muted'" (click)="openDay(d.date)">{{ +d.date.slice(8) }}</button>
                  <div class="space-y-1">
                    @for (o of dayEvents(d.date).slice(0, 3); track o.id) { <button type="button" draggable="true" (dragstart)="drag($event, o)" (click)="select(o)" class="block w-full truncate rounded px-1 py-0.5 text-left text-[10px]" [class]="chip(o)" [attr.title]="o.assetName + ' · ' + o.planName + ' · ' + o.effectiveStatus">{{ o.assetName }}</button> }
                    @if (dayEvents(d.date).length > 3) { <button type="button" class="text-[10px] text-ink-muted hover:text-brand" (click)="openDay(d.date)">+{{ dayEvents(d.date).length - 3 }} more</button> }
                  </div>
                </div>
              }
            </div>
          </section>
        }
        @case ('Quarterly') {
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            @for (m of quarterMonths(); track m.key) {
              <amc-panel [title]="m.label" [padded]="false">
                <div class="grid grid-cols-7 gap-px p-2 text-center text-[10px]">
                  @for (n of dayNames; track n) { <span class="text-ink-subtle">{{ n.slice(0, 2) }}</span> }
                  @for (c of m.cells; track $index) {
                    @if (c) { <button type="button" class="rounded py-1 tabular-nums" [class]="heat(c)" (click)="openDay(c)" [attr.title]="dayEvents(c).length + ' event(s)'">{{ +c.slice(8) }}</button> } @else { <span></span> }
                  }
                </div>
              </amc-panel>
            }
          </div>
        }
        @case ('Annual') {
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            @for (m of yearMonths(); track m.key) {
              <button type="button" class="amc-card p-3 text-left hover:border-brand/40" (click)="anchor.set(m.key + '-01'); view.set('Monthly')">
                <p class="text-sm font-semibold text-ink">{{ m.label }}</p>
                <p class="mt-1 text-2xl font-semibold tabular-nums">{{ m.total }}</p>
                <p class="text-xs text-ink-muted">{{ m.completed }} completed · {{ m.overdue }} overdue</p>
                <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full rounded-full bg-brand" [style.width.%]="m.total ? (m.completed / m.total) * 100 : 0"></div></div>
              </button>
            }
          </div>
        }
      }

      <div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <amc-panel title="Conflict detection" [description]="conflicts().length + ' conflict(s) in view'" icon="alert-triangle" [padded]="false">
          <ul class="max-h-80 divide-y divide-line overflow-y-auto">
            @for (c of conflicts(); track $index) { <li class="flex items-start gap-3 px-4 py-2.5 text-sm"><amc-status-badge [label]="c.type" tone="warn" /><span class="min-w-0 flex-1 text-ink-muted">{{ formatDate(c.date) }} · {{ c.detail }}</span></li> } @empty { <li><amc-empty-state [compact]="true" icon="check-circle" title="No conflicts" message="No double bookings, asset, window, holiday or non-working-day conflicts." /></li> }
          </ul>
        </amc-panel>
        <amc-panel title="Technician availability" description="Jobs in view vs capacity" icon="users" [padded]="false">
          <ul class="max-h-80 divide-y divide-line overflow-y-auto">
            @for (t of availability(); track t.name) {
              <li class="flex items-center gap-3 px-4 py-2.5">
                <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-ink">{{ t.name }}</p><p class="text-xs text-ink-muted">{{ t.team }} · {{ t.region }}</p><div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full rounded-full" [class]="t.load > 90 ? 'bg-danger' : t.load > 70 ? 'bg-warn' : 'bg-ok'" [style.width.%]="t.load > 100 ? 100 : t.load"></div></div></div>
                <span class="shrink-0 text-xs tabular-nums text-ink-muted">{{ t.jobs }} / {{ t.capacity }}</span>
              </li>
            }
          </ul>
        </amc-panel>
      </div>
    </div>
    <amc-occurrence-action-host (done)="events.reload(); conflictsRes.reload()" />
  `,
})
export class CalendarPage {
  private readonly api = inject(ScheduleApi);
  protected readonly refs = inject(PmReferenceStore);
  private readonly host = viewChild.required(OccurrenceActionHost);

  protected readonly todayIso = today();
  protected readonly views: TabItem[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual'].map((v) => ({ id: v, label: v }));
  protected readonly view = signal<View>('Monthly');
  protected readonly anchor = signal(today());
  protected readonly customer = signal<string | number | null>(null);
  protected readonly team = signal<string | number | null>(null);
  protected readonly technician = signal<string | number | null>(null);
  protected readonly status = signal<string | number | null>(null);
  protected readonly statusOptions = toOptions(['Planned', 'Scheduled', 'Assigned', 'Confirmed', 'In Progress', 'Rescheduled', 'Overdue', 'Completed', 'Missed'] as const);
  protected readonly dayNames = DAY_NAMES;
  protected readonly occTone = OCC_TONE;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly formatDate = formatDate;

  protected readonly events = rxResource({ stream: () => this.api.list() });
  private readonly all = computed(() => (this.events.hasValue() ? this.events.value() : []).filter((o) => o.status !== 'Cancelled' && (!this.customer() || o.customerId === this.customer()) && (!this.team() || o.team === this.team()) && (!this.technician() || o.technician === this.technician()) && (!this.status() || o.effectiveStatus === this.status())));
  private readonly byDay = computed(() => {
    const m = new Map<string, OccurrenceListItem[]>();
    this.all().forEach((o) => m.set(o.scheduledDate, [...(m.get(o.scheduledDate) ?? []), o]));
    return m;
  });
  protected readonly range = computed(() => {
    const a = this.anchor();
    switch (this.view()) {
      case 'Daily':
        return { from: a, to: a };
      case 'Weekly': {
        const start = addDays(a, -new Date(`${a}T00:00:00Z`).getUTCDay());
        return { from: start, to: addDays(start, 6) };
      }
      case 'Monthly':
        return { from: `${a.slice(0, 7)}-01`, to: addDays(addMonths(`${a.slice(0, 7)}-01`, 1), -1) };
      case 'Quarterly': {
        const q = Math.floor((+a.slice(5, 7) - 1) / 3) * 3 + 1;
        const start = `${a.slice(0, 4)}-${String(q).padStart(2, '0')}-01`;
        return { from: start, to: addDays(addMonths(start, 3), -1) };
      }
      default:
        return { from: `${a.slice(0, 4)}-01-01`, to: `${a.slice(0, 4)}-12-31` };
    }
  });
  protected readonly conflictsRes = rxResource({ params: () => this.range(), stream: ({ params }) => this.api.conflicts(params.from, params.to) });
  protected readonly conflicts = computed(() => (this.conflictsRes.hasValue() ? this.conflictsRes.value() : []));
  protected readonly rangeLabel = computed(() => {
    const r = this.range();
    const a = this.anchor();
    switch (this.view()) {
      case 'Daily':
        return formatDate(a);
      case 'Weekly':
        return `${formatDate(r.from)} – ${formatDate(r.to)}`;
      case 'Monthly':
        return `${MONTHS[+a.slice(5, 7) - 1]} ${a.slice(0, 4)}`;
      case 'Quarterly':
        return `Q${Math.floor((+a.slice(5, 7) - 1) / 3) + 1} ${a.slice(0, 4)}`;
      default:
        return a.slice(0, 4);
    }
  });
  protected readonly weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(this.range().from, i)));
  protected readonly monthCells = computed(() => {
    const first = `${this.anchor().slice(0, 7)}-01`;
    const start = addDays(first, -new Date(`${first}T00:00:00Z`).getUTCDay());
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      return { date, inMonth: date.slice(0, 7) === first.slice(0, 7) };
    });
  });
  protected readonly quarterMonths = computed(() => [0, 1, 2].map((i) => {
    const start = addMonths(this.range().from, i);
    const lead = new Date(`${start}T00:00:00Z`).getUTCDay();
    const days = new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7), 0)).getUTCDate();
    return { key: start.slice(0, 7), label: `${MONTHS[+start.slice(5, 7) - 1]} ${start.slice(0, 4)}`, cells: [...Array.from({ length: lead }, () => null as string | null), ...Array.from({ length: days }, (_, d) => addDays(start, d))] };
  }));
  protected readonly yearMonths = computed(() => Array.from({ length: 12 }, (_, i) => {
    const key = `${this.anchor().slice(0, 4)}-${String(i + 1).padStart(2, '0')}`;
    const list = this.all().filter((o) => o.scheduledDate.startsWith(key));
    return { key, label: MONTHS[i], total: list.length, completed: list.filter((o) => o.status === 'Completed').length, overdue: list.filter((o) => o.effectiveStatus === 'Overdue').length };
  }));
  protected readonly availability = computed(() => {
    const r = this.range();
    const workDays = Math.max(1, Array.from({ length: Math.round((new Date(r.to).getTime() - new Date(r.from).getTime()) / 86_400_000) + 1 }, (_, i) => addDays(r.from, i)).filter((d) => !isNonWorking(d, this.refs.data().holidays)).length);
    return this.refs.data().technicians.filter((t) => !this.team() || t.team === this.team()).map((t) => {
      const jobs = this.all().filter((o) => o.technician === t.name && o.scheduledDate >= r.from && o.scheduledDate <= r.to && !['Completed', 'Missed', 'Cancelled'].includes(o.status)).length;
      const capacity = t.dailyCapacity * workDays;
      return { name: t.name, team: t.team, region: t.region, jobs, capacity, load: Math.round((jobs / capacity) * 100) };
    }).sort((a, b) => b.load - a.load);
  });
  private dragged: OccurrenceListItem | null = null;

  protected dayEvents(d: string): OccurrenceListItem[] {
    return this.byDay().get(d) ?? [];
  }

  protected holiday(d: string): boolean {
    return isNonWorking(d, this.refs.data().holidays);
  }

  protected dayName(d: string): string {
    return DAY_NAMES[new Date(`${d}T00:00:00Z`).getUTCDay()];
  }

  protected chip(o: OccurrenceListItem): string {
    const s = o.effectiveStatus;
    return s === 'Completed' ? 'bg-ok-subtle text-ok' : s === 'Overdue' || s === 'Missed' ? 'bg-danger-subtle text-danger' : s === 'Rescheduled' ? 'bg-warn-subtle text-warn' : s === 'Assigned' || s === 'Confirmed' || s === 'In Progress' ? 'bg-brand-subtle text-brand' : 'bg-info-subtle text-info';
  }

  protected heat(d: string): string {
    const n = this.dayEvents(d).length;
    return n === 0 ? (this.holiday(d) ? 'text-ink-subtle' : 'text-ink-muted hover:bg-surface-sunken') : n < 3 ? 'bg-brand-subtle text-brand' : n < 6 ? 'bg-brand/40 text-ink' : 'bg-brand text-white';
  }

  protected move(step: number): void {
    const a = this.anchor();
    const v = this.view();
    this.anchor.set(v === 'Daily' ? addDays(a, step) : v === 'Weekly' ? addDays(a, 7 * step) : v === 'Monthly' ? addMonths(a, step) : v === 'Quarterly' ? addMonths(a, 3 * step) : addMonths(a, 12 * step));
  }

  protected openDay(d: string): void {
    this.anchor.set(d);
    this.view.set('Daily');
  }

  protected select(o: OccurrenceListItem): void {
    this.openDay(o.scheduledDate);
  }

  protected actions(o: OccurrenceListItem) {
    return occurrenceActions(o);
  }

  protected run(action: string, o: OccurrenceListItem): void {
    void this.host().run(action, o);
  }

  protected drag(event: DragEvent, o: OccurrenceListItem): void {
    this.dragged = o;
    event.dataTransfer?.setData('text/plain', o.id);
  }

  protected drop(event: DragEvent, date: string): void {
    event.preventDefault();
    const o = this.dragged;
    this.dragged = null;
    if (o && o.scheduledDate !== date && OPEN_STATUSES.includes(o.status)) this.host().rescheduleTo(o, date);
  }
}
