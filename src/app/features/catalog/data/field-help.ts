import type { FieldHelp } from '@shared/ui/field-info';

/** Contextual help for catalog and entitlement fields that carry business rules. */
export const CATALOG_FIELD_HELP = {
  code: { title: 'Service Code', lines: ['Every service must have a unique service code.', 'Generated automatically; it cannot be changed after creation.'] },
  status: {
    title: 'Service Status',
    lines: ['Inactive services cannot be selected for new operational transactions.', 'Historical transactions that used the service remain unchanged.'],
  },
  category: { title: 'Service Category', lines: ['Every active service must belong to a valid, active category.'] },
  billing: {
    title: 'Billing Method',
    lines: ['Defines how the service is charged when it is not covered by an entitlement.', 'Pricing rules on the Pricing screen can override the standard price by customer, contract, region and date.'],
  },
  eligibility: { title: 'Contract / AMC eligibility', lines: ['Marks services that can be included in contracts or AMCs so they are identifiable in entitlements.'] },
  sla: { title: 'Service SLA', lines: ['Service-specific SLA rules override the default SLA where configured.'] },
  entitlementCustomer: { title: 'Customer', lines: ['Every entitlement must reference a valid customer.'] },
  validity: { title: 'Validity', lines: ['Coverage is controlled by the start and end dates.', 'Expired entitlements cannot be used for new covered services.'] },
  usage: {
    title: 'Usage limits',
    lines: ['Usage is updated automatically when covered services are consumed.', 'Remaining quantity is calculated and an alert is raised when the configured threshold is reached.'],
  },
  sites: { title: 'Covered sites', lines: ['Site-level entitlements apply only to the authorized sites. Leave empty to cover all customer sites.'] },
  assets: { title: 'Covered assets', lines: ['Asset-level entitlements are validated against the asset’s current location and status.'] },
  exclusions: { title: 'Exclusions', lines: ['Excluded services and assets are never treated as covered.'] },
  status2: { title: 'Entitlement Status', lines: ['Suspended or cancelled entitlements do not provide active service coverage.'] },
} satisfies Record<string, FieldHelp>;
