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
import { LookupSelect } from '@shared/ui/lookup-select';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, downloadFile, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, filterList, matchesAny, withinRange } from '@shared/utils/filters';
import { formatDate, formatDateTime, formatFileSize } from '@shared/utils/format';
import { type Observable, firstValueFrom, map, of, startWith } from 'rxjs';
import { AssetApi, AssetDocumentApi, ComponentApi } from '../data/asset.api';
import { ASSET_LOOKUP } from '../data/asset.lookups';
import { DOCUMENT_STATUS_TONE, TONE_CLASSES } from '../models/display';
import { DOCUMENT_ACCESS_LEVELS, DOCUMENT_STATUSES, type AssetDocumentListItem, type DocumentAccess, type DocumentFile } from '../models/document.model';

function expiryAfterIssue(group: AbstractControl): ValidationErrors | null {
  const issue = group.get('issueDate')?.value as string;
  const expiry = group.get('expiryDate')?.value as string;
  return issue && expiry && expiry < issue ? { expiryBeforeIssue: true } : null;
}

const SUMMARY: readonly { status: 'Valid' | 'Expiring Soon' | 'Expired' | 'No Expiry'; icon: IconName }[] = [
  { status: 'Valid', icon: 'check-circle' },
  { status: 'Expiring Soon', icon: 'clock' },
  { status: 'Expired', icon: 'alert-triangle' },
  { status: 'No Expiry', icon: 'file-text' },
];

/** SRS 3.12 — asset document register with versioning, expiry tracking and access control. */
@Component({
  selector: 'amc-asset-document-manager',
  imports: [DataTable, DatePicker, DetailItem, Dialog, FilterBar, FormField, Icon, LookupSelect, ReactiveFormsModule, RouterLink, Select, Spinner, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-4' },
  template: `
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar searchPlaceholder="Search name, number, asset or file…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters">
          <ng-container actions>
            <button type="button" class="amc-btn-ghost hidden sm:inline-flex" [disabled]="!filtered().length" (click)="export()"><amc-icon name="download" /> Export</button>
            <button type="button" class="amc-btn-primary" (click)="openUpload()"><amc-icon name="upload" /> <span class="hidden sm:inline">Upload Document</span></button>
          </ng-container>
        </amc-filter-bar>
      </div>
      <amc-data-table
        [tableId]="assetId() ? 'asset-documents' : 'all-asset-documents'"
        [entity]="{ singular: 'document', plural: 'documents' }"
        [totalCount]="rows().length"
        [rows]="filtered()"
        [columns]="columns()"
        [trackBy]="trackById"
        [loading]="documents.isLoading()"
        [error]="documents.error() ? 'Documents could not be loaded.' : null"
        [actions]="rowActions"
        emptyIcon="file-text"
        [emptyTitle]="rows().length ? 'No documents match your filters' : 'No documents yet'"
        [emptyMessage]="rows().length ? 'Try a different search or clear the filters.' : 'Upload manuals, datasheets, warranty, installation and compliance documents.'"
        (action)="onAction($event)"
        (retry)="documents.reload()"
      />
    </section>

    <!-- Upload -->
    <amc-dialog size="lg" title="Upload document" description="Add an asset document with expiry tracking and access control." [(open)]="uploadOpen">
      <form [formGroup]="form" id="asset-doc-form" novalidate (ngSubmit)="upload()">
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <span class="amc-label">File <span class="text-danger">*</span></span>
            <label for="adoc-file" class="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 transition-colors hover:border-brand hover:bg-brand-subtle" [class]="fileError() ? 'border-danger bg-danger-subtle' : 'border-line-strong bg-surface-muted'">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-muted shadow-xs"><amc-icon [name]="file() ? 'file-check' : 'upload'" [size]="18" /></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-ink">{{ file()?.name ?? 'Choose a file to upload' }}</span>
                <span class="block text-xs text-ink-muted">{{ file() ? formatFileSize(file()!.size) : 'PDF, image or Office document, up to 10 MB' }}</span>
              </span>
              <span class="amc-btn-secondary amc-btn-sm">Browse</span>
              <input id="adoc-file" type="file" class="sr-only" (change)="onFile($event)" />
            </label>
            @if (fileError()) { <p class="mt-1.5 text-xs text-danger" role="alert">{{ fileError() }}</p> }
          </div>
          @if (!assetId()) {
            <amc-form-field label="Asset" for="adoc-asset" [control]="form.controls.assetId" class="sm:col-span-2">
              <amc-select inputId="adoc-asset" formControlName="assetId" [options]="assetOptions()" placeholder="Select asset…" />
            </amc-form-field>
          }
          <amc-form-field label="Document Name" for="adoc-name" [control]="form.controls.name" class="sm:col-span-2">
            <input id="adoc-name" class="amc-input" formControlName="name" placeholder="e.g. Chiller O&M Manual" />
          </amc-form-field>
          <amc-form-field label="Document Type" for="adoc-type" [control]="form.controls.type">
            <amc-lookup-select inputId="adoc-type" formControlName="type" [type]="lookup.documentType" />
          </amc-form-field>
          <amc-form-field label="Document Number" for="adoc-number" [control]="form.controls.documentNumber">
            <input id="adoc-number" class="amc-input font-mono" formControlName="documentNumber" />
          </amc-form-field>
          <amc-form-field label="Component" for="adoc-component" [control]="form.controls.componentId" hint="Optional — component documents.">
            <amc-select inputId="adoc-component" formControlName="componentId" [options]="componentOptions()" placeholder="Whole asset" [clearable]="true" />
          </amc-form-field>
          <amc-form-field label="Access Control" for="adoc-access" [control]="form.controls.access">
            <amc-select inputId="adoc-access" formControlName="access" [options]="accessOptions" />
          </amc-form-field>
          <amc-form-field label="Issue Date" for="adoc-issue" [control]="form.controls.issueDate">
            <amc-date-picker inputId="adoc-issue" formControlName="issueDate" />
          </amc-form-field>
          <amc-form-field label="Expiry Date" for="adoc-expiry" [control]="form.controls.expiryDate" [hint]="form.hasError('expiryBeforeIssue') ? '' : 'Leave empty if the document does not expire.'">
            <amc-date-picker inputId="adoc-expiry" formControlName="expiryDate" />
            @if (form.hasError('expiryBeforeIssue') && form.touched) {
              <p class="text-xs text-danger" role="alert">Expiry date must be on or after the issue date.</p>
            }
          </amc-form-field>
          @if (formValue().expiryDate) {
            <amc-form-field label="Reminder" for="adoc-reminder" [control]="form.controls.reminderDays">
              <amc-select inputId="adoc-reminder" formControlName="reminderDays" [options]="reminderOptions" />
            </amc-form-field>
          }
          <amc-form-field label="Notes" for="adoc-notes" [control]="form.controls.notes" class="sm:col-span-2">
            <textarea id="adoc-notes" class="amc-textarea min-h-16" formControlName="notes"></textarea>
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="uploadOpen.set(false)">Cancel</button>
        <button type="submit" form="asset-doc-form" class="amc-btn-primary" [disabled]="saving()">@if (saving()) { <amc-spinner [size]="14" /> } Upload</button>
      </ng-container>
    </amc-dialog>

    <!-- Replace -->
    <amc-dialog size="md" title="Replace document" [description]="selected() ? selected()!.name + ' · currently v' + selected()!.version : ''" [(open)]="replaceOpen">
      <div class="space-y-4">
        <label for="adoc-replace" class="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 transition-colors hover:border-brand" [class]="fileError() ? 'border-danger bg-danger-subtle' : 'border-line-strong bg-surface-muted'">
          <amc-icon [name]="file() ? 'file-check' : 'file-up'" [size]="20" class="text-ink-muted" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ file()?.name ?? 'Choose replacement file' }}</span>
          <span class="amc-btn-secondary amc-btn-sm">Browse</span>
          <input id="adoc-replace" type="file" class="sr-only" (change)="onFile($event)" />
        </label>
        @if (fileError()) { <p class="text-xs text-danger" role="alert">{{ fileError() }}</p> }
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <amc-form-field label="Issue Date" for="arep-issue"><amc-date-picker inputId="arep-issue" [(value)]="replaceIssue" /></amc-form-field>
          <amc-form-field label="Expiry Date" for="arep-expiry"><amc-date-picker inputId="arep-expiry" [(value)]="replaceExpiry" /></amc-form-field>
        </div>
        <amc-form-field label="Version note" for="arep-note">
          <input id="arep-note" class="amc-input" [value]="replaceNote()" (input)="replaceNote.set($any($event.target).value)" placeholder="e.g. Recalibrated 2027" />
        </amc-form-field>
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="replaceOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="saving()" (click)="replace()">Upload new version</button>
      </ng-container>
    </amc-dialog>

    <!-- Access -->
    <amc-dialog size="sm" title="Access control" [description]="selected()?.name ?? ''" [(open)]="accessOpen">
      <amc-form-field label="Access Level" for="adoc-access-level">
        <amc-select inputId="adoc-access-level" [options]="accessOptions" [(value)]="accessLevel" />
      </amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="accessOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="saving()" (click)="saveAccess()">Save</button>
      </ng-container>
    </amc-dialog>

    <!-- Preview / history -->
    <amc-dialog size="xl" [title]="selected()?.name ?? 'Document'" [description]="selected() ? selected()!.type + ' · v' + selected()!.version : ''" [(open)]="previewOpen">
      @if (selected(); as d) {
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div class="space-y-5">
            <div class="flex aspect-[4/3] max-h-80 w-full flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface-muted text-center">
              <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-ink-muted shadow-card"><amc-icon [name]="d.type === 'Photos' ? 'eye' : 'file-text'" [size]="26" /></span>
              <div>
                <p class="text-sm font-medium text-ink">{{ d.fileName }}</p>
                <p class="text-xs text-ink-muted">{{ d.mimeType }} · {{ formatFileSize(d.fileSize) }}</p>
              </div>
              <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="download(d)"><amc-icon name="download" [size]="14" /> Download to view</button>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-ink">Document history</h3>
              <ol class="mt-3 divide-y divide-line rounded-xl border border-line">
                @for (v of versionsDesc(d); track v.version) {
                  <li class="flex items-center gap-3 px-3.5 py-2.5">
                    <span class="flex h-7 min-w-9 items-center justify-center rounded-md bg-surface-sunken px-1.5 font-mono text-xs font-semibold text-ink-muted">v{{ v.version }}</span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm text-ink">{{ v.fileName }}</p>
                      <p class="text-xs text-ink-muted">{{ v.note }} · {{ v.uploadedBy }} · {{ formatDateTime(v.uploadedAt) }}</p>
                    </div>
                    @if (v.version === d.version) { <amc-status-badge label="Current" tone="brand" [dot]="false" /> }
                  </li>
                }
              </ol>
            </div>
          </div>
          <dl class="grid h-fit grid-cols-2 gap-4 rounded-xl border border-line p-4 lg:grid-cols-1">
            <div><dt class="text-xs font-medium text-ink-muted">Status</dt><dd class="mt-1"><amc-status-badge [label]="d.status" [tone]="statusTone[d.status]" /></dd></div>
            <div><dt class="text-xs font-medium text-ink-muted">Asset</dt><dd class="mt-1 text-sm"><a class="amc-link" [routerLink]="['/app/assets', d.assetId]">{{ d.assetCode }} · {{ d.assetName }}</a></dd></div>
            <amc-detail-item label="Component" [value]="d.componentName ?? 'Whole asset'" />
            <amc-detail-item label="Document Number" [value]="d.documentNumber" [mono]="true" />
            <amc-detail-item label="Issue Date" [value]="formatDate(d.issueDate)" />
            <amc-detail-item label="Expiry Date" [value]="d.expiryDate ? formatDate(d.expiryDate) + ' (' + expiryText(d) + ')' : 'No expiry'" />
            <amc-detail-item label="Version" [value]="'v' + d.version" />
            <amc-detail-item label="Access" [value]="d.access" />
            <amc-detail-item label="Uploaded By" [value]="d.uploadedBy" />
            <amc-detail-item label="Uploaded Date" [value]="formatDateTime(d.uploadedAt)" />
            @if (d.notes) { <amc-detail-item label="Notes" [value]="d.notes" /> }
          </dl>
        </div>
      }
      <ng-container dialogFooter>
        @if (selected(); as d) {
          <button type="button" class="amc-btn-secondary" [disabled]="d.archived" (click)="previewOpen.set(false); openReplace(d)"><amc-icon name="file-up" /> Replace</button>
          <button type="button" class="amc-btn-primary" (click)="download(d)"><amc-icon name="download" /> Download</button>
        }
      </ng-container>
    </amc-dialog>
  `,
})
export class AssetDocumentManager {
  private readonly api = inject(AssetDocumentApi);
  private readonly assetsApi = inject(AssetApi);
  private readonly componentsApi = inject(ComponentApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);

  readonly assetId = input<string | null>(null);
  readonly openUploadOnInit = input(false);
  readonly changed = output<void>();

  protected readonly lookup = ASSET_LOOKUP;
  protected readonly statusTone = DOCUMENT_STATUS_TONE;
  protected readonly accessOptions = toOptions(DOCUMENT_ACCESS_LEVELS);
  protected readonly reminderOptions = [7, 14, 30, 60, 90].map((d) => ({ value: d, label: `${d} days before expiry` }));
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatFileSize = formatFileSize;
  protected readonly trackById = (d: AssetDocumentListItem) => d.id;

  protected readonly documents = rxResource({ params: () => ({ assetId: this.assetId() ?? undefined }), stream: ({ params }) => this.api.list(params) });
  protected readonly rows = computed(() => (this.documents.hasValue() ? this.documents.value() : []));
  private readonly assets = rxResource({ params: () => (this.assetId() ? undefined : true), stream: ({ params }) => (params ? this.assetsApi.list() : of([])) });
  protected readonly assetOptions = computed(() => (this.assets.hasValue() ? this.assets.value() : []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: a.customerName ?? undefined })));

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(DOCUMENT_STATUSES) },
    { key: 'type', label: 'Document Type', type: 'multiselect', options: toOptions([...new Set(this.rows().map((d) => d.type))].sort()) },
    { key: 'access', label: 'Access', type: 'multiselect', options: toOptions(DOCUMENT_ACCESS_LEVELS) },
    { key: 'expiry', label: 'Expiry Date', type: 'date-range' },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (d) =>
        (!term || `${d.name} ${d.documentNumber} ${d.fileName} ${d.assetCode} ${d.assetName}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'status', d.status) &&
        matchesAny(f, 'type', d.type) &&
        matchesAny(f, 'access', d.access) &&
        withinRange(f, 'expiry', d.expiryDate),
    );
  });
  protected readonly summary = computed(() => SUMMARY.map((s) => ({ ...s, count: this.rows().filter((d) => d.status === s.status).length, tone: TONE_CLASSES[DOCUMENT_STATUS_TONE[s.status]] })));

  protected isOnly(status: string): boolean {
    const list = filterList(this.filters(), 'status');
    return list.length === 1 && list[0] === status;
  }

  protected toggleStatus(status: string): void {
    this.filters.update((f) => ({ ...f, status: this.isOnly(status) ? undefined : [status] }));
  }

  protected readonly columns = computed<DataColumn<AssetDocumentListItem>[]>(() => [
    { key: 'name', label: 'Document Name', value: (d) => d.name, secondary: (d) => d.fileName, sortable: true, mobile: 'title', width: 260 },
    ...(this.assetId() ? [] : [{ key: 'asset', label: 'Asset', value: (d: AssetDocumentListItem) => d.assetName, secondary: (d: AssetDocumentListItem) => d.assetCode, link: (d: AssetDocumentListItem) => `/app/assets/${d.assetId}`, sortable: true, visibility: 'lg' as const, mobile: 'meta' as const, width: 200 }]),
    { key: 'type', label: 'Document Type', value: (d) => d.type, sortable: true, visibility: 'md', mobile: 'meta', width: 170 },
    { key: 'number', label: 'Document Number', value: (d) => d.documentNumber, type: 'mono', visibility: '2xl', width: 140 },
    { key: 'issue', label: 'Issue Date', value: (d) => d.issueDate, type: 'date', sortable: true, visibility: 'xl', width: 120 },
    { key: 'expiry', label: 'Expiry Date', value: (d) => d.expiryDate, type: 'date', sortable: true, visibility: 'lg', width: 120 },
    { key: 'version', label: 'Version', value: (d) => `v${d.version}`, visibility: 'xl', width: 80 },
    { key: 'access', label: 'Access', value: (d) => d.access, sortable: true, visibility: '2xl', width: 130 },
    { key: 'uploaded', label: 'Uploaded', value: (d) => d.uploadedAt, type: 'date', secondary: (d) => d.uploadedBy, sortable: true, visibility: 'xl', width: 150 },
    { key: 'status', label: 'Status', value: (d) => d.status, type: 'badge', tone: (d) => DOCUMENT_STATUS_TONE[d.status], sortable: true, mobile: 'badge', width: 130 },
  ]);

  protected readonly rowActions = (d: AssetDocumentListItem): MenuItem[] => [
    { id: 'preview', label: 'Preview', icon: 'eye' },
    { id: 'download', label: 'Download', icon: 'download' },
    { id: 'replace', label: 'Replace / New Version', icon: 'file-up', disabled: d.archived, dividerBefore: true },
    { id: 'access', label: 'Access Control', icon: 'lock', disabled: d.archived },
    { id: 'archive', label: 'Archive', icon: 'archive', danger: true, disabled: d.archived, dividerBefore: true },
  ];

  // ----- Upload -------------------------------------------------------------

  protected readonly uploadOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly file = signal<DocumentFile | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly selected = signal<AssetDocumentListItem | null>(null);

  protected readonly form = this.fb.group(
    {
      assetId: this.fb.control('', Validators.required),
      componentId: this.fb.control(''),
      name: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
      type: this.fb.control('Technical Manuals', Validators.required),
      documentNumber: this.fb.control(''),
      issueDate: this.fb.control(''),
      expiryDate: this.fb.control(''),
      reminderDays: this.fb.control(30),
      access: this.fb.control<DocumentAccess>('Internal', Validators.required),
      notes: this.fb.control(''),
    },
    { validators: expiryAfterIssue },
  );
  protected readonly formValue = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  private readonly components = rxResource({
    params: () => this.formValue().assetId || undefined,
    stream: ({ params }) => (params ? this.componentsApi.list({ assetId: params }) : of([])),
  });
  protected readonly componentOptions = computed(() => (this.components.hasValue() ? this.components.value() : []).map((c) => ({ value: c.id, label: c.name, hint: c.status })));

  constructor() {
    this.form.controls.assetId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.form.controls.componentId.setValue(''));
    effect(() => {
      if (this.openUploadOnInit() && this.assetId()) untracked(() => this.openUpload());
    });
  }

  protected openUpload(): void {
    this.file.set(null);
    this.fileError.set(null);
    this.form.reset({ assetId: this.assetId() ?? '', componentId: '', name: '', type: 'Technical Manuals', documentNumber: '', issueDate: new Date().toISOString().slice(0, 10), expiryDate: '', reminderDays: 30, access: 'Internal', notes: '' });
    this.uploadOpen.set(true);
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      this.fileError.set('Files must be 10 MB or smaller.');
      return;
    }
    this.fileError.set(null);
    this.file.set({ name: file.name, size: file.size, type: file.type });
    if (!this.form.controls.name.value) this.form.controls.name.setValue(file.name.replace(/\.[^.]+$/, ''));
  }

  protected async upload(): Promise<void> {
    this.form.markAllAsTouched();
    if (!this.file()) this.fileError.set('Choose a file to upload.');
    if (this.form.invalid || !this.file()) return;
    const v = this.form.getRawValue();
    await this.run(
      () => this.api.upload({ ...v, componentId: v.componentId || null, issueDate: v.issueDate || null, expiryDate: v.expiryDate || null, reminderDays: Number(v.reminderDays), file: this.file()! }),
      `${v.name} uploaded.`,
      () => this.uploadOpen.set(false),
    );
  }

  // ----- Replace / access ---------------------------------------------------

  protected readonly replaceOpen = signal(false);
  protected readonly replaceIssue = signal('');
  protected readonly replaceExpiry = signal('');
  protected readonly replaceNote = signal('');

  protected openReplace(d: AssetDocumentListItem): void {
    this.selected.set(d);
    this.file.set(null);
    this.fileError.set(null);
    this.replaceIssue.set(new Date().toISOString().slice(0, 10));
    this.replaceExpiry.set(d.expiryDate ?? '');
    this.replaceNote.set('');
    this.replaceOpen.set(true);
  }

  protected async replace(): Promise<void> {
    const d = this.selected();
    if (!this.file()) {
      this.fileError.set('Choose a replacement file.');
      return;
    }
    if (this.replaceIssue() && this.replaceExpiry() && this.replaceExpiry() < this.replaceIssue()) {
      this.fileError.set('Expiry date must be on or after the issue date.');
      return;
    }
    if (d) await this.run(() => this.api.replace(d.id, { file: this.file()!, note: this.replaceNote(), issueDate: this.replaceIssue() || null, expiryDate: this.replaceExpiry() || null }), `${d.name} replaced with a new version.`, () => this.replaceOpen.set(false));
  }

  protected readonly accessOpen = signal(false);
  protected readonly accessLevel = signal<string | number | null>('Internal');

  protected async saveAccess(): Promise<void> {
    const d = this.selected();
    if (d) await this.run(() => this.api.setAccess(d.id, String(this.accessLevel()) as DocumentAccess), 'Access updated.', () => this.accessOpen.set(false));
  }

  protected readonly previewOpen = signal(false);

  protected versionsDesc(d: AssetDocumentListItem) {
    return [...d.versions].reverse();
  }

  protected expiryText(d: AssetDocumentListItem): string {
    if (d.daysToExpiry === null) return '';
    if (d.daysToExpiry < 0) return `expired ${-d.daysToExpiry} days ago`;
    return d.daysToExpiry === 0 ? 'expires today' : `in ${d.daysToExpiry} days`;
  }

  protected download(d: AssetDocumentListItem): void {
    downloadFile(d.fileName, `${d.name}\n${d.type} · ${d.documentNumber}\nAsset ${d.assetCode} — ${d.assetName}\nVersion ${d.version}\n`, 'text/plain');
  }

  protected async onAction({ id, row }: RowAction<AssetDocumentListItem>): Promise<void> {
    this.selected.set(row);
    switch (id) {
      case 'preview':
        this.previewOpen.set(true);
        break;
      case 'download':
        this.download(row);
        break;
      case 'replace':
        this.openReplace(row);
        break;
      case 'access':
        this.accessLevel.set(row.access);
        this.accessOpen.set(true);
        break;
      case 'archive': {
        const ok = await this.confirm.open({ title: 'Archive document?', message: `${row.name} will be archived. It remains in the document history.`, confirmLabel: 'Archive', danger: true });
        if (ok) await this.run(() => this.api.archive(row.id), `${row.name} archived.`);
        break;
      }
    }
  }

  protected export(): void {
    downloadCsv(
      timestampedName('asset-documents', 'csv'),
      ['Document Name', 'Document Type', 'Asset ID', 'Asset', 'Component', 'Document Number', 'Issue Date', 'Expiry Date', 'Version', 'Status', 'Access', 'Uploaded By', 'Uploaded Date'],
      this.filtered().map((d) => [d.name, d.type, d.assetCode, d.assetName, d.componentName, d.documentNumber, d.issueDate, d.expiryDate, d.version, d.status, d.access, d.uploadedBy, d.uploadedAt.slice(0, 10)]),
    );
  }

  private async run(work: () => Observable<unknown>, message: string, after?: () => void): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(work());
      this.notify.success(message);
      after?.();
      this.documents.reload();
      this.changed.emit();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
