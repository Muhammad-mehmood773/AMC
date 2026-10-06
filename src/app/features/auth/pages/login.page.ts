import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthError, AuthService, DEMO_ACCOUNT } from '@core/auth/auth.service';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PasswordInput } from '@shared/ui/password-input';
import { Spinner } from '@shared/ui/spinner';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'amc-login-page',
  imports: [FormField, Icon, PasswordInput, ReactiveFormsModule, RouterLink, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
    <p class="mt-1 text-sm text-ink-muted">Welcome back. Enter your details to continue.</p>

    @if (error(); as message) {
      <p class="mt-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger" role="alert">
        <amc-icon name="alert-circle" class="mt-0.5 shrink-0" />
        {{ message }}
      </p>
    }

    <form [formGroup]="form" class="mt-6 space-y-4" novalidate (ngSubmit)="submit()">
      <amc-form-field label="Email" for="login-email" [control]="form.controls.email">
        <input id="login-email" type="email" class="amc-input" formControlName="email" autocomplete="username" placeholder="name@company.com" />
      </amc-form-field>
      <amc-form-field label="Password" for="login-password" [control]="form.controls.password">
        <amc-password-input inputId="login-password" formControlName="password" />
      </amc-form-field>
      <div class="flex justify-end">
        <a routerLink="/auth/forgot-password" class="amc-link text-sm">Forgot password?</a>
      </div>
      <button type="submit" class="amc-btn-primary w-full" [disabled]="busy()">
        @if (busy()) {
          <amc-spinner [size]="14" />
        }
        Sign in
      </button>
    </form>

    <div class="mt-6 rounded-lg bg-surface-sunken px-3 py-2.5 text-xs text-ink-muted">
      <p class="font-medium text-ink">Demo account</p>
      <p class="mt-0.5 font-mono">{{ demo.email }} · {{ demo.password }}</p>
      <button type="button" class="mt-1.5 font-medium text-brand hover:underline" (click)="fillDemo()">Fill demo credentials</button>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly returnUrl = input<string>();

  protected readonly demo = DEMO_ACCOUNT;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', Validators.required),
  });

  protected fillDemo(): void {
    this.form.setValue({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    this.error.set(null);
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const { email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.auth.login(email, password));
      const target = this.returnUrl();
      await this.router.navigateByUrl(target?.startsWith('/') && !target.startsWith('//') ? target : '/app');
    } catch (error) {
      if (error instanceof AuthError && error.code === 'account-locked') {
        await this.router.navigate(['/auth/account-locked'], { queryParams: { email } });
        return;
      }
      const left = error instanceof AuthError ? error.attemptsLeft : undefined;
      this.error.set(`${(error as Error).message}${left !== undefined ? ` ${left} attempt${left === 1 ? '' : 's'} left before the account is locked.` : ''}`);
      this.form.controls.password.reset('');
    } finally {
      this.busy.set(false);
    }
  }
}
