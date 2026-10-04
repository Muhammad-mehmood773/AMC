import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'amc-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-ink-muted">{{ summary() }}</p>
      <div class="flex items-center gap-2">
        <button type="button" class="amc-btn-secondary" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">
          Previous
        </button>
        <span class="text-sm font-medium">{{ page() }} / {{ pageCount() }}</span>
        <button
          type="button"
          class="amc-btn-secondary"
          [disabled]="page() >= pageCount()"
          (click)="pageChange.emit(page() + 1)"
        >
          Next
        </button>
      </div>
    </div>
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly pageChange = output<number>();

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly summary = computed(() => {
    if (this.total() === 0) {
      return 'No records';
    }
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.page() * this.pageSize(), this.total());
    return `${start}–${end} of ${this.total()}`;
  });
}
