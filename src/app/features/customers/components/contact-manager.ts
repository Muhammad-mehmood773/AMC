import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { Avatar } from '@shared/ui/avatar';
import { type BulkAction, type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { DetailItem } from '@shared/ui/detail-item';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { formatDateTime } from '@shared/utils/format';
import { type FilterField, type FilterValues, filterList, matchesAny } from '@shared/utils/filters';
import { firstValueFrom } from 'rxjs';
import { ContactApi } from '../data/customer-site.api';
import { LOOKUP } from '../data/customer-site.lookups';
import {
  CONTACT_STATUSES,
  type ContactListItem,
} from '../models/contact.model';
import { CONTACT_STATUS_TONE } from '../models/display';
import { ContactFormDialog } from './contact-form-dialog';
import { ImportButton } from './import-button';

/**
 * Contact list with search, filters and the full contact lifecycle (add, edit, view,
 * set primary, deactivate). Scoped to a customer and/or site when those inputs are set.
 */
@Component({
  selector: 'amc-contact-manager',
  imports: [
    Avatar,
    ContactFormDialog,
    DataTable,
    DetailItem,
    Dialog,
    FilterBar,
    Icon,
    ImportButton,
    RouterLink,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="amc-card overflow-hidden">
      <div class="border-b border-line p-3 sm:p-4">
        <amc-filter-bar
          searchPlaceholder="Search name, email or phone…"
          [(search)]="search"
          [fields]="filterFields()"
          [(filters)]="filters"
        >
          <ng-container actions>
            <amc-import-button entity="contacts" (imported)="contacts.reload(); changed.emit()" />
            <button type="button" class="amc-btn-ghost hidden sm:inline-flex" [disabled]="!filtered().length" (click)="export()">
              <amc-icon name="download" />
              Export
            </button>
            <button type="button" class="amc-btn-primary" [disabled]="addDisabled()" [attr.title]="addDisabled() ? 'Contacts cannot be added to inactive customers' : null" (click)="add()">
              <amc-icon name="user-plus" />
              <span class="hidden sm:inline">Add Contact</span>
            </button>
          </ng-container>
        </amc-filter-bar>
      </div>
      <amc-data-table
        [tableId]="siteId() ? 'site-contacts' : customerId() ? 'customer-contacts' : 'contacts'"
        [entity]="{ singular: 'contact', plural: 'contacts' }"
        [totalCount]="rows().length"
        [selectable]="true"
        [bulkActions]="bulkActions"
        (bulkAction)="onBulk($event)"
        [rows]="filtered()"
        [columns]="columns()"
        [trackBy]="trackById"
        [loading]="contacts.isLoading()"
        [error]="contacts.error() ? 'Contacts could not be loaded.' : null"
        [actions]="rowActions"
        emptyIcon="book-user"
        [emptyTitle]="rows().length ? 'No contacts match your filters' : 'No contacts yet'"
        [emptyMessage]="rows().length ? 'Try a different search or clear the filters.' : 'Add procurement, technical, billing and site contacts to reach the right person.'"
        (action)="onAction($event)"
        (retry)="contacts.reload()"
      />
    </section>

    <amc-contact-form-dialog
      [(open)]="formOpen"
      [contact]="editing()"
      [customerId]="customerId()"
      [siteId]="siteId()"
      (saved)="contacts.reload(); changed.emit()"
    />

    <amc-dialog variant="drawer" title="Contact details" [(open)]="viewOpen">
      @if (viewing(); as c) {
        <div class="space-y-6">
          <div class="flex items-center gap-4">
            <amc-avatar [name]="c.fullName" size="lg" />
            <div class="min-w-0">
              <p class="text-lg font-semibold tracking-tight text-ink">{{ c.fullName }}</p>
              <p class="text-sm text-ink-muted">{{ c.designation || '—' }}{{ c.department ? ' · ' + c.department : '' }}</p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <amc-status-badge [label]="c.type" tone="brand" [dot]="false" />
                @if (c.isPrimary) {
                  <amc-status-badge label="Primary" tone="accent" [dot]="false" />
                }
                <amc-status-badge [label]="c.status" [tone]="statusTone[c.status]" />
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
            @if (c.email) {
              <a [href]="'mailto:' + c.email" class="amc-btn-secondary amc-btn-sm"><amc-icon name="mail" [size]="14" /> Email</a>
            }
            @if (c.mobile) {
              <a [href]="'tel:' + c.mobile" class="amc-btn-secondary amc-btn-sm"><amc-icon name="phone" [size]="14" /> Call mobile</a>
            }
            @if (c.phone) {
              <a [href]="'tel:' + c.phone" class="amc-btn-secondary amc-btn-sm"><amc-icon name="phone" [size]="14" /> Call office</a>
            }
          </div>
          <dl class="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <amc-detail-item label="Email" [value]="c.email" />
            <amc-detail-item label="Mobile" [value]="c.mobile" />
            <amc-detail-item label="Phone" [value]="c.phone" />
            <amc-detail-item label="Preferred Language" [value]="c.preferredLanguage" />
            <amc-detail-item label="Preferred Communication" [value]="c.preferredCommunication" />
            <amc-detail-item label="Contact Type" [value]="c.type" />
            <div>
              <dt class="text-xs font-medium text-ink-muted">Customer</dt>
              <dd class="mt-1 text-sm"><a class="amc-link" [routerLink]="['/app/customers', c.customerId]">{{ c.customerName }}</a></dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-ink-muted">Site</dt>
              <dd class="mt-1 text-sm">
                @if (c.siteId) {
                  <a class="amc-link" [routerLink]="['/app/customers/sites', c.siteId]">{{ c.siteName }}</a>
                } @else {
                  <span class="text-ink-muted">Customer level</span>
                }
              </dd>
            </div>
            <amc-detail-item class="sm:col-span-2" label="Notes" [value]="c.notes" />
            <amc-detail-item label="Created" [value]="formatDateTime(c.createdAt) + ' · ' + c.createdBy" />
            <amc-detail-item label="Last updated" [value]="c.updatedAt ? formatDateTime(c.updatedAt) + ' · ' + c.updatedBy : null" />
          </dl>
        </div>
      }
      <ng-container dialogFooter>
        @if (viewing(); as c) {
          @if (!c.isPrimary && c.status === 'Active') {
            <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="setPrimary(c)">
              <amc-icon name="star" />
              Set as Primary
            </button>
          }
          <button type="button" class="amc-btn-primary" (click)="viewOpen.set(false); edit(c)">
            <amc-icon name="pencil" />
            Edit
          </button>
        }
      </ng-container>
    </amc-dialog>
  `,
})
export class ContactManager {
  private readonly api = inject(ContactApi);
  private readonly notify = inject(NotificationPort);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly lookupValues = inject(LookupValuesStore);

  readonly customerId = input<string | null>(null);
  readonly siteId = input<string | null>(null);
  /** Disables adding contacts (e.g. inactive customer). */
  readonly addDisabled = input(false);
  /** Opens the add dialog once on load (used by "Add Contact" deep links). */
  readonly openAddOnInit = input(false);
  readonly changed = output<void>();

  protected readonly contacts = rxResource({
    params: () => ({ customerId: this.customerId() ?? undefined, siteId: this.siteId() ?? undefined }),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly rows = computed(() => (this.contacts.hasValue() ? this.contacts.value() : []));

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});

  protected readonly filterFields = computed<FilterField[]>(() => {
    const rows = this.rows();
    const customerIds = filterList(this.filters(), 'customer');
    const customers = new Map(rows.map((r) => [r.customerId, r.customerName]));
    const sites = new Map(
      rows
        .filter((r) => r.siteId && (customerIds.length === 0 || customerIds.includes(r.customerId)))
        .map((r) => [r.siteId!, r.siteName ?? r.siteId!]),
    );
    return [
      ...(this.customerId()
        ? []
        : [{ key: 'customer', label: 'Customer', type: 'multiselect' as const, options: [...customers].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)) }]),
      ...(this.siteId()
        ? []
        : [{ key: 'site', label: 'Site', type: 'multiselect' as const, options: [{ value: '__none', label: 'Customer level (no site)' }, ...[...sites].map(([value, label]) => ({ value, label }))] }]),
      { key: 'type', label: 'Contact Type', type: 'multiselect', options: this.lookupValues.options(LOOKUP.contactType)() },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(CONTACT_STATUSES) },
      { key: 'primary', label: 'Primary Contact', type: 'select', options: [{ value: 'yes', label: 'Primary only' }, { value: 'no', label: 'Non-primary only' }] },
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    const f = this.filters();
    const primary = filterList(f, 'primary')[0];
    return this.rows().filter((c) => {
      if (term) {
        const text = `${c.fullName} ${c.email} ${c.designation}`.toLowerCase();
        const phone = digits.length >= 3 && `${c.mobile}${c.phone}`.replace(/\D/g, '').includes(digits);
        if (!text.includes(term) && !phone) return false;
      }
      return (
        matchesAny(f, 'customer', c.customerId) &&
        matchesAny(f, 'site', c.siteId ?? '__none') &&
        matchesAny(f, 'type', c.type) &&
        matchesAny(f, 'status', c.status) &&
        (!primary || c.isPrimary === (primary === 'yes'))
      );
    });
  });

  protected readonly bulkActions: MenuItem[] = [
    { id: 'activate', label: 'Activate', icon: 'check-circle' },
    { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true },
    { id: 'export', label: 'Export', icon: 'download' },
  ];

  protected readonly columns = computed<readonly DataColumn<ContactListItem>[]>(() => [
    { key: 'name', label: 'Contact Name', value: (c) => c.fullName, secondary: (c) => c.designation, avatar: true, sortable: true, mobile: 'title' },
    { key: 'department', label: 'Department', value: (c) => c.department, sortable: true, visibility: '2xl' },
    { key: 'email', label: 'Email', value: (c) => c.email, sortable: true, visibility: 'lg', mobile: 'meta' },
    { key: 'mobile', label: 'Mobile', value: (c) => c.mobile, visibility: 'xl', mobile: 'meta' },
    { key: 'phone', label: 'Phone', value: (c) => c.phone, visibility: '2xl' },
    { key: 'type', label: 'Contact Type', value: (c) => c.type, sortable: true, visibility: 'md', mobile: 'meta' },
    { key: 'primary', label: 'Primary', value: (c) => (c.isPrimary ? 'Primary' : null), type: 'badge', tone: () => 'accent', sortable: true, visibility: 'md' },
    ...(this.siteId()
      ? []
      : [{ key: 'site', label: 'Site', value: (c: ContactListItem) => c.siteName ?? 'Customer level', link: (c: ContactListItem) => (c.siteId ? `/app/customers/sites/${c.siteId}` : null), sortable: true, visibility: 'lg' as const, mobile: 'meta' as const }]),
    ...(this.customerId()
      ? []
      : [{ key: 'customer', label: 'Customer', value: (c: ContactListItem) => c.customerName, link: (c: ContactListItem) => `/app/customers/${c.customerId}`, sortable: true, visibility: 'xl' as const }]),
    { key: 'status', label: 'Status', value: (c) => c.status, type: 'badge', tone: (c) => CONTACT_STATUS_TONE[c.status], sortable: true, mobile: 'badge' },
  ]);

  protected readonly rowActions = (c: ContactListItem): MenuItem[] => [
    { id: 'view', label: 'View', icon: 'eye' },
    { id: 'edit', label: 'Edit', icon: 'pencil' },
    {
      id: 'primary',
      label: 'Set as Primary',
      icon: 'star',
      disabled: c.isPrimary || c.status !== 'Active',
      hint: c.isPrimary ? 'Already the primary contact for this type' : c.status !== 'Active' ? 'Only active contacts can be primary' : undefined,
    },
    c.status === 'Active'
      ? { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, dividerBefore: true }
      : { id: 'activate', label: 'Activate', icon: 'check-circle', dividerBefore: true },
  ];

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ContactListItem | null>(null);
  protected readonly viewOpen = signal(false);
  protected readonly viewing = signal<ContactListItem | null>(null);
  protected readonly statusTone = CONTACT_STATUS_TONE;
  protected readonly formatDateTime = formatDateTime;
  protected readonly trackById = (c: ContactListItem) => c.id;

  constructor() {
    effect(() => {
      if (this.openAddOnInit() && !this.addDisabled()) {
        untracked(() => this.add());
      }
    });
  }

  protected async onBulk({ id, rows }: BulkAction<ContactListItem>): Promise<void> {
    if (id === 'export') {
      this.export(rows);
      return;
    }
    const status = id === 'activate' ? 'Active' : 'Inactive';
    if (status === 'Inactive') {
      const ok = await this.confirm.open({
        title: `Deactivate ${rows.length} contact${rows.length === 1 ? '' : 's'}?`,
        message: 'Deactivated contacts no longer receive notifications and lose any primary designation.',
        confirmLabel: 'Deactivate',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      for (const contact of rows) await firstValueFrom(this.api.setStatus(contact.id, status));
      this.notify.success(`${rows.length} contact${rows.length === 1 ? '' : 's'} ${status === 'Active' ? 'activated' : 'deactivated'}.`);
      this.contacts.reload();
      this.changed.emit();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  protected add(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected edit(contact: ContactListItem): void {
    this.editing.set(contact);
    this.formOpen.set(true);
  }

  protected async onAction({ id, row }: RowAction<ContactListItem>): Promise<void> {
    switch (id) {
      case 'view':
        this.viewing.set(row);
        this.viewOpen.set(true);
        break;
      case 'edit':
        this.edit(row);
        break;
      case 'primary':
        await this.setPrimary(row);
        break;
      case 'deactivate': {
        const ok = await this.confirm.open({
          title: 'Deactivate contact?',
          message: `${row.fullName} will no longer receive notifications or be selectable for new records.${row.isPrimary ? ' Their primary designation will be removed.' : ''}`,
          confirmLabel: 'Deactivate',
          danger: true,
        });
        if (ok) await this.run(this.api.setStatus(row.id, 'Inactive'), `${row.fullName} deactivated.`);
        break;
      }
      case 'activate':
        await this.run(this.api.setStatus(row.id, 'Active'), `${row.fullName} activated.`);
        break;
    }
  }

  protected async setPrimary(contact: ContactListItem): Promise<void> {
    await this.run(
      this.api.setPrimary(contact.id),
      `${contact.fullName} is now the primary ${contact.type.toLowerCase()} contact.`,
    );
    this.viewOpen.set(false);
  }

  protected export(rows: readonly ContactListItem[] = this.filtered()): void {
    downloadCsv(
      timestampedName('contacts', 'csv'),
      ['Contact Name', 'Designation', 'Department', 'Email', 'Mobile', 'Phone', 'Contact Type', 'Primary Contact', 'Customer', 'Site', 'Status'],
      rows.map((c) => [c.fullName, c.designation, c.department, c.email, c.mobile, c.phone, c.type, c.isPrimary ? 'Yes' : 'No', c.customerName, c.siteName ?? '', c.status]),
    );
  }

  private async run(request: ReturnType<ContactApi['setStatus']>, message: string): Promise<void> {
    try {
      await firstValueFrom(request);
      this.notify.success(message);
      this.contacts.reload();
      this.changed.emit();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }
}
