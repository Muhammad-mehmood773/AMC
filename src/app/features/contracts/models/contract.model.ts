import type { Auditable, Identifiable } from '@shared/models/entity';

/** SRS 5.2 — customer contract types. */
export const CUSTOMER_CONTRACT_TYPES = [
  'Service Contract',
  'AMC Contract',
  'Maintenance Contract',
  'Support Contract',
  'Managed Service Contract',
  'Project / Installation Contract',
  'Subscription Contract',
  'Framework Agreement',
  'Master Service Agreement',
] as const;

/** SRS 5.2 — other contract types. */
export const OTHER_CONTRACT_TYPES = ['Vendor Contract', 'Supplier Contract', 'Partner Contract', 'Subcontractor Contract', 'Lease Contract'] as const;

export const CONTRACT_TYPES = [...CUSTOMER_CONTRACT_TYPES, ...OTHER_CONTRACT_TYPES, 'Other'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const isCustomerContract = (type: string) => (CUSTOMER_CONTRACT_TYPES as readonly string[]).includes(type) || type === 'Other';

/** SRS 5.19 — standard status lifecycle. */
export const CONTRACT_STATUSES = [
  'Draft',
  'Under Review',
  'Under Negotiation',
  'Pending Approval',
  'Approved',
  'Pending Signature',
  'Partially Signed',
  'Active',
  'Suspended',
  'Expiring Soon',
  'Expired',
  'Terminated',
  'Renewed',
  'Archived',
  'Cancelled',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Statuses during which the contract terms can still be edited directly. */
export const EDITABLE_STATUSES: readonly ContractStatus[] = ['Draft', 'Under Review', 'Under Negotiation'];
/** Statuses that provide operational coverage (SRS 5.24). */
export const LIVE_STATUSES: readonly ContractStatus[] = ['Active', 'Expiring Soon'];
/** Terminal statuses. */
export const CLOSED_STATUSES: readonly ContractStatus[] = ['Expired', 'Terminated', 'Renewed', 'Archived', 'Cancelled'];

export const APPROVAL_STATUSES = ['Not Submitted', 'Pending', 'Approved', 'Rejected', 'Returned for Changes', 'Cancelled'] as const;
export type ContractApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** SRS 5.13 */
export const SIGNATURE_STATUSES = ['Not Sent', 'Sent', 'Viewed', 'Partially Signed', 'Fully Signed', 'Declined', 'Expired', 'Cancelled'] as const;
export type SignatureStatus = (typeof SIGNATURE_STATUSES)[number];

/** SRS 5.7 E */
export const BILLING_FREQUENCIES = ['One-Time', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Milestone-Based', 'Usage-Based', 'Other'] as const;
export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];

export const BILLING_METHODS = ['Fixed Fee', 'Time & Material', 'Per Visit', 'Milestone', 'Usage-Based'] as const;
export const RISK_LEVELS = ['Low', 'Medium', 'High'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export const DISPUTE_METHODS = ['Negotiation', 'Mediation', 'Arbitration', 'Litigation'] as const;
export const SERVICE_WINDOWS = ['Business Hours (08:00–17:00)', 'Extended Hours (07:00–22:00)', '24/7'] as const;

/** Seed values maintained through the generic lookup mechanism. */
export const CONTRACT_CATEGORIES = ['Comprehensive', 'Non-Comprehensive', 'Labour Only', 'Planned Maintenance', 'Reactive', 'Project', 'Framework', 'Procurement'] as const;
export const GOVERNING_LAWS = ['Kingdom of Saudi Arabia', 'United Arab Emirates', 'State of Qatar', 'Kingdom of Bahrain', 'England & Wales'] as const;
export const JURISDICTIONS = ['Riyadh Commercial Court', 'Jeddah Commercial Court', 'Dammam Commercial Court', 'Dubai Courts', 'DIFC Courts', 'SCCA Arbitration'] as const;
export const COST_CENTERS = ['CC-100 Operations Central', 'CC-200 Operations Western', 'CC-300 Operations Eastern', 'CC-400 Projects', 'CC-500 Procurement'] as const;
export const PROFIT_CENTERS = ['PC-10 Facility Services', 'PC-20 Technical Maintenance', 'PC-30 Projects & Installation', 'PC-40 Managed Services'] as const;

export interface ContractParties {
  readonly customerId: string | null;
  readonly legalEntity: string;
  readonly contractingOrganizationId: string;
  readonly branchId: string | null;
  readonly vendorPartner: string;
  readonly primaryContact: string;
  readonly ownerId: string;
  readonly managerId: string;
  readonly accountManagerId: string | null;
}

export interface ContractPeriod {
  readonly effectiveDate: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly renewalDate: string | null;
  readonly noticePeriodDays: number;
  readonly autoRenewal: boolean;
  readonly renewalTermMonths: number | null;
  /** Time-bound contracts require start and end dates (SRS 5.21). */
  readonly timeBound: boolean;
}

export interface ContractScope {
  readonly scope: string;
  readonly serviceIds: readonly string[];
  readonly siteIds: readonly string[];
  readonly assetIds: readonly string[];
  readonly serviceCategories: readonly string[];
  readonly slaId: string | null;
  readonly maintenanceRequirements: string;
  readonly exclusions: string;
}

export interface ContractCommercial {
  readonly value: number;
  readonly currency: string;
  readonly billingFrequency: BillingFrequency;
  readonly paymentTermsId: string | null;
  readonly billingMethod: string;
  readonly taxProfileId: string | null;
  readonly discountPercent: number;
  readonly deposit: number | null;
  readonly advancePayment: number | null;
  readonly priceEscalationPercent: number | null;
  readonly priceRevisionDate: string | null;
}

export interface ContractFinancial {
  readonly estimatedRevenue: number;
  readonly estimatedCost: number;
  readonly billingAccount: string;
  readonly revenueAccount: string;
  readonly costCenter: string;
  readonly profitCenter: string;
}

export interface ContractServiceInfo {
  readonly serviceFrequency: string;
  readonly includedVisits: number | null;
  readonly laborCoverage: boolean;
  readonly partsCoverage: boolean;
  readonly travelCoverage: boolean;
  readonly emergencyCoverage: boolean;
  readonly serviceWindow: string;
}

export interface ContractLegal {
  readonly governingLaw: string;
  readonly jurisdiction: string;
  readonly confidentiality: boolean;
  readonly insuranceRequirement: string;
  readonly complianceRequirements: string;
  readonly penaltyTerms: string;
  readonly liabilityLimit: number | null;
  readonly terminationConditions: string;
  readonly disputeResolution: string;
}

export interface ContractNotes {
  readonly internal: string;
  readonly customer: string;
  readonly legal: string;
  readonly manager: string;
}

/** SRS 5.23 — values integrated from Billing & Cost modules (mock-maintained here). */
export interface ContractTracking {
  readonly billed: number;
  readonly collected: number;
  readonly recognizedRevenue: number;
  readonly actualCost: number;
  readonly additionalCharges: number;
  readonly slaBreaches: number;
}

/** SRS 5.7 — the contract record. */
export interface Contract extends Identifiable, Auditable {
  readonly number: string;
  readonly title: string;
  readonly type: ContractType;
  readonly category: string;
  readonly status: ContractStatus;
  readonly version: string;
  readonly parentContractId: string | null;
  /** Renewal relationship (SRS 5.21) — the contract this one renews. */
  readonly previousContractId: string | null;
  readonly externalReference: string;
  readonly requestId: string | null;
  readonly templateId: string | null;
  readonly clauseIds: readonly string[];
  readonly riskLevel: RiskLevel;
  readonly signatureRequired: boolean;
  readonly approvalStatus: ContractApprovalStatus;
  readonly signatureStatus: SignatureStatus;
  readonly executionDate: string | null;
  readonly activatedAt: string | null;
  readonly suspendedReason: string | null;
  readonly parties: ContractParties;
  readonly period: ContractPeriod;
  readonly scopeInfo: ContractScope;
  readonly commercial: ContractCommercial;
  readonly financial: ContractFinancial;
  readonly service: ContractServiceInfo;
  readonly legal: ContractLegal;
  readonly notes: ContractNotes;
  readonly tracking: ContractTracking;
}

/** Editable terms (identification + sections B–J). */
export type ContractUpsert = Omit<
  Contract,
  keyof Identifiable | keyof Auditable | 'status' | 'version' | 'approvalStatus' | 'signatureStatus' | 'executionDate' | 'activatedAt' | 'suspendedReason' | 'tracking' | 'previousContractId'
>;

export interface ContractListItem extends Contract {
  /** Status adjusted for dates (Active → Expiring Soon / Expired). */
  readonly effectiveStatus: ContractStatus;
  readonly customerName: string | null;
  readonly customerCode: string | null;
  readonly siteNames: readonly string[];
  readonly ownerName: string;
  readonly managerName: string;
  readonly accountManagerName: string | null;
  readonly companyName: string;
  readonly branchName: string | null;
  readonly slaName: string | null;
  readonly durationMonths: number;
  readonly daysRemaining: number;
  readonly margin: number;
  readonly marginPercent: number;
  readonly remainingValue: number;
  readonly outstanding: number;
  readonly openObligations: number;
  readonly overdueObligations: number;
  readonly completedObligations: number;
  readonly openAmendments: number;
  readonly slaBreaches: number;
  readonly renewalStatus: string;
  readonly renewedById: string | null;
}

export interface ContractFilter {
  readonly customerId?: string;
}
