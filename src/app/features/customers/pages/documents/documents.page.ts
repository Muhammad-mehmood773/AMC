import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared/ui/page-header';
import { DocumentManager } from '../../components/document-manager';

@Component({
  selector: 'amc-documents-page',
  imports: [DocumentManager, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header
        title="Customer & Site Documents"
        subtitle="Legal, commercial, compliance and site documents with versioning and expiry tracking."
        [breadcrumbs]="[
          { label: 'Customers & Sites', path: '/app/customers/dashboard' },
          { label: 'Documents' },
        ]"
      />
      <amc-document-manager />
    </div>
  `,
})
export class DocumentsPage {}
