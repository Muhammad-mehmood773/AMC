import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { Dialog } from '@shared/ui/dialog';
import { FormField } from '@shared/ui/form-field';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { Switch } from '@shared/ui/form-controls';
import { type Observable, firstValueFrom } from 'rxjs';
import { SrReferenceStore } from '../data/sr-reference.store';
import { RequestApi } from '../data/sr.api';
import { APPOINTMENT_TYPES, CANCEL_REASONS, ESCALATION_ACTIONS, ESCALATION_LEVELS, HOLD_REASONS, REOPEN_REASONS, RESOLUTION_CATEGORIES, RESOLUTION_CODES, type RequestListItem } from '../models/request.model';

export type RequestAction = 'assign' | 'autoassign' | 'schedule' | 'start' | 'escalate' | 'hold' | 'resume' | 'resolve' | 'confirm' | 'close' | 'reopen' | 'cancel' | 'reject' | 'workorder' | 'complete-wo' | 'note' | 'attachment' | 'coverage' | 'classify' | 'priority' | 'sla' | 'validate' | 'merge';
type Mode = Exclude<RequestAction, 'autoassign' | 'resume' | 'start' | 'workorder' | 'sla' | 'validate'>;

/** Status-aware row actions for service requests (SRS 9.5 / 9.17). */
export function requestActions(r: RequestListItem, canMerge = true): MenuItem[] {
  const open = ['New', 'Under Validation', 'Validated', 'Assigned', 'Scheduled', 'In Progress', 'Pending', 'Reopened'].includes(r.status);
  const active = ['Validated', 'Assigned', 'Scheduled', 'In Progress', 'Reopened'].includes(r.status);
  const items: MenuItem[] = [{ id: 'view', label: 'View', icon: 'eye' as const }, { id: 'edit', label: 'Edit', icon: 'pencil' as const, disabled: !open }];
  if (['Validated', 'Reopened'].includes(r.status) || (active && !r.assignment.technician)) items.push({ id: 'assign', label: r.assignment.technician ? 'Reassign' : 'Assign', icon: 'user-check' as const, dividerBefore: true });
  if (active && r.assignment.technician) items.push({ id: 'autoassign', label: 'Reassign (automatic)', icon: 'refresh' as const });
  if (active && r.assignment.technician) items.push({ id: 'schedule', label: r.schedule ? 'Reschedule' : 'Schedule', icon: 'calendar' as const });
  if (['Assigned', 'Scheduled', 'Reopened'].includes(r.status)) items.push({ id: 'start', label: 'Start', icon: 'play' as const });
  if (active) items.push({ id: 'workorder', label: 'Convert to Work Order', icon: 'wrench' as const }, { id: 'escalate', label: 'Escalate', icon: 'alert-triangle' as const, dividerBefore: true });
  if (r.status === 'In Progress' || r.status === 'Scheduled' || r.status === 'Assigned' || r.status === 'Validated') items.push({ id: 'hold', label: 'Put On Hold', icon: 'pause' as const });
  if (r.status === 'Pending') items.push({ id: 'resume', label: 'Resume', icon: 'play' as const });
  if (['Assigned', 'Scheduled', 'In Progress', 'Reopened'].includes(r.status)) items.push({ id: 'resolve', label: 'Resolve', icon: 'check-circle' as const });
  if (r.status === 'Resolved') items.push({ id: 'confirm', label: 'Customer Confirmation', icon: 'pen-tool' as const }, { id: 'close', label: 'Close', icon: 'lock' as const });
  if (['Resolved', 'Closed'].includes(r.status)) items.push({ id: 'reopen', label: 'Reopen', icon: 'rotate-ccw' as const, dividerBefore: true });
  if (open) items.push({ id: 'merge', label: 'Link / Merge Duplicate', icon: 'layers' as const, disabled: !canMerge, dividerBefore: true }, { id: 'note', label: 'Add Note', icon: 'sticky-note' as const }, { id: 'attachment', label: 'Add Attachment', icon: 'paperclip' as const }, { id: 'cancel', label: 'Cancel', icon: 'ban' as const, dividerBefore: true });
  if (['New', 'Under Validation', 'Validated'].includes(r.status)) items.push({ id: 'reject', label: 'Reject', icon: 'x' as const, danger: true });
  return items;
}

@Component({
  selector: 'amc-request-action-host',
  imports: [Dialog, FormField, Select, Spinner, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog size="md" [title]="title()" [description]="target() ? target()!.number + ' — ' + target()!.subject : ''" [open]="!!mode()" (openChange)="!$event && mode.set(null)">
      @switch (mode()) {
        @case ('assign') {
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <amc-form-field label="Team" for="ra-team" [required]="true"><amc-select inputId="ra-team" [options]="refs.teamOptions()" [(value)]="team" /></amc-form-field>
            <amc-form-field label="Technician" for="ra-tech"><amc-select inputId="ra-tech" [options]="techOptions()" [(value)]="technician" [clearable]="true" /></amc-form-field>
            <amc-form-field label="Method" for="ra-method"><amc-select inputId="ra-method" [options]="methodOptions" [(value)]="method" /></amc-form-field>
            <amc-form-field label="Reason" for="ra-reason"><input id="ra-reason" class="amc-input" [value]="reason()" (input)="reason.set($any($event.target).value)" /></amc-form-field>
          </div>
          @if (target()?.classification.requiredSkill) { <p class="mt-3 rounded-lg bg-brand-subtle px-3 py-2 text-xs text-brand">Required skill: {{ target()!.classification.requiredSkill }} · territory {{ target()!.region || 'any' }}. Technicians without the skill are flagged.</p> }
        }
        @case ('schedule') {
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <amc-form-field label="Scheduled Date" for="rs-date" [required]="true"><input id="rs-date" type="date" class="amc-input" [value]="schedDate()" (input)="schedDate.set($any($event.target).value)" /></amc-form-field>
            <amc-form-field label="Appointment Type" for="rs-type"><amc-select inputId="rs-type" [options]="appointmentOptions" [(value)]="apptType" /></amc-form-field>
            <amc-form-field label="Start Time" for="rs-start" [required]="true"><input id="rs-start" type="time" class="amc-input" [value]="startTime()" (input)="startTime.set($any($event.target).value)" /></amc-form-field>
            <amc-form-field label="End Time" for="rs-end" [required]="true"><input id="rs-end" type="time" class="amc-input" [value]="endTime()" (input)="endTime.set($any($event.target).value)" /></amc-form-field>
            <amc-form-field label="Customer Availability" for="rs-avail"><amc-select inputId="rs-avail" [options]="visitOptions" [(value)]="availability" /></amc-form-field>
            <amc-form-field label="Reason" for="rs-reason"><input id="rs-reason" class="amc-input" [value]="reason()" (input)="reason.set($any($event.target).value)" /></amc-form-field>
          </div>
        }
        @case ('escalate') {
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <amc-form-field label="Level" for="re-level" [required]="true"><amc-select inputId="re-level" [options]="levelOptions" [(value)]="level" /></amc-form-field>
            <amc-form-field label="Action" for="re-action"><amc-select inputId="re-action" [options]="escActionOptions" [(value)]="escAction" /></amc-form-field>
          </div>
          <amc-form-field label="Reason" for="re-reason" [required]="true" class="mt-4"><textarea id="re-reason" class="amc-textarea" [value]="reason()" (input)="reason.set($any($event.target).value)"></textarea></amc-form-field>
        }
        @case ('hold') {
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <amc-form-field label="Hold Reason" for="rh-reason" [required]="true"><amc-select inputId="rh-reason" [options]="holdOptions" [(value)]="holdReason" /></amc-form-field>
            <amc-form-field label="Expected Resume Date" for="rh-resume"><input id="rh-resume" type="date" class="amc-input" [value]="resumeDate()" (input)="resumeDate.set($any($event.target).value)" /></amc-form-field>
            <amc-form-field label="Responsible Party" for="rh-owner"><input id="rh-owner" class="amc-input" [value]="responsible()" (input)="responsible.set($any($event.target).value)" /></amc-form-field>
          </div>
          <amc-form-field label="Notes" for="rh-notes" class="mt-4"><textarea id="rh-notes" class="amc-textarea" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea></amc-form-field>
          <p class="mt-2 text-xs text-ink-muted">{{ slaPause() ? 'This is an approved pause reason — the SLA clock pauses.' : 'Not an approved pause reason — the SLA clock continues.' }}</p>
        }
        @case ('resolve') {
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <amc-form-field label="Resolution Code" for="rr-code" [required]="true"><amc-select inputId="rr-code" [options]="codeOptions" [(value)]="resCode" /></amc-form-field>
            <amc-form-field label="Resolution Category" for="rr-cat" [required]="true"><amc-select inputId="rr-cat" [options]="resCategoryOptions" [(value)]="resCategory" /></amc-form-field>
            <amc-form-field label="Root Cause" for="rr-root"><input id="rr-root" class="amc-input" [value]="rootCause()" (input)="rootCause.set($any($event.target).value)" /></amc-form-field>
            <amc-form-field label="Labour Used (min)" for="rr-labour"><input id="rr-labour" type="number" min="0" class="amc-input tabular-nums" [value]="labour()" (input)="labour.set(+$any($event.target).value || 0)" /></amc-form-field>
          </div>
          <amc-form-field label="Resolution Description" for="rr-desc" [required]="true" class="mt-4"><textarea id="rr-desc" class="amc-textarea" [value]="resDesc()" (input)="resDesc.set($any($event.target).value)"></textarea></amc-form-field>
          <amc-form-field label="Corrective Action" for="rr-corr" class="mt-4"><input id="rr-corr" class="amc-input" [value]="corrective()" (input)="corrective.set($any($event.target).value)" /></amc-form-field>
          <amc-form-field label="Preventive Recommendation" for="rr-prev" class="mt-4"><input id="rr-prev" class="amc-input" [value]="recommendation()" (input)="recommendation.set($any($event.target).value)" /></amc-form-field>
          <amc-form-field label="Technician Findings" for="rr-find" class="mt-4"><textarea id="rr-find" class="amc-textarea min-h-12" [value]="findings()" (input)="findings.set($any($event.target).value)"></textarea></amc-form-field>
        }
        @case ('reopen') {
          <amc-form-field label="Reopen Reason" for="ro-reason" [required]="true"><amc-select inputId="ro-reason" [options]="reopenOptions" [(value)]="reopenReason" /></amc-form-field>
          <amc-form-field label="Comments" for="ro-comment" class="mt-4"><textarea id="ro-comment" class="amc-textarea" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea></amc-form-field>
          <p class="mt-2 text-xs text-ink-muted">The previous resolution is retained in history and the SLA clock resumes.</p>
        }
        @case ('cancel') {
          <amc-form-field label="Cancellation Reason" for="rc-reason" [required]="true"><amc-select inputId="rc-reason" [options]="cancelOptions" [(value)]="cancelReason" /></amc-form-field>
          <amc-form-field label="Comment" for="rc-comment" class="mt-4"><textarea id="rc-comment" class="amc-textarea" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea></amc-form-field>
        }
        @case ('reject') {
          <amc-form-field label="Rejection Reason" for="rj-reason" [required]="true"><textarea id="rj-reason" class="amc-textarea" [value]="reason()" (input)="reason.set($any($event.target).value)"></textarea></amc-form-field>
        }
        @case ('confirm') {
          <amc-form-field label="Confirmed By" for="cf-by" [required]="true"><input id="cf-by" class="amc-input" [value]="confirmedBy()" (input)="confirmedBy.set($any($event.target).value)" /></amc-form-field>
          <div class="mt-3"><amc-switch [(checked)]="doConfirm" label="Customer accepts the resolution" /></div>
          <amc-form-field label="Customer Comment" for="cf-comment" class="mt-4"><textarea id="cf-comment" class="amc-textarea" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea></amc-form-field>
          @if (!doConfirm()) { <p class="mt-2 text-xs text-warn">If the customer does not accept, the request is reopened instead of closed.</p> }
        }
        @case ('close') {
          @if (target(); as t) {
            <p class="text-sm text-ink">Closing <strong>{{ t.number }}</strong> requires resolution details{{ t.coverage.requiresCustomerConfirmation ? ', customer confirmation' : '' }} and no open work order.</p>
          }
          <amc-form-field label="Closure Notes" for="cl-notes" class="mt-4"><textarea id="cl-notes" class="amc-textarea" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea></amc-form-field>
        }
        @case ('classify') {
          <p class="text-sm text-ink-muted">Change classification and priority on the Classification screen of this request, or use "Change priority" for a quick override with a reason.</p>
        }
        @case ('note') {
          <div class="flex flex-wrap items-end gap-3">
            <amc-form-field label="Type" for="rn-type" class="w-48"><amc-select inputId="rn-type" [options]="noteTypes" [(value)]="noteType" /></amc-form-field>
            <amc-switch [(checked)]="customerVisible" label="Customer visible" />
            <amc-form-field label="Follow-up Date" for="rn-fu" class="w-44"><input id="rn-fu" type="date" class="amc-input" [value]="followUp()" (input)="followUp.set($any($event.target).value)" /></amc-form-field>
          </div>
          <amc-form-field label="Message" for="rn-msg" [required]="true" class="mt-4"><textarea id="rn-msg" class="amc-textarea" [value]="message()" (input)="message.set($any($event.target).value)"></textarea></amc-form-field>
        }
        @case ('attachment') {
          <div class="flex flex-wrap items-end gap-3">
            <amc-form-field label="Kind" for="rf-kind" class="w-44"><amc-select inputId="rf-kind" [options]="kindOptions" [(value)]="kind" /></amc-form-field>
            <amc-switch [(checked)]="customerVisible" label="Customer visible" />
          </div>
          <amc-form-field label="File" for="rf-file" [required]="true" class="mt-4"><input id="rf-file" type="file" class="amc-input" (change)="file.set($any($event.target).files?.[0] ?? null)" /></amc-form-field>
        }
        @case ('coverage') {
          @if (target(); as t) {
            <p class="text-sm text-ink">Coverage result: <strong>{{ t.coverage.result }}</strong>{{ t.coverage.chargeable ? ' — chargeable service' : '' }}.</p>
            @if (t.coverage.chargeable) { <p class="mt-2 text-sm text-ink-muted">Non-covered work needs the customer's approval before assignment or a billable work order. Approve the quotation or reject it.</p> }
            <amc-form-field label="Comment" for="cv-comment" class="mt-4"><textarea id="cv-comment" class="amc-textarea" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea></amc-form-field>
          }
        }
        @case ('complete-wo') {
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <amc-form-field label="Labour Used (min)" for="wo-labour" [required]="true"><input id="wo-labour" type="number" min="1" class="amc-input tabular-nums" [value]="labour()" (input)="labour.set(+$any($event.target).value || 0)" /></amc-form-field>
            <amc-form-field label="Checklist Completed" for="wo-check"><amc-switch [checked]="checklist()" (checkedChange)="checklist.set($event)" label="Required checklist completed" /></amc-form-field>
          </div>
          <div class="mt-3 space-y-2">
            @for (p of parts(); track $index) {
              <div class="flex items-end gap-2">
                <amc-form-field label="Part" [for]="'wp-' + $index" class="flex-1"><amc-select [inputId]="'wp-' + $index" [options]="refs.partOptions()" [value]="p.partNumber" (valueChange)="patchPart($index, 'partNumber', $any($event))" /></amc-form-field>
                <amc-form-field label="Qty" [for]="'wq-' + $index" class="w-20"><input [id]="'wq-' + $index" type="number" min="1" class="amc-input tabular-nums" [value]="p.quantity" (input)="patchPart($index, 'quantity', +$any($event.target).value)" /></amc-form-field>
                <button type="button" class="amc-btn-ghost amc-btn-sm" aria-label="Remove part" (click)="removePart($index)">✕</button>
              </div>
            }
            <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="addPart()">+ Add part</button>
          </div>
        }
        @case ('priority') {
          <amc-form-field label="Priority" for="rp-p" [required]="true"><amc-select inputId="rp-p" [options]="priorityOptions" [(value)]="priority" /></amc-form-field>
          <amc-form-field label="Reason" for="rp-r" [required]="true" class="mt-4"><input id="rp-r" class="amc-input" [value]="reason()" (input)="reason.set($any($event.target).value)" /></amc-form-field>
          @if (target(); as t) { <p class="mt-2 text-xs text-ink-muted">Current: {{ t.priority }}. Suggestion: {{ t.priorityReason }}</p> }
        }
        @case ('merge') {
          <amc-form-field label="Duplicate Of" for="md-into" [required]="true"><amc-select inputId="md-into" [options]="mergeOptions()" [(value)]="mergeInto" /></amc-form-field>
          <div class="mt-3 flex items-center gap-2"><amc-switch [(checked)]="doMerge" label="Merge into that request (supervisor only — keeps this record as Cancelled)" /></div>
        }
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="mode.set(null)">Cancel</button>
        @if (mode() === 'coverage') {
          <button type="button" class="amc-btn-secondary" [disabled]="busy()" (click)="decide(false)">Decline</button>
          <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="decide(true)">Approve & Continue</button>
        } @else {
          <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="apply()">@if (busy()) { <amc-spinner [size]="14" /> } Confirm</button>
        }
      </ng-container>
    </amc-dialog>
  `,
})
export class RequestActionHost {
  private readonly api = inject(RequestApi);
  protected readonly refs = inject(SrReferenceStore);
  private readonly notify = inject(NotificationPort);
  readonly done = output<void>();

  protected readonly target = signal<RequestListItem | null>(null);
  protected readonly mode = signal<Mode | null>(null);
  protected readonly busy = signal(false);
  protected readonly team = signal<string | number | null>(null);
  protected readonly technician = signal<string | number | null>(null);
  protected readonly method = signal<string | number | null>('Manual Assignment');
  protected readonly reason = signal('');
  protected readonly schedDate = signal('');
  protected readonly startTime = signal('09:00');
  protected readonly endTime = signal('11:00');
  protected readonly apptType = signal<string | number | null>('On-Site Visit');
  protected readonly availability = signal<string | number | null>('Business hours');
  protected readonly level = signal<string | number | null>(ESCALATION_LEVELS[0]);
  protected readonly escAction = signal<string | number | null>('Notification');
  protected readonly holdReason = signal<string | number | null>('Waiting for Customer');
  protected readonly resumeDate = signal('');
  protected readonly responsible = signal('');
  protected readonly resCode = signal<string | number | null>('Repaired');
  protected readonly resCategory = signal<string | number | null>('Fixed');
  protected readonly rootCause = signal('');
  protected readonly corrective = signal('');
  protected readonly recommendation = signal('');
  protected readonly findings = signal('');
  protected readonly resDesc = signal('');
  protected readonly labour = signal(60);
  protected readonly checklist = signal(true);
  protected readonly parts = signal<{ partNumber: string; quantity: number }[]>([]);
  protected readonly notes = signal('');
  protected readonly reopenReason = signal<string | number | null>('Issue Not Resolved');
  protected readonly cancelReason = signal<string | number | null>('Other');
  protected readonly noteType = signal<string | number | null>('Internal Note');
  protected readonly message = signal('');
  protected readonly followUp = signal('');
  protected readonly customerVisible = signal(false);
  protected readonly kind = signal<string | number | null>('Image');
  protected readonly file = signal<File | null>(null);
  protected readonly priority = signal<string | number | null>(null);
  protected readonly mergeInto = signal<string | number | null>(null);
  protected readonly doMerge = signal(false);
  protected readonly doConfirm = signal(true);
  protected readonly confirmedBy = signal('');
  protected readonly title = computed(() => ({ assign: 'Assign request', schedule: this.target()?.schedule ? 'Reschedule appointment' : 'Schedule appointment', escalate: 'Escalate request', hold: 'Put on hold', resolve: 'Resolve request', confirm: 'Customer confirmation', close: 'Close request', reopen: 'Reopen request', cancel: 'Cancel request', reject: 'Reject request', note: 'Add activity', attachment: 'Add attachment', coverage: 'Coverage / chargeable approval', 'complete-wo': 'Complete work order', priority: 'Change priority', classify: 'Classification', merge: 'Link / merge duplicate' })[this.mode() ?? 'assign'] ?? 'Request');

  protected readonly methodOptions = toOptions(['Manual Assignment', 'Team-Based Assignment', 'Skill-Based Assignment', 'Location-Based Assignment', 'Asset-Based Assignment', 'Category-Based Assignment', 'Workload-Based Assignment', 'Automatic Assignment'] as const);
  protected readonly appointmentOptions = toOptions(APPOINTMENT_TYPES);
  protected readonly visitOptions = toOptions(['Business hours', 'After hours', 'Weekend', 'Any time'] as const);
  protected readonly levelOptions = toOptions(ESCALATION_LEVELS);
  protected readonly escActionOptions = toOptions(ESCALATION_ACTIONS);
  protected readonly holdOptions = toOptions(HOLD_REASONS);
  protected readonly codeOptions = toOptions(RESOLUTION_CODES);
  protected readonly resCategoryOptions = toOptions(RESOLUTION_CATEGORIES);
  protected readonly reopenOptions = toOptions(REOPEN_REASONS);
  protected readonly cancelOptions = toOptions(CANCEL_REASONS);
  protected readonly noteTypes = toOptions(['Customer Call', 'Email', 'SMS', 'Portal Message', 'Internal Note', 'Technician Note', 'Dispatcher Note', 'Customer Comment'] as const);
  protected readonly kindOptions = toOptions(['Image', 'Video', 'Document', 'Evidence'] as const);
  protected readonly priorityOptions = toOptions(['Critical', 'High', 'Medium', 'Low'] as const);
  protected readonly techOptions = computed(() => {
    const t = this.target();
    if (!t) return this.refs.technicianOptions();
    const skill = t.classification.requiredSkill;
    return this.refs.data().technicians.filter((x) => (!this.team() || x.team === this.team()) && (!t.region || x.region === t.region)).map((x) => ({ value: x.name, label: x.name, hint: `${x.region} · ${skill && x.skills.includes(skill) ? 'has skill' : skill ? 'no ' + skill : ''}` }));
  });
  protected readonly mergeOptions = computed(() => {
    const t = this.target();
    return (t?.linkedRequestIds ?? []).map((id) => ({ value: id, label: id }));
  });
  protected readonly slaPause = computed(() => ['Waiting for Customer', 'Waiting for Parts', 'Waiting for Approval', 'Waiting for Site Access', 'Waiting for Vendor'].includes(String(this.holdReason())));

  async run(action: string, r: RequestListItem): Promise<void> {
    this.target.set(r);
    if (action === 'view' || action === 'edit') return;
    if (action === 'autoassign') return this.exec(this.api.autoAssign(r.id), 'Assigned automatically.');
    if (action === 'start') return this.exec(this.api.start(r.id), `${r.number} started.`);
    if (action === 'resume') return this.exec(this.api.resume(r.id, ''), `${r.number} resumed.`);
    if (action === 'workorder') return this.exec(this.api.createWorkOrder(r.id), 'Work order created.');
    if (action === 'sla') return this.exec(this.api.applySla(r.id), 'SLA recalculated.');
    if (action === 'validate') return this.exec(this.api.validateCoverage(r.id), 'Coverage re-validated.');
    this.preset(r);
    this.mode.set(action as Mode);
  }

  private preset(r: RequestListItem): void {
    this.team.set(r.assignment.team);
    this.technician.set(r.assignment.technician);
    this.reason.set('');
    this.notes.set('');
    this.schedDate.set(r.schedule?.scheduledDate ?? new Date().toISOString().slice(0, 10));
    this.priority.set(r.priority);
    this.confirmedBy.set(r.customer.contactName);
    this.mergeInto.set(r.linkedRequestIds[0] ?? null);
  }

  protected decide(approve: boolean): void {
    const r = this.target();
    if (!r) return;
    void this.exec(this.api.decideChargeable(r.id, approve, this.notes()), approve ? 'Approved — request validated.' : 'Declined — request rejected.');
  }

  protected async apply(): Promise<void> {
    const r = this.target();
    const m = this.mode();
    if (!r || !m) return;
    const work = this.work(r, m);
    if (work instanceof Error) return this.notify.error(work.message);
    await this.exec(work, this.successMessage(m));
  }

  private work(r: RequestListItem, m: Mode): ReturnType<RequestApi['assign']> | Error | ReturnType<RequestApi['update']> {
    switch (m) {
      case 'assign': {
        if (!this.team()) return new Error('Select a team.');
        return this.api.assign(r.id, { team: String(this.team()), technician: this.technician() ? String(this.technician()) : null, dispatcher: null, method: String(this.method() ?? 'Manual Assignment'), reason: this.reason() });
      }
      case 'schedule':
        return this.api.schedule(r.id, { scheduledDate: this.schedDate(), startTime: this.startTime(), endTime: this.endTime(), durationMinutes: Math.max(0, (+this.endTime().slice(0, 2) * 60 + +this.endTime().slice(3)) - (+this.startTime().slice(0, 2) * 60 + +this.startTime().slice(3))), appointmentType: String(this.apptType() ?? 'On-Site Visit'), customerAvailability: String(this.availability() ?? ''), access: r.location.accessInstructions }, this.reason());
      case 'escalate': {
        const lvl = ESCALATION_LEVELS.indexOf(String(this.level()) as never) + 1;
        return this.api.escalate(r.id, lvl || 1, this.reason(), String(this.escAction() ?? 'Notification'));
      }
      case 'hold':
        return this.api.hold(r.id, { reason: String(this.holdReason()) as never, expectedResume: this.resumeDate() || null, notes: this.notes(), responsible: this.responsible() || this.refs.data().currentUser.name });
      case 'resolve':
        return this.api.resolve(r.id, { code: String(this.resCode()), category: String(this.resCategory()), description: this.resDesc(), rootCause: this.rootCause(), correctiveAction: this.corrective(), recommendation: this.recommendation(), findings: this.findings(), labourMinutes: this.labour() });
      case 'confirm':
        return this.api.confirm(r.id, this.doConfirm(), this.confirmedBy(), this.notes());
      case 'close':
        return this.api.close(r.id, this.notes());
      case 'reopen':
        return this.api.reopen(r.id, String(this.reopenReason()), this.notes());
      case 'cancel':
        return this.api.cancel(r.id, String(this.cancelReason()), this.notes());
      case 'reject':
        return this.api.reject(r.id, this.reason());
      case 'note':
        return this.api.addActivity(r.id, { type: String(this.noteType()) as never, direction: this.customerVisible() ? 'Outbound' : 'Internal', message: this.message(), attachment: null, followUp: this.followUp() || null, visibility: this.customerVisible() ? 'Customer Visible' : 'Internal Only' });
      case 'attachment': {
        const f = this.file();
        return f ? this.api.addAttachment(r.id, { name: f.name, size: f.size, kind: String(this.kind()) as never, visibility: this.customerVisible() ? 'Customer Visible' : 'Internal Only' }) : new Error('Choose a file.');
      }
      case 'complete-wo': {
        const wo = r.workOrders.find((w) => !['Completed', 'Cancelled'].includes(w.status));
        return wo ? this.api.completeWorkOrder(r.id, wo.id, { labourMinutes: this.labour(), parts: this.parts().filter((p) => p.partNumber).map((p) => ({ partNumber: p.partNumber, description: this.refs.data().parts.find((x) => x.partNumber === p.partNumber)?.description ?? '', quantity: p.quantity, unitCost: this.refs.data().parts.find((x) => x.partNumber === p.partNumber)?.unitCost ?? 0 })), checklistCompleted: this.checklist() }) : new Error('No open work order.');
      }
      case 'priority':
        return this.api.setPriority(r.id, String(this.priority()) as never, this.reason());
      case 'merge':
        return this.mergeInto() ? this.api.linkDuplicate(r.id, String(this.mergeInto()), this.doMerge()) : new Error('Select the request this is a duplicate of.');
      default:
        return new Error('Unsupported action.');
    }
  }

  private successMessage(m: Mode): string {
    return { assign: 'Request assigned.', schedule: 'Appointment scheduled.', escalate: 'Escalated.', hold: 'Request on hold.', resolve: 'Request resolved.', confirm: 'Customer confirmation recorded.', close: 'Request closed.', reopen: 'Request reopened.', cancel: 'Request cancelled.', reject: 'Request rejected.', note: 'Activity added.', attachment: 'Attachment added.', coverage: 'Coverage updated.', 'complete-wo': 'Work order completed.', priority: 'Priority updated.', classify: '', merge: 'Request updated.' }[m];
  }

  private async exec<T>(work: Observable<T>, ok: string): Promise<void> {
    this.busy.set(true);
    try {
      const result = await firstValueFrom(work);
      this.notify.success(typeof result === 'string' && result ? `Work order ${result} created.` : ok);
      this.mode.set(null);
      this.done.emit();
    } catch (e) {
      this.notify.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected addPart(): void {
    this.parts.update((l) => [...l, { partNumber: '', quantity: 1 }]);
  }

  protected removePart(i: number): void {
    this.parts.update((l) => l.filter((_, idx) => idx !== i));
  }

  protected patchPart(i: number, k: 'partNumber' | 'quantity', v: string | number): void {
    this.parts.update((l) => l.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  }
}
