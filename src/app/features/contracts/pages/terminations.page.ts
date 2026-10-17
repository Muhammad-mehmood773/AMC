import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { terminationColumns } from '../components/contract-columns';
import { ContractApi, TerminationApi } from '../data/contract.api';
import { ALLOWED_ACTIONS } from '../data/contract.config';
import { TERMINATION_FLOW, TERMINATION_STATUSES, TERMINATION_TYPES, type TerminationListItem, type TerminationType } from '../models/workflow.model';

const NEXT_LABEL: Record<string, string> = {
  Requested: 'Start Review',
  'Under Review': 'Approve Termination',
  Approved: 'Issue Notice',
  'Notice Issued': 'Final Service / Billing',
  'Final Service': 'Settlement',
  Settlement: 'Close Contract',
};

/** SRS 5.17 — controlled termination: request → review → approval → notice → final service → settlement → closure → archive. */
@Component({
  selector: 'amc-terminations-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, PageHeader, ReactiveFormsModule, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract Termination" subtitle="Controlled termination — historical data is always preserved." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'Terminations' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-danger" (click)="openForm()"><amc-icon name="ban" /> Termination Request</button>
      </amc-page-header>
      <ol class="flex flex-wrap items-center gap-2 text-xs text-ink-muted" aria-label="Workflow">
        @for (s of flow; track s; let last = $last) { <li class="flex items-center gap-2"><span class="rounded-full bg-surface-sunken px-2.5 py-1 font-medium">{{ s }}</span>@if (!last) { <amc-icon name="arrow-right" [size]="12" /> }</li> }
        <li class="flex items-center gap-2"><amc-icon name="arrow-right" [size]="12" /><span class="rounded-full bg-surface-sunken px-2.5 py-1 font-medium">Archive</span></li>
      </ol>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search termination, contract or reason…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="contract-terminations" [entity]="{ singular: 'termination', plural: 'terminations' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="terminations.isLoading()" [actions]="rowActions" emptyIcon="ban" emptyTitle="No terminations" emptyMessage="Termination requests appear here." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" title="Termination request" [(open)]="formOpen">
      <form [formGroup]="form" id="termination-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Contract" for="tm-contract" [control]="c.contractId" class="sm:col-span-2"><amc-select inputId="tm-contract" formControlName="contractId" [options]="contractOptions()" placeholder="Select contract…" /></amc-form-field>
          <amc-form-field label="Termination Type" for="tm-type" [control]="c.type"><amc-select inputId="tm-type" formControlName="type" [options]="typeOptions" /></amc-form-field>
          <amc-form-field label="Termination Date" for="tm-date" [control]="c.terminationDate"><amc-date-picker inputId="tm-date" formControlName="terminationDate" /></amc-form-field>
          <amc-form-field label="Requested By" for="tm-by" [control]="c.requestedBy"><input id="tm-by" class="amc-input" formControlName="requestedBy" /></amc-form-field>
          <amc-form-field label="Notice Period (days)" for="tm-notice" [control]="c.noticePeriodDays"><input id="tm-notice" type="number" min="0" class="amc-input tabular-nums" formControlName="noticePeriodDays" /></amc-form-field>
          <amc-form-field label="Termination Reason" for="tm-reason" [control]="c.reason" class="sm:col-span-2"><textarea id="tm-reason" class="amc-textarea min-h-16" formControlName="reason"></textarea></amc-form-field>
          <amc-form-field label="Outstanding Amount" for="tm-out" [control]="c.outstandingAmount"><input id="tm-out" type="number" min="0" class="amc-input tabular-nums" formControlName="outstandingAmount" /></amc-form-field>
          <amc-form-field label="Final Service Date" for="tm-final" [control]="c.finalServiceDate"><amc-date-picker inputId="tm-final" formControlName="finalServiceDate" /></amc-form-field>
          <amc-form-field label="Financial Settlement" for="tm-settle" [control]="c.financialSettlement" class="sm:col-span-2"><textarea id="tm-settle" class="amc-textarea min-h-16" formControlName="financialSettlement"></textarea></amc-form-field>
          <div>
            <span class="amc-label">Termination Document</span>
            <label for="tm-doc" class="amc-btn-secondary amc-btn-sm mt-1.5 cursor-pointer"><amc-icon name="paperclip" [size]="14" /> {{ docFile()?.name || 'Attach notice' }}<input id="tm-doc" type="file" class="sr-only" (change)="onDoc($event)" /></label>
          </div>
          <amc-form-field label="Notes" for="tm-notes" [control]="c.notes"><textarea id="tm-notes" class="amc-textarea min-h-16" formControlName="notes"></textarea></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="termination-form" class="amc-btn-danger" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Submit Request</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class TerminationsPage {
  private readonly api = inject(TerminationApi);
  private readonly contractsApi = inject(ContractApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);

  readonly contractId = input<string>();
  readonly action = input<string>();

  protected readonly flow = TERMINATION_FLOW.map((s) => (s === 'Requested' ? 'Termination Request' : s === 'Under Review' ? 'Review' : s === 'Approved' ? 'Approval' : s === 'Notice Issued' ? 'Notice' : s === 'Final Service' ? 'Final Service / Billing' : s === 'Closed' ? 'Contract Closure' : s));
  protected readonly terminations = rxResource({ stream: () => this.api.list() });
  private readonly contracts = rxResource({ stream: () => this.contractsApi.list() });
  protected readonly rows = computed(() => (this.terminations.hasValue() ? this.terminations.value() : []));
  private readonly contractList = computed(() => (this.contracts.hasValue() ? this.contracts.value() : []));
  protected readonly contractOptions = computed(() => this.contractList().filter((c) => ALLOWED_ACTIONS['terminate'].includes(c.effectiveStatus)).map((c) => ({ value: c.id, label: `${c.number} · ${c.title}`, hint: c.customerName ?? '' })));
  protected readonly columns = terminationColumns();
  protected readonly trackById = (t: TerminationListItem) => t.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.contractId() ? { contract: [this.contractId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'contract', label: 'Contract', type: 'multiselect', options: this.contractList().map((c) => ({ value: c.id, label: `${c.number} · ${c.title}` })) },
    { key: 'type', label: 'Termination Type', type: 'multiselect', options: this.typeOptions },
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(TERMINATION_STATUSES) },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((t) => (!term || `${t.number} ${t.contractNumber} ${t.reason}`.toLowerCase().includes(term)) && matchesAny(f, 'contract', t.contractId) && matchesAny(f, 'type', t.type) && matchesAny(f, 'status', t.status));
  });
  protected readonly rowActions = (t: TerminationListItem): MenuItem[] => [
    ...(NEXT_LABEL[t.status] ? [{ id: 'advance', label: NEXT_LABEL[t.status], icon: 'arrow-right' as const, danger: t.status === 'Settlement' }] : []),
    { id: 'contract', label: 'Open Contract', icon: 'external-link' },
    ...(t.status === 'Requested' || t.status === 'Under Review' ? [{ id: 'reject', label: 'Reject', icon: 'x' as const, dividerBefore: true }] : []),
  ];

  protected readonly typeOptions = toOptions(TERMINATION_TYPES);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly docFile = signal<File | null>(null);
  protected readonly form = this.fb.group({
    contractId: this.fb.control('', Validators.required),
    type: this.fb.control<TerminationType>('Customer Termination', Validators.required),
    terminationDate: this.fb.control('', Validators.required),
    requestedBy: this.fb.control('', Validators.required),
    reason: this.fb.control('', Validators.required),
    noticePeriodDays: this.fb.control(60, [Validators.required, Validators.min(0)]),
    financialSettlement: this.fb.control(''),
    outstandingAmount: this.fb.control(0, Validators.min(0)),
    finalServiceDate: this.fb.control('', Validators.required),
    notes: this.fb.control(''),
  });

  constructor() {
    this.form.controls.contractId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const c = this.contractList().find((x) => x.id === id);
      if (!c) return;
      const date = new Date(Date.now() + c.period.noticePeriodDays * 86_400_000).toISOString().slice(0, 10);
      const end = date < c.period.endDate ? date : c.period.endDate;
      this.form.patchValue({ requestedBy: c.customerName ?? '', noticePeriodDays: c.period.noticePeriodDays, outstandingAmount: c.outstanding, terminationDate: end, finalServiceDate: end });
    });
    effect(() => {
      if (this.action() === 'new' && this.contractList().length) untracked(() => this.openForm());
    });
  }

  protected openForm(): void {
    this.form.reset({ contractId: '', type: 'Customer Termination', terminationDate: '', requestedBy: '', reason: '', noticePeriodDays: 60, financialSettlement: '', outstandingAmount: 0, finalServiceDate: '', notes: '' });
    this.docFile.set(null);
    if (this.contractId()) this.form.controls.contractId.setValue(this.contractId()!);
    this.formOpen.set(true);
  }

  protected onDoc(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.docFile.set(input.files?.[0] ?? null);
    input.value = '';
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    try {
      const file = this.docFile();
      const doc = file ? await firstValueFrom(this.contractsApi.uploadDocument(v.contractId, 'Termination Notice', { name: file.name, size: file.size, mime: file.type || 'application/pdf' })) : null;
      const t = await firstValueFrom(this.api.create({ ...v, outstandingAmount: Number(v.outstandingAmount) || 0, noticePeriodDays: Number(v.noticePeriodDays), documentId: doc?.id ?? null }));
      this.notify.success(`${t.number} requested${t.outstandingObligations ? ` — ${t.outstandingObligations} open obligation(s) to settle` : ''}.`);
      this.formOpen.set(false);
      this.terminations.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async onAction({ id, row }: RowAction<TerminationListItem>): Promise<void> {
    if (id === 'contract') return void this.router.navigate(['/app/contracts', row.contractId]);
    if (id === 'reject') return this.exec(this.api.reject(row.id, 'Rejected after review.'), `${row.number} rejected.`);
    if (row.status === 'Settlement' && !(await this.confirm.open({ title: 'Close and terminate contract?', message: `${row.contractNumber} becomes Terminated. Open obligations, amendments and renewals are cancelled; all history is preserved.`, confirmLabel: 'Terminate', danger: true }))) return;
    await this.exec(this.api.advance(row.id), `${row.number}: ${NEXT_LABEL[row.status].toLowerCase()} done.`);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.terminations.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('contract-terminations', 'csv'), ['Termination Number', 'Contract', 'Termination Type', 'Termination Date', 'Requested By', 'Approved By', 'Reason', 'Notice Period', 'Financial Settlement', 'Outstanding Amount', 'Outstanding Obligations', 'Final Service Date', 'Status', 'Notes'],
      this.filtered().map((t) => [t.number, t.contractNumber, t.type, t.terminationDate, t.requestedBy, t.approvedBy, t.reason, t.noticePeriodDays, t.financialSettlement, t.outstandingAmount, t.outstandingObligations, t.finalServiceDate, t.status, t.notes]));
  }
}
