import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Icon } from '@shared/ui/icon';

@Component({
  selector: 'amc-auth-layout',
  imports: [Icon, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10' },
  template: `
    <div class="mb-6 flex items-center gap-3">
      <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm">
        <amc-icon name="shield-check" [size]="20" [strokeWidth]="2" />
      </span>
      <span class="leading-tight">
        <span class="block text-base font-semibold tracking-tight text-ink">AMC Platform</span>
        <span class="block text-xs text-ink-muted">Contract &amp; Field Service</span>
      </span>
    </div>
    <main class="amc-card w-full max-w-md p-6 sm:p-8">
      <router-outlet />
    </main>
    <p class="mt-6 text-xs text-ink-subtle">© {{ year }} AMC Platform. All rights reserved.</p>
  `,
})
export class AuthLayout {
  protected readonly year = new Date().getFullYear();
}
