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
    lines: ['Response and resolution targets applied to this customer\'s service requests.', 'New sites inherit this SLA and can override it.'],
  },
  serviceTerritory: 'Geographic territory used to assign field technicians.\nTerritories are filtered by the selected service region.',
  preferredServiceWindow: 'Time window in which the customer prefers service visits to be scheduled.',
  communication: 'How the contact prefers to be reached for notifications and follow-ups.',
} satisfies Record<string, FieldHelp>;

export const SITE_FIELD_HELP = {
  code: {
    title: 'Site Code',
    lines: [
      'Unique identifier for this site across the platform.',
      'Auto-generated; it cannot be changed after the site is created.',
    ],
  },
  customer: {
    title: 'Customer',
    lines: [
      'Every site must belong to an active customer.',
      'Selecting a customer pre-fills its default SLA, territory and priority.',
      'A site cannot be moved to a different customer after creation.',
    ],
  },
  type: {
    title: 'Site Type',
    lines: [
      'Classifies the physical location (e.g. Hospital, Office, Warehouse).',
      'Used for filtering, dispatch rules and reporting.',
    ],
  },
  status: {
    title: 'Site Status',
    lines: [
      'Inactive and Archived sites cannot receive new service requests or work orders.',
      'Sites with assets, agreements or service history are never deleted — change the status instead.',
    ],
  },
  fullAddress: {
    title: 'Site Address',
    lines: [
      'Maintained independently from the customer\'s primary address.',
      'Technicians and dispatch are routed to this address.',
      'Use "Copy customer address" to start from the customer\'s registered address.',
    ],
  },
  timezone: {
    title: 'Site Time Zone',
    lines: [
      'IANA time zone used to schedule field-service visits correctly.',
      'Important for sites in a different country or region from the organisation.',
      'Leave empty to inherit the organisation\'s default time zone.',
    ],
  },
  siteContact: {
    title: 'Site Contact',
    lines: [
      'The main on-site contact reached during and after technician visits.',
      'Only active contacts of the selected customer are listed.',
    ],
  },
  siteManager: 'Responsible for approving work orders and signing off completed jobs at this site.',
  emergencyContact: 'Reached in case of emergency or when the regular site contact is unavailable.',
  operatingHours: {
    title: 'Operating Hours',
    lines: [
      'When the site is normally open (e.g. Sun-Thu 08:00-17:00).',
      'Used to schedule service visits within the site\'s available window.',
    ],
  },
  serviceHours: {
    title: 'Service Hours',
    lines: [
      'The window within which technicians are permitted to work on this site.',
      'May differ from operating hours due to noise, access, or safety restrictions.',
    ],
  },
  accessRequirements: {
    title: 'Access Requirements',
    lines: [
      'Any credentials, gate passes, or escorts required to enter the site.',
      'Shown to technicians on every work order for this site.',
    ],
  },
  securityRequirements: {
    title: 'Security Requirements',
    lines: [
      'Background checks, tool inventory checks, photography rules, or NDA requirements.',
      'Non-compliance may result in access being denied.',
    ],
  },
  defaultSla: {
    title: 'Default SLA',
    lines: [
      'Overrides the customer\'s default SLA for all service requests at this site.',
      'Leave empty to inherit the customer\'s SLA.',
    ],
  },
  serviceTerritory: 'The geographic territory used to assign the right field technicians to this site.',
  servicePriority: {
    title: 'Service Priority',
    lines: [
      'Sets the default priority for new service requests at this site.',
      'High-priority sites receive faster scheduling and escalation rules.',
    ],
  },
  preferredVisitDays: 'Days the customer prefers technicians to visit. Scheduling will try to honour this preference.',
  preferredVisitTime: 'Preferred time of day for visits (Morning, Afternoon, or Evening).',
  accessNoticeRequired: {
    title: 'Access Notice Required',
    lines: [
      'When enabled, a visit notice must be sent and confirmed before any technician is dispatched.',
      'The system will block scheduling until the notice period has elapsed.',
    ],
  },
  technicianInstructions: {
    title: 'Technician Instructions',
    lines: [
      'Shown to the assigned technician on every work order created for this site.',
      'Include parking, tool requirements, or on-site procedures.',
    ],
  },
  siteInstructions: 'General instructions for anyone visiting this site, including contractors and delivery personnel.',
  internalNotes: 'Visible to internal staff only. Not shown to technicians or customers.',
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
