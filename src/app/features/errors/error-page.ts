import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { IconName } from '@shared/ui/icon';
import { Icon } from '@shared/ui/icon';
import { StatusPage, type StatusTone } from '@shared/ui/status-page';

interface ErrorPageConfig {
  readonly icon: IconName;
  readonly tone: StatusTone;
  readonly title: string;
  readonly message: string;
  readonly code?: string;
  /** Primary action. */
  readonly primary: 'home' | 'login' | 'retry';
}

const PAGES: Record<string, ErrorPageConfig> = {
  '400': { code: '400', icon: 'alert-circle', tone: 'warn', title: 'Bad request', message: 'The link or request could not be understood. Check the address and try again.', primary: 'home' },
  '401': { code: '401', icon: 'lock', tone: 'warn', title: 'Sign in required', message: 'You need to sign in to view this page. Your session may have expired.', primary: 'login' },
  '403': { code: '403', icon: 'shield-check', tone: 'danger', title: 'Access denied', message: 'You don’t have permission to view this page. Contact your administrator if you think this is a mistake.', primary: 'home' },
  '404': { code: '404', icon: 'search', tone: 'info', title: 'Page not found', message: 'The page you are looking for doesn’t exist or has been moved.', primary: 'home' },
  '409': { code: '409', icon: 'refresh', tone: 'warn', title: 'Conflicting change', message: 'This record was changed by someone else while you were working. Reload to see the latest version.', primary: 'retry' },
  '429': { code: '429', icon: 'clock', tone: 'warn', title: 'Too many requests', message: 'You’ve made too many requests in a short time. Please wait a moment and try again.', primary: 'retry' },
  '500': { code: '500', icon: 'alert-triangle', tone: 'danger', title: 'Something went wrong', message: 'An unexpected error occurred on our side. Our team has been notified — please try again.', primary: 'retry' },
  '502': { code: '502', icon: 'alert-triangle', tone: 'danger', title: 'Bad gateway', message: 'We received an invalid response from an upstream service. Please try again shortly.', primary: 'retry' },
  '503': { code: '503', icon: 'wrench', tone: 'warn', title: 'Service unavailable', message: 'The service is temporarily unavailable or overloaded. Please try again in a few minutes.', primary: 'retry' },
  '504': { code: '504', icon: 'clock', tone: 'warn', title: 'Gateway timeout', message: 'The server took too long to respond. Please try again.', primary: 'retry' },
  maintenance: { icon: 'wrench', tone: 'info', title: 'Scheduled maintenance', message: 'We’re making improvements and will be back shortly. Thank you for your patience.', primary: 'retry' },
  offline: { icon: 'wifi-off', tone: 'warn', title: 'You are offline', message: 'Check your internet connection and try again.', primary: 'retry' },
};

/** One component for every system error page; content is configuration keyed by `code`. */
@Component({
  selector: 'amc-error-page',
  imports: [Icon, RouterLink, StatusPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-status-page [icon]="page().icon" [tone]="page().tone" [code]="page().code ?? ''" [title]="page().title" [message]="page().message" [reference]="ref() ?? ''">
      @switch (page().primary) {
        @case ('login') {
          <button type="button" class="amc-btn-secondary" (click)="back()"><amc-icon name="arrow-left" />Go back</button>
          <a routerLink="/auth/login" class="amc-btn-primary">Sign in</a>
        }
        @case ('retry') {
          <a routerLink="/app" class="amc-btn-secondary"><amc-icon name="layout-dashboard" />Dashboard</a>
          <button type="button" class="amc-btn-primary" (click)="reload()"><amc-icon name="refresh" />Try again</button>
        }
        @default {
          <button type="button" class="amc-btn-secondary" (click)="back()"><amc-icon name="arrow-left" />Go back</button>
          <a routerLink="/app" class="amc-btn-primary"><amc-icon name="layout-dashboard" />Go to dashboard</a>
        }
      }
    </amc-status-page>
  `,
})
export class ErrorPage {
  private readonly location = inject(Location);

  /** Bound from the route (`error/:code` param or route data). */
  readonly code = input('404');
  /** Optional correlation id (`?ref=`). */
  readonly ref = input<string>();

  protected readonly page = computed(() => PAGES[this.code()] ?? PAGES['404']);

  protected back(): void {
    this.location.back();
  }

  protected reload(): void {
    location.reload();
  }
}
