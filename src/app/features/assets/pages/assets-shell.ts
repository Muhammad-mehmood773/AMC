import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ServiceActionHost } from '../components/service-action-host';

/** Feature shell: hosts the routed screens and the shared entitlement-check dialog. */
@Component({
  selector: 'amc-assets-shell',
  imports: [RouterOutlet, ServiceActionHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><amc-service-action-host />`,
})
export class AssetsShell {}
