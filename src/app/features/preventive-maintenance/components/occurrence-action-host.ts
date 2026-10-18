import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { Dialog } from '@shared/ui/dialog';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { type Observable, firstValueFrom } from 'rxjs';
import { PmReferenceStore } from '../data/pm-reference.store';
import { ChecklistApi, PlanApi, PmWorkOrderApi, ScheduleApi } from '../data/pm.api';
import { PM_RULES } from '../data/pm.config';
import { addDays, daysBetweenIso, today } from '../data/pm-recurrence';
import { ASSET_CONDITIONS, COMPLETION_RESULTS, type ChecklistItem, type CompletionResult, OPEN_STATUSES, OVERDUE_REASONS, type OccurrenceListItem, type PmValidation } from '../models/operations.model';
import { MAINTENANCE_WINDOWS, type PlanListItem, PRIORITIES } from '../models/plan.model';
import { PmValidationView } from './pm-validation-view';

type Mode = 'validate' | 'assign' | 'reschedule' | 'complete' | 'corrective' | 'cancel' | 'miss' | 'reason';

/** Status-aware actions for a maintenance event (SRS 8.9, 8.15–8.17, 8.21, 8.22). */
export function occurrenceActions(o: OccurrenceListItem): MenuItem[] {
  const open = OPEN_STATUSES.includes(o.status);
  return [
    { id: 'validate', label: 'Validate', icon: 'shield-check' },
    ...(open ? [{ id: 'assign', label: o.technician ? 'Reassign Technician' : 'Assign Technician', icon: 'user-check' as const, dividerBefore: true }] : []),
    ...(open && o.technician && ['Assigned', 'Reassigned'].includes(o.assignment) ? [{ id: 'accept', label: 'Technician Accepts', icon: 'check' as const }, { id: 'reject', label: 'Technician Rejects', icon: 'x' as const }] : []),
    ...(open && o.technician && o.assignment === 'Accepted' ? [{ id: 'confirm', label: 'Confirm Schedule', icon: 'calendar-check' as const }] : []),
    ...(open && !o.workOrderId ? [{ id: 'wo', label: 'Generate Work Order', icon: 'wrench' as const }] : []),
    ...(open ? [{ id: 'start', label: 'Start Maintenance', icon: 'play' as const, dividerBefore: true, disabled: !o.technician, hint: o.technician ? undefined : 'Assign a technician first' }] : []),
    ...(open || o.status === 'In Progress' ? [{ id: 'complete', label: 'Complete', icon: 'check-circle' as const, disabled: !o.technician }] : []),
    ...(open ? [{ id: 'reschedule', label: 'Reschedule', icon: 'calendar' as const, dividerBefore: true }] : []),
    ...(o.effectiveStatus === 'Overdue' ? [{ id: 'reason', label: 'Set Overdue Reason', icon: 'alert-circle' as const }] : []),
    { id: 'corrective', label: 'Create Corrective Work Order', icon: 'alert-triangle', dividerBefore: true },
    ...(open && o.scheduledDate <= today() ? [{ id: 'miss', label: 'Mark Missed', icon: 'x' as const, danger: true }] : []),
    ...(open ? [{ id: 'cancel', label: 'Cancel', icon: 'ban' as const, danger: true }] : []),
  ];
}

@Component({
  selector: 'amc-occurrence-action-host',
  imports: [Dialog, FormField, Icon, PmValidationView, Select, Spinner, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog [size]="mode() === 'complete' || mode() === 'validate' ? 'lg' : 'md'" [title]="title()" [description]="target() ? target()!.number + ' · ' + target()!.assetName + ' · ' + target()!.scheduledDate : ''" [open]="!!mode()" (openChange)="!$event && mode.set(null)">
      @if (target(); as o) {
        @switch (mode()) {
          @case ('validate') {
            @if (validation(); as v) { <amc-pm-validation-view [validation]="v" /> } @else { <div class="flex justify-center p-6"><amc-spinner /></div> }
          }
          @case ('assign') {
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <amc-form-field label="Team" for="oa-team"><amc-select inputId="oa-team" [options]="refs.teamOptions()" [(value)]="team" /></amc-form-field>
              <amc-form-field label="Technician" for="oa-tech"><amc-select inputId="oa-tech" [options]="refs.technicianOptions()" [(value)]="technician" [clearable]="true" /></amc-form-field>
            </div>
            <p class="amc-overline mt-4">Suggested by assignment rules</p>
            <ul class="mt-2 divide-y divide-line rounded-xl border border-line">
              @for (s of suggestions(); track s.technician) {
                <li class="flex items-center gap-3 px-3 py-2">
                  <div class="min-w-0 flex-1"><p class="text-sm font-medium text-ink">{{ s.technician }} <span class="font-normal text-ink-muted">· {{ s.team }}</span></p><p class="truncate text-xs text-ink-muted">{{ s.reasons.join(' · ') }}</p></div>
                  <span class="text-xs font-semibold tabular-nums" [class]="s.score >= 80 ? 'text-ok' : s.score >= 50 ? 'text-warn' : 'text-danger'">{{ s.score }}</span>
                  <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="technician.set(s.technician); team.set(s.team)">Select</button>
                </li>
              } @empty { <li class="px-3 py-4 text-center text-sm text-ink-muted">Loading suggestions…</li> }
            </ul>
          }
          @case ('reschedule') {
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <amc-form-field label="Original Date"><p class="text-sm text-ink">{{ o.originalDate }} · current {{ o.scheduledDate }}</p></amc-form-field>
              <amc-form-field label="Original Time Window"><p class="text-sm text-ink">{{ o.window }}</p></amc-form-field>
              <amc-form-field label="New Date" for="rs-date" [required]="true"><input id="rs-date" type="date" class="amc-input" [min]="minDate" [value]="newDate()" (input)="newDate.set($any($event.target).value)" /></amc-form-field>
              <amc-form-field label="New Time Window" for="rs-win"><amc-select inputId="rs-win" [options]="windowOptions" [(value)]="newWindow" /></amc-form-field>
              <amc-form-field label="Reschedule Reason" for="rs-reason" [required]="true"><amc-select inputId="rs-reason" [options]="reasonOptions" [(value)]="reason" /></amc-form-field>
              <amc-form-field label="Requested By" for="rs-by"><input id="rs-by" class="amc-input" [value]="requestedBy()" (input)="requestedBy.set($any($event.target).value)" /></amc-form-field>
              <div class="sm:col-span-2"><amc-switch [checked]="customerApproval()" (checkedChange)="customerApproval.set($event)" label="Customer approval obtained" [description]="'Required for moves of more than ' + approvalDays + ' days on customer-notified plans.'" /></div>
              <amc-form-field label="Notes" for="rs-notes" class="sm:col-span-2"><textarea id="rs-notes" class="amc-textarea min-h-14" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
            </div>
            @if (o.effectiveStatus === 'Overdue') { <p class="mt-3 rounded-lg bg-warn-subtle px-3 py-2 text-xs text-warn">This event is overdue. Rescheduling keeps the original due date, so the overdue condition is not removed.</p> }
            <p class="mt-2 text-xs text-ink-muted">Shift: {{ shift() }} day(s). The original planned date is preserved; SLA and AMC impact are evaluated and recorded.</p>
          }
          @case ('complete') {
            @if (plan(); as p) {
              <p class="amc-overline">Checklist — {{ checklistName() }}</p>
              <div class="mt-2 divide-y divide-line rounded-xl border border-line">
                @for (it of items(); track it.id) {
                  <div class="flex flex-wrap items-center gap-3 px-3 py-2">
                    <div class="min-w-0 flex-1"><p class="text-sm text-ink">{{ it.sequence }}. {{ it.task }}@if (it.required) { <span class="text-danger"> *</span> }</p><p class="text-xs text-ink-muted">{{ it.type }}{{ it.unit ? ' · ' + it.unit : '' }}{{ it.min !== null || it.max !== null ? ' · ' + (it.min ?? '—') + ' – ' + (it.max ?? '—') : '' }}</p></div>
                    @switch (it.type) {
                      @case ('Pass / Fail') { <amc-select class="w-32" [inputId]="'ck-' + it.id" [ariaLabel]="it.task" [options]="passFail" [value]="answer(it.id)" (valueChange)="setAnswer(it.id, $event)" /> }
                      @case ('Yes / No') { <amc-select class="w-32" [inputId]="'ck-' + it.id" [ariaLabel]="it.task" [options]="yesNo" [value]="answer(it.id)" (valueChange)="setAnswer(it.id, $event)" /> }
                      @case ('Selection') { <amc-select class="w-44" [inputId]="'ck-' + it.id" [ariaLabel]="it.task" [options]="optionsOf(it)" [value]="answer(it.id)" (valueChange)="setAnswer(it.id, $event)" /> }
                      @case ('Photo Required') { <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="setAnswer(it.id, 'Captured')"><amc-icon name="upload" [size]="14" /> {{ answer(it.id) ? 'Photo captured' : 'Capture photo' }}</button> }
                      @case ('Signature Required') { <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="setAnswer(it.id, 'Captured')"><amc-icon name="pen-tool" [size]="14" /> {{ answer(it.id) ? 'Signed' : 'Capture signature' }}</button> }
                      @case ('Text') { <input class="amc-input h-8 w-56" [attr.aria-label]="it.task" [value]="answer(it.id)" (input)="setAnswer(it.id, $any($event.target).value)" /> }
                      @default { <input type="number" class="amc-input h-8 w-32 tabular-nums" [attr.aria-label]="it.task" [value]="answer(it.id)" (input)="setAnswer(it.id, $any($event.target).value)" [class]="outOfRange(it) ? 'border-danger' : ''" /> }
                    }
                  </div>
                } @empty { <p class="px-3 py-4 text-sm text-ink-muted">No checklist on this plan.</p> }
              </div>
              <p class="amc-overline mt-4">Parts &amp; consumables used</p>
              <div class="mt-2 space-y-2">
                @for (u of partsUsed(); track $index; let i = $index) {
                  <div class="flex items-center gap-2">
                    <amc-select class="min-w-0 flex-1" [inputId]="'pu-' + i" ariaLabel="Part" [options]="refs.partOptions()" [value]="u.partNumber" (valueChange)="setPart(i, 'partNumber', $event)" />
                    <input type="number" min="0" class="amc-input h-9 w-24 tabular-nums" aria-label="Quantity" [value]="u.quantity" (input)="setPart(i, 'quantity', $any($event.target).value)" />
                    <button type="button" class="amc-btn-ghost amc-btn-sm" aria-label="Remove part" (click)="removePart(i)"><amc-icon name="x" [size]="14" /></button>
                  </div>
                }
                <button type="button" class="amc-btn-ghost amc-btn-sm" (click)="addPart()"><amc-icon name="plus" [size]="14" /> Add part</button>
              </div>
              <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <amc-form-field label="Actual Duration (minutes)" for="cp-dur" [required]="true"><input id="cp-dur" type="number" min="1" class="amc-input tabular-nums" [value]="duration()" (input)="duration.set(+$any($event.target).value || 0)" /></amc-form-field>
                <amc-form-field label="Asset Condition" for="cp-cond"><amc-select inputId="cp-cond" [options]="conditionOptions" [(value)]="condition" /></amc-form-field>
                <amc-form-field label="Completion Result" for="cp-res"><amc-select inputId="cp-res" [options]="resultOptions" [(value)]="result" /></amc-form-field>
                <amc-form-field label="Tools Used" for="cp-tools"><input id="cp-tools" class="amc-input" [value]="tools()" (input)="tools.set($any($event.target).value)" /></amc-form-field>
                <amc-form-field label="Defects Found" for="cp-def" class="sm:col-span-2"><input id="cp-def" class="amc-input" [value]="defects()" (input)="defects.set($any($event.target).value)" /></amc-form-field>
                <amc-form-field label="Recommendations" for="cp-rec" class="sm:col-span-3"><input id="cp-rec" class="amc-input" [value]="recommendations()" (input)="recommendations.set($any($event.target).value)" /></amc-form-field>
                <amc-form-field label="Technician Notes" for="cp-tn" class="sm:col-span-2"><textarea id="cp-tn" class="amc-textarea min-h-14" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
                <div class="space-y-2"><amc-switch [checked]="custSign()" (checkedChange)="custSign.set($event)" label="Customer signature" /><amc-switch [checked]="techSign()" (checkedChange)="techSign.set($event)" label="Technician signature" /></div>
              </div>
              <p class="mt-3 text-xs text-ink-muted">{{ p.procedure.taskIds.length }} task(s) recorded as performed. Failed items with defects, or a corrective / failed result, create a linked corrective work order. Parts used update inventory, and the next occurrence is calculated automatically.</p>
            } @else { <div class="flex justify-center p-6"><amc-spinner /></div> }
          }
          @case ('corrective') {
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <amc-form-field label="Defect" for="cw-def" [required]="true" class="sm:col-span-2"><input id="cw-def" class="amc-input" [value]="defects()" (input)="defects.set($any($event.target).value)" /></amc-form-field>
              <amc-form-field label="Severity" for="cw-sev"><amc-select inputId="cw-sev" [options]="severityOptions" [(value)]="severity" /></amc-form-field>
              <amc-form-field label="Priority" for="cw-prio"><amc-select inputId="cw-prio" [options]="priorityOptions" [(value)]="priority" /></amc-form-field>
              <amc-form-field label="Recommended Action" for="cw-act" class="sm:col-span-2"><input id="cw-act" class="amc-input" [value]="recommendations()" (input)="recommendations.set($any($event.target).value)" /></amc-form-field>
              <amc-form-field label="Required Part" for="cw-part"><amc-select inputId="cw-part" [options]="refs.partOptions()" [(value)]="part" [clearable]="true" /></amc-form-field>
              <amc-form-field label="Estimated Cost" for="cw-cost"><input id="cw-cost" type="number" min="0" class="amc-input tabular-nums" [value]="cost()" (input)="cost.set(+$any($event.target).value || 0)" /></amc-form-field>
              <amc-form-field label="Target Date" for="cw-date"><input id="cw-date" type="date" class="amc-input" [value]="newDate()" (input)="newDate.set($any($event.target).value)" /></amc-form-field>
            </div>
            <p class="mt-3 text-xs text-ink-muted">The corrective work order remains linked to {{ o.number }}.</p>
          }
          @case ('reason') { <amc-form-field label="Overdue Reason" for="od-reason"><amc-select inputId="od-reason" [options]="reasonOptions" [(value)]="reason" /></amc-form-field> }
          @default { <amc-form-field label="Reason" for="oc-reason" [required]="true"><textarea id="oc-reason" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field><p class="mt-2 text-xs text-ink-muted">The event stays in history. No replacement occurrence is generated automatically.</p> }
        }
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="mode.set(null)">Close</button>
        @if (mode() !== 'validate') { <button type="button" [class]="mode() === 'cancel' || mode() === 'miss' ? 'amc-btn-danger' : 'amc-btn-primary'" [disabled]="busy() || !valid()" (click)="confirm()">@if (busy()) { <amc-spinner [size]="14" /> } {{ confirmLabel() }}</button> }
      </ng-container>
    </amc-dialog>
  `,
})
export class OccurrenceActionHost {
  private readonly api = inject(ScheduleApi);
  private readonly woApi = inject(PmWorkOrderApi);
  private readonly planApi = inject(PlanApi);
  private readonly checklistApi = inject(ChecklistApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(PmReferenceStore);

  readonly done = output<void>();

  protected readonly mode = signal<Mode | null>(null);
  protected readonly target = signal<OccurrenceListItem | null>(null);
  protected readonly busy = signal(false);
  protected readonly validation = signal<PmValidation | null>(null);
  protected readonly suggestions = signal<{ technician: string; team: string; score: number; reasons: string[] }[]>([]);
  protected readonly plan = signal<PlanListItem | null>(null);
  protected readonly items = signal<readonly ChecklistItem[]>([]);
  protected readonly checklistName = signal('');
  protected readonly answers = signal<Record<string, string>>({});
  protected readonly partsUsed = signal<{ partNumber: string; quantity: number }[]>([]);
  protected readonly team = signal<string | number | null>(null);
  protected readonly technician = signal<string | number | null>(null);
  protected readonly newDate = signal('');
  protected readonly newWindow = signal<string | number | null>(null);
  protected readonly reason = signal<string | number | null>(null);
  protected readonly requestedBy = signal('Customer');
  protected readonly customerApproval = signal(false);
  protected readonly text = signal('');
  protected readonly duration = signal(60);
  protected readonly condition = signal<string | number | null>('Good');
  protected readonly result = signal<string | number | null>('Maintenance Completed Successfully');
  protected readonly tools = signal('');
  protected readonly defects = signal('');
  protected readonly recommendations = signal('');
  protected readonly custSign = signal(true);
  protected readonly techSign = signal(true);
  protected readonly severity = signal<string | number | null>('Medium');
  protected readonly priority = signal<string | number | null>('High');
  protected readonly part = signal<string | number | null>(null);
  protected readonly cost = signal(0);

  protected readonly minDate = today();
  protected readonly approvalDays = PM_RULES.customerApprovalDays;
  protected readonly windowOptions = toOptions(MAINTENANCE_WINDOWS);
  protected readonly reasonOptions = toOptions(OVERDUE_REASONS);
  protected readonly conditionOptions = toOptions(ASSET_CONDITIONS);
  protected readonly resultOptions = toOptions(COMPLETION_RESULTS);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly severityOptions = toOptions(['Low', 'Medium', 'High', 'Critical'] as const);
  protected readonly passFail = toOptions(['Pass', 'Fail'] as const);
  protected readonly yesNo = toOptions(['Yes', 'No'] as const);

  protected readonly title = computed(() => ({ validate: 'Maintenance validation', assign: 'Assign technician', reschedule: 'Reschedule maintenance', complete: 'Complete maintenance', corrective: 'Corrective work order', cancel: 'Cancel maintenance', miss: 'Mark maintenance missed', reason: 'Overdue reason' })[this.mode() ?? 'validate']);
  protected readonly confirmLabel = computed(() => ({ validate: '', assign: 'Assign', reschedule: 'Reschedule', complete: 'Complete', corrective: 'Create Work Order', cancel: 'Cancel Event', miss: 'Mark Missed', reason: 'Save' })[this.mode() ?? 'validate']);
  protected readonly shift = computed(() => (this.target() && this.newDate() ? daysBetweenIso(this.target()!.scheduledDate, this.newDate()) : 0));
  protected readonly valid = computed(() => {
    switch (this.mode()) {
      case 'assign':
        return !!this.team();
      case 'reschedule':
        return !!this.newDate() && !!this.reason();
      case 'complete':
        return this.duration() > 0 && !!this.plan();
      case 'corrective':
        return !!this.defects().trim();
      case 'reason':
        return !!this.reason();
      default:
        return !!this.text().trim();
    }
  });

  async run(action: string, o: OccurrenceListItem): Promise<void> {
    this.target.set(o);
    switch (action) {
      case 'accept':
      case 'reject':
      case 'confirm':
        return void this.exec(this.api.respond(o.id, action === 'accept' ? 'Accepted' : action === 'reject' ? 'Rejected' : 'Confirmed'), `${o.number}: ${action === 'confirm' ? 'schedule confirmed' : `technician ${action}ed`}.`);
      case 'start':
        return void this.exec(this.api.start(o.id), `${o.number} started.`);
      case 'wo':
        try {
          const n = await firstValueFrom(this.woApi.generate(o.id));
          this.notify.success(`${n} generated.`);
          this.done.emit();
        } catch (e) {
          this.notify.error((e as Error).message);
        }
        return;
      default:
        this.open(action as Mode, o);
    }
  }

  /** Drag & drop rescheduling from the calendar — opens the controlled reschedule dialog. */
  rescheduleTo(o: OccurrenceListItem, date: string): void {
    this.target.set(o);
    this.open('reschedule', o);
    this.newDate.set(date);
    this.reason.set('Scheduling Conflict');
  }

  private open(mode: Mode, o: OccurrenceListItem): void {
    this.text.set('');
    this.reason.set(o.overdueReason);
    this.defects.set('');
    this.recommendations.set('');
    if (mode === 'validate') {
      this.validation.set(null);
      void firstValueFrom(this.api.validate(o.id)).then((v) => this.validation.set(v));
    }
    if (mode === 'assign') {
      this.team.set(o.team);
      this.technician.set(o.technician);
      this.suggestions.set([]);
      void firstValueFrom(this.woApi.suggest(o.id)).then((s) => this.suggestions.set(s));
    }
    if (mode === 'reschedule') {
      this.newDate.set(addDays([o.scheduledDate, today()].sort().at(-1)!, 2));
      this.newWindow.set(o.window);
      this.requestedBy.set('Customer');
      this.customerApproval.set(false);
    }
    if (mode === 'corrective') {
      this.newDate.set(addDays(today(), 3));
      this.severity.set('Medium');
      this.priority.set('High');
      this.part.set(null);
      this.cost.set(0);
    }
    if (mode === 'complete') {
      this.plan.set(null);
      this.answers.set({});
      this.duration.set(60);
      this.condition.set('Good');
      this.result.set('Maintenance Completed Successfully');
      this.custSign.set(true);
      this.techSign.set(true);
      void Promise.all([firstValueFrom(this.planApi.get(o.planId)), firstValueFrom(this.checklistApi.list())]).then(([p, lists]) => {
        const cl = lists.find((c) => c.id === p.procedure.checklistId);
        this.items.set(cl?.items ?? []);
        this.checklistName.set(cl?.name ?? 'None');
        this.partsUsed.set(p.parts.required.map((r) => ({ ...r })));
        this.tools.set(p.resources.tools);
        this.plan.set(p);
      });
    }
    this.mode.set(mode);
  }

  protected answer(id: string): string {
    return this.answers()[id] ?? '';
  }

  protected setAnswer(id: string, value: string | number | null): void {
    this.answers.update((a) => ({ ...a, [id]: value === null ? '' : String(value) }));
  }

  protected optionsOf(it: ChecklistItem) {
    return it.options.map((o) => ({ value: o, label: o }));
  }

  protected outOfRange(it: ChecklistItem): boolean {
    const raw = this.answer(it.id);
    if (raw === '') return false;
    const v = Number(raw);
    return (it.min !== null && v < it.min) || (it.max !== null && v > it.max);
  }

  protected addPart(): void {
    this.partsUsed.update((l) => [...l, { partNumber: '', quantity: 1 }]);
  }

  protected removePart(i: number): void {
    this.partsUsed.update((l) => l.filter((_, idx) => idx !== i));
  }

  protected setPart(i: number, key: 'partNumber' | 'quantity', value: string | number | null): void {
    this.partsUsed.update((l) => l.map((u, idx) => (idx === i ? { ...u, [key]: key === 'quantity' ? Number(value) || 0 : String(value ?? '') } : u)));
  }

  protected async confirm(): Promise<void> {
    const o = this.target();
    const mode = this.mode();
    if (!o || !mode) return;
    let work: Observable<unknown>;
    let message: string;
    switch (mode) {
      case 'assign':
        work = this.api.assign(o.id, { team: String(this.team()), technician: this.technician() ? String(this.technician()) : null });
        message = `${o.number} assigned.`;
        break;
      case 'reschedule':
        work = this.api.reschedule(o.id, { toDate: this.newDate(), toWindow: String(this.newWindow() ?? o.window), reason: String(this.reason()), requestedBy: this.requestedBy(), customerApproval: this.customerApproval(), notes: this.text() });
        message = `${o.number} rescheduled to ${this.newDate()}.`;
        break;
      case 'complete': {
        const now = new Date();
        work = this.api.complete(o.id, {
          startedAt: new Date(now.getTime() - this.duration() * 60_000).toISOString(), endedAt: now.toISOString(), durationMinutes: this.duration(), checklist: this.items().map((i) => ({ itemId: i.id, value: this.answer(i.id), pass: null })), tasksDone: this.plan()!.procedure.taskIds,
          partsUsed: this.partsUsed().filter((u) => u.partNumber && u.quantity > 0), toolsUsed: this.tools(), assetCondition: String(this.condition()), defects: this.defects(), correctiveActions: '', recommendations: this.recommendations(), technicianNotes: this.text(), customerNotes: '',
          customerSignature: this.custSign(), technicianSignature: this.techSign(), photos: Object.values(this.answers()).filter((a) => a === 'Captured').length, result: this.result() as CompletionResult,
        });
        message = `${o.number} completed — next occurrence calculated.`;
        break;
      }
      case 'corrective':
        work = this.api.corrective(o.id, { defect: this.defects(), severity: String(this.severity()), priority: String(this.priority()), recommendedAction: this.recommendations(), partNumber: this.part() ? String(this.part()) : null, skill: '', estimatedCost: this.cost(), targetDate: this.newDate() });
        message = 'Corrective work order created.';
        break;
      case 'reason':
        work = this.api.setOverdueReason(o.id, String(this.reason()));
        message = 'Overdue reason recorded.';
        break;
      case 'miss':
        work = this.api.miss(o.id, this.text());
        message = `${o.number} marked missed.`;
        break;
      default:
        work = this.api.cancel(o.id, this.text());
        message = `${o.number} cancelled.`;
    }
    if (await this.exec(work, message)) this.mode.set(null);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.done.emit();
      this.refs.refresh();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
