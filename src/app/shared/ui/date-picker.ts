import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  linkedSignal,
  model,
  output,
  signal,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icon } from './icon';
import { Popover } from './popover';

/* Dates are exchanged as local `yyyy-MM-dd` strings; empty string means "no date". */

export interface DateRange {
  readonly from: string;
  readonly to: string;
}

export const EMPTY_RANGE: DateRange = { from: '', to: '' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DISPLAY = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

export function displayDate(value: string): string {
  const date = parseIsoDate(value);
  return date ? DISPLAY.format(date) : '';
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export interface RangePreset {
  readonly label: string;
  readonly range: () => DateRange;
}

export const RANGE_PRESETS: readonly RangePreset[] = [
  { label: 'Today', range: () => ({ from: toIsoDate(new Date()), to: toIsoDate(new Date()) }) },
  { label: 'Last 7 days', range: () => ({ from: toIsoDate(addDays(new Date(), -6)), to: toIsoDate(new Date()) }) },
  { label: 'Last 30 days', range: () => ({ from: toIsoDate(addDays(new Date(), -29)), to: toIsoDate(new Date()) }) },
  { label: 'Last 90 days', range: () => ({ from: toIsoDate(addDays(new Date(), -89)), to: toIsoDate(new Date()) }) },
  {
    label: 'This month',
    range: () => {
      const now = new Date();
      return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toIsoDate(now) };
    },
  },
  {
    label: 'This year',
    range: () => ({ from: toIsoDate(new Date(new Date().getFullYear(), 0, 1)), to: toIsoDate(new Date()) }),
  },
  { label: 'Last 12 months', range: () => ({ from: toIsoDate(addDays(new Date(), -364)), to: toIsoDate(new Date()) }) },
];

export function rangeLabel(range: DateRange): string {
  if (!range.from && !range.to) return '';
  const preset = RANGE_PRESETS.find((p) => {
    const r = p.range();
    return r.from === range.from && r.to === range.to;
  });
  if (preset) return preset.label;
  if (range.from && range.to) return `${displayDate(range.from)} – ${displayDate(range.to)}`;
  return range.from ? `From ${displayDate(range.from)}` : `Until ${displayDate(range.to)}`;
}

interface DayCell {
  readonly iso: string;
  readonly day: number;
  readonly inMonth: boolean;
  readonly today: boolean;
  readonly disabled: boolean;
}

/** Month calendar supporting single dates and ranges. */
@Component({
  selector: 'amc-calendar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-[18rem] select-none p-3' },
  template: `
    <div class="mb-2 flex items-center justify-between">
      <button type="button" class="amc-btn-icon h-8 w-8" aria-label="Previous" (click)="shift(-1)">
        <amc-icon name="chevron-left" />
      </button>
      <button
        type="button"
        class="rounded-md px-2 py-1 text-sm font-semibold text-ink hover:bg-surface-sunken"
        [attr.aria-label]="mode() === 'days' ? 'Choose month and year' : 'Back to days'"
        (click)="mode.set(mode() === 'days' ? 'months' : 'days')"
      >
        {{ mode() === 'days' ? monthNames[view().getMonth()] + ' ' + view().getFullYear() : view().getFullYear() }}
      </button>
      <button type="button" class="amc-btn-icon h-8 w-8" aria-label="Next" (click)="shift(1)">
        <amc-icon name="chevron-right" />
      </button>
    </div>

    @if (mode() === 'days') {
      <div class="grid grid-cols-7 text-center text-[11px] font-medium text-ink-subtle">
        @for (d of weekdays; track d) {
          <span class="py-1">{{ d }}</span>
        }
      </div>
      <div class="grid grid-cols-7 gap-y-0.5" role="grid">
        @for (cell of cells(); track cell.iso) {
          <button
            type="button"
            class="relative h-9 text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30"
            [class]="cellClass(cell)"
            [disabled]="cell.disabled"
            [attr.aria-pressed]="isEdge(cell.iso)"
            [attr.aria-label]="cell.iso"
            (click)="pick.emit(cell.iso)"
            (pointerenter)="hover.set(cell.iso)"
          >
            {{ cell.day }}
            @if (cell.today) {
              <span class="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current opacity-70"></span>
            }
          </button>
        }
      </div>
    } @else {
      <div class="grid grid-cols-3 gap-1.5 py-1">
        @for (m of monthNames; track m; let i = $index) {
          <button
            type="button"
            class="h-10 rounded-lg text-sm transition-colors"
            [class]="i === view().getMonth() ? 'bg-brand text-brand-foreground' : 'text-ink hover:bg-surface-sunken'"
            (click)="selectMonth(i)"
          >
            {{ m.slice(0, 3) }}
          </button>
        }
      </div>
    }
  `,
})
export class Calendar {
  readonly start = input('');
  readonly end = input('');
  readonly range = input(false);
  readonly min = input('');
  readonly max = input('');
  readonly view = model(new Date());
  readonly pick = output<string>();

  protected readonly mode = signal<'days' | 'months'>('days');
  protected readonly hover = signal('');
  protected readonly monthNames = MONTHS;
  protected readonly weekdays = WEEKDAYS;

  protected readonly cells = computed<DayCell[]>(() => {
    const view = this.view();
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startDay = addDays(first, -first.getDay());
    const today = toIsoDate(new Date());
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(startDay, i);
      const iso = toIsoDate(date);
      return {
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === view.getMonth(),
        today: iso === today,
        disabled: (!!this.min() && iso < this.min()) || (!!this.max() && iso > this.max()),
      };
    });
  });

  protected isEdge(iso: string): boolean {
    return iso === this.start() || iso === this.end();
  }

  protected cellClass(cell: DayCell): string {
    const start = this.start();
    const end = this.end() || (this.range() && start && this.hover() > start ? this.hover() : '');
    const between = this.range() && start && end && cell.iso > start && cell.iso < end;
    if (this.isEdge(cell.iso)) {
      return `bg-brand font-semibold text-brand-foreground ${this.range() && end && start !== end ? (cell.iso === start ? 'rounded-l-lg' : 'rounded-r-lg') : 'rounded-lg'}`;
    }
    if (between) return 'bg-brand-subtle text-ink';
    return `rounded-lg hover:bg-surface-sunken ${cell.inMonth ? 'text-ink' : 'text-ink-subtle'} ${cell.today ? 'font-semibold text-brand' : ''}`;
  }

  protected shift(step: number): void {
    const v = this.view();
    this.view.set(this.mode() === 'days' ? new Date(v.getFullYear(), v.getMonth() + step, 1) : new Date(v.getFullYear() + step, v.getMonth(), 1));
  }

  protected selectMonth(month: number): void {
    this.view.set(new Date(this.view().getFullYear(), month, 1));
    this.mode.set('days');
  }
}

const TRIGGER =
  'amc-input flex items-center gap-2 pr-9 text-left group-[.ng-invalid.ng-touched]/field:border-danger aria-expanded:border-brand aria-expanded:ring-4 aria-expanded:ring-brand-ring';

/** Single date picker (form control or `[(value)]`). */
@Component({
  selector: 'amc-date-picker',
  imports: [Calendar, Icon, Popover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePicker), multi: true }],
  host: { class: 'group/field relative block min-w-0' },
  template: `
    <button
      #trigger
      type="button"
      [id]="inputId() || null"
      [class]="triggerClass"
      [disabled]="disabled()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="ariaLabel() || null"
      (click)="toggle()"
    >
      <amc-icon name="calendar" class="text-ink-subtle" />
      <span class="truncate" [class.text-ink-subtle]="!value()">{{ value() ? display(value()) : placeholder() }}</span>
    </button>
    @if (value() && !disabled()) {
      <button
        type="button"
        class="absolute top-1/2 right-2.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-subtle hover:bg-surface-sunken hover:text-ink"
        aria-label="Clear date"
        (click)="set('')"
      >
        <amc-icon name="x" [size]="13" />
      </button>
    }
    <amc-popover [anchor]="trigger" [(open)]="open" role="dialog" ariaLabel="Choose date">
      <amc-calendar [start]="value()" [min]="min()" [max]="max()" [(view)]="view" (pick)="set($event); open.set(false)" />
      <div class="flex items-center justify-between border-t border-line px-3 py-2">
        <button type="button" class="text-xs font-medium text-brand hover:underline" (click)="set(today); open.set(false)">Today</button>
        <button type="button" class="text-xs font-medium text-ink-muted hover:text-ink" (click)="set(''); open.set(false)">Clear</button>
      </div>
    </amc-popover>
  `,
})
export class DatePicker implements ControlValueAccessor {
  readonly value = model('');
  readonly placeholder = input('Select date');
  readonly min = input('');
  readonly max = input('');
  readonly inputId = input('');
  readonly ariaLabel = input('');

  protected readonly open = signal(false);
  protected readonly disabled = signal(false);
  protected readonly view = linkedSignal(() => parseIsoDate(this.value()) ?? new Date());
  protected readonly triggerClass = TRIGGER;
  protected readonly today = toIsoDate(new Date());
  protected readonly display = displayDate;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected toggle(): void {
    this.open.set(!this.open());
    if (!this.open()) this.onTouched();
  }

  protected set(value: string): void {
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
  }
}

/** Date-range picker with quick presets (form control or `[(value)]`). */
@Component({
  selector: 'amc-date-range-picker',
  imports: [Calendar, Icon, Popover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateRangePicker), multi: true }],
  host: { class: 'group/field relative block min-w-0' },
  template: `
    <button
      #trigger
      type="button"
      [id]="inputId() || null"
      [class]="triggerClass"
      [disabled]="disabled()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="ariaLabel() || null"
      (click)="open.set(!open())"
    >
      <amc-icon name="calendar" class="text-ink-subtle" />
      <span class="truncate" [class.text-ink-subtle]="!label()">{{ label() || placeholder() }}</span>
    </button>
    @if (label() && !disabled()) {
      <button
        type="button"
        class="absolute top-1/2 right-2.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-subtle hover:bg-surface-sunken hover:text-ink"
        aria-label="Clear date range"
        (click)="apply(empty)"
      >
        <amc-icon name="x" [size]="13" />
      </button>
    }
    <amc-popover [anchor]="trigger" [(open)]="open" role="dialog" ariaLabel="Choose date range">
      <div class="flex flex-col sm:flex-row">
        <ul class="flex gap-1 overflow-x-auto border-b border-line p-2 sm:w-36 sm:flex-col sm:border-r sm:border-b-0">
          @for (preset of presets; track preset.label) {
            <li>
              <button
                type="button"
                class="w-full rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors"
                [class]="label() === preset.label ? 'bg-brand-subtle font-medium text-brand' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'"
                (click)="apply(preset.range())"
              >
                {{ preset.label }}
              </button>
            </li>
          }
        </ul>
        <div>
          <amc-calendar [range]="true" [start]="draft().from" [end]="draft().to" [(view)]="view" (pick)="pick($event)" />
          <p class="border-t border-line px-3 py-2 text-xs text-ink-muted">
            {{ draft().from && !draft().to ? 'Select an end date' : 'Select a start date' }}
          </p>
        </div>
      </div>
    </amc-popover>
  `,
})
export class DateRangePicker implements ControlValueAccessor {
  readonly value = model<DateRange>(EMPTY_RANGE);
  readonly placeholder = input('Any date');
  readonly inputId = input('');
  readonly ariaLabel = input('');

  protected readonly open = signal(false);
  protected readonly disabled = signal(false);
  protected readonly draft = linkedSignal(() => this.value());
  protected readonly view = linkedSignal(() => parseIsoDate(this.value().from) ?? new Date());
  protected readonly label = computed(() => rangeLabel(this.value()));
  protected readonly presets = RANGE_PRESETS;
  protected readonly empty = EMPTY_RANGE;
  protected readonly triggerClass = TRIGGER;
  private onChange: (value: DateRange) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: DateRange | null): void {
    this.value.set(value ?? EMPTY_RANGE);
  }
  registerOnChange(fn: (value: DateRange) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected pick(iso: string): void {
    const { from, to } = this.draft();
    if (!from || to) {
      this.draft.set({ from: iso, to: '' });
      return;
    }
    this.apply(iso < from ? { from: iso, to: from } : { from, to: iso });
  }

  protected apply(range: DateRange): void {
    this.value.set(range);
    this.onChange(range);
    this.onTouched();
    this.open.set(false);
  }
}
