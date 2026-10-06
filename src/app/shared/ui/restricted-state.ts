import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from './icon';

/** Inline panel shown in place of content the user is not permitted to see. */
@Component({
  selector: 'amc-restricted-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col items-center px-6 py-12 text-center" role="status">
      <span class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-muted text-ink-muted">
        <amc-icon name="lock" [size]="20" />
      </span>
      <h3 class="text-sm font-semibold text-ink">{{ title() }}</h3>
      <p class="mt-1 max-w-sm text-sm text-ink-muted">{{ message() }}</p>
      @if (permission()) {
        <p class="mt-3 text-xs text-ink-subtle">
          Required permission: <span class="rounded bg-surface-sunken px-1.5 py-0.5 font-mono">{{ permission() }}</span>
        </p>
      }
      <div class="mt-4 flex flex-wrap justify-center gap-2"><ng-content /></div>
    </div>
  `,
})
export class RestrictedState {
  readonly title = input('You don’t have access to this');
  readonly message = input('Ask your administrator to grant you access if you need it.');
  readonly permission = input('');
}

/** Banner explaining that the current view is read-only. */
@Component({
  selector: 'amc-read-only-banner',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-center gap-3 rounded-xl border border-line-strong bg-surface-sunken p-3.5" role="status">
      <amc-icon name="lock" [size]="16" class="shrink-0 text-ink-muted" />
      <p class="flex-1 text-sm text-ink-muted">
        <span class="font-medium text-ink">Read-only access.</span> {{ message() }}
      </p>
      <ng-content />
    </div>
  `,
})
export class ReadOnlyBanner {
  readonly message = input('You can view this information but not make changes.');
}
