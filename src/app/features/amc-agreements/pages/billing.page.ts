import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { KpiCard } from '@shared/ui/kpi-card';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { formatCurrency } from '@shared/utils/format';
import { type Observable, firstValueFrom } from 'rxjs';
import { billingColumns } from '../components/amc-columns';
import { AmcReferenceStore } from '../data/amc-reference.store';
import { AmcApi, BillingApi } from '../data/amc.api';
import { BILLING_FREQUENCIES } from '../models/amc.model';
import { BILLING_STATUSES, type BillingListItem, type BillingStatus } from '../models/operations.model';

@Component({
  selector: 'amc-billing-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, KpiCard, PageHeader, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="AMC Billing Schedule" subtitle="AMC → Billing Schedule → Billing Due → Invoice → Payment → Revenue. Invoicing and payments are processed by Billing & Revenue Management." [breadcrumbs]="[{ label: 'AMC / Service Contracts', path: '/app/amc-agreements/dashboard' }, { label: 'Billing Schedule' }]">
        <button type="button" class="amc-btn-secondary" (click)="export()"><amc-icon name="download" /> <span class="hidden sm:inline">Export</span></button>
        <button type="button" class="amc-btn-primary" (click)="generateOpen.set(true)"><amc-icon name="receipt" /> Generate Billing Schedule</button>
      </amc-page-header>
      <section class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <amc-kpi-card label="Planned" icon="calendar" [value]="formatCurrency(sum(['Planned']), 'SAR', true)" />
        <amc-kpi-card label="Ready for Billing" icon="receipt" tone="info" [value]="formatCurrency(sum(['Ready for Billing']), 'SAR', true)" [hint]="count(['Ready for Billing']) + ' lines'" />
        <amc-kpi-card label="Invoiced" icon="file-text" tone="accent" [value]="formatCurrency(sum(['Invoiced', 'Partially Paid']), 'SAR', true)" />
        <amc-kpi-card label="Paid" icon="check-circle" tone="ok" [value]="formatCurrency(paid(), 'SAR', true)" />
        <amc-kpi-card label="Overdue" icon="alert-triangle" tone="danger" [value]="formatCurrency(sum(['Overdue']), 'SAR', true)" [hint]="count(['Overdue']) + ' lines'" />
      </section>
      <section class="amc-card overflow-hidden">
        <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search billing line, AMC, customer or invoice…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
        <amc-data-table tableId="amc-billing" [entity]="{ singular: 'billing line', plural: 'billing lines' }" [totalCount]="rows().length" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="lines.isLoading()" [actions]="rowActions" [initialPageSize]="25" emptyIcon="receipt" emptyTitle="No billing lines" emptyMessage="Generate a billing schedule for an AMC." (action)="onAction($event)" />
      </section>
    </div>

    <amc-dialog size="sm" title="Generate billing schedule" description="Splits the AMC value into billing lines by its billing frequency." [(open)]="generateOpen">
      <amc-form-field label="AMC" for="bl-amc"><amc-select inputId="bl-amc" [options]="unbilledAmcs()" [(value)]="amc" /></amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="generateOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || !amc()" (click)="generate()">@if (busy()) { <amc-spinner [size]="14" /> } Generate</button>
      </ng-container>
    </amc-dialog>

    <amc-dialog size="sm" [title]="'Record payment · ' + (paying()?.number ?? '')" [description]="paying() ? 'Outstanding ' + formatCurrency(paying()!.net - paying()!.paidAmount, paying()!.currency) : ''" [open]="!!paying()" (openChange)="!$event && paying.set(null)">
      <amc-form-field label="Amount" for="bl-pay"><input id="bl-pay" type="number" min="0" class="amc-input tabular-nums" [value]="amount()" (input)="amount.set(+$any($event.target).value || 0)" /></amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="paying.set(null)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || amount() <= 0" (click)="pay()">Record</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class BillingPage {
  private readonly api = inject(BillingApi);
  private readonly amcApi = inject(AmcApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(AmcReferenceStore);

  readonly amcId = input<string>();
  readonly status = input<string>();

  protected readonly lines = rxResource({ stream: () => this.api.list() });
  private readonly amcs = rxResource({ stream: () => this.amcApi.list() });
  protected readonly rows = computed(() => (this.lines.hasValue() ? this.lines.value() : []));
  private readonly amcList = computed(() => (this.amcs.hasValue() ? this.amcs.value() : []));
  protected readonly unbilledAmcs = computed(() => {
    const billed = new Set(this.rows().filter((b) => b.status !== 'Cancelled').map((b) => b.amcId));
    return this.amcList().filter((a) => !billed.has(a.id) && !['Terminated', 'Cancelled', 'Archived'].includes(a.effectiveStatus)).map((a) => ({ value: a.id, label: `${a.number} · ${a.title}`, hint: a.commercial.billingFrequency }));
  });
  protected readonly columns = billingColumns();
  protected readonly trackById = (b: BillingListItem) => b.id;
  protected readonly search = signal('');
  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = {};
    if (this.amcId()) seed['amc'] = [this.amcId()!];
    if (this.status()) seed['status'] = [this.status()!];
    return seed;
  });
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'amc', label: 'AMC', type: 'multiselect', options: this.amcList().map((a) => ({ value: a.id, label: `${a.number} · ${a.title}` })) },
    { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
    { key: 'frequency', label: 'Billing Frequency', type: 'multiselect', options: toOptions(BILLING_FREQUENCIES) },
    { key: 'status', label: 'Billing Status', type: 'multiselect', options: toOptions(BILLING_STATUSES) },
    { key: 'date', label: 'Billing Date', type: 'date-range' },
    { key: 'due', label: 'Due Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const customerOf = new Map(this.amcList().map((a) => [a.id, a.customer.customerId]));
    return this.rows().filter(
      (b) =>
        (!term || `${b.number} ${b.amcNumber} ${b.customerName} ${b.invoiceNumber ?? ''}`.toLowerCase().includes(term)) && matchesAny(f, 'amc', b.amcId) && matchesAny(f, 'customer', customerOf.get(b.amcId)) &&
        matchesAny(f, 'frequency', b.billingFrequency) && matchesAny(f, 'status', b.effectiveStatus) && withinRange(f, 'date', b.billingDate) && withinRange(f, 'due', b.dueDate),
    );
  });
  protected sum(statuses: readonly BillingStatus[]): number {
    return this.filtered().filter((b) => statuses.includes(b.effectiveStatus)).reduce((s, b) => s + b.net - b.paidAmount, 0);
  }
  protected count(statuses: readonly BillingStatus[]): number {
    return this.filtered().filter((b) => statuses.includes(b.effectiveStatus)).length;
  }
  protected readonly paid = computed(() => this.filtered().reduce((s, b) => s + b.paidAmount, 0));
  protected readonly rowActions = (b: BillingListItem): MenuItem[] => [
    ...(b.status === 'Planned' ? [{ id: 'advance', label: 'Mark Ready for Billing', icon: 'receipt' as const, disabled: b.onHold, hint: b.onHold ? 'On hold — AMC suspended' : undefined }] : []),
    ...(b.status === 'Ready for Billing' ? [{ id: 'advance', label: 'Send to Billing (Invoice)', icon: 'send' as const }] : []),
    ...(['Invoiced', 'Partially Paid'].includes(b.status) ? [{ id: 'pay', label: 'Record Payment', icon: 'wallet' as const }] : []),
    ...(['Planned', 'Ready for Billing'].includes(b.status) ? [{ id: 'cancel', label: 'Cancel', icon: 'x' as const, danger: true, dividerBefore: true }] : []),
  ];

  protected readonly formatCurrency = formatCurrency;
  protected readonly busy = signal(false);
  protected readonly generateOpen = signal(false);
  protected readonly amc = linkedSignal<string | number | null>(() => this.amcId() ?? null);
  protected readonly paying = signal<BillingListItem | null>(null);
  protected readonly amount = signal(0);

  protected async generate(): Promise<void> {
    this.busy.set(true);
    try {
      const n = await firstValueFrom(this.api.generate(String(this.amc())));
      this.notify.success(`${n} billing line(s) generated.`);
      this.generateOpen.set(false);
      this.lines.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected onAction({ id, row }: RowAction<BillingListItem>): void {
    if (id === 'pay') {
      this.amount.set(row.net - row.paidAmount);
      this.paying.set(row);
    } else if (id === 'advance') void this.exec(this.api.advance(row.id), row.status === 'Planned' ? `${row.number} ready for billing.` : `${row.number} sent to Billing & Revenue.`);
    else void this.exec(this.api.cancel(row.id), `${row.number} cancelled.`);
  }

  protected async pay(): Promise<void> {
    const b = this.paying();
    if (b && (await this.exec(this.api.recordPayment(b.id, this.amount()), 'Payment recorded.'))) this.paying.set(null);
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.lines.reload();
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected export(): void {
    downloadCsv(timestampedName('amc-billing', 'csv'), ['Billing Line', 'AMC', 'Customer', 'Billing Schedule', 'Billing Frequency', 'Billing Date', 'Due Date', 'Billing Amount', 'Currency', 'Discount', 'Tax', 'Net Amount', 'Paid', 'Invoice', 'Billing Status'],
      this.filtered().map((b) => [b.number, b.amcNumber, b.customerName, b.period, b.billingFrequency, b.billingDate, b.dueDate, b.amount, b.currency, b.discount, b.tax, b.net, b.paidAmount, b.invoiceNumber, b.effectiveStatus]));
  }
}
