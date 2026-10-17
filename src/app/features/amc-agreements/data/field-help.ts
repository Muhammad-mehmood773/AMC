import type { FieldHelp } from '@shared/ui/field-info';

/** Contextual help for AMC fields that carry business rules (SRS 6.19). */
export const AMC_FIELD_HELP = {
  number: { title: 'AMC Number', lines: ['Every AMC has a unique number, generated automatically.'] },
  parent: { title: 'Parent Contract', lines: ['An AMC should normally be linked to an executed or approved commercial contract in Contract Lifecycle Management.'] },
  customer: { title: 'Customer', lines: ['Every AMC must reference a valid customer. Covered sites and assets must belong to this customer.'] },
  period: { title: 'Contract period', lines: ['Start and end dates are mandatory.', 'Expired AMCs do not provide active service entitlement.'] },
  scope: { title: 'Coverage scope', lines: ['Only assets within the defined scope may receive AMC-covered services.', 'Excluded sites, assets and services are never covered.'] },
  visits: { title: 'Number of visits', lines: ['Included visits are consumed automatically when qualifying services are completed.'] },
  parts: { title: 'Parts coverage', lines: ['Parts coverage is validated before parts are issued as contract-covered. The cost limit caps covered parts.'] },
  approval: { title: 'Approval', lines: ['An AMC cannot become Active before required approvals are completed.', 'AMCs up to the auto-approval limit are approved by the contract manager on activation.'] },
} satisfies Record<string, FieldHelp>;
