import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  linkedSignal,
  model,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@shared/utils/format';
import { ActionMenu, type MenuItem } from './action-menu';
import { Avatar } from './avatar';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { Icon, type IconName } from './icon';
import { Pagination } from './pagination';
import { Popover } from './popover';
import { Skeleton } from './skeleton';
import { StatusBadge, type BadgeTone } from './status-badge';

export type ColumnType = 'text' | 'number' | 'date' | 'datetime' | 'currency' | 'badge' | 'mono';
export type ColumnVisibility = 'always' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type CellValue = string | number | null | undefined;

export interface DataColumn<T> {
  readonly key: string;
  readonly label: string;
  readonly value: (row: T) => CellValue;
  readonly type?: ColumnType;
  readonly tone?: (row: T) => BadgeTone;
  readonly link?: (row: T) => string | null;
  readonly secondary?: (row: T) => CellValue;
  readonly avatar?: boolean;
  readonly sortable?: boolean;
  readonly align?: 'left' | 'right' | 'center';
  /** Default responsive visibility; users can override it from the column menu. */
  readonly visibility?: ColumnVisibility;
  /** Role of the column in the stacked mobile card layout. */
  readonly mobile?: 'title' | 'badge' | 'meta' | 'hidden';
  readonly currency?: (row: T) => string;
  /** Default width in px (columns are user-resizable). */
  readonly width?: number;
  /** Set false to keep a column permanently visible (e.g. the primary column). */
  readonly hideable?: boolean;
}

export interface SortState {
  readonly key: string;
  readonly direction: 'asc' | 'desc';
}

export interface RowAction<T> {
  readonly id: string;
  readonly row: T;
}

export interface BulkAction<T> {
  readonly id: string;
  readonly rows: readonly T[];
}

export type TableDensity = 'compact' | 'comfortable' | 'spacious';

/** Maps density to the --amc-cell-py CSS variable value used in amc-td. */
const DENSITY_CELL_PY: Record<TableDensity, string> = {
  compact: '0.35rem',
  comfortable: '0.75rem',
  spacious: '1.25rem',
};

interface TablePrefs {
  readonly visible: Readonly<Record<string, boolean>>;
  readonly widths: Readonly<Record<string, number>>;
  readonly density: TableDensity;
}

const EMPTY_PREFS: TablePrefs = { visible: {}, widths: {}, density: 'comfortable' };
const MIN_WIDTH = 72;

const VISIBILITY: Record<ColumnVisibility, string> = {
  always: '',
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
};

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

function loadPrefs(id: string): TablePrefs {
  if (!id || typeof localStorage === 'undefined') return EMPTY_PREFS;
  try {
    return { ...EMPTY_PREFS, ...(JSON.parse(localStorage.getItem(`amc.table.${id}`) ?? '{}') as Partial<TablePrefs>) };
  } catch {
    return EMPTY_PREFS;
  }
}

/**
 * Enterprise data table: column-configured rendering, sorting, client-side pagination with
 * page-size selection, row selection with bulk actions, persisted column visibility and widths,
 * sticky header, sticky selection/action columns, loading/empty/error states and a stacked
 * card layout on small screens.
 */
@Component({
  selector: 'amc-data-table',
  imports: [ActionMenu, Avatar, EmptyState, ErrorState, Icon, Pagination, Popover, RouterLink, Skeleton, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <!-- Toolbar / bulk bar -->
    @if (toolbar() && !error()) {
      @if (selected().length > 0 && bulkActions().length > 0) {
        <div class="flex min-h-12 animate-fade-in flex-wrap items-center gap-2 border-b border-line bg-row-selected px-3 py-2 sm:px-4" role="region" aria-label="Bulk actions">
          <span class="text-sm font-medium text-ink">{{ selected().length }} selected</span>
          @if (pageAllSelected() && selected().length < rows().length) {
            <button type="button" class="text-xs font-medium text-brand hover:underline" (click)="selectAll()">Select all {{ rows().length }}</button>
          }
          <span class="mx-1 hidden h-5 w-px bg-line sm:block"></span>
          @for (action of bulkActions(); track action.id) {
            <button
              type="button"
              class="amc-btn-secondary amc-btn-sm"
              [class.text-danger]="action.danger"
              [disabled]="action.disabled"
              (click)="emitBulk(action.id)"
            >
              @if (action.icon) {
                <amc-icon [name]="action.icon" [size]="14" />
              }
              {{ action.label }}
            </button>
          }
          <button type="button" class="amc-btn-ghost amc-btn-sm ml-auto" (click)="selected.set([])">Clear selection</button>
        </div>
      } @else {
        <div class="flex min-h-12 items-center justify-between gap-3 border-b border-line px-3 py-2 sm:px-4">
          <p class="text-sm text-ink-muted">
            @if (loading() && rows().length === 0) {
              Loading…
            } @else {
              <span class="font-medium text-ink tabular-nums">{{ rows().length }}</span>
              {{ rows().length === 1 ? entity().singular : entity().plural }}
              @if (totalCount() !== null && totalCount() !== rows().length) {
                <span class="text-ink-subtle">of {{ totalCount() }}</span>
              }
            }
          </p>
          <div class="flex items-center gap-1">
            <ng-content select="[toolbar]" />
            <!-- Density toggle -->
            <button
              #densityBtn
              type="button"
              class="amc-btn-ghost amc-btn-sm hidden md:inline-flex"
              aria-haspopup="dialog"
              [attr.aria-expanded]="densityOpen()"
              title="Row density"
              (click)="densityOpen.set(!densityOpen())"
            >
              <amc-icon name="align-justify" [size]="14" />
            </button>
            <amc-popover [anchor]="densityBtn" [(open)]="densityOpen" align="end" role="dialog" ariaLabel="Row density" [minWidth]="180">
              <div class="border-b border-line px-3 py-2.5">
                <p class="text-sm font-semibold text-ink">Row density</p>
              </div>
              <ul class="p-1.5">
                @for (opt of densityOptions; track opt.value) {
                  <li>
                    <button type="button" class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-sunken" [class.font-semibold]="density() === opt.value" (click)="setDensity(opt.value)">
                      <amc-icon [name]="opt.icon" [size]="15" />
                      {{ opt.label }}
                      @if (density() === opt.value) { <amc-icon name="check" [size]="13" class="ml-auto text-brand" /> }
                    </button>
                  </li>
                }
              </ul>
            </amc-popover>
            <button
              #columnsBtn
              type="button"
              class="amc-btn-ghost amc-btn-sm hidden md:inline-flex"
              aria-haspopup="dialog"
              [attr.aria-expanded]="columnsOpen()"
              (click)="columnsOpen.set(!columnsOpen())"
            >
              <amc-icon name="layers" [size]="14" />
              Columns
              @if (hiddenCount() > 0) {
                <span class="rounded-full bg-surface-sunken px-1.5 text-[11px] font-semibold text-ink-muted">{{ hiddenCount() }} hidden</span>
              }
            </button>
            <amc-popover [anchor]="columnsBtn" [(open)]="columnsOpen" align="end" role="dialog" ariaLabel="Choose columns" [minWidth]="240">
              <div class="border-b border-line px-3 py-2.5">
                <p class="text-sm font-semibold text-ink">Columns</p>
                <p class="text-xs text-ink-muted">Show, hide and reset table columns.</p>
              </div>
              <ul class="max-h-72 overflow-y-auto p-1.5">
                @for (col of columns(); track col.key) {
                  <li>
                    <label class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-sunken" [class.opacity-60]="col.hideable === false">
                      <input
                        type="checkbox"
                        class="amc-checkbox"
                        [checked]="isUserVisible(col)"
                        [disabled]="col.hideable === false"
                        (change)="toggleColumn(col)"
                      />
                      <span class="flex-1 truncate text-ink">{{ col.label }}</span>
                    </label>
                  </li>
                }
              </ul>
              <div class="flex justify-between border-t border-line px-3 py-2">
                <button type="button" class="text-xs font-medium text-ink-muted hover:text-ink" (click)="showAllColumns()">Show all</button>
                <button type="button" class="text-xs font-medium text-brand hover:underline" (click)="resetColumns()">Reset to default</button>
              </div>
            </amc-popover>
          </div>
        </div>
      }
    }

    @if (error()) {
      <amc-error-state [message]="error()!" (retry)="retry.emit()" />
    } @else if (loading() && rows().length === 0) {
      <div class="divide-y divide-line" aria-busy="true">
        @for (i of skeletonRows; track i) {
          <div class="flex items-center gap-4 px-4 py-3.5">
            <amc-skeleton class="h-8 w-8 rounded-lg" />
            <div class="flex-1 space-y-2">
              <amc-skeleton class="h-3.5 w-1/3" />
              <amc-skeleton class="h-3 w-1/5" />
            </div>
            <amc-skeleton class="hidden h-3.5 w-24 md:block" />
            <amc-skeleton class="hidden h-5 w-16 rounded-full md:block" />
          </div>
        }
      </div>
    } @else if (rows().length === 0) {
      <amc-empty-state [title]="emptyTitle()" [message]="emptyMessage()" [icon]="emptyIcon()" [compact]="compact()">
        <ng-content select="[empty]" />
      </amc-empty-state>
    } @else {
      <div class="relative" [style.--amc-cell-py]="densityCellPy()">
        @if (loading()) {
          <div class="absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-brand-subtle">
            <div class="h-full w-1/3 animate-pulse bg-brand"></div>
          </div>
        }

        <!-- Table layout (md and up) -->
        <div class="hidden overflow-auto overscroll-x-contain md:block" [style.max-height]="maxHeight()">
          <table class="w-full min-w-max border-separate border-spacing-0">
            <thead>
              <tr>
                @if (selectable()) {
                  <th scope="col" class="sticky top-0 left-0 z-20 w-11 border-b border-line bg-surface-muted py-2.5 pl-4">
                    <input
                      type="checkbox"
                      class="amc-checkbox"
                      aria-label="Select all rows on this page"
                      [checked]="pageAllSelected()"
                      [indeterminate]="pageSomeSelected()"
                      (change)="togglePage()"
                    />
                  </th>
                }
                @for (col of visibleColumns(); track col.key) {
                  <th
                    scope="col"
                    class="amc-th group/th sticky top-0 z-10 border-b border-line bg-surface-muted"
                    [class]="cellClass(col)"
                    [style.width.px]="widthOf(col)"
                    [style.min-width.px]="widthOf(col)"
                    [attr.aria-sort]="ariaSort(col)"
                  >
                    @if (col.sortable) {
                      <button type="button" class="group/sort inline-flex items-center gap-1 rounded hover:text-ink" (click)="toggleSort(col)">
                        {{ col.label }}
                        <amc-icon
                          [name]="sortIcon(col)"
                          [size]="12"
                          [class]="sort()?.key === col.key ? 'text-ink' : 'text-ink-subtle opacity-0 group-hover/sort:opacity-100'"
                        />
                      </button>
                    } @else {
                      {{ col.label }}
                    }
                    <span
                      class="absolute top-1.5 right-0 bottom-1.5 w-2 cursor-col-resize touch-none border-r-2 border-transparent opacity-0 transition-opacity group-hover/th:opacity-100 hover:border-brand"
                      role="separator"
                      aria-orientation="vertical"
                      [attr.aria-label]="'Resize ' + col.label + ' column'"
                      title="Drag to resize · double-click to reset"
                      (pointerdown)="startResize($event, col)"
                      (dblclick)="resetWidth(col)"
                    ></span>
                  </th>
                }
                @if (actions()) {
                  <th scope="col" class="sticky top-0 right-0 z-20 w-14 border-b border-l border-line bg-surface-muted">
                    <span class="sr-only">Actions</span>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of pagedRows(); track trackBy()(row)) {
                @let selectedRow = isSelected(row);
                <tr class="group/row">
                  @if (selectable()) {
                    <td class="sticky left-0 z-[5] w-11 border-b border-line pl-4 transition-colors" [class]="rowBg(selectedRow)">
                      <input
                        type="checkbox"
                        class="amc-checkbox"
                        [attr.aria-label]="'Select row ' + trackBy()(row)"
                        [checked]="selectedRow"
                        (change)="toggleRow(row)"
                      />
                    </td>
                  }
                  @for (col of visibleColumns(); track col.key) {
                    <td
                      class="amc-td border-b border-line transition-colors"
                      [class]="cellClass(col) + ' ' + rowBg(selectedRow)"
                      [style.max-width.px]="widthOf(col)"
                    >
                      @switch (col.type) {
                        @case ('badge') {
                          @if (col.value(row)) {
                            <amc-status-badge [label]="text(col, row)" [tone]="col.tone ? col.tone(row) : 'neutral'" />
                          }
                        }
                        @default {
                          @if (col.avatar) {
                            <div class="flex min-w-0 items-center gap-3">
                              <amc-avatar [name]="text(col, row)" />
                              <div class="min-w-0">
                                @if (col.link?.(row); as href) {
                                  <a [routerLink]="href" class="block truncate font-medium text-ink hover:text-brand">{{ text(col, row) }}</a>
                                } @else {
                                  <span class="block truncate font-medium">{{ text(col, row) }}</span>
                                }
                                @if (col.secondary?.(row); as sub) {
                                  <span class="block truncate text-xs text-ink-muted">{{ sub }}</span>
                                }
                              </div>
                            </div>
                          } @else {
                            <div class="min-w-0">
                              @if (col.link?.(row); as href) {
                                <a [routerLink]="href" class="block truncate font-medium text-ink hover:text-brand" [class]="col.type === 'mono' ? 'font-mono text-[13px]' : ''">{{ text(col, row) }}</a>
                              } @else if (text(col, row)) {
                                <span class="block truncate" [class]="valueClass(col)">{{ text(col, row) }}</span>
                              } @else {
                                <span class="text-ink-subtle">—</span>
                              }
                              @if (col.secondary?.(row); as sub) {
                                <span class="block truncate text-xs text-ink-muted">{{ sub }}</span>
                              }
                            </div>
                          }
                        }
                      }
                    </td>
                  }
                  @if (actions(); as menu) {
                    <td
                      class="sticky right-0 z-[5] w-14 border-b border-l border-line px-2 text-right shadow-[-10px_0_12px_-12px_rgb(15_23_42/0.35)] transition-colors"
                      [class]="rowBg(selectedRow)"
                    >
                      <amc-action-menu [items]="menu(row)" (action)="action.emit({ id: $event, row })" />
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Stacked card layout (below md) -->
        <ul class="divide-y divide-line md:hidden">
          @for (row of pagedRows(); track trackBy()(row)) {
            <li class="flex items-start gap-3 px-4 py-3.5 transition-colors" [class.bg-row-selected]="isSelected(row)">
              @if (selectable()) {
                <input
                  type="checkbox"
                  class="amc-checkbox mt-0.5 h-5 w-5 shrink-0"
                  [attr.aria-label]="'Select row ' + trackBy()(row)"
                  [checked]="isSelected(row)"
                  (change)="toggleRow(row)"
                />
              }
              @if (titleColumn(); as col) {
                @if (col.avatar) {
                  <amc-avatar [name]="text(col, row)" size="md" class="shrink-0" />
                }
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      @if (col.link?.(row); as href) {
                        <a [routerLink]="href" class="block truncate text-sm font-semibold text-ink hover:text-brand">{{ text(col, row) }}</a>
                      } @else {
                        <span class="block truncate text-sm font-semibold">{{ text(col, row) }}</span>
                      }
                      @if (col.secondary?.(row); as sub) {
                        <span class="block truncate text-xs text-ink-muted">{{ sub }}</span>
                      }
                    </div>
                    @if (badgeColumn(); as badge) {
                      @if (badge.value(row)) {
                        <amc-status-badge [label]="text(badge, row)" [tone]="badge.tone ? badge.tone(row) : 'neutral'" class="shrink-0" />
                      }
                    }
                  </div>
                  @if (metaColumns().length) {
                    <dl class="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
                      @for (meta of metaColumns(); track meta.key) {
                        <div class="min-w-0">
                          <dt class="text-[11px] font-medium text-ink-subtle">{{ meta.label }}</dt>
                          <dd class="truncate text-xs text-ink">{{ text(meta, row) || '—' }}</dd>
                        </div>
                      }
                    </dl>
                  }
                </div>
              }
              @if (actions(); as menu) {
                <amc-action-menu class="shrink-0" [items]="menu(row)" (action)="action.emit({ id: $event, row })" />
              }
            </li>
          }
        </ul>

        @if (paginate() && sortedRows().length > pageSizeOptions()[0]) {
          <div class="border-t border-line px-4 py-3">
            <amc-pagination
              [page]="page()"
              [pageSize]="pageSize()"
              [total]="sortedRows().length"
              [pageSizeOptions]="pageSizeOptions()"
              (pageChange)="page.set($event)"
              (pageSizeChange)="pageSize.set($event); page.set(1)"
            />
          </div>
        }
      </div>
    }
  `,
})
export class DataTable<T> {
  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<readonly DataColumn<T>[]>();
  readonly trackBy = input.required<(row: T) => string>();
  /** Enables persisted column preferences (visibility, widths). */
  readonly tableId = input('');
  readonly entity = input<{ singular: string; plural: string }>({ singular: 'record', plural: 'records' });
  /** Optional unfiltered total, shown as "x of y". */
  readonly totalCount = input<number | null>(null);
  readonly toolbar = input(true);
  readonly maxHeight = input('min(70vh, 720px)');
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly emptyTitle = input('No records found');
  readonly emptyMessage = input('Try adjusting your search or filters.');
  readonly emptyIcon = input<IconName>('inbox');
  readonly compact = input(false);
  readonly selectable = input(false);
  readonly bulkActions = input<readonly MenuItem[]>([]);
  readonly paginate = input(true);
  readonly initialPageSize = input(10);
  readonly pageSizeOptions = input<readonly number[]>([10, 25, 50, 100]);
  readonly actions = input<((row: T) => readonly MenuItem[]) | null>(null);

  readonly sort = model<SortState | null>(null);
  readonly selected = model<readonly string[]>([]);
  readonly action = output<RowAction<T>>();
  readonly bulkAction = output<BulkAction<T>>();
  readonly retry = output<void>();

  protected readonly skeletonRows = [1, 2, 3, 4, 5, 6];
  protected readonly columnsOpen = signal(false);
  protected readonly densityOpen = signal(false);
  protected readonly prefs = linkedSignal(() => loadPrefs(this.tableId()));
  protected readonly density = computed<TableDensity>(() => this.prefs().density ?? 'comfortable');
  protected readonly densityCellPy = computed(() => DENSITY_CELL_PY[this.density()]);
  protected readonly densityOptions: { value: TableDensity; label: string; icon: IconName }[] = [
    { value: 'compact', label: 'Compact', icon: 'rows-3' },
    { value: 'comfortable', label: 'Comfortable', icon: 'align-justify' },
    { value: 'spacious', label: 'Spacious', icon: 'layout-list' },
  ];
  protected readonly pageSize = linkedSignal(() => this.initialPageSize());
  protected readonly page = linkedSignal({
    source: () => [this.rows(), this.sort()] as const,
    computation: () => 1,
  });

  constructor() {
    effect(() => {
      const id = this.tableId();
      const prefs = this.prefs();
      if (id && typeof localStorage !== 'undefined') {
        localStorage.setItem(`amc.table.${id}`, JSON.stringify(prefs));
      }
    });
    // Drop selections that are no longer present in the data set.
    effect(() => {
      const ids = new Set(this.rows().map((r) => this.trackBy()(r)));
      const current = this.selected();
      if (current.some((id) => !ids.has(id))) {
        this.selected.set(current.filter((id) => ids.has(id)));
      }
    });
  }

  protected readonly visibleColumns = computed(() =>
    this.columns().filter((col) => this.prefs().visible[col.key] !== false),
  );
  protected readonly hiddenCount = computed(
    () => this.columns().filter((col) => !this.isUserVisible(col)).length,
  );

  protected readonly sortedRows = computed(() => {
    const rows = this.rows();
    const sort = this.sort();
    const column = sort && this.columns().find((col) => col.key === sort.key);
    if (!sort || !column) return rows;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => compare(column.value(a), column.value(b)) * factor);
  });

  protected readonly pagedRows = computed(() => {
    const rows = this.sortedRows();
    if (!this.paginate()) return rows;
    const start = (this.page() - 1) * this.pageSize();
    return rows.slice(start, start + this.pageSize());
  });

  protected readonly titleColumn = computed(
    () => this.columns().find((col) => col.mobile === 'title') ?? this.columns()[0],
  );
  protected readonly badgeColumn = computed(() => this.columns().find((col) => col.mobile === 'badge'));
  protected readonly metaColumns = computed(() => this.columns().filter((col) => col.mobile === 'meta'));

  private readonly selectedSet = computed(() => new Set(this.selected()));
  protected readonly pageAllSelected = computed(() => {
    const rows = this.pagedRows();
    return rows.length > 0 && rows.every((row) => this.selectedSet().has(this.trackBy()(row)));
  });
  protected readonly pageSomeSelected = computed(
    () => !this.pageAllSelected() && this.pagedRows().some((row) => this.selectedSet().has(this.trackBy()(row))),
  );

  // ----- Columns -----------------------------------------------------------

  /** Whether the user has the column switched on (explicit pref or default). */
  protected isUserVisible(col: DataColumn<T>): boolean {
    return this.prefs().visible[col.key] ?? true;
  }

  protected toggleColumn(col: DataColumn<T>): void {
    if (col.hideable === false) return;
    const visible = !this.isUserVisible(col);
    this.prefs.update((p) => ({ ...p, visible: { ...p.visible, [col.key]: visible } }));
  }

  protected showAllColumns(): void {
    const visible = Object.fromEntries(this.columns().map((c) => [c.key, true]));
    this.prefs.update((p) => ({ ...p, visible }));
  }

  protected resetColumns(): void {
    this.prefs.set(EMPTY_PREFS);
  }

  protected setDensity(value: TableDensity): void {
    this.prefs.update((p) => ({ ...p, density: value }));
    this.densityOpen.set(false);
  }

  protected widthOf(col: DataColumn<T>): number | null {
    return this.prefs().widths[col.key] ?? col.width ?? null;
  }

  protected startResize(event: PointerEvent, col: DataColumn<T>): void {
    event.preventDefault();
    event.stopPropagation();
    const th = (event.target as HTMLElement).closest('th');
    if (!th) return;
    const startX = event.clientX;
    const startWidth = th.getBoundingClientRect().width;
    const move = (e: PointerEvent) => {
      const width = Math.max(MIN_WIDTH, Math.round(startWidth + e.clientX - startX));
      this.prefs.update((p) => ({ ...p, widths: { ...p.widths, [col.key]: width } }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  protected resetWidth(col: DataColumn<T>): void {
    this.prefs.update((p) => {
      const widths = { ...p.widths };
      delete widths[col.key];
      return { ...p, widths };
    });
  }

  // ----- Rendering ---------------------------------------------------------

  protected text(col: DataColumn<T>, row: T): string {
    const value = col.value(row);
    if (value === null || value === undefined || value === '') return '';
    switch (col.type) {
      case 'date':
        return formatDate(String(value));
      case 'datetime':
        return formatDateTime(String(value));
      case 'currency':
        return formatCurrency(Number(value), col.currency?.(row));
      case 'number':
        return formatNumber(Number(value));
      default:
        return String(value);
    }
  }

  protected valueClass(col: DataColumn<T>): string {
    if (col.type === 'mono') return 'font-mono text-[13px] text-ink-muted';
    return this.isNumeric(col) ? 'tabular-nums' : '';
  }

  protected isNumeric(col: DataColumn<T>): boolean {
    return col.type === 'number' || col.type === 'currency';
  }

  protected cellClass(col: DataColumn<T>): string {
    const align = col.align ?? (this.isNumeric(col) ? 'right' : 'left');
    // A column the user explicitly enabled is shown at every breakpoint.
    const responsive = this.prefs().visible[col.key] === true ? '' : VISIBILITY[col.visibility ?? 'always'];
    return `${responsive} ${ALIGN[align]}`;
  }

  /** Opaque row background so sticky cells never reveal content scrolling beneath them. */
  protected rowBg(selected: boolean): string {
    return selected ? 'bg-row-selected' : 'bg-surface group-hover/row:bg-row-hover';
  }

  protected ariaSort(col: DataColumn<T>): string | null {
    const sort = this.sort();
    if (!col.sortable) return null;
    if (sort?.key !== col.key) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(col: DataColumn<T>): IconName {
    const sort = this.sort();
    if (sort?.key !== col.key) return 'chevrons-up-down';
    return sort.direction === 'asc' ? 'arrow-up' : 'arrow-down';
  }

  protected toggleSort(col: DataColumn<T>): void {
    const sort = this.sort();
    if (sort?.key !== col.key) this.sort.set({ key: col.key, direction: 'asc' });
    else if (sort.direction === 'asc') this.sort.set({ key: col.key, direction: 'desc' });
    else this.sort.set(null);
  }

  // ----- Selection ---------------------------------------------------------

  protected isSelected(row: T): boolean {
    return this.selectedSet().has(this.trackBy()(row));
  }

  protected toggleRow(row: T): void {
    const id = this.trackBy()(row);
    this.selected.set(this.isSelected(row) ? this.selected().filter((item) => item !== id) : [...this.selected(), id]);
  }

  protected togglePage(): void {
    const ids = this.pagedRows().map((row) => this.trackBy()(row));
    const set = new Set(this.selected());
    if (this.pageAllSelected()) ids.forEach((id) => set.delete(id));
    else ids.forEach((id) => set.add(id));
    this.selected.set([...set]);
  }

  protected selectAll(): void {
    this.selected.set(this.rows().map((row) => this.trackBy()(row)));
  }

  protected emitBulk(id: string): void {
    const set = this.selectedSet();
    this.bulkAction.emit({ id, rows: this.rows().filter((row) => set.has(this.trackBy()(row))) });
  }
}

function compare(a: CellValue, b: CellValue): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
