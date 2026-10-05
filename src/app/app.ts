import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogHost } from '@shared/ui/confirm-dialog-host';
import { ToastHost } from '@shared/ui/toast-host';

@Component({
  selector: 'amc-root',
  imports: [ConfirmDialogHost, RouterOutlet, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <amc-toast-host />
    <amc-confirm-dialog-host />
  `,
})
export class App {}
