import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BulkOperationService } from '@core/ui/bulk-operation.service';
import { Icon } from './icon';

/** Floating progress card for `BulkOperationService`. Mount once at application level. */
@Component({
  selector: 'amc-bulk-progress-host',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (op(); as o) {
      <section
        class="fixed bottom-5 left-5 z-60 w-[min(22rem,calc(100vw-2.5rem))] animate-slide-up rounded-xl border border-line bg-surface p-4 shadow-pop max-sm:right-5 max-sm:bottom-20"
        role="status"
        aria-live="polite"
      >
        <div class="flex items-start gap-3">
          <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" [class]="iconClass()">
            <amc-icon [name]="icon()" [size]="16" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-ink">{{ o.title }}</p>
            <p class="text-xs text-ink-muted tabular-nums">{{ summary() }}</p>
          </div>
          @if (!bulk.running) {
            <button type="button" class="-m-1 flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-sunken hover:text-ink" aria-label="Dismiss" (click)="bulk.dismiss()">
              <amc-icon name="x" [size]="14" />
            </button>
          }
        </div>
        <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" [attr.aria-valuenow]="percent()" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full rounded-full transition-[width] duration-200" [class]="o.failures.length ? 'bg-warn' : 'bg-brand'" [style.width.%]="percent()"></div>
        </div>
        <div class="mt-3 flex items-center justify-between gap-2">
          @if (o.failures.length) {
            <button type="button" class="text-xs font-medium text-danger hover:underline" (click)="showFailures.set(!showFailures())">
              {{ o.failures.length }} failed · {{ showFailures() ? 'hide' : 'details' }}
            </button>
          } @else {
            <span></span>
          }
          @if (bulk.running) {
            <button type="button" class="amc-btn-secondary amc-btn-sm" [disabled]="o.status === 'cancelling'" (click)="bulk.cancel()">
              {{ o.status === 'cancelling' ? 'Stopping…' : 'Cancel' }}
            </button>
          }
        </div>
        @if (showFailures() && o.failures.length) {
          <ul class="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-lg bg-danger-subtle p-2 text-xs text-ink">
            @for (f of o.failures; track $index) {
              <li><span class="font-medium">{{ f.label }}</span> — {{ f.message }}</li>
            }
          </ul>
        }
      </section>
    }
  `,
})
export class BulkProgressHost {
  protected readonly bulk = inject(BulkOperationService);
  protected readonly op = this.bulk.operation;
  protected readonly showFailures = signal(false);

  protected readonly percent = computed(() => {
    const o = this.op();
    return o && o.total ? Math.round((o.done / o.total) * 100) : 0;
  });
  protected readonly icon = computed(() => {
    const o = this.op();
    if (!o || o.status === 'running' || o.status === 'cancelling') return 'refresh' as const;
    return o.failures.length ? ('alert-triangle' as const) : ('check-circle' as const);
  });
  protected readonly iconClass = computed(() => {
    const o = this.op();
    if (!o || o.status === 'running' || o.status === 'cancelling') return 'bg-brand-subtle text-brand [&_svg]:animate-spin';
    return o.failures.length ? 'bg-warn-subtle text-warn' : 'bg-ok-subtle text-ok';
  });
  protected readonly summary = computed(() => {
    const o = this.op();
    if (!o) return '';
    const base = `${o.done} of ${o.total} processed`;
    if (o.status === 'cancelled') return `Cancelled — ${base}`;
    if (o.status === 'finished') return o.failures.length ? `${base}, ${o.failures.length} failed` : `Completed — all ${o.total} succeeded`;
    return base;
  });
}
