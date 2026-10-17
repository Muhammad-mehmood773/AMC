import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import type { MenuItem } from '@shared/ui/action-menu';
import { Dialog } from '@shared/ui/dialog';
import { FormField } from '@shared/ui/form-field';
import { Spinner } from '@shared/ui/spinner';
import { type Observable, firstValueFrom } from 'rxjs';
import { ContractApi } from '../data/contract.api';
import { ALLOWED_ACTIONS } from '../data/contract.config';
import { type ContractListItem, type ContractStatus, EDITABLE_STATUSES } from '../models/contract.model';

interface Prompt {
  action: string;
  title: string;
  label: string;
  confirm: string;
  danger: boolean;
  required: boolean;
}

const PROMPTS: Record<string, Omit<Prompt, 'action'>> = {
  negotiate: { title: 'Start negotiation', label: 'Negotiation note', confirm: 'Start negotiation', danger: false, required: false },
  suspend: { title: 'Suspend contract', label: 'Reason', confirm: 'Suspend', danger: true, required: true },
  cancel: { title: 'Cancel contract', label: 'Reason', confirm: 'Cancel contract', danger: true, required: true },
};

const can = (action: string, status: ContractStatus) => ALLOWED_ACTIONS[action]?.includes(status) ?? false;

/** Status-aware contract actions (SRS 5.5 / 5.8) shared by the list and Contract 360. */
export function contractActions(c: ContractListItem, full = false): MenuItem[] {
  const s = c.effectiveStatus;
  const items: MenuItem[] = [];
  if (full) items.push({ id: 'view', label: 'View', icon: 'eye' });
  if (EDITABLE_STATUSES.includes(c.status)) items.push({ id: 'edit', label: 'Edit', icon: 'pencil' });
  items.push({ id: 'duplicate', label: 'Duplicate', icon: 'copy' });
  if (can('submitReview', s)) items.push({ id: 'submit-review', label: 'Submit for Review', icon: 'send', dividerBefore: true });
  if (can('negotiate', s)) items.push({ id: 'negotiate', label: 'Start Negotiation', icon: 'users' });
  if (can('submitApproval', s)) items.push({ id: 'submit-approval', label: 'Submit for Approval', icon: 'check-circle' });
  if (s === 'Pending Approval') items.push({ id: 'view-approval', label: 'View Approval', icon: 'check-circle', dividerBefore: true });
  if (c.signatureRequired && (s === 'Approved' || s === 'Pending Signature' || s === 'Partially Signed')) items.push({ id: 'send-signature', label: s === 'Approved' ? 'Send for Signature' : 'Track Signature', icon: 'pen-tool', dividerBefore: true });
  if (can('activate', s) && c.approvalStatus === 'Approved' && (!c.signatureRequired || c.signatureStatus === 'Fully Signed')) items.push({ id: 'activate', label: 'Activate', icon: 'play' });
  if (can('amend', s)) items.push({ id: 'amend', label: 'Amend', icon: 'layers', dividerBefore: true });
  if (can('renew', s)) items.push({ id: 'renew', label: 'Renew', icon: 'refresh' });
  if (can('reactivate', s)) items.push({ id: 'reactivate', label: 'Reactivate', icon: 'play' });
  if (can('suspend', s)) items.push({ id: 'suspend', label: 'Suspend', icon: 'pause', danger: true, dividerBefore: true });
  if (can('terminate', s)) items.push({ id: 'terminate', label: 'Terminate', icon: 'ban', danger: true });
  if (can('archive', s)) items.push({ id: 'archive', label: 'Archive', icon: 'archive', dividerBefore: true });
  if (can('cancel', s)) items.push({ id: 'cancel', label: 'Cancel Contract', icon: 'x', danger: true, dividerBefore: !can('suspend', s) });
  if (s === 'Draft') items.push({ id: 'delete', label: 'Delete Draft', icon: 'x', danger: true, hint: 'Only drafts without transactional records' });
  return items;
}

@Component({
  selector: 'amc-contract-action-host',
  imports: [Dialog, FormField, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog size="sm" [title]="prompt()?.title ?? ''" [description]="target()?.number + ' · ' + target()?.title" [open]="!!prompt()" (openChange)="!$event && prompt.set(null)">
      <amc-form-field [label]="prompt()?.label ?? ''" for="ca-comment" [required]="!!prompt()?.required">
        <textarea id="ca-comment" class="amc-textarea min-h-20" [value]="comment()" (input)="comment.set($any($event.target).value)"></textarea>
      </amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="prompt.set(null)">Close</button>
        <button type="button" [class]="prompt()?.danger ? 'amc-btn-danger' : 'amc-btn-primary'" [disabled]="busy() || (!!prompt()?.required && !comment().trim())" (click)="confirmPrompt()">
          @if (busy()) { <amc-spinner [size]="14" /> }
          {{ prompt()?.confirm }}
        </button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ContractActionHost {
  private readonly api = inject(ContractApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);

  readonly done = output<string | null>();

  protected readonly prompt = signal<Prompt | null>(null);
  protected readonly target = signal<ContractListItem | null>(null);
  protected readonly comment = signal('');
  protected readonly busy = signal(false);

  async run(action: string, c: ContractListItem): Promise<void> {
    this.target.set(c);
    const go = (path: string, params: Record<string, string> = {}) => void this.router.navigate([path], { queryParams: { contractId: c.id, ...params } });
    switch (action) {
      case 'view':
        return void this.router.navigate(['/app/contracts', c.id]);
      case 'edit':
        return void this.router.navigate(['/app/contracts', c.id, 'edit']);
      case 'view-approval':
        return go('/app/contracts/approvals');
      case 'send-signature':
        return go('/app/contracts/execution');
      case 'amend':
        return go('/app/contracts/amendments', { action: 'new' });
      case 'renew':
        return go('/app/contracts/renewals', { action: 'new' });
      case 'terminate':
        return go('/app/contracts/terminations', { action: 'new' });
      case 'negotiate':
      case 'suspend':
      case 'cancel':
        this.comment.set('');
        this.prompt.set({ action, ...PROMPTS[action] });
        return;
      case 'duplicate': {
        const copy = await this.exec(this.api.duplicate(c.id), `Draft copy created from ${c.number}.`);
        if (copy) void this.router.navigate(['/app/contracts', (copy as { id: string }).id, 'edit']);
        return;
      }
      case 'submit-review':
        return void this.exec(this.api.submitForReview(c.id), `${c.number} submitted for review.`);
      case 'submit-approval':
        return void this.exec(this.api.submitForApproval(c.id), `${c.number} submitted for approval.`);
      case 'reactivate':
        return void this.exec(this.api.reactivate(c.id), `${c.number} reactivated.`);
      case 'activate':
        if (!(await this.confirm.open({ title: 'Activate contract?', message: `${c.number} will start providing operational coverage (services, entitlements, SLA).`, confirmLabel: 'Activate' }))) return;
        return void this.exec(this.api.activate(c.id), `${c.number} activated.`);
      case 'archive':
        if (!(await this.confirm.open({ title: 'Archive contract?', message: 'Archived contracts are read-only; all records and history are retained.', confirmLabel: 'Archive' }))) return;
        return void this.exec(this.api.archive(c.id), `${c.number} archived.`);
      case 'delete':
        if (!(await this.confirm.open({ title: 'Delete draft?', message: 'Drafts without reviews, approvals, signatures or obligations can be deleted. Otherwise archive or cancel it.', confirmLabel: 'Delete', danger: true }))) return;
        if ((await this.exec(this.api.remove(c.id), `${c.number} deleted.`, null)) !== false) void this.router.navigate(['/app/contracts/list']);
        return;
    }
  }

  protected async confirmPrompt(): Promise<void> {
    const p = this.prompt();
    const c = this.target();
    if (!p || !c) return;
    const work: Record<string, () => Observable<unknown>> = {
      negotiate: () => this.api.startNegotiation(c.id, this.comment()),
      suspend: () => this.api.suspend(c.id, this.comment()),
      cancel: () => this.api.cancel(c.id, this.comment()),
    };
    if ((await this.exec(work[p.action](), `${c.number}: ${p.confirm.toLowerCase()} done.`)) !== false) this.prompt.set(null);
  }

  private async exec(work: Observable<unknown>, message: string, emit: string | null = this.target()?.id ?? null): Promise<unknown> {
    this.busy.set(true);
    try {
      const result = await firstValueFrom(work);
      this.notify.success(message);
      this.done.emit(emit);
      return result ?? true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
