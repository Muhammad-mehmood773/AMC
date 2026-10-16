import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type BulkAction, DataTable, type RowAction, type SortState } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { type ChoiceOption, type ChoiceValue, Select } from '@shared/ui/select';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadCsv, timestampedName } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny, withinRange } from '@shared/utils/filters';
import { formatDate } from '@shared/utils/format';
import { firstValueFrom } from 'rxjs';
import { assetListColumns } from '../../components/asset-columns';
import { matchesFlag } from '../../data/asset-flags';
import { AssetHandoff } from '../../data/asset-handoff.service';
import { AssetReferenceStore } from '../../data/asset-reference.store';
import { AssetApi } from '../../data/asset.api';
import { STATUS_TRANSITIONS, TRANSACTION_BLOCKED_STATUSES } from '../../data/asset.config';
import { ASSET_LOOKUP } from '../../data/asset.lookups';
import { ASSET_STATUSES, END_OF_LIFE_STATUSES, INACTIVE_STATUSES, type AssetBulkUpdate, type AssetListItem, type AssetStatus } from '../../models/asset.model';
import { COVERAGE_STATES } from '../../models/coverage.model';
import { ASSET_FLAGS } from '../../models/dashboard.model';
import { ASSET_STATUS_TONE, COVERAGE_STATE_TONE, CRITICALITY_TONE, WARRANTY_STATUS_TONE } from '../../models/display';
import { WARRANTY_STATUSES } from '../../models/warranty.model';

export interface RecentAsset {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly ts: number;
}

const RECENT_KEY = 'amc.assets.recently-viewed';
const SORT_KEY = 'amc.assets.sort';
const VIEW_KEY = 'amc.assets.view';

export function trackRecentAsset(entry: Omit<RecentAsset, 'ts'>): void {
  try {
    const existing: RecentAsset[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ ...entry, ts: Date.now() }, ...existing.filter((e) => e.id !== entry.id)].slice(0, 8)));
  } catch {
    /* ignore */
  }
}

type BulkMode = 'category' | 'region' | 'status' | 'plan';
const BULK_LABELS: Record<BulkMode, string> = { category: 'Assign Category', region: 'Assign Service Region', status: 'Update Status', plan: 'Assign Maintenance Plan' };

@Component({
  selector: 'amc-asset-list-page',
  imports: [DataTable, Dialog, FilterBar, Icon, PageHeader, RouterLink, Select, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './asset-list.page.html',
})
export class AssetListPage {
  private readonly api = inject(AssetApi);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly notify = inject(NotificationPort);
  private readonly handoff = inject(AssetHandoff);
  protected readonly refs = inject(AssetReferenceStore);
  private readonly lookupValues = inject(LookupValuesStore);

  // Query parameters seed the initial filters (withComponentInputBinding).
  readonly q = input<string>();
  readonly status = input<string>();
  readonly category = input<string>();
  readonly type = input<string>();
  readonly customer = input<string>();
  readonly site = input<string>();
  readonly warranty = input<string>();
  readonly coverage = input<string>();
  readonly region = input<string>();
  readonly manufacturer = input<string>();
  readonly flag = input<string>();

  protected readonly assets = rxResource({ stream: () => this.api.list() });
  protected readonly rows = computed(() => (this.assets.hasValue() ? this.assets.value() : []));

  protected readonly search = linkedSignal(() => this.q() ?? '');
  protected readonly activeFlag = linkedSignal(() => this.flag() ?? '');
  protected readonly filters = linkedSignal<FilterValues>(() => {
    const seed: Record<string, string[]> = {};
    const add = (key: string, value: string | undefined) => value && (seed[key] = [value]);
    add('status', this.status());
    add('category', this.category());
    add('type', this.type());
    add('customer', this.customer());
    add('site', this.site());
    add('warranty', this.warranty() === 'Active' ? undefined : this.warranty());
    add('coverage', this.coverage());
    add('region', this.region());
    add('manufacturer', this.manufacturer());
    if (this.warranty() === 'Active') seed['warranty'] = ['Active', 'Expiring Soon'];
    return seed;
  });
  protected readonly flagLabel = computed(() => ASSET_FLAGS[this.activeFlag() as keyof typeof ASSET_FLAGS] ?? null);
  protected readonly selected = signal<readonly string[]>([]);

  protected readonly filterFields = computed<FilterField[]>(() => {
    const rows = this.rows();
    const unique = (values: string[]) => toOptions([...new Set(values.filter(Boolean))].sort());
    return [
      { key: 'customer', label: 'Customer', type: 'multiselect', options: this.refs.customerOptions() },
      { key: 'site', label: 'Site', type: 'multiselect', options: this.refs.allSiteOptions() },
      { key: 'category', label: 'Asset Category', type: 'multiselect', options: this.lookupValues.options(ASSET_LOOKUP.category)() },
      { key: 'type', label: 'Asset Type', type: 'multiselect', options: this.lookupValues.options(ASSET_LOOKUP.type)() },
      { key: 'manufacturer', label: 'Manufacturer', type: 'multiselect', options: this.lookupValues.options(ASSET_LOOKUP.manufacturer)() },
      { key: 'model', label: 'Model', type: 'multiselect', options: unique(rows.map((r) => r.model)) },
      { key: 'status', label: 'Status', type: 'multiselect', options: toOptions(ASSET_STATUSES) },
      { key: 'warranty', label: 'Warranty Status', type: 'multiselect', options: toOptions([...WARRANTY_STATUSES, 'No Warranty']) },
      { key: 'coverage', label: 'Contract / AMC Status', type: 'multiselect', options: toOptions(COVERAGE_STATES) },
      { key: 'criticality', label: 'Criticality', type: 'multiselect', options: toOptions(['Critical', 'High', 'Medium', 'Low'] as const) },
      { key: 'installed', label: 'Installation Date', type: 'date-range' },
      { key: 'maintenance', label: 'Maintenance Due Date', type: 'date-range' },
      { key: 'region', label: 'Service Region', type: 'multiselect', options: this.refs.regionOptions() },
    ];
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    const flag = this.activeFlag();
    return this.rows().filter((a) => {
      if (term) {
        const haystack = [a.code, a.tag, a.name, a.serialNumber, a.customerName, a.siteName, a.manufacturer, a.model, a.barcode, a.rfid].join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return (
        (!flag || matchesFlag(a, flag)) &&
        matchesAny(f, 'customer', a.customerId) &&
        matchesAny(f, 'site', a.siteId) &&
        matchesAny(f, 'category', a.category) &&
        matchesAny(f, 'type', a.type) &&
        matchesAny(f, 'manufacturer', a.manufacturer) &&
        matchesAny(f, 'model', a.model) &&
        matchesAny(f, 'status', a.status) &&
        matchesAny(f, 'warranty', a.warrantyStatus) &&
        matchesAny(f, 'coverage', a.coverageState) &&
        matchesAny(f, 'criticality', a.criticality) &&
        matchesAny(f, 'region', a.operational.serviceRegion) &&
        withinRange(f, 'installed', a.installation.date) &&
        withinRange(f, 'maintenance', a.operational.nextMaintenanceDate)
      );
    });
  });

  protected readonly columns = assetListColumns();
  protected readonly trackById = (a: AssetListItem) => a.id;
  protected readonly statusTone = ASSET_STATUS_TONE;
  protected readonly warrantyTone = WARRANTY_STATUS_TONE;
  protected readonly coverageTone = COVERAGE_STATE_TONE;
  protected readonly criticalityTone = CRITICALITY_TONE;
  protected readonly formatDate = formatDate;

  // ----- View preferences ------------------------------------------------------

  protected readonly viewMode = signal<'table' | 'card'>((localStorage.getItem(VIEW_KEY) as 'table' | 'card' | null) ?? 'table');
  protected readonly sortState = signal<SortState | null>((() => {
    try {
      return JSON.parse(localStorage.getItem(SORT_KEY) ?? 'null') as SortState | null;
    } catch {
      return null;
    }
  })());
  protected readonly recentlyViewed = signal<RecentAsset[]>((() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentAsset[];
    } catch {
      return [];
    }
  })());
  protected readonly groupBy = signal<'none' | 'category' | 'status' | 'customer'>('none');
  protected readonly collapsedGroups = signal<Set<string>>(new Set());
  protected readonly grouped = computed(() => {
    const by = this.groupBy();
    if (by === 'none') return null;
    const map = new Map<string, AssetListItem[]>();
    for (const a of this.filtered()) {
      const key = (by === 'category' ? a.category : by === 'status' ? a.status : a.customerName) || 'Unassigned';
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  protected toggleGroup(key: string): void {
    this.collapsedGroups.update((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    if (e.key === '/' && !inInput) {
      e.preventDefault();
      document.querySelector<HTMLInputElement>('amc-asset-list-page input[type=search]')?.focus();
    }
    if (e.key === 'n' && !inInput && !e.ctrlKey && !e.metaKey && !document.querySelector('dialog[open]')) void this.router.navigate(['/app/assets/new']);
  }

  constructor() {
    effect(() => localStorage.setItem(VIEW_KEY, this.viewMode()));
    effect(() => {
      const s = this.sortState();
      if (s) localStorage.setItem(SORT_KEY, JSON.stringify(s));
      else localStorage.removeItem(SORT_KEY);
    });
  }

  protected clearFilters(): void {
    this.search.set('');
    this.filters.set({});
    this.activeFlag.set('');
  }

  // ----- Actions ---------------------------------------------------------------

  protected readonly bulkActions: MenuItem[] = [
    { id: 'category', label: 'Assign Category', icon: 'tag' },
    { id: 'region', label: 'Assign Service Region', icon: 'globe' },
    { id: 'status', label: 'Update Status', icon: 'refresh' },
    { id: 'plan', label: 'Assign Maintenance Plan', icon: 'calendar-check' },
    { id: 'export', label: 'Export', icon: 'download' },
  ];

  protected readonly rowActions = (a: AssetListItem): MenuItem[] => {
    const blocked = TRANSACTION_BLOCKED_STATUSES.includes(a.status);
    const hint = blocked ? `Not available for ${a.status.toLowerCase()} assets` : undefined;
    const inactive = INACTIVE_STATUSES.includes(a.status) && a.status !== 'Transferred';
    return [
      { id: 'view', label: 'View', icon: 'eye' },
      { id: 'edit', label: 'Edit', icon: 'pencil' },
      { id: 'add-component', label: 'Add Component', icon: 'layers', disabled: blocked, hint, dividerBefore: true },
      { id: 'transfer', label: 'Transfer', icon: 'arrow-right', disabled: blocked || a.status === 'Transferred', hint },
      { id: 'create-request', label: 'Create Service Request', icon: 'ticket', disabled: blocked, hint },
      { id: 'create-work-order', label: 'Create Work Order', icon: 'wrench', disabled: blocked, hint },
      { id: 'history', label: 'View Service History', icon: 'history', dividerBefore: true },
      { id: 'warranty', label: 'View Warranty', icon: 'shield-check' },
      { id: 'contract', label: 'View Contract', icon: 'file-check' },
      { id: 'export', label: 'Export', icon: 'download' },
      inactive
        ? { id: 'reactivate', label: 'Reactivate', icon: 'check-circle', dividerBefore: true }
        : { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, dividerBefore: true, disabled: blocked || !STATUS_TRANSITIONS[a.status].includes('Temporarily Out of Service'), hint: blocked ? hint : 'Not available in the current status' },
    ];
  };

  protected async onAction({ id, row }: RowAction<AssetListItem>): Promise<void> {
    const open = (tab: string, action?: string) => void this.router.navigate(['/app/assets', row.id], { queryParams: { tab, action } });
    switch (id) {
      case 'view':
        void this.router.navigate(['/app/assets', row.id]);
        break;
      case 'edit':
        void this.router.navigate(['/app/assets', row.id, 'edit']);
        break;
      case 'add-component':
        open('components', 'add-component');
        break;
      case 'transfer':
        open('location', 'transfer');
        break;
      case 'create-request':
        this.handoff.open('Create Service Request', this.context(row));
        break;
      case 'create-work-order':
        this.handoff.open('Create Work Order', this.context(row));
        break;
      case 'history':
        open('service-history');
        break;
      case 'warranty':
        open('warranty');
        break;
      case 'contract':
        open('contracts');
        break;
      case 'export':
        this.export([row]);
        break;
      case 'deactivate':
        await this.changeStatus([row.id], 'Temporarily Out of Service');
        break;
      case 'reactivate':
        await this.changeStatus([row.id], 'Active');
        break;
    }
  }

  private context(a: AssetListItem) {
    return { id: a.id, code: a.code, name: a.name, customerName: a.customerName, siteName: a.siteName };
  }

  protected async changeStatus(ids: readonly string[], status: AssetStatus): Promise<void> {
    const label = ids.length === 1 ? (this.rows().find((r) => r.id === ids[0])?.name ?? 'this asset') : `${ids.length} assets`;
    if (status === 'Temporarily Out of Service' || END_OF_LIFE_STATUSES.includes(status)) {
      const ok = await this.confirm.open({
        title: status === 'Temporarily Out of Service' ? `Deactivate ${ids.length === 1 ? 'asset' : `${ids.length} assets`}?` : `Change status to ${status}?`,
        message: `${label} will be set to ${status}. Assets are never deleted — their history is preserved and they can be reactivated where allowed.`,
        confirmLabel: status === 'Temporarily Out of Service' ? 'Deactivate' : 'Update status',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await firstValueFrom(this.api.setStatus(ids, status));
      this.notify.success(`${label} updated to ${status}.`);
      this.selected.set([]);
      this.assets.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    }
  }

  // ----- Bulk ----------------------------------------------------------------

  protected readonly bulkOpen = signal(false);
  protected readonly bulkMode = signal<BulkMode>('category');
  protected readonly bulkIds = signal<readonly string[]>([]);
  protected readonly bulkValue = signal<ChoiceValue | null>(null);
  protected readonly busy = signal(false);
  protected readonly bulkTitle = computed(() => BULK_LABELS[this.bulkMode()]);
  protected readonly bulkOptions = computed<ChoiceOption[]>(() => {
    switch (this.bulkMode()) {
      case 'category':
        return this.lookupValues.options(ASSET_LOOKUP.category)();
      case 'region':
        return this.refs.regionOptions();
      case 'plan':
        return this.lookupValues.options(ASSET_LOOKUP.maintenancePlan)();
      default:
        return toOptions(ASSET_STATUSES.filter((s) => s !== 'Transferred'));
    }
  });

  protected onBulk({ id, rows }: BulkAction<AssetListItem>): void {
    if (id === 'export') {
      this.export(rows);
      return;
    }
    this.bulkMode.set(id as BulkMode);
    this.bulkIds.set(rows.map((r) => r.id));
    this.bulkValue.set(null);
    this.bulkOpen.set(true);
  }

  protected async applyBulk(): Promise<void> {
    const value = this.bulkValue();
    if (!value) return;
    const ids = this.bulkIds();
    const mode = this.bulkMode();
    if (mode === 'status') {
      this.bulkOpen.set(false);
      await this.changeStatus(ids, String(value) as AssetStatus);
      return;
    }
    const changes: AssetBulkUpdate = mode === 'category' ? { category: String(value) } : mode === 'region' ? { serviceRegion: String(value) } : { maintenancePlan: String(value) };
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.bulkUpdate(ids, changes));
      this.notify.success(`${BULK_LABELS[mode]} applied to ${ids.length} asset${ids.length === 1 ? '' : 's'}.`);
      this.bulkOpen.set(false);
      this.selected.set([]);
      this.assets.reload();
    } catch (error) {
      this.notify.error((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected export(rows: readonly AssetListItem[] = this.filtered()): void {
    downloadCsv(
      timestampedName('assets', 'csv'),
      ['Asset ID', 'Asset Tag', 'Asset Name', 'Customer', 'Site', 'Asset Category', 'Asset Type', 'Manufacturer', 'Model', 'Serial Number', 'Criticality', 'Installation Date', 'Warranty Status', 'Warranty End', 'Contract / AMC Status', 'Current Status', 'Next Maintenance Date', 'Service Region', 'Created Date'],
      rows.map((a) => [a.code, a.tag, a.name, a.customerName, a.siteName, a.category, a.type, a.manufacturer, a.model, a.serialNumber, a.criticality, a.installation.date, a.warrantyStatus, a.warrantyEnd, a.coverageState, a.status, a.operational.nextMaintenanceDate, a.operational.serviceRegion, a.createdAt.slice(0, 10)]),
    );
    this.notify.success(`${rows.length} asset${rows.length === 1 ? '' : 's'} exported.`);
  }
}
