import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'amc-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      [class]="toneClass()"
    >
      {{ label() }}
    </span>
  `,
})
export class StatusBadge {
  readonly label = input.required<string>();
  readonly tone = input<'neutral' | 'ok' | 'warn' | 'danger' | 'brand'>('neutral');

  protected toneClass(): string {
    switch (this.tone()) {
      case 'ok':
        return 'bg-ok-subtle text-ok';
      case 'warn':
        return 'bg-warn-subtle text-warn';
      case 'danger':
        return 'bg-danger-subtle text-danger';
      case 'brand':
        return 'bg-brand-subtle text-brand';
      default:
        return 'bg-surface-muted text-ink-muted';
    }
  }
}
