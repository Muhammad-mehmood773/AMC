import { Injectable } from '@angular/core';
import { daysBetween } from '@shared/utils/format';
import type { Contract, ContractListItem, ContractStatus } from '../../models/contract.model';
import type {
  ApprovalStep,
  ContractAlert,
  ContractVersion,
  HistoryAction,
  HistoryEntity,
  ObligationListItem,
  Obligation,
} from '../../models/workflow.model';
import { APPROVAL_LEVELS, type ApprovalContext, CONTRACT_RULES } from '../contract.config';
import { type ContractDatabase, buildContractSeed, snapshotOf } from './contract-seed';

export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export const monthsBetween = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (30.44 * 86_400_000)));

export function nextMinor(version: string): string {
  const [major, minor] = version.split('.').map(Number);
  return `${major}.${(minor || 0) + 1}`;
}

export function nextMajor(version: string): string {
  return `${Number(version.split('.')[0]) + 1}.0`;
}

/** In-memory database for the contract mock adapters; derives read models. */
@Injectable()
export class MockContractStore {
  readonly db: ContractDatabase = buildContractSeed();
  private seq = 1;

  get user(): string {
    return this.db.reference.currentUser.name;
  }

  now(): string {
    return new Date().toISOString();
  }

  uid(prefix: string): string {
    return `${prefix}-N${String(this.seq++).padStart(5, '0')}`;
  }

  audit() {
    return { createdAt: this.now(), createdBy: this.user, updatedAt: null, updatedBy: null };
  }

  log(action: HistoryAction, entity: HistoryEntity, entityId: string, contractId: string | null, comments: string, previousValue: string | null = null, newValue: string | null = null, reference: string | null = null): void {
    const c = contractId ? this.contract(contractId) : undefined;
    this.db.history.unshift({
      id: this.uid('CH'), timestamp: this.now(), user: this.user, action, entity, entityId, contractId, label: c?.number ?? entityId, previousValue, newValue, reference, comments,
      systemReference: '127.0.0.1 · web',
    });
  }

  contract(id: string): Contract | undefined {
    return this.db.contracts.find((c) => c.id === id);
  }

  replace(next: Contract): void {
    this.db.contracts = this.db.contracts.map((c) => (c.id === next.id ? next : c));
  }

  customerName(id: string | null | undefined): string | null {
    return id ? (this.db.reference.customers.find((c) => c.id === id)?.name ?? null) : null;
  }

  userName(id: string | null | undefined): string {
    return (id && this.db.reference.users.find((u) => u.id === id)?.name) || '';
  }

  clauseNames(ids: readonly string[]): string {
    return ids.map((id) => this.db.clauses.find((c) => c.id === id)?.name ?? id).join(', ');
  }

  slaName(id: string | null): string {
    return this.db.reference.slas.find((s) => s.id === id)?.name ?? '—';
  }

  snapshot(c: Contract): Record<string, string> {
    return snapshotOf(c, (ids) => this.clauseNames(ids), (id) => this.slaName(id));
  }

  addVersion(c: Contract, summary: string, execution: ContractVersion['executionStatus'], documentId: string | null = null): void {
    if (execution === 'Executed') this.db.versions = this.db.versions.map((v) => (v.contractId === c.id && v.executionStatus === 'Executed' ? { ...v, executionStatus: 'Superseded' } : v));
    this.db.versions.push({ id: `${c.id}-v${c.version}-${this.seq++}`, contractId: c.id, version: c.version, createdAt: this.now(), createdBy: this.user, changeSummary: summary, approvalStatus: c.approvalStatus, executionStatus: execution, documentId, snapshot: this.snapshot(c) });
  }

  effectiveStatus(c: Contract): ContractStatus {
    if (c.status !== 'Active') return c.status;
    if (c.period.timeBound && c.period.endDate < today()) return 'Expired';
    const days = daysBetween(new Date(), c.period.endDate);
    return c.period.timeBound && days <= CONTRACT_RULES.expiringWindowDays ? 'Expiring Soon' : 'Active';
  }

  obligationStatus(o: Obligation): Obligation['status'] {
    return (o.status === 'Pending' || o.status === 'In Progress') && o.dueDate < today() ? 'Overdue' : o.status;
  }

  obligationItem(o: Obligation): ObligationListItem {
    const c = this.contract(o.contractId);
    return {
      ...o,
      effectiveStatus: this.obligationStatus(o),
      contractNumber: c?.number ?? o.contractId,
      contractTitle: c?.title ?? '',
      customerName: this.customerName(c?.parties.customerId),
      responsibleUserName: o.responsibleUserId ? this.userName(o.responsibleUserId) : null,
      daysToDue: daysBetween(new Date(), o.dueDate),
    };
  }

  contractItem(c: Contract): ContractListItem {
    const ref = this.db.reference;
    const obligations = this.db.obligations.filter((o) => o.contractId === c.id).map((o) => this.obligationStatus(o));
    const status = this.effectiveStatus(c);
    const revenue = c.financial.estimatedRevenue;
    const margin = revenue - c.financial.estimatedCost;
    const renewal = this.db.renewals.filter((r) => r.contractId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const renewedBy = this.db.contracts.find((x) => x.previousContractId === c.id);
    const customer = ref.customers.find((x) => x.id === c.parties.customerId);
    return {
      ...c,
      effectiveStatus: status,
      customerName: customer?.name ?? (c.parties.vendorPartner || null),
      customerCode: customer?.code ?? null,
      siteNames: c.scopeInfo.siteIds.map((id) => ref.sites.find((s) => s.id === id)?.name ?? id),
      ownerName: this.userName(c.parties.ownerId),
      managerName: this.userName(c.parties.managerId),
      accountManagerName: c.parties.accountManagerId ? this.userName(c.parties.accountManagerId) : null,
      companyName: ref.companies.find((x) => x.id === c.parties.contractingOrganizationId)?.name ?? '',
      branchName: ref.branches.find((x) => x.id === c.parties.branchId)?.name ?? null,
      slaName: c.scopeInfo.slaId ? this.slaName(c.scopeInfo.slaId) : null,
      durationMonths: monthsBetween(c.period.startDate, c.period.endDate),
      daysRemaining: daysBetween(new Date(), c.period.endDate),
      margin,
      marginPercent: revenue ? Math.round((margin / revenue) * 100) : 0,
      remainingValue: Math.max(0, c.commercial.value - c.tracking.billed),
      outstanding: Math.max(0, c.tracking.billed - c.tracking.collected),
      openObligations: obligations.filter((s) => s === 'Pending' || s === 'In Progress' || s === 'Overdue').length,
      overdueObligations: obligations.filter((s) => s === 'Overdue').length,
      completedObligations: obligations.filter((s) => s === 'Completed').length,
      openAmendments: this.db.amendments.filter((a) => a.contractId === c.id && !['Executed', 'Rejected', 'Cancelled'].includes(a.status)).length,
      slaBreaches: c.tracking.slaBreaches,
      renewalStatus: renewedBy ? `Renewed as ${renewedBy.number}` : renewal ? `Renewal ${renewal.status.toLowerCase()}` : c.period.autoRenewal ? 'Auto renewal' : status === 'Expiring Soon' ? 'Renewal due' : 'Not started',
      renewedById: renewedBy?.id ?? null,
    };
  }

  approvalContext(c: Contract): ApprovalContext {
    const customer = this.db.reference.customers.find((x) => x.id === c.parties.customerId);
    const revenue = c.financial.estimatedRevenue || c.commercial.value;
    return {
      value: c.commercial.value,
      type: c.type,
      customerType: customer?.type ?? null,
      discountPercent: c.commercial.discountPercent,
      marginPercent: revenue ? Math.round(((revenue - c.financial.estimatedCost) / revenue) * 100) : 0,
      durationMonths: monthsBetween(c.period.startDate, c.period.endDate),
      riskLevel: c.riskLevel,
      legalFlags: c.legal.liabilityLimit === null || c.legal.governingLaw !== 'Kingdom of Saudi Arabia',
    };
  }

  /** Builds the approval route for a subject; the first level becomes Pending. */
  createApprovalRoute(c: Contract, subject: ApprovalStep['subject'], subjectId: string, levels: readonly { level: number; name: string; role: string; approverId: string; reasons: readonly string[] }[]): void {
    const round = Math.max(0, ...this.db.approvals.filter((a) => a.subjectId === subjectId).map((a) => a.round)) + 1;
    levels.forEach((l, i) =>
      this.db.approvals.push({
        id: this.uid('APR'), contractId: c.id, subject, subjectId, round, level: l.level, levelName: l.name, role: l.role, approverId: l.approverId, delegateId: null,
        status: i === 0 ? 'Pending' : 'Waiting', decidedAt: null, comments: '', reasons: l.reasons, createdAt: this.now(),
      }),
    );
  }

  contractLevels(c: Contract) {
    const ctx = this.approvalContext(c);
    return APPROVAL_LEVELS.map((l) => ({ level: l.level, name: l.name, role: l.role, approverId: l.approverId, reasons: l.when(ctx) })).filter((l) => l.reasons.length);
  }

  /** SRS 5.20 — notifications derived from contract state and dates. */
  alerts(contractId?: string): ContractAlert[] {
    const out: ContractAlert[] = [];
    const push = (a: Omit<ContractAlert, 'id'>) => out.push({ ...a, id: `${a.type}-${a.contractId}-${out.length}` });
    for (const c of this.db.contracts.filter((x) => !contractId || x.id === contractId)) {
      const status = this.effectiveStatus(c);
      const days = daysBetween(new Date(), c.period.endDate);
      if (status === 'Active' || status === 'Expiring Soon') {
        const interval = CONTRACT_RULES.expiryAlertDays.filter((d) => days <= d).sort((a, b) => a - b)[0];
        const renewing = this.db.renewals.some((r) => r.contractId === c.id && !['Rejected', 'Cancelled'].includes(r.status));
        if (interval !== undefined && days >= 0) push({ type: 'Contract Expiry', contractId: c.id, contractNumber: c.number, message: `Expires in ${days} days (${interval}-day alert).`, dueDate: c.period.endDate, severity: days <= 30 ? 'danger' : 'warn' });
        if (c.period.renewalDate && !renewing && daysBetween(new Date(), c.period.renewalDate) <= CONTRACT_RULES.renewalDueDays) push({ type: 'Renewal Due', contractId: c.id, contractNumber: c.number, message: `Renewal date ${c.period.renewalDate}${c.period.autoRenewal ? ' — auto renewal' : ''}.`, dueDate: c.period.renewalDate, severity: 'warn' });
        if (!renewing && days >= 0 && days <= c.period.noticePeriodDays) push({ type: 'Notice Period Started', contractId: c.id, contractNumber: c.number, message: `${c.period.noticePeriodDays}-day notice period has started.`, dueDate: addDays(c.period.endDate, -c.period.noticePeriodDays), severity: 'warn' });
      }
      if (status === 'Pending Approval') push({ type: 'Approval Required', contractId: c.id, contractNumber: c.number, message: 'Awaiting approval.', dueDate: null, severity: 'info' });
      if (status === 'Pending Signature' || status === 'Partially Signed') push({ type: 'Signature Required', contractId: c.id, contractNumber: c.number, message: `Signature status: ${c.signatureStatus}.`, dueDate: null, severity: 'info' });
      if (status === 'Suspended') push({ type: 'Contract Suspended', contractId: c.id, contractNumber: c.number, message: c.suspendedReason ?? 'Suspended.', dueDate: null, severity: 'warn' });
    }
    for (const o of this.db.obligations.filter((x) => !contractId || x.contractId === contractId)) {
      const st = this.obligationStatus(o);
      const days = daysBetween(new Date(), o.dueDate);
      const number = this.contract(o.contractId)?.number ?? o.contractId;
      if (st === 'Overdue') push({ type: 'Obligation Overdue', contractId: o.contractId, contractNumber: number, message: `${o.number} ${o.type} overdue by ${-days} days.`, dueDate: o.dueDate, severity: 'danger' });
      else if ((st === 'Pending' || st === 'In Progress') && days <= CONTRACT_RULES.obligationDueDays) push({ type: 'Obligation Due', contractId: o.contractId, contractNumber: number, message: `${o.number} ${o.type} due in ${days} days.`, dueDate: o.dueDate, severity: 'warn' });
    }
    return out.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  }
}
