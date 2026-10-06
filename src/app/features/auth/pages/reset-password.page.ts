import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { NotificationPort } from '@core/notification/notification.port';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PasswordInput } from '@shared/ui/password-input';
import { Spinner } from '@shared/ui/spinner';
import { firstValueFrom, map, startWith } from 'rxjs';

const RULES = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'An uppercase and a lowercase letter', test: (v: string) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: 'A number', test: (v: string) => /\d/.test(v) },
  { label: 'A special character', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

const strong = (control: AbstractControl): ValidationErrors | null =>
  RULES.every((r) => r.test(String(control.value ?? ''))) ? null : { weak: 'Password does not meet all requirements.' };

@Component({
  selector: 'amc-reset-password-page',
  imports: [FormField, Icon, PasswordInput, ReactiveFormsModule, RouterLink, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-xl font-semibold tracking-tight text-ink">Set a new password</h1>
    <p class="mt-1 text-sm text-ink-muted">Choose a strong password you haven’t used before.</p>

    @if (error(); as message) {
      <p class="mt-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger" role="alert">
        <amc-icon name="alert-circle" class="mt-0.5 shrink-0" />
        <span>{{ message }} <a routerLink="/auth/forgot-password" class="font-medium underline">Request a new link</a></span>
      </p>
    }

    <form [formGroup]="form" class="mt-6 space-y-4" novalidate (ngSubmit)="submit()">
      <amc-form-field label="New password" for="rp-password" [control]="form.controls.password">
        <amc-password-input inputId="rp-password" formControlName="password" autocomplete="new-password" />
      </amc-form-field>
      <ul class="space-y-1 text-xs" aria-label="Password requirements">
        @for (rule of rules(); track rule.label) {
          <li class="flex items-center gap-1.5" [class]="rule.ok ? 'text-ok' : 'text-ink-muted'">
            <amc-icon [name]="rule.ok ? 'check-circle' : 'clock'" [size]="13" />{{ rule.label }}
          </li>
        }
      </ul>
      <amc-form-field label="Confirm password" for="rp-confirm" [control]="form.controls.confirm" [messages]="{ mismatch: 'Passwords do not match.' }">
        <amc-password-input inputId="rp-confirm" formControlName="confirm" autocomplete="new-password" />
      </amc-form-field>
      <button type="submit" class="amc-btn-primary w-full" [disabled]="busy()">
        @if (busy()) {
          <amc-spinner [size]="14" />
        }
        Reset password
      </button>
    </form>
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);

  /** Reset token from the emailed link (`?token=`). */
  readonly token = input<string>('demo');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, strong]],
    confirm: ['', [Validators.required, (c: AbstractControl): ValidationErrors | null => (c.parent && c.value !== c.parent.get('password')?.value ? { mismatch: true } : null)]],
  });

  private readonly password = toSignal(this.form.controls.password.valueChanges.pipe(startWith(''), map(() => this.form.controls.password.value)), { initialValue: '' });
  protected readonly rules = computed(() => RULES.map((r) => ({ label: r.label, ok: r.test(this.password()) })));

  constructor() {
    this.form.controls.password.valueChanges.subscribe(() => this.form.controls.confirm.updateValueAndValidity());
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.auth.resetPassword(this.token(), this.form.controls.password.value));
      this.notify.success('Your password has been reset. Please sign in.', 'Password updated');
      await this.router.navigate(['/auth/login']);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
