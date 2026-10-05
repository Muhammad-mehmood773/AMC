import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from './icon';

export interface BreadcrumbItem {
  readonly label: string;
  readonly path?: string;
}

@Component({
  selector: 'amc-breadcrumbs',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Breadcrumb">
      <ol class="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
        @for (item of items(); track item.label; let last = $last) {
          <li class="flex min-w-0 items-center gap-1">
            @if (item.path && !last) {
              <a
                [routerLink]="item.path"
                class="truncate rounded px-0.5 transition-colors hover:text-ink"
                >{{ item.label }}</a
              >
            } @else {
              <span
                class="truncate"
                [class.font-medium]="last"
                [class.text-ink]="last"
                [attr.aria-current]="last ? 'page' : null"
                >{{ item.label }}</span
              >
            }
            @if (!last) {
              <amc-icon name="chevron-right" [size]="12" class="text-ink-subtle" />
            }
          </li>
        }
      </ol>
    </nav>
  `,
})
export class Breadcrumbs {
  readonly items = input.required<readonly BreadcrumbItem[]>();
}

@Component({
  selector: 'amc-page-header',
  imports: [Breadcrumbs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div class="min-w-0">
        @if (breadcrumbs().length) {
          <amc-breadcrumbs class="mb-2 block" [items]="breadcrumbs()" />
        }
        <h1 class="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="mt-1 max-w-3xl text-sm text-ink-muted">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2 empty:hidden">
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
