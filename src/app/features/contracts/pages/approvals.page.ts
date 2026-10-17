import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { formatCurrency, formatDateTime } from '@shared/utils/format';
import { type Observable, firstValueFrom } from 'rxjs';
import { approvalColumns } from '../components/contract-columns';
import { ContractReferenceStore } from '../data/contract-reference.store';
import { ApprovalApi } from '../data/contract.api';
import { APPROVAL_LEVELS, CONTRACT_RULES } from '../data/contract.config';
import { STEP_TONE } from '../models/display';
import { APPROVAL_STEP_STATUSES, type ApprovalListItem } from '../models/workflow.model';

type Decision = 'Approved' | 'Rejected' | 'Returned for Changes';

@Component({
  selector: 'amc-approvals-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, PageHeader, Panel, RouterLink, Select, Spinner, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract Approval" subtitle="Draft → Review → Approval Level 1 → Level 2 → Management Approval → Approved for Execution." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'Approvals' }]" />

      <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section class="amc-card overflow-hidden xl:col-span-2">
          <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search contract, approver or comment…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
          <amc-data-table tableId="contract-approvals" [entity]="{ singular: 'approval step', plural: 'approval steps' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="approvals.isLoading()" [actions]="rowActions" emptyIcon="check-circle" emptyTitle="Nothing to approve" emptyMessage="Approval steps appear when contracts, amendments or renewals are submitted." (action)="onAction($event)" />
        </section>

        <div class="space-y-5">
          @if (route().length) {
            <amc-panel [title]="'Approval route · ' + route()[0].contractNumber" [description]="route()[0].subjectLabel + ' · ' + formatCurrency(route()[0].value, route()[0].currency)" icon="check-circle" [padded]="false">
              <a panelActions [routerLink]="['/app/contracts', route()[0].contractId]" class="amc-link text-xs">Contract 360</a>
              <ol class="space-y-0 p-4">
                @for (s of route(); track s.id; let last = $last) {
                  <li class="relative flex gap-3 pb-4" [class]="last ? 'pb-0' : ''">
                    @if (!last) { <span class="absolute top-7 left-3.5 h-full w-px bg-line"></span> }
                    <span class="z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" [class]="s.status === 'Approved' ? 'bg-ok text-white' : s.status === 'Pending' ? 'bg-warn-subtle text-warn ring-2 ring-warn/30' : s.status === 'Waiting' ? 'bg-surface-sunken text-ink-subtle' : 'bg-danger-subtle text-danger'">
                      @if (s.status === 'Approved') { <amc-icon name="check" [size]="12" /> } @else { {{ s.level }} }
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2"><p class="text-sm font-medium text-ink">{{ s.levelName }}</p><amc-status-badge [label]="s.status" [tone]="stepTone[s.status]" /></div>
                      <p class="text-xs text-ink-muted">{{ s.delegateName ?? s.approverName }} · {{ s.role }}{{ s.delegateName ? ' (delegated)' : '' }}</p>
                      <p class="text-xs text-ink-subtle">{{ s.reasons.join(' · ') }}</p>
                      @if (s.decidedAt) { <p class="mt-0.5 text-xs text-ink-muted">{{ formatDateTime(s.decidedAt) }}{{ s.comments ? ' — ' + s.comments : '' }}</p> }
                      @if (s.status === 'Pending') {
                        <div class="mt-2 flex flex-wrap gap-1.5">
                          <button type="button" class="amc-btn-primary amc-btn-sm" (click)="openDecision(s, 'Approved')">Approve</button>
                          <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="openDecision(s, 'Returned for Changes')">Return</button>
                          <button type="button" class="amc-btn-danger amc-btn-sm" (click)="openDecision(s, 'Rejected')">Reject</button>
                        </div>
                      }
                    </div>
                  </li>
                }
              </ol>
            </amc-panel>
          }
          <amc-panel title="Approval rules" description="Workflow levels are added by contract value, type, customer type, discount, margin, duration, risk and legal requirements" icon="sliders">
            <ul class="space-y-3 text-sm">
              <li><p class="font-medium text-ink">Approval Level 1 · Contract Manager</p><p class="text-xs text-ink-muted">All contracts, amendments and renewals.</p></li>
              <li><p class="font-medium text-ink">Approval Level 2 · Finance Manager</p><p class="text-xs text-ink-muted">Value ≥ 250,000, discount &gt; 10% or margin &lt; 20%; amendments with impact ≥ {{ threshold }}.</p></li>
              <li><p class="font-medium text-ink">Legal Approval · Legal Counsel</p><p class="text-xs text-ink-muted">High risk, unlimited liability / non-KSA law, framework, master, subcontractor or lease contracts.</p></li>
              <li><p class="font-medium text-ink">Management Approval · Operations Director</p><p class="text-xs text-ink-muted">Value ≥ 1,000,000, duration &gt; 36 months or Government customers.</p></li>
            </ul>
            <p class="mt-3 text-xs text-ink-subtle">{{ levels }} levels configured in contract.config.ts.</p>
          </amc-panel>
        </div>
      </div>
    </div>

    <amc-dialog size="sm" [title]="(decision()?.type === 'Approved' ? 'Approve' : decision()?.type === 'Rejected' ? 'Reject' : 'Return for changes') + ' · ' + (decision()?.step?.levelName ?? '')" [description]="decision()?.step ? decision()!.step.contractNumber + ' · ' + decision()!.step.subjectLabel : ''" [open]="!!decision()" (openChange)="!$event && decision.set(null)">
      <amc-form-field label="Comments" for="ap-comment" [required]="decision()?.type !== 'Approved'"><textarea id="ap-comment" class="amc-textarea min-h-20" [value]="comment()" (input)="comment.set($any($event.target).value)"></textarea></amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="decision.set(null)">Close</button>
        <button type="button" [class]="decision()?.type === 'Rejected' ? 'amc-btn-danger' : 'amc-btn-primary'" [disabled]="busy() || (decision()?.type !== 'Approved' && !comment().trim())" (click)="confirmDecision()">@if (busy()) { <amc-spinner [size]="14" /> } Confirm</button>
      </ng-container>
    </amc-dialog>

    <amc-dialog size="sm" title="Delegate approval" [description]="delegateStep()?.levelName ?? ''" [open]="!!delegateStep()" (openChange)="!$event && delegateStep.set(null)">
      <amc-form-field label="Delegated Approver" for="ap-delegate"><amc-select inputId="ap-delegate" [options]="refs.userOptions()" [(value)]="delegateTo" /></amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="delegateStep.set(null)">Close</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || !delegateTo()" (click)="confirmDelegate()">Delegate</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ApprovalsPage {
  private readonly api = inject(ApprovalApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(ContractReferenceStore);

  readonly contractId = input<string>();

  protected readonly approvals = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.approvals.hasValue() ? this.approvals.value() : []));
  protected readonly focus = linkedSignal<{ contractId: string | null; subjectId: string | null }>(() => ({ contractId: this.contractId() ?? null, subjectId: null }));
  protected readonly route = computed(() => {
    const f = this.focus();
    const list = this.rows().filter((a) => (f.subjectId ? a.subjectId === f.subjectId : a.contractId === f.contractId));
    const round = Math.max(0, ...list.filter((a) => a.subjectId === (f.subjectId ?? list[0]?.subjectId)).map((a) => a.round));
    const subject = f.subjectId ?? list.find((a) => a.status === 'Pending')?.subjectId ?? list[0]?.subjectId;
    return list.filter((a) => a.subjectId === subject && a.round === round).sort((a, b) => a.level - b.level);
  });
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.contractId() ? {} : { status: ['Pending'] }));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'status', label: 'Approval Status', type: 'multiselect', options: toOptions(APPROVAL_STEP_STATUSES) },
    { key: 'subject', label: 'Subject', type: 'multiselect', options: toOptions(['Contract', 'Amendment', 'Renewal'] as const) },
    { key: 'level', label: 'Approval Level', type: 'multiselect', options: APPROVAL_LEVELS.map((l) => ({ value: l.name, label: l.name })) },
    { key: 'approver', label: 'Approver', type: 'multiselect', options: this.refs.userOptions() },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const contractId = this.focus().contractId;
    return this.rows().filter(
      (a) =>
        (!contractId || a.contractId === contractId || !this.contractId()) &&
        (!term || `${a.contractNumber} ${a.contractTitle} ${a.approverName} ${a.comments}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'status', a.status) && matchesAny(f, 'subject', a.subject) && matchesAny(f, 'level', a.levelName) && (matchesAny(f, 'approver', a.approverId) || matchesAny(f, 'approver', a.delegateId)),
    );
  });
  protected readonly columns = approvalColumns();
  protected readonly trackById = (a: ApprovalListItem) => a.id;
  protected readonly rowActions = (a: ApprovalListItem): MenuItem[] => [
    { id: 'route', label: 'View Route', icon: 'eye' },
    ...(a.status === 'Pending'
      ? [
          { id: 'approve', label: 'Approve', icon: 'check-circle' as const, dividerBefore: true },
          { id: 'return', label: 'Return for Changes', icon: 'rotate-ccw' as const },
          { id: 'reject', label: 'Reject', icon: 'x' as const, danger: true },
        ]
      : []),
    ...(a.status === 'Pending' || a.status === 'Waiting' ? [{ id: 'delegate', label: 'Delegate', icon: 'user-check' as const, dividerBefore: true }] : []),
  ];
  protected readonly stepTone = STEP_TONE;
  protected readonly threshold = CONTRACT_RULES.amendmentFinanceThreshold.toLocaleString('en-US');
  protected readonly levels = APPROVAL_LEVELS.length;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDateTime = formatDateTime;
  protected readonly busy = signal(false);
  protected readonly decision = signal<{ step: ApprovalListItem; type: Decision } | null>(null);
  protected readonly comment = signal('');
  protected readonly delegateStep = signal<ApprovalListItem | null>(null);
  protected readonly delegateTo = signal<string | number | null>(null);

  protected onAction({ id, row }: RowAction<ApprovalListItem>): void {
    this.focus.set({ contractId: row.contractId, subjectId: row.subjectId });
    if (id === 'approve') this.openDecision(row, 'Approved');
    else if (id === 'reject') this.openDecision(row, 'Rejected');
    else if (id === 'return') this.openDecision(row, 'Returned for Changes');
    else if (id === 'delegate') {
      this.delegateTo.set(null);
      this.delegateStep.set(row);
    }
  }

  protected openDecision(step: ApprovalListItem, type: Decision): void {
    this.comment.set('');
    this.decision.set({ step, type });
  }

  protected async confirmDecision(): Promise<void> {
    const d = this.decision();
    if (d && (await this.exec(this.api.decide(d.step.id, d.type, this.comment()), `${d.step.levelName}: ${d.type.toLowerCase()}.`))) this.decision.set(null);
  }

  protected async confirmDelegate(): Promise<void> {
    const s = this.delegateStep();
    if (s && (await this.exec(this.api.delegate(s.id, String(this.delegateTo())), 'Approval delegated.'))) this.delegateStep.set(null);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.approvals.reload();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
