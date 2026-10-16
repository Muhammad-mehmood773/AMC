import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors, Validators } from '@angular/forms';
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
import { formatCurrency, formatDate, formatDateTime } from '@shared/utils/format';
import { type Observable, firstValueFrom, map, of, startWith } from 'rxjs';
import { AssetApi, AssetDocumentApi, ComponentApi, LifecycleApi, ServiceHistoryApi, WarrantyApi } from '../data/asset.api';
import { ASSET_RULES } from '../data/asset.config';
import { CLAIM_STATUS_TONE, TONE_CLASSES, WARRANTY_STATUS_TONE } from '../models/display';
import { CLAIM_STATUSES, WARRANTY_STATUSES, WARRANTY_TYPES, type ClaimStatus, type WarrantyListItem, type WarrantyType } from '../models/warranty.model';

function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value as string;
  const end = group.get('endDate')?.value as string;
  return start && end && end < start ? { endBeforeStart: true } : null;
}

const SUMMARY_ICON: Record<string, IconName> = {
  'Not Started': 'clock',
  Active: 'shield-check',
  'Expiring Soon': 'alert-triangle',
  Expired: 'alert-circle',
  Cancelled: 'ban',
};

/** SRS 3.10 — warranty coverage, expiry tracking, claims, warranty services, documents and history. */
@Component({
  selector: 'amc-warranty-manager',
  imports: [DataTable, DatePicker, DetailItem, Dialog, FilterBar, FormField, Icon, ReactiveFormsModule, RouterLink, Select, Spinner, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-4' },
  template: `
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

    @if (expiring().length) {
      <div class="flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn-subtle px-4 py-3 text-sm text-warn" role="status">
        <amc-icon name="bell" [size]="16" />
        <p class="flex-1">{{ expiring().length }} warrant{{ expiring().length === 1 ? 'y expires' : 'ies expire' }} within {{ expiringDays }} days. Plan renewals or extended cover.</p>
        <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="notifyAll()"><amc-icon name="bell" [size]="13" /> Send notifications</button>
      </div>
    }

    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar searchPlaceholder="Search asset, provider or reference…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters">
          <ng-container actions>
            <button type="button" class="amc-btn-ghost hidden sm:inline-flex" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> Export</button>
            <button type="button" class="amc-btn-primary" [disabled]="readOnly()" (click)="openForm(null)"><amc-icon name="plus" /> <span class="hidden sm:inline">Add Warranty</span></button>
          </ng-container>
        </amc-filter-bar>
      </div>
      <amc-data-table
        [tableId]="assetId() ? 'asset-warranties' : 'warranties'"
        [entity]="{ singular: 'warranty', plural: 'warranties' }"
        [totalCount]="rows().length"
        [rows]="filtered()"
        [columns]="columns()"
        [trackBy]="trackById"
        [loading]="warranties.isLoading()"
        [error]="warranties.error() ? 'Warranties could not be loaded.' : null"
        [actions]="rowActions"
        emptyIcon="shield-check"
        [emptyTitle]="rows().length ? 'No warranties match your filters' : 'No warranties yet'"
        [emptyMessage]="rows().length ? 'Try a different search or clear the filters.' : 'Register manufacturer, supplier, extended or service warranties.'"
        (action)="onAction($event)"
        (retry)="warranties.reload()"
      />
    </section>

    <!-- Add / edit -->
    <amc-dialog size="lg" [title]="editing() ? 'Edit warranty' : 'Add warranty'" description="Warranty dates are maintained independently from contract dates." [(open)]="formOpen">
      <form [formGroup]="form" id="warranty-form" novalidate (ngSubmit)="save()">
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Asset" for="war-asset" [control]="form.controls.assetId" class="sm:col-span-2">
            <amc-select inputId="war-asset" formControlName="assetId" [options]="assetOptions()" placeholder="Select asset…" [forceDisabled]="!!assetId() || !!editing()" />
          </amc-form-field>
          <amc-form-field label="Component" for="war-component" [control]="form.controls.componentId" hint="Optional — when the warranty covers a component only.">
            <amc-select inputId="war-component" formControlName="componentId" [options]="componentOptions()" placeholder="Whole asset" [clearable]="true" />
          </amc-form-field>
          <amc-form-field label="Warranty Type" for="war-type" [control]="form.controls.type">
            <amc-select inputId="war-type" formControlName="type" [options]="typeOptions" />
          </amc-form-field>
          <amc-form-field label="Warranty Provider" for="war-provider" [control]="form.controls.provider">
            <input id="war-provider" class="amc-input" formControlName="provider" placeholder="e.g. Carrier Middle East" />
          </amc-form-field>
          <amc-form-field label="Warranty Reference" for="war-ref" [control]="form.controls.reference">
            <input id="war-ref" class="amc-input font-mono" formControlName="reference" />
          </amc-form-field>
          <amc-form-field label="Start Date" for="war-start" [control]="form.controls.startDate">
            <amc-date-picker inputId="war-start" formControlName="startDate" />
          </amc-form-field>
          <amc-form-field label="End Date" for="war-end" [control]="form.controls.endDate">
            <amc-date-picker inputId="war-end" formControlName="endDate" />
            @if (form.hasError('endBeforeStart') && form.touched) {
              <p class="text-xs text-danger" role="alert">End date must be on or after the start date.</p>
            }
          </amc-form-field>
          <amc-form-field label="Coverage Details" for="war-coverage" [control]="form.controls.coverageDetails" class="sm:col-span-2">
            <textarea id="war-coverage" class="amc-textarea min-h-16" formControlName="coverageDetails"></textarea>
          </amc-form-field>
          <amc-form-field label="Exclusions" for="war-excl" [control]="form.controls.exclusions" class="sm:col-span-2">
            <textarea id="war-excl" class="amc-textarea min-h-16" formControlName="exclusions"></textarea>
          </amc-form-field>
          <amc-form-field label="Notes" for="war-notes" [control]="form.controls.notes" class="sm:col-span-2">
            <textarea id="war-notes" class="amc-textarea min-h-16" formControlName="notes"></textarea>
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="formOpen.set(false)">Cancel</button>
        <button type="submit" form="warranty-form" class="amc-btn-primary" [disabled]="saving()">@if (saving()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>

    <!-- Claim -->
    <amc-dialog size="md" title="Add warranty claim" [description]="selected() ? selected()!.reference + ' · ' + selected()!.assetName : ''" [(open)]="claimOpen">
      <form [formGroup]="claimForm" id="claim-form" novalidate (ngSubmit)="addClaim()">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <amc-form-field label="Claim Reference" for="clm-ref" [control]="claimForm.controls.reference">
            <input id="clm-ref" class="amc-input font-mono" formControlName="reference" />
          </amc-form-field>
          <amc-form-field label="Claim Date" for="clm-date" [control]="claimForm.controls.date">
            <amc-date-picker inputId="clm-date" formControlName="date" />
          </amc-form-field>
          <amc-form-field label="Status" for="clm-status" [control]="claimForm.controls.status">
            <amc-select inputId="clm-status" formControlName="status" [options]="claimStatusOptions" />
          </amc-form-field>
          <amc-form-field label="Amount" for="clm-amount" [control]="claimForm.controls.amount">
            <input id="clm-amount" type="number" min="0" class="amc-input tabular-nums" formControlName="amount" />
          </amc-form-field>
          <amc-form-field label="Description" for="clm-desc" [control]="claimForm.controls.description" class="sm:col-span-2">
            <textarea id="clm-desc" class="amc-textarea min-h-16" formControlName="description"></textarea>
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="claimOpen.set(false)">Cancel</button>
        <button type="submit" form="claim-form" class="amc-btn-primary" [disabled]="saving()">Submit Claim</button>
      </ng-container>
    </amc-dialog>

    <!-- Details -->
    <amc-dialog size="xl" [title]="selected() ? selected()!.type + ' · ' + selected()!.provider : 'Warranty'" [description]="selected() ? selected()!.assetCode + ' · ' + selected()!.assetName : ''" [(open)]="detailsOpen">
      @if (selected(); as w) {
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div class="space-y-5">
            <div>
              <div class="mb-1.5 flex justify-between text-xs text-ink-muted"><span>{{ formatDate(w.startDate) }}</span><span>{{ formatDate(w.endDate) }}</span></div>
              <div class="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div class="h-full rounded-full" [class]="w.status === 'Expired' || w.status === 'Cancelled' ? 'bg-ink-subtle' : w.status === 'Expiring Soon' ? 'bg-warn' : 'bg-ok'" [style.width.%]="elapsed(w)"></div>
              </div>
              <p class="mt-1.5 text-xs text-ink-muted">{{ remainingText(w) }}</p>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-ink">Warranty claims</h3>
              <ul class="mt-2 divide-y divide-line rounded-xl border border-line">
                @for (c of w.claims; track c.id) {
                  <li class="flex items-start gap-3 px-3.5 py-2.5">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-ink"><span class="font-mono text-[13px]">{{ c.reference }}</span> · {{ c.description }}</p>
                      <p class="text-xs text-ink-muted">{{ formatDate(c.date) }}{{ c.amount ? ' · ' + formatCurrency(c.amount) : '' }}</p>
                    </div>
                    <amc-status-badge [label]="c.status" [tone]="claimTone[c.status]" />
                  </li>
                } @empty {
                  <li class="px-3.5 py-4 text-center text-sm text-ink-muted">No claims recorded.</li>
                }
              </ul>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-ink">Warranty services</h3>
              <ul class="mt-2 divide-y divide-line rounded-xl border border-line">
                @for (r of warrantyServices(); track r.id) {
                  <li class="px-3.5 py-2.5">
                    <p class="text-sm text-ink">{{ r.problemReported }} — {{ r.workPerformed }}</p>
                    <p class="text-xs text-ink-muted">{{ formatDate(r.date) }} · {{ r.technician }} · {{ r.workOrder }}</p>
                  </li>
                } @empty {
                  <li class="px-3.5 py-4 text-center text-sm text-ink-muted">No warranty-covered services in this period.</li>
                }
              </ul>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-ink">Warranty history</h3>
              <ul class="mt-2 space-y-1.5">
                @for (e of warrantyEvents(); track e.id) {
                  <li class="text-sm"><span class="font-medium text-ink">{{ e.eventType }}</span> <span class="text-ink-muted">· {{ e.comments }} · {{ formatDateTime(e.timestamp) }}</span></li>
                } @empty {
                  <li class="text-sm text-ink-muted">No events.</li>
                }
              </ul>
            </div>
          </div>
          <dl class="grid h-fit grid-cols-2 gap-4 rounded-xl border border-line p-4 lg:grid-cols-1">
            <div><dt class="text-xs font-medium text-ink-muted">Warranty Status</dt><dd class="mt-1"><amc-status-badge [label]="w.status" [tone]="statusTone[w.status]" /></dd></div>
            <div><dt class="text-xs font-medium text-ink-muted">Asset</dt><dd class="mt-1 text-sm"><a class="amc-link" [routerLink]="['/app/assets', w.assetId]">{{ w.assetCode }} · {{ w.assetName }}</a></dd></div>
            <amc-detail-item label="Component" [value]="w.componentName ?? 'Whole asset'" />
            <amc-detail-item label="Warranty Reference" [value]="w.reference" [mono]="true" />
            <amc-detail-item label="Coverage Details" [value]="w.coverageDetails" />
            <amc-detail-item label="Exclusions" [value]="w.exclusions" />
            <amc-detail-item label="Warranty Document" [value]="w.documentName ?? 'Not attached'" />
            <amc-detail-item label="Notes" [value]="w.notes" />
          </dl>
        </div>
      }
      <ng-container dialogFooter>
        @if (selected(); as w) {
          <label class="amc-btn-secondary cursor-pointer sm:mr-auto">
            <amc-icon name="paperclip" /> Attach Document
            <input type="file" class="sr-only" (change)="attach($event, w)" />
          </label>
          <button type="button" class="amc-btn-secondary" [disabled]="w.status === 'Cancelled' || readOnly()" (click)="detailsOpen.set(false); openClaim(w)"><amc-icon name="receipt" /> Add Claim</button>
          <button type="button" class="amc-btn-primary" [disabled]="readOnly()" (click)="detailsOpen.set(false); openForm(w)"><amc-icon name="pencil" /> Edit</button>
        }
      </ng-container>
    </amc-dialog>
  `,
})
export class WarrantyManager {
  private readonly api = inject(WarrantyApi);
  private readonly assetsApi = inject(AssetApi);
  private readonly componentsApi = inject(ComponentApi);
  private readonly documentsApi = inject(AssetDocumentApi);
  private readonly historyApi = inject(ServiceHistoryApi);
  private readonly lifecycleApi = inject(LifecycleApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);

  readonly assetId = input<string | null>(null);
  readonly readOnly = input(false);
  readonly openAddOnInit = input(false);
  readonly changed = output<void>();

  protected readonly statusTone = WARRANTY_STATUS_TONE;
  protected readonly claimTone = CLAIM_STATUS_TONE;
  protected readonly typeOptions = toOptions(WARRANTY_TYPES);
  protected readonly claimStatusOptions = toOptions(CLAIM_STATUSES);
  protected readonly expiringDays = ASSET_RULES.warrantyExpiringDays;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatCurrency = formatCurrency;
  protected readonly trackById = (w: WarrantyListItem) => w.id;

  protected readonly warranties = rxResource({ params: () => ({ assetId: this.assetId() ?? undefined }), stream: ({ params }) => this.api.list(params) });
  protected readonly rows = computed(() => (this.warranties.hasValue() ? this.warranties.value() : []));
  private readonly assets = rxResource({ params: () => (this.assetId() ? undefined : true), stream: ({ params }) => (params ? this.assetsApi.list() : of([])) });

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'status', label: 'Warranty Status', type: 'multiselect', options: toOptions(WARRANTY_STATUSES) },
    { key: 'type', label: 'Warranty Type', type: 'multiselect', options: toOptions(WARRANTY_TYPES) },
    { key: 'provider', label: 'Provider', type: 'multiselect', options: toOptions([...new Set(this.rows().map((w) => w.provider))].sort()) },
    { key: 'end', label: 'End Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (w) =>
        (!term || `${w.assetCode} ${w.assetName} ${w.assetTag} ${w.provider} ${w.reference} ${w.customerName ?? ''}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'status', w.status) &&
        matchesAny(f, 'type', w.type) &&
        matchesAny(f, 'provider', w.provider) &&
        withinRange(f, 'end', w.endDate),
    );
  });
  protected readonly expiring = computed(() => this.rows().filter((w) => w.status === 'Expiring Soon'));
  protected readonly summary = computed(() =>
    WARRANTY_STATUSES.map((status) => ({ status, count: this.rows().filter((w) => w.status === status).length, icon: SUMMARY_ICON[status], tone: TONE_CLASSES[WARRANTY_STATUS_TONE[status]] })),
  );

  protected isOnly(status: string): boolean {
    const list = filterList(this.filters(), 'status');
    return list.length === 1 && list[0] === status;
  }

  protected toggleStatus(status: string): void {
    this.filters.update((f) => ({ ...f, status: this.isOnly(status) ? undefined : [status] }));
  }

  protected readonly columns = computed<DataColumn<WarrantyListItem>[]>(() => [
    ...(this.assetId() ? [] : [{ key: 'asset', label: 'Asset', value: (w: WarrantyListItem) => w.assetName, secondary: (w: WarrantyListItem) => `${w.assetCode} · ${w.customerName ?? ''}`, link: (w: WarrantyListItem) => `/app/assets/${w.assetId}`, sortable: true, mobile: 'title' as const, width: 240 }]),
    { key: 'type', label: 'Warranty Type', value: (w) => w.type, secondary: (w) => w.componentName ?? 'Whole asset', sortable: true, mobile: this.assetId() ? 'title' : 'meta', width: 190 },
    { key: 'provider', label: 'Provider', value: (w) => w.provider, sortable: true, visibility: 'md', width: 180 },
    { key: 'reference', label: 'Reference', value: (w) => w.reference, type: 'mono', visibility: 'xl', width: 150 },
    { key: 'start', label: 'Start Date', value: (w) => w.startDate, type: 'date', sortable: true, visibility: 'lg', width: 120 },
    { key: 'end', label: 'End Date', value: (w) => w.endDate, type: 'date', sortable: true, mobile: 'meta', width: 120 },
    { key: 'remaining', label: 'Remaining', value: (w) => (w.status === 'Cancelled' ? null : w.daysRemaining < 0 ? `Expired ${-w.daysRemaining}d ago` : `${w.daysRemaining} days`), visibility: 'lg', width: 130 },
    { key: 'claims', label: 'Claims', value: (w) => w.claims.length, type: 'number', sortable: true, visibility: 'xl', width: 80 },
    { key: 'services', label: 'Warranty Services', value: (w) => w.warrantyServices, type: 'number', sortable: true, visibility: '2xl', width: 120 },
    { key: 'status', label: 'Status', value: (w) => w.status, type: 'badge', tone: (w) => WARRANTY_STATUS_TONE[w.status], sortable: true, mobile: 'badge', width: 130 },
  ]);

  protected readonly rowActions = (w: WarrantyListItem): MenuItem[] => [
    { id: 'details', label: 'View Warranty', icon: 'eye' },
    { id: 'edit', label: 'Edit', icon: 'pencil', disabled: this.readOnly() },
    { id: 'claim', label: 'Add Claim', icon: 'receipt', disabled: w.status === 'Cancelled' || this.readOnly(), dividerBefore: true },
    { id: 'notify', label: 'Send Expiry Notification', icon: 'bell', disabled: w.status === 'Cancelled' || w.status === 'Expired' },
    { id: 'cancel', label: 'Cancel Warranty', icon: 'ban', danger: true, disabled: w.status === 'Cancelled' || this.readOnly(), dividerBefore: true },
  ];

  // ----- Form ---------------------------------------------------------------

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<WarrantyListItem | null>(null);
  protected readonly selected = signal<WarrantyListItem | null>(null);
  protected readonly detailsOpen = signal(false);

  protected readonly form = this.fb.group(
    {
      assetId: this.fb.control('', Validators.required),
      componentId: this.fb.control(''),
      provider: this.fb.control('', Validators.required),
      type: this.fb.control<WarrantyType>('Manufacturer Warranty', Validators.required),
      reference: this.fb.control(''),
      startDate: this.fb.control('', Validators.required),
      endDate: this.fb.control('', Validators.required),
      coverageDetails: this.fb.control(''),
      exclusions: this.fb.control(''),
      notes: this.fb.control(''),
    },
    { validators: endAfterStart },
  );
  private readonly formAssetId = toSignal(this.form.controls.assetId.valueChanges.pipe(startWith(''), map(() => this.form.controls.assetId.value)), { initialValue: '' });
  private readonly components = rxResource({
    params: () => this.formAssetId() || undefined,
    stream: ({ params }) => (params ? this.componentsApi.list({ assetId: params }) : of([])),
  });
  protected readonly componentOptions = computed(() =>
    (this.components.hasValue() ? this.components.value() : []).filter((c) => c.status !== 'Replaced' && c.status !== 'Removed').map((c) => ({ value: c.id, label: c.name, hint: c.serialNumber })),
  );
  protected readonly assetOptions = computed(() => {
    const own = this.assetId();
    if (own) return [{ value: own, label: this.rows()[0]?.assetName ? `${this.rows()[0].assetCode} · ${this.rows()[0].assetName}` : own }];
    const editing = this.editing();
    const list = (this.assets.hasValue() ? this.assets.value() : []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: a.customerName ?? undefined }));
    return editing && !list.some((o) => o.value === editing.assetId) ? [{ value: editing.assetId, label: `${editing.assetCode} · ${editing.assetName}` }, ...list] : list;
  });

  constructor() {
    this.form.controls.assetId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.editing()) this.form.controls.componentId.setValue('');
    });
    effect(() => {
      if (this.openAddOnInit() && this.assetId()) untracked(() => this.openForm(null));
    });
  }

  protected openForm(w: WarrantyListItem | null): void {
    this.editing.set(w);
    this.form.reset({
      assetId: w?.assetId ?? this.assetId() ?? '',
      componentId: w?.componentId ?? '',
      provider: w?.provider ?? '',
      type: w?.type ?? 'Manufacturer Warranty',
      reference: w?.reference ?? '',
      startDate: w?.startDate ?? new Date().toISOString().slice(0, 10),
      endDate: w?.endDate ?? '',
      coverageDetails: w?.coverageDetails ?? '',
      exclusions: w?.exclusions ?? '',
      notes: w?.notes ?? '',
    });
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const editing = this.editing();
    const input = { ...v, componentId: v.componentId || null, cancelled: editing?.cancelled ?? false, documentId: editing?.documentId ?? null };
    await this.run(() => (editing ? this.api.update(editing.id, input) : this.api.create(input)), editing ? 'Warranty updated.' : 'Warranty added.', () => this.formOpen.set(false));
  }

  // ----- Claims -------------------------------------------------------------

  protected readonly claimOpen = signal(false);
  protected readonly claimForm = this.fb.group({
    reference: this.fb.control('', Validators.required),
    date: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    description: this.fb.control('', Validators.required),
    status: this.fb.control<ClaimStatus>('Submitted', Validators.required),
    amount: this.fb.control<number | null>(null, Validators.min(0)),
  });

  protected openClaim(w: WarrantyListItem): void {
    this.selected.set(w);
    this.claimForm.reset({ reference: `WC-${Date.now().toString().slice(-6)}`, date: new Date().toISOString().slice(0, 10), description: '', status: 'Submitted', amount: null });
    this.claimOpen.set(true);
  }

  protected async addClaim(): Promise<void> {
    const w = this.selected();
    this.claimForm.markAllAsTouched();
    if (!w || this.claimForm.invalid) return;
    await this.run(() => this.api.addClaim(w.id, { ...this.claimForm.getRawValue(), serviceRecordId: null }), 'Warranty claim submitted.', () => this.claimOpen.set(false));
  }

  // ----- Details ------------------------------------------------------------

  private readonly servicesRes = rxResource({
    params: () => (this.detailsOpen() ? this.selected()?.assetId : undefined),
    stream: ({ params }) => (params ? this.historyApi.list({ assetId: params }) : of([])),
  });
  private readonly eventsRes = rxResource({
    params: () => (this.detailsOpen() ? this.selected()?.assetId : undefined),
    stream: ({ params }) => (params ? this.lifecycleApi.list({ assetId: params }) : of([])),
  });
  protected readonly warrantyServices = computed(() => {
    const w = this.selected();
    return (this.servicesRes.hasValue() ? this.servicesRes.value() : []).filter((r) => w && r.warrantyService && r.date.slice(0, 10) >= w.startDate && r.date.slice(0, 10) <= w.endDate);
  });
  protected readonly warrantyEvents = computed(() =>
    (this.eventsRes.hasValue() ? this.eventsRes.value() : []).filter((e) => e.eventType === 'Warranty Started' || e.eventType === 'Warranty Updated' || e.eventType === 'Warranty Expired'),
  );

  protected elapsed(w: WarrantyListItem): number {
    const start = new Date(w.startDate).getTime();
    const end = new Date(w.endDate).getTime();
    return end <= start ? 100 : Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100)));
  }

  protected remainingText(w: WarrantyListItem): string {
    if (w.status === 'Cancelled') return 'Warranty cancelled.';
    if (w.status === 'Not Started') return `Starts ${formatDate(w.startDate)}.`;
    return w.daysRemaining < 0 ? `Expired ${-w.daysRemaining} days ago.` : `${w.daysRemaining} days remaining.`;
  }

  protected async attach(event: Event, w: WarrantyListItem): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.saving.set(true);
    try {
      const doc = await firstValueFrom(
        this.documentsApi.upload({
          assetId: w.assetId, componentId: w.componentId, name: `${w.provider} ${w.type}`, type: 'Warranty Documents', documentNumber: w.reference,
          issueDate: w.startDate, expiryDate: w.endDate, reminderDays: ASSET_RULES.warrantyExpiringDays, access: 'Customer Visible', notes: '',
          file: { name: file.name, size: file.size, type: file.type },
        }),
      );
      const { id: _id, claims: _c, createdAt: _a, createdBy: _b, isPrimary: _p, status: _s, daysRemaining: _d, assetCode: _ac, assetName: _an, assetTag: _at, customerName: _cn, siteName: _sn, componentName: _cmn, documentName: _dn, warrantyServices: _ws, ...fields } = w;
      void [_id, _c, _a, _b, _p, _s, _d, _ac, _an, _at, _cn, _sn, _cmn, _dn, _ws];
      await firstValueFrom(this.api.update(w.id, { ...fields, documentId: doc.id }));
      this.notify.success('Warranty document attached.');
      this.detailsOpen.set(false);
      this.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected notifyAll(): void {
    this.notify.info(`Expiry notifications sent for ${this.expiring().length} warrant${this.expiring().length === 1 ? 'y' : 'ies'} according to notification settings.`, 'Warranty notifications');
  }

  protected async onAction({ id, row }: RowAction<WarrantyListItem>): Promise<void> {
    this.selected.set(row);
    switch (id) {
      case 'details':
        this.detailsOpen.set(true);
        break;
      case 'edit':
        this.openForm(row);
        break;
      case 'claim':
        this.openClaim(row);
        break;
      case 'notify':
        this.notify.info(`Expiry notification for ${row.assetCode} (${row.reference}) sent — ends ${formatDate(row.endDate)}.`, 'Warranty notification');
        break;
      case 'cancel': {
        const ok = await this.confirm.open({ title: 'Cancel warranty?', message: `${row.type} ${row.reference} for ${row.assetName} will be cancelled. The record and its history are kept.`, confirmLabel: 'Cancel warranty', danger: true });
        if (ok) await this.run(() => this.api.cancel(row.id, 'Cancelled by user'), 'Warranty cancelled.');
        break;
      }
    }
  }

  protected export(): void {
    downloadCsv(
      timestampedName('asset-warranties', 'csv'),
      ['Asset ID', 'Asset', 'Customer', 'Component', 'Warranty Type', 'Provider', 'Reference', 'Start Date', 'End Date', 'Status', 'Days Remaining', 'Claims', 'Coverage', 'Exclusions'],
      this.filtered().map((w) => [w.assetCode, w.assetName, w.customerName, w.componentName, w.type, w.provider, w.reference, w.startDate, w.endDate, w.status, w.daysRemaining, w.claims.length, w.coverageDetails, w.exclusions]),
    );
  }

  private async run(work: () => Observable<unknown>, message: string, after?: () => void): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(work());
      this.notify.success(message);
      after?.();
      this.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private reload(): void {
    this.warranties.reload();
    this.changed.emit();
  }
}
