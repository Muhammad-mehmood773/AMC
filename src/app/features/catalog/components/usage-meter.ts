import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StatusBadge } from '@shared/ui/status-badge';
import { formatDate } from '@shared/utils/format';
import type { UsageSummary } from '../models/entitlement.model';
import { USAGE_STATE_TONE } from '../models/display';

/** SRS 4.17 — allowed / consumed / remaining with usage percentage and overuse status. */
@Component({
  selector: 'amc-usage-meter',
  imports: [StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let u = usage();
    @if (u.allowed === null) {
      <p class="text-sm text-ink-muted">No usage limit — unlimited covered services.</p>
    } @else {
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-sm text-ink"><span class="text-lg font-semibold tabular-nums">{{ u.consumed }}</span> <span class="text-ink-muted">/ {{ u.allowed }} {{ u.unit.toLowerCase() }} used</span></p>
        <amc-status-badge [label]="u.state" [tone]="tone()" />
      </div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
        <div class="h-full rounded-full transition-all" [class]="barClass()" [style.width.%]="width()"></div>
      </div>
      @if (!compact()) {
        <dl class="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div><dt class="text-ink-muted">Allowed</dt><dd class="font-medium text-ink tabular-nums">{{ u.allowed }}</dd></div>
          <div><dt class="text-ink-muted">Consumed</dt><dd class="font-medium text-ink tabular-nums">{{ u.consumed }}</dd></div>
          <div><dt class="text-ink-muted">Remaining</dt><dd class="font-medium text-ink tabular-nums">{{ u.remaining }}</dd></div>
          <div><dt class="text-ink-muted">Usage</dt><dd class="font-medium text-ink tabular-nums">{{ u.percentage }}%</dd></div>
          <div class="col-span-2"><dt class="text-ink-muted">Usage period from</dt><dd class="font-medium text-ink">{{ formatDate(u.periodStart) }}</dd></div>
          <div class="col-span-2"><dt class="text-ink-muted">Next reset</dt><dd class="font-medium text-ink">{{ u.resetDate ? formatDate(u.resetDate) : 'No reset' }}</dd></div>
        </dl>
      }
    }
  `,
})
export class UsageMeter {
  readonly usage = input.required<UsageSummary>();
  readonly compact = input(false);

  protected readonly formatDate = formatDate;
  protected readonly tone = computed(() => USAGE_STATE_TONE[this.usage().state]);
  protected readonly width = computed(() => Math.min(100, this.usage().percentage ?? 0));
  protected readonly barClass = computed(() => {
    const state = this.usage().state;
    return state === 'Within Limit' ? 'bg-ok' : state === 'Near Limit' ? 'bg-warn' : 'bg-danger';
  });
}
