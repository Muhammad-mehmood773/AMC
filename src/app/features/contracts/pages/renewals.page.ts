import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { type Observable, firstValueFrom, merge } from 'rxjs';
import { renewalColumns } from '../components/contract-columns';
import { ContractReferenceStore } from '../data/contract-reference.store';
import { ContractApi, RenewalApi } from '../data/contract.api';
import { ALLOWED_ACTIONS } from '../data/contract.config';
import { RENEWAL_STATUSES, RENEWAL_TYPES, type RenewalCandidate, type RenewalListItem, type RenewalType } from '../models/workflow.model';

const NEXT_LABEL: Record<string, string> = { Requested: 'Start Renewal Review', 'Under Review': 'Move to Commercial Review', 'Commercial Review': 'Submit for Approval' };

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

@Component({
  selector: 'amc-renewals-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, PageHeader, ReactiveFormsModule, Select, Spinner, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract Renewal / Extension" subtitle="Expiry monitoring → renewal alert → request → review → commercial review → approval → new contract period." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'Renewals' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="openForm(null)"><amc-icon name="plus" /> Renewal Request</button>
      </amc-page-header>
      <amc-tabs [items]="tabs()" [active]="tab()" (activeChange)="tab.set($any($event))" />
      @if (tab() === 'pipeline') {
        <section class="amc-card overflow-hidden">
          <p class="border-b border-line bg-surface-muted px-4 py-2 text-xs text-ink-muted">Contracts ending within 180 days (or expired in the last 60 days) that have not been renewed. Renewal preserves the link to the previous contract.</p>
          <amc-data-table tableId="renewal-pipeline" [entity]="{ singular: 'contract', plural: 'contracts' }" [rows]="candidates()" [columns]="candidateColumns" [trackBy]="trackCandidate" [loading]="candidatesRes.isLoading()" [actions]="candidateActions" emptyIcon="refresh" emptyTitle="No renewals due" emptyMessage="No contracts are approaching expiry." (action)="onCandidate($event)" />
        </section>
      } @else {
        <section class="amc-card overflow-hidden">
          <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search renewal, contract or reason…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
          <amc-data-table tableId="contract-renewals" [entity]="{ singular: 'renewal', plural: 'renewals' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="renewals.isLoading()" [actions]="rowActions" emptyIcon="refresh" emptyTitle="No renewals" emptyMessage="Start a renewal from the pipeline." (action)="onAction($event)" />
        </section>
      }
    </div>

    <amc-dialog size="lg" title="Renewal / extension request" [(open)]="formOpen">
      <form [formGroup]="form" id="renewal-form" novalidate (ngSubmit)="save()">
        @let c = form.controls;
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Existing Contract" for="rn-contract" [control]="c.contractId" class="sm:col-span-2"><amc-select inputId="rn-contract" formControlName="contractId" [options]="contractOptions()" placeholder="Select contract…" /></amc-form-field>
          <amc-form-field label="Renewal Type" for="rn-type" [control]="c.type" [hint]="c.type.value === 'Extension' ? 'Extends the same contract.' : 'Creates a new contract period linked to the existing contract.'"><amc-select inputId="rn-type" formControlName="type" [options]="typeOptions" /></amc-form-field>
          <amc-form-field label="Renewal Term (months)" for="rn-term" [control]="c.termMonths"><input id="rn-term" type="number" min="1" class="amc-input tabular-nums" formControlName="termMonths" /></amc-form-field>
          <amc-form-field label="Renewal Start Date" for="rn-start" [control]="c.startDate"><amc-date-picker inputId="rn-start" formControlName="startDate" /></amc-form-field>
          <amc-form-field label="Renewal End Date" for="rn-end" [control]="c.endDate"><amc-date-picker inputId="rn-end" formControlName="endDate" /></amc-form-field>
          <amc-form-field label="Price Adjustment (%)" for="rn-adj" [control]="c.priceAdjustmentPercent"><input id="rn-adj" type="number" step="0.5" class="amc-input tabular-nums" formControlName="priceAdjustmentPercent" /></amc-form-field>
          <amc-form-field label="Renewal Value" for="rn-value" [control]="c.value"><input id="rn-value" type="number" min="0" class="amc-input tabular-nums" formControlName="value" /></amc-form-field>
          <amc-form-field label="Revised Services" for="rn-svc" [control]="c.revisedServices"><input id="rn-svc" class="amc-input" formControlName="revisedServices" /></amc-form-field>
          <amc-form-field label="Revised SLA" for="rn-sla" [control]="c.revisedSla"><amc-select inputId="rn-sla" formControlName="revisedSla" [options]="refs.slaOptions()" [clearable]="true" placeholder="No change" /></amc-form-field>
          <amc-form-field label="Revised Entitlements" for="rn-ent" [control]="c.revisedEntitlements"><input id="rn-ent" class="amc-input" formControlName="revisedEntitlements" /></amc-form-field>
          <amc-form-field label="Revised Payment Terms" for="rn-pt" [control]="c.revisedPaymentTerms"><amc-select inputId="rn-pt" formControlName="revisedPaymentTerms" [options]="refs.paymentTermOptions()" [clearable]="true" placeholder="No change" /></amc-form-field>
          <amc-form-field label="Renewal Reason" for="rn-reason" [control]="c.reason" class="sm:col-span-2"><textarea id="rn-reason" class="amc-textarea min-h-16" formControlName="reason"></textarea></amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="renewal-form" class="amc-btn-primary" [disabled]="busy()">@if (busy()) { <amc-spinner [size]="14" /> } Submit</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class RenewalsPage {
  private readonly api = inject(RenewalApi);
  private readonly contractsApi = inject(ContractApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(ContractReferenceStore);

  readonly contractId = input<string>();
  readonly action = input<string>();

  protected readonly tab = linkedSignal<'pipeline' | 'renewals'>(() => (this.contractId() ? 'renewals' : 'pipeline'));
  protected readonly renewals = rxResource({ stream: () => this.api.list() });
  protected readonly candidatesRes = rxResource({ stream: () => this.api.candidates() });
  private readonly contracts = rxResource({ stream: () => this.contractsApi.list() });
  protected readonly rows = computed(() => (this.renewals.hasValue() ? this.renewals.value() : []));
  protected readonly candidates = computed(() => (this.candidatesRes.hasValue() ? this.candidatesRes.value() : []));
  private readonly contractList = computed(() => (this.contracts.hasValue() ? this.contracts.value() : []));
  protected readonly contractOptions = computed(() => this.contractList().filter((c) => ALLOWED_ACTIONS['renew'].includes(c.effectiveStatus) && !c.renewedById).map((c) => ({ value: c.id, label: `${c.number} · ${c.title}`, hint: `Ends ${c.period.endDate}` })));
  protected readonly tabs = computed<TabItem[]>(() => [
    { id: 'pipeline', label: 'Renewal Pipeline', count: this.candidates().length },
    { id: 'renewals', label: 'Renewals', count: this.rows().length },
  ]);
  protected readonly columns = renewalColumns();
  protected readonly trackById = (r: RenewalListItem) => r.id;
  protected readonly trackCandidate = (r: RenewalCandidate) => r.contractId;
  protected readonly candidateColumns: DataColumn<RenewalCandidate>[] = [
    { key: 'contract', label: 'Contract', value: (r) => r.title, secondary: (r) => `${r.number} · ${r.customerName ?? ''}`, link: (r) => `/app/contracts/${r.contractId}`, mobile: 'title', width: 280 },
    { key: 'end', label: 'End Date', value: (r) => r.endDate, type: 'date', sortable: true, mobile: 'meta', width: 120 },
    { key: 'days', label: 'Days Remaining', value: (r) => (r.daysRemaining < 0 ? `Expired ${-r.daysRemaining}d ago` : `${r.daysRemaining} days`), type: 'badge', tone: (r) => (r.daysRemaining < 0 ? 'danger' : r.daysRemaining <= 30 ? 'danger' : r.daysRemaining <= 90 ? 'warn' : 'info'), sortable: true, width: 140 },
    { key: 'value', label: 'Value', value: (r) => r.value, type: 'currency', currency: (r) => r.currency, visibility: 'md', width: 130 },
    { key: 'notice', label: 'Notice Period', value: (r) => (r.noticeStarted ? 'Started' : '—'), type: 'badge', tone: (r) => (r.noticeStarted ? 'warn' : 'neutral'), visibility: 'lg', width: 120 },
    { key: 'auto', label: 'Auto Renewal', value: (r) => (r.autoRenewal ? 'Yes' : 'No'), visibility: 'xl', width: 110 },
    { key: 'renewal', label: 'Renewal Status', value: (r) => r.renewalStatus ?? 'Not started', type: 'badge', tone: (r) => (r.renewalStatus ? 'info' : 'neutral'), mobile: 'badge', width: 150 },
  ];
  protected readonly candidateActions = (r: RenewalCandidate): MenuItem[] => (r.renewalId ? [{ id: 'view', label: 'View Renewal', icon: 'eye' }] : [{ id: 'renew', label: 'Start Renewal', icon: 'refresh' }, { id: 'extend', label: 'Extend', icon: 'calendar' }]);
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => (this.contractId() ? { contract: [this.contractId()!] } : {}));
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'contract', label: 'Contract', type: 'multiselect', options: this.contractList().map((c) => ({ value: c.id, label: `${c.number} · ${c.title}` })) },
    { key: 'type', label: 'Renewal Type', type: 'multiselect', options: this.typeOptions },
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(RENEWAL_STATUSES) },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter((r) => (!term || `${r.number} ${r.contractNumber} ${r.reason}`.toLowerCase().includes(term)) && matchesAny(f, 'contract', r.contractId) && matchesAny(f, 'type', r.type) && matchesAny(f, 'status', r.status));
  });
  protected readonly rowActions = (r: RenewalListItem): MenuItem[] => [
    ...(NEXT_LABEL[r.status] ? [{ id: 'advance', label: NEXT_LABEL[r.status], icon: 'arrow-right' as const }] : []),
    ...(r.status === 'Pending Approval' ? [{ id: 'approvals', label: 'View Approval', icon: 'check-circle' as const }] : []),
    ...(r.status === 'Approved' ? [{ id: 'complete', label: r.type === 'Extension' ? 'Complete Extension' : 'Create Renewed Contract', icon: 'check-circle' as const }] : []),
    ...(r.newContractId ? [{ id: 'new', label: 'Open New Contract', icon: 'external-link' as const }] : []),
    { id: 'contract', label: 'Open Existing Contract', icon: 'file-text' },
    ...(!['Completed', 'Rejected', 'Cancelled'].includes(r.status) ? [{ id: 'cancel', label: 'Cancel', icon: 'x' as const, danger: true, dividerBefore: true }] : []),
  ];

  protected readonly typeOptions = toOptions(RENEWAL_TYPES);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly form = this.fb.group({
    contractId: this.fb.control('', Validators.required),
    type: this.fb.control<RenewalType>('Standard Renewal', Validators.required),
    startDate: this.fb.control('', Validators.required),
    endDate: this.fb.control('', Validators.required),
    termMonths: this.fb.control(12, [Validators.required, Validators.min(1)]),
    value: this.fb.control(0, [Validators.required, Validators.min(0)]),
    priceAdjustmentPercent: this.fb.control(0),
    revisedServices: this.fb.control('No change'),
    revisedSla: this.fb.control(''),
    revisedEntitlements: this.fb.control('Same as current period'),
    revisedPaymentTerms: this.fb.control(''),
    reason: this.fb.control('', Validators.required),
  });

  constructor() {
    const c = this.form.controls;
    const recalc = () => {
      const contract = this.contractList().find((x) => x.id === c.contractId.value);
      if (!contract) return;
      const factor = c.type.value === 'Extension' ? c.termMonths.value / Math.max(1, contract.durationMonths) : 1;
      c.value.setValue(Math.round(contract.commercial.value * factor * (1 + (Number(c.priceAdjustmentPercent.value) || 0) / 100)), { emitEvent: false });
      if (c.startDate.value) c.endDate.setValue(addMonths(c.startDate.value, Number(c.termMonths.value) || 12), { emitEvent: false });
    };
    c.contractId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const contract = this.contractList().find((x) => x.id === id);
      if (!contract) return;
      const start = new Date(new Date(contract.period.endDate).getTime() + 86_400_000).toISOString().slice(0, 10);
      c.startDate.setValue(start > new Date().toISOString().slice(0, 10) ? start : new Date().toISOString().slice(0, 10), { emitEvent: false });
      c.termMonths.setValue(contract.period.renewalTermMonths ?? 12, { emitEvent: false });
      recalc();
    });
    merge(c.type.valueChanges, c.termMonths.valueChanges, c.priceAdjustmentPercent.valueChanges, c.startDate.valueChanges).pipe(takeUntilDestroyed()).subscribe(recalc);
    effect(() => {
      if (this.action() === 'new' && this.contractList().length) untracked(() => this.openForm(this.contractId() ?? null));
    });
  }

  protected openForm(contractId: string | null, type: RenewalType = 'Standard Renewal'): void {
    this.form.reset({ contractId: '', type, startDate: '', endDate: '', termMonths: 12, value: 0, priceAdjustmentPercent: 0, revisedServices: 'No change', revisedSla: '', revisedEntitlements: 'Same as current period', revisedPaymentTerms: '', reason: '' });
    if (contractId) this.form.controls.contractId.setValue(contractId);
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const ok = await this.exec(this.api.create({ ...v, value: Number(v.value), termMonths: Number(v.termMonths), priceAdjustmentPercent: Number(v.priceAdjustmentPercent) || 0, revisedSla: v.revisedSla || null, revisedPaymentTerms: v.revisedPaymentTerms || null }), 'Renewal requested.');
    if (ok) {
      this.formOpen.set(false);
      this.tab.set('renewals');
    }
  }

  protected onCandidate({ id, row }: RowAction<RenewalCandidate>): void {
    if (id === 'view') {
      this.tab.set('renewals');
      this.filters.set({ contract: [row.contractId] });
    } else this.openForm(row.contractId, id === 'extend' ? 'Extension' : 'Standard Renewal');
  }

  protected async onAction({ id, row }: RowAction<RenewalListItem>): Promise<void> {
    switch (id) {
      case 'advance':
        await this.exec(this.api.advance(row.id), `${row.number}: ${NEXT_LABEL[row.status].toLowerCase()} done.`);
        return;
      case 'complete':
        try {
          const contract = await firstValueFrom(this.api.complete(row.id));
          this.notify.success(row.type === 'Extension' ? `${contract.number} extended to ${contract.period.endDate}.` : `Renewed contract ${contract.number} created — send it for signature.`);
          void this.router.navigate(['/app/contracts', contract.id]);
        } catch (error) {
          this.notify.error((error as Error).message);
        }
        return;
      case 'cancel':
        await this.exec(this.api.cancel(row.id, 'Cancelled by user.'), `${row.number} cancelled.`);
        return;
      case 'approvals':
        void this.router.navigate(['/app/contracts/approvals'], { queryParams: { contractId: row.contractId } });
        return;
      case 'new':
        void this.router.navigate(['/app/contracts', row.newContractId]);
        return;
      default:
        void this.router.navigate(['/app/contracts', row.contractId], { queryParams: { tab: 'renewals' } });
    }
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.renewals.reload();
      this.candidatesRes.reload();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('contract-renewals', 'csv'), ['Renewal Number', 'Existing Contract', 'Renewal Type', 'Start Date', 'End Date', 'Term (months)', 'Renewal Value', 'Price Adjustment %', 'Revised Services', 'Revised SLA', 'Revised Entitlements', 'Revised Payment Terms', 'Reason', 'Status', 'New Contract'],
      this.filtered().map((r) => [r.number, r.contractNumber, r.type, r.startDate, r.endDate, r.termMonths, r.value, r.priceAdjustmentPercent, r.revisedServices, r.revisedSla, r.revisedEntitlements, r.revisedPaymentTerms, r.reason, r.status, r.newContractNumber]));
  }
}
