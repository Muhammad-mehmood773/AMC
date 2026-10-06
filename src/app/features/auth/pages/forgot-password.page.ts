import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { Spinner } from '@shared/ui/spinner';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'amc-forgot-password-page',
  imports: [FormField, Icon, ReactiveFormsModule, RouterLink, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sent()) {
      <div class="text-center">
        <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ok-subtle text-ok"><amc-icon name="mail" [size]="22" /></span>
        <h1 class="mt-4 text-xl font-semibold tracking-tight text-ink">Check your email</h1>
        <p class="mt-2 text-sm text-ink-muted">
          If an account exists for <span class="font-medium text-ink">{{ form.controls.email.value }}</span>, we’ve sent a link to reset your password. It expires in 30 minutes.
        </p>
        <a routerLink="/auth/reset-password" [queryParams]="{ token: 'demo' }" class="amc-btn-secondary mt-6 w-full">Open demo reset link</a>
        <button type="button" class="mt-3 text-sm font-medium text-brand hover:underline" (click)="sent.set(false)">Use a different email</button>
      </div>
    } @else {
      <h1 class="text-xl font-semibold tracking-tight text-ink">Forgot your password?</h1>
      <p class="mt-1 text-sm text-ink-muted">Enter your email and we’ll send you a link to reset it.</p>
      <form [formGroup]="form" class="mt-6 space-y-4" novalidate (ngSubmit)="submit()">
        <amc-form-field label="Email" for="fp-email" [control]="form.controls.email">
          <input id="fp-email" type="email" class="amc-input" formControlName="email" autocomplete="username" placeholder="name@company.com" />
        </amc-form-field>
        <button type="submit" class="amc-btn-primary w-full" [disabled]="busy()">
          @if (busy()) {
            <amc-spinner [size]="14" />
          }
          Send reset link
        </button>
      </form>
    }
    <a routerLink="/auth/login" class="mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
      <amc-icon name="arrow-left" [size]="14" /> Back to sign in
    </a>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.auth.requestPasswordReset(this.form.controls.email.value));
      this.sent.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
