import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
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
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { eventColumns, ruleColumns } from '../components/sla-columns';
import { SlaReferenceStore } from '../data/sla-reference.store';
import { EscalationApi } from '../data/sla.api';
import { ESCALATION_ACTIONS, ESCALATION_LEVELS, type EscalationEventListItem, type EscalationRuleListItem, NOTIFICATION_CHANNELS, TARGET_TYPES, TRIGGER_TYPES, type TriggerType } from '../models/operations.model';

/** SRS 7.11 — automated multi-level escalation. */
@Component({
  selector: 'amc-escalations-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, PageHeader, ReactiveFormsModule, Select, Spinner, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="SLA Escalation Rules" subtitle="Escalations fire automatically as SLA consumption crosses each threshold." [breadcrumbs]="[{ label: 'SLA Management', path: '/app/sla/dashboard' }, { label: 'Escalations' }]">
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Add Rule</button>
      </amc-page-header>
      <ol class="flex flex-wrap items-center gap-2 text-xs" aria-label="Example">
        <li class="rounded-full bg-surface-sunken px-2.5 py-1 font-medium text-ink-muted">Resolution target 4h</li>
        <li class="flex items-center gap-2"><amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /><span class="rounded-full bg-warn-subtle px-2.5 py-1 font-medium text-warn">75% → Warning notification</span></li>
        <li class="flex items-center gap-2"><amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /><span class="rounded-full bg-warn-subtle px-2.5 py-1 font-medium text-warn">90% → Supervisor escalation</span></li>
        <li class="flex items-center gap-2"><amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /><span class="rounded-full bg-danger-subtle px-2.5 py-1 font-medium text-danger">100% → SLA breach</span></li>
        <li class="flex items-center gap-2"><amc-icon name="arrow-right" [size]="12" class="text-ink-subtle" /><span class="rounded-full bg-danger-subtle px-2.5 py-1 font-medium text-danger">110% → Service manager escalation</span></li>
      </ol>
      <amc-tabs [items]="tabs()" [active]="tab()" (activeChange)="tab.set($any($event))" />
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search SLA, recipient, request or action…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        @if (tab() === 'rules') {
          <amc-data-table tableId="sla-rules" [entity]="{ singular: 'rule', plural: 'rules' }" [rows]="filteredRules()" [columns]="ruleCols" [trackBy]="trackById" [loading]="rules.isLoading()" [actions]="ruleActions" [initialPageSize]="25" emptyIcon="alert-triangle" emptyTitle="No rules" emptyMessage="Add escalation rules to an SLA." (action)="onRule($event)" />
        } @else {
          <amc-data-table tableId="sla-escalation-events" [entity]="{ singular: 'escalation', plural: 'escalations' }" [rows]="filteredEvents()" [columns]="eventCols" [trackBy]="trackById" [loading]="events.isLoading()" [actions]="eventActions" [initialPageSize]="25" emptyIcon="check-circle" emptyTitle="No escalations" emptyMessage="No escalations match." (action)="onEvent($event)" />
        }
      </section>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Edit escalation rule' : 'Add escalation rule'" [(open)]="formOpen">
      <form [formGroup]="form" id="rule-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="SLA" for="er-sla" [control]="c.slaId" class="sm:col-span-2"><amc-select inputId="er-sla" formControlName="slaId" [options]="refs.slaOptions()" /></amc-form-field>
          <amc-form-field label="Escalation Level" for="er-level" [control]="c.level"><amc-select inputId="er-level" formControlName="level" [options]="levelOptions" /></amc-form-field>
          <amc-form-field label="Trigger Type" for="er-type" [control]="c.triggerType"><amc-select inputId="er-type" formControlName="triggerType" [options]="triggerOptions" /></amc-form-field>
          <amc-form-field label="Trigger Percentage" for="er-pct" [control]="c.triggerPercent" hint="% of the target consumed."><input id="er-pct" type="number" min="1" class="amc-input tabular-nums" formControlName="triggerPercent" /></amc-form-field>
          <amc-form-field label="Trigger Time (minutes)" for="er-min" [control]="c.triggerMinutes" hint="For no assignment / response / progress."><input id="er-min" type="number" min="1" class="amc-input tabular-nums" formControlName="triggerMinutes" /></amc-form-field>
          <amc-form-field label="Target" for="er-target" [control]="c.targetType"><amc-select inputId="er-target" formControlName="targetType" [options]="targetOptions" /></amc-form-field>
          <amc-form-field label="Recipient" for="er-rcpt" [control]="c.recipient"><input id="er-rcpt" class="amc-input" formControlName="recipient" /></amc-form-field>
          <amc-form-field label="Team" for="er-team" [control]="c.team"><amc-select inputId="er-team" formControlName="team" [options]="refs.teamOptions()" /></amc-form-field>
          <amc-form-field label="Notification Channel" for="er-ch" [control]="c.channel"><amc-select inputId="er-ch" formControlName="channel" [options]="channelOptions" /></amc-form-field>
          <amc-form-field label="Escalation Action" for="er-act" [control]="c.action"><amc-select inputId="er-act" formControlName="action" [options]="actionOptions" /></amc-form-field>
          <amc-form-field label="Escalation Status" for="er-status" [control]="c.status"><amc-select inputId="er-status" formControlName="status" [options]="statusOptions" /></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="rule-form" class="amc-btn-primary" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class EscalationsPage {
  private readonly api = inject(EscalationApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SlaReferenceStore);

  readonly slaId = input<string>();

  protected readonly tab = signal<'rules' | 'events'>('rules');
  protected readonly rules = rxResource({ stream: () => this.api.rules() });
  protected readonly events = rxResource({ stream: () => this.api.events() });
  private readonly ruleRows = computed(() => (this.rules.hasValue() ? this.rules.value() : []));
  private readonly eventRows = computed(() => (this.events.hasValue() ? this.events.value() : []));
  protected readonly tabs = computed<TabItem[]>(() => [{ id: 'rules', label: 'Escalation Rules', count: this.ruleRows().length }, { id: 'events', label: 'Triggered Escalations', count: this.eventRows().filter((e) => e.status === 'Open').length }]);
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.slaId() ? { sla: [this.slaId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'sla', label: 'SLA', type: 'multiselect', options: this.refs.slaOptions() },
    { key: 'level', label: 'Escalation Level', type: 'multiselect', options: this.levelOptions },
    { key: 'channel', label: 'Channel', type: 'multiselect', options: this.channelOptions },
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(['Active', 'Inactive', 'Open', 'Acknowledged', 'Closed'] as const) },
  ]);
  protected readonly filteredRules = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.ruleRows().filter((r) => (!term || `${r.slaNumber} ${r.slaName} ${r.recipient} ${r.action}`.toLowerCase().includes(term)) && matchesAny(f, 'sla', r.slaId) && matchesAny(f, 'level', String(r.level)) && matchesAny(f, 'channel', r.channel) && matchesAny(f, 'status', r.status));
  });
  protected readonly filteredEvents = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.eventRows().filter((e) => (!term || `${e.slaNumber} ${e.transactionNumber} ${e.customerName} ${e.recipient} ${e.action}`.toLowerCase().includes(term)) && matchesAny(f, 'sla', e.slaId) && matchesAny(f, 'level', String(e.level)) && matchesAny(f, 'channel', e.channel) && matchesAny(f, 'status', e.status));
  });
  protected readonly ruleCols = ruleColumns();
  protected readonly eventCols = eventColumns();
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly ruleActions = (): MenuItem[] => [{ id: 'edit', label: 'Edit', icon: 'pencil' }];
  protected readonly eventActions = (e: EscalationEventListItem): MenuItem[] => [
    ...(e.status === 'Open' ? [{ id: 'ack', label: 'Acknowledge', icon: 'check' as const }] : []),
    ...(e.status !== 'Closed' ? [{ id: 'close', label: 'Close', icon: 'check-circle' as const }] : []),
  ];
  protected readonly levelOptions = ESCALATION_LEVELS.map((l, i) => ({ value: String(i + 1), label: l }));
  protected readonly triggerOptions = toOptions(TRIGGER_TYPES);
  protected readonly channelOptions = toOptions(NOTIFICATION_CHANNELS);
  protected readonly actionOptions = toOptions(ESCALATION_ACTIONS);
  protected readonly targetOptions = toOptions(['Any', ...TARGET_TYPES] as const);
  protected readonly statusOptions = toOptions(['Active', 'Inactive'] as const);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<EscalationRuleListItem | null>(null);
  protected readonly form = this.fb.group({
    slaId: this.fb.control('', Validators.required),
    level: this.fb.control('1'),
    triggerType: this.fb.control<TriggerType>('Before SLA Breach'),
    triggerPercent: this.fb.control<number | null>(75),
    triggerMinutes: this.fb.control<number | null>(null),
    targetType: this.fb.control<string>('Any'),
    recipient: this.fb.control('', Validators.required),
    team: this.fb.control('Service Desk'),
    channel: this.fb.control('Email'),
    action: this.fb.control('Notify Supervisor'),
    status: this.fb.control<'Active' | 'Inactive'>('Active'),
  });

  protected openForm(r: EscalationRuleListItem | null): void {
    this.editing.set(r);
    this.form.reset({ slaId: r?.slaId ?? this.slaId() ?? '', level: String(r?.level ?? 1), triggerType: r?.triggerType ?? 'Before SLA Breach', triggerPercent: r ? r.triggerPercent : 75, triggerMinutes: r?.triggerMinutes ?? null, targetType: r?.targetType ?? 'Any', recipient: r?.recipient ?? '', team: r?.team ?? 'Service Desk', channel: r?.channel ?? 'Email', action: r?.action ?? 'Notify Supervisor', status: r?.status ?? 'Active' });
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const input = { ...v, level: Number(v.level), triggerPercent: v.triggerPercent === null || (v.triggerPercent as unknown) === '' ? null : Number(v.triggerPercent), triggerMinutes: v.triggerMinutes === null || (v.triggerMinutes as unknown) === '' ? null : Number(v.triggerMinutes), targetType: v.targetType as EscalationRuleListItem['targetType'] };
    const r = this.editing();
    if (await this.exec(r ? this.api.updateRule(r.id, input) : this.api.createRule(input), r ? 'Rule updated.' : 'Rule added.')) {
      this.formOpen.set(false);
      this.rules.reload();
    }
  }

  protected onRule({ row }: RowAction<EscalationRuleListItem>): void {
    this.openForm(row);
  }

  protected async onEvent({ id, row }: RowAction<EscalationEventListItem>): Promise<void> {
    if (await this.exec(this.api.setEventStatus(row.id, id === 'ack' ? 'Acknowledged' : 'Closed'), id === 'ack' ? 'Escalation acknowledged.' : 'Escalation closed.')) this.events.reload();
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
