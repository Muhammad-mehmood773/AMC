import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '@shared/ui/icon';

@Component({
  selector: 'amc-session-expired-page',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="text-center">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warn-subtle text-warn"><amc-icon name="clock" [size]="22" /></span>
      <h1 class="mt-4 text-xl font-semibold tracking-tight text-ink">Your session has expired</h1>
      <p class="mt-2 text-sm text-ink-muted">For your security you were signed out after a period of inactivity. Sign in again to pick up where you left off.</p>
      <a routerLink="/auth/login" [queryParams]="returnUrl() ? { returnUrl: returnUrl() } : {}" class="amc-btn-primary mt-6 w-full">Sign in again</a>
    </div>
  `,
})
export class SessionExpiredPage {
  readonly returnUrl = input<string>();
}
