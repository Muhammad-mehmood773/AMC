import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Shimmer placeholder. Size it with utility classes on the host, e.g. `class="h-4 w-32"`. */
@Component({
  selector: 'amc-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block animate-pulse rounded-md bg-surface-sunken', 'aria-hidden': 'true' },
  template: '',
})
export class Skeleton {}
