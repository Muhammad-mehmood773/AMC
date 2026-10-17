import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { formatFileSize } from '@shared/utils/format';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { obligationColumns } from '../components/contract-columns';
import { ContractReferenceStore } from '../data/contract-reference.store';
import { ContractApi, type FileInput, ObligationApi } from '../data/contract.api';
import { PRIORITIES, type Priority } from '../models/shared.model';
import { OBLIGATION_FREQUENCIES, OBLIGATION_STATUSES, OBLIGATION_TYPES, type ObligationListItem, type ObligationStatus, type ObligationType, RESPONSIBLE_PARTIES } from '../models/workflow.model';

@Component({
  selector: 'amc-obligations-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, KpiCard, PageHeader, ReactiveFormsModule, Select, Spinner, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract Obligations" subtitle="Commitments that must be fulfilled during the contract lifecycle — traceable to the originating contract." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'Obligations' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Create Obligation</button>
      </amc-page-header>
      <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <amc-kpi-card label="Pending" icon="clock" [value]="count('Pending')" />
        <amc-kpi-card label="In Progress" icon="activity" tone="info" [value]="count('In Progress')" />
        <amc-kpi-card label="Overdue" icon="alert-triangle" tone="danger" [value]="count('Overdue')" [hint]="escalated() + ' escalated'" />
        <amc-kpi-card label="Due in 14 days" icon="calendar" tone="warn" [value]="dueSoon()" />
        <amc-kpi-card label="Completed" icon="check-circle" tone="ok" [value]="count('Completed')" />
      </section>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search obligation, contract or customer…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="contract-obligations-all" [entity]="{ singular: 'obligation', plural: 'obligations' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="obligations.isLoading()" [actions]="rowActions" emptyIcon="clipboard-list" emptyTitle="No obligations match" emptyMessage="Try a different search or clear the filters." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Edit ' + editing()!.number : 'Create obligation'" [(open)]="formOpen">
      <form [formGroup]="form" id="obligation-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Contract" for="ob-contract" [control]="c.contractId" class="sm:col-span-2"><amc-select inputId="ob-contract" formControlName="contractId" [options]="contractOptions()" placeholder="Select contract…" /></amc-form-field>
          <amc-form-field label="Obligation Type" for="ob-type" [control]="c.type"><amc-select inputId="ob-type" formControlName="type" [options]="typeOptions" /></amc-form-field>
          <amc-form-field label="Priority" for="ob-priority" [control]="c.priority"><amc-select inputId="ob-priority" formControlName="priority" [options]="priorityOptions" /></amc-form-field>
          <amc-form-field label="Description" for="ob-desc" [control]="c.description" class="sm:col-span-2"><textarea id="ob-desc" class="amc-textarea min-h-16" formControlName="description"></textarea></amc-form-field>
          <amc-form-field label="Responsible Party" for="ob-party" [control]="c.responsibleParty"><amc-select inputId="ob-party" formControlName="responsibleParty" [options]="partyOptions" /></amc-form-field>
          <amc-form-field label="Responsible User" for="ob-user" [control]="c.responsibleUserId"><amc-select inputId="ob-user" formControlName="responsibleUserId" [options]="refs.userOptions()" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Due Date" for="ob-due" [control]="c.dueDate"><amc-date-picker inputId="ob-due" formControlName="dueDate" /></amc-form-field>
          <amc-form-field label="Frequency" for="ob-freq" [control]="c.frequency" hint="Recurring obligations schedule their next occurrence on completion."><amc-select inputId="ob-freq" formControlName="frequency" [options]="frequencyOptions" /></amc-form-field>
          <amc-form-field label="Status" for="ob-status" [control]="c.status"><amc-select inputId="ob-status" formControlName="status" [options]="formStatusOptions" /></amc-form-field>
          <div class="flex items-end pb-1"><amc-switch formControlName="evidenceRequired" label="Evidence Required" description="Completion requires uploaded evidence." /></div>
          <amc-form-field label="Notes" for="ob-notes" [control]="c.notes" class="sm:col-span-2"><textarea id="ob-notes" class="amc-textarea min-h-16" formControlName="notes"></textarea></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="obligation-form" class="amc-btn-primary" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>

    <amc-dialog size="md" [title]="'Complete ' + (completing()?.number ?? '')" [description]="completing()?.description ?? ''" [open]="!!completing()" (openChange)="!$event && completing.set(null)">
      <div class="space-y-3">
        @if (completing()?.evidenceRequired) { <p class="rounded-lg border border-warn/30 bg-warn-subtle px-3 py-2 text-xs text-ink">Evidence is required to complete this obligation.</p> }
        <label for="ob-evidence" class="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line-strong bg-surface-muted px-4 py-5 text-center hover:border-brand hover:bg-brand-subtle">
          <amc-icon name="upload" class="text-ink-subtle" /><span class="text-sm font-medium text-ink">Upload evidence</span>
          <input id="ob-evidence" type="file" multiple class="sr-only" (change)="onEvidence($event)" />
        </label>
        @for (f of evidence(); track f.name) { <p class="truncate text-xs text-ink-muted">{{ f.name }} · {{ formatFileSize(f.size) }}</p> }
        @for (f of completing()?.evidence ?? []; track f.id) { <p class="truncate text-xs text-ink-muted">✓ {{ f.name }} (already uploaded)</p> }
        <amc-form-field label="Completion notes" for="ob-cnotes"><textarea id="ob-cnotes" class="amc-textarea min-h-16" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea></amc-form-field>
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="completing.set(null)">Close</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="complete()">@if (busy()) { <amc-spinner [size]="14" /> } Mark Completed</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ObligationsPage {
  private readonly api = inject(ObligationApi);
  private readonly contractsApi = inject(ContractApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(ContractReferenceStore);

  readonly contractId = input<string>();
  readonly action = input<string>();

  protected readonly obligations = rxResource({ stream: () => this.api.list() });
  private readonly contracts = rxResource({ stream: () => this.contractsApi.list() });
  protected readonly rows = computed(() => (this.obligations.hasValue() ? this.obligations.value() : []));
  protected readonly contractOptions = computed(() => (this.contracts.hasValue() ? this.contracts.value() : []).filter((c) => !['Cancelled', 'Archived'].includes(c.status)).map((c) => ({ value: c.id, label: `${c.number} · ${c.title}`, hint: c.customerName ?? '' })));
  protected readonly columns = obligationColumns();
  protected readonly trackById = (o: ObligationListItem) => o.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.contractId() ? { contract: [this.contractId()!] } : { status: ['Pending', 'In Progress', 'Overdue'] }));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'contract', label: 'Contract', type: 'multiselect', options: this.contractOptions() },
    { key: 'type', label: 'Obligation Type', type: 'multiselect', options: this.typeOptions },
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(OBLIGATION_STATUSES) },
    { key: 'party', label: 'Responsible Party', type: 'multiselect', options: this.partyOptions },
    { key: 'user', label: 'Responsible User', type: 'multiselect', options: this.refs.userOptions() },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: this.priorityOptions },
    { key: 'due', label: 'Due Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (o) =>
        (!term || `${o.number} ${o.type} ${o.description} ${o.contractNumber} ${o.customerName ?? ''}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'contract', o.contractId) && matchesAny(f, 'type', o.type) && matchesAny(f, 'status', o.effectiveStatus) && matchesAny(f, 'party', o.responsibleParty) &&
        matchesAny(f, 'user', o.responsibleUserId) && matchesAny(f, 'priority', o.priority) && withinRange(f, 'due', o.dueDate),
    );
  });
  protected count(status: ObligationStatus): number {
    return this.rows().filter((o) => o.effectiveStatus === status).length;
  }
  protected readonly escalated = computed(() => this.rows().filter((o) => o.escalated && o.effectiveStatus === 'Overdue').length);
  protected readonly dueSoon = computed(() => this.rows().filter((o) => (o.effectiveStatus === 'Pending' || o.effectiveStatus === 'In Progress') && o.daysToDue <= 14).length);
  protected readonly rowActions = (o: ObligationListItem): MenuItem[] => {
    const open = o.status === 'Pending' || o.status === 'In Progress';
    return [
      { id: 'edit', label: 'Edit / Assign', icon: 'pencil', disabled: !open },
      ...(o.status === 'Pending' ? [{ id: 'start', label: 'Start', icon: 'play' as const }] : []),
      ...(open ? [{ id: 'complete', label: 'Upload Evidence & Complete', icon: 'check-circle' as const }] : []),
      ...(o.effectiveStatus === 'Overdue' && !o.escalated ? [{ id: 'escalate', label: 'Escalate Overdue', icon: 'alert-triangle' as const, danger: true }] : []),
      ...(open ? [{ id: 'waive', label: 'Waive', icon: 'ban' as const, dividerBefore: true }] : []),
    ];
  };

  protected readonly typeOptions = toOptions(OBLIGATION_TYPES);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly partyOptions = toOptions(RESPONSIBLE_PARTIES);
  protected readonly frequencyOptions = toOptions(OBLIGATION_FREQUENCIES);
  protected readonly formStatusOptions = toOptions(['Pending', 'In Progress'] as const);
  protected readonly formatFileSize = formatFileSize;
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ObligationListItem | null>(null);
  protected readonly completing = signal<ObligationListItem | null>(null);
  protected readonly evidence = signal<FileInput[]>([]);
  protected readonly notes = signal('');
  protected readonly form = this.fb.group({
    contractId: this.fb.control('', Validators.required),
    type: this.fb.control<ObligationType>('Service Obligation', Validators.required),
    description: this.fb.control('', Validators.required),
    responsibleParty: this.fb.control('Company', Validators.required),
    responsibleUserId: this.fb.control(''),
    dueDate: this.fb.control('', Validators.required),
    frequency: this.fb.control('One-Time'),
    priority: this.fb.control<Priority>('Medium'),
    status: this.fb.control<ObligationStatus>('Pending'),
    evidenceRequired: this.fb.control(true),
    notes: this.fb.control(''),
  });

  constructor() {
    effect(() => {
      if (this.action() === 'new') untracked(() => this.openForm(null));
    });
  }

  protected openForm(o: ObligationListItem | null): void {
    this.editing.set(o);
    this.form.reset({
      contractId: o?.contractId ?? this.contractId() ?? '', type: o?.type ?? 'Service Obligation', description: o?.description ?? '', responsibleParty: o?.responsibleParty ?? 'Company', responsibleUserId: o?.responsibleUserId ?? '',
      dueDate: o?.dueDate ?? '', frequency: o?.frequency ?? 'One-Time', priority: o?.priority ?? 'Medium', status: o?.status === 'In Progress' ? 'In Progress' : 'Pending', evidenceRequired: o?.evidenceRequired ?? true, notes: o?.notes ?? '',
    });
    if (o) this.form.controls.contractId.disable();
    else this.form.controls.contractId.enable();
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const input = { ...v, responsibleUserId: v.responsibleUserId || null };
    const o = this.editing();
    if (await this.exec(o ? this.api.update(o.id, input) : this.api.create(input), o ? `${o.number} updated.` : 'Obligation created.')) this.formOpen.set(false);
  }

  protected onEvidence(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.evidence.update((list) => [...list, ...Array.from(input.files ?? []).map((f) => ({ name: f.name, size: f.size, mime: f.type || 'application/octet-stream' }))]);
    input.value = '';
  }

  protected async complete(): Promise<void> {
    const o = this.completing();
    if (o && (await this.exec(this.api.complete(o.id, this.evidence(), this.notes()), `${o.number} completed.`))) this.completing.set(null);
  }

  protected async onAction({ id, row }: RowAction<ObligationListItem>): Promise<void> {
    switch (id) {
      case 'edit':
        return this.openForm(row);
      case 'complete':
        this.evidence.set([]);
        this.notes.set('');
        this.completing.set(row);
        return;
      case 'start':
        await this.exec(this.api.start(row.id), `${row.number} started.`);
        return;
      case 'escalate':
        await this.exec(this.api.escalate(row.id), `${row.number} escalated.`);
        return;
      case 'waive':
        await this.exec(this.api.waive(row.id, 'Waived by contract manager.'), `${row.number} waived.`);
        return;
    }
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.obligations.reload();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('contract-obligations', 'csv'), ['Obligation Number', 'Contract', 'Customer', 'Obligation Type', 'Description', 'Responsible Party', 'Responsible User', 'Due Date', 'Frequency', 'Priority', 'Status', 'Evidence Required', 'Completion Date', 'Notes'],
      this.filtered().map((o) => [o.number, o.contractNumber, o.customerName, o.type, o.description, o.responsibleParty, o.responsibleUserName, o.dueDate, o.frequency, o.priority, o.effectiveStatus, o.evidenceRequired ? 'Yes' : 'No', o.completionDate, o.notes]));
  }
}
