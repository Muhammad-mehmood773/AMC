import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon, type IconName } from './icon';

@Component({
  selector: 'amc-empty-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col items-center text-center"
      [class]="compact() ? 'px-4 py-8' : 'px-6 py-14'"
    >
      <!-- Illustration area -->
      @if (!compact()) {
        <div class="relative mb-6 flex h-28 w-28 items-center justify-center">
          <!-- Dot-grid background -->
          <svg class="absolute inset-0 h-full w-full text-line opacity-60" aria-hidden="true">
            <defs>
              <pattern id="dotgrid" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                <circle cx="1.5" cy="1.5" r="1" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dotgrid)" rx="16" />
          </svg>
          <!-- Outer ring -->
          <div class="absolute h-20 w-20 rounded-2xl border-2 border-dashed border-line-strong opacity-50"></div>
          <!-- Icon card -->
          <div
            class="relative flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-surface shadow-sm"
          >
            <amc-icon [name]="icon()" [size]="26" class="text-brand" />
          </div>
        </div>
      } @else {
        <div class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-muted text-ink-muted shadow-xs">
          <amc-icon [name]="icon()" [size]="20" />
        </div>
      }

      <h3 class="text-sm font-semibold text-ink">{{ title() }}</h3>
      <p class="mt-1 max-w-sm text-sm text-ink-muted">{{ message() }}</p>
      <div class="mt-4 flex flex-wrap justify-center gap-2 empty:hidden">
        @if (actionLabel()) {
          <button type="button" class="amc-btn-primary" (click)="action.emit()">
            <amc-icon name="plus" />
            {{ actionLabel() }}
          </button>
        }
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly icon = input<IconName>('inbox');
  readonly actionLabel = input<string>('');
  readonly compact = input(false);
  readonly action = output<void>();
}
