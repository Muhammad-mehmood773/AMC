import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import type { MenuItem } from '@shared/ui/action-menu';
import { Dialog } from '@shared/ui/dialog';
import { FormField } from '@shared/ui/form-field';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { formatCurrency } from '@shared/utils/format';
import { type Observable, firstValueFrom } from 'rxjs';
import { SlaReferenceStore } from '../data/sla-reference.store';
import { SlaApi, SlaCoverageApi } from '../data/sla.api';
import { formatMinutes } from '../models/display';
import type { SlaRenewalReview } from '../models/operations.model';
import { EDITABLE_SLA_STATUSES, LIVE_SLA_STATUSES, PRIORITIES, type Priority, type SlaListItem } from '../models/sla.model';

type Mode = 'decide' | 'suspend' | 'renew' | 'add-customer' | 'add-site' | 'add-asset' | 'add-service';

/** Status-aware SLA actions (SRS 7.5 / 7.7). */
export function slaActions(s: SlaListItem, full = false): MenuItem[] {
  const st = s.effectiveStatus;
  const live = LIVE_SLA_STATUSES.includes(st);
  const editable = EDITABLE_SLA_STATUSES.includes(st);
  return [
    ...(full ? [{ id: 'view', label: 'View', icon: 'eye' as const }] : []),
    ...(editable ? [{ id: 'edit', label: 'Edit', icon: 'pencil' as const }] : []),
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    ...(editable ? [
      { id: 'assign', label: 'Assign (Mapping)', icon: 'link' as const, dividerBefore: true },
      { id: 'targets', label: 'Modify Targets', icon: 'clock' as const },
      { id: 'add-customer', label: 'Add Customer', icon: 'building' as const },
      { id: 'add-service', label: 'Add Service', icon: 'list' as const },
      { id: 'add-site', label: 'Add Site', icon: 'map-pin' as const },
      { id: 'add-asset', label: 'Add Asset', icon: 'box' as const },
      { id: 'escalation', label: 'Configure Escalation', icon: 'alert-triangle' as const },
    ] : []),
    ...(st === 'Draft' ? [{ id: 'submit', label: 'Submit for Approval', icon: 'send' as const, dividerBefore: true }] : []),
    ...(st === 'Pending Approval' ? [{ id: 'decide', label: 'Approve / Reject', icon: 'check-circle' as const, dividerBefore: true }] : []),
    ...(['Draft', 'Pending Approval', 'Approved', 'Pending Activation'].includes(st) ? [{ id: 'activate', label: 'Activate', icon: 'play' as const }] : []),
    { id: 'performance', label: 'View Performance', icon: 'bar-chart', dividerBefore: true },
    { id: 'breaches', label: 'View Breaches', icon: 'alert-circle' },
    ...(live || st === 'Expired' ? [{ id: 'renew', label: 'Renew', icon: 'refresh' as const, dividerBefore: true, disabled: !!s.renewedById, hint: s.renewedById ? `Renewed as ${s.renewedById}` : undefined }] : []),
    ...(live ? [{ id: 'suspend', label: 'Suspend', icon: 'pause' as const, danger: true }] : []),
    ...(st === 'Suspended' ? [{ id: 'reactivate', label: 'Reactivate', icon: 'play' as const, dividerBefore: true }] : []),
    ...(live || st === 'Suspended' ? [{ id: 'expire', label: 'Expire', icon: 'clock' as const, danger: true }] : []),
  ];
}

@Component({
  selector: 'amc-sla-action-host',
  imports: [Dialog, FormField, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog [size]="mode() === 'renew' ? 'lg' : 'md'" [title]="title()" [description]="target() ? target()!.number + ' · ' + target()!.name : ''" [open]="!!mode()" (openChange)="!$event && mode.set(null)">
      @if (target(); as s) {
        @switch (mode()) {
          @case ('decide') {
            <p class="mb-3 text-sm text-ink-muted">{{ s.type }} · {{ s.customerName ?? 'Mapped customers' }} · value {{ formatCurrency(s.commercial.value, s.commercial.currency) }}{{ s.commercial.penaltyApplicable ? ' · penalties apply' : '' }}.</p>
            <amc-form-field label="Comment" for="sh-comment"><textarea id="sh-comment" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
          }
          @case ('suspend') {
            <p class="mb-3 text-sm text-ink-muted">Suspended SLAs create no new SLA commitments. Clocks already running continue to be measured.</p>
            <amc-form-field label="Reason" for="sh-reason" [required]="true"><textarea id="sh-reason" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
          }
          @case ('renew') {
            @if (review(); as r) {
              <p class="amc-overline">SLA performance review</p>
              <dl class="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-line p-3 text-sm sm:grid-cols-4">
                <div><dt class="text-xs text-ink-muted">Previous Version / Value</dt><dd class="font-medium">v{{ r.previousVersion }} · {{ formatCurrency(r.previousValue, r.currency, true) }}</dd></div>
                <div><dt class="text-xs text-ink-muted">SLA Compliance</dt><dd class="font-medium" [class]="(r.performance.compliance ?? 100) < 85 ? 'text-danger' : 'text-ok'">{{ r.performance.compliance ?? '—' }}%</dd></div>
                <div><dt class="text-xs text-ink-muted">Response / Resolution</dt><dd class="font-medium">{{ r.performance.responseCompliance ?? '—' }}% / {{ r.performance.resolutionCompliance ?? '—' }}%</dd></div>
                <div><dt class="text-xs text-ink-muted">Avg Response / Resolution</dt><dd class="font-medium">{{ fm(r.performance.avgResponseMinutes) }} / {{ fm(r.performance.avgResolutionMinutes) }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Breach Frequency</dt><dd class="font-medium">{{ r.breachFrequency }} / month</dd></div>
                <div><dt class="text-xs text-ink-muted">Escalation Frequency</dt><dd class="font-medium">{{ r.escalationFrequency }} / month</dd></div>
                <div><dt class="text-xs text-ink-muted">Customer Complaints</dt><dd class="font-medium">{{ r.complaints }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Breaches</dt><dd class="font-medium">{{ r.performance.breached }}</dd></div>
                <p class="col-span-2 text-xs text-ink-muted sm:col-span-4">{{ r.suggestion }}</p>
              </dl>
            }
            <p class="amc-overline mt-4">Revised targets (minutes)</p>
            <div class="mt-2 overflow-hidden rounded-xl border border-line">
              <table class="w-full text-sm">
                <thead class="bg-surface-muted text-xs text-ink-muted"><tr><th class="px-3 py-2 text-left font-medium">Priority</th><th class="px-3 py-2 text-left font-medium">Response</th><th class="px-3 py-2 text-left font-medium">Resolution</th></tr></thead>
                <tbody>
                  @for (p of priorities; track p) {
                    <tr class="border-t border-line">
                      <td class="px-3 py-1.5 font-medium">{{ p }}</td>
                      <td class="px-3 py-1.5"><input type="number" min="1" class="amc-input h-8 tabular-nums" [attr.aria-label]="p + ' response'" [value]="targets()[p].response" (input)="setTarget(p, 'response', $any($event.target).value)" /></td>
                      <td class="px-3 py-1.5"><input type="number" min="1" class="amc-input h-8 tabular-nums" [attr.aria-label]="p + ' resolution'" [value]="targets()[p].resolution" (input)="setTarget(p, 'resolution', $any($event.target).value)" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <amc-form-field label="Renewal Term (months)" for="sh-term"><input id="sh-term" type="number" min="1" class="amc-input tabular-nums" [value]="term()" (input)="term.set(+$any($event.target).value || 12)" /></amc-form-field>
              <amc-form-field label="Revised SLA Value" for="sh-value"><input id="sh-value" type="number" min="0" class="amc-input tabular-nums" [value]="value()" (input)="value.set(+$any($event.target).value || 0)" /></amc-form-field>
              <amc-form-field label="Revised Service Hours" for="sh-cal" class="sm:col-span-2"><amc-select inputId="sh-cal" [options]="refs.calendarOptions()" [(value)]="calendarId" /></amc-form-field>
              <amc-form-field label="Revised Escalation Rules" for="sh-esc"><input id="sh-esc" class="amc-input" [value]="escalationNote()" (input)="escalationNote.set($any($event.target).value)" /></amc-form-field>
              <amc-form-field label="Revised Coverage" for="sh-cov"><input id="sh-cov" class="amc-input" [value]="coverageNote()" (input)="coverageNote.set($any($event.target).value)" /></amc-form-field>
              <amc-form-field label="Revised Commercial Terms" for="sh-com" class="sm:col-span-2"><input id="sh-com" class="amc-input" [value]="commercialNote()" (input)="commercialNote.set($any($event.target).value)" /></amc-form-field>
            </div>
            <p class="mt-3 text-xs text-ink-muted">Creates a new SLA period and version linked to {{ s.number }}. Mappings move to the renewal when it is activated.</p>
          }
          @default {
            <amc-form-field [label]="scopeLabel()" for="sh-scope"><amc-select inputId="sh-scope" [options]="scopeOptions()" [(value)]="scopeValue" /></amc-form-field>
            <p class="mt-2 text-xs text-ink-muted">Adds a coverage line from {{ s.validity.effectiveDate }}{{ s.validity.expiryDate ? ' to ' + s.validity.expiryDate : '' }}. Customer-specific SLAs can only cover that customer's sites and assets.</p>
          }
        }
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="mode.set(null)">Close</button>
        @if (mode() === 'decide') {
          <button type="button" class="amc-btn-danger" [disabled]="busy()" (click)="decide(false)">Reject</button>
          <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="decide(true)">Approve</button>
        } @else {
          <button type="button" [class]="mode() === 'suspend' ? 'amc-btn-danger' : 'amc-btn-primary'" [disabled]="busy() || !valid()" (click)="confirm()">@if (busy()) { <amc-spinner [size]="14" /> } {{ mode() === 'renew' ? 'Create Renewal' : mode() === 'suspend' ? 'Suspend' : 'Add' }}</button>
        }
      </ng-container>
    </amc-dialog>
  `,
})
export class SlaActionHost {
  private readonly api = inject(SlaApi);
  private readonly coverageApi = inject(SlaCoverageApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly confirmDialog = inject(ConfirmDialogService);
  protected readonly refs = inject(SlaReferenceStore);

  readonly done = output<string | null>();

  protected readonly mode = signal<Mode | null>(null);
  protected readonly target = signal<SlaListItem | null>(null);
  protected readonly busy = signal(false);
  protected readonly text = signal('');
  protected readonly review = signal<SlaRenewalReview | null>(null);
  protected readonly targets = signal<Record<Priority, { response: number; resolution: number }>>({ Critical: { response: 0, resolution: 0 }, High: { response: 0, resolution: 0 }, Medium: { response: 0, resolution: 0 }, Low: { response: 0, resolution: 0 } });
  protected readonly term = signal(12);
  protected readonly value = signal(0);
  protected readonly calendarId = signal<string | number | null>(null);
  protected readonly escalationNote = signal('');
  protected readonly coverageNote = signal('');
  protected readonly commercialNote = signal('');
  protected readonly scopeValue = signal<string | number | null>(null);
  protected readonly priorities = PRIORITIES;
  protected readonly formatCurrency = formatCurrency;
  protected readonly fm = formatMinutes;

  protected readonly title = computed(() => ({ decide: 'Approve SLA', suspend: 'Suspend SLA', renew: 'Renew SLA', 'add-customer': 'Add Customer', 'add-site': 'Add Site', 'add-asset': 'Add Asset', 'add-service': 'Add Service' })[this.mode() ?? 'decide']);
  protected readonly scopeLabel = computed(() => ({ 'add-customer': 'Customer', 'add-site': 'Site', 'add-asset': 'Asset', 'add-service': 'Service' } as Record<string, string>)[this.mode() ?? ''] ?? '');
  protected readonly scopeOptions = computed(() => {
    const cust = this.target()?.customer.customerId ?? null;
    switch (this.mode()) {
      case 'add-customer':
        return cust ? this.refs.customerOptions().filter((o) => o.value === cust) : this.refs.customerOptions();
      case 'add-site':
        return this.refs.siteOptions(cust);
      case 'add-asset':
        return this.refs.assetOptions(cust);
      default:
        return this.refs.serviceOptions();
    }
  });
  protected readonly valid = computed(() => (this.mode() === 'suspend' ? !!this.text().trim() : this.mode() === 'renew' ? this.term() > 0 && PRIORITIES.every((p) => this.targets()[p].response > 0 && this.targets()[p].resolution > 0) : !!this.scopeValue()));

  async run(action: string, s: SlaListItem): Promise<void> {
    this.target.set(s);
    const go = (path: string, extra: Record<string, string> = {}) => void this.router.navigate([path], { queryParams: { slaId: s.id, ...extra } });
    switch (action) {
      case 'view':
        return void this.router.navigate(['/app/sla', s.id]);
      case 'edit':
        return void this.router.navigate(['/app/sla', s.id, 'edit']);
      case 'assign':
        return go('/app/sla/mapping', { action: 'new' });
      case 'targets':
        return go('/app/sla/targets');
      case 'escalation':
        return go('/app/sla/escalations');
      case 'performance':
        return go('/app/sla/performance');
      case 'breaches':
        return go('/app/sla/breaches');
      case 'duplicate':
        try {
          const copy = await firstValueFrom(this.api.duplicate(s.id));
          this.notify.success(`${copy.number} created from ${s.number}.`);
          this.refs.refresh();
          void this.router.navigate(['/app/sla', copy.id, 'edit']);
        } catch (error) {
          this.notify.error((error as Error).message);
        }
        return;
      case 'submit':
        return void this.exec(this.api.submitForApproval(s.id), `${s.number} submitted for approval.`);
      case 'reactivate':
        return void this.exec(this.api.reactivate(s.id), `${s.number} reactivated.`);
      case 'expire':
        if (await this.confirmDialog.open({ title: 'Expire SLA?', message: `${s.number} will no longer be assigned to new transactions. Performance history remains available.`, confirmLabel: 'Expire', danger: true })) void this.exec(this.api.expire(s.id), `${s.number} expired.`);
        return;
      case 'activate':
        try {
          const r = await firstValueFrom(this.api.activate(s.id));
          this.notify.success(r.status === 'Active' ? `${s.number} activated.` : `${s.number} activates on ${r.validity.effectiveDate}.`);
          this.done.emit(s.id);
          this.refs.refresh();
        } catch (error) {
          this.notify.error((error as Error).message);
        }
        return;
      default:
        this.open(action as Mode, s);
    }
  }

  private open(mode: Mode, s: SlaListItem): void {
    this.text.set('');
    this.scopeValue.set(null);
    if (mode === 'renew') {
      this.review.set(null);
      this.targets.set(structuredClone(s.priorityTargets) as Record<Priority, { response: number; resolution: number }>);
      this.term.set(s.validity.renewalTermMonths ?? 12);
      this.value.set(s.commercial.value);
      this.calendarId.set(s.serviceHours.calendarId);
      this.escalationNote.set('');
      this.coverageNote.set('');
      this.commercialNote.set('');
      void firstValueFrom(this.api.renewalReview(s.id)).then((r) => this.review.set(r));
    }
    this.mode.set(mode);
  }

  protected setTarget(p: Priority, key: 'response' | 'resolution', raw: string): void {
    this.targets.update((t) => ({ ...t, [p]: { ...t[p], [key]: Number(raw) || 0 } }));
  }

  protected async decide(approve: boolean): Promise<void> {
    const s = this.target();
    if (s && (await this.exec(this.api.decide(s.id, approve, this.text()), `${s.number} ${approve ? 'approved' : 'rejected'}.`))) this.mode.set(null);
  }

  protected async confirm(): Promise<void> {
    const s = this.target();
    const mode = this.mode();
    if (!s || !mode) return;
    if (mode === 'suspend') {
      if (await this.exec(this.api.suspend(s.id, this.text()), `${s.number} suspended.`)) this.mode.set(null);
      return;
    }
    if (mode === 'renew') {
      this.busy.set(true);
      try {
        const r = await firstValueFrom(this.api.renew(s.id, { termMonths: this.term(), revisedValue: this.value(), revisedTargets: this.targets(), revisedCalendarId: String(this.calendarId()), revisedEscalation: this.escalationNote(), revisedCoverage: this.coverageNote(), revisedCommercial: this.commercialNote() }));
        this.notify.success(`Renewal ${r.number} created — activate it to make it effective.`);
        this.mode.set(null);
        this.refs.refresh();
        void this.router.navigate(['/app/sla', r.id]);
      } catch (error) {
        this.notify.error((error as Error).message);
      } finally {
        this.busy.set(false);
      }
      return;
    }
    const v = String(this.scopeValue());
    const level = mode === 'add-customer' ? 'Customer' : mode === 'add-site' ? 'Site' : mode === 'add-asset' ? 'Asset' : 'Service';
    const input = { slaId: s.id, level, customerId: level === 'Customer' ? v : null, contractId: null, amcId: null, siteId: level === 'Site' ? v : null, assetId: level === 'Asset' ? v : null, assetCategory: null, serviceId: level === 'Service' ? v : null, serviceCategory: null, priority: null, startDate: s.validity.effectiveDate, endDate: s.validity.expiryDate, status: 'Active' as const } as const;
    if (await this.exec(this.coverageApi.create(input), `${level} added to ${s.number} coverage.`)) this.mode.set(null);
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
