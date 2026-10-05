import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from './icon';

type PageToken = number | 'gap-start' | 'gap-end';

@Component({
  selector: 'amc-pagination',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3 text-sm text-ink-muted">
        <span class="tabular-nums">{{ summary() }}</span>
        @if (pageSizeOptions().length > 1) {
          <label class="hidden items-center gap-2 sm:flex">
            <span class="text-xs">Rows</span>
            <select
              class="amc-select h-8 w-[4.5rem] py-0 text-xs"
              [value]="pageSize()"
              (change)="onPageSize($event)"
            >
              @for (size of pageSizeOptions(); track size) {
                <option [value]="size">{{ size }}</option>
              }
            </select>
          </label>
        }
      </div>
      <nav class="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          class="amc-btn-ghost amc-btn-sm w-8 px-0"
          [disabled]="page() <= 1"
          (click)="pageChange.emit(page() - 1)"
          aria-label="Previous page"
        >
          <amc-icon name="chevron-left" />
        </button>
        @for (token of tokens(); track token) {
          @if (token === 'gap-start' || token === 'gap-end') {
            <span class="w-8 text-center text-sm text-ink-subtle">…</span>
          } @else {
            <button
              type="button"
              class="amc-btn-sm min-w-8 px-2 tabular-nums"
              [class]="
                token === page()
                  ? 'amc-btn border border-line-strong bg-surface text-ink shadow-xs'
                  : 'amc-btn-ghost'
              "
              [attr.aria-current]="token === page() ? 'page' : null"
              (click)="pageChange.emit(token)"
            >
              {{ token }}
            </button>
          }
        }
        <button
          type="button"
          class="amc-btn-ghost amc-btn-sm w-8 px-0"
          [disabled]="page() >= pageCount()"
          (click)="pageChange.emit(page() + 1)"
          aria-label="Next page"
        >
          <amc-icon name="chevron-right" />
        </button>
      </nav>
    </div>
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly pageSizeOptions = input<readonly number[]>([10, 25, 50]);
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );

  protected readonly summary = computed(() => {
    if (this.total() === 0) {
      return 'No records';
    }
    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.page() * this.pageSize(), this.total());
    return `${start}–${end} of ${this.total()}`;
  });

  protected readonly tokens = computed<PageToken[]>(() => {
    const count = this.pageCount();
    const current = this.page();
    if (count <= 7) {
      return Array.from({ length: count }, (_, i) => i + 1);
    }
    const tokens: PageToken[] = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(count - 1, current + 1);
    if (start > 2) tokens.push('gap-start');
    for (let i = start; i <= end; i++) tokens.push(i);
    if (end < count - 1) tokens.push('gap-end');
    tokens.push(count);
    return tokens;
  });

  protected onPageSize(event: Event): void {
    this.pageSizeChange.emit(Number((event.target as HTMLSelectElement).value));
  }
}
