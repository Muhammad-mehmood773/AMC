import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, Validators } from '@angular/forms';
import { map, of, startWith, switchMap } from 'rxjs';
import { type FieldHelp, FieldInfo } from './field-info';
import { Icon } from './icon';

interface ControlSnapshot {
  readonly showError: boolean;
  readonly errors: Readonly<Record<string, unknown>> | null;
  readonly pending: boolean;
  readonly required: boolean;
}

export type FieldErrorMessages = Readonly<Record<string, string>>;

/**
 * Standard field wrapper: label, required marker, helper text, async/pending hint and
 * validation message derived from the bound control.
 */
@Component({
  selector: 'amc-form-field',
  imports: [FieldInfo, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="flex flex-col gap-1.5">
      @if (label()) {
        <div class="flex items-baseline justify-between gap-2">
          <span class="flex min-w-0 items-center gap-1">
            <label [for]="for()" class="amc-label">
              {{ label() }}
              @if (isRequired()) {
                <span class="ml-0.5 text-danger" aria-hidden="true">*</span>
              }
            </label>
            @if (help(); as content) {
              <amc-field-info [help]="content" [label]="label()" />
            }
          </span>
          @if (corner()) {
            <span class="text-xs text-ink-subtle">{{ corner() }}</span>
          }
        </div>
      }
      <ng-content />
      @if (errorMessage(); as message) {
        <p class="flex items-start gap-1.5 text-xs text-danger" role="alert" [id]="for() + '-error'">
          <amc-icon name="alert-circle" [size]="13" class="mt-px" />
          <span>{{ message }}</span>
        </p>
      } @else if (state()?.pending) {
        <p class="text-xs text-ink-muted">Checking…</p>
      } @else if (hint()) {
        <p class="text-xs text-ink-muted" [id]="for() + '-hint'">{{ hint() }}</p>
      }
    </div>
  `,
})
export class FormField {
  readonly label = input('');
  readonly for = input('');
  readonly hint = input('');
  readonly corner = input('');
  /** Optional contextual help shown in an (i) popover beside the label. */
  readonly help = input<FieldHelp | null>(null);
  readonly required = input<boolean | undefined>(undefined);
  readonly control = input<AbstractControl | null>(null);
  readonly messages = input<FieldErrorMessages>({});

  protected readonly state = toSignal(
    toObservable(this.control).pipe(
      switchMap((control) =>
        control
          ? control.events.pipe(
              startWith(null),
              map(
                (): ControlSnapshot => ({
                  showError: control.invalid && control.touched,
                  errors: control.errors,
                  pending: control.pending,
                  required: control.hasValidator(Validators.required),
                }),
              ),
            )
          : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected readonly isRequired = computed(() => this.required() ?? this.state()?.required ?? false);

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    if (!state?.showError || !state.errors) {
      return null;
    }
    const [key, detail] = Object.entries(state.errors)[0];
    return this.messages()[key] ?? describeError(key, detail, this.label() || 'This field');
  });
}

function describeError(key: string, detail: unknown, label: string): string {
  const info = (detail ?? {}) as Record<string, number>;
  switch (key) {
    case 'required':
      return `${label} is required.`;
    case 'email':
      return 'Enter a valid email address.';
    case 'minlength':
      return `Must be at least ${info['requiredLength']} characters.`;
    case 'maxlength':
      return `Must be ${info['requiredLength']} characters or fewer.`;
    case 'min':
      return `Must be ${info['min']} or greater.`;
    case 'max':
      return `Must be ${info['max']} or less.`;
    case 'pattern':
      return `${label} format is invalid.`;
    default:
      return typeof detail === 'string' ? detail : `${label} is invalid.`;
  }
}
