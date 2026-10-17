import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
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
import { formatFileSize } from '@shared/utils/format';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { requestColumns } from '../components/contract-columns';
import { ContractReferenceStore } from '../data/contract-reference.store';
import { ContractRequestApi } from '../data/contract.api';
import { CONTRACT_TYPES } from '../models/contract.model';
import { PRIORITIES, type Priority } from '../models/shared.model';
import { type Attachment, REQUEST_STATUSES, REQUEST_TYPES, type RequestListItem, type RequestType } from '../models/workflow.model';

/** SRS 5.6 — Contract Request → Review → Approval → Contract Creation. */
@Component({
  selector: 'amc-contract-requests-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, PageHeader, ReactiveFormsModule, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract Requests" subtitle="Initiate the contract process before the formal document is created." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'Requests' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> New Request</button>
      </amc-page-header>
      <ol class="flex flex-wrap items-center gap-2 text-xs text-ink-muted" aria-label="Workflow">
        @for (s of flow; track s; let last = $last) {
          <li class="flex items-center gap-2"><span class="rounded-full bg-surface-sunken px-2.5 py-1 font-medium">{{ s }}</span>@if (!last) { <amc-icon name="arrow-right" [size]="12" /> }</li>
        }
      </ol>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4">
          <amc-filter-bar searchPlaceholder="Search request number, customer or services…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" />
        </div>
        <amc-data-table tableId="contract-requests" [entity]="{ singular: 'request', plural: 'requests' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="requests.isLoading()" [actions]="rowActions" emptyIcon="inbox" emptyTitle="No requests" emptyMessage="Create a request to start a new contract, renewal or amendment." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" [title]="editing() ? 'Edit request ' + editing()!.number : 'New contract request'" description="Captured before the formal contract is drafted." [(open)]="formOpen">
      <form [formGroup]="form" id="request-form" novalidate (ngSubmit)="save(false)">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Customer" for="rq-customer" [control]="c.customerId"><amc-select inputId="rq-customer" formControlName="customerId" [options]="refs.customerOptions()" placeholder="Select customer…" /></amc-form-field>
          <amc-form-field label="Site" for="rq-site" [control]="c.siteId"><amc-select inputId="rq-site" formControlName="siteId" [options]="siteOptions()" [clearable]="true" placeholder="All / not specified" /></amc-form-field>
          <amc-form-field label="Request Type" for="rq-rtype" [control]="c.requestType"><amc-select inputId="rq-rtype" formControlName="requestType" [options]="requestTypeOptions" /></amc-form-field>
          <amc-form-field label="Contract Type" for="rq-ctype" [control]="c.contractType"><amc-select inputId="rq-ctype" formControlName="contractType" [options]="contractTypeOptions" /></amc-form-field>
          <amc-form-field label="Requested Start Date" for="rq-start" [control]="c.requestedStart"><amc-date-picker inputId="rq-start" formControlName="requestedStart" /></amc-form-field>
          <amc-form-field label="Requested End Date" for="rq-end" [control]="c.requestedEnd"><amc-date-picker inputId="rq-end" formControlName="requestedEnd" /></amc-form-field>
          <amc-form-field label="Estimated Contract Value" for="rq-value" [control]="c.estimatedValue"><input id="rq-value" type="number" min="0" class="amc-input tabular-nums" formControlName="estimatedValue" /></amc-form-field>
          <amc-form-field label="Currency" for="rq-cur" [control]="c.currency"><amc-select inputId="rq-cur" formControlName="currency" [options]="refs.currencyOptions()" /></amc-form-field>
          <amc-form-field label="Requested Services" for="rq-services" [control]="c.requestedServices" class="sm:col-span-2"><textarea id="rq-services" class="amc-textarea min-h-16" formControlName="requestedServices"></textarea></amc-form-field>
          <amc-form-field label="Required SLA" for="rq-sla" [control]="c.requiredSla"><amc-select inputId="rq-sla" formControlName="requiredSla" [options]="refs.slaOptions()" [clearable]="true" /></amc-form-field>
          <amc-form-field label="Required Entitlements" for="rq-ent" [control]="c.requiredEntitlements"><input id="rq-ent" class="amc-input" formControlName="requiredEntitlements" /></amc-form-field>
          <amc-form-field label="Business Justification" for="rq-just" [control]="c.justification" class="sm:col-span-2"><textarea id="rq-just" class="amc-textarea min-h-16" formControlName="justification"></textarea></amc-form-field>
          <amc-form-field label="Requested By" for="rq-by" [control]="c.requestedBy"><input id="rq-by" class="amc-input" formControlName="requestedBy" /></amc-form-field>
          <amc-form-field label="Contract Owner" for="rq-owner" [control]="c.ownerId"><amc-select inputId="rq-owner" formControlName="ownerId" [options]="refs.userOptions()" /></amc-form-field>
          <amc-form-field label="Priority" for="rq-priority" [control]="c.priority"><amc-select inputId="rq-priority" formControlName="priority" [options]="priorityOptions" /></amc-form-field>
          <div>
            <span class="amc-label">Attachments</span>
            <label for="rq-files" class="amc-btn-secondary amc-btn-sm mt-1.5 cursor-pointer"><amc-icon name="paperclip" [size]="14" /> Attach files<input id="rq-files" type="file" multiple class="sr-only" (change)="onFiles($event)" /></label>
            @for (f of attachments(); track f.id) { <p class="mt-1 truncate text-xs text-ink-muted">{{ f.name }} · {{ formatFileSize(f.size) }}</p> }
          </div>
          <amc-form-field label="Notes" for="rq-notes" [control]="c.notes" class="sm:col-span-2"><textarea id="rq-notes" class="amc-textarea min-h-16" formControlName="notes"></textarea></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="request-form" class="amc-btn-secondary" [disabled]="saving()">Save Draft</button>
        @if (!editing()) { <button type="button" class="amc-btn-primary" [disabled]="saving()" (click)="save(true)">@if (saving()) { <amc-spinner [size]="14" /> } Submit</button> }
      </ng-container>
    </amc-dialog>

    <amc-dialog size="sm" [title]="decision()?.title ?? ''" [open]="!!decision()" (openChange)="!$event && decision.set(null)">
      <amc-form-field label="Comment" for="rq-comment" [required]="decision()?.required ?? false">
        <textarea id="rq-comment" class="amc-textarea min-h-20" [value]="comment()" (input)="comment.set($any($event.target).value)"></textarea>
      </amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="decision.set(null)">Close</button>
        <button type="button" [class]="decision()?.danger ? 'amc-btn-danger' : 'amc-btn-primary'" [disabled]="saving() || (!!decision()?.required && !comment().trim())" (click)="confirmDecision()">{{ decision()?.confirm }}</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ContractRequestsPage {
  private readonly api = inject(ContractRequestApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(ContractReferenceStore);

  readonly action = input<string>();
  readonly customerId = input<string>();

  protected readonly flow = ['Contract Request', 'Review', 'Approval', 'Contract Creation'];
  protected readonly requests = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.requests.hasValue() ? this.requests.value() : []));
  protected readonly columns = requestColumns();
  protected readonly trackById = (r: RequestListItem) => r.id;
  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(REQUEST_STATUSES) },
    { key: 'type', label: 'Request Type', type: 'multiselect', options: toOptions(REQUEST_TYPES) },
    { key: 'contractType', label: 'Contract Type', type: 'multiselect', options: toOptions(CONTRACT_TYPES) },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: toOptions(PRIORITIES) },
    { key: 'owner', label: 'Contract Owner', type: 'multiselect', options: this.refs.userOptions() },
    { key: 'created', label: 'Created', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (r) =>
        (!term || `${r.number} ${r.customerName} ${r.requestedServices} ${r.justification}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'status', r.status) && matchesAny(f, 'type', r.requestType) && matchesAny(f, 'contractType', r.contractType) && matchesAny(f, 'customer', r.customerId) &&
        matchesAny(f, 'priority', r.priority) && matchesAny(f, 'owner', r.ownerId) && withinRange(f, 'created', r.createdAt),
    );
  });

  protected readonly rowActions = (r: RequestListItem): MenuItem[] => {
    const items: MenuItem[] = [];
    if (r.status === 'Draft' || r.status === 'Submitted') items.push({ id: 'edit', label: 'Edit', icon: 'pencil' });
    if (r.status === 'Draft') items.push({ id: 'submit', label: 'Submit', icon: 'send' });
    if (r.status === 'Submitted') items.push({ id: 'review', label: 'Start Review', icon: 'eye' });
    if (r.status === 'Submitted' || r.status === 'Under Review') items.push({ id: 'approve', label: 'Approve', icon: 'check-circle' }, { id: 'reject', label: 'Reject', icon: 'x', danger: true });
    if (r.status === 'Approved') items.push({ id: 'convert', label: 'Create Contract', icon: 'file-text' });
    if (r.convertedContractId) items.push({ id: 'open', label: 'Open Contract', icon: 'external-link' });
    if (['Draft', 'Submitted', 'Under Review', 'Approved'].includes(r.status)) items.push({ id: 'cancel', label: 'Cancel Request', icon: 'ban', danger: true, dividerBefore: true });
    return items;
  };

  // ----- Form -----------------------------------------------------------------
  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<RequestListItem | null>(null);
  protected readonly attachments = signal<readonly Attachment[]>([]);
  protected readonly requestTypeOptions = toOptions(REQUEST_TYPES);
  protected readonly contractTypeOptions = toOptions(CONTRACT_TYPES);
  protected readonly priorityOptions = toOptions(PRIORITIES);
  protected readonly formatFileSize = formatFileSize;
  protected readonly form = this.fb.group({
    customerId: this.fb.control('', Validators.required),
    siteId: this.fb.control(''),
    requestType: this.fb.control<RequestType>('New Contract', Validators.required),
    contractType: this.fb.control('AMC Contract', Validators.required),
    requestedStart: this.fb.control('', Validators.required),
    requestedEnd: this.fb.control('', Validators.required),
    estimatedValue: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    currency: this.fb.control('SAR', Validators.required),
    requestedServices: this.fb.control('', Validators.required),
    requiredSla: this.fb.control(''),
    requiredEntitlements: this.fb.control(''),
    justification: this.fb.control('', Validators.required),
    requestedBy: this.fb.control('', Validators.required),
    ownerId: this.fb.control('', Validators.required),
    priority: this.fb.control<Priority>('Medium'),
    notes: this.fb.control(''),
  });
  private readonly formCustomer = signal('');
  protected readonly siteOptions = computed(() => this.refs.siteOptions(this.formCustomer() || '__none__'));

  // ----- Decisions --------------------------------------------------------------
  protected readonly decision = signal<{ id: string; row: RequestListItem; title: string; confirm: string; danger: boolean; required: boolean } | null>(null);
  protected readonly comment = signal('');

  constructor() {
    this.form.controls.customerId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.formCustomer.set(id);
      const c = this.refs.customer(id);
      if (c && !this.editing()) this.form.patchValue({ currency: c.currency, ownerId: c.accountManagerId ?? this.form.controls.ownerId.value, siteId: '' });
    });
    effect(() => {
      if (this.action() === 'new') untracked(() => this.openForm(null));
    });
  }

  protected openForm(r: RequestListItem | null): void {
    this.editing.set(r);
    const today = new Date().toISOString().slice(0, 10);
    this.form.reset({
      customerId: r?.customerId ?? this.customerId() ?? '', siteId: r?.siteId ?? '', requestType: r?.requestType ?? 'New Contract', contractType: r?.contractType ?? 'AMC Contract',
      requestedStart: r?.requestedStart ?? today, requestedEnd: r?.requestedEnd ?? '', estimatedValue: r?.estimatedValue ?? null, currency: r?.currency ?? 'SAR', requestedServices: r?.requestedServices ?? '',
      requiredSla: r?.requiredSla ?? '', requiredEntitlements: r?.requiredEntitlements ?? '', justification: r?.justification ?? '', requestedBy: r?.requestedBy ?? this.refs.data().currentUser.name,
      ownerId: r?.ownerId ?? this.refs.data().currentUser.id, priority: r?.priority ?? 'Medium', notes: r?.notes ?? '',
    });
    this.formCustomer.set(this.form.controls.customerId.value);
    this.attachments.set(r?.attachments ?? []);
    this.formOpen.set(true);
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).map((f) => ({ id: `ATT-${Date.now()}-${f.name}`, name: f.name, size: f.size, type: f.type, uploadedBy: this.refs.data().currentUser.name, uploadedAt: new Date().toISOString() }));
    this.attachments.update((list) => [...list, ...files]);
    input.value = '';
  }

  protected async save(submit: boolean): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const payload = { ...v, siteId: v.siteId || null, requiredSla: v.requiredSla || null, estimatedValue: Number(v.estimatedValue), relatedContractId: this.editing()?.relatedContractId ?? null, attachments: this.attachments() };
    this.saving.set(true);
    try {
      const r = this.editing();
      const saved = await firstValueFrom(r ? this.api.update(r.id, payload) : this.api.create(payload, submit));
      this.notify.success(`${saved.number} ${r ? 'updated' : submit ? 'submitted' : 'saved as draft'}.`);
      this.formOpen.set(false);
      this.requests.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async onAction({ id, row }: RowAction<RequestListItem>): Promise<void> {
    switch (id) {
      case 'edit':
        return this.openForm(row);
      case 'submit':
        return this.exec(this.api.submit(row.id), `${row.number} submitted.`);
      case 'review':
        return this.exec(this.api.startReview(row.id), `${row.number} under review.`);
      case 'open':
        return void this.router.navigate(['/app/contracts', row.convertedContractId]);
      case 'convert':
        try {
          const contract = await firstValueFrom(this.api.convert(row.id));
          this.notify.success(`Contract ${contract.number} created from ${row.number}.`);
          void this.router.navigate(['/app/contracts', contract.id, 'edit']);
        } catch (error) {
          this.notify.error((error as Error).message);
        }
        return;
      default: {
        const meta = { approve: ['Approve request', 'Approve', false, false], reject: ['Reject request', 'Reject', true, true], cancel: ['Cancel request', 'Cancel request', true, false] } as const;
        const [title, confirm, danger, required] = meta[id as keyof typeof meta];
        this.comment.set('');
        this.decision.set({ id, row, title: `${title} ${row.number}`, confirm, danger, required });
      }
    }
  }

  protected async confirmDecision(): Promise<void> {
    const d = this.decision();
    if (!d) return;
    const work = d.id === 'cancel' ? this.api.cancel(d.row.id, this.comment()) : this.api.decide(d.row.id, d.id === 'approve', this.comment());
    await this.exec(work, `${d.row.number}: ${d.confirm.toLowerCase()} done.`);
    this.decision.set(null);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.requests.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected export(): void {
    downloadCsv(
      timestampedName('contract-requests', 'csv'),
      ['Request Number', 'Customer', 'Site', 'Request Type', 'Contract Type', 'Requested Start', 'Requested End', 'Estimated Value', 'Currency', 'Requested Services', 'Required SLA', 'Required Entitlements', 'Business Justification', 'Requested By', 'Contract Owner', 'Priority', 'Status', 'Contract'],
      this.filtered().map((r) => [r.number, r.customerName, r.siteName, r.requestType, r.contractType, r.requestedStart, r.requestedEnd, r.estimatedValue, r.currency, r.requestedServices, r.requiredSla, r.requiredEntitlements, r.justification, r.requestedBy, r.ownerName, r.priority, r.status, r.convertedNumber]),
    );
  }
}
