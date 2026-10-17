import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared/ui/page-header';
import { CatalogHistoryTimeline } from '../components/catalog-history-timeline';

/** SRS 4.13 — audit trail of service and entitlement changes. */
@Component({
  selector: 'amc-catalog-history-page',
  imports: [CatalogHistoryTimeline, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Service / Entitlement History" subtitle="Complete audit trail of changes to services, prices, categories and entitlements." [breadcrumbs]="[{ label: 'Service Catalog', path: '/app/catalog/dashboard' }, { label: 'History' }]" />
      <amc-catalog-history-timeline />
    </div>
  `,
})
export class CatalogHistoryPage {}
