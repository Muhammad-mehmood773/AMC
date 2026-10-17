import type { ContractStatus } from '../models/contract.model';

/** Configurable business rules of Contract Lifecycle Management (SRS 5.12, 5.19 – 5.21). */
export const CONTRACT_RULES = {
  /** Active contracts ending within this window are reported as "Expiring Soon". */
  expiringWindowDays: 60,
  /** Expiry alert intervals in days before the end date (SRS 5.20). */
  expiryAlertDays: [180, 90, 60, 30, 15, 7] as readonly number[],
  /** Obligations due within this many days raise an "Obligation Due" alert. */
  obligationDueDays: 14,
  /** Renewal date alerts are raised this many days ahead. */
  renewalDueDays: 30,
  /** Signature is required by default for new contracts (configurable per contract). */
  signatureRequiredByDefault: true,
  /** Days before a sent e-signature envelope expires. */
  signatureExpiryDays: 30,
  /** Reviews created when a contract is submitted for review. */
  defaultReviews: ['Commercial Review', 'Legal Review', 'Technical Review', 'Financial Review'] as readonly string[],
  /** Amendments with a commercial impact above this amount need Level 2 approval. */
  amendmentFinanceThreshold: 50_000,
  /** Statuses an organization has enabled (SRS 5.19 — not every status must be used). */
  enabledStatuses: null as readonly ContractStatus[] | null,
} as const;

/** Indicative conversion rates used to aggregate portfolio values in the reporting currency. */
export const REPORTING_CURRENCY = 'SAR';
export const FX_TO_REPORTING: Readonly<Record<string, number>> = {
  SAR: 1, AED: 1.02, BHD: 9.95, KWD: 12.2, OMR: 9.74, QAR: 1.03, USD: 3.75, CAD: 2.75, GBP: 4.75, EUR: 4.05, PKR: 0.0135,
};

export interface ApprovalLevelRule {
  readonly level: number;
  readonly name: string;
  readonly role: string;
  readonly approverId: string;
  /** Returns the reasons this level applies, or an empty list when it does not. */
  readonly when: (ctx: ApprovalContext) => readonly string[];
}

export interface ApprovalContext {
  readonly value: number;
  readonly type: string;
  readonly customerType: string | null;
  readonly discountPercent: number;
  readonly marginPercent: number;
  readonly durationMonths: number;
  readonly riskLevel: string;
  readonly legalFlags: boolean;
}

/**
 * SRS 5.12 approval workflow: Draft → Review → Approval Level 1 → Level 2 → Management → Approved for Execution.
 * Levels are added based on contract value, type, customer type, discount, margin, duration, risk and legal requirements.
 */
export const APPROVAL_LEVELS: readonly ApprovalLevelRule[] = [
  { level: 1, name: 'Approval Level 1', role: 'Contract Manager', approverId: 'USR-10', when: () => ['All contracts'] },
  {
    level: 2,
    name: 'Approval Level 2',
    role: 'Finance Manager',
    approverId: 'USR-12',
    when: (c) =>
      [
        c.value >= 250_000 ? 'Contract value ≥ 250,000' : '',
        c.discountPercent > 10 ? `Discount ${c.discountPercent}% > 10%` : '',
        c.marginPercent < 20 ? `Margin ${c.marginPercent}% < 20%` : '',
      ].filter(Boolean),
  },
  {
    level: 3,
    name: 'Legal Approval',
    role: 'Legal Counsel',
    approverId: 'USR-11',
    when: (c) => [c.riskLevel === 'High' ? 'High risk level' : '', c.legalFlags ? 'Non-standard legal terms' : '', /Framework|Master|Subcontractor|Lease/.test(c.type) ? `${c.type}` : ''].filter(Boolean),
  },
  {
    level: 4,
    name: 'Management Approval',
    role: 'Operations Director',
    approverId: 'USR-13',
    when: (c) =>
      [c.value >= 1_000_000 ? 'Contract value ≥ 1,000,000' : '', c.durationMonths > 36 ? `Duration ${c.durationMonths} months > 36` : '', c.customerType === 'Government' ? 'Government customer' : ''].filter(Boolean),
  },
];

/** Contract-level actions and the statuses they are allowed from. */
export const ALLOWED_ACTIONS: Readonly<Record<string, readonly ContractStatus[]>> = {
  edit: ['Draft', 'Under Review', 'Under Negotiation'],
  submitReview: ['Draft', 'Under Negotiation'],
  negotiate: ['Under Review'],
  submitApproval: ['Draft', 'Under Review', 'Under Negotiation'],
  sendSignature: ['Approved'],
  activate: ['Approved', 'Pending Signature', 'Partially Signed'],
  suspend: ['Active', 'Expiring Soon'],
  reactivate: ['Suspended'],
  amend: ['Active', 'Expiring Soon', 'Suspended'],
  renew: ['Active', 'Expiring Soon', 'Expired'],
  terminate: ['Active', 'Expiring Soon', 'Suspended'],
  archive: ['Expired', 'Terminated', 'Renewed', 'Cancelled'],
  cancel: ['Draft', 'Under Review', 'Under Negotiation', 'Pending Approval', 'Approved', 'Pending Signature'],
};
