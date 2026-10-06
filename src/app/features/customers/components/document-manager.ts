import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type BulkAction, type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { DetailItem } from '@shared/ui/detail-item';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, downloadFile, timestampedName } from '@shared/utils/file';
import { formatDate, formatDateTime, formatFileSize } from '@shared/utils/format';
import { type FilterField, type FilterValues, filterList, matchesAny, withinRange } from '@shared/utils/filters';
import { firstValueFrom, map, of, startWith } from 'rxjs';
import { ImportButton } from './import-button';
import { CustomerApi, DocumentApi, SiteApi } from '../data/customer-site.api';
import { CustomerLookupsStore } from '../data/lookups.store';
import { DOCUMENT_STATUS_TONE } from '../models/display';
import {
  DOCUMENT_ACCESS_LEVELS,
  DOCUMENT_STATUSES,
  type DocumentAccess,
  type DocumentCategory,
  type DocumentListItem,
  type DocumentStatus,
} from '../models/document.model';
import { LookupSelect } from '@shared/ui/lookup-select';
import { Select } from '@shared/ui/select';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { LOOKUP } from '../data/customer-site.lookups';
import { DOCUMENT_FIELD_HELP } from '../data/field-help';
import { DatePicker } from '@shared/ui/date-picker';

function expiryAfterIssue(group: AbstractControl): ValidationErrors | null {
  const issue = group.get('issueDate')?.value as string;
  const expiry = group.get('expiryDate')?.value as string;
  return issue && expiry && expiry < issue ? { expiryBeforeIssue: true } : null;
}

const WORKFLOW = ['Expiry date', 'Monitoring', 'Notification', 'Responsible user', 'Follow-up / renewal'] as const;

/** Document register with upload, preview, versioning, expiry tracking and renewal follow-up. */
@Component({
  selector: 'amc-document-manager',
  imports: [
    DataTable,
    DetailItem,
    Dialog,
    FilterBar,
    ImportButton,
    FormField,
    Icon,
    ReactiveFormsModule,
    RouterLink,
    Spinner,
    StatusBadge,
    Select,
    LookupSelect,
    DatePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-4' },
  template: `
    <!-- Expiry summary -->
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      @for (card of summary(); track card.status) {
        <button
          type="button"
          class="amc-card flex items-center gap-3 p-3.5 text-left transition-colors hover:border-line-strong"
          [class.ring-2]="isStatusOnly(card.status)"
          [class.ring-brand]="isStatusOnly(card.status)"
          [attr.aria-pressed]="isStatusOnly(card.status)"
          (click)="toggleStatus(card.status)"
        >
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" [class]="card.tone">
            <amc-icon [name]="card.icon" />
          </span>
          <span class="min-w-0">
            <span class="block text-xl font-semibold text-ink tabular-nums">{{ card.count }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ card.status }}</span>
          </span>
        </button>
      }
    </div>

    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar
          searchPlaceholder="Search name, number or file…"
          [(search)]="search"
          [fields]="filterFields()"
          [(filters)]="filters"
        >
          <ng-container actions>
            <amc-import-button entity="documents" (imported)="documents.reload()" />
            <button type="button" class="amc-btn-ghost hidden sm:inline-flex" [disabled]="!filtered().length" (click)="export()">
              <amc-icon name="download" />
              Export
            </button>
            <button type="button" class="amc-btn-primary" (click)="openUpload()">
              <amc-icon name="upload" />
              <span class="hidden sm:inline">Upload Document</span>
            </button>
          </ng-container>
        </amc-filter-bar>
      </div>
      <amc-data-table
        [tableId]="siteId() ? 'site-documents' : customerId() ? 'customer-documents' : 'documents'"
        [entity]="{ singular: 'document', plural: 'documents' }"
        [totalCount]="rows().length"
        [selectable]="true"
        [bulkActions]="bulkActions"
        (bulkAction)="onBulk($event)"
        [rows]="filtered()"
        [columns]="columns()"
        [trackBy]="trackById"
        [loading]="documents.isLoading()"
        [error]="documents.error() ? 'Documents could not be loaded.' : null"
        [actions]="rowActions"
        emptyIcon="file-text"
        [emptyTitle]="rows().length ? 'No documents match your filters' : 'No documents yet'"
        [emptyMessage]="rows().length ? 'Try a different search or clear the filters.' : 'Upload registration certificates, insurance, contracts and site documents.'"
        (action)="onAction($event)"
        (retry)="documents.reload()"
      />
    </section>

    <!-- Upload -->
    <amc-dialog size="lg" title="Upload document" description="Add a document with expiry tracking and access control." [(open)]="uploadOpen">
      <form [formGroup]="uploadForm" id="upload-form" novalidate (ngSubmit)="upload()">
        <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <span class="amc-label">File <span class="text-danger">*</span></span>
            <label
              for="doc-file"
              class="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 transition-colors hover:border-brand hover:bg-brand-subtle"
              [class]="fileError() ? 'border-danger bg-danger-subtle' : 'border-line-strong bg-surface-muted'"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-muted shadow-xs">
                <amc-icon [name]="file() ? 'file-check' : 'upload'" [size]="18" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-ink">{{ file()?.name ?? 'Choose a file to upload' }}</span>
                <span class="block text-xs text-ink-muted">{{ file() ? formatFileSize(file()!.size) : 'PDF, image or Office document, up to 10 MB' }}</span>
              </span>
              <span class="amc-btn-secondary amc-btn-sm">Browse</span>
              <input id="doc-file" type="file" class="sr-only" (change)="onFile($event)" />
            </label>
            @if (fileError()) {
              <p class="mt-1.5 text-xs text-danger" role="alert">{{ fileError() }}</p>
            }
          </div>
          <amc-form-field label="Document Name" for="doc-name" [control]="uploadForm.controls.name" class="sm:col-span-2">
            <input id="doc-name" class="amc-input" formControlName="name" placeholder="e.g. Commercial Registration Certificate" />
          </amc-form-field>
          <amc-form-field label="Document Type" for="doc-type" [control]="uploadForm.controls.category" [help]="help.category">
            <amc-lookup-select inputId="doc-type" formControlName="category" [type]="lookupTypes.documentCategory" />
          </amc-form-field>
          <amc-form-field label="Document Number" for="doc-number" [control]="uploadForm.controls.documentNumber">
            <input id="doc-number" class="amc-input font-mono" formControlName="documentNumber" placeholder="Certificate / policy number" />
          </amc-form-field>
          <amc-form-field label="Customer" for="doc-customer" [control]="uploadForm.controls.customerId">
            <amc-select inputId="doc-customer" formControlName="customerId" [options]="customerOptions()" placeholder="Select customer…" />
          </amc-form-field>
          <amc-form-field label="Site" for="doc-site" [control]="uploadForm.controls.siteId" hint="Optional — link to a specific site.">
            <amc-select inputId="doc-site" formControlName="siteId" [options]="siteOptions()" placeholder="Customer level" [clearable]="true" />
          </amc-form-field>
          <amc-form-field label="Issue Date" for="doc-issue" [control]="uploadForm.controls.issueDate">
            <amc-date-picker inputId="doc-issue" formControlName="issueDate" />
          </amc-form-field>
          <amc-form-field
            label="Expiry Date"
            for="doc-expiry"
            [control]="uploadForm.controls.expiryDate"
            [help]="help.expiryDate"
            [hint]="uploadForm.hasError('expiryBeforeIssue') ? '' : 'Leave empty if the document does not expire.'"
          >
            <amc-date-picker inputId="doc-expiry" formControlName="expiryDate" [attr.aria-invalid]="uploadForm.hasError('expiryBeforeIssue') && uploadForm.touched" />
            @if (uploadForm.hasError('expiryBeforeIssue') && uploadForm.touched) {
              <p class="text-xs text-danger" role="alert">Expiry date must be on or after the issue date.</p>
            }
          </amc-form-field>
          @if (uploadValue().expiryDate) {
            <amc-form-field label="Reminder" for="doc-reminder" [control]="uploadForm.controls.reminderDays" [help]="help.reminder">
              <amc-select inputId="doc-reminder" formControlName="reminderDays" [options]="reminderOptions" />
            </amc-form-field>
            <amc-form-field label="Responsible User" for="doc-owner" [control]="uploadForm.controls.responsibleUserId" [required]="true" [help]="help.responsible">
              <amc-select inputId="doc-owner" formControlName="responsibleUserId" [options]="lookups.userOptions()" placeholder="Select user…" />
            </amc-form-field>
          }
          <amc-form-field label="Access Control" for="doc-access" [control]="uploadForm.controls.access" [help]="help.access">
            <amc-select inputId="doc-access" formControlName="access" [options]="accessOptions" />
          </amc-form-field>
          <amc-form-field label="Notes" for="doc-notes" [control]="uploadForm.controls.notes" class="sm:col-span-2">
            <textarea id="doc-notes" class="amc-textarea min-h-16" formControlName="notes"></textarea>
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="uploadOpen.set(false)">Cancel</button>
        <button type="submit" form="upload-form" class="amc-btn-primary" [disabled]="saving()">
          @if (saving()) {
            <amc-spinner [size]="14" />
          }
          Upload
        </button>
      </ng-container>
    </amc-dialog>

    <!-- Replace / new version -->
    <amc-dialog size="md" title="Replace document" [description]="selected() ? selected()!.name + ' · currently v' + selected()!.version : ''" [(open)]="replaceOpen">
      <form [formGroup]="replaceForm" id="replace-form" novalidate (ngSubmit)="replace()">
        <div class="space-y-4">
          <div>
            <span class="amc-label">New file <span class="text-danger">*</span></span>
            <label for="doc-replace-file" class="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 transition-colors hover:border-brand" [class]="fileError() ? 'border-danger bg-danger-subtle' : 'border-line-strong bg-surface-muted'">
              <amc-icon [name]="file() ? 'file-check' : 'file-up'" [size]="20" class="text-ink-muted" />
              <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ file()?.name ?? 'Choose replacement file' }}</span>
              <span class="amc-btn-secondary amc-btn-sm">Browse</span>
              <input id="doc-replace-file" type="file" class="sr-only" (change)="onFile($event)" />
            </label>
            @if (fileError()) {
              <p class="mt-1.5 text-xs text-danger" role="alert">{{ fileError() }}</p>
            }
          </div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <amc-form-field label="Issue Date" for="rep-issue" [control]="replaceForm.controls.issueDate">
              <amc-date-picker inputId="rep-issue" formControlName="issueDate" />
            </amc-form-field>
            <amc-form-field label="Expiry Date" for="rep-expiry" [control]="replaceForm.controls.expiryDate">
              <amc-date-picker inputId="rep-expiry" formControlName="expiryDate" />
            </amc-form-field>
          </div>
          @if (replaceForm.hasError('expiryBeforeIssue') && replaceForm.touched) {
            <p class="text-xs text-danger" role="alert">Expiry date must be on or after the issue date.</p>
          }
          <amc-form-field label="Version note" for="rep-note" [control]="replaceForm.controls.note">
            <input id="rep-note" class="amc-input" formControlName="note" placeholder="e.g. Renewed certificate for 2027" />
          </amc-form-field>
        </div>
      </form>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="replaceOpen.set(false)">Cancel</button>
        <button type="submit" form="replace-form" class="amc-btn-primary" [disabled]="saving()">
          @if (saving()) {
            <amc-spinner [size]="14" />
          }
          Upload new version
        </button>
      </ng-container>
    </amc-dialog>

    <!-- Preview / details / history -->
    <amc-dialog size="xl" [title]="selected()?.name ?? 'Document'" [description]="selected() ? selected()!.category + ' · v' + selected()!.version : ''" [(open)]="previewOpen">
      @if (selected(); as d) {
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div class="space-y-5">
            <div class="flex aspect-[4/3] max-h-96 w-full flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface-muted text-center">
              <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-ink-muted shadow-card">
                <amc-icon name="file-text" [size]="26" />
              </span>
              <div>
                <p class="text-sm font-medium text-ink">{{ d.fileName }}</p>
                <p class="text-xs text-ink-muted">{{ d.mimeType }} · {{ formatFileSize(d.fileSize) }}</p>
              </div>
              <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="download(d)">
                <amc-icon name="download" [size]="14" />
                Download to view
              </button>
            </div>

            @if (d.expiryDate) {
              <div>
                <h3 class="text-sm font-semibold text-ink">Expiry workflow</h3>
                <ol class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
                  @for (step of workflow; track step; let i = $index) {
                    <li class="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs sm:flex-col sm:items-start" [class]="i <= workflowStep(d) ? 'border-brand/30 bg-brand-subtle text-ink' : 'border-line text-ink-muted'">
                      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold" [class]="i <= workflowStep(d) ? 'bg-brand text-brand-foreground' : 'bg-surface-sunken'">{{ i + 1 }}</span>
                      <span class="font-medium">{{ step }}</span>
                    </li>
                  }
                </ol>
                <p class="mt-2 text-xs text-ink-muted">{{ workflowNote(d) }}</p>
              </div>
            }

            <div>
              <h3 class="text-sm font-semibold text-ink">Version history</h3>
              <ol class="mt-3 divide-y divide-line rounded-xl border border-line">
                @for (v of versionsDesc(d); track v.version) {
                  <li class="flex items-center gap-3 px-3.5 py-2.5">
                    <span class="flex h-7 min-w-9 items-center justify-center rounded-md bg-surface-sunken px-1.5 font-mono text-xs font-semibold text-ink-muted">v{{ v.version }}</span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm text-ink">{{ v.fileName }}</p>
                      <p class="text-xs text-ink-muted">{{ v.note }} · {{ v.uploadedBy }} · {{ formatDateTime(v.uploadedAt) }}</p>
                    </div>
                    @if (v.version === d.version) {
                      <amc-status-badge label="Current" tone="brand" [dot]="false" />
                    }
                  </li>
                }
              </ol>
            </div>
          </div>
          <dl class="grid h-fit grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-line p-4 lg:grid-cols-1">
            <div class="col-span-2 lg:col-span-1">
              <dt class="text-xs font-medium text-ink-muted">Status</dt>
              <dd class="mt-1"><amc-status-badge [label]="d.status" [tone]="statusTone[d.status]" /></dd>
            </div>
            <amc-detail-item label="Document Type" [value]="d.category" />
            <amc-detail-item label="Document Number" [value]="d.documentNumber" [mono]="true" />
            <div>
              <dt class="text-xs font-medium text-ink-muted">Customer</dt>
              <dd class="mt-1 text-sm"><a class="amc-link" [routerLink]="['/app/customers', d.customerId]">{{ d.customerName }}</a></dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-ink-muted">Site</dt>
              <dd class="mt-1 text-sm">
                @if (d.siteId) {
                  <a class="amc-link" [routerLink]="['/app/customers/sites', d.siteId]">{{ d.siteName }}</a>
                } @else {
                  <span class="text-ink-muted">Customer level</span>
                }
              </dd>
            </div>
            <amc-detail-item label="Issue Date" [value]="formatDate(d.issueDate)" />
            <amc-detail-item label="Expiry Date" [value]="d.expiryDate ? formatDate(d.expiryDate) + ' (' + expiryText(d) + ')' : 'No expiry'" />
            <amc-detail-item label="Responsible User" [value]="d.responsibleUserName" />
            <amc-detail-item label="Access" [value]="d.access" />
            <amc-detail-item label="Uploaded By" [value]="d.uploadedBy" />
            <amc-detail-item label="Uploaded Date" [value]="formatDateTime(d.uploadedAt)" />
            @if (d.notes) {
              <amc-detail-item class="col-span-2 lg:col-span-1" label="Notes" [value]="d.notes" />
            }
          </dl>
        </div>
      }
      <ng-container dialogFooter>
        @if (selected(); as d) {
          @if (canRenew(d)) {
            <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="startRenewal(d)">
              <amc-icon name="bell" />
              Start renewal follow-up
            </button>
          }
          <button type="button" class="amc-btn-secondary" [disabled]="d.recordStatus === 'Archived'" (click)="previewOpen.set(false); openReplace(d)">
            <amc-icon name="file-up" />
            Replace
          </button>
          <button type="button" class="amc-btn-primary" (click)="download(d)">
            <amc-icon name="download" />
            Download
          </button>
        }
      </ng-container>
    </amc-dialog>
  `,
})
export class DocumentManager {
  private readonly api = inject(DocumentApi);
  private readonly customersApi = inject(CustomerApi);
  private readonly sitesApi = inject(SiteApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);
  protected readonly lookups = inject(CustomerLookupsStore);

  readonly customerId = input<string | null>(null);
  readonly siteId = input<string | null>(null);
  /** Opens the upload dialog once on load (used by "Upload Document" deep links). */
  readonly openUploadOnInit = input(false);

  protected readonly documents = rxResource({
    params: () => ({ customerId: this.customerId() ?? undefined, siteId: this.siteId() ?? undefined }),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly rows = computed(() => (this.documents.hasValue() ? this.documents.value() : []));

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});

  protected readonly lookupTypes = LOOKUP;
  protected readonly help = DOCUMENT_FIELD_HELP;
  private readonly lookupValues = inject(LookupValuesStore);
  protected readonly categoryOptions = this.lookupValues.options(LOOKUP.documentCategory);
  protected readonly statusOptions = toOptions(DOCUMENT_STATUSES);
  protected readonly accessOptions = toOptions(DOCUMENT_ACCESS_LEVELS);
  protected readonly reminderOptions = [7, 14, 30, 60, 90].map((d) => ({ value: d, label: `${d} days before` }));
  protected readonly workflow = WORKFLOW;
  protected readonly statusTone = DOCUMENT_STATUS_TONE;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatFileSize = formatFileSize;
  protected readonly trackById = (d: DocumentListItem) => d.id;

  protected readonly filterFields = computed<FilterField[]>(() => {
    const rows = this.rows();
    const customerIds = filterList(this.filters(), 'customer');
    const customers = new Map(rows.map((r) => [r.customerId, r.customerName]));
    const sites = new Map(
      rows
        .filter((r) => r.siteId && (customerIds.length === 0 || customerIds.includes(r.customerId)))
        .map((r) => [r.siteId!, r.siteName ?? r.siteId!]),
    );
    const users = new Map(rows.filter((r) => r.responsibleUserId).map((r) => [r.responsibleUserId!, r.responsibleUserName ?? '']));
    return [
      ...(this.customerId() || this.siteId()
        ? []
        : [{ key: 'customer', label: 'Customer', type: 'multiselect' as const, options: [...customers].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)) }]),
      ...(this.siteId()
        ? []
        : [{ key: 'site', label: 'Site', type: 'multiselect' as const, options: [{ value: '__none', label: 'Customer level (no site)' }, ...[...sites].map(([value, label]) => ({ value, label }))] }]),
      { key: 'category', label: 'Document Type', type: 'multiselect', options: this.categoryOptions() },
      { key: 'status', label: 'Status', type: 'multiselect', options: this.statusOptions },
      { key: 'access', label: 'Access Control', type: 'multiselect', options: this.accessOptions },
      { key: 'responsible', label: 'Responsible User', type: 'multiselect', options: [...users].map(([value, label]) => ({ value, label })) },
      { key: 'expiry', label: 'Expiry Date', type: 'date-range' },
      { key: 'uploaded', label: 'Uploaded Date', type: 'date-range' },
    ];
  });

  protected readonly bulkActions: MenuItem[] = [
    { id: 'export', label: 'Export', icon: 'download' },
    { id: 'archive', label: 'Archive', icon: 'archive', danger: true },
  ];

  protected readonly summary = computed(() => {
    const count = (status: DocumentStatus) => this.rows().filter((r) => r.status === status).length;
    return [
      { status: 'Valid' as const, count: count('Valid'), icon: 'check-circle' as const, tone: 'bg-ok-subtle text-ok' },
      { status: 'Expiring Soon' as const, count: count('Expiring Soon'), icon: 'clock' as const, tone: 'bg-warn-subtle text-warn' },
      { status: 'Expired' as const, count: count('Expired'), icon: 'alert-triangle' as const, tone: 'bg-danger-subtle text-danger' },
      { status: 'Renewal In Progress' as const, count: count('Renewal In Progress'), icon: 'refresh' as const, tone: 'bg-info-subtle text-info' },
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.rows().filter(
      (d) =>
        (!term || `${d.name} ${d.documentNumber} ${d.fileName} ${d.customerName}`.toLowerCase().includes(term)) &&
        matchesAny(f, 'customer', d.customerId) &&
        matchesAny(f, 'site', d.siteId ?? '__none') &&
        matchesAny(f, 'category', d.category) &&
        matchesAny(f, 'status', d.status) &&
        matchesAny(f, 'access', d.access) &&
        matchesAny(f, 'responsible', d.responsibleUserId) &&
        withinRange(f, 'expiry', d.expiryDate) &&
        withinRange(f, 'uploaded', d.uploadedAt),
    );
  });

  protected readonly columns = computed<readonly DataColumn<DocumentListItem>[]>(() => [
    { key: 'name', label: 'Document Name', value: (d) => d.name, secondary: (d) => `${d.fileName} · ${formatFileSize(d.fileSize)}`, sortable: true, mobile: 'title' },
    { key: 'type', label: 'Document Type', value: (d) => d.category, sortable: true, visibility: 'lg', mobile: 'meta' },
    ...(this.customerId() || this.siteId()
      ? []
      : [{ key: 'customer', label: 'Customer', value: (d: DocumentListItem) => d.customerName, link: (d: DocumentListItem) => `/app/customers/${d.customerId}`, sortable: true, visibility: 'xl' as const }]),
    ...(this.siteId()
      ? []
      : [{ key: 'site', label: 'Site', value: (d: DocumentListItem) => d.siteName ?? 'Customer level', sortable: true, visibility: '2xl' as const }]),
    { key: 'number', label: 'Document Number', value: (d) => d.documentNumber, type: 'mono', visibility: '2xl' },
    { key: 'issue', label: 'Issue Date', value: (d) => d.issueDate, type: 'date', sortable: true, visibility: '2xl' },
    { key: 'expiry', label: 'Expiry Date', value: (d) => d.expiryDate, type: 'date', secondary: (d) => (d.expiryDate ? this.expiryText(d) : null), sortable: true, visibility: 'md', mobile: 'meta' },
    { key: 'version', label: 'Version', value: (d) => `v${d.version}`, type: 'mono', sortable: true, visibility: 'lg', align: 'center' },
    { key: 'status', label: 'Status', value: (d) => d.status, type: 'badge', tone: (d) => DOCUMENT_STATUS_TONE[d.status], sortable: true, mobile: 'badge' },
    { key: 'uploaded', label: 'Uploaded', value: (d) => d.uploadedAt, type: 'date', secondary: (d) => d.uploadedBy, sortable: true, visibility: 'xl', mobile: 'meta' },
  ]);

  protected readonly rowActions = (d: DocumentListItem): MenuItem[] => [
    { id: 'preview', label: 'Preview & history', icon: 'eye' },
    { id: 'download', label: 'Download', icon: 'download' },
    { id: 'replace', label: 'Replace (new version)', icon: 'file-up', disabled: d.recordStatus === 'Archived' },
    { id: 'renew', label: 'Start renewal follow-up', icon: 'bell', disabled: !this.canRenew(d), hint: this.canRenew(d) ? undefined : 'Available for expiring or expired documents' },
    { id: 'archive', label: 'Archive', icon: 'archive', danger: true, dividerBefore: true, disabled: d.recordStatus === 'Archived' },
  ];

  // Dialog state
  protected readonly uploadOpen = signal(false);
  protected readonly replaceOpen = signal(false);
  protected readonly previewOpen = signal(false);
  protected readonly selected = signal<DocumentListItem | null>(null);
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly uploadForm = this.fb.group(
    {
      name: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
      category: this.fb.control<DocumentCategory>('Legal Documents', Validators.required),
      customerId: this.fb.control('', Validators.required),
      siteId: this.fb.control(''),
      documentNumber: this.fb.control(''),
      issueDate: this.fb.control(''),
      expiryDate: this.fb.control(''),
      reminderDays: this.fb.control(30),
      responsibleUserId: this.fb.control(''),
      access: this.fb.control<DocumentAccess>('Internal', Validators.required),
      notes: this.fb.control(''),
    },
    { validators: expiryAfterIssue },
  );
  protected readonly uploadValue = toSignal(
    this.uploadForm.valueChanges.pipe(startWith(null), map(() => this.uploadForm.getRawValue())),
    { initialValue: this.uploadForm.getRawValue() },
  );

  protected readonly replaceForm = this.fb.group(
    { issueDate: this.fb.control(''), expiryDate: this.fb.control(''), note: this.fb.control('') },
    { validators: expiryAfterIssue },
  );

  private readonly customerList = rxResource({
    params: () => (this.uploadOpen() ? true : undefined),
    stream: () => this.customersApi.list(),
  });
  private readonly siteList = rxResource({
    params: () => (this.uploadOpen() ? this.uploadValue().customerId || undefined : undefined),
    stream: ({ params }) => (params ? this.sitesApi.list({ customerId: params }) : of([])),
  });
  protected readonly customerOptions = computed(() =>
    (this.customerList.hasValue() ? (this.customerList.value() ?? []) : [])
      .filter((c) => c.status !== 'Archived')
      .map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
  );
  protected readonly siteOptions = computed(() =>
    (this.siteList.hasValue() ? (this.siteList.value() ?? []) : []).map((s) => ({ value: s.id, label: s.name })),
  );

  constructor() {
    effect(() => {
      if (this.openUploadOnInit()) untracked(() => this.openUpload());
    });
    // Responsible user is mandatory once an expiry date is tracked.
    effect(() => {
      const hasExpiry = !!this.uploadValue().expiryDate;
      untracked(() => {
        const control = this.uploadForm.controls.responsibleUserId;
        control.setValidators(hasExpiry ? Validators.required : null);
        control.updateValueAndValidity({ emitEvent: false });
      });
    });
  }

  protected isStatusOnly(status: DocumentStatus): boolean {
    const selected = filterList(this.filters(), 'status');
    return selected.length === 1 && selected[0] === status;
  }

  protected toggleStatus(status: DocumentStatus): void {
    this.filters.update((f) => ({ ...f, status: this.isStatusOnly(status) ? [] : [status] }));
  }

  protected async onBulk({ id, rows }: BulkAction<DocumentListItem>): Promise<void> {
    if (id === 'export') {
      this.export(rows);
      return;
    }
    const active = rows.filter((d) => d.recordStatus !== 'Archived');
    if (!active.length) return;
    const ok = await this.confirm.open({
      title: `Archive ${active.length} document${active.length === 1 ? '' : 's'}?`,
      message: 'Archived documents are excluded from expiry monitoring. Version history is retained.',
      confirmLabel: 'Archive',
      danger: true,
    });
    if (!ok) return;
    try {
      for (const doc of active) await firstValueFrom(this.api.archive(doc.id));
      this.notify.success(`${active.length} document${active.length === 1 ? '' : 's'} archived.`);
      this.documents.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  protected openUpload(): void {
    this.file.set(null);
    this.fileError.set(null);
    this.uploadForm.reset({
      name: '',
      category: this.siteId() ? 'Site Documents' : 'Legal Documents',
      customerId: this.customerId() ?? '',
      siteId: this.siteId() ?? '',
      documentNumber: '',
      issueDate: '',
      expiryDate: '',
      reminderDays: 30,
      responsibleUserId: '',
      access: 'Internal',
      notes: '',
    });
    if (this.customerId()) this.uploadForm.controls.customerId.disable();
    else this.uploadForm.controls.customerId.enable();
    if (this.siteId()) this.uploadForm.controls.siteId.disable();
    else this.uploadForm.controls.siteId.enable();
    this.uploadOpen.set(true);
  }

  protected openReplace(doc: DocumentListItem): void {
    this.selected.set(doc);
    this.file.set(null);
    this.fileError.set(null);
    this.replaceForm.reset({ issueDate: doc.issueDate ?? '', expiryDate: doc.expiryDate ?? '', note: '' });
    this.replaceOpen.set(true);
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file && file.size > 10 * 1024 * 1024) {
      this.fileError.set('File is larger than 10 MB.');
      return;
    }
    this.fileError.set(null);
    this.file.set(file);
    if (file && this.uploadOpen() && !this.uploadForm.controls.name.value) {
      this.uploadForm.controls.name.setValue(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    }
  }

  protected async upload(): Promise<void> {
    this.uploadForm.markAllAsTouched();
    const file = this.file();
    if (!file) this.fileError.set('Select a file to upload.');
    if (this.uploadForm.invalid || !file || this.saving()) return;
    const v = this.uploadForm.getRawValue();
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.upload({
          ...v,
          siteId: v.siteId || null,
          issueDate: v.issueDate || null,
          expiryDate: v.expiryDate || null,
          responsibleUserId: v.responsibleUserId || null,
          file: { name: file.name, size: file.size, type: file.type },
        }),
      );
      this.notify.success(`${v.name} uploaded.`, 'Document uploaded');
      this.uploadOpen.set(false);
      this.documents.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async replace(): Promise<void> {
    this.replaceForm.markAllAsTouched();
    const file = this.file();
    const doc = this.selected();
    if (!file) this.fileError.set('Select the replacement file.');
    if (this.replaceForm.invalid || !file || !doc || this.saving()) return;
    const v = this.replaceForm.getRawValue();
    this.saving.set(true);
    try {
      const next = await firstValueFrom(
        this.api.replace(doc.id, { file: { name: file.name, size: file.size, type: file.type }, note: v.note, issueDate: v.issueDate || null, expiryDate: v.expiryDate || null }),
      );
      this.notify.success(`${doc.name} updated to version ${next.version}.`, 'New version uploaded');
      this.replaceOpen.set(false);
      this.documents.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async onAction({ id, row }: RowAction<DocumentListItem>): Promise<void> {
    switch (id) {
      case 'preview':
        this.selected.set(row);
        this.previewOpen.set(true);
        break;
      case 'download':
        this.download(row);
        break;
      case 'replace':
        this.openReplace(row);
        break;
      case 'renew':
        await this.startRenewal(row);
        break;
      case 'archive': {
        const ok = await this.confirm.open({
          title: 'Archive document?',
          message: `${row.name} will be archived and excluded from expiry monitoring. Its version history is retained.`,
          confirmLabel: 'Archive',
          danger: true,
        });
        if (!ok) return;
        try {
          await firstValueFrom(this.api.archive(row.id));
          this.notify.success(`${row.name} archived.`);
          this.documents.reload();
        } catch (error) {
          this.notify.error((error as Error).message);
        }
        break;
      }
    }
  }

  protected async startRenewal(doc: DocumentListItem): Promise<void> {
    try {
      await firstValueFrom(this.api.startRenewal(doc.id));
      this.notify.success(`${doc.responsibleUserName ?? 'The responsible user'} has been assigned to follow up on renewal.`, 'Renewal started');
      this.previewOpen.set(false);
      this.documents.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  protected download(doc: DocumentListItem): void {
    const content = [
      `Document: ${doc.name}`,
      `Type: ${doc.category}`,
      `Number: ${doc.documentNumber}`,
      `Customer: ${doc.customerName}`,
      `Version: ${doc.version}`,
      '',
      'Demo environment — original file content is stored by the document service.',
    ].join('\n');
    downloadFile(doc.fileName.replace(/\.[^.]+$/, '') + '.txt', content, 'text/plain');
  }

  protected canRenew(doc: DocumentListItem): boolean {
    return (doc.status === 'Expired' || doc.status === 'Expiring Soon') && doc.renewalStatus === 'None';
  }

  protected expiryText(doc: DocumentListItem): string {
    const days = doc.daysToExpiry;
    if (days === null) return '';
    if (days === 0) return 'expires today';
    return days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${-days} day${days === -1 ? '' : 's'} ago`;
  }

  protected versionsDesc(doc: DocumentListItem) {
    return [...doc.versions].sort((a, b) => b.version - a.version);
  }

  protected workflowStep(doc: DocumentListItem): number {
    if (doc.renewalStatus !== 'None') return 4;
    switch (doc.status) {
      case 'Expired':
        return 3;
      case 'Expiring Soon':
        return 2;
      default:
        return 1;
    }
  }

  protected workflowNote(doc: DocumentListItem): string {
    const owner = doc.responsibleUserName ?? 'the responsible user';
    if (doc.renewalStatus === 'In Progress') return `Renewal follow-up in progress with ${owner}.`;
    if (doc.renewalStatus === 'Renewed') return 'Document renewed; monitoring the new expiry date.';
    if (doc.status === 'Expired') return `Expired — ${owner} has been notified. Start the renewal follow-up.`;
    if (doc.status === 'Expiring Soon') return `Within the ${doc.reminderDays}-day reminder window — notification sent to ${owner}.`;
    return `Monitoring — ${owner} will be notified ${doc.reminderDays} days before expiry.`;
  }

  protected export(rows: readonly DocumentListItem[] = this.filtered()): void {
    downloadCsv(
      timestampedName('documents', 'csv'),
      ['Document Name', 'Document Type', 'Customer', 'Site', 'Document Number', 'Issue Date', 'Expiry Date', 'Version', 'Status', 'Access', 'Responsible User', 'Uploaded By', 'Uploaded Date'],
      rows.map((d) => [d.name, d.category, d.customerName, d.siteName ?? '', d.documentNumber, d.issueDate, d.expiryDate, d.version, d.status, d.access, d.responsibleUserName, d.uploadedBy, d.uploadedAt.slice(0, 10)]),
    );
  }
}
