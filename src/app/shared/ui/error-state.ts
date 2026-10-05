import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'amc-error-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center px-6 py-12 text-center" role="alert">
      <div
        class="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-danger-subtle text-danger"
      >
        <amc-icon name="alert-triangle" [size]="20" />
      </div>
      <h3 class="text-sm font-semibold text-ink">{{ title() }}</h3>
      <p class="mt-1 max-w-sm text-sm text-ink-muted">{{ message() }}</p>
      <button type="button" class="amc-btn-secondary mt-4" (click)="retry.emit()">
        <amc-icon name="refresh" />
        Try again
      </button>
    </div>
  `,
})
export class ErrorState {
  readonly title = input('Something went wrong');
  readonly message = input('We could not load this data. Check your connection and try again.');
  readonly retry = output<void>();
}
