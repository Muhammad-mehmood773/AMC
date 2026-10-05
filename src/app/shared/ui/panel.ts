import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, type IconName } from './icon';

/** Titled content card used for grouped information, widgets and form sections. */
@Component({
  selector: 'amc-panel',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="amc-card flex h-full flex-col overflow-hidden">
      @if (title()) {
        <header
          class="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5"
        >
          <div class="flex min-w-0 items-center gap-3">
            @if (icon(); as name) {
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted"
              >
                <amc-icon [name]="name" />
              </span>
            }
            <div class="min-w-0">
              <h2 class="truncate text-sm font-semibold text-ink">{{ title() }}</h2>
              @if (description()) {
                <p class="truncate text-xs text-ink-muted">{{ description() }}</p>
              }
            </div>
          </div>
          <div class="flex items-center gap-2 empty:hidden">
            <ng-content select="[panelActions]" />
          </div>
        </header>
      }
      <div class="flex-1" [class]="padded() ? 'p-4 sm:p-5' : ''">
        <ng-content />
      </div>
    </section>
  `,
})
export class Panel {
  readonly title = input('');
  readonly description = input('');
  readonly icon = input<IconName | null>(null);
  readonly padded = input(true);
}
