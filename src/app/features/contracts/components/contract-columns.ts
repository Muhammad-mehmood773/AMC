import type { DataColumn } from '@shared/ui/data-table';
import type { ContractListItem } from '../models/contract.model';
import {
  AMENDMENT_TONE,
  APPROVAL_TONE,
  CONTRACT_STATUS_TONE,
  OBLIGATION_TONE,
  RENEWAL_TONE,
  REQUEST_TONE,
  REVIEW_TONE,
  SIGNATURE_TONE,
  STEP_TONE,
  TERMINATION_TONE,
} from '../models/display';
import type {
  AmendmentListItem,
  ApprovalListItem,
  ObligationListItem,
  RenewalListItem,
  RequestListItem,
  ReviewListItem,
  TerminationListItem,
} from '../models/workflow.model';

const contractLink = (id: string) => `/app/contracts/${id}`;

/** SRS 5.5 list columns. */
export function contractColumns(showCustomer = true): DataColumn<ContractListItem>[] {
  return [
    { key: 'title', label: 'Contract', value: (c) => c.title, secondary: (c) => `${c.number} · v${c.version}`, link: (c) => contractLink(c.id), sortable: true, mobile: 'title', width: 280, hideable: false },
    { key: 'number', label: 'Contract Number', value: (c) => c.number, type: 'mono', sortable: true, visibility: '2xl', width: 130 },
    { key: 'type', label: 'Contract Type', value: (c) => c.type, secondary: (c) => c.category, sortable: true, visibility: 'lg', mobile: 'meta', width: 190 },
    ...(showCustomer ? [{ key: 'customer', label: 'Customer', value: (c: ContractListItem) => c.customerName, secondary: (c: ContractListItem) => c.customerCode, link: (c: ContractListItem) => (c.parties.customerId ? `/app/customers/${c.parties.customerId}` : null), sortable: true, visibility: 'md' as const, mobile: 'meta' as const, width: 220 }] : []),
    { key: 'site', label: 'Site', value: (c) => (c.siteNames.length === 1 ? c.siteNames[0] : c.siteNames.length ? `${c.siteNames.length} sites` : null), visibility: '2xl', width: 150 },
    { key: 'owner', label: 'Contract Owner', value: (c) => c.ownerName, secondary: (c) => c.managerName, sortable: true, visibility: 'xl', width: 160 },
    { key: 'start', label: 'Start Date', value: (c) => c.period.startDate, type: 'date', sortable: true, visibility: 'xl', width: 120 },
    { key: 'end', label: 'End Date', value: (c) => c.period.endDate, type: 'date', sortable: true, visibility: 'md', mobile: 'meta', width: 120 },
    { key: 'renewal', label: 'Renewal Date', value: (c) => c.period.renewalDate, type: 'date', sortable: true, visibility: '2xl', width: 120 },
    { key: 'value', label: 'Contract Value', value: (c) => c.commercial.value, type: 'currency', currency: (c) => c.commercial.currency, sortable: true, visibility: 'lg', width: 140 },
    { key: 'currency', label: 'Currency', value: (c) => c.commercial.currency, visibility: '2xl', width: 90 },
    { key: 'status', label: 'Status', value: (c) => c.effectiveStatus, type: 'badge', tone: (c) => CONTRACT_STATUS_TONE[c.effectiveStatus], sortable: true, mobile: 'badge', width: 140 },
    { key: 'approval', label: 'Approval Status', value: (c) => c.approvalStatus, type: 'badge', tone: (c) => APPROVAL_TONE[c.approvalStatus], sortable: true, visibility: 'xl', width: 140 },
    { key: 'signature', label: 'Signature Status', value: (c) => (c.signatureRequired ? c.signatureStatus : 'Not required'), type: 'badge', tone: (c) => (c.signatureRequired ? SIGNATURE_TONE[c.signatureStatus] : 'neutral'), sortable: true, visibility: 'xl', width: 140 },
    { key: 'created', label: 'Created', value: (c) => c.createdAt, type: 'date', sortable: true, visibility: '2xl', width: 120 },
  ];
}

export function requestColumns(): DataColumn<RequestListItem>[] {
  return [
    { key: 'number', label: 'Request', value: (r) => r.number, secondary: (r) => r.requestType, mobile: 'title', sortable: true, width: 150 },
    { key: 'customer', label: 'Customer', value: (r) => r.customerName, secondary: (r) => r.siteName, link: (r) => `/app/customers/${r.customerId}`, sortable: true, mobile: 'meta', width: 220 },
    { key: 'type', label: 'Contract Type', value: (r) => r.contractType, sortable: true, visibility: 'lg', width: 170 },
    { key: 'period', label: 'Requested Period', value: (r) => `${r.requestedStart} → ${r.requestedEnd}`, visibility: 'xl', width: 200 },
    { key: 'value', label: 'Estimated Value', value: (r) => r.estimatedValue, type: 'currency', currency: (r) => r.currency, sortable: true, visibility: 'md', width: 140 },
    { key: 'priority', label: 'Priority', value: (r) => r.priority, type: 'badge', tone: (r) => (r.priority === 'Critical' ? 'danger' : r.priority === 'High' ? 'warn' : 'neutral'), sortable: true, visibility: 'lg', width: 100 },
    { key: 'owner', label: 'Contract Owner', value: (r) => r.ownerName, secondary: (r) => `By ${r.requestedBy}`, visibility: 'xl', width: 170 },
    { key: 'contract', label: 'Contract', value: (r) => r.convertedNumber, type: 'mono', link: (r) => (r.convertedContractId ? contractLink(r.convertedContractId) : null), visibility: 'lg', width: 120 },
    { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => REQUEST_TONE[r.status], sortable: true, mobile: 'badge', width: 160 },
    { key: 'created', label: 'Created', value: (r) => r.createdAt, type: 'date', sortable: true, visibility: '2xl', width: 120 },
  ];
}

export function reviewColumns(showContract = true): DataColumn<ReviewListItem>[] {
  return [
    ...(showContract ? [{ key: 'contract', label: 'Contract', value: (r: ReviewListItem) => r.contractTitle, secondary: (r: ReviewListItem) => `${r.contractNumber} · ${r.customerName ?? ''}`, link: (r: ReviewListItem) => `/app/contracts/review?contractId=${r.contractId}`, mobile: 'title' as const, sortable: true, width: 260 }] : []),
    { key: 'type', label: 'Review Type', value: (r) => r.type, sortable: true, mobile: showContract ? 'meta' : 'title', width: 170 },
    { key: 'reviewer', label: 'Reviewer', value: (r) => r.reviewerName, sortable: true, visibility: 'md', width: 160 },
    { key: 'due', label: 'Due', value: (r) => r.dueDate, type: 'date', sortable: true, visibility: 'lg', width: 120 },
    { key: 'date', label: 'Review Date', value: (r) => r.reviewDate || null, type: 'date', sortable: true, visibility: 'lg', width: 120 },
    { key: 'comments', label: 'Comments', value: (r) => r.comments, visibility: 'xl', width: 280 },
    { key: 'status', label: 'Status', value: (r) => (r.overdue ? `${r.status} · Overdue` : r.status), type: 'badge', tone: (r) => (r.overdue ? 'danger' : REVIEW_TONE[r.status]), sortable: true, mobile: 'badge', width: 150 },
  ];
}

export function approvalColumns(showContract = true): DataColumn<ApprovalListItem>[] {
  return [
    ...(showContract ? [{ key: 'contract', label: 'Contract', value: (a: ApprovalListItem) => a.contractTitle, secondary: (a: ApprovalListItem) => `${a.contractNumber} · ${a.subjectLabel}`, link: (a: ApprovalListItem) => contractLink(a.contractId), mobile: 'title' as const, sortable: true, width: 260 }] : []),
    { key: 'level', label: 'Approval Level', value: (a) => a.levelName, secondary: (a) => `Round ${a.round}`, sortable: true, mobile: showContract ? 'meta' : 'title', width: 170 },
    { key: 'approver', label: 'Approver', value: (a) => a.delegateName ?? a.approverName, secondary: (a) => (a.delegateName ? `Delegated by ${a.approverName}` : a.role), sortable: true, visibility: 'md', width: 180 },
    { key: 'value', label: 'Value', value: (a) => a.value, type: 'currency', currency: (a) => a.currency, sortable: true, visibility: 'lg', width: 130 },
    { key: 'reasons', label: 'Why required', value: (a) => a.reasons.join(' · '), visibility: 'xl', width: 240 },
    { key: 'decided', label: 'Approval Date', value: (a) => a.decidedAt, type: 'datetime', sortable: true, visibility: 'lg', width: 150 },
    { key: 'comments', label: 'Comments', value: (a) => a.comments, visibility: '2xl', width: 220 },
    { key: 'status', label: 'Status', value: (a) => a.status, type: 'badge', tone: (a) => STEP_TONE[a.status], sortable: true, mobile: 'badge', width: 160 },
  ];
}

export function obligationColumns(showContract = true): DataColumn<ObligationListItem>[] {
  return [
    { key: 'number', label: 'Obligation', value: (o) => o.type, secondary: (o) => `${o.number} · ${o.description}`, mobile: 'title', sortable: true, width: 280 },
    ...(showContract ? [{ key: 'contract', label: 'Contract', value: (o: ObligationListItem) => o.contractNumber, secondary: (o: ObligationListItem) => o.customerName, link: (o: ObligationListItem) => contractLink(o.contractId), sortable: true, visibility: 'md' as const, mobile: 'meta' as const, width: 190 }] : []),
    { key: 'party', label: 'Responsible', value: (o) => o.responsibleUserName ?? o.responsibleParty, secondary: (o) => o.responsibleParty, sortable: true, visibility: 'lg', width: 170 },
    { key: 'due', label: 'Due Date', value: (o) => o.dueDate, type: 'date', secondary: (o) => (o.effectiveStatus === 'Overdue' ? `${-o.daysToDue} days overdue` : o.effectiveStatus === 'Completed' ? null : `in ${o.daysToDue} days`), sortable: true, mobile: 'meta', width: 140 },
    { key: 'frequency', label: 'Frequency', value: (o) => o.frequency, visibility: 'xl', width: 110 },
    { key: 'priority', label: 'Priority', value: (o) => o.priority, type: 'badge', tone: (o) => (o.priority === 'Critical' ? 'danger' : o.priority === 'High' ? 'warn' : 'neutral'), sortable: true, visibility: 'lg', width: 100 },
    { key: 'evidence', label: 'Evidence', value: (o) => (o.evidenceRequired ? `${o.evidence.length} file(s)` : 'Not required'), visibility: 'xl', width: 110 },
    { key: 'completed', label: 'Completed', value: (o) => o.completionDate, type: 'date', visibility: '2xl', width: 120 },
    { key: 'status', label: 'Status', value: (o) => (o.escalated && o.effectiveStatus === 'Overdue' ? 'Overdue · Escalated' : o.effectiveStatus), type: 'badge', tone: (o) => OBLIGATION_TONE[o.effectiveStatus], sortable: true, mobile: 'badge', width: 150 },
  ];
}

export function amendmentColumns(showContract = true): DataColumn<AmendmentListItem>[] {
  return [
    { key: 'number', label: 'Amendment', value: (a) => a.type, secondary: (a) => `${a.number} · ${a.reason}`, mobile: 'title', sortable: true, width: 260 },
    ...(showContract ? [{ key: 'contract', label: 'Contract', value: (a: AmendmentListItem) => a.contractNumber, secondary: (a: AmendmentListItem) => a.customerName, link: (a: AmendmentListItem) => contractLink(a.contractId), sortable: true, visibility: 'md' as const, mobile: 'meta' as const, width: 190 }] : []),
    { key: 'effective', label: 'Effective Date', value: (a) => a.effectiveDate, type: 'date', sortable: true, visibility: 'lg', width: 130 },
    { key: 'terms', label: 'Previous → New Terms', value: (a) => `${a.previousTerms} → ${a.newTerms}`, visibility: 'xl', width: 300 },
    { key: 'impact', label: 'Commercial Impact', value: (a) => a.commercialImpact, type: 'currency', currency: (a) => a.currency, sortable: true, visibility: 'md', width: 150 },
    { key: 'requested', label: 'Requested By', value: (a) => a.requestedBy, visibility: '2xl', width: 170 },
    { key: 'version', label: 'Version', value: (a) => (a.resultingVersion ? `v${a.resultingVersion}` : null), visibility: 'lg', width: 90 },
    { key: 'status', label: 'Approval Status', value: (a) => a.status, type: 'badge', tone: (a) => AMENDMENT_TONE[a.status], sortable: true, mobile: 'badge', width: 160 },
  ];
}

export function renewalColumns(showContract = true): DataColumn<RenewalListItem>[] {
  return [
    { key: 'number', label: 'Renewal', value: (r) => r.type, secondary: (r) => r.number, mobile: 'title', sortable: true, width: 220 },
    ...(showContract ? [{ key: 'contract', label: 'Existing Contract', value: (r: RenewalListItem) => r.contractNumber, secondary: (r: RenewalListItem) => r.customerName, link: (r: RenewalListItem) => contractLink(r.contractId), sortable: true, visibility: 'md' as const, mobile: 'meta' as const, width: 190 }] : []),
    { key: 'period', label: 'Renewal Period', value: (r) => `${r.startDate} → ${r.endDate}`, secondary: (r) => `${r.termMonths} months`, visibility: 'lg', width: 210 },
    { key: 'value', label: 'Renewal Value', value: (r) => r.value, type: 'currency', currency: (r) => r.currency, secondary: (r) => `${r.priceAdjustmentPercent >= 0 ? '+' : ''}${r.priceAdjustmentPercent}%`, sortable: true, visibility: 'md', width: 150 },
    { key: 'reason', label: 'Reason', value: (r) => r.reason, visibility: '2xl', width: 260 },
    { key: 'new', label: 'New Contract', value: (r) => r.newContractNumber, type: 'mono', link: (r) => (r.newContractId ? contractLink(r.newContractId) : null), visibility: 'lg', width: 140 },
    { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => RENEWAL_TONE[r.status], sortable: true, mobile: 'badge', width: 150 },
  ];
}

export function terminationColumns(showContract = true): DataColumn<TerminationListItem>[] {
  return [
    { key: 'number', label: 'Termination', value: (t) => t.type, secondary: (t) => `${t.number} · ${t.reason}`, mobile: 'title', sortable: true, width: 260 },
    ...(showContract ? [{ key: 'contract', label: 'Contract', value: (t: TerminationListItem) => t.contractNumber, secondary: (t: TerminationListItem) => t.customerName, link: (t: TerminationListItem) => contractLink(t.contractId), sortable: true, visibility: 'md' as const, mobile: 'meta' as const, width: 190 }] : []),
    { key: 'date', label: 'Termination Date', value: (t) => t.terminationDate, type: 'date', sortable: true, visibility: 'md', width: 140 },
    { key: 'notice', label: 'Notice Period', value: (t) => `${t.noticePeriodDays} days`, visibility: 'xl', width: 110 },
    { key: 'outstanding', label: 'Outstanding Amount', value: (t) => t.outstandingAmount, type: 'currency', currency: (t) => t.currency, visibility: 'lg', width: 150 },
    { key: 'obligations', label: 'Open Obligations', value: (t) => t.outstandingObligations, type: 'number', visibility: 'xl', width: 120 },
    { key: 'final', label: 'Final Service Date', value: (t) => t.finalServiceDate, type: 'date', visibility: '2xl', width: 140 },
    { key: 'status', label: 'Status', value: (t) => t.status, type: 'badge', tone: (t) => TERMINATION_TONE[t.status], sortable: true, mobile: 'badge', width: 140 },
  ];
}
