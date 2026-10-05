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
      <div
        class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-muted text-ink-muted shadow-xs"
      >
        <amc-icon [name]="icon()" [size]="20" />
      </div>
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
