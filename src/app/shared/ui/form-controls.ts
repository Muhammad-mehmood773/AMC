import { ChangeDetectionStrategy, Component, forwardRef, input, model, signal } from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { SelectOption } from '@shared/models/select-option';
import { Icon } from './icon';

/** Toggle switch bound to a boolean form control. */
@Component({
  selector: 'amc-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Switch), multi: true }],
  host: { class: 'block' },
  template: `
    <button
      type="button"
      role="switch"
      class="group flex w-full items-start gap-3 rounded-lg text-left disabled:cursor-not-allowed disabled:opacity-50"
      [attr.id]="inputId() || null"
      [attr.aria-checked]="checked()"
      [disabled]="disabled()"
      (click)="toggle()"
      (blur)="onTouched()"
    >
      <span
        class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors group-focus-visible:ring-4 group-focus-visible:ring-brand-ring"
        [class]="checked() ? 'bg-brand' : 'bg-line-strong'"
      >
        <span
          class="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
          [class]="checked() ? 'translate-x-[18px]' : 'translate-x-0.5'"
        ></span>
      </span>
      @if (label()) {
        <span class="min-w-0">
          <span class="block text-sm font-medium text-ink">{{ label() }}</span>
          @if (description()) {
            <span class="block text-xs text-ink-muted">{{ description() }}</span>
          }
        </span>
      }
    </button>
  `,
})
export class Switch implements ControlValueAccessor {
  readonly label = input('');
  readonly description = input('');
  readonly inputId = input('');

  /** Usable as a form control or standalone via [(checked)]. */
  readonly checked = model(false);
  protected readonly disabled = signal(false);
  private onChange: (value: boolean) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: boolean | null): void {
    this.checked.set(!!value);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected toggle(): void {
    this.checked.update((value) => !value);
    this.onChange(this.checked());
    this.onTouched();
  }
}

/** Multi-select rendered as toggleable chips, bound to a `string[]` form control. */
@Component({
  selector: 'amc-chip-select',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ChipSelect), multi: true },
  ],
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="ariaLabel()">
      @for (option of options(); track option.value) {
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          [class]="
            isSelected(option.value)
              ? 'border-brand bg-brand-subtle text-brand'
              : 'border-line-strong bg-surface text-ink-muted hover:border-ink-subtle hover:text-ink'
          "
          [attr.aria-pressed]="isSelected(option.value)"
          [disabled]="disabled()"
          (click)="toggle(option.value)"
        >
          @if (isSelected(option.value)) {
            <amc-icon name="check" [size]="13" />
          }
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class ChipSelect implements ControlValueAccessor {
  readonly options = input.required<readonly SelectOption[]>();
  readonly ariaLabel = input('');

  protected readonly selected = signal<readonly string[]>([]);
  protected readonly disabled = signal(false);
  private onChange: (value: string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: readonly string[] | null): void {
    this.selected.set(value ?? []);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected isSelected(value: string): boolean {
    return this.selected().includes(value);
  }

  protected toggle(value: string): void {
    const order = this.options().map((option) => option.value);
    const next = this.isSelected(value)
      ? this.selected().filter((item) => item !== value)
      : [...this.selected(), value].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    this.selected.set(next);
    this.onChange([...next]);
    this.onTouched();
  }
}
