import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BulkProgressHost } from '@shared/ui/bulk-progress-host';
import { ConfirmDialogHost } from '@shared/ui/confirm-dialog-host';
import { NetworkBanner } from '@shared/ui/network-banner';
import { ToastHost } from '@shared/ui/toast-host';

@Component({
  selector: 'amc-root',
  imports: [BulkProgressHost, ConfirmDialogHost, NetworkBanner, RouterOutlet, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-network-banner />
    <router-outlet />
    <amc-toast-host />
    <amc-bulk-progress-host />
    <amc-confirm-dialog-host />
  `,
})
export class App {}
