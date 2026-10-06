import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  computed,
  effect,
  forwardRef,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icon } from './icon';
import { Popover } from './popover';

export type ChoiceValue = string | number;

export interface ChoiceOption<V extends ChoiceValue = ChoiceValue> {
  readonly value: V;
  readonly label: string;
  readonly hint?: string;
}

const SEARCH_THRESHOLD = 8;

/** Shared keyboard-navigable option list used by Select and MultiSelect. */
@Directive()
abstract class ChoiceBase {
  readonly options = input.required<readonly ChoiceOption[]>();
  readonly placeholder = input('Select…');
  /** `auto` shows the search box when there are more than 8 options. */
  readonly searchable = input<boolean | 'auto'>('auto');
  readonly inputId = input('');
  readonly ariaLabel = input('');

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);
  protected readonly disabled = signal(false);
  /** Disables the control when it is used standalone (outside a form control). */
  readonly forceDisabled = input(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.forceDisabled());
  protected readonly listId = `amc-listbox-${Math.random().toString(36).slice(2, 9)}`;

  protected readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  protected readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');
  protected readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly showSearch = computed(() => {
    const mode = this.searchable();
    return mode === 'auto' ? this.options().length > SEARCH_THRESHOLD : mode;
  });

  protected readonly filtered = computed(() => {
    const term = this.query().trim().toLowerCase();
    return term
      ? this.options().filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(term))
      : this.options();
  });

  protected onChange: (value: never) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.query.set('');
        const selected = this.filtered().findIndex((o) => this.isSelected(o.value));
        this.activeIndex.set(Math.max(0, selected));
        queueMicrotask(() => {
          (this.searchBox()?.nativeElement ?? this.list()?.nativeElement)?.focus();
          this.scrollActiveIntoView();
        });
      });
    });
  }

  abstract isSelected(value: ChoiceValue): boolean;
  protected abstract choose(option: ChoiceOption): void;

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected toggleOpen(): void {
    if (this.isDisabled()) return;
    this.open.set(!this.open());
    if (!this.open()) this.onTouched();
  }

  protected onOpenChange(open: boolean): void {
    this.open.set(open);
    if (!open) this.onTouched();
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && !this.open()) {
      event.preventDefault();
      this.open.set(true);
    }
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  protected onListKeydown(event: KeyboardEvent): void {
    const count = this.filtered().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.set(count ? (this.activeIndex() + 1) % count : 0);
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.set(count ? (this.activeIndex() - 1 + count) % count : 0);
        this.scrollActiveIntoView();
        break;
      case 'Enter': {
        event.preventDefault();
        const option = this.filtered()[this.activeIndex()];
        if (option) this.choose(option);
        break;
      }
      case 'Tab':
        this.open.set(false);
        this.onTouched();
        break;
    }
  }

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  private scrollActiveIntoView(): void {
    queueMicrotask(() =>
      this.list()?.nativeElement.querySelector(`#${this.optionId(this.activeIndex())}`)?.scrollIntoView({ block: 'nearest' }),
    );
  }
}

const TRIGGER_CLASS =
  'amc-input flex items-center gap-2 pr-9 text-left disabled:cursor-not-allowed group-[.ng-invalid.ng-touched]/field:border-danger aria-expanded:border-brand aria-expanded:ring-4 aria-expanded:ring-brand-ring';

const PANEL_TEMPLATE = `
  @if (showSearch()) {
    <div class="sticky top-0 z-[1] border-b border-line bg-surface p-2">
      <div class="relative">
        <amc-icon name="search" [size]="14" class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-subtle" />
        <input
          #searchBox
          type="text"
          class="h-8 w-full rounded-md border border-line bg-surface-muted pr-2 pl-8 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-brand focus:bg-surface"
          placeholder="Search…"
          aria-label="Search options"
          role="combobox"
          aria-autocomplete="list"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="filtered().length ? optionId(activeIndex()) : null"
          [value]="query()"
          (input)="onSearch($event)"
          (keydown)="onListKeydown($event)"
        />
      </div>
    </div>
  }
  <ul
    #list
    [id]="listId"
    role="listbox"
    tabindex="-1"
    class="p-1 outline-none"
    [attr.aria-multiselectable]="multiple || null"
    [attr.aria-activedescendant]="filtered().length ? optionId(activeIndex()) : null"
    (keydown)="onListKeydown($event)"
  >
    @for (option of filtered(); track option.value; let i = $index) {
      <li
        [id]="optionId(i)"
        role="option"
        tabindex="-1"
        class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors"
        [class]="i === activeIndex() ? 'bg-surface-sunken text-ink' : 'text-ink'"
        [attr.aria-selected]="isSelected(option.value)"
        (pointerenter)="activeIndex.set(i)"
        (click)="choose(option)"
        (keydown.enter)="choose(option)"
      >
        @if (multiple) {
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
            [class]="isSelected(option.value) ? 'border-brand bg-brand text-brand-foreground' : 'border-line-strong bg-surface'"
          >
            @if (isSelected(option.value)) {
              <amc-icon name="check" [size]="11" [strokeWidth]="3" />
            }
          </span>
        }
        <span class="min-w-0 flex-1">
          <span class="block truncate" [class.font-medium]="isSelected(option.value)">{{ option.label }}</span>
          @if (option.hint) {
            <span class="block truncate text-xs text-ink-muted">{{ option.hint }}</span>
          }
        </span>
        @if (!multiple && isSelected(option.value)) {
          <amc-icon name="check" [size]="15" class="text-brand" />
        }
      </li>
    } @empty {
      <li class="px-3 py-6 text-center text-sm text-ink-muted">No matching options</li>
    }
  </ul>
`;

const SELECT_TEMPLATE = `
  <button
    #trigger
    type="button"
    [id]="inputId() || null"
    [class]="triggerClass"
    [class.pr-14]="showClear()"
    [disabled]="isDisabled()"
    aria-haspopup="listbox"
    [attr.aria-expanded]="open()"
    [attr.aria-controls]="listId"
    [attr.aria-label]="ariaLabel() || null"
    (click)="toggleOpen()"
    (keydown)="onTriggerKeydown($event)"
  >
    <span class="min-w-0 flex-1 truncate" [class.text-ink-subtle]="!selected()">
      {{ selected()?.label ?? placeholder() }}
    </span>
  </button>
  @if (showClear()) {
    <button
      type="button"
      class="absolute top-1/2 right-8 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-subtle hover:bg-surface-sunken hover:text-ink"
      aria-label="Clear selection"
      (click)="clear()"
    >
      <amc-icon name="x" [size]="13" />
    </button>
  }
  <amc-icon
    name="chevron-down"
    [size]="16"
    class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-subtle transition-transform"
    [class.rotate-180]="open()"
  />
  <amc-popover
    [anchor]="trigger"
    [open]="open()"
    (openChange)="onOpenChange($event)"
    [matchWidth]="true"
    [minWidth]="minPanelWidth()"
  >
    ${PANEL_TEMPLATE}
  </amc-popover>
`;

const MULTISELECT_TEMPLATE = `
  <button
    #trigger
    type="button"
    [id]="inputId() || null"
    [class]="triggerClass"
    [disabled]="isDisabled()"
    aria-haspopup="listbox"
    [attr.aria-expanded]="open()"
    [attr.aria-controls]="listId"
    [attr.aria-label]="ariaLabel() || null"
    (click)="toggleOpen()"
    (keydown)="onTriggerKeydown($event)"
  >
    @if (selectedOptions().length === 0) {
      <span class="truncate text-ink-subtle">{{ placeholder() }}</span>
    } @else {
      <span class="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        @for (option of selectedOptions().slice(0, maxChips()); track option.value) {
          <span class="inline-flex max-w-32 shrink-0 items-center truncate rounded-md bg-brand-subtle px-1.5 py-0.5 text-xs font-medium text-brand">{{ option.label }}</span>
        }
        @if (selectedOptions().length > maxChips()) {
          <span class="shrink-0 text-xs font-medium text-ink-muted">+{{ selectedOptions().length - maxChips() }}</span>
        }
      </span>
    }
  </button>
  <amc-icon
    name="chevron-down"
    [size]="16"
    class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-subtle transition-transform"
    [class.rotate-180]="open()"
  />
  <amc-popover
    [anchor]="trigger"
    [open]="open()"
    (openChange)="onOpenChange($event)"
    [matchWidth]="true"
    [minWidth]="220"
  >
    ${PANEL_TEMPLATE}
    @if (selectedOptions().length) {
      <div class="sticky bottom-0 flex items-center justify-between border-t border-line bg-surface px-3 py-2 text-xs">
        <span class="text-ink-muted">{{ selectedOptions().length }} selected</span>
        <button type="button" class="font-medium text-brand hover:underline" (click)="clearAll()">Clear</button>
      </div>
    }
  </amc-popover>
`;

/**
 * Single-value select / combobox. Searchable for long lists, keyboard accessible, optional
 * clear button. Works as a form control (CVA) or with `[(value)]`.
 */
@Component({
  selector: 'amc-select',
  imports: [Icon, Popover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Select), multi: true }],
  host: { class: 'group/field relative block min-w-0' },
  template: SELECT_TEMPLATE,
})
export class Select extends ChoiceBase implements ControlValueAccessor {
  readonly value = model<ChoiceValue | null>(null);
  readonly clearable = input(false);
  readonly minPanelWidth = input(200);
  /** Emits only for user-initiated changes (not when a form control writes a value). */
  readonly selectionChange = output<ChoiceValue | null>();

  protected readonly multiple = false;
  protected readonly triggerClass = TRIGGER_CLASS;
  protected readonly selected = computed(() =>
    this.options().find((o) => o.value === this.value()) ?? null,
  );
  protected readonly showClear = computed(
    () => this.clearable() && !this.isDisabled() && this.value() !== null && this.value() !== '',
  );

  writeValue(value: ChoiceValue | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: ChoiceValue | null) => void): void {
    this.onChange = fn as (value: never) => void;
  }

  isSelected(value: ChoiceValue): boolean {
    return this.value() === value;
  }

  protected choose(option: ChoiceOption): void {
    this.value.set(option.value);
    (this.onChange as (value: ChoiceValue) => void)(option.value);
    this.selectionChange.emit(option.value);
    this.open.set(false);
    this.onTouched();
    this.trigger().nativeElement.focus();
  }

  protected clear(): void {
    const empty = typeof this.value() === 'number' ? null : '';
    this.value.set(empty);
    (this.onChange as (value: ChoiceValue | null) => void)(empty);
    this.selectionChange.emit(empty);
    this.onTouched();
  }
}

/** Multi-value select with checkboxes, search and chip summary. Value is an array. */
@Component({
  selector: 'amc-multi-select',
  imports: [Icon, Popover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MultiSelect), multi: true }],
  host: { class: 'group/field relative block min-w-0' },
  template: MULTISELECT_TEMPLATE,
})
export class MultiSelect extends ChoiceBase implements ControlValueAccessor {
  readonly value = model<readonly ChoiceValue[]>([]);
  readonly maxChips = input(2);

  protected readonly multiple = true;
  protected readonly triggerClass = TRIGGER_CLASS;
  protected readonly selectedOptions = computed(() =>
    this.options().filter((o) => this.value().includes(o.value)),
  );

  writeValue(value: readonly ChoiceValue[] | null): void {
    this.value.set(value ?? []);
  }

  registerOnChange(fn: (value: ChoiceValue[]) => void): void {
    this.onChange = fn as (value: never) => void;
  }

  isSelected(value: ChoiceValue): boolean {
    return this.value().includes(value);
  }

  protected choose(option: ChoiceOption): void {
    const order = this.options().map((o) => o.value);
    const next = this.isSelected(option.value)
      ? this.value().filter((v) => v !== option.value)
      : [...this.value(), option.value].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    this.emit(next);
  }

  protected clearAll(): void {
    this.emit([]);
  }

  private emit(next: ChoiceValue[]): void {
    this.value.set(next);
    (this.onChange as (value: ChoiceValue[]) => void)([...next]);
  }
}
