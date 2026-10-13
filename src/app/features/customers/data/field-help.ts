import type { FieldHelp } from '@shared/ui/field-info';

/*
 * Contextual help for fields whose purpose or business rules are not self-evident.
 * Content is plain configuration so it can later be served as API-driven field metadata.
 * Only fields where guidance genuinely helps are listed.
 */

export const CUSTOMER_FIELD_HELP = {
  code: {
    title: 'Customer Code',
    lines: ['Unique identifier for the customer across the platform.', 'Generated automatically; it cannot be changed after the customer is created.'],
  },
  type: {
    title: 'Customer Type',
    lines: ['Defines the kind of organisation being registered (e.g. Corporate, Government).', 'Used for customer classification, filtering and reporting.'],
  },
  category: {
    title: 'Customer Category',
    lines: ['The market segment the customer belongs to.', 'Used for classification, segment reporting and dashboard filters.'],
  },
  status: {
    title: 'Customer Status',
    lines: [
      'Inactive and Archived customers cannot receive new sites, contracts, AMCs or service requests.',
      'Customers with history are never deleted — change the status instead.',
    ],
  },
  crNumber: {
    title: 'Business Registration Number',
    lines: [
      'The official business registration or commercial licence number for this customer.',
      'The label and format adapt to the country selected in the primary address.',
      'Also used to detect possible duplicate customers.',
    ],
  },
  vatNumber: {
    title: 'Tax / VAT Registration Number',
    lines: [
      'The official tax or VAT registration number used on invoices.',
      'The label and format adapt to the country selected in the primary address.',
      'Also used to detect possible duplicate customers.',
    ],
  },
  nationalAddress: {
    title: 'National Address Reference',
    lines: ['The 8-character short address (4 letters + 4 digits) from the Saudi National Address system.'],
  },
  accountManager: 'The employee responsible for the commercial relationship.\nReceives escalations for this customer.',
  creditLimit: 'Maximum outstanding receivable allowed for this customer.\nLeave empty when no limit applies.',
  defaultSla: {
    title: 'Default SLA',
    lines: ['Response and resolution targets applied to this customer’s service requests.', 'New sites inherit this SLA and can override it.'],
  },
  serviceTerritory: 'Geographic territory used to assign field technicians.\nTerritories are filtered by the selected service region.',
  preferredServiceWindow: 'Time window in which the customer prefers service visits to be scheduled.',
  communication: 'How the contact prefers to be reached for notifications and follow-ups.',
} satisfies Record<string, FieldHelp>;

export const SITE_FIELD_HELP = {
  code: 'Unique site identifier within the organisation.\nIt cannot be changed after the site is created.',
  customer: {
    title: 'Customer',
    lines: ['Every site must belong to an active customer.', 'Selecting a customer pre-fills its default SLA, territory and priority.'],
  },
  type: 'Classifies the physical location (e.g. Hospital, Warehouse) for filtering and reporting.',
  status: {
    title: 'Site Status',
    lines: [
      'Inactive and Archived sites cannot receive new service requests or work orders.',
      'Sites with assets, agreements or service history are never deleted.',
    ],
  },
  fullAddress: 'The site address is maintained independently from the customer’s primary address.\nTechnicians are dispatched to this address.',
  siteContact: 'Main on-site contact for visits. Only active contacts of the selected customer are listed.',
  defaultSla: 'Overrides the customer’s default SLA for requests raised at this site.',
  technicianInstructions: 'Shown to technicians on every work order for this site.',
} satisfies Record<string, FieldHelp>;

export const CONTACT_FIELD_HELP = {
  site: 'Link the contact to a specific site, or leave empty for a customer-level contact.',
  type: {
    title: 'Contact Type',
    lines: ['Distinguishes billing, technical, procurement, management and emergency contacts.', 'One primary contact is allowed per contact type.'],
  },
  communication: 'How the contact prefers to be reached for notifications and follow-ups.',
} satisfies Record<string, FieldHelp>;

export const DOCUMENT_FIELD_HELP = {
  category: 'Categorises the document for search, filtering and compliance tracking.',
  expiryDate: {
    title: 'Expiry tracking',
    lines: ['When set, the document is monitored and the responsible user is notified before it expires.', 'Leave empty for documents that do not expire.'],
  },
  reminder: 'How many days before the expiry date the responsible user is notified.',
  responsible: 'Receives expiry notifications and follows up on renewal.',
  access: {
    title: 'Access Control',
    lines: ['Internal — visible to staff only.', 'Restricted — limited to authorised users.', 'Customer Visible — can be shared with the customer.'],
  },
} satisfies Record<string, FieldHelp>;
