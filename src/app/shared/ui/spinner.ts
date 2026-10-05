import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'amc-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    class: 'inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[attr.aria-label]': 'label()',
  },
  template: '',
})
export class Spinner {
  readonly size = input(16);
  readonly label = input('Loading');
}
