import { ChangeDetectionStrategy, Component, computed, forwardRef, inject, input, signal } from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { LookupValue } from '@shared/lookups/lookup';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { Icon } from './icon';
import { LookupDialog } from './lookup-dialog';
import { type ChoiceValue, Select } from './select';

/**
 * Select bound to a lookup type. When the type is configured as editable, inline Add (+) and
 * Edit actions open the shared lookup dialog; otherwise it behaves as a plain select.
 * The control value is the lookup value's name.
 */
@Component({
  selector: 'amc-lookup-select',
  imports: [Icon, LookupDialog, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LookupSelect), multi: true }],
  host: { class: 'group/field block min-w-0', '(focusout)': 'onTouched()' },
  template: `
    <div class="flex min-w-0 items-stretch gap-1.5">
      <amc-select
        class="min-w-0 flex-1"
        [inputId]="inputId()"
        [options]="options()"
        [placeholder]="placeholder() || 'Select ' + label().toLowerCase() + '…'"
        [clearable]="clearable()"
        [value]="value()"
        [forceDisabled]="disabled()"
        (selectionChange)="choose($event)"
      />
      @if (editable()) {
        <div
          class="flex shrink-0 items-stretch self-stretch overflow-hidden rounded-lg border border-line-strong bg-surface shadow-xs"
          role="group"
          [attr.aria-label]="label() + ' list actions'"
        >
          <button
            type="button"
            class="cursor-pointer disabled:cursor-not-allowed flex w-9 items-center justify-center text-ink-muted transition-colors hover:bg-surface-sunken hover:text-brand focus-visible:bg-surface-sunken focus-visible:text-brand focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
            [disabled]="disabled()"
            [attr.aria-label]="'Add ' + label().toLowerCase()"
            [attr.title]="'Add ' + label().toLowerCase()"
            (click)="openCreate()"
          >
            <amc-icon  name="plus" [size]="16" />
          </button>
          <span class="w-px bg-line" aria-hidden="true"></span>
          <button
            type="button"
            class="cursor-pointer disabled:cursor-not-allowed flex w-9 items-center justify-center text-ink-muted transition-colors hover:bg-surface-sunken hover:text-brand focus-visible:bg-surface-sunken focus-visible:text-brand focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
            [disabled]="editDisabledReason() !== null"
            [attr.aria-label]="'Edit selected ' + label().toLowerCase()"
            [attr.title]="editDisabledReason() ?? 'Edit “' + value() + '”'"
            (click)="openEdit()"
          >
            <amc-icon name="pencil" [size]="14" />
          </button>
        </div>
      }
    </div>
    @if (editable()) {
      <amc-lookup-dialog [type]="type()" [value]="editing()" [(open)]="dialogOpen" (saved)="onSaved($event)" />
    }
  `,
})
export class LookupSelect implements ControlValueAccessor {
  private readonly store = inject(LookupValuesStore);

  readonly type = input.required<string>();
  readonly inputId = input('');
  readonly placeholder = input('');
  readonly clearable = input(false);

  protected readonly value = signal<string>('');
  protected readonly disabled = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<LookupValue | null>(null);

  protected readonly label = computed(() => this.store.definition(this.type()).label);
  protected readonly editable = computed(() => this.store.isEditable(this.type()));
  protected readonly selected = computed(() => this.store.find(this.type(), this.value()));
  protected readonly options = computed(() => {
    const options = this.store.options(this.type())();
    const current = this.value();
    // Keep a value that is inactive or not yet loaded visible for existing records.
    return current && !options.some((o) => o.value === current) ? [...options, { value: current, label: current }] : options;
  });
  protected readonly editDisabledReason = computed(() => {
    if (this.disabled()) return 'Field is read-only';
    if (!this.value()) return `Select a ${this.label().toLowerCase()} to edit it`;
    if (this.selected()?.isSystem) return 'System value — used by business rules and cannot be renamed';
    if (!this.selected()) return 'This value cannot be edited';
    return null;
  });

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

  protected choose(value: ChoiceValue | null): void {
    const next = value === null ? '' : String(value);
    this.value.set(next);
    this.onChange(next);
    this.onTouched();
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.dialogOpen.set(true);
  }

  protected openEdit(): void {
    const selected = this.selected();
    if (!selected || this.editDisabledReason()) return;
    this.editing.set(selected);
    this.dialogOpen.set(true);
  }

  protected onSaved(saved: LookupValue): void {
    const previous = this.editing();
    // New values are selected immediately; renamed values keep the field in sync.
    if (!previous || previous.name === this.value()) this.choose(saved.name);
  }
}
