import type { Auditable, Identifiable } from '@shared/models/entity';
import type { SignatureStatus } from './contract.model';
import type { Priority } from './shared.model';

// ── 5.6 Contract Request ─────────────────────────────────────────────────────
export const REQUEST_TYPES = ['New Contract', 'Renewal', 'Extension', 'Amendment', 'Replacement', 'Other'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export const REQUEST_STATUSES = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Converted to Contract', 'Cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
}

export interface ContractRequest extends Identifiable, Auditable {
  readonly number: string;
  readonly customerId: string;
  readonly siteId: string | null;
  readonly requestType: RequestType;
  readonly contractType: string;
  readonly requestedStart: string;
  readonly requestedEnd: string;
  readonly estimatedValue: number;
  readonly currency: string;
  readonly requestedServices: string;
  readonly requiredSla: string | null;
  readonly requiredEntitlements: string;
  readonly justification: string;
  readonly requestedBy: string;
  readonly ownerId: string;
  readonly priority: Priority;
  readonly status: RequestStatus;
  readonly relatedContractId: string | null;
  readonly convertedContractId: string | null;
  readonly decisionComment: string;
  readonly attachments: readonly Attachment[];
  readonly notes: string;
}

export type RequestInput = Omit<ContractRequest, keyof Identifiable | keyof Auditable | 'number' | 'status' | 'convertedContractId' | 'decisionComment'>;

export interface RequestListItem extends ContractRequest {
  readonly customerName: string;
  readonly siteName: string | null;
  readonly ownerName: string;
  readonly convertedNumber: string | null;
}

// ── 5.9 Templates & 5.10 Clauses ─────────────────────────────────────────────
export const TEMPLATE_LANGUAGES = ['English', 'Arabic', 'English / Arabic (bilingual)'] as const;
export const RECORD_STATUSES = ['Active', 'Inactive', 'Draft'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const REQUIRABLE_FIELDS = [
  'Customer Legal Entity', 'Primary Contact', 'Renewal Date', 'Notice Period', 'Services Covered', 'Sites Covered', 'Assets Covered', 'SLA', 'Payment Terms',
  'Tax Profile', 'Governing Law', 'Jurisdiction', 'Liability Limit', 'Insurance Requirement', 'Cost Center', 'Customer PO',
] as const;

export interface ContractTemplate extends Identifiable, Auditable {
  readonly code: string;
  readonly name: string;
  readonly contractType: string;
  readonly description: string;
  readonly version: string;
  readonly status: RecordStatus;
  readonly language: string;
  readonly effectiveDate: string;
  readonly expiryDate: string | null;
  readonly defaultTerms: string;
  readonly defaultClauseIds: readonly string[];
  readonly requiredFields: readonly string[];
  readonly previousVersionId: string | null;
}

export type TemplateInput = Omit<ContractTemplate, keyof Identifiable | keyof Auditable | 'previousVersionId'>;

export interface TemplateListItem extends ContractTemplate {
  readonly clauseNames: readonly string[];
  readonly usageCount: number;
}

export const CLAUSE_TYPES = [
  'Payment Terms', 'SLA', 'Warranty', 'Confidentiality', 'Liability', 'Insurance', 'Penalty', 'Termination', 'Renewal', 'Price Escalation', 'Data Protection',
  'Compliance', 'Dispute Resolution', 'Force Majeure', 'Intellectual Property', 'Other',
] as const;
export type ClauseType = (typeof CLAUSE_TYPES)[number];

export interface ContractClause extends Identifiable, Auditable {
  readonly code: string;
  readonly name: string;
  readonly type: ClauseType;
  readonly text: string;
  readonly version: string;
  readonly mandatory: boolean;
  readonly status: RecordStatus;
  readonly effectiveDate: string;
  readonly approvalRequired: boolean;
  readonly previousVersionId: string | null;
}

export type ClauseInput = Omit<ContractClause, keyof Identifiable | keyof Auditable | 'previousVersionId'>;

export interface ClauseListItem extends ContractClause {
  readonly templateCount: number;
  readonly contractCount: number;
}

// ── 5.11 Review & Negotiation ────────────────────────────────────────────────
export const REVIEW_TYPES = ['Commercial Review', 'Legal Review', 'Technical Review', 'Financial Review', 'Compliance Review', 'Management Review'] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];
export const REVIEW_STATUSES = ['Pending', 'In Review', 'Changes Requested', 'Reviewed', 'Approved', 'Rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface ContractReview {
  readonly id: string;
  readonly contractId: string;
  readonly reviewerId: string;
  readonly type: ReviewType;
  readonly reviewDate: string;
  readonly dueDate: string;
  readonly status: ReviewStatus;
  readonly comments: string;
  readonly attachments: readonly Attachment[];
  readonly createdAt: string;
}

export const COMMENT_VISIBILITY = ['Internal', 'External'] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITY)[number];

/** Negotiation history entry — comments, redlines and clause changes. */
export interface NegotiationEntry {
  readonly id: string;
  readonly contractId: string;
  readonly at: string;
  readonly author: string;
  readonly party: 'Company' | 'Customer' | 'Counterparty';
  readonly visibility: CommentVisibility;
  readonly kind: 'Comment' | 'Redline' | 'Clause Change' | 'Review Note';
  readonly section: string;
  readonly original: string | null;
  readonly proposed: string | null;
  readonly text: string;
  readonly resolved: boolean;
}

export interface ReviewListItem extends ContractReview {
  readonly contractNumber: string;
  readonly contractTitle: string;
  readonly customerName: string | null;
  readonly reviewerName: string;
  readonly overdue: boolean;
}

// ── 5.12 Approval ────────────────────────────────────────────────────────────
export const APPROVAL_STEP_STATUSES = ['Pending', 'Approved', 'Rejected', 'Returned for Changes', 'Cancelled', 'Waiting'] as const;
export type ApprovalStepStatus = (typeof APPROVAL_STEP_STATUSES)[number];

export interface ApprovalStep {
  readonly id: string;
  readonly contractId: string;
  /** Approval subject — the contract itself, an amendment or a renewal. */
  readonly subject: 'Contract' | 'Amendment' | 'Renewal' | 'Termination';
  readonly subjectId: string;
  readonly round: number;
  readonly level: number;
  readonly levelName: string;
  readonly role: string;
  readonly approverId: string;
  readonly delegateId: string | null;
  readonly status: ApprovalStepStatus;
  readonly decidedAt: string | null;
  readonly comments: string;
  readonly reasons: readonly string[];
  readonly createdAt: string;
}

export interface ApprovalListItem extends ApprovalStep {
  readonly contractNumber: string;
  readonly contractTitle: string;
  readonly customerName: string | null;
  readonly value: number;
  readonly currency: string;
  readonly approverName: string;
  readonly delegateName: string | null;
  readonly subjectLabel: string;
}

// ── 5.13 Execution / E-Signature ─────────────────────────────────────────────
export const SIGNER_STATUSES = ['Waiting', 'Sent', 'Viewed', 'Signed', 'Declined', 'Expired', 'Cancelled'] as const;
export type SignerStatus = (typeof SIGNER_STATUSES)[number];

export interface Signatory {
  readonly id: string;
  readonly contractId: string;
  readonly envelopeId: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly party: 'Company' | 'Customer' | 'Counterparty';
  readonly order: number;
  readonly status: SignerStatus;
  readonly sentAt: string | null;
  readonly viewedAt: string | null;
  readonly signedAt: string | null;
  readonly ipAddress: string | null;
}

export interface SignatureEnvelope {
  readonly id: string;
  readonly contractId: string;
  readonly finalVersion: string;
  readonly provider: string;
  readonly sentAt: string;
  readonly expiresAt: string;
  readonly completedAt: string | null;
  readonly status: 'Sent' | 'Completed' | 'Declined' | 'Expired' | 'Cancelled';
  readonly signedDocumentId: string | null;
}

export interface SignatureListItem {
  readonly contractId: string;
  readonly contractNumber: string;
  readonly contractTitle: string;
  readonly customerName: string | null;
  readonly envelope: SignatureEnvelope | null;
  readonly signatories: readonly Signatory[];
  readonly signatureStatus: SignatureStatus;
  readonly signedCount: number;
  readonly executionDate: string | null;
}

// ── 5.14 Obligations ─────────────────────────────────────────────────────────
export const OBLIGATION_TYPES = [
  'Service Obligation', 'Payment Obligation', 'Maintenance Obligation', 'Reporting Obligation', 'Compliance Obligation', 'Documentation Obligation',
  'Insurance Obligation', 'Inspection Obligation', 'Renewal Notice', 'Regulatory Obligation', 'Other',
] as const;
export type ObligationType = (typeof OBLIGATION_TYPES)[number];
export const OBLIGATION_STATUSES = ['Pending', 'In Progress', 'Completed', 'Overdue', 'Waived', 'Cancelled'] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];
export const OBLIGATION_FREQUENCIES = ['One-Time', 'Weekly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual'] as const;
export const RESPONSIBLE_PARTIES = ['Company', 'Customer', 'Vendor / Partner', 'Both Parties'] as const;

export interface Obligation extends Identifiable, Auditable {
  readonly number: string;
  readonly contractId: string;
  readonly type: ObligationType;
  readonly description: string;
  readonly responsibleParty: string;
  readonly responsibleUserId: string | null;
  readonly dueDate: string;
  readonly frequency: string;
  readonly priority: Priority;
  readonly status: ObligationStatus;
  readonly evidenceRequired: boolean;
  readonly evidence: readonly Attachment[];
  readonly completionDate: string | null;
  readonly escalated: boolean;
  readonly notes: string;
}

export type ObligationInput = Omit<Obligation, keyof Identifiable | keyof Auditable | 'number' | 'evidence' | 'completionDate' | 'escalated'>;

export interface ObligationListItem extends Obligation {
  readonly effectiveStatus: ObligationStatus;
  readonly contractNumber: string;
  readonly contractTitle: string;
  readonly customerName: string | null;
  readonly responsibleUserName: string | null;
  readonly daysToDue: number;
}

// ── 5.15 Amendments ──────────────────────────────────────────────────────────
export const AMENDMENT_TYPES = [
  'Scope Change', 'Price Change', 'Service Change', 'SLA Change', 'Asset Addition', 'Asset Removal', 'Site Addition', 'Site Removal', 'Duration Extension',
  'Commercial Change', 'Legal Change', 'Other',
] as const;
export type AmendmentType = (typeof AMENDMENT_TYPES)[number];
export const AMENDMENT_STATUSES = ['Requested', 'Under Review', 'Under Negotiation', 'Pending Approval', 'Approved', 'Executed', 'Rejected', 'Cancelled'] as const;
export type AmendmentStatus = (typeof AMENDMENT_STATUSES)[number];

/** Structured change applied to the contract when the amendment is executed. */
export interface AmendmentChanges {
  readonly value?: number;
  readonly endDate?: string;
  readonly slaId?: string | null;
  readonly addSiteIds?: readonly string[];
  readonly removeSiteIds?: readonly string[];
  readonly addAssetIds?: readonly string[];
  readonly removeAssetIds?: readonly string[];
  readonly addServiceIds?: readonly string[];
  readonly removeServiceIds?: readonly string[];
}

export interface Amendment extends Identifiable, Auditable {
  readonly number: string;
  readonly contractId: string;
  readonly type: AmendmentType;
  readonly effectiveDate: string;
  readonly requestedBy: string;
  readonly reason: string;
  readonly previousTerms: string;
  readonly newTerms: string;
  readonly commercialImpact: number;
  readonly serviceImpact: string;
  readonly changes: AmendmentChanges;
  readonly status: AmendmentStatus;
  readonly documentId: string | null;
  readonly resultingVersion: string | null;
  readonly notes: string;
}

export type AmendmentInput = Omit<Amendment, keyof Identifiable | keyof Auditable | 'number' | 'status' | 'resultingVersion'>;

export interface AmendmentListItem extends Amendment {
  readonly contractNumber: string;
  readonly contractTitle: string;
  readonly customerName: string | null;
  readonly currency: string;
}

// ── 5.16 Renewal / Extension ─────────────────────────────────────────────────
export const RENEWAL_TYPES = ['Standard Renewal', 'Renewal with Price Change', 'Renewal with Scope Change', 'Extension', 'Automatic Renewal', 'Renewal with Amendment'] as const;
export type RenewalType = (typeof RENEWAL_TYPES)[number];
export const RENEWAL_STATUSES = ['Requested', 'Under Review', 'Commercial Review', 'Pending Approval', 'Approved', 'Completed', 'Rejected', 'Cancelled'] as const;
export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

export interface Renewal extends Identifiable, Auditable {
  readonly number: string;
  readonly contractId: string;
  readonly type: RenewalType;
  readonly startDate: string;
  readonly endDate: string;
  readonly termMonths: number;
  readonly value: number;
  readonly priceAdjustmentPercent: number;
  readonly revisedServices: string;
  readonly revisedSla: string | null;
  readonly revisedEntitlements: string;
  readonly revisedPaymentTerms: string | null;
  readonly reason: string;
  readonly status: RenewalStatus;
  readonly newContractId: string | null;
}

export type RenewalInput = Omit<Renewal, keyof Identifiable | keyof Auditable | 'number' | 'status' | 'newContractId'>;

export interface RenewalListItem extends Renewal {
  readonly contractNumber: string;
  readonly contractTitle: string;
  readonly customerName: string | null;
  readonly currentValue: number;
  readonly currency: string;
  readonly currentEnd: string;
  readonly newContractNumber: string | null;
}

/** Renewal pipeline entry — contracts approaching expiry (SRS 5.16 expiry monitoring). */
export interface RenewalCandidate {
  readonly contractId: string;
  readonly number: string;
  readonly title: string;
  readonly customerName: string | null;
  readonly endDate: string;
  readonly daysRemaining: number;
  readonly value: number;
  readonly currency: string;
  readonly autoRenewal: boolean;
  readonly noticeStarted: boolean;
  readonly renewalId: string | null;
  readonly renewalStatus: string | null;
}

// ── 5.17 Termination ─────────────────────────────────────────────────────────
export const TERMINATION_TYPES = ['Customer Termination', 'Company Termination', 'Mutual Termination', 'Contractual Termination', 'Early Termination', 'Non-Renewal', 'Breach Termination'] as const;
export type TerminationType = (typeof TERMINATION_TYPES)[number];
export const TERMINATION_STATUSES = ['Requested', 'Under Review', 'Approved', 'Notice Issued', 'Final Service', 'Settlement', 'Closed', 'Rejected', 'Cancelled'] as const;
export type TerminationStatus = (typeof TERMINATION_STATUSES)[number];
export const TERMINATION_FLOW: readonly TerminationStatus[] = ['Requested', 'Under Review', 'Approved', 'Notice Issued', 'Final Service', 'Settlement', 'Closed'];

export interface Termination extends Identifiable, Auditable {
  readonly number: string;
  readonly contractId: string;
  readonly type: TerminationType;
  readonly terminationDate: string;
  readonly requestedBy: string;
  readonly approvedBy: string | null;
  readonly reason: string;
  readonly noticePeriodDays: number;
  readonly financialSettlement: string;
  readonly outstandingAmount: number;
  readonly outstandingObligations: number;
  readonly finalServiceDate: string;
  readonly documentId: string | null;
  readonly status: TerminationStatus;
  readonly notes: string;
}

export type TerminationInput = Omit<Termination, keyof Identifiable | keyof Auditable | 'number' | 'status' | 'approvedBy' | 'outstandingObligations'>;

export interface TerminationListItem extends Termination {
  readonly contractNumber: string;
  readonly contractTitle: string;
  readonly customerName: string | null;
  readonly currency: string;
}

// ── 5.22 Versions & documents ────────────────────────────────────────────────
export interface ContractVersion {
  readonly id: string;
  readonly contractId: string;
  readonly version: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly changeSummary: string;
  readonly approvalStatus: string;
  readonly executionStatus: 'Not Executed' | 'Executed' | 'Superseded';
  readonly documentId: string | null;
  /** Snapshot of the terms for version / clause comparison. */
  readonly snapshot: Readonly<Record<string, string>>;
}

export const DOCUMENT_TYPES = ['Contract Document', 'Signed Contract', 'Supporting Document', 'Proposal', 'Quotation', 'Customer PO', 'Legal Document', 'Amendment', 'Termination Notice', 'Evidence', 'Other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface ContractDocument {
  readonly id: string;
  readonly contractId: string;
  readonly name: string;
  readonly type: DocumentType;
  readonly version: number;
  readonly size: number;
  readonly mime: string;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly supersededById: string | null;
  readonly locked: boolean;
  readonly reference: string;
}

// ── 5.18 History & 5.20 Notifications ────────────────────────────────────────
export const HISTORY_ACTIONS = [
  'Contract Created', 'Contract Updated', 'Submitted for Review', 'Reviewed', 'Negotiated', 'Approved', 'Rejected', 'Sent for Signature', 'Signed', 'Activated',
  'Amended', 'Renewed', 'Suspended', 'Terminated', 'Expired', 'Archived', 'Cancelled', 'Request Created', 'Request Updated', 'Obligation Updated', 'Document Uploaded',
  'Template Updated', 'Clause Updated', 'Reactivated',
] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];
export const HISTORY_ENTITIES = ['Contract', 'Request', 'Review', 'Approval', 'Signature', 'Obligation', 'Amendment', 'Renewal', 'Termination', 'Document', 'Template', 'Clause'] as const;
export type HistoryEntity = (typeof HISTORY_ENTITIES)[number];

export interface ContractHistoryEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly user: string;
  readonly action: HistoryAction;
  readonly entity: HistoryEntity;
  readonly entityId: string;
  readonly contractId: string | null;
  readonly label: string;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly reference: string | null;
  readonly comments: string;
  readonly systemReference: string;
}

export const NOTIFICATION_TYPES = [
  'Contract Created', 'Approval Required', 'Signature Required', 'Contract Activated', 'Contract Expiry', 'Renewal Due', 'Notice Period Started', 'Obligation Due',
  'Obligation Overdue', 'Contract Amendment', 'Contract Suspended', 'Contract Terminated',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface ContractAlert {
  readonly id: string;
  readonly type: NotificationType;
  readonly contractId: string;
  readonly contractNumber: string;
  readonly message: string;
  readonly dueDate: string | null;
  readonly severity: 'info' | 'warn' | 'danger';
}

export interface HistoryFilter {
  readonly contractId?: string;
  readonly entity?: HistoryEntity;
}
