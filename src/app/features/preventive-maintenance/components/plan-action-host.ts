import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { Dialog } from '@shared/ui/dialog';
import { FormField } from '@shared/ui/form-field';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { formatCurrency } from '@shared/utils/format';
import { type Observable, firstValueFrom } from 'rxjs';
import { PmReferenceStore } from '../data/pm-reference.store';
import { PlanApi, ScheduleApi } from '../data/pm.api';
import { today } from '../data/pm-recurrence';
import type { PlanReview } from '../models/operations.model';
import { EDITABLE_PLAN_STATUSES, FREQUENCY_TYPES, MAINTENANCE_WINDOWS, type PlanListItem } from '../models/plan.model';

type Mode = 'approve' | 'suspend' | 'review';

/** Status-aware plan actions (SRS 8.5 / 8.7). */
export function planActions(p: PlanListItem, full = false): MenuItem[] {
  const editable = EDITABLE_PLAN_STATUSES.includes(p.status);
  const timeBased = p.strategy.strategy === 'Time-Based' || p.strategy.strategy === 'Calendar-Based';
  return [
    ...(full ? [{ id: 'view', label: 'View', icon: 'eye' as const }] : []),
    ...(editable && full ? [{ id: 'edit', label: 'Edit', icon: 'pencil' as const }] : []),
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    ...(p.status === 'Active' && timeBased ? [{ id: 'schedule', label: 'Schedule (generate)', icon: 'calendar-check' as const, dividerBefore: true }] : []),
    ...(p.status === 'Active' ? [{ id: 'generate-wo', label: 'Generate Work Order', icon: 'wrench' as const }] : []),
    ...(p.status === 'Draft' ? [{ id: 'submit', label: 'Submit for Approval', icon: 'send' as const, dividerBefore: true }] : []),
    ...(p.status === 'Under Review' ? [{ id: 'approve', label: 'Approve / Reject', icon: 'check-circle' as const, dividerBefore: true }] : []),
    ...(['Draft', 'Under Review', 'Approved'].includes(p.status) ? [{ id: 'activate', label: 'Activate', icon: 'play' as const }] : []),
    ...(p.status === 'Active' ? [{ id: 'pause', label: 'Pause (Suspend)', icon: 'pause' as const, dividerBefore: true }] : []),
    ...(p.status === 'Suspended' ? [{ id: 'resume', label: 'Resume', icon: 'play' as const, dividerBefore: true }] : []),
    ...(editable ? [{ id: 'review', label: 'Plan Review', icon: 'refresh' as const }] : []),
    { id: 'history', label: 'View History', icon: 'history', dividerBefore: true },
    ...(p.assetIds.length === 1 ? [{ id: 'asset', label: 'View Asset', icon: 'box' as const }] : []),
  ];
}

@Component({
  selector: 'amc-plan-action-host',
  imports: [Dialog, FormField, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog [size]="mode() === 'review' ? 'lg' : 'md'" [title]="title()" [description]="target() ? target()!.number + ' · ' + target()!.name : ''" [open]="!!mode()" (openChange)="!$event && mode.set(null)">
      @if (target(); as p) {
        @switch (mode()) {
          @case ('approve') {
            <p class="mb-3 text-sm text-ink-muted">{{ p.maintenanceType }} · {{ p.frequencyLabel }} · {{ p.assetIds.length }} asset(s) at {{ p.siteName }}.</p>
            <amc-form-field label="Comment" for="pa-comment"><textarea id="pa-comment" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
          }
          @case ('suspend') {
            <p class="mb-3 text-sm text-ink-muted">Suspended plans generate no new maintenance work. Existing events stay in the schedule.</p>
            <amc-form-field label="Reason" for="pa-reason" [required]="true"><textarea id="pa-reason" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
          }
          @case ('review') {
            @if (review(); as r) {
              <p class="amc-overline">Maintenance performance review</p>
              <dl class="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-line p-3 text-sm sm:grid-cols-4">
                <div><dt class="text-xs text-ink-muted">Previous Frequency</dt><dd class="font-medium">{{ r.previousFrequency }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Actual Frequency</dt><dd class="font-medium">{{ r.actualFrequency }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Breakdown Frequency</dt><dd class="font-medium">{{ r.breakdownFrequency }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Repeat Failure Rate</dt><dd class="font-medium">{{ r.repeatFailureRate }}%</dd></div>
                <div><dt class="text-xs text-ink-muted">Maintenance Cost</dt><dd class="font-medium">{{ formatCurrency(r.cost, 'SAR', true) }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Parts Consumption</dt><dd class="font-medium">{{ r.partsConsumption }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Technician Hours</dt><dd class="font-medium">{{ r.technicianHours }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Asset Condition / Corrective</dt><dd class="font-medium">{{ r.assetCondition }} · {{ r.correctiveActions }}</dd></div>
                <p class="col-span-2 text-xs text-ink-muted sm:col-span-4">{{ r.suggestion }}</p>
              </dl>
            } @else { <div class="flex justify-center p-4"><amc-spinner /></div> }
            <p class="amc-overline mt-4">Revised maintenance plan</p>
            <div class="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <amc-form-field label="Revised Frequency" for="rv-freq"><amc-select inputId="rv-freq" [options]="frequencyOptions" [(value)]="frequency" /></amc-form-field>
              <amc-form-field label="Frequency Value" for="rv-val" hint="Used for custom intervals."><input id="rv-val" type="number" min="1" class="amc-input tabular-nums" [value]="value()" (input)="value.set(+$any($event.target).value || 1)" /></amc-form-field>
              <amc-form-field label="Effective Date" for="rv-eff"><input id="rv-eff" type="date" class="amc-input" [min]="minDate" [value]="effective()" (input)="effective.set($any($event.target).value)" /></amc-form-field>
              <amc-form-field label="Revised Checklist" for="rv-chk"><amc-select inputId="rv-chk" [options]="refs.checklistOptions()" [(value)]="checklist" [clearable]="true" /></amc-form-field>
              <amc-form-field label="Revised Maintenance Window" for="rv-win"><amc-select inputId="rv-win" [options]="windowOptions" [(value)]="window" /></amc-form-field>
              <amc-form-field label="Revised Parts" for="rv-parts"><p id="rv-parts" class="text-sm text-ink-muted">{{ p.parts.required.length ? p.parts.required.map(partLabel).join(', ') : 'None' }} — edit on the plan form.</p></amc-form-field>
              <amc-form-field label="Technician Feedback / Notes" for="rv-notes" class="sm:col-span-2"><textarea id="rv-notes" class="amc-textarea min-h-14" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
            </div>
            <p class="mt-2 text-xs text-ink-muted">Creates a new plan version. Future occurrences from the effective date are recalculated; history is unchanged.</p>
          }
        }
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="mode.set(null)">Close</button>
        @if (mode() === 'approve') {
          <button type="button" class="amc-btn-danger" [disabled]="busy()" (click)="decide(false)">Reject</button>
          <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="decide(true)">Approve</button>
        } @else {
          <button type="button" [class]="mode() === 'suspend' ? 'amc-btn-danger' : 'amc-btn-primary'" [disabled]="busy() || (mode() === 'suspend' && !text().trim())" (click)="confirm()">@if (busy()) { <amc-spinner [size]="14" /> } {{ mode() === 'review' ? 'Create New Version' : 'Suspend' }}</button>
        }
      </ng-container>
    </amc-dialog>
  `,
})
export class PlanActionHost {
  private readonly api = inject(PlanApi);
  private readonly scheduleApi = inject(ScheduleApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(PmReferenceStore);

  readonly done = output<string | null>();

  protected readonly mode = signal<Mode | null>(null);
  protected readonly target = signal<PlanListItem | null>(null);
  protected readonly busy = signal(false);
  protected readonly text = signal('');
  protected readonly review = signal<PlanReview | null>(null);
  protected readonly frequency = signal<string | number | null>(null);
  protected readonly value = signal(1);
  protected readonly effective = signal(today());
  protected readonly checklist = signal<string | number | null>(null);
  protected readonly window = signal<string | number | null>(null);
  protected readonly minDate = today();
  protected readonly frequencyOptions = toOptions(FREQUENCY_TYPES);
  protected readonly windowOptions = toOptions(MAINTENANCE_WINDOWS);
  protected readonly formatCurrency = formatCurrency;
  protected readonly title = computed(() => ({ approve: 'Approve maintenance plan', suspend: 'Suspend maintenance plan', review: 'Plan review' })[this.mode() ?? 'approve']);
  protected readonly partLabel = (r: { partNumber: string; quantity: number }) => `${r.quantity} × ${r.partNumber}`;

  async run(action: string, p: PlanListItem): Promise<void> {
    this.target.set(p);
    switch (action) {
      case 'view':
        return void this.router.navigate(['/app/preventive-maintenance', p.id]);
      case 'edit':
        return void this.router.navigate(['/app/preventive-maintenance', p.id, 'edit']);
      case 'history':
        return void this.router.navigate(['/app/preventive-maintenance', p.id], { queryParams: { tab: 'audit' } });
      case 'asset':
        return void this.router.navigate(['/app/assets', p.assetIds[0]]);
      case 'generate-wo':
        return void this.router.navigate(['/app/preventive-maintenance/work-orders'], { queryParams: { planId: p.id } });
      case 'duplicate':
        try {
          const copy = await firstValueFrom(this.api.duplicate(p.id));
          this.notify.success(`${copy.number} created from ${p.number}.`);
          this.refs.refresh();
          void this.router.navigate(['/app/preventive-maintenance', copy.id, 'edit']);
        } catch (e) {
          this.notify.error((e as Error).message);
        }
        return;
      case 'schedule':
        try {
          const n = await firstValueFrom(this.scheduleApi.generate(p.id));
          this.notify.success(n ? `${n} occurrence(s) generated.` : 'Schedule is already up to date — no duplicates created.');
          this.done.emit(p.id);
        } catch (e) {
          this.notify.error((e as Error).message);
        }
        return;
      case 'submit':
        return void this.exec(this.api.submitForApproval(p.id), `${p.number} submitted for approval.`);
      case 'activate':
        return void this.exec(this.api.activate(p.id), `${p.number} activated — schedule generated.`);
      case 'resume':
        return void this.exec(this.api.resume(p.id), `${p.number} resumed.`);
      case 'pause':
        this.text.set('');
        this.mode.set('suspend');
        return;
      case 'approve':
        this.text.set('');
        this.mode.set('approve');
        return;
      case 'review':
        this.text.set('');
        this.review.set(null);
        this.frequency.set(p.frequency.type);
        this.value.set(p.frequency.value);
        this.effective.set(today());
        this.checklist.set(p.procedure.checklistId);
        this.window.set(p.scheduling.window);
        this.mode.set('review');
        void firstValueFrom(this.api.review(p.id)).then((r) => this.review.set(r));
        return;
    }
  }

  protected async decide(approve: boolean): Promise<void> {
    const p = this.target();
    if (p && (await this.exec(this.api.approve(p.id, approve, this.text()), `${p.number} ${approve ? 'approved' : 'rejected'}.`))) this.mode.set(null);
  }

  protected async confirm(): Promise<void> {
    const p = this.target();
    if (!p) return;
    const ok = this.mode() === 'suspend'
      ? await this.exec(this.api.suspend(p.id, this.text()), `${p.number} suspended.`)
      : await this.exec(this.api.applyReview(p.id, { frequencyType: String(this.frequency()), frequencyValue: this.value(), effectiveDate: this.effective(), checklistId: this.checklist() ? String(this.checklist()) : null, parts: p.parts.required, window: String(this.window()), notes: this.text() }), `${p.number} revised — new version created.`);
    if (ok) this.mode.set(null);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.done.emit(this.target()?.id ?? null);
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
