import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationPort, type NotificationKind } from '@core/notification/notification.port';
import { Icon, type IconName } from './icon';

const KIND_STYLE: Record<NotificationKind, { readonly icon: IconName; readonly tone: string }> = {
  success: { icon: 'check-circle', tone: 'text-ok' },
  info: { icon: 'info', tone: 'text-info' },
  warning: { icon: 'alert-triangle', tone: 'text-warn' },
  error: { icon: 'alert-circle', tone: 'text-danger' },
};

/** Renders notifications from `NotificationPort`. Mount once at application level. */
@Component({
  selector: 'amc-toast-host',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:top-auto sm:right-5 sm:bottom-5 sm:items-end"
      aria-live="polite"
      aria-relevant="additions"
    >
      @for (toast of notifications.notifications(); track toast.id) {
        <div
          class="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-pop"
          role="status"
        >
          <amc-icon
            [name]="style[toast.kind].icon"
            [size]="18"
            class="mt-0.5"
            [class]="style[toast.kind].tone"
          />
          <div class="min-w-0 flex-1">
            @if (toast.title) {
              <p class="text-sm font-semibold text-ink">{{ toast.title }}</p>
            }
            <p class="text-sm text-ink-muted" [class.mt-0.5]="!!toast.title">{{ toast.message }}</p>
          </div>
          <button
            type="button"
            class="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-sunken hover:text-ink"
            aria-label="Dismiss notification"
            (click)="notifications.dismiss(toast.id)"
          >
            <amc-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly notifications = inject(NotificationPort);
  protected readonly style = KIND_STYLE;
}
