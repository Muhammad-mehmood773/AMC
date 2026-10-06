import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors, Validators } from '@angular/forms';
import { NotificationPort } from '@core/notification/notification.port';
import type { LookupValue } from '@shared/lookups/lookup';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { map, startWith } from 'rxjs';
import { Dialog } from './dialog';
import { FormField } from './form-field';
import { Icon } from './icon';
import { Spinner } from './spinner';

const DEFAULT_MAX_LENGTH = 80;

/**
 * Generic create / edit dialog for any user-maintainable lookup type. The lookup context
 * (type key → label, limits) comes from the `LOOKUP_TYPES` registry via `LookupValuesStore`.
 */
@Component({
  selector: 'amc-lookup-dialog',
  imports: [Dialog, FormField, Icon, ReactiveFormsModule, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog size="sm" [title]="title()" [description]="description()" [dismissible]="!saving()" [(open)]="open">
      <div class="space-y-4">
        <amc-form-field
          label="Name"
          [for]="inputId"
          [control]="name"
          [corner]="nameLength() + ' / ' + maxLength()"
          [messages]="messages()"
        >
          <input
            [id]="inputId"
            class="amc-input"
            autocomplete="off"
            [formControl]="name"
            [maxlength]="maxLength()"
            [placeholder]="'e.g. ' + example()"
            (keydown.enter)="onEnter($event)"
          />
        </amc-form-field>

        @if (value(); as current) {
          <p class="flex gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
            <amc-icon name="info" [size]="14" class="mt-px shrink-0" />
            Renaming “{{ current.name }}” updates every record that uses this {{ definition().label.toLowerCase() }}.
          </p>
        } @else if (existing().length) {
          <div>
            <p class="text-xs font-medium text-ink-muted">Existing values ({{ existing().length }})</p>
            <div class="mt-1.5 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              @for (v of existing(); track v.id) {
                <span class="rounded-md bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted" [class.line-through]="v.status === 'Inactive'">{{ v.name }}</span>
              }
            </div>
          </div>
        }

        @if (error()) {
          <p class="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">
            <amc-icon name="alert-circle" class="mt-0.5 shrink-0" />
            {{ error() }}
          </p>
        }
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" [disabled]="saving()" (click)="open.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary min-w-24" [disabled]="saving() || unchanged()" (click)="save()">
          @if (saving()) {
            <amc-spinner [size]="14" />
          }
          {{ value() ? 'Save changes' : 'Add' }}
        </button>
      </ng-container>
    </amc-dialog>
  `,
})
export class LookupDialog {
  private readonly store = inject(LookupValuesStore);
  private readonly notify = inject(NotificationPort);

  readonly open = model(false);
  readonly type = input.required<string>();
  /** Value being edited; null for create mode. */
  readonly value = input<LookupValue | null>(null);
  readonly saved = output<LookupValue>();

  protected readonly inputId = `amc-lookup-name-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly definition = computed(() => this.store.definition(this.type()));
  protected readonly maxLength = computed(() => this.definition().maxLength ?? DEFAULT_MAX_LENGTH);
  protected readonly existing = computed(() => this.store.valuesOf(this.type())());
  protected readonly example = computed(() => this.existing()[0]?.name ?? this.definition().label);
  protected readonly title = computed(() => `${this.value() ? 'Edit' : 'Add'} ${this.definition().label.toLowerCase()}`);
  protected readonly description = computed(
    () => this.definition().description ?? `Available in every form that uses the ${this.definition().label.toLowerCase()} list.`,
  );
  protected readonly messages = computed(() => ({
    duplicate: `A ${this.definition().label.toLowerCase()} with this name already exists.`,
    whitespace: 'Name cannot be blank.',
  }));

  protected readonly name = inject(NonNullableFormBuilder).control('', [
    Validators.required,
    (control: AbstractControl): ValidationErrors | null =>
      control.value && !String(control.value).trim() ? { whitespace: true } : null,
    (control: AbstractControl): ValidationErrors | null =>
      control.value && this.store.isDuplicate(this.type(), String(control.value), this.value()?.id) ? { duplicate: true } : null,
  ]);
  private readonly nameValue = toSignal(this.name.valueChanges.pipe(startWith(''), map(() => this.name.value)), { initialValue: '' });
  protected readonly nameLength = computed(() => this.nameValue().length);
  protected readonly unchanged = computed(() => !!this.value() && this.nameValue().trim() === this.value()!.name);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.error.set(null);
        this.name.reset(this.value()?.name ?? '');
        // Move focus to the name field once the native dialog has opened.
        setTimeout(() => document.getElementById(this.inputId)?.focus());
      });
    });
  }

  protected onEnter(event: Event): void {
    // Prevent implicit submission of any enclosing form.
    event.preventDefault();
    void this.save();
  }

  protected async save(): Promise<void> {
    this.name.markAsTouched();
    this.name.updateValueAndValidity();
    if (this.name.invalid || this.saving() || this.unchanged()) return;
    const label = this.definition().label.toLowerCase();
    const current = this.value();
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = current ? await this.store.rename(current.id, this.name.value) : await this.store.create(this.type(), this.name.value);
      this.notify.success(`${current ? 'Updated' : 'Added'} ${label} “${result.name}”.`);
      this.saved.emit(result);
      this.open.set(false);
    } catch (error) {
      this.error.set((error as Error).message || `The ${label} could not be saved.`);
    } finally {
      this.saving.set(false);
    }
  }
}
