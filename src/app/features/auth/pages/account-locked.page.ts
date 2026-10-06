import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, MAX_FAILED_ATTEMPTS } from '@core/auth/auth.service';
import { NotificationPort } from '@core/notification/notification.port';
import { Icon } from '@shared/ui/icon';
import { Spinner } from '@shared/ui/spinner';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'amc-account-locked-page',
  imports: [Icon, RouterLink, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="text-center">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-subtle text-danger"><amc-icon name="lock" [size]="22" /></span>
      <h1 class="mt-4 text-xl font-semibold tracking-tight text-ink">Account locked</h1>
      <p class="mt-2 text-sm text-ink-muted">
        {{ email() ? email() + ' was' : 'This account was' }} locked after {{ max }} unsuccessful sign-in attempts to keep it secure.
        Reset your password or contact your administrator to regain access.
      </p>
      <a routerLink="/auth/forgot-password" class="amc-btn-primary mt-6 w-full">Reset password</a>
      <a routerLink="/auth/login" class="amc-btn-secondary mt-2 w-full">Back to sign in</a>
      @if (email()) {
        <button type="button" class="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink" [disabled]="busy()" (click)="unlock()">
          @if (busy()) {
            <amc-spinner [size]="12" />
          }
          Demo only: unlock this account
        </button>
      }
    </div>
  `,
})
export class AccountLockedPage {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationPort);

  readonly email = input<string>();
  protected readonly max = MAX_FAILED_ATTEMPTS;
  protected readonly busy = signal(false);

  protected async unlock(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.auth.unlock(this.email()!));
      this.notify.success('Account unlocked. You can sign in again.');
    } finally {
      this.busy.set(false);
    }
  }
}
