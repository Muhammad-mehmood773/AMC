import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '@shared/ui/icon';
import { StatusBadge } from '@shared/ui/status-badge';
import { VALIDATION_TONE } from '../models/display';
import type { PmValidation } from '../models/operations.model';

/** SRS 8.26 validation chain. */
@Component({
  selector: 'amc-pm-validation-view',
  imports: [Icon, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let v = validation();
    <div class="rounded-xl border border-line">
      <div class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <amc-status-badge [label]="v.result" [tone]="tone[v.result]" />
        <p class="min-w-0 flex-1 text-sm text-ink">{{ v.summary }}</p>
      </div>
      <ol class="divide-y divide-line">
        @for (s of v.steps; track $index) {
          <li class="flex items-start gap-3 px-4 py-2 text-sm">
            <amc-icon [name]="s.result === 'pass' ? 'check-circle' : s.result === 'fail' ? 'x' : s.result === 'warn' ? 'alert-triangle' : 'clock'" [size]="15" class="mt-0.5" [class]="s.result === 'pass' ? 'text-ok' : s.result === 'fail' ? 'text-danger' : s.result === 'warn' ? 'text-warn' : 'text-ink-subtle'" />
            <span class="w-44 shrink-0 font-medium text-ink">{{ s.step }}</span>
            <span class="text-ink-muted">{{ s.detail }}</span>
          </li>
        }
      </ol>
    </div>
  `,
})
export class PmValidationView {
  readonly validation = input.required<PmValidation>();
  protected readonly tone = VALIDATION_TONE;
}
