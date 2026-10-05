import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Read-only label/value pair for detail views. Renders an em dash for empty values. */
@Component({
  selector: 'amc-detail-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <dt class="text-xs font-medium text-ink-muted">{{ label() }}</dt>
    <dd class="mt-1 text-sm break-words text-ink" [class.font-mono]="mono()">
      @if (value() !== null && value() !== undefined && value() !== '') {
        {{ value() }}
      } @else {
        <span class="text-ink-subtle">—</span>
      }
    </dd>
  `,
})
export class DetailItem {
  readonly label = input.required<string>();
  readonly value = input<string | number | null | undefined>(null);
  readonly mono = input(false);
}
