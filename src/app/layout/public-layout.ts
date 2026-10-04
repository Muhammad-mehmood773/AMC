import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'amc-public-layout',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-screen' },
  template: '<router-outlet />',
})
export class PublicLayout {}
