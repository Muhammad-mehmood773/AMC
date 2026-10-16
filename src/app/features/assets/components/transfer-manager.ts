import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { DetailItem } from '@shared/ui/detail-item';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon, type IconName } from '@shared/ui/icon';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, matchesAny, withinRange } from '@shared/utils/filters';
import { formatDate, formatDateTime } from '@shared/utils/format';
import { type Observable, firstValueFrom, map, startWith } from 'rxjs';
import { AssetReferenceStore } from '../data/asset-reference.store';
import { AssetApi, TransferApi } from '../data/asset.api';
import { TRANSACTION_BLOCKED_STATUSES } from '../data/asset.config';
import { TONE_CLASSES, TRANSFER_STATUS_TONE } from '../models/display';
import { TRANSFER_REASONS, TRANSFER_STATUSES, TRANSFER_WORKFLOW, type TransferListItem, type TransferReason, type TransferStatus } from '../models/operations.model';

const SUMMARY_ICON: Record<TransferStatus, IconName> = {
  Requested: 'inbox',
  Approved: 'check',
  Completed: 'check-circle',
  Rejected: 'ban',
  Cancelled: 'x',
};

/** SRS 3.9 — transfer request → approval → movement → new location → history update. */
@Component({
  selector: 'amc-transfer-manager',
  imports: [DataTable, DatePicker, DetailItem, Dialog, FilterBar, FormField, Icon, ReactiveFormsModule, RouterLink, Select, Spinner, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-4' },
  template: `
    @if (!assetId()) {
      <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
        @for (card of summary(); track card.status) {
          <button type="button" class="amc-card flex items-center gap-3 p-3.5 text-left transition-colors hover:border-line-strong" [class]="isOnly(card.status) ? 'ring-2 ring-brand' : ''" [attr.aria-pressed]="isOnly(card.status)" (click)="toggleStatus(card.status)">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" [class]="card.tone"><amc-icon [name]="card.icon" /></span>
            <span class="min-w-0">
              <span class="block text-xl font-semibold text-ink tabular-nums">{{ card.count }}</span>
              <span class="block truncate text-xs text-ink-muted">{{ card.status }}</span>
            </span>
          </button>
        }
      </div>
    }

    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar searchPlaceholder="Search asset, site, reference or requester…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters">
          <ng-container actions>
            <button type="button" class="amc-btn-ghost hidden sm:inline-flex" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> Export</button>
            <button type="button" class="amc-btn-primary" [disabled]="readOnly()" (click)="openRequest(assetId())"><amc-icon name="plus" /> <span class="hidden sm:inline">Request Transfer</span></button>
          </ng-container>
        </amc-filter-bar>
      </div>
      <amc-data-table
        [tableId]="assetId() ? 'asset-transfers' : 'transfers'"
        [entity]="{ singular: 'transfer', plural: 'transfers' }"
        [totalCount]="rows().length"
        [rows]="filtered()"
        [columns]="columns()"
        [trackBy]="trackById"
        [loading]="transfers.isLoading()"
        [error]="transfers.error() ? 'Transfers could not be loaded.' : null"
        [actions]="rowActions"
        emptyIcon="arrow-right"
        [emptyTitle]="rows().length ? 'No transfers match your filters' : 'No transfers yet'"
        [emptyMessage]="rows().length ? 'Try a different search or clear the filters.' : 'Relocations keep the previous location in the asset history.'"
        (action)="onAction($event)"
        (retry)="transfers.reload()"
      />
    </section>

    <!-- Request -->
    <amc-dialog size="lg" title="Request asset transfer" description="Move an asset to a new customer, site or location. The current location is kept in history." [(open)]="requestOpen">
      <form [formGroup]="form" id="transfer-form" novalidate (ngSubmit)="request()">
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Asset" for="trf-asset" [control]="form.controls.assetId" class="sm:col-span-2">
            <amc-select inputId="trf-asset" formControlName="assetId" [options]="eligibleAssets()" placeholder="Select asset…" />
          </amc-form-field>
          @if (current(); as a) {
            <div class="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface-muted p-3 sm:col-span-2 sm:grid-cols-3">
              <amc-detail-item label="Current Customer" [value]="a.customerName" />
              <amc-detail-item label="Current Site" [value]="a.siteName" />
              <amc-detail-item label="Current Location" [value]="a.installation.location" />
            </div>
          }
          <amc-form-field label="New Customer" for="trf-customer" [control]="form.controls.customerId">
            <amc-select inputId="trf-customer" formControlName="customerId" [options]="refs.customerOptions()" placeholder="Select customer…" />
          </amc-form-field>
          <amc-form-field label="New Site" for="trf-site" [control]="form.controls.siteId" [hint]="value().customerId ? '' : 'Select a customer first.'">
            <amc-select inputId="trf-site" formControlName="siteId" [options]="siteOptions()" placeholder="Select site…" />
          </amc-form-field>
          <amc-form-field label="New Location" for="trf-location" [control]="form.controls.location">
            <input id="trf-location" class="amc-input" formControlName="location" placeholder="e.g. Plant Room Level 2" />
          </amc-form-field>
          <amc-form-field label="Transfer Date" for="trf-date" [control]="form.controls.transferDate">
            <amc-date-picker inputId="trf-date" formControlName="transferDate" />
          </amc-form-field>
          <amc-form-field label="Transfer Reason" for="trf-reason" [control]="form.controls.reason">
            <amc-select inputId="trf-reason" formControlName="reason" [options]="reasonOptions" />
          </amc-form-field>
          <amc-form-field label="Requested By" for="trf-requester" [control]="form.controls.requestedBy">
            <amc-select inputId="trf-requester" formControlName="requestedBy" [options]="refs.userOptions()" />
          </amc-form-field>
          <amc-form-field label="Transfer Reference" for="trf-ref" [control]="form.controls.reference" hint="Generated when left empty.">
            <input id="trf-ref" class="amc-input font-mono" formControlName="reference" />
          </amc-form-field>
          <amc-form-field label="Notes" for="trf-notes" [control]="form.controls.notes" class="sm:col-span-2">
            <textarea id="trf-notes" class="amc-textarea min-h-16" formControlName="notes"></textarea>
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="requestOpen.set(false)">Cancel</button>
        <button type="submit" form="transfer-form" class="amc-btn-primary" [disabled]="saving()">@if (saving()) { <amc-spinner [size]="14" /> } Submit Request</button>
      </ng-container>
    </amc-dialog>

    <!-- Reject -->
    <amc-dialog size="sm" title="Reject transfer" [description]="selected() ? selected()!.reference + ' · ' + selected()!.assetName : ''" [(open)]="rejectOpen">
      <amc-form-field label="Reason" for="trf-reject" [required]="true">
        <textarea id="trf-reject" class="amc-textarea min-h-16" [value]="rejectReason()" (input)="rejectReason.set($any($event.target).value)"></textarea>
      </amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="rejectOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-danger" [disabled]="!rejectReason().trim() || saving()" (click)="reject()">Reject</button>
      </ng-container>
    </amc-dialog>

    <!-- Details -->
    <amc-dialog size="lg" [title]="selected() ? 'Transfer ' + selected()!.reference : 'Transfer'" [description]="selected() ? selected()!.assetCode + ' · ' + selected()!.assetName : ''" [(open)]="detailsOpen">
      @if (selected(); as t) {
        <ol class="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-5">
          @for (step of workflow; track step; let i = $index) {
            <li class="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs sm:flex-col sm:items-start" [class]="i <= stepIndex(t) ? 'border-brand/30 bg-brand-subtle text-ink' : 'border-line text-ink-muted'">
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold" [class]="i <= stepIndex(t) ? 'bg-brand text-brand-foreground' : 'bg-surface-sunken'">{{ i + 1 }}</span>
              <span class="font-medium">{{ step }}</span>
            </li>
          }
        </ol>
        @if (t.status === 'Rejected' || t.status === 'Cancelled') {
          <p class="mb-4 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">Transfer {{ t.status.toLowerCase() }}.</p>
        }
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div class="rounded-xl border border-line p-3">
            <p class="amc-overline mb-2">From</p>
            <p class="text-sm font-medium text-ink">{{ t.fromSiteName ?? '—' }}</p>
            <p class="text-xs text-ink-muted">{{ t.fromCustomerName ?? '—' }} · {{ t.from.location || '—' }}</p>
          </div>
          <amc-icon name="arrow-right" [size]="18" class="mx-auto text-ink-subtle" />
          <div class="rounded-xl border border-brand/30 bg-brand-subtle p-3">
            <p class="amc-overline mb-2">To</p>
            <p class="text-sm font-medium text-ink">{{ t.toSiteName ?? '—' }}</p>
            <p class="text-xs text-ink-muted">{{ t.toCustomerName ?? '—' }} · {{ t.to.location || '—' }}</p>
          </div>
        </div>
        <dl class="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div><dt class="text-xs font-medium text-ink-muted">Asset</dt><dd class="mt-1 text-sm"><a class="amc-link" [routerLink]="['/app/assets', t.assetId]">{{ t.assetCode }}</a></dd></div>
          <div><dt class="text-xs font-medium text-ink-muted">Status</dt><dd class="mt-1"><amc-status-badge [label]="t.status" [tone]="statusTone[t.status]" /></dd></div>
          <amc-detail-item label="Transfer Date" [value]="formatDate(t.transferDate)" />
          <amc-detail-item label="Transfer Reason" [value]="t.reason" />
          <amc-detail-item label="Requested By" [value]="t.requestedBy + ' · ' + formatDateTime(t.requestedAt)" />
          <amc-detail-item label="Approved By" [value]="t.approvedBy ? t.approvedBy + ' · ' + formatDateTime(t.approvedAt) : null" />
          <amc-detail-item label="Completed" [value]="formatDateTime(t.completedAt)" />
          <amc-detail-item label="Transfer Reference" [value]="t.reference" [mono]="true" />
          <amc-detail-item label="Customer Changed" [value]="t.customerChanged ? 'Yes' : 'No'" />
          <amc-detail-item class="col-span-2 sm:col-span-3" label="Notes" [value]="t.notes" />
        </dl>
      }
      <ng-container dialogFooter>
        @if (selected(); as t) {
          @if (t.status === 'Requested') {
            <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="detailsOpen.set(false); openReject(t)">Reject</button>
            <button type="button" class="amc-btn-primary" (click)="act('approve', t)"><amc-icon name="check" /> Approve</button>
          } @else if (t.status === 'Approved') {
            <button type="button" class="amc-btn-primary" (click)="act('complete', t)"><amc-icon name="map-pin" /> Complete Movement</button>
          } @else {
            <button type="button" class="amc-btn-secondary" (click)="detailsOpen.set(false)">Close</button>
          }
        }
      </ng-container>
    </amc-dialog>
  `,
})
export class TransferManager {
  private readonly api = inject(TransferApi);
  private readonly assetsApi = inject(AssetApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);
  protected readonly refs = inject(AssetReferenceStore);

  readonly assetId = input<string | null>(null);
  readonly readOnly = input(false);
  readonly requestFor = input<string | null>(null);
  readonly changed = output<void>();

  protected readonly workflow = TRANSFER_WORKFLOW;
  protected readonly statusTone = TRANSFER_STATUS_TONE;
  protected readonly reasonOptions = toOptions(TRANSFER_REASONS);
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly trackById = (t: TransferListItem) => t.id;

  protected readonly transfers = rxResource({ params: () => ({ assetId: this.assetId() ?? undefined }), stream: ({ params }) => this.api.list(params) });
  protected readonly rows = computed(() => (this.transfers.hasValue() ? this.transfers.value() : []));
  private readonly assets = rxResource({ stream: () => this.assetsApi.list() });

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(TRANSFER_STATUSES) },
    { key: 'reason', label: 'Transfer Reason', type: 'multiselect', options: toOptions(TRANSFER_REASONS) },
    { key: 'date', label: 'Transfer Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (t) =>
        (!term || `${t.assetCode} ${t.assetName} ${t.reference} ${t.requestedBy} ${t.fromSiteName ?? ''} ${t.toSiteName ?? ''} ${t.toCustomerName ?? ''}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'status', t.status) &&
        matchesAny(f, 'reason', t.reason) &&
        withinRange(f, 'date', t.transferDate),
    );
  });

  protected readonly summary = computed(() =>
    TRANSFER_STATUSES.map((status) => ({ status, count: this.rows().filter((t) => t.status === status).length, icon: SUMMARY_ICON[status], tone: TONE_CLASSES[TRANSFER_STATUS_TONE[status]] })),
  );

  protected isOnly(status: string): boolean {
    const list = filterList(this.filters(), 'status');
    return list.length === 1 && list[0] === status;
  }

  protected toggleStatus(status: string): void {
    this.filters.update((f) => ({ ...f, status: this.isOnly(status) ? undefined : [status] }));
  }

  protected readonly columns = computed<DataColumn<TransferListItem>[]>(() => [
    ...(this.assetId() ? [] : [{ key: 'asset', label: 'Asset', value: (t: TransferListItem) => t.assetName, secondary: (t: TransferListItem) => `${t.assetCode} · ${t.assetTag}`, link: (t: TransferListItem) => `/app/assets/${t.assetId}`, sortable: true, mobile: 'title' as const, width: 220 }]),
    { key: 'from', label: 'From', value: (t) => t.fromSiteName, secondary: (t) => [t.fromCustomerName, t.from.location].filter(Boolean).join(' · '), sortable: true, visibility: 'md', mobile: this.assetId() ? 'title' : 'meta', width: 230 },
    { key: 'to', label: 'To', value: (t) => t.toSiteName, secondary: (t) => [t.toCustomerName, t.to.location].filter(Boolean).join(' · '), sortable: true, mobile: 'meta', width: 230 },
    { key: 'date', label: 'Transfer Date', value: (t) => t.transferDate, type: 'date', sortable: true, visibility: 'lg', width: 130 },
    { key: 'reason', label: 'Reason', value: (t) => t.reason, sortable: true, visibility: 'xl', width: 170 },
    { key: 'requested', label: 'Requested By', value: (t) => t.requestedBy, secondary: (t) => (t.approvedBy ? `Approved by ${t.approvedBy}` : null), visibility: 'xl', width: 180 },
    { key: 'reference', label: 'Reference', value: (t) => t.reference, type: 'mono', visibility: '2xl', width: 120 },
    { key: 'status', label: 'Status', value: (t) => t.status, type: 'badge', tone: (t) => TRANSFER_STATUS_TONE[t.status], sortable: true, mobile: 'badge', width: 120 },
  ]);

  protected readonly rowActions = (t: TransferListItem): MenuItem[] => [
    { id: 'details', label: 'View Details', icon: 'eye' },
    { id: 'approve', label: 'Approve', icon: 'check', disabled: t.status !== 'Requested', dividerBefore: true },
    { id: 'reject', label: 'Reject', icon: 'ban', disabled: t.status !== 'Requested' },
    { id: 'complete', label: 'Complete Movement', icon: 'map-pin', disabled: t.status !== 'Approved' },
    { id: 'cancel', label: 'Cancel Transfer', icon: 'x', danger: true, disabled: t.status !== 'Requested' && t.status !== 'Approved', dividerBefore: true },
  ];

  // ----- Request ------------------------------------------------------------

  protected readonly requestOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly selected = signal<TransferListItem | null>(null);
  protected readonly detailsOpen = signal(false);
  protected readonly rejectOpen = signal(false);
  protected readonly rejectReason = signal('');

  protected readonly form = this.fb.group({
    assetId: this.fb.control('', Validators.required),
    customerId: this.fb.control('', Validators.required),
    siteId: this.fb.control('', Validators.required),
    location: this.fb.control('', Validators.required),
    transferDate: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    reason: this.fb.control<TransferReason>('Customer Request', Validators.required),
    requestedBy: this.fb.control('', Validators.required),
    reference: this.fb.control(''),
    notes: this.fb.control(''),
  });
  protected readonly value = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  protected readonly siteOptions = computed(() => this.refs.siteOptions(this.value().customerId));
  protected readonly current = computed(() => (this.assets.hasValue() ? this.assets.value() : []).find((a) => a.id === this.value().assetId) ?? null);
  protected readonly eligibleAssets = computed(() => {
    const pending = new Set(this.rows().filter((t) => t.status === 'Requested' || t.status === 'Approved').map((t) => t.assetId));
    return (this.assets.hasValue() ? this.assets.value() : [])
      .filter((a) => !TRANSACTION_BLOCKED_STATUSES.includes(a.status) && !pending.has(a.id) && a.siteId)
      .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: a.siteName ?? undefined }));
  });

  constructor() {
    this.form.controls.customerId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.form.controls.siteId.setValue(''));
    this.form.controls.assetId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const asset = (this.assets.hasValue() ? this.assets.value() : []).find((a) => a.id === id);
      if (asset) this.form.patchValue({ customerId: asset.customerId ?? '' });
    });
    effect(() => {
      const id = this.requestFor();
      if (id && this.assets.hasValue() && this.refs.data().customers.length) untracked(() => this.openRequest(id));
    });
  }

  protected openRequest(assetId: string | null): void {
    this.form.reset({ assetId: '', customerId: '', siteId: '', location: '', transferDate: new Date().toISOString().slice(0, 10), reason: 'Customer Request', requestedBy: this.refs.data().currentUser, reference: '', notes: '' });
    if (assetId) this.form.controls.assetId.setValue(assetId);
    this.requestOpen.set(true);
  }

  protected async request(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    await this.run(
      () => this.api.request({ assetId: v.assetId, to: { customerId: v.customerId, siteId: v.siteId, location: v.location }, transferDate: v.transferDate, reason: v.reason, requestedBy: v.requestedBy, reference: v.reference, notes: v.notes }),
      'Transfer requested — awaiting approval.',
      () => this.requestOpen.set(false),
    );
  }

  protected stepIndex(t: TransferListItem): number {
    return { Requested: 0, Approved: 2, Completed: 4, Rejected: 0, Cancelled: 0 }[t.status];
  }

  protected openReject(t: TransferListItem): void {
    this.selected.set(t);
    this.rejectReason.set('');
    this.rejectOpen.set(true);
  }

  protected async reject(): Promise<void> {
    const t = this.selected();
    if (t) await this.run(() => this.api.reject(t.id, this.rejectReason().trim()), 'Transfer rejected.', () => this.rejectOpen.set(false));
  }

  protected async act(action: 'approve' | 'complete', t: TransferListItem): Promise<void> {
    if (action === 'approve') {
      await this.run(() => this.api.approve(t.id), `Transfer approved — ${t.assetCode} is now in movement.`, () => this.detailsOpen.set(false));
    } else {
      await this.run(() => this.api.complete(t.id), `${t.assetCode} moved to ${t.toSiteName}. Location history updated.`, () => this.detailsOpen.set(false));
    }
  }

  protected async onAction({ id, row }: RowAction<TransferListItem>): Promise<void> {
    this.selected.set(row);
    switch (id) {
      case 'details':
        this.detailsOpen.set(true);
        break;
      case 'approve':
      case 'complete':
        await this.act(id as 'approve' | 'complete', row);
        break;
      case 'reject':
        this.openReject(row);
        break;
      case 'cancel': {
        const ok = await this.confirm.open({ title: 'Cancel transfer?', message: `Transfer ${row.reference} for ${row.assetName} will be cancelled and the asset status restored.`, confirmLabel: 'Cancel transfer', danger: true });
        if (ok) await this.run(() => this.api.cancel(row.id), 'Transfer cancelled.');
        break;
      }
    }
  }

  protected export(): void {
    downloadCsv(
      timestampedName('asset-transfers', 'csv'),
      ['Reference', 'Asset ID', 'Asset', 'Current Customer', 'Current Site', 'Current Location', 'New Customer', 'New Site', 'New Location', 'Transfer Date', 'Reason', 'Requested By', 'Approved By', 'Status', 'Notes'],
      this.filtered().map((t) => [t.reference, t.assetCode, t.assetName, t.fromCustomerName, t.fromSiteName, t.from.location, t.toCustomerName, t.toSiteName, t.to.location, t.transferDate, t.reason, t.requestedBy, t.approvedBy, t.status, t.notes]),
    );
  }

  private async run(work: () => Observable<unknown>, message: string, after?: () => void): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(work());
      this.notify.success(message);
      after?.();
      this.transfers.reload();
      this.assets.reload();
      this.changed.emit();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
