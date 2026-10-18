import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { MultiSelect, Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { firstValueFrom } from 'rxjs';
import { targetColumns } from '../components/sla-columns';
import { SlaReferenceStore } from '../data/sla-reference.store';
import { SlaTargetApi } from '../data/sla.api';
import { SLA_RULES } from '../data/sla.config';
import { formatMinutes } from '../models/display';
import { PAUSE_REASONS, START_EVENTS, STOP_EVENTS, TARGET_TYPES, type SlaTargetListItem, type TargetType, WARNING_LEVELS } from '../models/operations.model';
import { PRIORITIES, TIME_UNITS, type TimeUnit, UNIT_MINUTES } from '../models/sla.model';

@Component({
  selector: 'amc-targets-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, MultiSelect, PageHeader, ReactiveFormsModule, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="SLA Definition & Targets" subtitle="Measurable commitments — duration, calendar, clock start / stop / pause events and thresholds." [breadcrumbs]="[{ label: 'SLA Management', path: '/app/sla/dashboard' }, { label: 'Targets' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Add Target</button>
      </amc-page-header>
      <div class="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span class="font-medium text-ink">Warning levels:</span>
        @for (w of warningLevels; track w) { <span class="rounded-full px-2 py-0.5" [class]="w === 'Normal' ? 'bg-ok-subtle text-ok' : w === 'Warning' ? 'bg-warn-subtle text-warn' : 'bg-danger-subtle text-danger'">{{ w }}</span> }
        <span>· defaults {{ rules.warningPercent }}% / {{ rules.escalationPercent }}% / {{ rules.breachPercent }}%</span>
      </div>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search SLA, target type or event…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="sla-targets" [entity]="{ singular: 'target', plural: 'targets' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="targets.isLoading()" [actions]="rowActions" [initialPageSize]="25" emptyIcon="clock" emptyTitle="No targets" emptyMessage="Add targets to an SLA." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Modify target' : 'Add target'" [description]="editing() ? 'Running clocks keep the target they started with.' : ''" [(open)]="formOpen">
      <form [formGroup]="form" id="target-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="SLA" for="tg-sla" [control]="c.slaId" class="sm:col-span-2"><amc-select inputId="tg-sla" formControlName="slaId" [options]="refs.slaOptions()" /></amc-form-field>
          <amc-form-field label="Priority" for="tg-prio" [control]="c.priority"><amc-select inputId="tg-prio" formControlName="priority" [options]="priorityOptions" /></amc-form-field>
          <amc-form-field label="Target Type" for="tg-type" [control]="c.targetType"><amc-select inputId="tg-type" formControlName="targetType" [options]="typeOptions" /></amc-form-field>
          <amc-form-field label="Target Duration" for="tg-dur" [control]="c.duration"><input id="tg-dur" type="number" min="0.01" step="0.25" class="amc-input tabular-nums" formControlName="duration" /></amc-form-field>
          <amc-form-field label="Time Unit" for="tg-unit" [control]="c.unit"><amc-select inputId="tg-unit" formControlName="unit" [options]="unitOptions" /></amc-form-field>
          <amc-form-field label="Calendar" for="tg-cal" [control]="c.calendarId" class="sm:col-span-2"><amc-select inputId="tg-cal" formControlName="calendarId" [options]="refs.calendarOptions()" /></amc-form-field>
          <amc-form-field label="Start Event" for="tg-start" [control]="c.startEvent"><amc-select inputId="tg-start" formControlName="startEvent" [options]="startOptions" /></amc-form-field>
          <amc-form-field label="Stop Event" for="tg-stop" [control]="c.stopEvent"><amc-select inputId="tg-stop" formControlName="stopEvent" [options]="stopOptions" /></amc-form-field>
          <amc-form-field label="Pause Events" for="tg-pause" [control]="c.pauseEvents"><amc-multi-select inputId="tg-pause" formControlName="pauseEvents" [options]="pauseOptions" [maxChips]="2" /></amc-form-field>
          <amc-form-field label="Resume Event" for="tg-resume" [control]="c.resumeEvent"><input id="tg-resume" class="amc-input" formControlName="resumeEvent" /></amc-form-field>
          <amc-form-field label="Warning Threshold (%)" for="tg-warn" [control]="c.warningPercent"><input id="tg-warn" type="number" min="1" class="amc-input tabular-nums" formControlName="warningPercent" /></amc-form-field>
          <amc-form-field label="Escalation Threshold (%)" for="tg-esc" [control]="c.escalationPercent"><input id="tg-esc" type="number" min="1" class="amc-input tabular-nums" formControlName="escalationPercent" /></amc-form-field>
          <amc-form-field label="Breach Threshold (%)" for="tg-br" [control]="c.breachPercent"><input id="tg-br" type="number" min="1" class="amc-input tabular-nums" formControlName="breachPercent" /></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="target-form" class="amc-btn-primary" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class TargetsPage {
  private readonly api = inject(SlaTargetApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SlaReferenceStore);

  readonly slaId = input<string>();
  readonly action = input<string>();

  protected readonly targets = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.targets.hasValue() ? this.targets.value() : []));
  protected readonly columns = targetColumns();
  protected readonly trackById = (t: SlaTargetListItem) => t.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.slaId() ? { sla: [this.slaId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'sla', label: 'SLA', type: 'multiselect', options: this.refs.slaOptions() },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: this.priorityOptions },
    { key: 'type', label: 'Target Type', type: 'multiselect', options: this.typeOptions },
    { key: 'calendar', label: 'Calendar', type: 'multiselect', options: this.refs.calendarOptions() },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((t) => (!term || `${t.slaNumber} ${t.slaName} ${t.targetType} ${t.startEvent} ${t.stopEvent}`.toLowerCase().includes(term)) && matchesAny(f, 'sla', t.slaId) && matchesAny(f, 'priority', t.priority) && matchesAny(f, 'type', t.targetType) && matchesAny(f, 'calendar', t.calendarId));
  });
  protected readonly rowActions = (): MenuItem[] => [{ id: 'edit', label: 'Modify Target', icon: 'pencil' }];
  protected readonly rules = SLA_RULES;
  protected readonly warningLevels = WARNING_LEVELS;
  protected readonly priorityOptions = toOptions(['All', ...PRIORITIES] as const);
  protected readonly typeOptions = toOptions(TARGET_TYPES);
  protected readonly unitOptions = toOptions(TIME_UNITS);
  protected readonly startOptions = toOptions(START_EVENTS);
  protected readonly stopOptions = toOptions(STOP_EVENTS);
  protected readonly pauseOptions = toOptions(PAUSE_REASONS);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<SlaTargetListItem | null>(null);
  protected readonly form = this.fb.group({
    slaId: this.fb.control('', Validators.required),
    priority: this.fb.control<string>('Medium'),
    targetType: this.fb.control<TargetType>('First Response'),
    duration: this.fb.control(4, [Validators.required, Validators.min(0.01)]),
    unit: this.fb.control<TimeUnit>('Hours'),
    calendarId: this.fb.control('CAL-KSA-BH', Validators.required),
    startEvent: this.fb.control('Service Request Created'),
    stopEvent: this.fb.control('First Response Sent'),
    pauseEvents: this.fb.control<(string | number)[]>(['Waiting for Customer', 'Waiting for Parts']),
    resumeEvent: this.fb.control('Pause condition cleared'),
    warningPercent: this.fb.control<number>(SLA_RULES.warningPercent),
    escalationPercent: this.fb.control<number>(SLA_RULES.escalationPercent),
    breachPercent: this.fb.control<number>(SLA_RULES.breachPercent),
  });

  constructor() {
    effect(() => {
      if (this.action() === 'new') untracked(() => this.openForm(null));
    });
  }

  protected openForm(t: SlaTargetListItem | null): void {
    this.editing.set(t);
    const unit: TimeUnit = t?.unit ?? 'Hours';
    this.form.reset({
      slaId: t?.slaId ?? this.slaId() ?? '', priority: t?.priority ?? 'Medium', targetType: t?.targetType ?? 'First Response', duration: t ? Math.round((t.durationMinutes / UNIT_MINUTES[unit]) * 100) / 100 : 4, unit, calendarId: t?.calendarId ?? 'CAL-KSA-BH',
      startEvent: t?.startEvent ?? 'Service Request Created', stopEvent: t?.stopEvent ?? 'First Response Sent', pauseEvents: [...(t?.pauseEvents ?? ['Waiting for Customer', 'Waiting for Parts'])], resumeEvent: t?.resumeEvent ?? 'Pause condition cleared',
      warningPercent: t?.warningPercent ?? SLA_RULES.warningPercent, escalationPercent: t?.escalationPercent ?? SLA_RULES.escalationPercent, breachPercent: t?.breachPercent ?? SLA_RULES.breachPercent,
    });
    if (t) this.form.controls.slaId.disable();
    else this.form.controls.slaId.enable();
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const input = { slaId: v.slaId, priority: v.priority as SlaTargetListItem['priority'], targetType: v.targetType, durationMinutes: Math.round(Number(v.duration) * UNIT_MINUTES[v.unit]), unit: v.unit, calendarId: v.calendarId, startEvent: v.startEvent, stopEvent: v.stopEvent, pauseEvents: v.pauseEvents.map(String), resumeEvent: v.resumeEvent, warningPercent: Number(v.warningPercent), escalationPercent: Number(v.escalationPercent), breachPercent: Number(v.breachPercent) };
    const t = this.editing();
    this.busy.set(true);
    try {
      await firstValueFrom(t ? this.api.update(t.id, input) : this.api.create(input));
      this.notify.success(`${input.priority} ${input.targetType} target ${t ? 'updated' : 'added'}: ${formatMinutes(input.durationMinutes)}.`);
      this.formOpen.set(false);
      this.targets.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected onAction({ row }: RowAction<SlaTargetListItem>): void {
    this.openForm(row);
  }

  protected export(): void {
    downloadCsv(timestampedName('sla-targets', 'csv'), ['SLA', 'Priority', 'Target Type', 'Target Duration (min)', 'Time Unit', 'Calendar', 'Start Event', 'Stop Event', 'Pause Events', 'Resume Event', 'Warning %', 'Escalation %', 'Breach %'],
      this.filtered().map((t) => [t.slaNumber, t.priority, t.targetType, t.durationMinutes, t.unit, t.calendarName, t.startEvent, t.stopEvent, t.pauseEvents.join('; '), t.resumeEvent, t.warningPercent, t.escalationPercent, t.breachPercent]));
  }
}
