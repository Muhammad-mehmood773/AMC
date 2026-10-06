import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icon } from './icon';

/** Password field with show/hide toggle (form control). */
@Component({
  selector: 'amc-password-input',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PasswordInput), multi: true }],
  host: { class: 'relative block' },
  template: `
    <input
      class="amc-input pr-10"
      [id]="inputId() || null"
      [type]="visible() ? 'text' : 'password'"
      [value]="value()"
      [disabled]="disabled()"
      [attr.autocomplete]="autocomplete()"
      [placeholder]="placeholder()"
      (input)="onInput($event)"
      (blur)="onTouched()"
    />
    <button
      type="button"
      class="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-sunken hover:text-ink"
      [attr.aria-label]="visible() ? 'Hide password' : 'Show password'"
      [attr.aria-pressed]="visible()"
      (click)="visible.set(!visible())"
    >
      <amc-icon [name]="visible() ? 'eye-off' : 'eye'" [size]="16" />
    </button>
  `,
})
export class PasswordInput implements ControlValueAccessor {
  readonly inputId = input('');
  readonly placeholder = input('');
  readonly autocomplete = input('current-password');

  protected readonly visible = signal(false);
  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

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

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChange(value);
  }
}
