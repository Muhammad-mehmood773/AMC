import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  signal,
} from '@angular/core';
import {
  type FilterField,
  type FilterValue,
  type FilterValues,
  countActiveFilters,
  filterList,
  filterRange,
  isFilterActive,
} from '@shared/utils/filters';
import { type DateRange, DateRangePicker, EMPTY_RANGE, rangeLabel } from './date-picker';
import { Dialog } from './dialog';
import { Icon } from './icon';
import { type ChoiceValue, MultiSelect, Select } from './select';

@Component({
  selector: 'amc-search-input',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="relative">
      <amc-icon
        name="search"
        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
      />
      <input
        type="search"
        class="amc-input pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
        [placeholder]="placeholder()"
        [attr.aria-label]="placeholder()"
        [value]="value()"
        (input)="onInput($event)"
        (keydown.escape)="value.set('')"
      />
      @if (value()) {
        <button
          type="button"
          class="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-sunken hover:text-ink"
          aria-label="Clear search"
          (click)="value.set('')"
        >
          <amc-icon name="x" [size]="14" />
        </button>
      }
    </div>
  `,
})
export class SearchInput {
  readonly value = model('');
  readonly placeholder = input('Search…');

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}

interface ActiveChip {
  readonly key: string;
  readonly label: string;
  readonly text: string;
}

/**
 * Standard list toolbar. The primary search stays on the page; advanced filters are described
 * by `fields` and edited in a drawer (draft → Apply / Reset). Applied filters are shown as
 * removable chips with an active count. Project buttons with the `actions` attribute.
 */
@Component({
  selector: 'amc-filter-bar',
  imports: [DateRangePicker, Dialog, Icon, MultiSelect, SearchInput, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-center gap-2">
      @if (showSearch()) {
        <amc-search-input
          class="min-w-0 flex-1 sm:max-w-sm"
          [placeholder]="searchPlaceholder()"
          [(value)]="search"
        />
      }
      @if (fields().length) {
        <button
          type="button"
          class="amc-btn-secondary"
          [class]="activeCount() > 0 ? 'ring-1 ring-brand' : ''"
          aria-haspopup="dialog"
          [attr.aria-expanded]="drawerOpen()"
          (click)="openDrawer()"
        >
          <amc-icon name="sliders" />
          <span>Filters</span>
          @if (activeCount() > 0) {
            <span
              class="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground"
              [attr.aria-label]="activeCount() + ' active filters'"
              >{{ activeCount() }}</span
            >
          }
        </button>
      }
      <div class="ml-auto flex flex-wrap items-center gap-2 empty:hidden">
        <ng-content select="[actions]" />
      </div>
    </div>

    @if (chips().length || (showSearch() && search())) {
      <div class="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Active filters">
        @for (chip of chips(); track chip.key) {
          <span
            class="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface-muted py-0.5 pr-1 pl-2.5 text-xs"
          >
            <span class="text-ink-muted">{{ chip.label }}:</span>
            <span class="max-w-56 truncate font-medium text-ink">{{ chip.text }}</span>
            <button
              type="button"
              class="flex h-5 w-5 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-sunken hover:text-ink"
              [attr.aria-label]="'Remove ' + chip.label + ' filter'"
              (click)="remove(chip.key)"
            >
              <amc-icon name="x" [size]="12" />
            </button>
          </span>
        }
        <button type="button" class="ml-1 text-xs font-medium text-brand hover:underline" (click)="clearAll()">
          Clear all
        </button>
      </div>
    }

    <amc-dialog
      variant="drawer"
      title="Filters"
      [description]="drawerDescription()"
      [(open)]="drawerOpen"
    >
      <div class="space-y-5">
        @for (field of fields(); track field.key) {
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="amc-label" [for]="'flt-' + field.key">{{ field.label }}</label>
              @if (draftActive(field.key)) {
                <button type="button" class="text-xs font-medium text-ink-muted hover:text-ink" (click)="setDraft(field.key, undefined)">
                  Clear
                </button>
              }
            </div>
            @switch (field.type) {
              @case ('multiselect') {
                <amc-multi-select
                  [inputId]="'flt-' + field.key"
                  [options]="field.options ?? []"
                  [placeholder]="field.placeholder ?? 'Any ' + field.label.toLowerCase()"
                  [maxChips]="3"
                  [value]="draftList(field.key)"
                  (valueChange)="setDraftList(field.key, $event)"
                />
              }
              @case ('date-range') {
                <amc-date-range-picker
                  [inputId]="'flt-' + field.key"
                  [placeholder]="field.placeholder ?? 'Any date'"
                  [value]="draftRange(field.key)"
                  (valueChange)="setDraft(field.key, $event)"
                />
              }
              @default {
                <amc-select
                  [inputId]="'flt-' + field.key"
                  [options]="field.options ?? []"
                  [placeholder]="field.placeholder ?? 'Any ' + field.label.toLowerCase()"
                  [clearable]="true"
                  [value]="draftList(field.key)[0] ?? ''"
                  (valueChange)="setDraftSingle(field.key, $event)"
                />
              }
            }
          </div>
        }
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-ghost sm:mr-auto" [disabled]="draftCount() === 0" (click)="resetDraft()">
          <amc-icon name="rotate-ccw" />
          Reset
        </button>
        <button type="button" class="amc-btn-secondary" (click)="drawerOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" (click)="apply()">
          Apply filters
          @if (draftCount() > 0) {
            <span class="rounded-full bg-white/20 px-1.5 text-xs">{{ draftCount() }}</span>
          }
        </button>
      </ng-container>
    </amc-dialog>
  `,
})
export class FilterBar {
  readonly search = model('');
  readonly searchPlaceholder = input('Search…');
  readonly showSearch = input(true);
  readonly fields = input<readonly FilterField[]>([]);
  readonly filters = model<FilterValues>({});

  protected readonly drawerOpen = signal(false);
  protected readonly draft = signal<FilterValues>({});

  protected readonly activeCount = computed(() => countActiveFilters(this.filters()));
  protected readonly draftCount = computed(() => countActiveFilters(this.draft()));
  protected readonly drawerDescription = computed(() =>
    this.draftCount() ? `${this.draftCount()} filter${this.draftCount() === 1 ? '' : 's'} selected` : 'Narrow down the list',
  );

  protected readonly chips = computed<ActiveChip[]>(() => {
    const values = this.filters();
    return this.fields()
      .filter((field) => isFilterActive(values[field.key]))
      .map((field) => {
        if (field.type === 'date-range') {
          return { key: field.key, label: field.label, text: rangeLabel(filterRange(values, field.key)) };
        }
        const selected = filterList(values, field.key);
        const labels = selected.map((v) => field.options?.find((o) => o.value === v)?.label ?? v);
        const text = labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}` : labels.join(', ');
        return { key: field.key, label: field.label, text };
      });
  });

  protected openDrawer(): void {
    this.draft.set({ ...this.filters() });
    this.drawerOpen.set(true);
  }

  protected draftList(key: string): string[] {
    return [...filterList(this.draft(), key)];
  }

  protected draftRange(key: string): DateRange {
    return filterRange(this.draft(), key) ?? EMPTY_RANGE;
  }

  protected draftActive(key: string): boolean {
    return isFilterActive(this.draft()[key]);
  }

  protected setDraft(key: string, value: FilterValue | undefined): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected setDraftList(key: string, value: readonly ChoiceValue[]): void {
    this.setDraft(key, value.map(String));
  }

  protected setDraftSingle(key: string, value: ChoiceValue | null): void {
    this.setDraft(key, value === null ? '' : String(value));
  }

  protected resetDraft(): void {
    this.draft.set({});
  }

  protected apply(): void {
    this.filters.set(prune(this.draft()));
    this.drawerOpen.set(false);
  }

  protected remove(key: string): void {
    this.filters.update((f) => prune({ ...f, [key]: undefined }));
  }

  protected clearAll(): void {
    this.filters.set({});
    this.search.set('');
  }
}

function prune(values: FilterValues): FilterValues {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => isFilterActive(v)));
}
