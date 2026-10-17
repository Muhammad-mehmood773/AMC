import type { FieldHelp } from '@shared/ui/field-info';

/** Contextual help for contract fields that carry business rules (SRS 5.21). */
export const CONTRACT_FIELD_HELP = {
  number: { title: 'Contract Number', lines: ['Every contract has a unique contract number, generated automatically.'] },
  type: { title: 'Contract Type', lines: ['Every contract must have a defined type.', 'Customer contract types require a customer; vendor / partner types require a vendor or partner.'] },
  version: { title: 'Contract Version', lines: ['Each saved change creates a new version; executed versions are never overwritten.', 'Changes after execution are made through amendments.'] },
  parties: { title: 'Contracting parties', lines: ['A contract must identify the relevant contracting parties.'] },
  period: { title: 'Contract period', lines: ['Start and end dates are mandatory for time-bound contracts.', 'Expired contracts do not provide active service coverage.'] },
  notice: { title: 'Notice period', lines: ['Days before the end date by which renewal or termination notice must be given. A “Notice Period Started” alert is raised.'] },
  signature: { title: 'Signature required', lines: ['When required, the contract cannot become Active until all signatories have signed.'] },
  value: { title: 'Contract value', lines: ['Value, discount and margin determine the approval levels required.'] },
  risk: { title: 'Risk level', lines: ['High-risk contracts require Legal approval.'] },
} satisfies Record<string, FieldHelp>;
