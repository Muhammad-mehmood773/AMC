import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
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
import { MultiSelect, Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { formatCurrency } from '@shared/utils/format';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { type Observable, firstValueFrom } from 'rxjs';
import { amendmentColumns } from '../components/contract-columns';
import { ContractReferenceStore } from '../data/contract-reference.store';
import { AmendmentApi, ContractApi } from '../data/contract.api';
import { ALLOWED_ACTIONS } from '../data/contract.config';
import { AMENDMENT_STATUSES, AMENDMENT_TYPES, type AmendmentChanges, type AmendmentListItem, type AmendmentType } from '../models/workflow.model';

const NEXT_LABEL: Record<string, string> = { Requested: 'Start Review', 'Under Review': 'Move to Negotiation', 'Under Negotiation': 'Submit for Approval' };

@Component({
  selector: 'amc-amendments-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, MultiSelect, PageHeader, ReactiveFormsModule, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract Amendments" subtitle="Changes to active or executed contracts — each executed amendment creates a traceable new version." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'Amendments' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm()"><amc-icon name="plus" /> Request Amendment</button>
      </amc-page-header>
      <ol class="flex flex-wrap items-center gap-2 text-xs text-ink-muted" aria-label="Workflow">
        @for (s of flow; track s; let last = $last) { <li class="flex items-center gap-2"><span class="rounded-full bg-surface-sunken px-2.5 py-1 font-medium">{{ s }}</span>@if (!last) { <amc-icon name="arrow-right" [size]="12" /> }</li> }
      </ol>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search amendment, contract, reason or terms…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="contract-amendments" [entity]="{ singular: 'amendment', plural: 'amendments' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="amendments.isLoading()" [actions]="rowActions" emptyIcon="layers" emptyTitle="No amendments" emptyMessage="Request an amendment from an active contract." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="lg" title="Request amendment" description="The original contract version remains preserved." [(open)]="formOpen">
      <form [formGroup]="form" id="amendment-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Contract" for="am-contract" [control]="c.contractId" class="sm:col-span-2"><amc-select inputId="am-contract" formControlName="contractId" [options]="contractOptions()" placeholder="Select active contract…" /></amc-form-field>
          <amc-form-field label="Amendment Type" for="am-type" [control]="c.type"><amc-select inputId="am-type" formControlName="type" [options]="typeOptions" /></amc-form-field>
          <amc-form-field label="Effective Date" for="am-eff" [control]="c.effectiveDate"><amc-date-picker inputId="am-eff" formControlName="effectiveDate" /></amc-form-field>
          <amc-form-field label="Requested By" for="am-by" [control]="c.requestedBy"><input id="am-by" class="amc-input" formControlName="requestedBy" /></amc-form-field>
          <amc-form-field label="Commercial Impact" for="am-impact" [control]="c.commercialImpact" hint="Positive for increases, negative for reductions."><input id="am-impact" type="number" class="amc-input tabular-nums" formControlName="commercialImpact" /></amc-form-field>
          <amc-form-field label="Reason" for="am-reason" [control]="c.reason" class="sm:col-span-2"><textarea id="am-reason" class="amc-textarea min-h-16" formControlName="reason"></textarea></amc-form-field>

          <div class="sm:col-span-2 rounded-xl border border-line bg-surface-muted p-3">
            <p class="amc-overline">Change applied on execution</p>
            <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              @switch (changeKind()) {
                @case ('value') { <amc-form-field label="New Contract Value" for="am-value"><input id="am-value" type="number" min="0" class="amc-input tabular-nums" [value]="newValue() ?? ''" (input)="newValue.set(+$any($event.target).value)" /></amc-form-field> }
                @case ('end') { <amc-form-field label="New End Date" for="am-end"><amc-date-picker inputId="am-end" [(value)]="newEnd" /></amc-form-field> }
                @case ('sla') { <amc-form-field label="New SLA" for="am-sla"><amc-select inputId="am-sla" [options]="refs.slaOptions()" [(value)]="newSla" /></amc-form-field> }
                @case ('sites') { <amc-form-field [label]="c.type.value === 'Site Addition' ? 'Sites to add' : 'Sites to remove'" for="am-sites" class="sm:col-span-2"><amc-multi-select inputId="am-sites" [options]="siteChoices()" [(value)]="changeIds" [maxChips]="4" /></amc-form-field> }
                @case ('assets') { <amc-form-field [label]="c.type.value === 'Asset Addition' ? 'Assets to add' : 'Assets to remove'" for="am-assets" class="sm:col-span-2"><amc-multi-select inputId="am-assets" [options]="assetChoices()" [(value)]="changeIds" [maxChips]="4" /></amc-form-field> }
                @case ('services') { <amc-form-field label="Services to add" for="am-svc" class="sm:col-span-2"><amc-multi-select inputId="am-svc" [options]="refs.serviceOptions()" [(value)]="changeIds" [maxChips]="4" /></amc-form-field> }
                @default { <p class="text-xs text-ink-muted sm:col-span-2">This amendment type records new terms only.</p> }
              }
            </div>
          </div>

          <amc-form-field label="Previous Terms" for="am-prev" [control]="c.previousTerms"><textarea id="am-prev" class="amc-textarea min-h-16" formControlName="previousTerms"></textarea></amc-form-field>
          <amc-form-field label="New Terms" for="am-new" [control]="c.newTerms"><textarea id="am-new" class="amc-textarea min-h-16" formControlName="newTerms"></textarea></amc-form-field>
          <amc-form-field label="Service Impact" for="am-svcimpact" [control]="c.serviceImpact"><input id="am-svcimpact" class="amc-input" formControlName="serviceImpact" /></amc-form-field>
          <div>
            <span class="amc-label">Document</span>
            <label for="am-doc" class="amc-btn-secondary amc-btn-sm mt-1.5 cursor-pointer"><amc-icon name="paperclip" [size]="14" /> {{ docName() || 'Attach amendment document' }}<input id="am-doc" type="file" class="sr-only" (change)="onDoc($event)" /></label>
          </div>
          <amc-form-field label="Notes" for="am-notes" [control]="c.notes" class="sm:col-span-2"><textarea id="am-notes" class="amc-textarea min-h-16" formControlName="notes"></textarea></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="amendment-form" class="amc-btn-primary" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Submit Request</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class AmendmentsPage {
  private readonly api = inject(AmendmentApi);
  private readonly contractsApi = inject(ContractApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(ContractReferenceStore);

  readonly contractId = input<string>();
  readonly action = input<string>();

  protected readonly flow = ['Amendment Request', 'Review', 'Negotiation', 'Approval', 'Execution', 'Contract Update', 'Audit History'];
  protected readonly amendments = rxResource({ stream: () => this.api.list() });
  private readonly contracts = rxResource({ stream: () => this.contractsApi.list() });
  protected readonly rows = computed(() => (this.amendments.hasValue() ? this.amendments.value() : []));
  private readonly contractList = computed(() => (this.contracts.hasValue() ? this.contracts.value() : []));
  protected readonly contractOptions = computed(() => this.contractList().filter((c) => ALLOWED_ACTIONS['amend'].includes(c.effectiveStatus)).map((c) => ({ value: c.id, label: `${c.number} · ${c.title}`, hint: c.customerName ?? '' })));
  protected readonly columns = amendmentColumns();
  protected readonly trackById = (a: AmendmentListItem) => a.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.contractId() ? { contract: [this.contractId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'contract', label: 'Contract', type: 'multiselect', options: this.contractList().map((c) => ({ value: c.id, label: `${c.number} · ${c.title}` })) },
    { key: 'type', label: 'Amendment Type', type: 'multiselect', options: this.typeOptions },
    { key: 'status', label: 'Approval Status', type: 'multiselect', options: toOptions(AMENDMENT_STATUSES) },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((a) => (!term || `${a.number} ${a.contractNumber} ${a.reason} ${a.previousTerms} ${a.newTerms}`.toLowerCase().includes(term)) && matchesAny(f, 'contract', a.contractId) && matchesAny(f, 'type', a.type) && matchesAny(f, 'status', a.status));
  });
  protected readonly rowActions = (a: AmendmentListItem): MenuItem[] => [
    ...(NEXT_LABEL[a.status] ? [{ id: 'advance', label: NEXT_LABEL[a.status], icon: 'arrow-right' as const }] : []),
    ...(a.status === 'Pending Approval' ? [{ id: 'approvals', label: 'View Approval', icon: 'check-circle' as const }] : []),
    ...(a.status === 'Approved' ? [{ id: 'execute', label: 'Execute Amendment', icon: 'pen-tool' as const }] : []),
    { id: 'contract', label: 'Open Contract', icon: 'external-link' },
    ...(!['Executed', 'Rejected', 'Cancelled'].includes(a.status) ? [{ id: 'cancel', label: 'Cancel', icon: 'x' as const, danger: true, dividerBefore: true }] : []),
  ];

  protected readonly typeOptions = toOptions(AMENDMENT_TYPES);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly form = this.fb.group({
    contractId: this.fb.control('', Validators.required),
    type: this.fb.control<AmendmentType>('Price Change', Validators.required),
    effectiveDate: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    requestedBy: this.fb.control('', Validators.required),
    reason: this.fb.control('', Validators.required),
    previousTerms: this.fb.control(''),
    newTerms: this.fb.control('', Validators.required),
    commercialImpact: this.fb.control(0),
    serviceImpact: this.fb.control(''),
    notes: this.fb.control(''),
  });
  private readonly formContract = signal('');
  private readonly formType = signal<AmendmentType>('Price Change');
  protected readonly newValue = signal<number | null>(null);
  protected readonly newEnd = signal('');
  protected readonly newSla = signal<string | number | null>(null);
  protected readonly changeIds = signal<readonly (string | number)[]>([]);
  protected readonly docFile = signal<File | null>(null);
  protected readonly docName = computed(() => this.docFile()?.name ?? '');
  protected readonly changeKind = computed(() => {
    const t = this.formType();
    if (t === 'Price Change' || t === 'Commercial Change' || t === 'Scope Change') return 'value';
    if (t === 'Duration Extension') return 'end';
    if (t === 'SLA Change') return 'sla';
    if (t === 'Site Addition' || t === 'Site Removal') return 'sites';
    if (t === 'Asset Addition' || t === 'Asset Removal') return 'assets';
    if (t === 'Service Change') return 'services';
    return 'none';
  });
  private readonly selectedContract = computed(() => this.contractList().find((c) => c.id === this.formContract()));
  protected readonly siteChoices = computed(() => {
    const c = this.selectedContract();
    const all = this.refs.siteOptions(c?.parties.customerId ?? '__none__');
    return this.formType() === 'Site Removal' ? all.filter((o) => c?.scopeInfo.siteIds.includes(String(o.value))) : all.filter((o) => !c?.scopeInfo.siteIds.includes(String(o.value)));
  });
  protected readonly assetChoices = computed(() => {
    const c = this.selectedContract();
    const all = this.refs.assetOptions(c?.parties.customerId ?? '__none__');
    return this.formType() === 'Asset Removal' ? all.filter((o) => c?.scopeInfo.assetIds.includes(String(o.value))) : all.filter((o) => !c?.scopeInfo.assetIds.includes(String(o.value)));
  });

  constructor() {
    this.form.controls.contractId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.formContract.set(id);
      const c = this.contractList().find((x) => x.id === id);
      if (c) {
        this.form.patchValue({ previousTerms: `Value ${formatCurrency(c.commercial.value, c.commercial.currency)} · End ${c.period.endDate} · SLA ${c.slaName ?? '—'} · ${c.scopeInfo.siteIds.length} sites · ${c.scopeInfo.assetIds.length} assets`, requestedBy: c.customerName ?? '' });
        this.newValue.set(c.commercial.value);
        this.newEnd.set(c.period.endDate);
      }
    });
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((t) => {
      this.formType.set(t);
      this.changeIds.set([]);
    });
    effect(() => {
      if (this.action() === 'new' && this.contractList().length) untracked(() => this.openForm());
    });
  }

  protected openForm(): void {
    this.form.reset({ contractId: '', type: 'Price Change', effectiveDate: new Date().toISOString().slice(0, 10), requestedBy: '', reason: '', previousTerms: '', newTerms: '', commercialImpact: 0, serviceImpact: '', notes: '' });
    this.formType.set('Price Change');
    this.docFile.set(null);
    this.changeIds.set([]);
    this.newSla.set(null);
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
    const ids = this.changeIds().map(String);
    const t = v.type;
    const changes: AmendmentChanges = {
      ...(this.changeKind() === 'value' && this.newValue() !== null ? { value: this.newValue()! } : {}),
      ...(this.changeKind() === 'end' && this.newEnd() ? { endDate: this.newEnd() } : {}),
      ...(this.changeKind() === 'sla' && this.newSla() ? { slaId: String(this.newSla()) } : {}),
      ...(t === 'Site Addition' ? { addSiteIds: ids } : t === 'Site Removal' ? { removeSiteIds: ids } : {}),
      ...(t === 'Asset Addition' ? { addAssetIds: ids } : t === 'Asset Removal' ? { removeAssetIds: ids } : {}),
      ...(t === 'Service Change' ? { addServiceIds: ids } : {}),
    };
    this.busy.set(true);
    try {
      const file = this.docFile();
      const doc = file ? await firstValueFrom(this.contractsApi.uploadDocument(v.contractId, 'Amendment', { name: file.name, size: file.size, mime: file.type || 'application/pdf' })) : null;
      const a = await firstValueFrom(this.api.create({ ...v, commercialImpact: Number(v.commercialImpact) || 0, changes, documentId: doc?.id ?? null }));
      this.notify.success(`${a.number} requested.`);
      this.formOpen.set(false);
      this.amendments.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async onAction({ id, row }: RowAction<AmendmentListItem>): Promise<void> {
    switch (id) {
      case 'advance':
        await this.exec(this.api.advance(row.id), `${row.number}: ${NEXT_LABEL[row.status].toLowerCase()} done.`);
        return;
      case 'execute':
        await this.exec(this.api.execute(row.id), `${row.number} executed — contract updated.`);
        return;
      case 'cancel':
        await this.exec(this.api.cancel(row.id, 'Cancelled by user.'), `${row.number} cancelled.`);
        return;
      case 'approvals':
        void this.router.navigate(['/app/contracts/approvals'], { queryParams: { contractId: row.contractId } });
        return;
      default:
        void this.router.navigate(['/app/contracts', row.contractId], { queryParams: { tab: 'amendments' } });
    }
  }

  private async exec(work: Observable<unknown>, message: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.amendments.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('contract-amendments', 'csv'), ['Amendment Number', 'Contract', 'Amendment Type', 'Effective Date', 'Requested By', 'Reason', 'Previous Terms', 'New Terms', 'Commercial Impact', 'Service Impact', 'Approval Status', 'Resulting Version', 'Notes'],
      this.filtered().map((a) => [a.number, a.contractNumber, a.type, a.effectiveDate, a.requestedBy, a.reason, a.previousTerms, a.newTerms, a.commercialImpact, a.serviceImpact, a.status, a.resultingVersion, a.notes]));
  }
}
