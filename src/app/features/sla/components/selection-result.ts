import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '@shared/ui/icon';
import { StatusBadge } from '@shared/ui/status-badge';
import { VALIDATION_TONE, formatMinutes } from '../models/display';
import type { SlaSelection } from '../models/operations.model';

/** SRS 7.21 validation chain and SRS 7.12 candidate ranking. */
@Component({
  selector: 'amc-selection-result',
  imports: [Icon, RouterLink, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let s = selection();
    <div class="rounded-xl border border-line">
      <div class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <amc-status-badge [label]="s.result" [tone]="tone[s.result]" />
        <span class="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">{{ s.applicability }}</span>
        <p class="min-w-0 flex-1 text-sm text-ink">{{ s.summary }}</p>
      </div>
      @if (s.slaId) {
        <dl class="grid grid-cols-2 gap-3 border-b border-line px-4 py-3 text-sm sm:grid-cols-4">
          <div><dt class="text-xs text-ink-muted">Applied SLA</dt><dd><a [routerLink]="['/app/sla', s.slaId]" class="amc-link font-mono">{{ s.slaNumber }}</a></dd></div>
          <div><dt class="text-xs text-ink-muted">First Response</dt><dd class="font-medium">{{ fm(s.responseMinutes) }}</dd></div>
          <div><dt class="text-xs text-ink-muted">Resolution</dt><dd class="font-medium">{{ fm(s.resolutionMinutes) }}</dd></div>
          <div><dt class="text-xs text-ink-muted">Calendar</dt><dd class="font-medium">{{ s.calendarName }}</dd></div>
        </dl>
      }
      <ol class="divide-y divide-line">
        @for (st of s.steps; track $index) {
          <li class="flex items-start gap-3 px-4 py-2 text-sm">
            <amc-icon [name]="st.result === 'pass' ? 'check-circle' : st.result === 'fail' ? 'x' : st.result === 'warn' ? 'alert-triangle' : 'clock'" [size]="15" class="mt-0.5" [class]="st.result === 'pass' ? 'text-ok' : st.result === 'fail' ? 'text-danger' : st.result === 'warn' ? 'text-warn' : 'text-ink-subtle'" />
            <span class="w-40 shrink-0 font-medium text-ink">{{ st.step }}</span>
            <span class="text-ink-muted">{{ st.detail }}</span>
          </li>
        }
      </ol>
      @if (s.candidates.length) {
        <div class="border-t border-line px-4 py-3">
          <p class="amc-overline">Candidates (most specific first)</p>
          <ul class="mt-2 space-y-1.5">
            @for (c of s.candidates; track c.mappingId) {
              <li class="flex flex-wrap items-center gap-2 text-xs">
                <span class="font-mono text-ink">{{ c.slaNumber }}</span>
                <span class="text-ink-muted">{{ c.slaName }} · {{ c.level }} mapping · specificity {{ c.specificity }} · priority {{ c.assignmentPriority }}</span>
                <span [class]="c.eligible ? 'text-ok' : 'text-danger'">{{ c.reason }}</span>
                @if (c.slaId === s.slaId) { <span class="rounded-full bg-ok-subtle px-1.5 py-0.5 font-medium text-ok">Selected</span> }
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class SelectionResult {
  readonly selection = input.required<SlaSelection>();
  protected readonly tone = VALIDATION_TONE;
  protected readonly fm = formatMinutes;
}
