import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NetworkStore } from '@core/network/network.store';
import { Icon } from './icon';

/** Global connectivity banner: persistent while offline, brief confirmation on reconnect. */
@Component({
  selector: 'amc-network-banner',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!network.online()) {
      <div class="fixed inset-x-0 top-0 z-65 flex animate-fade-in items-center justify-center gap-2 bg-warn px-4 py-2 text-sm font-medium text-surface" role="alert">
        <amc-icon name="wifi-off" [size]="16" />
        You are offline. Changes can’t be saved until your connection returns.
      </div>
    } @else if (network.reconnected()) {
      <div class="fixed inset-x-0 top-0 z-65 flex animate-fade-in items-center justify-center gap-2 bg-ok px-4 py-2 text-sm font-medium text-surface" role="status">
        <amc-icon name="check-circle" [size]="16" />
        Back online.
      </div>
    }
  `,
})
export class NetworkBanner {
  protected readonly network = inject(NetworkStore);
}
