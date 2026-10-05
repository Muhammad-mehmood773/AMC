import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, type IconName } from './icon';
import { Skeleton } from './skeleton';
import type { BadgeTone } from './status-badge';

const ICON_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  brand: 'bg-brand-subtle text-brand',
  ok: 'bg-ok-subtle text-ok',
  warn: 'bg-warn-subtle text-warn',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent',
};

@Component({
  selector: 'amc-kpi-card',
  imports: [Icon, NgTemplateOutlet, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ng-template #body>
      <div class="flex items-start justify-between gap-3">
        <p class="text-[13px] leading-snug font-medium text-ink-muted">{{ label() }}</p>
        @if (icon(); as name) {
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            [class]="iconTone()"
          >
            <amc-icon [name]="name" />
          </span>
        }
      </div>
      @if (loading()) {
        <amc-skeleton class="mt-2 h-7 w-20" />
        <amc-skeleton class="mt-2 h-3 w-28" />
      } @else {
        <p class="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
          {{ value() }}
        </p>
        @if (hint()) {
          <p class="mt-1 truncate text-xs text-ink-muted">{{ hint() }}</p>
        }
      }
    </ng-template>

    @if (link(); as target) {
      <a
        [routerLink]="target"
        [queryParams]="queryParams()"
        class="amc-card block h-full p-4 transition-colors hover:border-line-strong hover:bg-surface-muted"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <article class="amc-card h-full p-4">
        <ng-container [ngTemplateOutlet]="body" />
      </article>
    }
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>('');
  readonly icon = input<IconName | null>(null);
  readonly tone = input<BadgeTone>('neutral');
  readonly link = input<string | null>(null);
  readonly queryParams = input<Record<string, string> | null>(null);
  readonly loading = input(false);

  protected readonly iconTone = computed(() => ICON_TONES[this.tone()]);
}
