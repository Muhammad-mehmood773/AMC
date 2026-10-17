import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatCurrency } from '@shared/utils/format';
import type { Consumption } from '../models/amc.model';

/** SRS 6.12 — included / used / remaining with utilization indicators. */
@Component({
  selector: 'amc-consumption-meters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let c = consumption();
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      @for (m of meters(); track m.label) {
        <div class="rounded-xl border border-line p-3">
          <div class="flex items-baseline justify-between gap-2">
            <p class="text-sm font-medium text-ink">{{ m.label }}</p>
            <p class="text-xs tabular-nums" [class]="m.pct === null ? 'text-ink-muted' : m.pct > 100 ? 'font-semibold text-danger' : m.pct >= 80 ? 'font-semibold text-warn' : 'text-ink-muted'">{{ m.pct === null ? 'No limit' : m.pct + '%' }}</p>
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div class="h-full rounded-full transition-all" [class]="m.pct !== null && m.pct > 100 ? 'bg-danger' : m.pct !== null && m.pct >= 80 ? 'bg-warn' : 'bg-brand'" [style.width.%]="m.pct === null ? 0 : m.pct > 100 ? 100 : m.pct"></div>
          </div>
          <dl class="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div><dt class="text-ink-muted">Included</dt><dd class="font-medium tabular-nums text-ink">{{ m.included }}</dd></div>
            <div><dt class="text-ink-muted">Used</dt><dd class="font-medium tabular-nums text-ink">{{ m.used }}</dd></div>
            <div><dt class="text-ink-muted">Remaining</dt><dd class="font-medium tabular-nums text-ink">{{ m.remaining }}</dd></div>
          </dl>
        </div>
      }
    </div>
    <div class="mt-4 flex items-center justify-between rounded-xl bg-surface-muted px-4 py-3">
      <p class="text-sm font-medium text-ink">Overall AMC utilization</p>
      <p class="text-lg font-semibold tabular-nums" [class]="c.overConsumed ? 'text-danger' : 'text-ink'">{{ c.overallUtilization }}%</p>
    </div>
    @if (c.alerts.length) {
      <ul class="mt-3 space-y-1">@for (a of c.alerts; track a) { <li class="rounded-lg bg-warn-subtle px-3 py-1.5 text-xs text-ink">⚠ {{ a }}</li> }</ul>
    }
  `,
})
export class ConsumptionMeters {
  readonly consumption = input.required<Consumption>();
  readonly currency = input('SAR');

  protected readonly meters = computed(() => {
    const c = this.consumption();
    const money = (v: number | null) => (v === null ? '—' : formatCurrency(v, this.currency(), true));
    const num = (v: number | null) => (v === null ? '—' : String(v));
    return [
      { label: 'Visits', included: num(c.includedVisits), used: num(c.usedVisits), remaining: num(c.remainingVisits), pct: c.visitUtilization },
      { label: 'Service Hours', included: num(c.includedHours), used: num(c.usedHours), remaining: num(c.remainingHours), pct: c.hourUtilization },
      { label: 'Parts Value', included: money(c.includedPartsValue), used: money(c.usedPartsValue), remaining: money(c.remainingPartsValue), pct: c.partsUtilization },
      { label: 'Call-Outs', included: num(c.includedCallOuts), used: num(c.usedCallOuts), remaining: num(c.remainingCallOuts), pct: c.includedCallOuts ? Math.round((c.usedCallOuts / c.includedCallOuts) * 1000) / 10 : null },
    ];
  });
}
