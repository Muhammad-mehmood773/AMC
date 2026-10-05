import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'brand' | 'info' | 'accent';

const TONE_CLASSES: Record<BadgeTone, { readonly badge: string; readonly dot: string }> = {
  neutral: { badge: 'bg-surface-sunken text-ink-muted ring-line-strong/60', dot: 'bg-ink-subtle' },
  ok: { badge: 'bg-ok-subtle text-ok ring-ok/20', dot: 'bg-ok' },
  warn: { badge: 'bg-warn-subtle text-warn ring-warn/20', dot: 'bg-warn' },
  danger: { badge: 'bg-danger-subtle text-danger ring-danger/20', dot: 'bg-danger' },
  brand: { badge: 'bg-brand-subtle text-brand ring-brand/20', dot: 'bg-brand' },
  info: { badge: 'bg-info-subtle text-info ring-info/20', dot: 'bg-info' },
  accent: { badge: 'bg-accent-subtle text-accent ring-accent/20', dot: 'bg-accent' },
};

@Component({
  selector: 'amc-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset"
      [class]="classes().badge"
    >
      @if (dot()) {
        <span class="h-1.5 w-1.5 rounded-full" [class]="classes().dot"></span>
      }
      {{ label() }}
    </span>
  `,
})
export class StatusBadge {
  readonly label = input.required<string>();
  readonly tone = input<BadgeTone>('neutral');
  readonly dot = input(true);

  protected readonly classes = computed(() => TONE_CLASSES[this.tone()]);
}
