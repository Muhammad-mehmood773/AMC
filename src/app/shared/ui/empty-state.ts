import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'amc-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="amc-card flex flex-col items-center px-6 py-12 text-center">
      <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M3 7h18M5 7v12a2 2 0 002 2h10a2 2 0 002-2V7"
          />
        </svg>
      </div>
      <h2 class="text-base font-semibold">{{ title() }}</h2>
      <p class="mt-1 max-w-md text-sm text-ink-muted">{{ message() }}</p>
      @if (actionLabel()) {
        <button type="button" class="amc-btn-primary mt-4" (click)="action.emit()">
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly actionLabel = input<string>('');
  readonly action = output<void>();
}
