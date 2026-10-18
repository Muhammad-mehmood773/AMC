import { Injectable, inject } from '@angular/core';
import { type Observable, defer } from 'rxjs';
import { fail, pad, respond } from '../../../customers/data/mock/mock-utils';
import type {
  AssetPerformanceRow,
  CalendarConflict,
  ChecklistInput,
  ChecklistListItem,
  Completion,
  CountRow,
  MaintenanceTaskInput,
  MeterRuleInput,
  MeterRuleListItem,
  Occurrence,
  OccurrenceListItem,
  PlanReview,
  PlanReviewInput,
  PmDashboard,
  PmDashboardFilters,
  PmHistoryEntity,
  PmHistoryEvent,
  PmPerformance,
  PmValidation,
  PmWorkOrderListItem,
  StockPart,
  TaskListItem,
} from '../../models/operations.model';
import { OPEN_STATUSES } from '../../models/operations.model';
import type { MaintenancePlan, PlanDocument, PlanListItem, PlanUpsert, PlanVersion } from '../../models/plan.model';
import { EDITABLE_PLAN_STATUSES, PM_TYPES } from '../../models/plan.model';
import type { PmReferenceData } from '../../models/reference.model';
import { ChecklistApi, type CorrectiveInput, MeterApi, PlanApi, PmHistoryApi, PmPerformanceApi, PmReferenceApi, PmWorkOrderApi, type PreviewDate, type RescheduleInput, ScheduleApi, type ScheduleInput, TaskApi } from '../pm.api';
import { PM_RULES } from '../pm.config';
import { adjust, addDays, daysBetweenIso, frequencyLabel, isNonWorking, planDates, recurrenceError, today } from '../pm-recurrence';
import { assignmentIssue, automate, completionIssue, createWorkOrder, effectiveStatus, evaluateChecklist, generateFor, newOccurrence, occurrenceCost, validateOccurrence } from './pm-engine';
import { MockPmStore } from './mock-pm-store';

function mutate<T>(work: () => T | Error): Observable<T> {
  return defer(() => {
    const result = work();
    return result instanceof Error ? fail(result.message) : respond(result, 320);
  });
}

function query<T>(store: MockPmStore, work: () => T): Observable<T> {
  return defer(() => {
    store.monitor();
    return respond(work());
  });
}

const nextMinor = (v: string) => {
  const [a, b] = v.split('.').map(Number);
  return `${a}.${(b || 0) + 1}`;
};

const toPlan = (input: PlanUpsert, base: Partial<MaintenancePlan>): MaintenancePlan => ({ id: '', status: 'Draft', approval: 'Not Submitted', version: '1.0', documents: [], createdAt: '', createdBy: '', updatedAt: null, updatedBy: null, ...base, ...input }) as MaintenancePlan;

@Injectable()
export class MockPlanApi extends PlanApi {
  private readonly store = inject(MockPmStore);

  list(): Observable<PlanListItem[]> {
    return query(this.store, () => [...this.store.db.plans].sort((a, b) => b.number.localeCompare(a.number)).map((p) => this.store.planItem(p)));
  }

  get(id: string): Observable<PlanListItem> {
    return defer(() => {
      this.store.monitor();
      const p = this.store.plan(id);
      return p ? respond(this.store.planItem(p)) : fail(`Maintenance plan ${id} was not found.`);
    });
  }

  create(input: PlanUpsert): Observable<MaintenancePlan> {
    return mutate(() => {
      const number = this.number();
      const error = this.check(input);
      if (error) return error;
      const p = toPlan(input, { id: number, number, createdAt: this.store.now(), createdBy: this.store.user });
      this.store.db.plans.push(p);
      this.store.db.versions.push({ planId: p.id, version: '1.0', createdAt: p.createdAt, createdBy: p.createdBy, summary: 'Initial version.', frequency: frequencyLabel(p) });
      this.store.record('Maintenance Plan Created', 'Plan', p.id, p.id, `${p.maintenanceType} plan for ${p.assetIds.length} asset(s).`, null, p.name);
      return p;
    });
  }

  update(id: string, input: PlanUpsert, summary: string): Observable<MaintenancePlan> {
    return mutate(() => {
      const current = this.store.plan(id);
      if (!current) return new Error('Plan was not found.');
      if (!EDITABLE_PLAN_STATUSES.includes(current.status)) return new Error(`${current.status} plans cannot be changed.`);
      const error = this.check(input);
      if (error) return error;
      return this.applyChange(current, input, summary || 'Plan updated.');
    });
  }

  /** Version-controlled change; future occurrences from the effective date are recalculated (SRS 8.18). */
  private applyChange(current: MaintenancePlan, input: PlanUpsert, summary: string): MaintenancePlan {
    const freqChanged = JSON.stringify({ ...current.frequency, effectiveDate: '' }) !== JSON.stringify({ ...input.frequency, effectiveDate: '' }) || current.strategy.strategy !== input.strategy.strategy || JSON.stringify(current.assetIds) !== JSON.stringify(input.assetIds);
    const version = nextMinor(current.version);
    const effective = freqChanged ? [input.frequency.effectiveDate || today(), today()].sort().at(-1)! : current.frequency.effectiveDate;
    const next: MaintenancePlan = { ...current, ...input, frequency: { ...input.frequency, effectiveDate: effective }, version, updatedAt: this.store.now(), updatedBy: this.store.user };
    this.store.replacePlan(next);
    this.store.db.versions.push({ planId: current.id, version, createdAt: this.store.now(), createdBy: this.store.user, summary, frequency: frequencyLabel(next) });
    if (freqChanged) {
      let superseded = 0;
      this.store.db.occurrences = this.store.db.occurrences.map((o) => {
        if (o.planId !== current.id || !['Planned', 'Scheduled'].includes(o.status) || o.workOrderId || o.scheduledDate < effective) return o;
        superseded++;
        return { ...o, status: 'Cancelled', cancelReason: `Superseded by plan v${version} (effective ${effective}).` };
      });
      const created = generateFor(this.store.db, next, this.store.uid, undefined, effective);
      this.store.record('Maintenance Plan Modified', 'Plan', current.id, current.id, `${summary} Frequency changed from ${effective}: ${superseded} future event(s) superseded, ${created.length} regenerated. History unchanged.`, frequencyLabel(current), frequencyLabel(next));
    } else this.store.record('Maintenance Plan Modified', 'Plan', current.id, current.id, summary, `v${current.version}`, `v${version}`);
    return next;
  }

  nextNumber(): Observable<string> {
    return query(this.store, () => this.number());
  }

  private number(): string {
    return `PMP-${pad(Math.max(0, ...this.store.db.plans.map((p) => Number(p.number.slice(4)) || 0)) + 1, 5)}`;
  }

  duplicate(id: string): Observable<MaintenancePlan> {
    return mutate(() => {
      const p = this.store.plan(id);
      if (!p) return new Error('Plan was not found.');
      const number = this.number();
      const copy: MaintenancePlan = { ...p, id: number, number, name: `${p.name} (Copy)`, status: 'Draft', approval: 'Not Submitted', version: '1.0', documents: [], createdAt: this.store.now(), createdBy: this.store.user, updatedAt: null, updatedBy: null };
      this.store.db.plans.push(copy);
      this.store.db.versions.push({ planId: number, version: '1.0', createdAt: copy.createdAt, createdBy: copy.createdBy, summary: `Duplicated from ${p.number}.`, frequency: frequencyLabel(copy) });
      this.store.db.meters.push(...this.store.db.meters.filter((m) => m.planId === id).map((m) => ({ ...m, id: this.store.uid('MTR'), number: `MTR-${pad(this.store.db.meters.length + 1, 3)}`, planId: number, readings: m.readings.slice(-1) })));
      this.store.record('Maintenance Plan Created', 'Plan', number, number, `Duplicated from ${p.number}.`, null, copy.name, p.number);
      return copy;
    });
  }

  submitForApproval(id: string): Observable<void> {
    return mutate(() => {
      const p = this.store.plan(id);
      if (!p || !['Draft', 'Under Review'].includes(p.status)) return new Error('Only draft plans can be submitted.');
      const error = this.activationIssue(p);
      if (error) return error;
      this.store.replacePlan({ ...p, status: 'Under Review', approval: 'Pending' });
      this.store.record('Submitted for Approval', 'Plan', id, id, 'Submitted for approval.', p.status, 'Under Review');
      return undefined;
    });
  }

  approve(id: string, approve: boolean, comment: string): Observable<void> {
    return mutate(() => {
      const p = this.store.plan(id);
      if (!p || p.status !== 'Under Review') return new Error('Only plans under review can be approved.');
      if (!approve && !comment.trim()) return new Error('A comment is required when rejecting.');
      this.store.replacePlan({ ...p, status: approve ? 'Approved' : 'Draft', approval: approve ? 'Approved' : 'Rejected' });
      this.store.record(approve ? 'Maintenance Plan Approved' : 'Maintenance Plan Modified', 'Plan', id, id, approve ? comment || 'Approved.' : `Rejected: ${comment}`, 'Under Review', approve ? 'Approved' : 'Draft');
      return undefined;
    });
  }

  activate(id: string): Observable<MaintenancePlan> {
    return mutate(() => {
      const p = this.store.plan(id);
      if (!p || !['Draft', 'Under Review', 'Approved'].includes(p.status)) return new Error('Only draft or approved plans can be activated.');
      const error = this.activationIssue(p);
      if (error) return error;
      const critical = p.assetIds.some((a) => this.store.db.reference.assets.find((x) => x.id === a)?.criticality === 'Critical');
      if (PM_RULES.approvalForCriticalAssets && critical && p.approval !== 'Approved') return new Error('Maintenance requires approval — the plan covers critical assets. Submit it for approval first.');
      const next: MaintenancePlan = { ...p, status: 'Active', approval: 'Approved' };
      this.store.replacePlan(next);
      const created = generateFor(this.store.db, next, this.store.uid);
      this.store.record('Maintenance Plan Activated', 'Plan', id, id, 'Plan activated.', p.status, 'Active');
      if (created.length) this.store.record('Schedule Generated', 'Schedule', id, id, `${created.length} occurrence(s) generated for the next ${PM_RULES.horizonDays} days.`, null, String(created.length));
      automate(this.store.db, this.store.uid, this.store.log);
      return next;
    });
  }

  suspend(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const p = this.store.plan(id);
      if (!p || p.status !== 'Active') return new Error('Only active plans can be suspended.');
      if (!reason.trim()) return new Error('A suspension reason is required.');
      this.store.replacePlan({ ...p, status: 'Suspended' });
      this.store.record('Maintenance Plan Suspended', 'Plan', id, id, `${reason} — no new maintenance work is generated while suspended.`, 'Active', 'Suspended');
      return undefined;
    });
  }

  resume(id: string): Observable<void> {
    return mutate(() => {
      const p = this.store.plan(id);
      if (!p || p.status !== 'Suspended') return new Error('Only suspended plans can be resumed.');
      const next: MaintenancePlan = { ...p, status: 'Active' };
      this.store.replacePlan(next);
      const created = generateFor(this.store.db, next, this.store.uid);
      this.store.record('Maintenance Plan Resumed', 'Plan', id, id, `Plan resumed${created.length ? ` — ${created.length} occurrence(s) generated` : ''}.`, 'Suspended', 'Active');
      return undefined;
    });
  }

  preview(input: PlanUpsert, months: number): Observable<PreviewDate[]> {
    return defer(() => {
      const p = toPlan(input, { id: 'preview' });
      const err = recurrenceError(p);
      if (err) return fail(err);
      const from = [today(), p.frequency.startDate].sort().at(-1)!;
      return respond(planDates(p, from, addDays(from, Math.round(months * 30.4)), this.store.db.reference.holidays).map((d) => ({ ...d, adjusted: d.ruleDate !== d.scheduledDate })), 150);
    });
  }

  review(id: string): Observable<PlanReview> {
    return query(this.store, () => {
      const p = this.store.plan(id)!;
      const occ = this.store.db.occurrences.filter((o) => o.planId === id);
      const perf = this.store.performance(occ);
      const done = occ.filter((o) => o.completion).sort((a, b) => a.completion!.endedAt.localeCompare(b.completion!.endedAt));
      const span = done.length > 1 ? daysBetweenIso(done[0].completion!.endedAt.slice(0, 10), done.at(-1)!.completion!.endedAt.slice(0, 10)) / (done.length - 1) / Math.max(1, p.assetIds.length) : null;
      const conditions = done.map((o) => o.completion!.assetCondition);
      const worst = ['Critical', 'Poor', 'Fair', 'Good', 'Excellent'].find((c) => conditions.includes(c)) ?? 'Good';
      const breakdowns = perf.correctiveGenerated;
      return {
        planId: id, previousFrequency: frequencyLabel(p), actualFrequency: span ? `Every ~${Math.round(span)} days per asset` : 'Not enough history', breakdownFrequency: breakdowns, repeatFailureRate: perf.repeatFailureRate, cost: perf.cost, partsConsumption: perf.partsConsumption, technicianHours: perf.technicianHours,
        assetCondition: worst, correctiveActions: breakdowns,
        suggestion: breakdowns > Math.max(2, perf.completed * 0.15) ? 'High failure rate — increase the maintenance frequency and review the checklist.' : perf.completed > 6 && breakdowns === 0 && worst !== 'Fair' ? 'No failures and good condition — the interval could be extended to reduce cost.' : 'Performance is stable — keep the current frequency.',
      };
    });
  }

  applyReview(id: string, input: PlanReviewInput): Observable<void> {
    return mutate(() => {
      const p = this.store.plan(id);
      if (!p || !EDITABLE_PLAN_STATUSES.includes(p.status)) return new Error('This plan cannot be revised.');
      const { id: _i, number: _n, status: _s, approval: _a, version: _v, documents: _d, createdAt: _c, createdBy: _b, updatedAt: _u, updatedBy: _y, ...rest } = p;
      void [_i, _n, _s, _a, _v, _d, _c, _b, _u, _y];
      const upsert: PlanUpsert = { ...rest, frequency: { ...p.frequency, type: input.frequencyType as MaintenancePlan['frequency']['type'], value: input.frequencyValue, effectiveDate: input.effectiveDate }, procedure: { ...p.procedure, checklistId: input.checklistId }, parts: { ...p.parts, required: input.parts }, scheduling: { ...p.scheduling, window: input.window } };
      const err = this.check(upsert);
      if (err) return err;
      this.applyChange(p, upsert, `Plan review: ${input.notes || 'revised maintenance plan'}`);
      this.store.record('Plan Reviewed', 'Plan', id, id, input.notes || 'Plan reviewed and revised.', `v${p.version}`, `v${this.store.plan(id)!.version}`);
      return undefined;
    });
  }

  versions(id: string): Observable<PlanVersion[]> {
    return query(this.store, () => this.store.db.versions.filter((v) => v.planId === id).reverse());
  }

  uploadDocument(id: string, type: PlanDocument['type'], file: { name: string; size: number }): Observable<void> {
    return mutate(() => {
      const p = this.store.plan(id);
      if (!p) return new Error('Plan was not found.');
      this.store.replacePlan({ ...p, documents: [{ id: this.store.uid('PDOC'), name: file.name, type, size: file.size, uploadedBy: this.store.user, uploadedAt: this.store.now() }, ...p.documents] });
      this.store.record('Document Uploaded', 'Document', id, id, `${type} “${file.name}” uploaded.`);
      return undefined;
    });
  }

  dashboard(f: PmDashboardFilters): Observable<PmDashboard> {
    return query(this.store, () => {
      const day = today();
      const has = (list: readonly string[], v: string | null | undefined) => !list.length || list.includes(v ?? '');
      const inRange = (r: { from: string; to: string }, d: string) => (!r.from || d >= r.from) && (!r.to || d <= r.to);
      const plans = this.store.db.plans.filter((p) => has(f.plans, p.id) && has(f.types, p.maintenanceType) && has(f.customers, p.location.customerId) && has(f.sites, p.location.siteId) && has(f.categories, p.assetCategory) && has(f.services, p.service.serviceId) && has(f.teams, p.resources.team) && has(f.regions, p.location.region));
      const planIds = new Set(plans.map((p) => p.id));
      const occ = this.store.db.occurrences.filter((o) => planIds.has(o.planId) && has(f.assets, o.assetId) && has(f.technicians, o.technician) && has(f.statuses, effectiveStatus(o, day)) && inRange(f.due, o.dueDate) && inRange(f.scheduled, o.scheduledDate));
      const items = occ.map((o) => this.store.occurrenceItem(o));
      const perf = this.store.performance(occ);
      const ids = new Set(occ.map((o) => o.id));
      const wos = this.store.db.workOrders.filter((w) => ids.has(w.occurrenceId));
      const count = (rows: Map<string, { label: string; value: number; secondary?: number }>): CountRow[] => [...rows.entries()].map(([key, r]) => ({ key, ...r })).sort((a, b) => b.value - a.value).slice(0, 8);
      const group = (fn: (o: OccurrenceListItem) => [string, string]) => {
        const m = new Map<string, { label: string; value: number; secondary: number }>();
        items.forEach((o) => {
          const [k, l] = fn(o);
          const r = m.get(k) ?? { label: l, value: 0, secondary: 0 };
          r.value++;
          if (o.status === 'Completed') r.secondary++;
          m.set(k, r);
        });
        return count(m);
      };
      const coveredAssets = new Set(plans.filter((p) => p.status === 'Active').flatMap((p) => p.assetIds));
      const unplanned = new Map<string, { label: string; value: number }>();
      this.store.db.reference.assets.filter((a) => !coveredAssets.has(a.id) && has(f.customers, a.customerId) && has(f.categories, a.category) && !['Retired', 'Decommissioned', 'Disposed'].includes(a.status)).forEach((a) => {
        const r = unplanned.get(a.category) ?? { label: a.category, value: 0 };
        r.value++;
        unplanned.set(a.category, r);
      });
      const fails = new Map<string, { label: string; value: number }>();
      this.store.db.workOrders.filter((w) => w.kind === 'Corrective' && ids.has(w.occurrenceId)).forEach((w) => fails.set(w.assetId, { label: this.store.assetName(w.assetId), value: (fails.get(w.assetId)?.value ?? 0) + 1 }));
      const months = [5, 4, 3, 2, 1, 0].map((m) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString().slice(0, 7); });
      const partsUse = new Map<string, { label: string; value: number }>();
      occ.forEach((o) => o.completion?.partsUsed.forEach((u) => partsUse.set(u.partNumber, { label: `${u.partNumber} · ${this.store.db.parts.find((p) => p.partNumber === u.partNumber)?.description ?? ''}`, value: (partsUse.get(u.partNumber)?.value ?? 0) + u.quantity })));
      const sortDue = (a: OccurrenceListItem, b: OccurrenceListItem) => a.scheduledDate.localeCompare(b.scheduledDate);
      return {
        kpis: {
          totalPlans: plans.length, activePlans: plans.filter((p) => p.status === 'Active').length, draftPlans: plans.filter((p) => ['Draft', 'Under Review'].includes(p.status)).length, suspendedPlans: plans.filter((p) => p.status === 'Suspended').length,
          coveredAssets: coveredAssets.size, scheduled: perf.scheduled, due: perf.due, upcoming: items.filter((o) => OPEN_STATUSES.includes(o.status) && o.scheduledDate > day && o.scheduledDate <= addDays(day, 30)).length, overdue: perf.overdue,
          completed: perf.completed, missed: perf.missed, cancelled: occ.filter((o) => o.status === 'Cancelled').length, rescheduled: perf.rescheduled, openWorkOrders: wos.filter((w) => !['Completed', 'Cancelled'].includes(w.status)).length,
          completedWorkOrders: wos.filter((w) => w.status === 'Completed').length, compliance: perf.compliance, completionRate: perf.onTime, overdueRate: occ.length ? Math.round((perf.overdue / Math.max(1, occ.filter((o) => o.scheduledDate <= day).length)) * 1000) / 10 : null,
          avgCompletionMinutes: perf.avgCompletionMinutes, cost: perf.cost,
        },
        dueToday: items.filter((o) => o.dueCategory === 'Due Today').sort(sortDue).slice(0, 6),
        dueWeek: items.filter((o) => ['Due Today', 'Due Tomorrow', 'Due This Week'].includes(o.dueCategory ?? '')).sort(sortDue).slice(0, 6),
        dueMonth: items.filter((o) => ['Due Today', 'Due Tomorrow', 'Due This Week', 'Due This Month'].includes(o.dueCategory ?? '')).length,
        overdue: items.filter((o) => o.effectiveStatus === 'Overdue').sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 6),
        upcoming: items.filter((o) => OPEN_STATUSES.includes(o.status) && o.scheduledDate > day).sort(sortDue).slice(0, 6),
        missed: items.filter((o) => o.status === 'Missed').sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)).slice(0, 6),
        workOrders: wos.filter((w) => !['Completed', 'Cancelled'].includes(w.status)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)).slice(0, 6).map((w) => this.store.workOrderItem(w)),
        assetsWithoutPlans: count(unplanned),
        repeatedFailures: count(fails).filter((r) => r.value > 1),
        bySite: group((o) => [o.siteId, o.siteName]),
        byCategory: group((o) => { const c = this.store.db.reference.assets.find((a) => a.id === o.assetId)?.category ?? ''; return [c, c]; }),
        byTeam: group((o) => [o.team, o.team]),
        complianceTrend: months.map((m) => { const p = this.store.performance(occ.filter((o) => o.scheduledDate.slice(0, 7) === m && o.scheduledDate <= day)); return { key: m, label: m, value: p.compliance ?? 0 }; }),
        costTrend: months.map((m) => ({ key: m, label: m, value: occ.filter((o) => o.completion?.endedAt.slice(0, 7) === m).reduce((s, o) => s + occurrenceCost(this.store.db, o), 0) })),
        parts: count(partsUse),
        recurring: items.filter((o) => OPEN_STATUSES.includes(o.status)).sort(sortDue).slice(0, 8),
      };
    });
  }

  /** SRS 8.25 — plan number, asset scope, frequency, recurrence rule. */
  private check(input: PlanUpsert): Error | null {
    if (!input.name.trim()) return new Error('Plan name is required.');
    if (!PM_TYPES.includes(input.maintenanceType)) return new Error('Select a valid maintenance type.');
    const ref = this.store.db.reference;
    if (!ref.sites.some((s) => s.id === input.location.siteId && s.customerId === input.location.customerId)) return new Error('Select a site of the customer.');
    for (const a of input.assetIds) if (ref.assets.find((x) => x.id === a)?.siteId !== input.location.siteId) return new Error('Every asset must be located at the plan site.');
    if (input.frequency.endDate && input.frequency.endDate < input.frequency.startDate) return new Error('The end date must be after the start date.');
    if (input.service.amcId && ref.amcs.find((a) => a.id === input.service.amcId)?.customerId !== input.location.customerId) return new Error('The AMC must belong to the plan customer.');
    if (input.automation.leadDays < 0 || input.frequency.graceDays < 0) return new Error('Lead time and grace period cannot be negative.');
    return null;
  }

  private activationIssue(p: MaintenancePlan): Error | null {
    if (!p.assetIds.length) return new Error('Every active maintenance plan must reference a valid asset or asset scope.');
    if (!p.frequency.type) return new Error('Maintenance frequency must be defined before activation.');
    const err = recurrenceError(p);
    if (err) return new Error(`Invalid recurrence rule: ${err}`);
    if (p.strategy.strategy === 'Meter-Based' && !this.store.db.meters.some((m) => m.planId === p.id && m.kind === 'Meter')) return new Error('Meter-based plans need at least one meter rule (Meter / Condition Rules screen).');
    if (p.strategy.strategy === 'Condition-Based' && !this.store.db.meters.some((m) => m.planId === p.id && m.kind === 'Condition')) return new Error('Condition-based plans need at least one condition rule.');
    const amc = this.store.db.reference.amcs.find((a) => a.id === p.service.amcId);
    if (amc && !['Active', 'Expiring Soon'].includes(amc.status)) return new Error(`AMC ${amc.number} is ${amc.status.toLowerCase()} — the plan cannot be activated under it.`);
    return null;
  }
}

@Injectable()
export class MockScheduleApi extends ScheduleApi {
  private readonly store = inject(MockPmStore);

  list(planId?: string): Observable<OccurrenceListItem[]> {
    return query(this.store, () => this.store.db.occurrences.filter((o) => !planId || o.planId === planId).map((o) => this.store.occurrenceItem(o)).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)));
  }

  generate(planId: string): Observable<number> {
    return mutate(() => {
      const p = this.store.plan(planId);
      if (!p) return new Error('Plan was not found.');
      if (p.status !== 'Active') return new Error('Only active maintenance plans may generate future maintenance events.');
      if (p.strategy.strategy === 'Meter-Based' || p.strategy.strategy === 'Condition-Based') return new Error('Meter- and condition-based plans generate events from readings.');
      const created = generateFor(this.store.db, p, this.store.uid);
      this.store.record('Schedule Generated', 'Schedule', planId, planId, created.length ? `${created.length} occurrence(s) generated manually.` : 'Schedule is up to date — no duplicates generated.', null, String(created.length));
      return created.length;
    });
  }

  validate(id: string): Observable<PmValidation> {
    return query(this.store, () => validateOccurrence(this.store.db, this.store.occurrence(id)!));
  }

  assign(id: string, input: ScheduleInput): Observable<void> {
    return mutate(() => this.doAssign(id, input));
  }

  bulkAssign(ids: readonly string[], input: ScheduleInput): Observable<number> {
    return mutate(() => {
      const errors: string[] = [];
      let n = 0;
      for (const id of ids) {
        const r = this.doAssign(id, input);
        if (r instanceof Error) errors.push(r.message);
        else n++;
      }
      return n ? n : new Error(errors[0] ?? 'Nothing assigned.');
    });
  }

  private doAssign(id: string, input: ScheduleInput): void | Error {
    const o = this.store.occurrence(id);
    if (!o || !OPEN_STATUSES.includes(o.status)) return new Error('Only open maintenance events can be assigned.');
    const p = this.store.plan(o.planId)!;
    if (p.status !== 'Active') return new Error(`${p.number} is ${p.status.toLowerCase()} — no new maintenance work.`);
    if (input.technician) {
      const issue = assignmentIssue(this.store.db, o, input.technician);
      if (issue) return new Error(issue);
    }
    const reassigned = !!o.technician && o.technician !== input.technician;
    this.store.patchOccurrence(id, { team: input.team, technician: input.technician, status: input.technician ? 'Assigned' : o.status, assignment: input.technician ? (reassigned ? 'Reassigned' : 'Assigned') : 'Unassigned' });
    this.store.patchWorkOrder(o.workOrderId, { team: input.team, technician: input.technician, status: input.technician ? 'Assigned' : 'Open' });
    this.store.record('Technician Assigned', 'Schedule', id, o.planId, `${o.number} ${reassigned ? 'reassigned' : 'assigned'} to ${input.technician ?? input.team}.`, o.technician, input.technician ?? input.team, o.number);
  }

  respond(id: string, response: 'Accepted' | 'Rejected' | 'Confirmed'): Observable<void> {
    return mutate(() => {
      const o = this.store.occurrence(id);
      if (!o?.technician) return new Error('The event has no technician assigned.');
      if (response === 'Rejected') {
        this.store.patchOccurrence(id, { technician: null, assignment: 'Rejected', status: 'Scheduled' });
        this.store.patchWorkOrder(o.workOrderId, { technician: null, status: 'Open' });
      } else {
        this.store.patchOccurrence(id, { assignment: response, status: response === 'Confirmed' ? 'Confirmed' : o.status });
        if (response === 'Confirmed') this.store.patchWorkOrder(o.workOrderId, { status: 'Dispatched' });
      }
      this.store.record(response === 'Confirmed' ? 'Maintenance Scheduled' : 'Technician Assigned', 'Schedule', id, o.planId, `${o.technician} ${response.toLowerCase()} ${o.number}.`, o.assignment, response, o.number);
      return undefined;
    });
  }

  reschedule(id: string, input: RescheduleInput): Observable<void> {
    return mutate(() => this.doReschedule(id, input));
  }

  /** SRS 8.17 — original date preserved, overdue condition not silently removed, AMC / SLA evaluated. */
  private doReschedule(id: string, input: RescheduleInput): void | Error {
    const o = this.store.occurrence(id);
    if (!o || !OPEN_STATUSES.includes(o.status)) return new Error('Only open maintenance events can be rescheduled.');
    if (!input.reason.trim()) return new Error('A reschedule reason is required.');
    if (!input.toDate || input.toDate === o.scheduledDate) return new Error('Select a new date.');
    const p = this.store.plan(o.planId)!;
    const shift = Math.abs(daysBetweenIso(o.scheduledDate, input.toDate));
    const ref = this.store.db.reference;
    if (shift > p.scheduling.maxRescheduleDays && !['Service Supervisor', 'Operations Director'].includes(ref.currentUser.role)) return new Error(`Moves beyond ${p.scheduling.maxRescheduleDays} days require supervisor approval.`);
    if (shift > PM_RULES.customerApprovalDays && p.notifications.customer && !input.customerApproval) return new Error(`Customer approval is required for moves of more than ${PM_RULES.customerApprovalDays} days.`);
    const amc = ref.amcs.find((a) => a.id === p.service.amcId);
    if (amc && input.toDate > amc.endDate) return new Error(`AMC coverage: ${amc.number} ends on ${amc.endDate}; the new date is outside coverage.`);
    if (isNonWorking(input.toDate, ref.holidays) && input.toWindow !== 'Weekend Shutdown') return new Error(`${input.toDate} is a non-working day or holiday — choose a working day or the weekend shutdown window.`);
    const overdue = effectiveStatus(o) === 'Overdue';
    const sla = ref.slas.find((s) => s.id === p.service.slaId);
    const record = {
      at: this.store.now(), fromDate: o.scheduledDate, toDate: input.toDate, fromWindow: o.window, toWindow: input.toWindow, reason: input.reason, requestedBy: input.requestedBy || this.store.user, approvedBy: this.store.user,
      slaImpact: sla ? `${sla.name}: preventive work — no response clock; resolution of open findings unaffected.` : 'No SLA', amcImpact: amc ? `Within ${amc.number} (ends ${amc.endDate})` : 'Not under AMC', customerApproval: input.customerApproval, notes: input.notes,
    };
    this.store.patchOccurrence(id, { scheduledDate: input.toDate, window: input.toWindow, dueDate: overdue ? o.dueDate : addDays(input.toDate, p.frequency.graceDays), status: overdue ? o.status : 'Rescheduled', reschedules: [...o.reschedules, record] });
    this.store.patchWorkOrder(o.workOrderId, { plannedDate: input.toDate });
    this.store.record('Maintenance Rescheduled', 'Schedule', id, o.planId, `${input.reason}${overdue ? ' — remains overdue against the original due date' : ''}. Original planned date ${o.originalDate} preserved.`, o.scheduledDate, input.toDate, o.number);
  }

  bulkReschedule(ids: readonly string[], days: number, reason: string): Observable<number> {
    return mutate(() => {
      let n = 0;
      let first: Error | null = null;
      for (const id of ids) {
        const o = this.store.occurrence(id);
        if (!o) continue;
        const p = this.store.plan(o.planId)!;
        const r = this.doReschedule(id, { toDate: adjust(addDays(o.scheduledDate, days), 'Move to next working day', this.store.db.reference.holidays), toWindow: o.window, reason, requestedBy: this.store.user, customerApproval: Math.abs(days) <= PM_RULES.customerApprovalDays || !p.notifications.customer ? false : true, notes: 'Bulk reschedule' });
        if (r instanceof Error) first ??= r;
        else n++;
      }
      return n ? n : (first ?? new Error('Nothing rescheduled.'));
    });
  }

  setOverdueReason(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const o = this.store.occurrence(id);
      if (!o) return new Error('Event not found.');
      this.store.patchOccurrence(id, { overdueReason: reason });
      this.store.record('Maintenance Overdue', 'Schedule', id, o.planId, `Overdue reason: ${reason}.`, o.overdueReason, reason, o.number);
      return undefined;
    });
  }

  start(id: string): Observable<void> {
    return mutate(() => {
      const o = this.store.occurrence(id);
      if (!o || !OPEN_STATUSES.includes(o.status)) return new Error('Only open maintenance events can be started.');
      const v = validateOccurrence(this.store.db, o);
      if (['Maintenance Plan Suspended', 'Maintenance Plan Inactive', 'AMC Expired', 'Contract Expired', 'Asset Not Covered', 'Maintenance Not Applicable', 'Duplicate Schedule Detected', 'Maintenance Requires Approval'].includes(v.result)) return new Error(`Validation failed: ${v.result} — ${v.summary}`);
      if (!o.technician) return new Error('Assign a technician before starting.');
      const p = this.store.plan(o.planId)!;
      let woId = o.workOrderId;
      if (!woId) woId = createWorkOrder(this.store.db, o, 'Generated on start', this.store.uid, this.store.log).id;
      for (const r of p.parts.required) this.store.db.parts = this.store.db.parts.map((s) => (s.partNumber === r.partNumber ? { ...s, reserved: s.reserved + r.quantity } : s));
      this.store.patchOccurrence(id, { status: 'In Progress', assignment: 'In Progress', workOrderId: woId });
      this.store.patchWorkOrder(woId, { status: 'In Progress' });
      this.store.record('Maintenance Started', 'Schedule', id, o.planId, `${o.technician} started ${o.number}.`, o.status, 'In Progress', o.number);
      if (p.parts.required.length) this.store.record('Parts Issued', 'Parts', id, o.planId, `${p.parts.required.map((r) => `${r.quantity} × ${r.partNumber}`).join(', ')} reserved and issued.`, null, null, o.number);
      return undefined;
    });
  }

  complete(id: string, completion: Omit<Completion, 'reportNumber'>): Observable<void> {
    return mutate(() => {
      const o = this.store.occurrence(id);
      if (!o || !['In Progress', ...OPEN_STATUSES].includes(o.status)) return new Error('Only open or in-progress events can be completed.');
      if (!o.technician) return new Error('Assign a technician before completing.');
      const issue = completionIssue(this.store.db, o, completion);
      if (issue) return new Error(issue);
      const p = this.store.plan(o.planId)!;
      const checklist = evaluateChecklist(this.store.db, p.id, completion.checklist);
      const reportNumber = `RPT-${o.id.slice(-6)}`;
      // Inventory update (SRS 8.23) — reservations released, consumption deducted.
      const reserved = o.status === 'In Progress' ? p.parts.required : [];
      this.store.db.parts = this.store.db.parts.map((s) => {
        const used = completion.partsUsed.filter((u) => u.partNumber === s.partNumber).reduce((a, u) => a + u.quantity, 0);
        const res = reserved.filter((r) => r.partNumber === s.partNumber).reduce((a, r) => a + r.quantity, 0);
        return used || res ? { ...s, stock: s.stock - used, reserved: Math.max(0, s.reserved - res) } : s;
      });
      let woId = o.workOrderId;
      if (!woId) woId = createWorkOrder(this.store.db, o, 'Generated on completion', this.store.uid, this.store.log).id;
      this.store.patchOccurrence(id, { status: 'Completed', assignment: 'Completed', workOrderId: woId, completion: { ...completion, checklist, reportNumber } });
      this.store.patchWorkOrder(woId, { status: 'Completed' });
      const failed = checklist.filter((c) => c.pass === false).length;
      this.store.record('Checklist Completed', 'Checklist', id, o.planId, `${checklist.length} item(s) recorded, ${failed} failed.`, null, failed ? `${failed} failed` : 'All passed', o.number);
      if (completion.partsUsed.length) this.store.record('Parts Consumed', 'Parts', id, o.planId, completion.partsUsed.map((u) => `${u.quantity} × ${u.partNumber}`).join(', ') + ' — inventory updated.', null, null, o.number);
      this.store.record('Maintenance Completed', 'Schedule', id, o.planId, `${completion.result}. Report ${reportNumber}.`, o.status, 'Completed', o.number);
      // Meter rules restart from the current reading.
      this.store.db.meters = this.store.db.meters.map((m) => (m.planId === p.id && m.assetId === o.assetId && m.kind === 'Meter' ? { ...m, lastTriggerReading: m.readings.at(-1)?.value ?? m.lastTriggerReading } : m));
      if (['Maintenance Requires Corrective Action', 'Maintenance Failed'].includes(completion.result) || (failed && completion.defects.trim())) {
        this.createCorrective(this.store.occurrence(id)!, { defect: completion.defects || `${failed} failed checklist item(s)`, severity: completion.result === 'Maintenance Failed' ? 'High' : 'Medium', priority: completion.result === 'Maintenance Failed' ? 'High' : 'Medium', recommendedAction: completion.recommendations, partNumber: null, skill: p.resources.skill, estimatedCost: 0, targetDate: addDays(today(), 3) });
      }
      // Next occurrence is calculated automatically (SRS 8.18).
      const created = generateFor(this.store.db, p, this.store.uid);
      if (created.length) this.store.record('Schedule Generated', 'Schedule', p.id, p.id, `Next occurrence calculated after completion (${created[0].scheduledDate}).`, null, created[0].number);
      return undefined;
    });
  }

  cancel(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const o = this.store.occurrence(id);
      if (!o || !OPEN_STATUSES.includes(o.status)) return new Error('Only open events can be cancelled.');
      if (!reason.trim()) return new Error('A cancellation reason is required.');
      this.store.patchOccurrence(id, { status: 'Cancelled', cancelReason: reason });
      this.store.patchWorkOrder(o.workOrderId, { status: 'Cancelled' });
      this.store.record('Maintenance Cancelled', 'Schedule', id, o.planId, `${reason} — kept in history; no replacement occurrence is generated.`, o.status, 'Cancelled', o.number);
      return undefined;
    });
  }

  miss(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const o = this.store.occurrence(id);
      if (!o || !OPEN_STATUSES.includes(o.status)) return new Error('Only open events can be marked missed.');
      if (o.scheduledDate > today()) return new Error('Future events cannot be marked missed.');
      this.store.patchOccurrence(id, { status: 'Missed', cancelReason: reason || 'Not performed.' });
      this.store.patchWorkOrder(o.workOrderId, { status: 'Cancelled' });
      this.store.record('Maintenance Missed', 'Schedule', id, o.planId, reason || 'Marked missed.', o.status, 'Missed', o.number);
      return undefined;
    });
  }

  corrective(id: string, input: CorrectiveInput): Observable<string> {
    return mutate(() => {
      const o = this.store.occurrence(id);
      if (!o) return new Error('Event not found.');
      if (!input.defect.trim()) return new Error('Describe the defect.');
      return this.createCorrective(o, input);
    });
  }

  /** SRS 8.22 — corrective work stays linked to the originating preventive activity. */
  private createCorrective(o: Occurrence, input: CorrectiveInput): string {
    const p = this.store.plan(o.planId)!;
    const id = this.store.uid('PWO');
    const number = `WO-CM-${id.slice(-5)}`;
    this.store.db.workOrders.push({
      id, number, kind: 'Corrective', occurrenceId: o.id, planId: p.id, customerId: o.customerId, siteId: o.siteId, assetId: o.assetId, serviceId: null, maintenanceType: 'Corrective Maintenance', priority: input.priority as Occurrence['priority'], plannedDate: input.targetDate, dueDate: input.targetDate,
      team: p.resources.team, technician: o.technician, checklistId: null, parts: input.partNumber ? [{ partNumber: input.partNumber, quantity: 1 }] : [], tools: p.resources.tools, status: o.technician ? 'Assigned' : 'Open', generatedBy: `Defect found on ${o.number}`, createdAt: this.store.now(),
      defect: `${input.defect}${input.recommendedAction ? ` — ${input.recommendedAction}` : ''}`, severity: input.severity, estimatedCost: input.estimatedCost || null,
    });
    this.store.patchOccurrence(o.id, { correctiveWorkOrderIds: [...(this.store.occurrence(o.id)?.correctiveWorkOrderIds ?? []), id] });
    this.store.record('Defect Identified', 'Schedule', o.id, o.planId, `${input.defect} (${input.severity}).`, null, input.severity, o.number);
    this.store.record('Corrective Work Order Created', 'Work Order', id, o.planId, `${number} created from ${o.number} — priority ${input.priority}, target ${input.targetDate}.`, null, number, o.number);
    return number;
  }

  conflicts(from: string, to: string): Observable<CalendarConflict[]> {
    return query(this.store, () => {
      const ref = this.store.db.reference;
      const list = this.store.db.occurrences.filter((o) => o.scheduledDate >= from && o.scheduledDate <= to && !['Cancelled', 'Missed', 'Completed'].includes(o.status));
      const out: CalendarConflict[] = [];
      const groupBy = (fn: (o: Occurrence) => string | null) => {
        const m = new Map<string, Occurrence[]>();
        list.forEach((o) => { const k = fn(o); if (k) m.set(k, [...(m.get(k) ?? []), o]); });
        return m;
      };
      groupBy((o) => (o.technician ? `${o.technician}|${o.scheduledDate}` : null)).forEach((g, k) => {
        const t = ref.technicians.find((x) => x.name === k.split('|')[0]);
        if (g.length > (t?.dailyCapacity ?? 4)) out.push({ type: 'Technician Double Booking', date: g[0].scheduledDate, occurrenceIds: g.map((o) => o.id), detail: `${k.split('|')[0]} has ${g.length} jobs (capacity ${t?.dailyCapacity ?? 4}).` });
      });
      groupBy((o) => `${o.team}|${o.scheduledDate}`).forEach((g, k) => {
        const cap = ref.technicians.filter((t) => t.team === k.split('|')[0]).reduce((s, t) => s + t.dailyCapacity, 0);
        if (cap && g.length > cap) out.push({ type: 'Team Double Booking', date: g[0].scheduledDate, occurrenceIds: g.map((o) => o.id), detail: `${k.split('|')[0]}: ${g.length} jobs, capacity ${cap}.` });
      });
      groupBy((o) => `${o.assetId}|${o.scheduledDate}`).forEach((g) => {
        if (g.length > 1) out.push({ type: 'Asset Conflict', date: g[0].scheduledDate, occurrenceIds: g.map((o) => o.id), detail: `${this.store.assetName(g[0].assetId)} has ${g.length} maintenance events the same day.` });
      });
      groupBy((o) => `${o.siteId}|${o.scheduledDate}|${o.window}`).forEach((g) => {
        const windows = new Set(this.store.db.occurrences.filter((x) => x.siteId === g[0].siteId && x.scheduledDate === g[0].scheduledDate && !['Cancelled', 'Missed', 'Completed'].includes(x.status)).map((x) => x.window));
        if (windows.has('Weekend Shutdown') && windows.size > 1) out.push({ type: 'Site Access Conflict', date: g[0].scheduledDate, occurrenceIds: g.map((o) => o.id), detail: `${this.store.siteName(g[0].siteId)}: shutdown window clashes with other work.` });
      });
      list.forEach((o) => {
        if (ref.holidays.includes(o.scheduledDate)) out.push({ type: 'Holiday Conflict', date: o.scheduledDate, occurrenceIds: [o.id], detail: `${o.number} is on a public holiday.` });
        else if (PM_RULES.nonWorkingDays.includes(new Date(`${o.scheduledDate}T00:00:00Z`).getUTCDay()) && o.window !== 'Weekend Shutdown') out.push({ type: 'Non-Working Day Conflict', date: o.scheduledDate, occurrenceIds: [o.id], detail: `${o.number} falls on a weekend.` });
        if (o.window === 'Night Shift (22:00–06:00)' && this.store.plan(o.planId)?.scheduling.serviceHours === 'Business Hours') out.push({ type: 'Maintenance Window Conflict', date: o.scheduledDate, occurrenceIds: [o.id], detail: `${o.number}: night window outside the plan's business hours.` });
      });
      return out.sort((a, b) => a.date.localeCompare(b.date));
    });
  }
}

@Injectable()
export class MockPmWorkOrderApi extends PmWorkOrderApi {
  private readonly store = inject(MockPmStore);

  list(planId?: string): Observable<PmWorkOrderListItem[]> {
    return query(this.store, () => this.store.db.workOrders.filter((w) => !planId || w.planId === planId).map((w) => this.store.workOrderItem(w)).sort((a, b) => b.plannedDate.localeCompare(a.plannedDate)));
  }

  runAutomation(): Observable<number> {
    return mutate(() => automate(this.store.db, this.store.uid, this.store.log));
  }

  generate(occurrenceId: string): Observable<string> {
    return mutate(() => {
      const o = this.store.occurrence(occurrenceId);
      if (!o || !OPEN_STATUSES.includes(o.status)) return new Error('Work orders can only be generated for open events.');
      if (o.workOrderId) return new Error('A work order already exists for this event.');
      const p = this.store.plan(o.planId)!;
      if (p.status !== 'Active') return new Error(`${p.number} is ${p.status.toLowerCase()} — no new maintenance work.`);
      return createWorkOrder(this.store.db, o, 'Manual generation', this.store.uid, this.store.log).number;
    });
  }

  dispatch(id: string): Observable<void> {
    return mutate(() => {
      const w = this.store.db.workOrders.find((x) => x.id === id);
      if (!w || !['Open', 'Assigned'].includes(w.status)) return new Error('Only open or assigned work orders can be dispatched.');
      if (!w.technician) return new Error('Assign a technician before dispatch.');
      this.store.patchWorkOrder(id, { status: 'Dispatched' });
      this.store.record('Maintenance Scheduled', 'Work Order', id, w.planId, `${w.number} dispatched to ${w.technician}.`, w.status, 'Dispatched', w.number);
      return undefined;
    });
  }

  /** SRS 8.15 assignment rules — skill, certification, territory, availability, workload, preference. */
  suggest(occurrenceId: string): Observable<{ technician: string; team: string; score: number; reasons: string[] }[]> {
    return query(this.store, () => {
      const o = this.store.occurrence(occurrenceId)!;
      const p = this.store.plan(o.planId)!;
      const site = this.store.db.reference.sites.find((s) => s.id === o.siteId);
      return this.store.db.reference.technicians.map((t) => {
        const reasons: string[] = [];
        let score = 0;
        if (t.skills.includes(p.resources.skill)) { score += 40; reasons.push('Has required skill'); } else reasons.push(`Missing skill ${p.resources.skill}`);
        if (!p.resources.certification || p.resources.certification === 'None' || t.certifications.includes(p.resources.certification)) { score += 20; reasons.push('Certified'); } else reasons.push('Missing certification');
        if (t.region === site?.region) { score += 20; reasons.push('In territory'); } else reasons.push(`Territory ${t.region}`);
        const load = this.store.db.occurrences.filter((x) => x.technician === t.name && x.scheduledDate === o.scheduledDate && !['Cancelled', 'Completed', 'Missed'].includes(x.status) && x.id !== o.id).length;
        if (load < t.dailyCapacity) { score += 15 - load * 3; reasons.push(`${load}/${t.dailyCapacity} jobs that day`); } else reasons.push('Fully booked');
        if (p.automation.technician === t.name) { score += 5; reasons.push('Customer / plan preference'); }
        return { technician: t.name, team: t.team, score, reasons };
      }).sort((a, b) => b.score - a.score).slice(0, 6);
    });
  }
}

@Injectable()
export class MockChecklistApi extends ChecklistApi {
  private readonly store = inject(MockPmStore);

  list(): Observable<ChecklistListItem[]> {
    return query(this.store, () => this.store.db.checklists.map((c) => ({ ...c, planCount: this.store.db.plans.filter((p) => p.procedure.checklistId === c.id).length, measurementCount: c.items.filter((i) => i.type === 'Measurement' || i.type === 'Numeric').length })));
  }

  create(input: ChecklistInput): Observable<void> {
    return mutate(() => {
      const err = this.check(input);
      if (err) return err;
      const n = this.store.db.checklists.length + 1;
      const id = `CHK-N${pad(n, 3)}`;
      this.store.db.checklists.push({ ...input, id, number: `CHK-${pad(n, 3)}`, version: '1.0' });
      this.store.record('Maintenance Plan Modified', 'Checklist', id, null, `Checklist “${input.name}” created with ${input.items.length} item(s).`);
      return undefined;
    });
  }

  update(id: string, input: ChecklistInput): Observable<void> {
    return mutate(() => {
      const c = this.store.db.checklists.find((x) => x.id === id);
      if (!c) return new Error('Checklist not found.');
      const err = this.check(input);
      if (err) return err;
      const version = nextMinor(c.version);
      this.store.db.checklists = this.store.db.checklists.map((x) => (x.id === id ? { ...x, ...input, version } : x));
      this.store.record('Maintenance Plan Modified', 'Checklist', id, null, `Checklist “${input.name}” updated — completed maintenance keeps its recorded results.`, `v${c.version}`, `v${version}`);
      return undefined;
    });
  }

  private check(input: ChecklistInput): Error | null {
    if (!input.name.trim()) return new Error('Checklist name is required.');
    if (!input.items.length) return new Error('Add at least one checklist item.');
    for (const i of input.items) {
      if (!i.task.trim()) return new Error('Every item needs a task.');
      if ((i.type === 'Measurement' || i.type === 'Numeric') && i.min !== null && i.max !== null && i.min > i.max) return new Error(`“${i.task}”: minimum must not exceed maximum.`);
      if (i.type === 'Measurement' && !i.unit.trim()) return new Error(`“${i.task}”: measurement unit is required.`);
      if (i.type === 'Selection' && i.options.length < 2) return new Error(`“${i.task}”: add at least two options.`);
    }
    return null;
  }
}

@Injectable()
export class MockTaskApi extends TaskApi {
  private readonly store = inject(MockPmStore);

  list(): Observable<TaskListItem[]> {
    return query(this.store, () => [...this.store.db.tasks].sort((a, b) => a.sequence - b.sequence).map((t) => ({ ...t, dependsOnName: this.store.db.tasks.find((x) => x.id === t.dependsOn)?.name ?? null, partName: this.store.db.parts.find((p) => p.partNumber === t.partNumber)?.description ?? null, planCount: this.store.db.plans.filter((p) => p.procedure.taskIds.includes(t.id)).length })));
  }

  create(input: MaintenanceTaskInput): Observable<void> {
    return mutate(() => {
      const err = this.check(input, null);
      if (err) return err;
      const n = this.store.db.tasks.length + 1;
      const id = `TSK-${pad(n, 3)}`;
      this.store.db.tasks.push({ ...input, id, number: id });
      this.store.record('Maintenance Plan Modified', 'Task', id, null, `Task “${input.name}” created.`);
      return undefined;
    });
  }

  update(id: string, input: MaintenanceTaskInput): Observable<void> {
    return mutate(() => {
      const err = this.check(input, id);
      if (err) return err;
      this.store.db.tasks = this.store.db.tasks.map((t) => (t.id === id ? { ...t, ...input } : t));
      this.store.record('Maintenance Plan Modified', 'Task', id, null, `Task “${input.name}” updated.`);
      return undefined;
    });
  }

  private check(input: MaintenanceTaskInput, id: string | null): Error | null {
    if (!input.name.trim()) return new Error('Task name is required.');
    if (!(input.durationMinutes > 0)) return new Error('Estimated duration must be greater than zero.');
    if (input.dependsOn && input.dependsOn === id) return new Error('A task cannot depend on itself.');
    for (let cur = input.dependsOn, i = 0; cur && i < 50; i++) {
      if (cur === id) return new Error('Task dependency would create a cycle.');
      cur = this.store.db.tasks.find((t) => t.id === cur)?.dependsOn ?? null;
    }
    return null;
  }
}

@Injectable()
export class MockMeterApi extends MeterApi {
  private readonly store = inject(MockPmStore);

  list(planId?: string): Observable<MeterRuleListItem[]> {
    return query(this.store, () => this.store.db.meters.filter((m) => !planId || m.planId === planId).map((m) => this.store.meterItem(m)));
  }

  create(input: MeterRuleInput): Observable<void> {
    return mutate(() => {
      const p = this.store.plan(input.planId);
      if (!p) return new Error('Select a maintenance plan.');
      if (!p.assetIds.includes(input.assetId)) return new Error('The asset must be in the plan scope.');
      if (!(input.interval > 0) && input.kind === 'Meter') return new Error('Enter the maintenance interval.');
      const { initialReading, ...rest } = input;
      const id = this.store.uid('MTR');
      this.store.db.meters.push({ ...rest, id, number: `MTR-${pad(this.store.db.meters.length + 1, 3)}`, lastTriggerReading: input.kind === 'Meter' ? initialReading : 0, readings: [{ at: this.store.now(), value: initialReading, by: this.store.user, triggered: false }] });
      this.store.record('Maintenance Plan Modified', 'Meter Rule', id, p.id, `${input.kind} rule added: ${input.kind === 'Meter' ? `every ${input.interval} ${input.unit}` : `${input.parameter} ${input.operator} ${input.interval} ${input.unit}`}.`);
      return undefined;
    });
  }

  /** SRS 8.13 — reading → rule evaluation → threshold → maintenance trigger → schedule → work order. */
  record(id: string, value: number): Observable<string | null> {
    return mutate(() => {
      const m = this.store.db.meters.find((x) => x.id === id);
      if (!m) return new Error('Rule not found.');
      if (!Number.isFinite(value)) return new Error('Enter a numeric reading.');
      const prev = m.readings.at(-1)?.value ?? null;
      if (m.kind === 'Meter' && prev !== null && value < prev) return new Error(`Meter readings cannot decrease (previous ${prev}).`);
      const p = this.store.plan(m.planId)!;
      const reached = m.kind === 'Meter' ? value >= m.lastTriggerReading + m.interval : m.operator === '>' ? value > m.interval : value < m.interval;
      const openTriggered = this.store.db.occurrences.some((o) => o.planId === p.id && o.assetId === m.assetId && !['Completed', 'Cancelled', 'Missed'].includes(o.status) && o.generatedBy.includes(m.number));
      const trigger = reached && p.status === 'Active' && !openTriggered;
      this.store.db.meters = this.store.db.meters.map((x) => (x.id === id ? { ...x, readings: [...x.readings, { at: this.store.now(), value, by: this.store.user, triggered: trigger }] } : x));
      this.store.record('Meter Reading Recorded', 'Meter Rule', id, p.id, `${m.kind === 'Meter' ? m.meterType : m.parameter}: ${value} ${m.unit}${reached ? ' — threshold reached' : ''}.`, prev === null ? null : String(prev), String(value), m.number);
      if (!trigger) return null;
      const date = adjust(addDays(today(), 2), p.scheduling.holidayHandling, this.store.db.reference.holidays);
      const rule = m.kind === 'Meter' ? `Meter rule ${m.number}: ${(m.lastTriggerReading + m.interval).toLocaleString('en-US')} ${m.unit} reached (${value.toLocaleString('en-US')})` : `Condition rule ${m.number}: ${m.parameter} ${value} ${m.unit} ${m.operator} ${m.interval}`;
      const final = { ...newOccurrence(this.store.db, p, m.assetId, today(), date, rule, this.store.uid), status: 'Scheduled' as const };
      this.store.db.occurrences.push(final);
      this.store.record('Maintenance Triggered', 'Schedule', final.id, p.id, `${rule} → ${final.number} scheduled for ${date}.`, null, final.number, m.number);
      if (p.automation.autoGenerate) createWorkOrder(this.store.db, this.store.occurrence(final.id)!, m.kind === 'Meter' ? 'Generate on meter threshold' : 'Generate on condition trigger', this.store.uid, this.store.log);
      return final.number;
    });
  }
}

@Injectable()
export class MockPmPerformanceApi extends PmPerformanceApi {
  private readonly store = inject(MockPmStore);

  summary(planId?: string): Observable<PmPerformance> {
    return query(this.store, () => this.store.performance(this.store.db.occurrences.filter((o) => !planId || o.planId === planId)));
  }

  assets(): Observable<AssetPerformanceRow[]> {
    return query(this.store, () => this.store.assetPerformance());
  }
}

@Injectable()
export class MockPmHistoryApi extends PmHistoryApi {
  private readonly store = inject(MockPmStore);

  list(filter: { planId?: string; entity?: PmHistoryEntity } = {}): Observable<PmHistoryEvent[]> {
    return query(this.store, () => this.store.db.history.filter((h) => (!filter.planId || h.planId === filter.planId) && (!filter.entity || h.entity === filter.entity)));
  }
}

@Injectable()
export class MockPmReferenceApi extends PmReferenceApi {
  private readonly store = inject(MockPmStore);

  get(): Observable<PmReferenceData> {
    return defer(() => respond(this.store.db.reference, 150));
  }

  parts(): Observable<StockPart[]> {
    return defer(() => respond([...this.store.db.parts], 100));
  }

  planOptions(): Observable<{ id: string; number: string; name: string; status: string }[]> {
    return defer(() => respond(this.store.db.plans.map((p) => ({ id: p.id, number: p.number, name: p.name, status: p.status })), 100));
  }

  checklists(): Observable<{ id: string; name: string; items: number }[]> {
    return defer(() => respond(this.store.db.checklists.filter((c) => c.status === 'Active').map((c) => ({ id: c.id, name: c.name, items: c.items.length })), 100));
  }

  tasks(): Observable<{ id: string; name: string; sequence: number }[]> {
    return defer(() => respond(this.store.db.tasks.map((t) => ({ id: t.id, name: t.name, sequence: t.sequence })), 100));
  }
}
