import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared/ui/page-header';
import { ContactManager } from '../../components/contact-manager';

@Component({
  selector: 'amc-contact-management-page',
  imports: [ContactManager, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header
        title="Contacts"
        subtitle="Customer and site contacts for procurement, technical, billing, management and emergency purposes."
        [breadcrumbs]="[
          { label: 'Customers & Sites', path: '/app/customers/dashboard' },
          { label: 'Contacts' },
        ]"
      />
      <amc-contact-manager />
    </div>
  `,
})
export class ContactManagementPage {}
