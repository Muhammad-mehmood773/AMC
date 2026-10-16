import type { FieldHelp } from '@shared/ui/field-info';

/*
 * Contextual help for asset fields whose purpose or business rules are not self-evident.
 * Content is plain configuration so it can later be served as API-driven field metadata.
 */

export const ASSET_FIELD_HELP = {
  code: {
    title: 'Asset ID',
    lines: ['Internal identifier of the asset; it must be unique.', 'Generated automatically and cannot be changed after creation.'],
  },
  tag: {
    title: 'Asset Tag',
    lines: ['Physical label fixed on the equipment (QR / barcode label).', 'Must be unique across the installed base.'],
  },
  status: {
    title: 'Asset Status',
    lines: [
      'Installation, commissioning and transfer workflows update the status automatically.',
      'Assets with history are never deleted — retire or decommission them instead.',
      'Retired and decommissioned assets cannot receive new service requests or work orders.',
    ],
  },
  customer: {
    title: 'Customer',
    lines: ['Every active asset must belong to a customer, unless it is company or vendor owned.', 'Changing the customer of an installed asset is done through a transfer.'],
  },
  site: {
    title: 'Site',
    lines: ['Installed customer assets must be associated with a service site.', 'An asset has only one current operational location; history is preserved on transfer.'],
  },
  category: {
    title: 'Asset Category',
    lines: ['Determines which technical fields and custom attributes are captured for the asset.'],
  },
  criticality: {
    title: 'Criticality',
    lines: ['Influences SLA, response time, preventive maintenance frequency, escalation, technician priority, spare-parts planning and scheduling.'],
  },
  serialNumber: {
    title: 'Serial Number',
    lines: ['Must be unique for the same asset type and manufacturer.', 'Used for warranty claims and identification in the field.'],
  },
  installedBy: {
    title: 'Installed By',
    lines: ['Use the Installation / Commissioning screen to run the full installation workflow with checklist and customer confirmation.'],
  },
  warranty: {
    title: 'Warranty',
    lines: [
      'Warranty dates are maintained independently from contract dates.',
      'The warranty status is derived automatically from the dates (Not Started, Active, Expiring Soon, Expired).',
    ],
  },
  contract: {
    title: 'Active Contract / AMC',
    lines: ['Links the asset to the agreement that entitles it to service.', 'Expired agreements never provide an active entitlement.'],
  },
  ownership: {
    title: 'Ownership Type',
    lines: ['Company and vendor owned assets may be registered without a customer; an asset owner is then required.'],
  },
  meter: {
    title: 'Meter',
    lines: ['Meter readings drive meter-based preventive maintenance and are captured on each service visit.'],
  },
  rfid: {
    title: 'RFID Reference',
    lines: ['Optional RFID tag identifier where RFID tracking is used.'],
  },
} satisfies Record<string, FieldHelp>;
