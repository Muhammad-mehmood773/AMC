import type { IconName } from '@shared/ui/icon';
import type { BadgeTone } from '@shared/ui/status-badge';
import type { ContractApprovalStatus, ContractStatus, SignatureStatus } from './contract.model';
import type {
  AmendmentStatus,
  ApprovalStepStatus,
  HistoryAction,
  ObligationStatus,
  RecordStatus,
  RenewalStatus,
  RequestStatus,
  ReviewStatus,
  SignerStatus,
  TerminationStatus,
} from './workflow.model';

export const CONTRACT_STATUS_TONE: Record<ContractStatus, BadgeTone> = {
  Draft: 'neutral',
  'Under Review': 'info',
  'Under Negotiation': 'accent',
  'Pending Approval': 'warn',
  Approved: 'brand',
  'Pending Signature': 'warn',
  'Partially Signed': 'accent',
  Active: 'ok',
  Suspended: 'warn',
  'Expiring Soon': 'warn',
  Expired: 'danger',
  Terminated: 'danger',
  Renewed: 'info',
  Archived: 'neutral',
  Cancelled: 'neutral',
};

export const APPROVAL_TONE: Record<ContractApprovalStatus, BadgeTone> = {
  'Not Submitted': 'neutral',
  Pending: 'warn',
  Approved: 'ok',
  Rejected: 'danger',
  'Returned for Changes': 'accent',
  Cancelled: 'neutral',
};

export const SIGNATURE_TONE: Record<SignatureStatus, BadgeTone> = {
  'Not Sent': 'neutral',
  Sent: 'info',
  Viewed: 'accent',
  'Partially Signed': 'warn',
  'Fully Signed': 'ok',
  Declined: 'danger',
  Expired: 'danger',
  Cancelled: 'neutral',
};

export const REQUEST_TONE: Record<RequestStatus, BadgeTone> = {
  Draft: 'neutral',
  Submitted: 'info',
  'Under Review': 'accent',
  Approved: 'ok',
  Rejected: 'danger',
  'Converted to Contract': 'brand',
  Cancelled: 'neutral',
};

export const RECORD_TONE: Record<RecordStatus, BadgeTone> = { Active: 'ok', Inactive: 'neutral', Draft: 'accent' };

export const REVIEW_TONE: Record<ReviewStatus, BadgeTone> = {
  Pending: 'neutral',
  'In Review': 'info',
  'Changes Requested': 'warn',
  Reviewed: 'ok',
  Approved: 'ok',
  Rejected: 'danger',
};

export const STEP_TONE: Record<ApprovalStepStatus, BadgeTone> = {
  Waiting: 'neutral',
  Pending: 'warn',
  Approved: 'ok',
  Rejected: 'danger',
  'Returned for Changes': 'accent',
  Cancelled: 'neutral',
};

export const SIGNER_TONE: Record<SignerStatus, BadgeTone> = {
  Waiting: 'neutral',
  Sent: 'info',
  Viewed: 'accent',
  Signed: 'ok',
  Declined: 'danger',
  Expired: 'danger',
  Cancelled: 'neutral',
};

export const OBLIGATION_TONE: Record<ObligationStatus, BadgeTone> = {
  Pending: 'neutral',
  'In Progress': 'info',
  Completed: 'ok',
  Overdue: 'danger',
  Waived: 'accent',
  Cancelled: 'neutral',
};

export const AMENDMENT_TONE: Record<AmendmentStatus, BadgeTone> = {
  Requested: 'neutral',
  'Under Review': 'info',
  'Under Negotiation': 'accent',
  'Pending Approval': 'warn',
  Approved: 'brand',
  Executed: 'ok',
  Rejected: 'danger',
  Cancelled: 'neutral',
};

export const RENEWAL_TONE: Record<RenewalStatus, BadgeTone> = {
  Requested: 'neutral',
  'Under Review': 'info',
  'Commercial Review': 'accent',
  'Pending Approval': 'warn',
  Approved: 'brand',
  Completed: 'ok',
  Rejected: 'danger',
  Cancelled: 'neutral',
};

export const TERMINATION_TONE: Record<TerminationStatus, BadgeTone> = {
  Requested: 'neutral',
  'Under Review': 'info',
  Approved: 'brand',
  'Notice Issued': 'warn',
  'Final Service': 'warn',
  Settlement: 'accent',
  Closed: 'danger',
  Rejected: 'neutral',
  Cancelled: 'neutral',
};

export const HISTORY_ICON: Partial<Record<HistoryAction, IconName>> = {
  'Contract Created': 'plus',
  'Contract Updated': 'pencil',
  'Submitted for Review': 'send',
  Reviewed: 'eye',
  Negotiated: 'users',
  Approved: 'check-circle',
  Rejected: 'x',
  'Sent for Signature': 'send',
  Signed: 'pen-tool',
  Activated: 'play',
  Amended: 'layers',
  Renewed: 'refresh',
  Suspended: 'pause',
  Reactivated: 'play',
  Terminated: 'ban',
  Expired: 'clock',
  Archived: 'archive',
  Cancelled: 'x',
  'Request Created': 'inbox',
  'Obligation Updated': 'clipboard-list',
  'Document Uploaded': 'paperclip',
  'Template Updated': 'file-text',
  'Clause Updated': 'file-text',
};

export const HISTORY_TONE: Partial<Record<HistoryAction, BadgeTone>> = {
  'Contract Created': 'brand',
  Approved: 'ok',
  Signed: 'ok',
  Activated: 'ok',
  Reactivated: 'ok',
  Rejected: 'danger',
  Terminated: 'danger',
  Expired: 'danger',
  Suspended: 'warn',
  Amended: 'accent',
  Renewed: 'info',
  'Sent for Signature': 'info',
  'Submitted for Review': 'info',
};

export const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  brand: 'bg-brand-subtle text-brand',
  ok: 'bg-ok-subtle text-ok',
  warn: 'bg-warn-subtle text-warn',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent',
};
