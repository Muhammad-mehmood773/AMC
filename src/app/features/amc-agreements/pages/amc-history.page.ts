import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared/ui/page-header';
import { AmcHistoryTimeline } from '../components/amc-history-timeline';

/** SRS 6.15 — complete audit trail of all service agreements. */
@Component({
  selector: 'amc-amc-history-page',
  imports: [AmcHistoryTimeline, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="AMC History & Audit" subtitle="Date & time, user, action, entity, previous and new value, reference and comments." [breadcrumbs]="[{ label: 'AMC / Service Contracts', path: '/app/amc-agreements/dashboard' }, { label: 'History & Audit' }]" />
      <amc-amc-history-timeline />
    </div>
  `,
})
export class AmcHistoryPage {}
