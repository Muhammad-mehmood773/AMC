import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { DetailItem } from '@shared/ui/detail-item';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon, type IconName } from '@shared/ui/icon';
import { LookupSelect } from '@shared/ui/lookup-select';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, matchesAny, withinRange } from '@shared/utils/filters';
import { formatDate } from '@shared/utils/format';
import { type Observable, firstValueFrom } from 'rxjs';
import { AssetReferenceStore } from '../data/asset-reference.store';
import { AssetApi, AssetDocumentApi, InstallationApi } from '../data/asset.api';
import { ASSET_LOOKUP } from '../data/asset.lookups';
import { PRE_INSTALLATION_STATUSES } from '../models/asset.model';
import { COMMISSIONING_STATUS_TONE, INSTALLATION_STATUS_TONE, TONE_CLASSES } from '../models/display';
import {
  COMMISSIONING_STATUSES,
  INITIAL_CONDITIONS,
  INSTALLATION_STATUSES,
  type CommissioningStatus,
  type InstallationListItem,
} from '../models/operations.model';

const STEPS = ['Scheduled', 'Installation', 'Installed', 'Commissioning', 'Commissioned', 'Customer Confirmed'] as const;
const SUMMARY_ICON: Record<CommissioningStatus, IconName> = {
  Pending: 'clock',
  'In Progress': 'activity',
  Completed: 'check-circle',
  Failed: 'alert-circle',
  'Rework Required': 'refresh',
};

/** SRS 3.8 — installation and commissioning workflow. */
@Component({
  selector: 'amc-installation-manager',
  imports: [DataTable, DatePicker, DetailItem, Dialog, FilterBar, FormField, Icon, LookupSelect, ReactiveFormsModule, RouterLink, Select, Spinner, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-4' },
  template: `
    @if (!assetId()) {
      <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
        @for (card of summary(); track card.status) {
          <button
            type="button"
            class="amc-card flex items-center gap-3 p-3.5 text-left transition-colors hover:border-line-strong"
            [class]="isOnly(card.status) ? 'ring-2 ring-brand' : ''"
            [attr.aria-pressed]="isOnly(card.status)"
            (click)="toggleStatus(card.status)"
          >
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" [class]="card.tone"><amc-icon [name]="card.icon" /></span>
            <span class="min-w-0">
              <span class="block text-xl font-semibold text-ink tabular-nums">{{ card.count }}</span>
              <span class="block truncate text-xs text-ink-muted">Commissioning {{ card.status.toLowerCase() }}</span>
            </span>
          </button>
        }
      </div>
    }

    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar searchPlaceholder="Search asset, reference, technician or site…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters">
          <ng-container actions>
            <button type="button" class="amc-btn-ghost hidden sm:inline-flex" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> Export</button>
            <button type="button" class="amc-btn-primary" (click)="openSchedule(assetId())"><amc-icon name="plus" /> <span class="hidden sm:inline">Schedule Installation</span></button>
          </ng-container>
        </amc-filter-bar>
      </div>
      <amc-data-table
        [tableId]="assetId() ? 'asset-installations' : 'installations'"
        [entity]="{ singular: 'installation', plural: 'installations' }"
        [totalCount]="rows().length"
        [rows]="filtered()"
        [columns]="columns()"
        [trackBy]="trackById"
        [loading]="records.isLoading()"
        [error]="records.error() ? 'Installations could not be loaded.' : null"
        [actions]="rowActions"
        emptyIcon="wrench"
        [emptyTitle]="rows().length ? 'No installations match your filters' : 'No installations yet'"
        [emptyMessage]="rows().length ? 'Try a different search or clear the filters.' : 'Schedule the installation of received assets at customer sites.'"
        (action)="onAction($event)"
        (retry)="records.reload()"
      />
    </section>

    <!-- Schedule -->
    <amc-dialog size="lg" title="Schedule installation" description="Plan the installation of an asset at its customer site." [(open)]="scheduleOpen">
      <form [formGroup]="scheduleForm" id="install-form" novalidate (ngSubmit)="schedule()">
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Asset" for="ins-asset" [control]="scheduleForm.controls.assetId" class="sm:col-span-2" hint="Assets that are planned, ordered or received and have a service site.">
            <amc-select inputId="ins-asset" formControlName="assetId" [options]="eligibleAssets()" placeholder="Select asset…" />
          </amc-form-field>
          @if (selectedAsset(); as a) {
            <div class="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface-muted p-3 text-sm sm:col-span-2">
              <amc-detail-item label="Customer" [value]="a.customerName" />
              <amc-detail-item label="Site" [value]="a.siteName" />
            </div>
          }
          <amc-form-field label="Installation Date" for="ins-date" [control]="scheduleForm.controls.installationDate">
            <amc-date-picker inputId="ins-date" formControlName="installationDate" />
          </amc-form-field>
          <amc-form-field label="Installation Team" for="ins-team" [control]="scheduleForm.controls.installationTeam">
            <amc-lookup-select inputId="ins-team" formControlName="installationTeam" [type]="lookup.responsibleTeam" />
          </amc-form-field>
          <amc-form-field label="Technician" for="ins-tech" [control]="scheduleForm.controls.technician">
            <amc-select inputId="ins-tech" formControlName="technician" [options]="refs.technicianOptions()" placeholder="Select technician…" />
          </amc-form-field>
          <amc-form-field label="Installation Location" for="ins-loc" [control]="scheduleForm.controls.location">
            <input id="ins-loc" class="amc-input" formControlName="location" placeholder="e.g. Basement B2 Plant Room" />
          </amc-form-field>
          <amc-form-field label="Installation Reference" for="ins-ref" [control]="scheduleForm.controls.reference">
            <input id="ins-ref" class="amc-input font-mono" formControlName="reference" placeholder="e.g. INST-10021" />
          </amc-form-field>
          <amc-form-field label="Installation Notes" for="ins-notes" [control]="scheduleForm.controls.notes" class="sm:col-span-2">
            <textarea id="ins-notes" class="amc-textarea min-h-16" formControlName="notes"></textarea>
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="scheduleOpen.set(false)">Cancel</button>
        <button type="submit" form="install-form" class="amc-btn-primary" [disabled]="saving()">@if (saving()) { <amc-spinner [size]="14" /> } Schedule</button>
      </ng-container>
    </amc-dialog>

    <!-- Commissioning -->
    <amc-dialog size="lg" title="Complete commissioning" [description]="selected() ? selected()!.assetCode + ' · ' + selected()!.assetName : ''" [(open)]="commissionOpen">
      <form [formGroup]="commissionForm" id="commission-form" novalidate (ngSubmit)="commission()">
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <amc-form-field label="Commissioning Date" for="com-date" [control]="commissionForm.controls.commissioningDate">
            <amc-date-picker inputId="com-date" formControlName="commissioningDate" />
          </amc-form-field>
          <amc-form-field label="Commissioned By" for="com-by" [control]="commissionForm.controls.commissionedBy">
            <amc-select inputId="com-by" formControlName="commissionedBy" [options]="refs.technicianOptions()" placeholder="Select technician…" />
          </amc-form-field>
          <div class="sm:col-span-2">
            <span class="amc-label">Commissioning Checklist</span>
            <ul class="mt-2 divide-y divide-line rounded-xl border border-line">
              @for (item of checklist(); track item.item; let i = $index) {
                <li>
                  <label class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                    <input type="checkbox" class="amc-checkbox" [checked]="item.done" (change)="toggleCheck(i)" />
                    <span [class]="item.done ? 'text-ink' : 'text-ink-muted'">{{ item.item }}</span>
                  </label>
                </li>
              }
            </ul>
            <p class="mt-1.5 text-xs text-ink-muted">{{ checkedCount() }} of {{ checklist().length }} completed · all items are required to complete commissioning.</p>
          </div>
          <amc-form-field label="Initial Meter Reading" for="com-meter" [control]="commissionForm.controls.initialMeterReading">
            <input id="com-meter" type="number" min="0" class="amc-input tabular-nums" formControlName="initialMeterReading" />
          </amc-form-field>
          <amc-form-field label="Initial Condition" for="com-cond" [control]="commissionForm.controls.initialCondition">
            <amc-select inputId="com-cond" formControlName="initialCondition" [options]="conditionOptions" />
          </amc-form-field>
          <amc-form-field label="Test Results" for="com-tests" [control]="commissionForm.controls.testResults" class="sm:col-span-2">
            <textarea id="com-tests" class="amc-textarea min-h-16" formControlName="testResults" placeholder="Functional, safety and performance test results"></textarea>
          </amc-form-field>
          <amc-form-field label="Commissioning Outcome" for="com-outcome" [control]="commissionForm.controls.outcome">
            <amc-select inputId="com-outcome" formControlName="outcome" [options]="outcomeOptions" />
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="commissionOpen.set(false)">Cancel</button>
        <button type="submit" form="commission-form" class="amc-btn-primary" [disabled]="saving()">@if (saving()) { <amc-spinner [size]="14" /> } Save Commissioning</button>
      </ng-container>
    </amc-dialog>

    <!-- Customer confirmation -->
    <amc-dialog size="md" title="Capture customer confirmation" [description]="selected() ? selected()!.assetName + ' · ' + (selected()!.customerName ?? '') : ''" [(open)]="confirmOpen">
      <form [formGroup]="confirmForm" id="confirm-form" novalidate (ngSubmit)="confirmInstallation()">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <amc-form-field label="Customer Representative" for="cc-name" [control]="confirmForm.controls.name">
            <input id="cc-name" class="amc-input" formControlName="name" />
          </amc-form-field>
          <amc-form-field label="Designation" for="cc-desig" [control]="confirmForm.controls.designation">
            <input id="cc-desig" class="amc-input" formControlName="designation" />
          </amc-form-field>
          <amc-form-field label="Confirmation Date" for="cc-date" [control]="confirmForm.controls.date">
            <amc-date-picker inputId="cc-date" formControlName="date" />
          </amc-form-field>
          <amc-form-field label="Remarks" for="cc-remarks" [control]="confirmForm.controls.remarks" class="sm:col-span-2">
            <textarea id="cc-remarks" class="amc-textarea min-h-16" formControlName="remarks"></textarea>
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="confirmOpen.set(false)">Cancel</button>
        <button type="submit" form="confirm-form" class="amc-btn-primary" [disabled]="saving()">Confirm</button>
      </ng-container>
    </amc-dialog>

    <!-- Upload documents -->
    <amc-dialog size="md" title="Upload installation documents" [description]="selected()?.assetName ?? ''" [(open)]="uploadOpen">
      <div class="space-y-4">
        <amc-form-field label="Document Type" for="ins-doc-type" [required]="true">
          <amc-select inputId="ins-doc-type" [options]="docTypeOptions" [(value)]="docType" />
        </amc-form-field>
        <label for="ins-doc-files" class="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong bg-surface-muted px-4 py-6 text-center hover:border-brand hover:bg-brand-subtle">
          <amc-icon name="upload" [size]="20" class="text-ink-subtle" />
          <span class="text-sm font-medium text-ink">{{ docFiles().length ? docFiles().length + ' file(s) selected' : 'Click to choose files' }}</span>
          <span class="text-xs text-ink-muted">Checklists, test sheets, handover certificates, photos</span>
          <input id="ins-doc-files" type="file" multiple class="sr-only" (change)="onFiles($event)" />
        </label>
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="uploadOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="saving() || !docFiles().length" (click)="uploadDocs()">Upload</button>
      </ng-container>
    </amc-dialog>

    <!-- Details -->
    <amc-dialog size="xl" [title]="selected() ? 'Installation ' + (selected()!.reference || selected()!.id) : 'Installation'" [description]="selected() ? selected()!.assetCode + ' · ' + selected()!.assetName : ''" [(open)]="detailsOpen">
      @if (selected(); as r) {
        <ol class="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-6">
          @for (step of steps; track step; let i = $index) {
            <li class="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs sm:flex-col sm:items-start" [class]="i <= stepIndex(r) ? 'border-brand/30 bg-brand-subtle text-ink' : 'border-line text-ink-muted'">
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold" [class]="i <= stepIndex(r) ? 'bg-brand text-brand-foreground' : 'bg-surface-sunken'">{{ i + 1 }}</span>
              <span class="font-medium">{{ step }}</span>
            </li>
          }
        </ol>
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section>
            <h3 class="text-sm font-semibold text-ink">Installation information</h3>
            <dl class="mt-3 grid grid-cols-2 gap-4">
              <div><dt class="text-xs font-medium text-ink-muted">Asset</dt><dd class="mt-1 text-sm"><a class="amc-link" [routerLink]="['/app/assets', r.assetId]">{{ r.assetCode }} · {{ r.assetName }}</a></dd></div>
              <amc-detail-item label="Customer" [value]="r.customerName" />
              <amc-detail-item label="Site" [value]="r.siteName" />
              <amc-detail-item label="Installation Date" [value]="formatDate(r.installationDate)" />
              <amc-detail-item label="Installation Team" [value]="r.installationTeam" />
              <amc-detail-item label="Technician" [value]="r.technician" />
              <amc-detail-item label="Installation Location" [value]="r.location" />
              <amc-detail-item label="Installation Reference" [value]="r.reference" [mono]="true" />
              <div><dt class="text-xs font-medium text-ink-muted">Installation Status</dt><dd class="mt-1"><amc-status-badge [label]="r.installationStatus" [tone]="installTone[r.installationStatus]" /></dd></div>
              <amc-detail-item label="Documents" [value]="r.documentCount" />
              <amc-detail-item class="col-span-2" label="Installation Notes" [value]="r.notes" />
            </dl>
          </section>
          <section>
            <h3 class="text-sm font-semibold text-ink">Commissioning information</h3>
            <dl class="mt-3 grid grid-cols-2 gap-4">
              <div><dt class="text-xs font-medium text-ink-muted">Commissioning Status</dt><dd class="mt-1"><amc-status-badge [label]="r.commissioningStatus" [tone]="commissionTone[r.commissioningStatus]" /></dd></div>
              <amc-detail-item label="Commissioning Date" [value]="formatDate(r.commissioningDate)" />
              <amc-detail-item label="Commissioned By" [value]="r.commissionedBy" />
              <amc-detail-item label="Initial Meter Reading" [value]="r.initialMeterReading" />
              <amc-detail-item label="Initial Condition" [value]="r.initialCondition" />
              <amc-detail-item label="Customer Confirmation" [value]="r.customerConfirmation ? r.customerConfirmation.name + ' (' + r.customerConfirmation.designation + ') · ' + formatDate(r.customerConfirmation.date) : 'Not captured'" />
              <amc-detail-item class="col-span-2" label="Test Results" [value]="r.testResults" />
            </dl>
            <ul class="mt-4 space-y-1.5">
              @for (c of r.checklist; track c.item) {
                <li class="flex items-center gap-2 text-sm" [class]="c.done ? 'text-ink' : 'text-ink-muted'">
                  <amc-icon [name]="c.done ? 'check-circle' : 'clock'" [size]="14" [class]="c.done ? 'text-ok' : 'text-ink-subtle'" />
                  {{ c.item }}
                </li>
              }
            </ul>
          </section>
        </div>
      }
    </amc-dialog>
  `,
})
export class InstallationManager {
  private readonly api = inject(InstallationApi);
  private readonly assetsApi = inject(AssetApi);
  private readonly documentsApi = inject(AssetDocumentApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(AssetReferenceStore);

  readonly assetId = input<string | null>(null);
  /** Opens the schedule dialog for this asset on load (e.g. from "Save & Install"). */
  readonly scheduleFor = input<string | null>(null);
  readonly changed = output<void>();

  protected readonly lookup = ASSET_LOOKUP;
  protected readonly steps = STEPS;
  protected readonly installTone = INSTALLATION_STATUS_TONE;
  protected readonly commissionTone = COMMISSIONING_STATUS_TONE;
  protected readonly formatDate = formatDate;
  protected readonly conditionOptions = toOptions(INITIAL_CONDITIONS);
  protected readonly outcomeOptions = toOptions(['Completed', 'Failed', 'Rework Required'] as const);
  protected readonly docTypeOptions = toOptions(['Installation Documents', 'Commissioning Reports', 'Photos'] as const);
  protected readonly trackById = (r: InstallationListItem) => r.id;

  protected readonly records = rxResource({ params: () => ({ assetId: this.assetId() ?? undefined }), stream: ({ params }) => this.api.list(params) });
  protected readonly rows = computed(() => (this.records.hasValue() ? this.records.value() : []));
  private readonly assets = rxResource({ stream: () => this.assetsApi.list() });

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'installation', label: 'Installation Status', type: 'multiselect', options: toOptions(INSTALLATION_STATUSES) },
    { key: 'commissioning', label: 'Commissioning Status', type: 'multiselect', options: toOptions(COMMISSIONING_STATUSES) },
    { key: 'technician', label: 'Technician', type: 'multiselect', options: this.refs.technicianOptions() },
    ...(this.assetId() ? [] : [{ key: 'customer', label: 'Customer', type: 'multiselect' as const, options: toOptions([...new Set(this.rows().map((r) => r.customerName ?? ''))].filter(Boolean).sort()) }]),
    { key: 'date', label: 'Installation Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (r) =>
        (!term || `${r.assetCode} ${r.assetName} ${r.assetTag} ${r.reference} ${r.technician} ${r.siteName ?? ''} ${r.customerName ?? ''}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'installation', r.installationStatus) &&
        matchesAny(f, 'commissioning', r.commissioningStatus) &&
        matchesAny(f, 'technician', r.technician) &&
        matchesAny(f, 'customer', r.customerName) &&
        withinRange(f, 'date', r.installationDate),
    );
  });

  protected readonly summary = computed(() =>
    COMMISSIONING_STATUSES.map((status) => ({
      status,
      count: this.rows().filter((r) => r.commissioningStatus === status).length,
      icon: SUMMARY_ICON[status],
      tone: TONE_CLASSES[COMMISSIONING_STATUS_TONE[status]],
    })),
  );

  protected isOnly(status: string): boolean {
    const list = filterList(this.filters(), 'commissioning');
    return list.length === 1 && list[0] === status;
  }

  protected toggleStatus(status: string): void {
    this.filters.update((f) => ({ ...f, commissioning: this.isOnly(status) ? undefined : [status] }));
  }

  protected readonly columns = computed<DataColumn<InstallationListItem>[]>(() => [
    { key: 'asset', label: 'Asset', value: (r) => r.assetName, secondary: (r) => `${r.assetCode} · ${r.assetTag}`, link: (r) => `/app/assets/${r.assetId}`, sortable: true, mobile: 'title', width: 230 },
    ...(this.assetId() ? [] : [{ key: 'site', label: 'Customer / Site', value: (r: InstallationListItem) => r.siteName, secondary: (r: InstallationListItem) => r.customerName, sortable: true, visibility: 'lg' as const, mobile: 'meta' as const, width: 220 }]),
    { key: 'date', label: 'Installation Date', value: (r) => r.installationDate, type: 'date', sortable: true, mobile: 'meta', width: 140 },
    { key: 'technician', label: 'Technician', value: (r) => r.technician, secondary: (r) => r.installationTeam, sortable: true, visibility: 'xl', width: 170 },
    { key: 'reference', label: 'Reference', value: (r) => r.reference, type: 'mono', visibility: '2xl', width: 120 },
    { key: 'installation', label: 'Installation', value: (r) => r.installationStatus, type: 'badge', tone: (r) => INSTALLATION_STATUS_TONE[r.installationStatus], sortable: true, visibility: 'md', width: 130 },
    { key: 'commissioning', label: 'Commissioning', value: (r) => r.commissioningStatus, type: 'badge', tone: (r) => COMMISSIONING_STATUS_TONE[r.commissioningStatus], sortable: true, mobile: 'badge', width: 150 },
    { key: 'confirmation', label: 'Customer Confirmation', value: (r) => (r.customerConfirmation ? 'Confirmed' : r.installationStatus === 'Completed' ? 'Pending' : null), visibility: 'xl', width: 160 },
  ]);

  protected readonly rowActions = (r: InstallationListItem): MenuItem[] => [
    { id: 'details', label: 'View Details', icon: 'eye' },
    { id: 'start-installation', label: 'Start Installation', icon: 'wrench', disabled: r.installationStatus !== 'Scheduled', dividerBefore: true },
    { id: 'complete-installation', label: 'Complete Installation', icon: 'check', disabled: r.installationStatus !== 'In Progress' },
    { id: 'start-commissioning', label: 'Start Commissioning', icon: 'activity', disabled: r.installationStatus !== 'Completed' || r.commissioningStatus === 'Completed' || r.commissioningStatus === 'In Progress' },
    { id: 'complete-commissioning', label: 'Complete Commissioning', icon: 'check-circle', disabled: r.commissioningStatus !== 'In Progress' && r.commissioningStatus !== 'Rework Required' },
    { id: 'upload', label: 'Upload Documents', icon: 'upload', dividerBefore: true },
    { id: 'confirm', label: 'Capture Customer Confirmation', icon: 'user-check', disabled: r.installationStatus !== 'Completed' || !!r.customerConfirmation },
  ];

  protected readonly selected = signal<InstallationListItem | null>(null);
  protected readonly saving = signal(false);
  protected readonly detailsOpen = signal(false);

  protected stepIndex(r: InstallationListItem): number {
    if (r.customerConfirmation && r.commissioningStatus === 'Completed') return 5;
    if (r.commissioningStatus === 'Completed') return 4;
    if (r.commissioningStatus !== 'Pending') return 3;
    if (r.installationStatus === 'Completed') return 2;
    if (r.installationStatus === 'In Progress') return 1;
    return 0;
  }

  // ----- Schedule -----------------------------------------------------------

  protected readonly scheduleOpen = signal(false);
  protected readonly scheduleForm = this.fb.group({
    assetId: this.fb.control('', Validators.required),
    installationDate: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    installationTeam: this.fb.control('Installation Team', Validators.required),
    technician: this.fb.control('', Validators.required),
    location: this.fb.control('', Validators.required),
    reference: this.fb.control(''),
    notes: this.fb.control(''),
  });
  private readonly scheduleAssetId = signal('');
  protected readonly eligibleAssets = computed(() => {
    const open = new Set(this.rows().filter((r) => r.installationStatus !== 'Completed').map((r) => r.assetId));
    return (this.assets.hasValue() ? this.assets.value() : [])
      .filter((a) => (PRE_INSTALLATION_STATUSES.includes(a.status) || !a.installation.date) && a.siteId && !open.has(a.id))
      .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: `${a.status} · ${a.siteName ?? ''}` }));
  });
  protected readonly selectedAsset = computed(() => (this.assets.hasValue() ? this.assets.value() : []).find((a) => a.id === this.scheduleAssetId()) ?? null);

  constructor() {
    this.scheduleForm.controls.assetId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.scheduleAssetId.set(id);
      const asset = (this.assets.hasValue() ? this.assets.value() : []).find((a) => a.id === id);
      if (asset && !this.scheduleForm.controls.location.dirty) this.scheduleForm.controls.location.setValue(asset.installation.location);
    });
    effect(() => {
      const id = this.scheduleFor();
      if (id && this.assets.hasValue()) untracked(() => this.openSchedule(id));
    });
  }

  protected openSchedule(assetId: string | null): void {
    this.scheduleForm.reset({ assetId: '', installationDate: new Date().toISOString().slice(0, 10), installationTeam: 'Installation Team', technician: '', location: '', reference: '', notes: '' });
    if (assetId) this.scheduleForm.controls.assetId.setValue(assetId);
    this.scheduleOpen.set(true);
  }

  protected async schedule(): Promise<void> {
    this.scheduleForm.markAllAsTouched();
    if (this.scheduleForm.invalid) return;
    await this.run(() => this.api.schedule(this.scheduleForm.getRawValue()), 'Installation scheduled.', () => this.scheduleOpen.set(false));
  }

  // ----- Commissioning ------------------------------------------------------

  protected readonly commissionOpen = signal(false);
  protected readonly checklist = signal<{ item: string; done: boolean }[]>([]);
  protected readonly checkedCount = computed(() => this.checklist().filter((c) => c.done).length);
  protected readonly commissionForm = this.fb.group({
    commissioningDate: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    commissionedBy: this.fb.control('', Validators.required),
    initialMeterReading: this.fb.control<number | null>(null, Validators.min(0)),
    initialCondition: this.fb.control('New', Validators.required),
    testResults: this.fb.control('', Validators.required),
    outcome: this.fb.control<'Completed' | 'Failed' | 'Rework Required'>('Completed', Validators.required),
  });

  protected toggleCheck(index: number): void {
    this.checklist.update((list) => list.map((c, i) => (i === index ? { ...c, done: !c.done } : c)));
  }

  protected async commission(): Promise<void> {
    const r = this.selected();
    this.commissionForm.markAllAsTouched();
    if (!r || this.commissionForm.invalid) return;
    const v = this.commissionForm.getRawValue();
    await this.run(() => this.api.completeCommissioning(r.id, { ...v, checklist: this.checklist() }), v.outcome === 'Completed' ? 'Commissioning completed — asset is now active.' : `Commissioning recorded as ${v.outcome.toLowerCase()}.`, () => this.commissionOpen.set(false));
  }

  // ----- Confirmation & documents -------------------------------------------

  protected readonly confirmOpen = signal(false);
  protected readonly confirmForm = this.fb.group({
    name: this.fb.control('', Validators.required),
    designation: this.fb.control(''),
    date: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    remarks: this.fb.control(''),
  });

  protected async confirmInstallation(): Promise<void> {
    const r = this.selected();
    this.confirmForm.markAllAsTouched();
    if (!r || this.confirmForm.invalid) return;
    await this.run(() => this.api.confirm(r.id, this.confirmForm.getRawValue()), 'Customer confirmation captured.', () => this.confirmOpen.set(false));
  }

  protected readonly uploadOpen = signal(false);
  protected readonly docType = signal<string | number | null>('Installation Documents');
  protected readonly docFiles = signal<readonly File[]>([]);

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.docFiles.set(Array.from(input.files ?? []));
    input.value = '';
  }

  protected async uploadDocs(): Promise<void> {
    const r = this.selected();
    if (!r) return;
    this.saving.set(true);
    try {
      for (const file of this.docFiles()) {
        await firstValueFrom(
          this.documentsApi.upload({
            assetId: r.assetId, componentId: null, name: file.name.replace(/\.[^.]+$/, ''), type: String(this.docType()), documentNumber: r.reference,
            issueDate: new Date().toISOString().slice(0, 10), expiryDate: null, reminderDays: 30, access: 'Internal', notes: `Installation ${r.reference || r.id}`,
            file: { name: file.name, size: file.size, type: file.type },
          }),
        );
      }
      this.notify.success(`${this.docFiles().length} document(s) uploaded.`);
      this.uploadOpen.set(false);
      this.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async onAction({ id, row }: RowAction<InstallationListItem>): Promise<void> {
    this.selected.set(row);
    switch (id) {
      case 'details':
        this.detailsOpen.set(true);
        break;
      case 'start-installation':
        await this.run(() => this.api.startInstallation(row.id), 'Installation started.');
        break;
      case 'complete-installation':
        await this.run(() => this.api.completeInstallation(row.id), 'Installation completed — asset is now installed.');
        break;
      case 'start-commissioning':
        await this.run(() => this.api.startCommissioning(row.id), 'Commissioning started.');
        break;
      case 'complete-commissioning':
        this.checklist.set(row.checklist.map((c) => ({ ...c })));
        this.commissionForm.reset({ commissioningDate: new Date().toISOString().slice(0, 10), commissionedBy: row.commissionedBy || row.technician, initialMeterReading: row.initialMeterReading, initialCondition: row.initialCondition || 'New', testResults: row.testResults, outcome: 'Completed' });
        this.commissionOpen.set(true);
        break;
      case 'upload':
        this.docFiles.set([]);
        this.uploadOpen.set(true);
        break;
      case 'confirm':
        this.confirmForm.reset({ name: '', designation: '', date: new Date().toISOString().slice(0, 10), remarks: '' });
        this.confirmOpen.set(true);
        break;
    }
  }

  protected export(): void {
    downloadCsv(
      timestampedName('asset-installations', 'csv'),
      ['Asset ID', 'Asset', 'Customer', 'Site', 'Installation Date', 'Team', 'Technician', 'Location', 'Reference', 'Installation Status', 'Commissioning Date', 'Commissioned By', 'Commissioning Status', 'Customer Confirmation'],
      this.filtered().map((r) => [r.assetCode, r.assetName, r.customerName, r.siteName, r.installationDate, r.installationTeam, r.technician, r.location, r.reference, r.installationStatus, r.commissioningDate, r.commissionedBy, r.commissioningStatus, r.customerConfirmation?.name ?? '']),
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
    this.records.reload();
    this.assets.reload();
    this.changed.emit();
  }
}
