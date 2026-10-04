import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'amc-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="amc-card p-4">
      <p class="text-xs font-semibold tracking-wide text-ink-muted uppercase">{{ label() }}</p>
      <p class="mt-2 text-2xl font-semibold tracking-tight">{{ value() }}</p>
      @if (hint()) {
        <p class="mt-1 text-xs text-ink-muted">{{ hint() }}</p>
      }
    </article>
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>('');
}
