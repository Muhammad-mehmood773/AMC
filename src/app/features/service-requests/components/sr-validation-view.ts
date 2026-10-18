import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '@shared/ui/icon';
import type { ValidationGroup } from '../models/operations.model';

/** SRS 9.24 — request validation groups with per-check detail. */
@Component({
  selector: 'amc-sr-validation',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="space-y-4">
      @for (g of groups(); track g.group) {
        <section>
          <p class="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">{{ g.group }}</p>
          <ul class="divide-y divide-line rounded-xl border border-line">
            @for (c of g.checks; track c.check) {
              <li class="flex items-start gap-2.5 px-3 py-2 text-sm">
                <amc-icon [name]="icon(c.result)" [size]="15" class="mt-0.5 shrink-0" [class]="cls(c.result)" />
                <div class="min-w-0"><span class="font-medium text-ink">{{ c.check }}</span><span class="text-ink-muted"> — {{ c.detail }}</span></div>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class SrValidationView {
  readonly groups = input.required<readonly ValidationGroup[]>();

  icon(r: 'pass' | 'fail' | 'warn' | 'na') {
    return r === 'pass' ? 'check-circle' : r === 'fail' ? 'x' : r === 'warn' ? 'alert-triangle' : 'more-horizontal';
  }

  cls(r: 'pass' | 'fail' | 'warn' | 'na') {
    return r === 'pass' ? 'text-ok' : r === 'fail' ? 'text-danger' : r === 'warn' ? 'text-warn' : 'text-ink-subtle';
  }
}
