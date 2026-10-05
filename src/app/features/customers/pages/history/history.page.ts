import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared/ui/page-header';
import { ActivityTimeline } from '../../components/activity-timeline';

@Component({
  selector: 'amc-history-page',
  imports: [ActivityTimeline, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header
        title="Customer & Site History"
        subtitle="Audit timeline of customer, contact, site, agreement, service, billing and document activity."
        [breadcrumbs]="[
          { label: 'Customers & Sites', path: '/app/customers/dashboard' },
          { label: 'History' },
        ]"
      />
      <amc-activity-timeline />
    </div>
  `,
})
export class HistoryPage {}
