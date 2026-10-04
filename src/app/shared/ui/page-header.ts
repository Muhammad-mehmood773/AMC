import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface BreadcrumbItem {
  readonly label: string;
  readonly path?: string;
}

@Component({
  selector: 'amc-page-header',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="min-w-0">
        <nav class="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-muted">
          @for (item of breadcrumbs(); track item.label; let last = $last) {
            @if (item.path && !last) {
              <a [routerLink]="item.path" class="hover:text-brand">{{ item.label }}</a>
              <span>/</span>
            } @else {
              <span [class.text-ink]="last">{{ item.label }}</span>
              @if (!last) {
                <span>/</span>
              }
            }
          }
        </nav>
        <h1 class="text-2xl font-semibold tracking-tight">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="mt-1 max-w-3xl text-sm text-ink-muted">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly breadcrumbs = input<readonly BreadcrumbItem[]>([]);
}
