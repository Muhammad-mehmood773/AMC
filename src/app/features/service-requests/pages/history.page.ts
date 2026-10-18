import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared/ui/page-header';
import { SrHistoryTimeline } from '../components/sr-history-timeline';

/** SRS 9.26 — History & Audit across all service requests. */
@Component({
  selector: 'amc-sr-history-page',
  imports: [PageHeader, SrHistoryTimeline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Request History & Audit" subtitle="Chronological, immutable record of every change, automation action and communication." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'History' }]" />
      <amc-sr-history-timeline />
    </div>
  `,
})
export class SrHistoryPage {}
