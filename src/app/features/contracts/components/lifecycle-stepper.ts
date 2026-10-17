import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '@shared/ui/icon';
import type { ContractStatus } from '../models/contract.model';

const STAGES = ['Draft', 'Review', 'Negotiation', 'Approval', 'Signature', 'Active', 'Renewal / Closure'] as const;

const STAGE_OF: Record<ContractStatus, number> = {
  Draft: 0,
  'Under Review': 1,
  'Under Negotiation': 2,
  'Pending Approval': 3,
  Approved: 4,
  'Pending Signature': 4,
  'Partially Signed': 4,
  Active: 5,
  Suspended: 5,
  'Expiring Soon': 5,
  Expired: 6,
  Terminated: 6,
  Renewed: 6,
  Archived: 6,
  Cancelled: 6,
};

/** SRS 5.1 lifecycle position: request → draft → review → negotiation → approval → execution → active → closure. */
@Component({
  selector: 'amc-lifecycle-stepper',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Contract lifecycle">
      @for (s of stages; track s; let i = $index) {
        <li class="flex min-w-0 flex-1 items-center gap-1">
          <div class="flex min-w-0 items-center gap-2">
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" [class]="dotClass(i)" [attr.aria-current]="i === current() ? 'step' : null">
              @if (i < current() || (i === current() && done())) { <amc-icon name="check" [size]="12" /> } @else { {{ i + 1 }} }
            </span>
            <span class="truncate text-xs" [class]="i === current() ? 'font-semibold text-ink' : 'text-ink-muted'">{{ i === current() ? status() : s }}</span>
          </div>
          @if (i < stages.length - 1) { <span class="h-px min-w-3 flex-1" [class]="i < current() ? 'bg-brand' : 'bg-line'"></span> }
        </li>
      }
    </ol>
  `,
})
export class LifecycleStepper {
  readonly status = input.required<ContractStatus>();

  protected readonly stages = STAGES;
  protected readonly current = computed(() => STAGE_OF[this.status()]);
  protected readonly done = computed(() => ['Renewed', 'Archived'].includes(this.status()));
  protected readonly bad = computed(() => ['Terminated', 'Cancelled', 'Expired', 'Suspended'].includes(this.status()));

  protected dotClass(i: number): string {
    if (i < this.current()) return 'bg-brand text-white';
    if (i === this.current()) return this.bad() ? 'bg-danger-subtle text-danger ring-2 ring-danger/30' : 'bg-brand-subtle text-brand ring-2 ring-brand/30';
    return 'bg-surface-sunken text-ink-subtle';
  }
}
