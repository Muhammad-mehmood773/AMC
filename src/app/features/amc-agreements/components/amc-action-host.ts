import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { MultiSelect, Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { formatCurrency } from '@shared/utils/format';
import { type Observable, firstValueFrom } from 'rxjs';
import { AmcReferenceStore } from '../data/amc-reference.store';
import { AmcApi, ScheduleApi } from '../data/amc.api';
import { AMC_RULES } from '../data/amc.config';
import { type AmcListItem, EDITABLE_AMC_STATUSES, LIVE_AMC_STATUSES } from '../models/amc.model';
import { type RenewalReview, SETTLEMENT_STATUSES, TERMINATION_TYPES, type TerminationType } from '../models/operations.model';

type Mode = 'decide' | 'suspend' | 'terminate' | 'renew' | 'add-site' | 'add-asset' | 'add-service';

const today = () => new Date().toISOString().slice(0, 10);

/** Status-aware AMC actions (SRS 6.5 / 6.7). */
export function amcActions(a: AmcListItem, full = false): MenuItem[] {
  const s = a.effectiveStatus;
  const live = LIVE_AMC_STATUSES.includes(s);
  const editable = EDITABLE_AMC_STATUSES.includes(s);
  const items: MenuItem[] = [];
  if (full) items.push({ id: 'view', label: 'View', icon: 'eye' });
  if (editable) items.push({ id: 'edit', label: 'Edit', icon: 'pencil' });
  if (editable) items.push({ id: 'add-asset', label: 'Add Asset', icon: 'box', dividerBefore: true }, { id: 'add-site', label: 'Add Site', icon: 'map-pin' }, { id: 'add-service', label: 'Add Service', icon: 'list' });
  if (s === 'Draft') items.push({ id: 'submit', label: 'Submit for Approval', icon: 'send', dividerBefore: true });
  if (s === 'Pending Approval') items.push({ id: 'decide', label: 'Approve / Reject', icon: 'check-circle', dividerBefore: true });
  if (['Draft', 'Pending Approval', 'Approved', 'Pending Activation'].includes(s)) items.push({ id: 'activate', label: 'Activate', icon: 'play' });
  if (live) items.push({ id: 'schedule', label: 'Schedule Maintenance', icon: 'calendar-check', dividerBefore: true }, { id: 'work-order', label: 'Create Work Order', icon: 'wrench' });
  items.push({ id: 'history', label: 'View Service History', icon: 'history' });
  if (live || s === 'Expired') items.push({ id: 'renew', label: 'Renew', icon: 'refresh', dividerBefore: true, disabled: !!a.renewedById, hint: a.renewedById ? `Renewed as ${a.renewedById}` : undefined });
  if (live) items.push({ id: 'suspend', label: 'Suspend', icon: 'pause', danger: true });
  if (s === 'Suspended') items.push({ id: 'resume', label: 'Resume', icon: 'play', dividerBefore: true });
  if (live || s === 'Suspended') items.push({ id: 'terminate', label: 'Terminate', icon: 'ban', danger: true });
  return items;
}

@Component({
  selector: 'amc-amc-action-host',
  imports: [DatePicker, Dialog, FormField, MultiSelect, Select, Spinner, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog [size]="mode() === 'renew' || mode() === 'terminate' ? 'lg' : 'md'" [title]="title()" [description]="target() ? target()!.number + ' · ' + target()!.customerName : ''" [open]="!!mode()" (openChange)="!$event && mode.set(null)">
      @if (target(); as a) {
        @switch (mode()) {
          @case ('decide') {
            <p class="mb-3 text-sm text-ink-muted">Value {{ formatCurrency(a.commercial.value, a.commercial.currency) }} · {{ a.scope.siteIds.length }} sites · {{ a.scope.assetIds.length }} assets · parent contract {{ a.parentContractNumber ?? '—' }} ({{ a.parentContractStatus ?? 'none' }}).</p>
            <amc-form-field label="Comment" for="ah-comment"><textarea id="ah-comment" class="amc-textarea min-h-20" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
          }
          @case ('suspend') {
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <amc-form-field label="Suspension Reason" for="ah-reason" [required]="true" class="sm:col-span-2"><textarea id="ah-reason" class="amc-textarea min-h-16" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
              <amc-form-field label="Requested By" for="ah-by"><input id="ah-by" class="amc-input" [value]="requestedBy()" (input)="requestedBy.set($any($event.target).value)" /></amc-form-field>
              <amc-form-field label="Suspension Period (days)" for="ah-period" hint="Leave empty for open-ended."><input id="ah-period" type="number" min="1" class="amc-input tabular-nums" [value]="periodDays() ?? ''" (input)="periodDays.set(+$any($event.target).value || null)" /></amc-form-field>
              <amc-switch label="Impact on Maintenance" description="Pause new services and maintenance activities." [(checked)]="pauseMaintenance" />
              <amc-switch label="Impact on Billing" description="Put planned billing on hold." [(checked)]="pauseBilling" />
              <amc-form-field label="Notes" for="ah-notes" class="sm:col-span-2"><textarea id="ah-notes" class="amc-textarea min-h-14" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea></amc-form-field>
            </div>
          }
          @case ('terminate') {
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <amc-form-field label="Termination Type" for="ah-ttype"><amc-select inputId="ah-ttype" [options]="terminationOptions" [(value)]="terminationType" /></amc-form-field>
              <amc-form-field label="Termination Date" for="ah-tdate"><amc-date-picker inputId="ah-tdate" [(value)]="terminationDate" /></amc-form-field>
              <amc-form-field label="Requested By" for="ah-tby"><input id="ah-tby" class="amc-input" [value]="requestedBy()" (input)="requestedBy.set($any($event.target).value)" /></amc-form-field>
              <amc-form-field label="Notice Period (days)" for="ah-notice"><input id="ah-notice" type="number" min="0" class="amc-input tabular-nums" [value]="noticeDays()" (input)="noticeDays.set(+$any($event.target).value || 0)" /></amc-form-field>
              <amc-form-field label="Final Service Date" for="ah-final"><amc-date-picker inputId="ah-final" [(value)]="finalServiceDate" /></amc-form-field>
              <amc-form-field label="Settlement Status" for="ah-settle"><amc-select inputId="ah-settle" [options]="settlementOptions" [(value)]="settlement" /></amc-form-field>
              <amc-form-field label="Reason" for="ah-treason" [required]="true" class="sm:col-span-2"><textarea id="ah-treason" class="amc-textarea min-h-16" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
              <div class="sm:col-span-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs text-ink-muted">Outstanding billing: {{ formatCurrency(a.financials.outstanding, a.commercial.currency) }} · Remaining visits: {{ a.consumption.remainingVisits }}. Future maintenance and billing after the final service date are cancelled; all historical service and financial records are preserved.</div>
              <div>
                <span class="amc-label">Documents</span>
                <label for="ah-tdoc" class="amc-btn-secondary amc-btn-sm mt-1.5 cursor-pointer">Attach<input id="ah-tdoc" type="file" multiple class="sr-only" (change)="onDocs($event)" /></label>
                @for (d of docs(); track d) { <p class="mt-1 truncate text-xs text-ink-muted">{{ d }}</p> }
              </div>
              <amc-form-field label="Notes" for="ah-tnotes"><textarea id="ah-tnotes" class="amc-textarea min-h-14" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea></amc-form-field>
            </div>
          }
          @case ('renew') {
            @if (review(); as r) {
              <p class="amc-overline">Renewal review</p>
              <dl class="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-line p-3 text-sm sm:grid-cols-4">
                <div><dt class="text-xs text-ink-muted">Previous Value</dt><dd class="font-medium tabular-nums">{{ formatCurrency(r.previousValue, r.currency) }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Service Usage</dt><dd class="font-medium tabular-nums">{{ r.usage }}%</dd></div>
                <div><dt class="text-xs text-ink-muted">Visit Performance</dt><dd class="font-medium tabular-nums">{{ r.visitPerformance }}%</dd></div>
                <div><dt class="text-xs text-ink-muted">Breakdowns</dt><dd class="font-medium tabular-nums">{{ r.breakdownFrequency }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Parts Consumption</dt><dd class="font-medium tabular-nums">{{ formatCurrency(r.partsConsumption, r.currency) }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Service Cost</dt><dd class="font-medium tabular-nums">{{ formatCurrency(r.serviceCost, r.currency) }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Revenue</dt><dd class="font-medium tabular-nums">{{ formatCurrency(r.revenue, r.currency) }}</dd></div>
                <div><dt class="text-xs text-ink-muted">Profitability</dt><dd class="font-medium tabular-nums" [class]="r.profitability < 15 ? 'text-danger' : 'text-ok'">{{ r.profitability }}%</dd></div>
                <div class="col-span-2 sm:col-span-4 text-xs text-ink-muted">{{ r.serviceHistory }} completed service visits · suggested price {{ formatCurrency(r.suggestedPrice, r.currency) }} based on usage and margin.</div>
              </dl>
            }
            <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <amc-form-field label="Renewal Term (months)" for="ah-term"><input id="ah-term" type="number" min="1" class="amc-input tabular-nums" [value]="termMonths()" (input)="termMonths.set(+$any($event.target).value || 12)" /></amc-form-field>
              <amc-form-field label="Revised Price" for="ah-price"><input id="ah-price" type="number" min="0" class="amc-input tabular-nums" [value]="revisedValue()" (input)="revisedValue.set(+$any($event.target).value || 0)" /></amc-form-field>
              <amc-form-field label="Revised Assets" for="ah-rassets" class="sm:col-span-2" hint="Leave empty to keep the current assets."><amc-multi-select inputId="ah-rassets" [options]="assetChoices()" [(value)]="ids" [maxChips]="4" /></amc-form-field>
              <amc-form-field label="Revised Services" for="ah-rsvc" class="sm:col-span-2" hint="Leave empty to keep the current services."><amc-multi-select inputId="ah-rsvc" [options]="refs.serviceOptions()" [(value)]="serviceIds" [maxChips]="4" /></amc-form-field>
              <amc-form-field label="Revised Scope" for="ah-rscope" class="sm:col-span-2"><textarea id="ah-rscope" class="amc-textarea min-h-14" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea></amc-form-field>
            </div>
            <p class="mt-3 text-xs text-ink-muted">Creates the next AMC period linked to {{ a.number }}. It becomes effective — and a new maintenance schedule is generated — when activated.</p>
          }
          @default {
            <amc-form-field [label]="mode() === 'add-site' ? 'Sites to add' : mode() === 'add-asset' ? 'Assets to add' : 'Services to add'" for="ah-ids">
              <amc-multi-select inputId="ah-ids" [options]="scopeChoices()" [(value)]="ids" [maxChips]="4" />
            </amc-form-field>
            @if (mode() === 'add-asset') { <p class="mt-2 text-xs text-ink-muted">Only assets at covered sites of {{ a.customerName }} are listed. New assets are added to the maintenance schedule automatically.</p> }
          }
        }
      }
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="mode.set(null)">Close</button>
        @if (mode() === 'decide') {
          <button type="button" class="amc-btn-danger" [disabled]="busy()" (click)="decide(false)">Reject</button>
          <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="decide(true)">Approve</button>
        } @else {
          <button type="button" [class]="mode() === 'suspend' || mode() === 'terminate' ? 'amc-btn-danger' : 'amc-btn-primary'" [disabled]="busy() || !valid()" (click)="confirm()">
            @if (busy()) { <amc-spinner [size]="14" /> }
            {{ confirmLabel() }}
          </button>
        }
      </ng-container>
    </amc-dialog>
  `,
})
export class AmcActionHost {
  private readonly api = inject(AmcApi);
  private readonly schedule = inject(ScheduleApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly confirmDialog = inject(ConfirmDialogService);
  protected readonly refs = inject(AmcReferenceStore);

  readonly done = output<string | null>();

  protected readonly mode = signal<Mode | null>(null);
  protected readonly target = signal<AmcListItem | null>(null);
  protected readonly busy = signal(false);
  protected readonly text = signal('');
  protected readonly notes = signal('');
  protected readonly requestedBy = signal('');
  protected readonly periodDays = signal<number | null>(null);
  protected readonly pauseMaintenance = signal(true);
  protected readonly pauseBilling = signal(true);
  protected readonly terminationType = signal<string | number | null>('Customer Request');
  protected readonly terminationDate = signal(today());
  protected readonly finalServiceDate = signal(today());
  protected readonly noticeDays = signal(30);
  protected readonly settlement = signal<string | number | null>('Pending');
  protected readonly docs = signal<string[]>([]);
  protected readonly review = signal<RenewalReview | null>(null);
  protected readonly termMonths = signal(12);
  protected readonly revisedValue = signal(0);
  protected readonly ids = signal<readonly (string | number)[]>([]);
  protected readonly serviceIds = signal<readonly (string | number)[]>([]);
  protected readonly terminationOptions = toOptions(TERMINATION_TYPES);
  protected readonly settlementOptions = toOptions(SETTLEMENT_STATUSES);
  protected readonly formatCurrency = formatCurrency;

  protected readonly title = computed(() => ({ decide: 'Approve AMC', suspend: 'Suspend AMC', terminate: 'Terminate AMC', renew: 'Renew AMC', 'add-site': 'Add Site', 'add-asset': 'Add Asset', 'add-service': 'Add Service' })[this.mode() ?? 'decide']);
  protected readonly confirmLabel = computed(() => ({ decide: 'Approve', suspend: 'Suspend', terminate: 'Terminate', renew: 'Create Renewal', 'add-site': 'Add', 'add-asset': 'Add', 'add-service': 'Add' })[this.mode() ?? 'decide']);
  protected readonly valid = computed(() => {
    switch (this.mode()) {
      case 'suspend':
      case 'terminate':
        return !!this.text().trim();
      case 'renew':
        return this.termMonths() > 0 && this.revisedValue() > 0;
      default:
        return this.ids().length > 0;
    }
  });
  protected readonly assetChoices = computed(() => {
    const a = this.target();
    return a ? this.refs.assetOptions(a.customer.customerId, a.scope.siteIds) : [];
  });
  protected readonly scopeChoices = computed(() => {
    const a = this.target();
    if (!a) return [];
    if (this.mode() === 'add-site') return this.refs.siteOptions(a.customer.customerId).filter((o) => !a.scope.siteIds.includes(String(o.value)));
    if (this.mode() === 'add-asset') return this.assetChoices().filter((o) => !a.scope.assetIds.includes(String(o.value)) && !a.scope.excludedAssetIds.includes(String(o.value)));
    return this.refs.serviceOptions().filter((o) => !a.scope.serviceIds.includes(String(o.value)));
  });

  async run(action: string, a: AmcListItem): Promise<void> {
    this.target.set(a);
    const go = (path: string, params: Record<string, string> = {}) => void this.router.navigate([path], { queryParams: { amcId: a.id, ...params } });
    switch (action) {
      case 'view':
        return void this.router.navigate(['/app/amc-agreements', a.id]);
      case 'edit':
        return void this.router.navigate(['/app/amc-agreements', a.id, 'edit']);
      case 'history':
        return void this.router.navigate(['/app/amc-agreements', a.id], { queryParams: { tab: 'visits' } });
      case 'work-order':
        return go('/app/amc-agreements/visits', { action: 'new' });
      case 'schedule':
        try {
          const n = await firstValueFrom(this.schedule.generate(a.id));
          this.notify.success(n ? `${n} maintenance events generated for ${a.number}.` : 'The schedule is already up to date.');
          go('/app/amc-agreements/schedule');
        } catch (error) {
          this.notify.error((error as Error).message);
        }
        return;
      case 'submit':
        return void this.exec(this.api.submitForApproval(a.id), `${a.number} submitted for approval.`);
      case 'resume':
        return void this.exec(this.api.resume(a.id), `${a.number} resumed.`);
      case 'activate':
        if (!(await this.confirmDialog.open({ title: 'Activate AMC?', message: a.approval === 'Approved' || a.commercial.value <= AMC_RULES.autoApprovalLimit ? `${a.number} starts providing service entitlement and its maintenance schedule is generated.` : `${a.number} needs approval before activation (value above ${AMC_RULES.autoApprovalLimit.toLocaleString('en-US')}).`, confirmLabel: 'Activate' }))) return;
        try {
          const result = await firstValueFrom(this.api.activate(a.id));
          this.notify.success(result.status === 'Active' ? `${a.number} activated.` : `${a.number} approved — activates on ${result.period.startDate}.`);
          this.done.emit(a.id);
        } catch (error) {
          this.notify.error((error as Error).message);
        }
        return;
      default:
        this.open(action as Mode, a);
    }
  }

  private open(mode: Mode, a: AmcListItem): void {
    this.text.set('');
    this.notes.set('');
    this.ids.set([]);
    this.serviceIds.set([]);
    this.docs.set([]);
    this.requestedBy.set(a.customerName);
    this.noticeDays.set(a.period.noticePeriodDays);
    this.pauseMaintenance.set(true);
    this.pauseBilling.set(true);
    this.periodDays.set(null);
    if (mode === 'renew') {
      this.review.set(null);
      this.termMonths.set(a.period.renewalTermMonths ?? 12);
      this.revisedValue.set(a.commercial.value);
      void firstValueFrom(this.api.renewalReview(a.id)).then((r) => {
        this.review.set(r);
        this.revisedValue.set(r.suggestedPrice);
      });
    }
    this.mode.set(mode);
  }

  protected onDocs(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.docs.update((list) => [...list, ...Array.from(input.files ?? []).map((f) => f.name)]);
    input.value = '';
  }

  protected async decide(approve: boolean): Promise<void> {
    const a = this.target();
    if (a && (await this.exec(this.api.decide(a.id, approve, this.text()), `${a.number} ${approve ? 'approved' : 'rejected'}.`))) this.mode.set(null);
  }

  protected async confirm(): Promise<void> {
    const a = this.target();
    const mode = this.mode();
    if (!a || !mode) return;
    const ids = this.ids().map(String);
    let work: Observable<unknown>;
    switch (mode) {
      case 'suspend':
        work = this.api.suspend(a.id, { reason: this.text(), requestedBy: this.requestedBy(), periodDays: this.periodDays(), pauseMaintenance: this.pauseMaintenance(), pauseBilling: this.pauseBilling(), notes: this.notes() });
        break;
      case 'terminate':
        work = this.api.terminate(a.id, { type: this.terminationType() as TerminationType, terminationDate: this.terminationDate(), requestedBy: this.requestedBy(), reason: this.text(), noticePeriodDays: this.noticeDays(), finalServiceDate: this.finalServiceDate(), settlementStatus: String(this.settlement()), documents: this.docs(), notes: this.notes() });
        break;
      case 'renew':
        work = this.api.renew(a.id, { termMonths: this.termMonths(), revisedValue: this.revisedValue(), revisedAssetIds: ids, revisedServiceIds: this.serviceIds().map(String), scopeNotes: this.notes() });
        break;
      default:
        work = this.api.changeScope(a.id, mode === 'add-site' ? { addSiteIds: ids } : mode === 'add-asset' ? { addAssetIds: ids } : { addServiceIds: ids });
    }
    this.busy.set(true);
    try {
      const result = await firstValueFrom(work);
      this.notify.success(mode === 'renew' ? `Renewal ${(result as { number: string }).number} created.` : `${a.number}: ${this.title().toLowerCase()} done.`);
      this.mode.set(null);
      this.done.emit(mode === 'renew' ? (result as { id: string }).id : a.id);
      if (mode === 'renew') void this.router.navigate(['/app/amc-agreements', (result as { id: string }).id]);
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.done.emit(this.target()?.id ?? null);
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
