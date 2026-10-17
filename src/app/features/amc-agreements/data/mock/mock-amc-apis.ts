import { Injectable, inject } from '@angular/core';
import { type Observable, defer } from 'rxjs';
import { fail, pad, respond } from '../../../customers/data/mock/mock-utils';
import { type Amc, type AmcDocument, type AmcFilter, type AmcListItem, type AmcPerformance, type AmcUpsert, EDITABLE_AMC_STATUSES, LIVE_AMC_STATUSES } from '../../models/amc.model';
import type {
  AmcDashboard,
  AmcDashboardFilters,
  AmcDashboardRow,
  AmcHistoryEntity,
  AmcHistoryEvent,
  BillingLine,
  BillingListItem,
  CoverageDecision,
  CoverageInput,
  CoverageListItem,
  CoverageRequest,
  CoverageResult,
  CoverageStep,
  PmEvent,
  PmEventListItem,
  RenewalInput,
  RenewalReview,
  ServicePlanInput,
  ServicePlanListItem,
  SuspensionTerminationItem,
  Visit,
  VisitCompletion,
  VisitInput,
  VisitListItem,
} from '../../models/operations.model';
import type { AmcReferenceData } from '../../models/reference.model';
import { AmcApi, AmcHistoryApi, AmcReferenceApi, BillingApi, CoverageApi, type ScopeChange, ScheduleApi, ServicePlanApi, type SuspendInput, type TerminateInput, VisitApi } from '../amc.api';
import { AMC_RULES, BILLING_PER_YEAR, FREQUENCY_PER_YEAR } from '../amc.config';
import { addDays, addMonths, nextWorkingDay, occurrenceDates, today } from './amc-seed';
import { MockAmcStore } from './mock-amc-store';

const norm = (v: string) => v.trim().toLowerCase();

function mutate<T>(work: () => T | Error): Observable<T> {
  return defer(() => {
    const result = work();
    return result instanceof Error ? fail(result.message) : respond(result, 340);
  });
}

function query<T>(work: () => T): Observable<T> {
  return defer(() => respond(work()));
}

function nextMinor(version: string): string {
  const [major, minor] = version.split('.').map(Number);
  return `${major}.${(minor || 0) + 1}`;
}

/** Operations shared by several adapters (schedule generation, liveness checks). */
@Injectable()
export class AmcOps {
  private readonly store = inject(MockAmcStore);

  /** Services can only be initiated for live, non-suspended AMCs (SRS 6.19). */
  requireOperational(amcId: string): Amc | Error {
    const a = this.store.amc(amcId);
    if (!a) return new Error('AMC was not found.');
    const status = this.store.effectiveStatus(a);
    if (status === 'Suspended') return new Error('This AMC is suspended — new services and maintenance activities cannot be initiated.');
    if (!LIVE_AMC_STATUSES.includes(status)) return new Error(`This AMC is ${status.toLowerCase()} and does not provide active service entitlement.`);
    return a;
  }

  /** Territory validation for technician assignment (SRS 6.10). */
  checkTerritory(siteId: string, technician: string | null): Error | null {
    if (!technician) return null;
    const tech = this.store.db.reference.technicians.find((t) => t.name === technician);
    const site = this.store.db.reference.sites.find((s) => s.id === siteId);
    if (tech && site && tech.region !== site.region) return new Error(`Service territory validation: ${tech.name} works in the ${tech.region} region; ${site.name} is in ${site.region}.`);
    return null;
  }

  /** Converts the service plan into maintenance events (SRS 6.10 automatic schedule generation). */
  generateSchedule(a: Amc): number {
    const from = [a.period.startDate, today()].sort().at(-1)!;
    const to = [a.period.endDate, addDays(today(), 365)].sort()[0];
    const assetsInScope = a.scope.assetIds.filter((id) => !a.scope.excludedAssetIds.includes(id));
    let created = 0;
    for (const plan of this.store.db.plans.filter((p) => p.amcId === a.id && p.active)) {
      const perYear = FREQUENCY_PER_YEAR[plan.frequency] || plan.occurrences;
      const dates = occurrenceDates(a.period.startDate, a.period.endDate, perYear, from, to);
      const assets = plan.assetIds.length ? plan.assetIds.filter((id) => assetsInScope.includes(id)) : assetsInScope;
      for (const assetId of assets) {
        const asset = this.store.db.reference.assets.find((x) => x.id === assetId);
        if (!asset) continue;
        for (const date of dates) {
          const exists = this.store.db.events.some((e) => e.planId === plan.id && e.assetId === assetId && Math.abs(new Date(e.scheduledDate).getTime() - new Date(date).getTime()) <= 4 * 86_400_000);
          if (exists) continue;
          const id = this.store.uid('PM');
          this.store.db.events.push({
            id, number: id, amcId: a.id, planId: plan.id, assetId, siteId: asset.siteId, serviceId: plan.serviceId, maintenanceType: plan.serviceType, scheduledDate: date, dueDate: addDays(date, 7),
            window: plan.serviceWindow, team: plan.team, technician: null, priority: plan.priority, status: date <= addDays(today(), 45) ? 'Scheduled' : 'Planned', rescheduledFrom: null, visitId: null, workOrder: null, escalated: false, completedAt: null,
          });
          created++;
        }
      }
    }
    if (created) this.store.log('Schedule Created', 'Schedule', a.id, a.id, `${created} maintenance events generated from the service plan (non-working days and holidays skipped).`);
    return created;
  }

  activate(a: Amc, comment: string): Amc {
    const future = a.period.startDate > today();
    const next: Amc = { ...a, status: future ? 'Pending Activation' : 'Active', activatedAt: future ? null : this.store.now(), approval: 'Approved', updatedAt: this.store.now(), updatedBy: this.store.user };
    this.store.replace(next);
    this.store.log('AMC Activated', 'AMC', a.id, a.id, future ? `Approved — activates on ${a.period.startDate}.` : comment, a.status, next.status);
    if (!future) {
      if (a.previousAmcId) {
        const prev = this.store.amc(a.previousAmcId);
        if (prev && prev.status !== 'Renewed') {
          this.store.replace({ ...prev, status: 'Renewed' });
          this.store.log('AMC Renewed', 'Renewal', prev.id, prev.id, `Superseded by ${a.number}; history preserved.`, prev.status, 'Renewed', a.number);
        }
      }
      this.ensureDefaultPlan(next);
      this.generateSchedule(next);
    }
    return next;
  }

  /** Creates a preventive plan from the maintenance terms when the AMC has none yet. */
  ensureDefaultPlan(a: Amc): void {
    if (this.store.db.plans.some((p) => p.amcId === a.id)) return;
    const services = this.store.db.reference.services.filter((s) => a.scope.serviceIds.includes(s.id) && !a.scope.excludedServiceIds.includes(s.id));
    const service = services.find((s) => s.type === 'Preventive Maintenance') ?? services[0];
    if (!service) return;
    const id = this.store.uid('PLN');
    this.store.db.plans.push({
      id, amcId: a.id, serviceId: service.id, serviceType: service.type, frequency: a.maintenance.serviceFrequency, occurrences: FREQUENCY_PER_YEAR[a.maintenance.serviceFrequency] || 4, assetIds: [],
      durationHours: a.maintenance.visitDurationHours || service.durationHours, skill: service.skill, team: a.operational.serviceTeam || service.team, parts: '', checklist: '', serviceWindow: a.maintenance.serviceWindow, priority: a.sla.priority, active: true,
    });
    this.store.log('Plan Updated', 'Service Plan', id, a.id, `Default ${a.maintenance.serviceFrequency.toLowerCase()} plan created from the maintenance terms.`);
  }

  /** Completing qualifying services consumes included visits automatically (SRS 6.19). */
  completeVisit(v: Visit, completion: VisitCompletion): void {
    const a = this.store.amc(v.amcId)!;
    const before = this.store.consumption(a);
    const partsAllowed = a.parts.partsIncluded && (before.remainingPartsValue === null || completion.partsValue <= before.remainingPartsValue);
    const visitsLeft = before.remainingVisits > 0 || v.type === 'Breakdown' || v.type === 'Emergency';
    const callOutsLeft = !(v.type === 'Breakdown' || v.type === 'Emergency') || before.remainingCallOuts === null || before.remainingCallOuts > 0;
    const covered = visitsLeft && callOutsLeft && (v.type !== 'Emergency' || a.maintenance.emergencyService);
    this.store.db.visits = this.store.db.visits.map((x) => (x.id === v.id ? { ...x, ...completion, status: 'Completed', covered, completedAt: this.store.now() } : x));
    this.store.db.events = this.store.db.events.map((e) => (v.eventIds.includes(e.id) ? { ...e, status: 'Completed', completedAt: this.store.now() } : e));
    this.store.log('Visit Completed', 'Visit', v.id, a.id, `${v.type} visit completed — ${completion.hours} h.`, null, covered ? 'Covered' : 'Billable (limit exceeded)', v.workOrder);
    const after = this.store.consumption(this.store.amc(v.amcId)!);
    this.store.log('Entitlement Consumed', 'Visit', v.id, a.id, covered ? `Included visit consumed — ${after.remainingVisits} remaining.` : 'Usage limit exceeded — visit is billable.', String(before.usedVisits), String(after.usedVisits), v.workOrder);
    if (completion.partsValue > 0) this.store.log('Parts Used', 'Visit', v.id, a.id, partsAllowed ? 'Parts issued as contract-covered.' : 'Parts not covered by the AMC terms — chargeable.', null, `${a.commercial.currency} ${completion.partsValue}`, v.workOrder);
  }
}

@Injectable()
export class MockAmcApi extends AmcApi {
  private readonly store = inject(MockAmcStore);
  private readonly ops = inject(AmcOps);

  list(filter: AmcFilter = {}): Observable<AmcListItem[]> {
    return query(() => this.store.db.amcs.filter((a) => !filter.customerId || a.customer.customerId === filter.customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((a) => this.store.item(a)));
  }

  get(id: string): Observable<AmcListItem> {
    return defer(() => {
      const a = this.store.amc(id);
      return a ? respond(this.store.item(a)) : fail(`AMC ${id} was not found.`);
    });
  }

  create(input: AmcUpsert): Observable<Amc> {
    return mutate(() => {
      if (this.store.db.amcs.some((a) => norm(a.number) === norm(input.number))) return new Error(`AMC number ${input.number} is already in use.`);
      const error = this.check(input);
      if (error) return error;
      const amc: Amc = { ...input, id: input.number.toUpperCase(), number: input.number.toUpperCase(), status: 'Draft', approval: 'Not Submitted', version: '1.0', previousAmcId: null, suspension: null, activatedAt: null, createdAt: this.store.now(), createdBy: this.store.user, updatedAt: null, updatedBy: null };
      this.store.db.amcs = [amc, ...this.store.db.amcs];
      this.store.log('AMC Created', 'AMC', amc.id, amc.id, `${amc.type} created with ${amc.scope.siteIds.length} site(s) and ${amc.scope.assetIds.length} asset(s).`, null, amc.title);
      return amc;
    });
  }

  update(id: string, input: AmcUpsert, summary: string): Observable<Amc> {
    return mutate(() => {
      const current = this.store.amc(id);
      if (!current) return new Error('AMC was not found.');
      if (!EDITABLE_AMC_STATUSES.includes(this.store.effectiveStatus(current))) return new Error(`${this.store.effectiveStatus(current)} AMCs cannot be changed — history is preserved.`);
      const error = this.check(input);
      if (error) return error;
      const next: Amc = { ...current, ...input, id, number: current.number, version: nextMinor(current.version), updatedAt: this.store.now(), updatedBy: this.store.user };
      this.store.replace(next);
      this.logScope(current, next);
      const live = LIVE_AMC_STATUSES.includes(this.store.effectiveStatus(current));
      this.store.log(live ? 'AMC Amended' : 'AMC Updated', 'AMC', id, id, summary || (live ? 'Active AMC amended.' : 'AMC updated.'), current.version, next.version);
      return next;
    });
  }

  nextNumber(): Observable<string> {
    return query(() => `AMC-${pad(Math.max(0, ...this.store.db.amcs.map((a) => Number(a.number.slice(4, 9)) || 0)) + 1, 5)}`);
  }

  submitForApproval(id: string): Observable<void> {
    return mutate(() => {
      const a = this.store.amc(id);
      if (!a) return new Error('AMC was not found.');
      if (!['Draft', 'Under Review'].includes(a.status)) return new Error(`${a.status} AMCs cannot be submitted for approval.`);
      this.store.replace({ ...a, status: 'Pending Approval', approval: 'Pending' });
      this.store.log('Submitted for Approval', 'AMC', id, id, 'Submitted for approval.', a.status, 'Pending Approval');
      return undefined;
    });
  }

  decide(id: string, approve: boolean, comment: string): Observable<void> {
    return mutate(() => {
      const a = this.store.amc(id);
      if (!a) return new Error('AMC was not found.');
      if (a.status !== 'Pending Approval') return new Error('Only AMCs pending approval can be decided.');
      if (!approve && !comment.trim()) return new Error('A comment is required when rejecting.');
      this.store.replace({ ...a, status: approve ? 'Approved' : 'Draft', approval: approve ? 'Approved' : 'Rejected' });
      this.store.log(approve ? 'AMC Approved' : 'AMC Rejected', 'AMC', id, id, comment || (approve ? 'Approved.' : 'Rejected.'), 'Pending Approval', approve ? 'Approved' : 'Draft');
      return undefined;
    });
  }

  activate(id: string): Observable<Amc> {
    return mutate(() => {
      const a = this.store.amc(id);
      if (!a) return new Error('AMC was not found.');
      if (!['Draft', 'Pending Approval', 'Approved', 'Pending Activation'].includes(a.status)) return new Error(`${a.status} AMCs cannot be activated.`);
      if (a.period.endDate < today()) return new Error('The AMC period has already ended.');
      if (a.approval !== 'Approved') {
        if (a.commercial.value > AMC_RULES.autoApprovalLimit) return new Error(`An AMC cannot become Active before required approvals are completed — values above ${AMC_RULES.autoApprovalLimit.toLocaleString('en-US')} need approval.`);
        this.store.log('AMC Approved', 'AMC', id, id, `Approved by contract manager (within the ${AMC_RULES.autoApprovalLimit.toLocaleString('en-US')} limit).`, a.approval, 'Approved');
      }
      const parent = this.store.db.reference.contracts.find((c) => c.id === a.parentContractId);
      if (AMC_RULES.requireApprovedParentContract && !parent?.approved) return new Error('The parent commercial contract must be approved or executed first.');
      return this.ops.activate({ ...a, approval: 'Approved' }, parent && !parent.approved ? `Activated — note: parent contract ${parent.number} is ${parent.status.toLowerCase()}.` : 'AMC activated.');
    });
  }

  changeScope(id: string, change: ScopeChange): Observable<void> {
    return mutate(() => {
      const a = this.store.amc(id);
      if (!a) return new Error('AMC was not found.');
      if (!EDITABLE_AMC_STATUSES.includes(this.store.effectiveStatus(a))) return new Error('The AMC scope can no longer be changed.');
      const without = (list: readonly string[], remove: readonly string[] = []) => list.filter((x) => !remove.includes(x));
      const scope = {
        ...a.scope,
        siteIds: [...new Set([...a.scope.siteIds, ...(change.addSiteIds ?? [])])],
        assetIds: [...new Set([...without(a.scope.assetIds, change.removeAssetIds), ...(change.addAssetIds ?? [])])],
        serviceIds: [...new Set([...without(a.scope.serviceIds, change.removeServiceIds), ...(change.addServiceIds ?? [])])],
      };
      const next: Amc = { ...a, scope, version: nextMinor(a.version), updatedAt: this.store.now(), updatedBy: this.store.user };
      const error = this.check(next);
      if (error) return error;
      this.store.replace(next);
      this.logScope(a, next);
      if (LIVE_AMC_STATUSES.includes(this.store.effectiveStatus(next)) && change.addAssetIds?.length) this.ops.generateSchedule(next);
      return undefined;
    });
  }

  suspend(id: string, input: SuspendInput): Observable<void> {
    return mutate(() => {
      const a = this.store.amc(id);
      if (!a) return new Error('AMC was not found.');
      if (!LIVE_AMC_STATUSES.includes(this.store.effectiveStatus(a))) return new Error('Only active AMCs can be suspended.');
      if (!input.reason.trim()) return new Error('A suspension reason is required.');
      const from = today();
      this.store.db.suspensions.push({ id: this.store.uid('SUS'), amcId: id, suspensionDate: from, requestedBy: input.requestedBy, approvedBy: this.store.user, reason: input.reason, periodDays: input.periodDays, pauseMaintenance: input.pauseMaintenance, pauseBilling: input.pauseBilling, notes: input.notes, resumedAt: null, status: 'Active' });
      if (input.pauseBilling) this.store.db.billing = this.store.db.billing.map((b) => (b.amcId === id && b.status === 'Planned' ? { ...b, onHold: true } : b));
      this.store.replace({ ...a, status: 'Suspended', suspension: { reason: input.reason, from, to: input.periodDays ? addDays(from, input.periodDays) : null, pauseMaintenance: input.pauseMaintenance, pauseBilling: input.pauseBilling } });
      this.store.log('AMC Suspended', 'Suspension', id, id, `${input.reason}${input.pauseMaintenance ? ' · maintenance paused' : ''}${input.pauseBilling ? ' · billing on hold' : ''}`, this.store.effectiveStatus(a), 'Suspended');
      return undefined;
    });
  }

  resume(id: string): Observable<void> {
    return mutate(() => {
      const a = this.store.amc(id);
      if (!a || a.status !== 'Suspended') return new Error('Only suspended AMCs can be resumed.');
      this.store.db.suspensions = this.store.db.suspensions.map((s) => (s.amcId === id && s.status === 'Active' ? { ...s, status: 'Resumed', resumedAt: this.store.now() } : s));
      this.store.db.billing = this.store.db.billing.map((b) => (b.amcId === id ? { ...b, onHold: false } : b));
      this.store.replace({ ...a, status: 'Active', suspension: null });
      this.store.log('AMC Resumed', 'Suspension', id, id, 'Suspension lifted — services and billing resumed.', 'Suspended', 'Active');
      return undefined;
    });
  }

  terminate(id: string, input: TerminateInput): Observable<void> {
    return mutate(() => {
      const a = this.store.amc(id);
      if (!a) return new Error('AMC was not found.');
      if (![...LIVE_AMC_STATUSES, 'Suspended'].includes(this.store.effectiveStatus(a))) return new Error('Only active or suspended AMCs can be terminated.');
      if (!input.reason.trim()) return new Error('A termination reason is required.');
      const outstandingBilling = this.store.db.billing.filter((b) => b.amcId === id && ['Invoiced', 'Partially Paid'].includes(b.status)).reduce((s, b) => s + b.net - b.paidAmount, 0);
      const openEvents = this.store.db.events.filter((e) => e.amcId === id && ['Planned', 'Scheduled', 'Assigned', 'Rescheduled'].includes(e.status));
      // History is preserved: future work and billing are cancelled, never deleted.
      this.store.db.events = this.store.db.events.map((e) => (e.amcId === id && openEvents.includes(e) && e.scheduledDate > input.finalServiceDate ? { ...e, status: 'Cancelled' } : e));
      this.store.db.visits = this.store.db.visits.map((v) => (v.amcId === id && v.status !== 'Completed' && v.plannedDate > input.finalServiceDate ? { ...v, status: 'Cancelled' } : v));
      this.store.db.billing = this.store.db.billing.map((b) => (b.amcId === id && ['Planned', 'Ready for Billing'].includes(b.status) && b.billingDate > input.terminationDate ? { ...b, status: 'Cancelled' } : b));
      this.store.db.terminations.push({ id: this.store.uid('TRM'), amcId: id, ...input, approvedBy: this.store.user, outstandingBilling, outstandingServices: openEvents.filter((e) => e.scheduledDate <= input.finalServiceDate).length, createdAt: this.store.now() });
      this.store.replace({ ...a, status: 'Terminated', suspension: null, period: { ...a.period, endDate: input.terminationDate < a.period.endDate ? input.terminationDate : a.period.endDate } });
      this.store.log('AMC Terminated', 'Termination', id, id, `${input.type}: ${input.reason}. Historical service and financial records preserved.`, this.store.effectiveStatus(a), 'Terminated');
      return undefined;
    });
  }

  renewalReview(id: string): Observable<RenewalReview> {
    return query(() => {
      const a = this.store.amc(id)!;
      const item = this.store.item(a);
      const visits = this.store.db.visits.filter((v) => v.amcId === id && v.status === 'Completed');
      const events = this.store.db.events.filter((e) => e.amcId === id && e.scheduledDate < today());
      const done = events.filter((e) => e.status === 'Completed').length;
      const usage = item.consumption.overallUtilization;
      const margin = item.financials.grossMargin;
      const uplift = usage > 90 || margin < 15 ? 0.08 : usage > 70 ? 0.05 : 0.03;
      return {
        amcId: id, previousValue: a.commercial.value, currency: a.commercial.currency, usage, visitPerformance: events.length ? Math.round((done / events.length) * 100) : 100,
        breakdownFrequency: visits.filter((v) => v.type === 'Breakdown' || v.type === 'Emergency').length, partsConsumption: item.consumption.usedPartsValue, serviceCost: item.financials.totalCost,
        revenue: item.financials.invoiced, profitability: margin, serviceHistory: visits.length, suggestedPrice: Math.round((a.commercial.value * (1 + uplift)) / 100) * 100, assetCount: a.scope.assetIds.length, serviceCount: a.scope.serviceIds.length,
      };
    });
  }

  renew(id: string, input: RenewalInput): Observable<Amc> {
    return mutate(() => {
      const a = this.store.amc(id);
      if (!a) return new Error('AMC was not found.');
      if (!['Active', 'Expiring Soon', 'Expired'].includes(this.store.effectiveStatus(a))) return new Error(`${this.store.effectiveStatus(a)} AMCs cannot be renewed.`);
      if (this.store.db.amcs.some((x) => x.previousAmcId === id)) return new Error('A renewal already exists for this AMC.');
      const base = a.number.replace(/-R\d+$/, '');
      let n = 1;
      while (this.store.db.amcs.some((x) => x.number === `${base}-R${n}`)) n++;
      const start = [addDays(a.period.endDate, 1), today()].sort().at(-1)!;
      const end = addDays(addMonths(start, input.termMonths), -1);
      const number = `${base}-R${n}`;
      const assetIds = input.revisedAssetIds.length ? [...input.revisedAssetIds] : [...a.scope.assetIds];
      const renewed: Amc = {
        ...a, id: number, number, previousAmcId: id, status: 'Draft', approval: 'Not Submitted', version: '1.0', suspension: null, activatedAt: null,
        period: { ...a.period, startDate: start, endDate: end, renewalDate: addDays(end, -60), renewalTermMonths: input.termMonths },
        scope: { ...a.scope, assetIds, serviceIds: input.revisedServiceIds.length ? [...input.revisedServiceIds] : [...a.scope.serviceIds] },
        commercial: { ...a.commercial, value: input.revisedValue },
        notes: { ...a.notes, internal: input.scopeNotes || a.notes.internal },
        documents: [], createdAt: this.store.now(), createdBy: this.store.user, updatedAt: null, updatedBy: null,
      };
      const error = this.check(renewed);
      if (error) return error;
      this.store.db.amcs = [renewed, ...this.store.db.amcs];
      this.store.db.plans.push(...this.store.db.plans.filter((p) => p.amcId === id).map((p) => ({ ...p, id: this.store.uid('PLN'), amcId: number })));
      this.store.db.coverage.push(...this.store.db.coverage.filter((c) => c.amcId === id).map((c) => ({ ...c, id: this.store.uid('COV'), amcId: number, startDate: start, endDate: end, status: 'Active' as const })));
      this.store.log('AMC Renewed', 'Renewal', id, id, `Renewal ${number} prepared (${start} → ${end}); becomes effective when activated.`, `${a.commercial.currency} ${a.commercial.value}`, `${a.commercial.currency} ${input.revisedValue}`, number);
      this.store.log('AMC Created', 'AMC', number, number, `Renewal of ${a.number}.`, null, renewed.title, a.number);
      return renewed;
    });
  }

  uploadDocument(id: string, type: AmcDocument['type'], file: { name: string; size: number }): Observable<void> {
    return mutate(() => {
      const a = this.store.amc(id);
      if (!a) return new Error('AMC was not found.');
      const version = a.documents.filter((d) => d.type === type).length + 1;
      this.store.replace({ ...a, documents: [{ id: this.store.uid('ADOC'), name: file.name, type, size: file.size, uploadedBy: this.store.user, uploadedAt: this.store.now(), version }, ...a.documents] });
      this.store.log('Document Uploaded', 'Document', id, id, `${type} “${file.name}” uploaded (v${version}).`);
      return undefined;
    });
  }

  performance(id: string): Observable<AmcPerformance> {
    return query(() => {
      const events = this.store.db.events.filter((e) => e.amcId === id);
      const visits = this.store.db.visits.filter((v) => v.amcId === id && v.status === 'Completed');
      const reactive = visits.filter((v) => v.type === 'Breakdown' || v.type === 'Emergency');
      const a = this.store.amc(id)!;
      const response = reactive.filter((v) => v.responseHours !== null);
      const fixed = visits.filter((v) => v.firstTimeFix !== null);
      const assetFailures = new Map<string, number>();
      reactive.forEach((v) => v.assetIds.forEach((x) => assetFailures.set(x, (assetFailures.get(x) ?? 0) + 1)));
      return {
        scheduledVisits: events.filter((e) => e.scheduledDate <= today()).length,
        completedVisits: events.filter((e) => e.status === 'Completed').length,
        missedVisits: events.filter((e) => e.status === 'Missed').length,
        overdueVisits: events.filter((e) => this.store.pmStatus(e) === 'Overdue').length,
        rescheduledVisits: events.filter((e) => e.rescheduledFrom).length,
        breakdownRequests: reactive.filter((v) => v.type === 'Breakdown').length,
        emergencyRequests: reactive.filter((v) => v.type === 'Emergency').length,
        avgResponseHours: response.length ? Math.round((response.reduce((s, v) => s + (v.responseHours ?? 0), 0) / response.length) * 10) / 10 : 0,
        avgResolutionHours: reactive.length ? Math.round((reactive.reduce((s, v) => s + v.hours, 0) / reactive.length + (a.sla.responseHours ?? 0) * 0.6) * 10) / 10 : 0,
        slaCompliance: response.length ? Math.round((response.filter((v) => (v.responseHours ?? 0) <= (a.sla.responseHours ?? 999)).length / response.length) * 100) : 100,
        firstTimeFixRate: fixed.length ? Math.round((fixed.filter((v) => v.firstTimeFix).length / fixed.length) * 100) : 100,
        repeatFailureRate: assetFailures.size ? Math.round(([...assetFailures.values()].filter((n) => n > 1).length / assetFailures.size) * 100) : 0,
        partsConsumption: visits.reduce((s, v) => s + v.partsValue, 0),
        technicianHours: Math.round(visits.reduce((s, v) => s + v.hours, 0) * 10) / 10,
      };
    });
  }

  events(): Observable<SuspensionTerminationItem[]> {
    return query(() => {
      const label = (amcId: string) => ({ amcNumber: this.store.amc(amcId)?.number ?? amcId, customerName: this.store.customerName(this.store.amc(amcId)?.customer.customerId) });
      return [
        ...this.store.db.suspensions.map((s) => ({ id: s.id, kind: 'Suspension' as const, amcId: s.amcId, ...label(s.amcId), date: s.suspensionDate, type: s.periodDays ? `${s.periodDays}-day suspension` : 'Open-ended', reason: s.reason, requestedBy: s.requestedBy, approvedBy: s.approvedBy, impact: [s.pauseMaintenance ? 'Maintenance paused' : 'Maintenance continues', s.pauseBilling ? 'Billing on hold' : 'Billing continues'].join(' · '), status: s.status })),
        ...this.store.db.terminations.map((t) => ({ id: t.id, kind: 'Termination' as const, amcId: t.amcId, ...label(t.amcId), date: t.terminationDate, type: t.type, reason: t.reason, requestedBy: t.requestedBy, approvedBy: t.approvedBy, impact: `Final service ${t.finalServiceDate} · outstanding billing ${t.outstandingBilling.toLocaleString('en-US')} · ${t.outstandingServices} open services`, status: t.settlementStatus })),
      ].sort((a, b) => b.date.localeCompare(a.date));
    });
  }

  dashboard(f: AmcDashboardFilters): Observable<AmcDashboard> {
    return query(() => {
      const has = (list: readonly string[], v: string | null | undefined) => !list.length || list.includes(v ?? '');
      const inRange = (r: { from: string; to: string }, d: string) => (!r.from || d >= r.from) && (!r.to || d <= r.to);
      const items = this.store.db.amcs
        .map((a) => this.store.item(a))
        .filter((a) => has(f.customers, a.customer.customerId) && (!f.sites.length || a.scope.siteIds.some((s) => f.sites.includes(s))) && has(f.types, a.type) && has(f.statuses, a.effectiveStatus) && has(f.managers, a.customer.contractManagerId) && has(f.regions, a.operational.serviceRegion) && inRange(f.start, a.period.startDate) && inRange(f.end, a.period.endDate));
      const ids = new Set(items.map((a) => a.id));
      const count = (...s: string[]) => items.filter((a) => s.includes(a.effectiveStatus)).length;
      const live = items.filter((a) => LIVE_AMC_STATUSES.includes(a.effectiveStatus));
      const events = this.store.db.events.filter((e) => ids.has(e.amcId)).map((e) => this.store.eventItem(e));
      const upcoming = events.filter((e) => ['Planned', 'Scheduled', 'Assigned'].includes(e.effectiveStatus) && e.scheduledDate <= addDays(today(), AMC_RULES.upcomingDays)).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
      const overdue = events.filter((e) => e.effectiveStatus === 'Overdue').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const visits = this.store.db.visits.filter((v) => ids.has(v.amcId) && v.status === 'Completed').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
      const requests = this.store.db.reference.requests.filter((r) => r.kind === 'Service Request' && ['New', 'Assigned', 'In Progress', 'On Hold'].includes(r.status) && live.some((a) => a.scope.siteIds.includes(r.siteId)));
      const scheduledAssets = new Set(events.filter((e) => e.scheduledDate >= today()).map((e) => e.assetId));
      const unscheduled = live.flatMap((a) => a.scope.assetIds.filter((x) => !scheduledAssets.has(x)).map((x) => ({ a, x })));
      const revenue = items.reduce((s, a) => s + a.financials.invoiced, 0);
      const cost = items.reduce((s, a) => s + a.financials.totalCost, 0);
      const evRow = (e: PmEventListItem): AmcDashboardRow => ({ id: e.id, amcId: e.amcId, title: e.assetName, subtitle: `${e.amcNumber} · ${e.siteName}`, status: e.effectiveStatus, date: e.scheduledDate, value: 0 });
      return {
        kpis: {
          total: items.length, draft: count('Draft', 'Under Review', 'Pending Approval'), pendingActivation: count('Approved', 'Pending Activation'), active: count('Active'), expiring: count('Expiring Soon'),
          expired: count('Expired'), suspended: count('Suspended'), terminated: count('Terminated'),
          coveredAssets: new Set(live.flatMap((a) => a.scope.assetIds)).size, coveredSites: new Set(live.flatMap((a) => a.scope.siteIds)).size,
          upcomingPm: upcoming.length, overduePm: overdue.length, openRequests: live.reduce((s, a) => s + a.openRequests, 0), openWorkOrders: live.reduce((s, a) => s + a.openWorkOrders, 0),
          completedVisits: visits.length, remainingVisits: live.reduce((s, a) => s + a.consumption.remainingVisits, 0),
          contractValue: items.reduce((s, a) => s + a.commercial.value, 0), billed: revenue, outstanding: items.reduce((s, a) => s + a.financials.outstanding, 0), currency: 'SAR',
        },
        expiringSoon: items.filter((a) => a.effectiveStatus === 'Expiring Soon').sort((a, b) => a.daysRemaining - b.daysRemaining).slice(0, 6).map((a) => ({ id: a.id, amcId: a.id, title: a.title, subtitle: `${a.number} · ${a.customerName}`, status: a.effectiveStatus, date: a.period.endDate, value: a.daysRemaining })),
        upcomingPm: upcoming.slice(0, 6).map(evRow),
        overduePm: overdue.slice(0, 6).map(evRow),
        recentVisits: visits.slice(0, 6).map((v) => ({ id: v.id, amcId: v.amcId, title: `${v.type} · ${this.store.siteName(v.siteId)}`, subtitle: `${v.number} · ${v.technician ?? ''}`, status: v.covered ? 'Covered' : 'Billable', date: v.completedAt, value: v.hours })),
        openRequests: requests.slice(0, 6).map((r) => ({ id: r.id, amcId: live.find((a) => a.scope.siteIds.includes(r.siteId))!.id, title: r.subject, subtitle: `${r.number} · ${this.store.siteName(r.siteId)}`, status: r.status, date: r.createdAt, value: 0 })),
        unscheduledAssets: unscheduled.slice(0, 6).map(({ a, x }) => ({ id: `${a.id}-${x}`, amcId: a.id, title: this.store.assetName(x), subtitle: `${a.number} · ${a.customerName}`, status: 'No schedule', date: null, value: 0 })),
        utilization: live.sort((a, b) => b.consumption.overallUtilization - a.consumption.overallUtilization).slice(0, 8).map((a) => ({ id: a.id, label: a.number, value: a.consumption.overallUtilization })),
        revenueCost: { revenue, cost, profit: revenue - cost, margin: revenue ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0 },
        profitByAmc: items.filter((a) => a.financials.invoiced > 0).sort((a, b) => b.financials.grossProfit - a.financials.grossProfit).slice(0, 8).map((a) => ({ id: a.id, label: a.number, value: a.financials.grossProfit })),
      };
    });
  }

  /** SRS 6.19 — customer, dates and scope ownership. */
  private check(input: AmcUpsert | Amc): Error | null {
    const ref = this.store.db.reference;
    if (!ref.customers.some((c) => c.id === input.customer.customerId)) return new Error('Every AMC must reference a valid customer.');
    if (!input.period.startDate || !input.period.endDate) return new Error('AMC start and end dates are mandatory.');
    if (input.period.endDate < input.period.startDate) return new Error('The end date must be on or after the start date.');
    if (input.scope.siteIds.some((id) => ref.sites.find((s) => s.id === id)?.customerId !== input.customer.customerId)) return new Error('Covered sites must belong to the customer.');
    if (input.scope.assetIds.some((id) => ref.assets.find((x) => x.id === id)?.customerId !== input.customer.customerId)) return new Error('Covered assets must belong to the customer.');
    if (input.scope.assetIds.some((id) => !input.scope.siteIds.includes(ref.assets.find((x) => x.id === id)?.siteId ?? ''))) return new Error('Covered assets must be located at covered sites.');
    if (input.scope.assetIds.some((id) => input.scope.excludedAssetIds.includes(id)) || input.scope.siteIds.some((id) => input.scope.excludedSiteIds.includes(id))) return new Error('A site or asset cannot be both covered and excluded.');
    if (input.parentContractId) {
      const parent = ref.contracts.find((c) => c.id === input.parentContractId);
      if (!parent || parent.customerId !== input.customer.customerId) return new Error('The parent contract must belong to the same customer.');
      if (AMC_RULES.requireApprovedParentContract && !parent.approved) return new Error('The parent contract must be approved or executed.');
    }
    if (input.maintenance.visitsIncluded < 0) return new Error('Number of visits cannot be negative.');
    return null;
  }

  private logScope(before: Amc, after: Amc): void {
    const added = (a: readonly string[], b: readonly string[]) => b.filter((x) => !a.includes(x));
    added(before.scope.siteIds, after.scope.siteIds).forEach((id) => this.store.log('Site Added', 'Coverage', id, after.id, `${this.store.siteName(id)} added to coverage.`, null, id));
    added(before.scope.assetIds, after.scope.assetIds).forEach((id) => this.store.log('Asset Added', 'Coverage', id, after.id, `${this.store.assetName(id)} added to coverage.`, null, id));
    added(after.scope.assetIds, before.scope.assetIds).forEach((id) => this.store.log('Asset Removed', 'Coverage', id, after.id, `${this.store.assetName(id)} removed from coverage.`, id, null));
    added(before.scope.serviceIds, after.scope.serviceIds).forEach((id) => this.store.log('Service Added', 'Coverage', id, after.id, `${this.store.serviceName(id)} added.`, null, id));
    added(after.scope.serviceIds, before.scope.serviceIds).forEach((id) => this.store.log('Service Removed', 'Coverage', id, after.id, `${this.store.serviceName(id)} removed.`, id, null));
  }
}

@Injectable()
export class MockCoverageApi extends CoverageApi {
  private readonly store = inject(MockAmcStore);

  list(amcId?: string): Observable<CoverageListItem[]> {
    return query(() => this.store.db.coverage.filter((c) => !amcId || c.amcId === amcId).map((c) => this.store.coverageItem(c)));
  }

  create(input: CoverageInput): Observable<void> {
    return mutate(() => {
      const error = this.check(input);
      if (error) return error;
      const id = this.store.uid('COV');
      this.store.db.coverage.push({ ...input, id });
      this.store.log('Coverage Changed', 'Coverage', id, input.amcId, `${input.level}-level ${input.coverageType} coverage added.`, null, input.coverageType);
      return undefined;
    });
  }

  update(id: string, input: CoverageInput): Observable<void> {
    return mutate(() => {
      const current = this.store.db.coverage.find((c) => c.id === id);
      if (!current) return new Error('Coverage line was not found.');
      const error = this.check(input);
      if (error) return error;
      this.store.db.coverage = this.store.db.coverage.map((c) => (c.id === id ? { ...input, id } : c));
      this.store.log('Coverage Changed', 'Coverage', id, input.amcId, `${input.level}-level coverage updated.`, `${current.coverageType} · ${current.labor} · ${current.parts}`, `${input.coverageType} · ${input.labor} · ${input.parts}`);
      return undefined;
    });
  }

  /** SRS 6.20 — Customer → AMC → status → validity → site → asset → service → entitlement → SLA → labor → parts → usage → decision. */
  validate(r: CoverageRequest): Observable<CoverageDecision> {
    return query(() => {
      const steps: CoverageStep[] = [];
      const ref = this.store.db.reference;
      const step = (name: string, ok: boolean | null, pass: string, failText: string, warn = false) => {
        steps.push({ step: name, result: ok === null ? 'na' : ok ? 'pass' : warn ? 'warn' : 'fail', detail: ok === null ? 'Not applicable.' : ok ? pass : failText });
        return ok !== false;
      };
      const decision = (result: CoverageResult, a: Amc | null, extra: Partial<CoverageDecision> = {}): CoverageDecision => ({
        request: r, amcId: a?.id ?? null, amcNumber: a?.number ?? null, result, covered: result === 'Fully Covered' || result === 'Partially Covered', billable: result !== 'Fully Covered',
        laborCovered: false, partsCovered: false, responseHours: a?.sla.responseHours ?? null, resolutionHours: a?.sla.resolutionHours ?? null, steps,
        summary: result === 'Fully Covered' ? `Fully covered by ${a?.number}.` : result === 'Partially Covered' ? `Covered by ${a?.number}; some items are billable.` : `${result} — the service is billable.`, ...extra,
      });
      const customer = ref.customers.find((c) => c.id === r.customerId);
      if (!step('Customer', !!customer && customer.status === 'Active', `${customer?.name} is active.`, `Customer is ${customer?.status ?? 'unknown'}.`)) return decision('Not Covered', null);
      const candidates = this.store.db.amcs.filter((a) => a.customer.customerId === r.customerId && (!r.amcId || a.id === r.amcId));
      const amc = candidates.find((a) => LIVE_AMC_STATUSES.includes(this.store.effectiveStatus(a)) && (!r.siteId || a.scope.siteIds.includes(r.siteId)) && (!r.assetId || a.scope.assetIds.includes(r.assetId))) ?? candidates.find((a) => LIVE_AMC_STATUSES.includes(this.store.effectiveStatus(a))) ?? candidates[0] ?? null;
      if (!step('AMC', !!amc, `${amc?.number} · ${amc?.title}.`, 'The customer has no AMC.')) return decision('Not Covered', null);
      const a = amc!;
      const status = this.store.effectiveStatus(a);
      const statusOk = LIVE_AMC_STATUSES.includes(status);
      step('AMC Status', statusOk, `${status}.`, status === 'Suspended' ? 'The AMC is suspended — no new services.' : `The AMC is ${status.toLowerCase()}.`);
      if (!statusOk) return decision(status === 'Suspended' ? 'Not Covered' : 'Coverage Expired', a);
      const day = r.date.slice(0, 10);
      if (!step('Validity Period', day >= a.period.startDate && day <= a.period.endDate, `Valid ${a.period.startDate} – ${a.period.endDate}.`, `Outside ${a.period.startDate} – ${a.period.endDate}.`)) return decision('Coverage Expired', a);
      if (!step('Site Coverage', r.siteId ? a.scope.siteIds.includes(r.siteId) && !a.scope.excludedSiteIds.includes(r.siteId) : null, `${this.store.siteName(r.siteId)} is covered.`, `${this.store.siteName(r.siteId) || 'The site'} is not covered.`)) return decision('Site Not Covered', a);
      const asset = ref.assets.find((x) => x.id === r.assetId);
      const assetOk = r.assetId ? !!asset && a.scope.assetIds.includes(asset.id) && !a.scope.excludedAssetIds.includes(asset.id) && (!r.siteId || asset.siteId === r.siteId) : null;
      if (!step('Asset Coverage', assetOk, `${asset?.id} is within the coverage scope.`, `${asset?.id ?? 'The asset'} is outside the coverage scope.`)) return decision('Asset Not Covered', a);
      const serviceOk = r.serviceId ? a.scope.serviceIds.includes(r.serviceId) && !a.scope.excludedServiceIds.includes(r.serviceId) : null;
      if (!step('Service Coverage', serviceOk, `${this.store.serviceName(r.serviceId)} is included.`, `${this.store.serviceName(r.serviceId) || 'The service'} is not included or is excluded.`)) return decision('Service Not Covered', a);
      const lines = this.store.db.coverage.filter((c) => c.amcId === a.id && this.store.coverageStatus(c) === 'Active' && (c.level === 'Customer' || (c.level === 'Site' && c.siteId === r.siteId) || (c.level === 'Asset' && c.assetId === r.assetId) || (c.level === 'Asset Category' && c.assetCategory === asset?.category) || (c.level === 'Service' && c.serviceId === r.serviceId)));
      step('Entitlement', lines.length > 0, `${lines.length} coverage line(s) apply: ${[...new Set(lines.map((l) => l.coverageType))].join(', ')}.`, 'No active coverage line applies.');
      if (!lines.length) return decision('Not Covered', a);
      step('SLA', !!a.sla.slaId, `${a.sla.responseHours}h response / ${a.sla.resolutionHours}h resolution · ${a.sla.priority}.`, 'No SLA configured.', true);
      const labor = lines.some((l) => l.labor === 'Included') && a.labor.included ? 'Included' : lines.some((l) => l.labor === 'Partially Included') ? 'Partially Included' : 'Excluded';
      step('Labor Coverage', labor === 'Included', 'Labor is included.', labor === 'Partially Included' ? 'Labor is partially included.' : 'Labor is excluded.', true);
      const consumption = this.store.consumption(a);
      const partsLine = lines.some((l) => l.parts !== 'Excluded');
      const partsOk = !r.needsParts ? null : a.parts.partsIncluded && partsLine && (consumption.remainingPartsValue === null || r.partsValue <= consumption.remainingPartsValue);
      step('Parts Coverage', partsOk, 'Parts are covered within the cost limit.', !a.parts.partsIncluded || !partsLine ? 'Parts are not covered by the AMC terms.' : `Parts value exceeds the remaining limit (${consumption.remainingPartsValue}).`, true);
      const usageOk = consumption.remainingVisits > 0;
      if (!step('Usage Limit', usageOk, `${consumption.remainingVisits} of ${consumption.includedVisits} visits remaining.`, `All ${consumption.includedVisits} included visits are used.`)) return decision('Usage Limit Exceeded', a);
      const partial = labor !== 'Included' || partsOk === false;
      steps.push({ step: 'Covered / Billable Decision', result: partial ? 'warn' : 'pass', detail: partial ? 'Partially covered — non-covered labor or parts are billable.' : 'Fully covered — non-billable.' });
      return decision(partial ? 'Partially Covered' : 'Fully Covered', a, { laborCovered: labor === 'Included', partsCovered: partsOk !== false && a.parts.partsIncluded });
    });
  }

  private check(input: CoverageInput): Error | null {
    const a = this.store.amc(input.amcId);
    if (!a) return new Error('Select a valid AMC.');
    if (input.level === 'Site' && (!input.siteId || !a.scope.siteIds.includes(input.siteId))) return new Error('Select a site within the AMC scope.');
    if (input.level === 'Asset' && (!input.assetId || !a.scope.assetIds.includes(input.assetId))) return new Error('Only assets within the AMC scope can be covered.');
    if (input.level === 'Asset Category' && !input.assetCategory) return new Error('Select an asset category.');
    if (input.level === 'Service' && (!input.serviceId || !a.scope.serviceIds.includes(input.serviceId))) return new Error('Select a service within the AMC scope.');
    if (input.endDate < input.startDate) return new Error('End date must be after the start date.');
    if (input.startDate < a.period.startDate || input.endDate > a.period.endDate) return new Error('Coverage dates must fall within the AMC period.');
    return null;
  }
}

@Injectable()
export class MockServicePlanApi extends ServicePlanApi {
  private readonly store = inject(MockAmcStore);

  list(amcId?: string): Observable<ServicePlanListItem[]> {
    return query(() =>
      this.store.db.plans
        .filter((p) => !amcId || p.amcId === amcId)
        .map((p) => {
          const a = this.store.amc(p.amcId);
          const events = this.store.db.events.filter((e) => e.planId === p.id);
          return { ...p, amcNumber: a?.number ?? p.amcId, customerName: this.store.customerName(a?.customer.customerId), serviceName: this.store.serviceName(p.serviceId), assetCount: p.assetIds.length || (a?.scope.assetIds.length ?? 0), plannedEvents: events.length, completedEvents: events.filter((e) => e.status === 'Completed').length };
        }),
    );
  }

  create(input: ServicePlanInput): Observable<void> {
    return mutate(() => {
      const error = this.check(input);
      if (error) return error;
      const id = this.store.uid('PLN');
      this.store.db.plans.push({ ...input, id });
      this.store.log('Plan Updated', 'Service Plan', id, input.amcId, `${input.frequency} ${input.serviceType} plan added for ${this.store.serviceName(input.serviceId)}.`);
      return undefined;
    });
  }

  update(id: string, input: ServicePlanInput): Observable<void> {
    return mutate(() => {
      const current = this.store.db.plans.find((p) => p.id === id);
      if (!current) return new Error('Plan was not found.');
      const error = this.check(input);
      if (error) return error;
      this.store.db.plans = this.store.db.plans.map((p) => (p.id === id ? { ...input, id } : p));
      this.store.log('Plan Updated', 'Service Plan', id, input.amcId, `Plan updated${current.frequency !== input.frequency ? ` — regenerate the schedule to apply ${input.frequency}` : ''}.`, current.frequency, input.frequency);
      return undefined;
    });
  }

  private check(input: ServicePlanInput): Error | null {
    const a = this.store.amc(input.amcId);
    if (!a) return new Error('Select a valid AMC.');
    if (!a.scope.serviceIds.includes(input.serviceId)) return new Error('The service must be included in the AMC coverage scope.');
    if (input.assetIds.some((id) => !a.scope.assetIds.includes(id))) return new Error('Plan assets must be within the AMC coverage scope.');
    if ((FREQUENCY_PER_YEAR[input.frequency] === 0) && input.occurrences <= 0) return new Error('Enter the number of occurrences for custom, meter or condition-based frequencies.');
    return null;
  }
}

@Injectable()
export class MockScheduleApi extends ScheduleApi {
  private readonly store = inject(MockAmcStore);
  private readonly ops = inject(AmcOps);

  list(amcId?: string): Observable<PmEventListItem[]> {
    return query(() => this.store.db.events.filter((e) => !amcId || e.amcId === amcId).map((e) => this.store.eventItem(e)).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)));
  }

  generate(amcId: string): Observable<number> {
    return mutate(() => {
      const a = this.ops.requireOperational(amcId);
      if (a instanceof Error) return a;
      if (!this.store.db.plans.some((p) => p.amcId === amcId && p.active)) return new Error('Add an active service plan before generating the schedule.');
      return this.ops.generateSchedule(a);
    });
  }

  assign(id: string, team: string, technician: string | null): Observable<void> {
    return this.change(id, (e) => {
      const territory = this.ops.checkTerritory(e.siteId, technician);
      if (territory) return territory;
      return { patch: { team, technician, status: technician ? 'Assigned' : 'Scheduled' }, action: 'Visit Scheduled', comment: `${e.number} assigned to ${technician ?? team}.` };
    });
  }

  reschedule(id: string, date: string, reason: string): Observable<void> {
    return this.change(id, (e, a) => {
      if (date < a.period.startDate || date > a.period.endDate) return new Error('The new date must be within the AMC period.');
      const working = nextWorkingDay(date);
      return {
        patch: { scheduledDate: working, dueDate: addDays(working, 7), status: 'Rescheduled', rescheduledFrom: e.scheduledDate },
        action: 'Visit Rescheduled', comment: `${e.number} moved to ${working}${working !== date ? ' (next working day)' : ''}. ${reason}`.trim(), from: e.scheduledDate, to: working,
      };
    });
  }

  setStatus(id: string, status: 'In Progress' | 'Completed' | 'Cancelled' | 'Missed'): Observable<void> {
    return mutate(() => {
      const e = this.store.db.events.find((x) => x.id === id);
      if (!e) return new Error('Maintenance event was not found.');
      if (['Completed', 'Cancelled'].includes(e.status)) return new Error(`This event is already ${e.status.toLowerCase()}.`);
      if (status === 'In Progress' || status === 'Completed') {
        const a = this.ops.requireOperational(e.amcId);
        if (a instanceof Error) return a;
      }
      if (status === 'Completed' && !e.visitId) {
        // Standalone completion creates the service visit so that consumption is recorded.
        const visitId = this.store.uid('VIS');
        const service = this.store.db.reference.services.find((s) => s.id === e.serviceId);
        const visit: Visit = { id: visitId, number: visitId, amcId: e.amcId, siteId: e.siteId, assetIds: [e.assetId], serviceId: e.serviceId, plannedDate: e.scheduledDate, window: e.window, technician: e.technician, team: e.team, type: 'Preventive Maintenance', status: 'In Progress', eventIds: [e.id], workOrder: e.workOrder, hours: 0, partsValue: 0, consumablesValue: 0, covered: true, responseHours: null, firstTimeFix: null, report: '', completedAt: null };
        this.store.db.visits.push(visit);
        this.store.db.events = this.store.db.events.map((x) => (x.id === id ? { ...x, visitId } : x));
        this.ops.completeVisit(visit, { hours: service?.durationHours ?? 2, partsValue: 0, consumablesValue: 0, firstTimeFix: true, report: 'Completed from the maintenance schedule.' });
        return undefined;
      }
      if (status === 'Completed') {
        const v = this.store.db.visits.find((x) => x.id === e.visitId)!;
        if (v.status !== 'Completed') this.ops.completeVisit(v, { hours: v.hours || 2, partsValue: v.partsValue, consumablesValue: v.consumablesValue, firstTimeFix: true, report: v.report || 'Completed from the maintenance schedule.' });
        return undefined;
      }
      this.store.db.events = this.store.db.events.map((x) => (x.id === id ? { ...x, status } : x));
      this.store.log(status === 'Cancelled' ? 'Visit Cancelled' : status === 'Missed' ? 'Maintenance Escalated' : 'Visit Scheduled', 'Schedule', id, e.amcId, `${e.number} ${status.toLowerCase()}.`, this.store.pmStatus(e), status);
      return undefined;
    });
  }

  escalate(id: string): Observable<void> {
    return mutate(() => {
      const e = this.store.db.events.find((x) => x.id === id);
      if (!e) return new Error('Maintenance event was not found.');
      if (this.store.pmStatus(e) !== 'Overdue') return new Error('Only overdue maintenance can be escalated.');
      this.store.db.events = this.store.db.events.map((x) => (x.id === id ? { ...x, escalated: true, priority: 'High' } : x));
      const a = this.store.amc(e.amcId);
      this.store.log('Maintenance Escalated', 'Schedule', id, e.amcId, `${e.number} overdue — escalated to ${this.store.db.reference.users.find((u) => u.id === a?.customer.contractManagerId)?.name ?? 'the contract manager'}.`, e.priority, 'High');
      return undefined;
    });
  }

  private change(id: string, work: (e: PmEvent, a: Amc) => { patch: Partial<PmEvent>; action: 'Visit Scheduled' | 'Visit Rescheduled'; comment: string; from?: string; to?: string } | Error): Observable<void> {
    return mutate(() => {
      const e = this.store.db.events.find((x) => x.id === id);
      if (!e) return new Error('Maintenance event was not found.');
      if (['Completed', 'Cancelled', 'Missed'].includes(e.status)) return new Error(`${e.status} events cannot be changed.`);
      const a = this.ops.requireOperational(e.amcId);
      if (a instanceof Error) return a;
      const result = work(e, a);
      if (result instanceof Error) return result;
      this.store.db.events = this.store.db.events.map((x) => (x.id === id ? { ...x, ...result.patch } : x));
      this.store.log(result.action, 'Schedule', id, e.amcId, result.comment, result.from ?? null, result.to ?? null);
      return undefined;
    });
  }
}

@Injectable()
export class MockVisitApi extends VisitApi {
  private readonly store = inject(MockAmcStore);
  private readonly ops = inject(AmcOps);

  list(amcId?: string): Observable<VisitListItem[]> {
    return query(() => this.store.db.visits.filter((v) => !amcId || v.amcId === amcId).map((v) => this.store.visitItem(v)).sort((a, b) => b.plannedDate.localeCompare(a.plannedDate)));
  }

  generate(amcId: string, days: number): Observable<number> {
    return mutate(() => {
      const a = this.ops.requireOperational(amcId);
      if (a instanceof Error) return a;
      const horizon = addDays(today(), days);
      const pending = this.store.db.events.filter((e) => e.amcId === amcId && !e.visitId && ['Planned', 'Scheduled', 'Assigned', 'Rescheduled'].includes(e.status) && e.scheduledDate >= today() && e.scheduledDate <= horizon);
      const groups = new Map<string, PmEvent[]>();
      pending.forEach((e) => groups.set(`${e.siteId}|${e.scheduledDate}`, [...(groups.get(`${e.siteId}|${e.scheduledDate}`) ?? []), e]));
      for (const events of groups.values()) {
        const first = events[0];
        const id = this.store.uid('VIS');
        const technician = events.find((e) => e.technician)?.technician ?? null;
        this.store.db.visits.push({ id, number: id, amcId, siteId: first.siteId, assetIds: events.map((e) => e.assetId), serviceId: first.serviceId, plannedDate: first.scheduledDate, window: first.window, technician, team: first.team, type: first.maintenanceType === 'Inspection' ? 'Inspection' : 'Preventive Maintenance', status: technician ? 'Assigned' : 'Scheduled', eventIds: events.map((e) => e.id), workOrder: null, hours: 0, partsValue: 0, consumablesValue: 0, covered: true, responseHours: null, firstTimeFix: null, report: '', completedAt: null });
        this.store.db.events = this.store.db.events.map((e) => (events.includes(e) ? { ...e, visitId: id, status: e.status === 'Planned' ? 'Scheduled' : e.status } : e));
      }
      if (groups.size) this.store.log('Visit Scheduled', 'Visit', amcId, amcId, `${groups.size} visit(s) generated for the next ${days} days.`);
      return groups.size;
    });
  }

  create(input: VisitInput): Observable<void> {
    return mutate(() => {
      const a = this.ops.requireOperational(input.amcId);
      if (a instanceof Error) return a;
      if (!a.scope.siteIds.includes(input.siteId)) return new Error('The site is not covered by this AMC.');
      if (input.assetIds.some((id) => !a.scope.assetIds.includes(id) || a.scope.excludedAssetIds.includes(id))) return new Error('Only assets within the defined coverage scope may receive AMC-covered services.');
      if (input.serviceId && (!a.scope.serviceIds.includes(input.serviceId) || a.scope.excludedServiceIds.includes(input.serviceId))) return new Error('The service is not covered by this AMC.');
      if (input.plannedDate < a.period.startDate || input.plannedDate > a.period.endDate) return new Error('The visit date must be within the AMC period.');
      const territory = this.ops.checkTerritory(input.siteId, input.technician);
      if (territory) return territory;
      const id = this.store.uid('VIS');
      const covered = input.type !== 'Emergency' || a.maintenance.emergencyService;
      this.store.db.visits.push({ ...input, id, number: id, status: input.technician ? 'Assigned' : 'Scheduled', eventIds: [], workOrder: null, hours: 0, partsValue: 0, consumablesValue: 0, covered, responseHours: null, firstTimeFix: null, report: '', completedAt: null });
      this.store.log('Visit Scheduled', 'Visit', id, input.amcId, `${input.type} visit scheduled for ${input.plannedDate}${covered ? '' : ' — emergency service not included (billable)'}.`);
      return undefined;
    });
  }

  assign(id: string, team: string, technician: string): Observable<void> {
    return this.change(id, ['Planned', 'Scheduled', 'Assigned', 'Confirmed', 'Rescheduled'], (v) => {
      const territory = this.ops.checkTerritory(v.siteId, technician);
      if (territory) return territory;
      this.store.db.events = this.store.db.events.map((e) => (v.eventIds.includes(e.id) ? { ...e, technician, team, status: 'Assigned' } : e));
      return { patch: { team, technician, status: 'Assigned' }, comment: `${v.number} assigned to ${technician}.` };
    });
  }

  confirm(id: string): Observable<void> {
    return this.change(id, ['Assigned'], (v) => ({ patch: { status: 'Confirmed' }, comment: `${v.number} confirmed with the customer.` }));
  }

  reschedule(id: string, date: string): Observable<void> {
    return this.change(id, ['Planned', 'Scheduled', 'Assigned', 'Confirmed', 'Rescheduled'], (v, a) => {
      if (date < a.period.startDate || date > a.period.endDate) return new Error('The new date must be within the AMC period.');
      const working = nextWorkingDay(date);
      this.store.db.events = this.store.db.events.map((e) => (v.eventIds.includes(e.id) ? { ...e, scheduledDate: working, dueDate: addDays(working, 7), status: 'Rescheduled', rescheduledFrom: e.scheduledDate } : e));
      return { patch: { plannedDate: working, status: 'Rescheduled' }, comment: `${v.number} moved from ${v.plannedDate} to ${working}.`, action: 'Visit Rescheduled' };
    });
  }

  start(id: string): Observable<void> {
    return this.change(id, ['Scheduled', 'Assigned', 'Confirmed', 'Rescheduled'], (v) => {
      if (!v.technician) return new Error('Assign a technician before starting the visit.');
      this.store.db.events = this.store.db.events.map((e) => (v.eventIds.includes(e.id) ? { ...e, status: 'In Progress' } : e));
      return { patch: { status: 'In Progress' }, comment: `${v.number} started.` };
    });
  }

  complete(id: string, completion: VisitCompletion): Observable<void> {
    return mutate(() => {
      const v = this.store.db.visits.find((x) => x.id === id);
      if (!v) return new Error('Visit was not found.');
      if (v.status !== 'In Progress') return new Error('Start the visit before completing it.');
      if (completion.hours <= 0) return new Error('Enter the service hours.');
      if (!completion.report.trim()) return new Error('A service report is required.');
      this.ops.completeVisit(v, completion);
      return undefined;
    });
  }

  cancel(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const v = this.store.db.visits.find((x) => x.id === id);
      if (!v) return new Error('Visit was not found.');
      if (['Completed', 'Cancelled'].includes(v.status)) return new Error(`${v.status} visits cannot be cancelled.`);
      this.store.db.visits = this.store.db.visits.map((x) => (x.id === id ? { ...x, status: 'Cancelled', report: reason } : x));
      this.store.db.events = this.store.db.events.map((e) => (v.eventIds.includes(e.id) ? { ...e, visitId: null, status: 'Scheduled' } : e));
      this.store.log('Visit Cancelled', 'Visit', id, v.amcId, `${v.number} cancelled. ${reason}`.trim());
      return undefined;
    });
  }

  createWorkOrder(id: string): Observable<string> {
    return mutate(() => {
      const v = this.store.db.visits.find((x) => x.id === id);
      if (!v) return new Error('Visit was not found.');
      if (v.workOrder) return new Error(`Work order ${v.workOrder} already exists.`);
      const a = this.ops.requireOperational(v.amcId);
      if (a instanceof Error) return a;
      const wo = `WO-${8000 + this.store.db.visits.filter((x) => x.workOrder).length}`;
      this.store.db.visits = this.store.db.visits.map((x) => (x.id === id ? { ...x, workOrder: wo } : x));
      this.store.db.events = this.store.db.events.map((e) => (v.eventIds.includes(e.id) ? { ...e, workOrder: wo } : e));
      this.store.log('Visit Scheduled', 'Visit', id, v.amcId, `Work order ${wo} created for ${v.number}.`, null, wo, wo);
      return wo;
    });
  }

  private change(id: string, from: readonly Visit['status'][], work: (v: Visit, a: Amc) => { patch: Partial<Visit>; comment: string; action?: 'Visit Scheduled' | 'Visit Rescheduled' } | Error): Observable<void> {
    return mutate(() => {
      const v = this.store.db.visits.find((x) => x.id === id);
      if (!v) return new Error('Visit was not found.');
      if (!from.includes(v.status)) return new Error(`${v.status} visits cannot be changed this way.`);
      const a = this.ops.requireOperational(v.amcId);
      if (a instanceof Error) return a;
      const result = work(v, a);
      if (result instanceof Error) return result;
      this.store.db.visits = this.store.db.visits.map((x) => (x.id === id ? { ...x, ...result.patch } : x));
      this.store.log(result.action ?? 'Visit Scheduled', 'Visit', id, v.amcId, result.comment, v.status, result.patch.status ?? null);
      return undefined;
    });
  }
}

@Injectable()
export class MockBillingApi extends BillingApi {
  private readonly store = inject(MockAmcStore);

  list(amcId?: string): Observable<BillingListItem[]> {
    return query(() => this.store.db.billing.filter((b) => !amcId || b.amcId === amcId).map((b) => this.store.billingItem(b)).sort((a, b) => a.billingDate.localeCompare(b.billingDate)));
  }

  generate(amcId: string): Observable<number> {
    return mutate(() => {
      const a = this.store.amc(amcId);
      if (!a) return new Error('AMC was not found.');
      if (this.store.db.billing.some((b) => b.amcId === amcId && b.status !== 'Cancelled')) return new Error('A billing schedule already exists for this AMC.');
      const years = Math.max(1, (new Date(a.period.endDate).getTime() - new Date(a.period.startDate).getTime()) / (365 * 86_400_000));
      const once = a.commercial.billingFrequency === 'One-Time';
      const periods = once ? 1 : (BILLING_PER_YEAR[a.commercial.billingFrequency] ?? 4);
      const total = once ? 1 : Math.max(1, Math.round(periods * years));
      const amount = Math.round(a.commercial.value / total);
      const discount = Math.round((amount * a.commercial.discountPercent) / 100);
      const tax = a.commercial.taxProfileId === 'TAX-STD' ? Math.round((amount - discount) * AMC_RULES.taxRate) : 0;
      for (let i = 0; i < total; i++) {
        const billingDate = once ? a.period.startDate : addMonths(a.period.startDate, i * (12 / periods));
        const id = this.store.uid('BIL');
        this.store.db.billing.push({ id, number: id, amcId, period: once ? `${a.period.startDate} → ${a.period.endDate}` : `${billingDate} → ${addDays(addMonths(billingDate, 12 / periods), -1)}`, billingDate, dueDate: addDays(billingDate, 30), amount, discount, tax, net: amount - discount + tax, currency: a.commercial.currency, status: 'Planned', invoiceNumber: null, paidAmount: 0, onHold: a.status === 'Suspended' });
      }
      this.store.log('Billing Generated', 'Billing', amcId, amcId, `${total} billing line(s) generated (${a.commercial.billingFrequency}).`, null, `${a.commercial.currency} ${amount.toLocaleString('en-US')} each`);
      return total;
    });
  }

  advance(id: string): Observable<void> {
    return mutate(() => {
      const b = this.store.db.billing.find((x) => x.id === id);
      if (!b) return new Error('Billing line was not found.');
      if (b.onHold) return new Error('Billing is on hold while the AMC is suspended.');
      const next = b.status === 'Planned' ? 'Ready for Billing' : b.status === 'Ready for Billing' ? 'Invoiced' : null;
      if (!next) return new Error(`${b.status} lines cannot be advanced.`);
      const invoiceNumber = next === 'Invoiced' ? `INV-${30000 + this.store.db.billing.filter((x) => x.invoiceNumber).length}` : b.invoiceNumber;
      this.store.db.billing = this.store.db.billing.map((x) => (x.id === id ? { ...x, status: next, invoiceNumber } : x));
      this.store.log('Billing Updated', 'Billing', id, b.amcId, next === 'Invoiced' ? `${b.number} handed to Billing & Revenue — invoice ${invoiceNumber}.` : `${b.number} ready for billing.`, b.status, next, invoiceNumber);
      return undefined;
    });
  }

  recordPayment(id: string, amount: number): Observable<void> {
    return mutate(() => {
      const b = this.store.db.billing.find((x) => x.id === id);
      if (!b) return new Error('Billing line was not found.');
      if (!['Invoiced', 'Partially Paid'].includes(b.status)) return new Error('Payments can only be recorded against invoiced lines.');
      if (amount <= 0 || amount > b.net - b.paidAmount) return new Error(`Enter an amount up to ${b.net - b.paidAmount}.`);
      const paidAmount = b.paidAmount + amount;
      const status: BillingLine['status'] = paidAmount >= b.net ? 'Paid' : 'Partially Paid';
      this.store.db.billing = this.store.db.billing.map((x) => (x.id === id ? { ...x, paidAmount, status } : x));
      this.store.log('Billing Updated', 'Billing', id, b.amcId, `Payment of ${b.currency} ${amount.toLocaleString('en-US')} recorded.`, String(b.paidAmount), String(paidAmount), b.invoiceNumber);
      return undefined;
    });
  }

  cancel(id: string): Observable<void> {
    return mutate(() => {
      const b = this.store.db.billing.find((x) => x.id === id);
      if (!b) return new Error('Billing line was not found.');
      if (!['Planned', 'Ready for Billing'].includes(b.status)) return new Error('Only planned or ready lines can be cancelled.');
      this.store.db.billing = this.store.db.billing.map((x) => (x.id === id ? { ...x, status: 'Cancelled' } : x));
      this.store.log('Billing Updated', 'Billing', id, b.amcId, `${b.number} cancelled.`, b.status, 'Cancelled');
      return undefined;
    });
  }
}

@Injectable()
export class MockAmcHistoryApi extends AmcHistoryApi {
  private readonly store = inject(MockAmcStore);

  list(filter: { amcId?: string; entity?: AmcHistoryEntity } = {}): Observable<AmcHistoryEvent[]> {
    return query(() => this.store.db.history.filter((h) => (!filter.amcId || h.amcId === filter.amcId) && (!filter.entity || h.entity === filter.entity)));
  }
}

@Injectable()
export class MockAmcReferenceApi extends AmcReferenceApi {
  private readonly store = inject(MockAmcStore);

  get(): Observable<AmcReferenceData> {
    return defer(() => respond(this.store.db.reference, 150));
  }
}
