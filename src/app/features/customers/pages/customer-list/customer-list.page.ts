import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  effect,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { Avatar } from '@shared/ui/avatar';
import { type BulkAction, type DataColumn, DataTable, type RowAction, type SortState } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { type ChoiceValue, Select } from '@shared/ui/select';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { countryFlag } from '@shared/utils/country-flag';
import { firstValueFrom } from 'rxjs';

// ── Saved filter preset type ─────────────────────────────────────
interface FilterPreset {
  readonly id: string;
  readonly name: string;
  readonly search: string;
  readonly filters: FilterValues;
}

// ── Recently viewed entry ────────────────────────────────────────
export interface RecentlyViewed {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly status: string;
  readonly ts: number;
}

const RECENT_KEY = 'amc.recently-viewed';
const PRESETS_KEY = 'amc.filter-presets';
const SORT_KEY = 'amc.customers.sort';
const MAX_RECENT = 8;

export function trackRecentCustomer(entry: Omit<RecentlyViewed, 'ts'>): void {
  try {
    const existing: RecentlyViewed[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    const updated = [
      { ...entry, ts: Date.now() },
      ...existing.filter((e) => e.id !== entry.id),
    ].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}
import { ImportButton } from '../../components/import-button';
import { CustomerApi } from '../../data/customer-site.api';
import { LOOKUP } from '../../data/customer-site.lookups';
import { TRANSACTION_BLOCKED_CUSTOMER_STATUSES } from '../../data/customer-site.config';
import { CustomerLookupsStore } from '../../data/lookups.store';
import { ModuleHandoff } from '../../data/module-handoff.service';
import {
  AGREEMENT_STATES,
  CUSTOMER_STATUSES,
  type CustomerListItem,
  type CustomerStatus,
} from '../../models/customer.model';
import { CUSTOMER_STATUS_TONE } from '../../models/display';

export type ListViewMode = 'table' | 'card';

@Component({
  selector: 'amc-customer-list-page',
  imports: [Avatar, DataTable, Dialog, FilterBar, Icon, ImportButton, PageHeader, RouterLink, Select, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-list.page.html',
})
export class CustomerListPage {
  private readonly api = inject(CustomerApi);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly notify = inject(NotificationPort);
  private readonly handoff = inject(ModuleHandoff);
  protected readonly lookups = inject(CustomerLookupsStore);
  private readonly lookupValues = inject(LookupValuesStore);

  // Query parameters (bound via withComponentInputBinding) seed the initial filters.
  readonly q = input<string>();
  readonly status = input<string>();
  readonly type = input<string>();
  readonly category = input<string>();
  readonly contract = input<string>();
  readonly amc = input<string>();
  readonly manager = input<string>();

  protected readonly viewMode = signal<ListViewMode>(
    (localStorage.getItem('amc.customers.view') as ListViewMode | null) ?? 'table',
  );
  protected readonly CUSTOMER_STATUS_TONE = CUSTOMER_STATUS_TONE;
  protected readonly countryFlag = countryFlag;

  protected readonly customers = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.customers.hasValue() ? this.customers.value() : []));

  // ── #32 Sort persistence ─────────────────────────────────────
  protected readonly sortState = signal<SortState | null>(
    (() => { try { return JSON.parse(localStorage.getItem(SORT_KEY) ?? 'null') as SortState | null; } catch { return null; } })()
  );

  // ── #35 Recently viewed ──────────────────────────────────────
  protected readonly recentlyViewed = signal<RecentlyViewed[]>(
    (() => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentlyViewed[]; } catch { return []; } })()
  );
  protected readonly showRecent = signal(false);

  // ── #30 Saved filter presets ─────────────────────────────────
  protected readonly filterPresets = signal<FilterPreset[]>(
    (() => { try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]') as FilterPreset[]; } catch { return []; } })()
  );
  protected readonly presetName = signal('');
  protected readonly showPresets = signal(false);

  // ── #34 Grouping ─────────────────────────────────────────────
  protected readonly groupBy = signal<'none' | 'type' | 'region'>('none');

  protected readonly grouped = computed(() => {
    const by = this.groupBy();
    const rows = this.filtered();
    if (by === 'none') return null;
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = by === 'type' ? (r.type || 'Other') : (r.address.region || 'Other');
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  protected readonly collapsedGroups = signal<Set<string>>(new Set());
  protected toggleGroup(key: string): void {
    this.collapsedGroups.update((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // ── #33 Keyboard shortcuts ───────────────────────────────────
  protected readonly searchInputRef = signal<HTMLInputElement | null>(null);

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
    if (e.key === '/' && !inInput) {
      e.preventDefault();
      this.searchInputRef()?.focus();
    }
    if (e.key === 'n' && !inInput && !e.ctrlKey && !e.metaKey) {
      void this.router.navigate(['/app/customers/new']);
    }
    if (e.key === 'Escape' && inInput) {
      (e.target as HTMLInputElement).blur();
    }
  }

  constructor() {
    effect(() => {
      localStorage.setItem('amc.customers.view', this.viewMode());
    });
    // #32 persist sort
    effect(() => {
      const s = this.sortState();
      if (s) localStorage.setItem(SORT_KEY, JSON.stringify(s));
      else localStorage.removeItem(SORT_KEY);
    });
  }

  protected readonly search = linkedSignal(() => this.q() ?? '');
  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = {};
    const add = (key: string, value: string | undefined) => value && (seed[key] = [value]);
    add('status', this.status());
    add('type', this.type());
    add('category', this.category());
    add('contract', this.contract());
    add('amc', this.amc());
    add('manager', this.manager());
    return seed;
  });
  protected readonly selected = signal<readonly string[]>([]);

  protected readonly filterFields = computed<FilterField[]>(() => {
    const rows = this.rows();
    const unique = (values: string[]) => toOptions([...new Set(values)].sort());
    return [
      { key: 'status', label: 'Customer Status', type: 'multiselect', options: toOptions(CUSTOMER_STATUSES) },
      { key: 'type', label: 'Customer Type', type: 'multiselect', options: this.lookupValues.options(LOOKUP.customerType)() },
      { key: 'category', label: 'Customer Category', type: 'multiselect', options: this.lookupValues.options(LOOKUP.customerCategory)() },
      { key: 'country', label: 'Country', type: 'multiselect', options: unique(rows.map((r) => `${countryFlag(r.address.country)} ${r.address.country}`)) },
      { key: 'region', label: 'Region', type: 'multiselect', options: unique(rows.map((r) => r.address.region)) },
      { key: 'city', label: 'City', type: 'multiselect', options: unique(rows.map((r) => r.address.city)) },
      { key: 'manager', label: 'Account Manager', type: 'multiselect', options: this.lookups.accountManagerOptions() },
      { key: 'contract', label: 'Contract Status', type: 'multiselect', options: toOptions(AGREEMENT_STATES) },
      { key: 'amc', label: 'AMC Status', type: 'multiselect', options: toOptions(AGREEMENT_STATES) },
      { key: 'created', label: 'Created Date', type: 'date-range' },
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    const f = this.filters();
    return this.rows().filter((c) => {
      if (term) {
        const haystack = [c.code, c.name, c.legalName, c.email, c.vatNumber, c.crNumber].join(' ').toLowerCase();
        const phoneHit = digits.length >= 4 && (c.phone ?? '').replace(/\D/g, '').includes(digits);
        if (!haystack.includes(term) && !phoneHit) return false;
      }
      return (
        matchesAny(f, 'status', c.status) &&
        matchesAny(f, 'type', c.type) &&
        matchesAny(f, 'category', c.category) &&
        matchesAny(f, 'country', `${countryFlag(c.address.country)} ${c.address.country}`) &&
        matchesAny(f, 'region', c.address.region) &&
        matchesAny(f, 'city', c.address.city) &&
        matchesAny(f, 'manager', c.commercial.accountManagerId) &&
        matchesAny(f, 'contract', c.contractState) &&
        matchesAny(f, 'amc', c.amcState) &&
        withinRange(f, 'created', c.createdAt)
      );
    });
  });

  protected readonly columns: readonly DataColumn<CustomerListItem>[] = [
    { key: 'name', label: 'Customer', value: (c) => c.name, secondary: (c) => c.code, link: (c) => `/app/customers/${c.id}`, avatar: true, sortable: true, mobile: 'title', width: 280, hideable: false },
    { key: 'code', label: 'Customer Code', value: (c) => c.code, type: 'mono', sortable: true, visibility: '2xl', width: 130 },
    { key: 'type', label: 'Type', value: (c) => c.type, sortable: true, mobile: 'meta', width: 120 },
    { key: 'category', label: 'Category', value: (c) => c.category, sortable: true, visibility: 'lg', width: 130 },
    { key: 'contact', label: 'Primary Contact', value: (c) => c.primaryContactName, secondary: (c) => c.email, sortable: true, mobile: 'meta', width: 240 },
    { key: 'phone', label: 'Phone', value: (c) => c.phone, visibility: 'xl', mobile: 'meta', width: 160 },
    { key: 'email', label: 'Email', value: (c) => c.email, visibility: '2xl', width: 240 },
    { key: 'country', label: 'Country', value: (c) => `${countryFlag(c.address.country)} ${c.address.country}`, sortable: true, visibility: 'xl', width: 170 },
    { key: 'city', label: 'City', value: (c) => c.address.city, secondary: (c) => c.address.region, sortable: true, mobile: 'meta', width: 150 },
    { key: 'sites', label: 'Sites', value: (c) => c.totalSites, type: 'number', sortable: true, visibility: 'lg', width: 90 },
    { key: 'contracts', label: 'Active Contracts', value: (c) => c.activeContracts, type: 'number', sortable: true, visibility: 'lg', width: 140 },
    { key: 'assets', label: 'Active Assets', value: (c) => c.activeAssets, type: 'number', sortable: true, visibility: 'xl', width: 120 },
    { key: 'requests', label: 'Open SRs', value: (c) => c.openServiceRequests, type: 'number', sortable: true, visibility: 'xl', width: 110 },
    { key: 'status', label: 'Status', value: (c) => c.status, type: 'badge', tone: (c) => CUSTOMER_STATUS_TONE[c.status], sortable: true, mobile: 'badge', width: 120 },
    { key: 'created', label: 'Created', value: (c) => c.createdAt, type: 'date', sortable: true, visibility: '2xl', width: 130 },
  ];

  protected readonly bulkActions: MenuItem[] = [
    { id: 'activate', label: 'Activate', icon: 'check-circle' },
    { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true },
    { id: 'assign', label: 'Assign Account Manager', icon: 'user-check' },
    { id: 'export', label: 'Export', icon: 'download' },
  ];

  protected readonly rowActions = (c: CustomerListItem): MenuItem[] => {
    const blocked = TRANSACTION_BLOCKED_CUSTOMER_STATUSES.includes(c.status);
    const hint = blocked ? `Not available for ${c.status.toLowerCase()} customers` : undefined;
    return [
      { id: 'view', label: 'View', icon: 'eye' },
      { id: 'edit', label: 'Edit', icon: 'pencil' },
      { id: 'add-site', label: 'Add Site', icon: 'map-pin', dividerBefore: true, disabled: blocked, hint },
      { id: 'add-contact', label: 'Add Contact', icon: 'user-plus' },
      { id: 'create-contract', label: 'Create Contract', icon: 'file-check', disabled: blocked, hint },
      { id: 'create-request', label: 'Create Service Request', icon: 'ticket', disabled: blocked, hint },
      c.status === 'Active' || c.status === 'On Hold'
        ? { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, dividerBefore: true }
        : { id: 'activate', label: 'Activate', icon: 'check-circle', dividerBefore: true },
    ];
  };

  // Bulk: assign account manager
  protected readonly assignOpen = signal(false);
  protected readonly assignTo = signal<ChoiceValue | null>('');
  protected readonly assignIds = signal<readonly string[]>([]);
  protected readonly busy = signal(false);

  protected clearFilters(): void {
    this.search.set('');
    this.filters.set({});
  }

  // ── #30 Preset helpers ───────────────────────────────────────
  protected savePreset(): void {
    const name = this.presetName().trim();
    if (!name) return;
    const preset: FilterPreset = { id: crypto.randomUUID(), name, search: this.search(), filters: this.filters() };
    this.filterPresets.update((p) => [preset, ...p.filter((x) => x.name !== name)]);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(this.filterPresets())); } catch { /* ignore */ }
    this.presetName.set('');
    this.notify.success(`Preset "${name}" saved.`);
  }

  protected loadPreset(preset: FilterPreset): void {
    this.search.set(preset.search);
    this.filters.set(preset.filters);
    this.showPresets.set(false);
  }

  protected deletePreset(id: string): void {
    this.filterPresets.update((p) => p.filter((x) => x.id !== id));
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(this.filterPresets())); } catch { /* ignore */ }
  }

  // ── #35 Recently viewed helpers ──────────────────────────────
  protected refreshRecent(): void {
    try { this.recentlyViewed.set(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentlyViewed[]); } catch { /* ignore */ }
  }

  protected async onAction({ id, row }: RowAction<CustomerListItem>): Promise<void> {
    switch (id) {
      case 'view':
        void this.router.navigate(['/app/customers', row.id]);
        break;
      case 'edit':
        void this.router.navigate(['/app/customers', row.id, 'edit']);
        break;
      case 'add-site':
        void this.router.navigate(['/app/customers/sites/new'], { queryParams: { customerId: row.id } });
        break;
      case 'add-contact':
        void this.router.navigate(['/app/customers', row.id], { queryParams: { tab: 'contacts', action: 'add-contact' } });
        break;
      case 'create-contract':
        this.handoff.open('Create Contract', { customerName: row.name });
        break;
      case 'create-request':
        this.handoff.open('Create Service Request', { customerName: row.name });
        break;
      case 'deactivate':
        await this.changeStatus([row.id], 'Inactive');
        break;
      case 'activate':
        await this.changeStatus([row.id], 'Active');
        break;
    }
  }

  protected async onBulk({ id, rows }: BulkAction<CustomerListItem>): Promise<void> {
    const ids = rows.map((r) => r.id);
    switch (id) {
      case 'activate':
        await this.changeStatus(ids, 'Active');
        break;
      case 'deactivate':
        await this.changeStatus(ids, 'Inactive');
        break;
      case 'assign':
        this.assignIds.set(ids);
        this.assignTo.set('');
        this.assignOpen.set(true);
        break;
      case 'export':
        this.export(rows);
        break;
    }
  }

  protected async changeStatus(ids: readonly string[], status: CustomerStatus): Promise<void> {
    if (!ids.length) return;
    const label = ids.length === 1 ? (this.rows().find((r) => r.id === ids[0])?.name ?? 'this customer') : `${ids.length} customers`;
    if (status === 'Inactive') {
      const ok = await this.confirm.open({
        title: ids.length === 1 ? 'Deactivate customer?' : `Deactivate ${ids.length} customers?`,
        message: `${label} will be restricted from new contracts, sites and service requests. History is kept and the customer can be reactivated at any time.`,
        confirmLabel: 'Deactivate',
        danger: true,
      });
      if (!ok) return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.setStatus(ids, status));
      this.notify.success(`${label} ${status === 'Active' ? 'activated' : 'deactivated'}.`);
      this.selected.set([]);
      this.customers.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async assign(): Promise<void> {
    const ids = this.assignIds();
    const userId = this.assignTo();
    if (!userId || !ids.length) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.assignAccountManager(ids, String(userId)));
      this.notify.success(`Account manager assigned to ${ids.length} customer${ids.length === 1 ? '' : 's'}.`);
      this.assignOpen.set(false);
      this.selected.set([]);
      this.customers.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected export(rows: readonly CustomerListItem[] = this.filtered()): void {
    downloadCsv(
      timestampedName('customers', 'csv'),
      ['Customer Code', 'Customer Name', 'Customer Type', 'Customer Category', 'Primary Contact', 'Phone', 'Email', 'City', 'Total Sites', 'Active Contracts', 'Active Assets', 'Open Service Requests', 'Status', 'Created Date'],
      rows.map((c) => [c.code, c.name, c.type, c.category, c.primaryContactName, c.phone, c.email, c.address.city, c.totalSites, c.activeContracts, c.activeAssets, c.openServiceRequests, c.status, c.createdAt.slice(0, 10)]),
    );
    this.notify.success(`${rows.length} customer${rows.length === 1 ? '' : 's'} exported.`);
  }

  protected readonly trackById = (c: CustomerListItem) => c.id;
}
