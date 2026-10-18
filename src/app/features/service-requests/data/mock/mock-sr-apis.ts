import { Injectable, inject } from '@angular/core';
import { type Observable, defer } from 'rxjs';
import { fail, respond } from '../../../customers/data/mock/mock-utils';
import type { ClassificationRule, CountRow, DuplicateMatch, IdentificationResult, RoutingRule, SrDashboard, SrDashboardFilters, SrHistoryEvent, SrPerformance, Suggestion, ValidationGroup } from '../../models/operations.model';
import type { SrReferenceData } from '../../models/reference.model';
import { type Activity, type PartUsage, type Priority, type RequestDraft, type RequestListItem, type RequestStatus, type Schedule, type ServiceRequest, ACTIVE_WORK_STATUSES, OPEN_STATUSES, REQUEST_TYPES } from '../../models/request.model';
import { type AssignInput, type ClassifyInput, type HoldInput, RequestApi, type ResolutionInput, SrHistoryApi, SrReferenceApi } from '../sr.api';
import { CLASSIFICATION_RULES, ROUTING_RULES, SR_RULES } from '../sr.config';
import { automate, closureNeedsConfirmation, coverageFor, findDuplicates, route, scheduleConflict, slaFor, suggest, toItem, validation } from './sr-engine';
import { MockSrStore } from './mock-sr-store';

function mutate<T>(work: () => T | Error): Observable<T> {
  return defer(() => {
    const result = work();
    return result instanceof Error ? fail(result.message) : respond(result, 300);
  });
}

function query<T>(store: MockSrStore, work: () => T): Observable<T> {
  return defer(() => {
    store.monitor();
    return respond(work());
  });
}

const avg = (v: number[]) => (v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const count = <T>(rows: readonly T[], key: (r: T) => [string, string] | null, limit = 8): CountRow[] => {
  const m = new Map<string, CountRow>();
  rows.forEach((r) => {
    const k = key(r);
    if (!k) return;
    const cur = m.get(k[0]);
    m.set(k[0], { key: k[0], label: k[1], value: (cur?.value ?? 0) + 1 });
  });
  return [...m.values()].sort((a, b) => b.value - a.value).slice(0, limit);
};

@Injectable()
export class MockRequestApi extends RequestApi {
  private readonly store = inject(MockSrStore);

  private get db() {
    return this.store.db;
  }

  list(): Observable<RequestListItem[]> {
    return query(this.store, () => [...this.db.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => this.store.item(r)));
  }

  get(id: string): Observable<RequestListItem> {
    return defer(() => {
      this.store.monitor();
      const r = this.store.request(id);
      return r ? respond(this.store.item(r)) : fail(`Service request ${id} was not found.`);
    });
  }

  nextNumber(): Observable<string> {
    return query(this.store, () => this.number());
  }

  private number(): string {
    return `SR-${Math.max(...this.db.requests.map((r) => Number(r.number.replace(/\D/g, '')) || 0)) + 1}`;
  }

  suggest(draft: RequestDraft): Observable<Suggestion> {
    return defer(() => respond(suggest(this.db, draft), 150));
  }

  duplicates(draft: Pick<RequestDraft, 'customer' | 'location' | 'assetId' | 'serviceCategory' | 'subject' | 'description'>, excludeId?: string): Observable<DuplicateMatch[]> {
    return defer(() => respond(findDuplicates(this.db, draft, excludeId), 150));
  }

  /** SRS 9.6 / 9.23 / 9.31 — create with automatic numbering, classification, coverage, SLA and routing. */
  create(input: RequestDraft, duplicateAction: 'none' | 'continue' | 'link', linkTo: string | null): Observable<ServiceRequest> {
    return mutate(() => {
      const s0 = input.customer.customerId && SR_RULES.autoClassify ? suggest(this.db, input) : null;
      const d: RequestDraft = s0 ? { ...input, serviceCategory: input.serviceCategory || s0.serviceCategory || '', subcategory: input.subcategory || s0.subcategory || '' } : input;
      const error = this.checkDraft(d);
      if (error) return error;
      const dups = findDuplicates(this.db, d);
      if (dups.length && duplicateAction === 'none') return new Error(`Possible duplicate of ${dups[0].number} — review the duplicate warning before saving.`);
      const s = suggest(this.db, d);
      const number = this.number();
      const now = this.store.now();
      const priority = d.priority ?? s.priority;
      const ref = this.db.reference;
      const site = ref.sites.find((x) => x.id === d.location.siteId);
      const sla = slaFor(this.db, { customerId: d.customer.customerId, siteId: d.location.siteId || null, assetId: d.assetId, priority, coverage: s.coverage, serviceId: d.classification.requestedServiceId ?? s.serviceId, type: d.type, date: now });
      const parent = d.parentRequestId ? this.store.request(d.parentRequestId) : undefined;
      let r: ServiceRequest = {
        id: number, number, createdAt: now, createdBy: this.store.user, updatedAt: now, company: SR_RULES.company, branch: { Central: 'Riyadh Branch', Western: 'Jeddah Branch', Eastern: 'Dammam Branch', Southern: 'Abha Branch', Northern: 'Tabuk Branch' }[site?.region ?? ''] ?? 'GCC Desk',
        type: d.type, serviceCategory: d.serviceCategory || s.serviceCategory || 'Inspection & Compliance', subcategory: d.subcategory || s.subcategory || '', subject: d.subject.trim(), description: d.description.trim(), source: d.source, requestedDate: d.requestedDate, requestedTime: d.requestedTime,
        priority, priorityReason: d.priority && d.priority !== s.priority ? `Set manually (suggested ${s.priority}: ${s.priorityFactors.join('; ')})` : s.priorityFactors.join('; '), customerReference: d.customerReference, customer: d.customer, location: d.location, assetId: d.assetId,
        classification: { ...d.classification, requiredSkill: d.classification.requiredSkill || s.requiredSkill || '', requestedServiceId: d.classification.requestedServiceId ?? s.serviceId, suggestedBy: s.rule }, coverage: s.coverage, sla, status: 'New',
        assignment: { team: null, technician: null, dispatcher: null, method: '', skill: s.requiredSkill ?? '', region: site?.region ?? '', assignedAt: null, reason: '' }, assignmentHistory: [], schedule: null, scheduleHistory: [], holds: [], escalation: { level: 0, events: [] },
        workOrders: [], activities: [{ id: this.store.uid('ACT'), type: d.source === 'Email' ? 'Email' : d.source === 'Customer Portal' ? 'Portal Message' : 'Customer Call', at: now, user: d.customer.contactName || 'Customer', direction: 'Inbound', message: d.subject, attachment: null, followUp: null, visibility: 'Customer Visible' }],
        attachments: [], resolution: null, previousResolutions: [], reopenCount: 0, linkedRequestIds: duplicateAction === 'link' && linkTo ? [linkTo] : [], duplicateOf: duplicateAction === 'link' ? linkTo : null,
        origin: { process: parent ? 'Follow-up' : d.source === 'Customer Portal' ? 'Customer Portal' : d.source === 'Internal' ? 'Internal' : 'Manual', planId: null, planNumber: null, occurrence: null, parentRequestId: parent?.id ?? null }, cancellation: null, notes: d.notes,
      };
      this.db.requests.unshift(r);
      this.store.log(r, 'Request Created', `${r.type} via ${r.source}${parent ? ` — follow-up of ${parent.number}` : ''}`, null, number, r.origin.process === 'Manual' ? 'Manual' : r.origin.process, parent?.number ?? null);
      this.store.log(r, 'Coverage Validated', r.coverage.entitlement || 'No entitlement', null, r.coverage.result, 'Automation rule: contract / AMC validation', r.coverage.amcId);
      if (s.rule) this.store.log(r, 'Classification Changed', `Suggested ${r.serviceCategory} / ${r.subcategory}`, null, r.serviceCategory, `Automation rule: ${s.rule}`);
      if (sla.slaId) this.store.log(r, 'SLA Applied', `${sla.applicability} — response ${sla.responseMinutes} min, resolution ${sla.resolutionMinutes} min`, null, sla.slaNumber, 'Automation rule: SLA assignment', sla.slaId);
      if (duplicateAction === 'link' && linkTo) {
        this.db.requests = this.db.requests.map((x) => (x.id === linkTo ? { ...x, linkedRequestIds: [...x.linkedRequestIds, number] } : x));
        this.store.log(r, 'Duplicate Linked', 'Linked to existing request on creation', null, linkTo, 'Manual', linkTo);
      } else if (dups.length) this.store.log(r, 'Duplicate Linked', `Duplicate warning acknowledged — continued as a separate request (${dups.map((x) => x.number).join(', ')}).`, null, null, 'Manual');
      r = this.validateFlow(r);
      if (SR_RULES.autoAssignTechnician && r.status === 'Validated') this.doAssign(r, null, 'Automation rule: automatic technician assignment');
      return this.store.request(number)!;
    });
  }

  /** Coverage drives validation: chargeable work needs customer approval before covered-service processing. */
  private validateFlow(r: ServiceRequest): ServiceRequest {
    const status: RequestStatus = r.coverage.chargeable && r.coverage.approval === 'Pending' ? 'Under Validation' : 'Validated';
    if (status !== r.status) {
      const next = this.store.replace({ ...r, status });
      this.store.log(next, 'Status Changed', status === 'Under Validation' ? `${r.coverage.result} — chargeable, awaiting customer approval / quote` : 'Customer, site, asset, coverage, SLA and priority validated', r.status, status, 'Automation rule: request validation');
      return next;
    }
    return r;
  }

  update(id: string, d: RequestDraft, reason: string): Observable<void> {
    return mutate(() => {
      const r = this.store.request(id);
      if (!r) return new Error('Request not found.');
      if (['Closed', 'Cancelled', 'Rejected'].includes(r.status)) return new Error('Closed requests are protected from modification.');
      const error = this.checkDraft(d);
      if (error) return error;
      const contextChanged = r.customer.customerId !== d.customer.customerId || r.location.siteId !== d.location.siteId || r.assetId !== d.assetId || r.serviceCategory !== d.serviceCategory;
      let next: ServiceRequest = { ...r, type: d.type, serviceCategory: d.serviceCategory, subcategory: d.subcategory, subject: d.subject, description: d.description, source: d.source, requestedDate: d.requestedDate, requestedTime: d.requestedTime, customerReference: d.customerReference, customer: d.customer, location: d.location, assetId: d.assetId, classification: d.classification, notes: d.notes };
      if (contextChanged) next = { ...next, coverage: coverageFor(this.db, d.customer.customerId, d.location.siteId, d.assetId, d.serviceCategory, d.type, d.priority ?? 'Medium') };
      this.store.replace(next);
      this.store.log(next, 'Request Updated', reason || 'Request details updated.', null, null);
      if (contextChanged) this.store.log(next, 'Coverage Validated', 'Context changed — coverage re-validated', r.coverage.result, next.coverage.result, 'Automation rule: contract / AMC validation');
      if (d.priority && d.priority !== r.priority) this.changePriority(this.store.request(id)!, d.priority, reason || 'Updated on edit');
      return undefined;
    });
  }

  classify(id: string, input: ClassifyInput): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (!input.type || !input.serviceCategory) return new Error('Request type and service category are mandatory.');
      const next = this.store.replace({ ...r, type: input.type, serviceCategory: input.serviceCategory, subcategory: input.subcategory, classification: { ...input.classification, suggestedBy: r.classification.suggestedBy } });
      this.store.log(next, 'Classification Changed', `${input.type} · ${input.serviceCategory} / ${input.subcategory} · ${input.classification.problemCode}`, `${r.serviceCategory} / ${r.subcategory}`, `${input.serviceCategory} / ${input.subcategory}`);
      if (r.serviceCategory !== input.serviceCategory) this.revalidate(next);
      return undefined;
    });
  }

  private revalidate(r: ServiceRequest): void {
    const coverage = coverageFor(this.db, r.customer.customerId, r.location.siteId, r.assetId, r.serviceCategory, r.type, r.priority);
    const next = this.store.replace({ ...r, coverage: { ...coverage, approval: coverage.chargeable && r.coverage.approval === 'Approved' ? 'Approved' : coverage.approval } });
    this.store.log(next, 'Coverage Validated', coverage.entitlement || 'No entitlement', r.coverage.result, coverage.result, 'Manual', coverage.amcId);
    if (['New', 'Under Validation', 'Validated'].includes(next.status)) this.validateFlow(next);
  }

  validateCoverage(id: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      this.revalidate(r);
      return undefined;
    });
  }

  decideChargeable(id: string, approve: boolean, comment: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (!r.coverage.chargeable || r.coverage.approval !== 'Pending') return new Error('No chargeable approval is pending.');
      if (!approve && !comment.trim()) return new Error('A comment is required when the customer declines.');
      const next = this.store.replace({ ...r, coverage: { ...r.coverage, approval: approve ? 'Approved' : 'Rejected' }, status: approve ? 'Validated' : 'Rejected', cancellation: approve ? null : { reason: 'Customer declined quotation', comment, by: this.store.user, at: this.store.now() } });
      this.store.log(next, 'Chargeable Approval', comment || (approve ? 'Customer approved the quotation — billable service.' : 'Declined.'), 'Pending', approve ? 'Approved' : 'Rejected');
      this.store.log(next, approve ? 'Status Changed' : 'Request Rejected', approve ? 'Validated as billable service' : comment, r.status, next.status);
      return undefined;
    });
  }

  setPriority(id: string, priority: Priority, reason: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (!reason.trim()) return new Error('A reason is required to change priority.');
      this.changePriority(r, priority, reason);
      return undefined;
    });
  }

  /** Priority change recalculates SLA targets (SRS 9.11). */
  private changePriority(r: ServiceRequest, priority: Priority, reason: string): void {
    const sla = slaFor(this.db, { customerId: r.customer.customerId, siteId: r.location.siteId, assetId: r.assetId, priority, coverage: r.coverage, serviceId: r.classification.requestedServiceId, type: r.type, date: r.createdAt });
    const next = this.store.replace({ ...r, priority, priorityReason: reason, sla: { ...sla, respondedAt: r.sla.respondedAt, resolvedAt: r.sla.resolvedAt } });
    this.store.log(next, 'Priority Changed', reason, r.priority, priority);
    this.store.log(next, 'SLA Applied', `Targets recalculated — response ${sla.responseMinutes} min, resolution ${sla.resolutionMinutes} min`, r.sla.slaNumber, sla.slaNumber, 'Automation rule: SLA assignment', sla.slaId);
  }

  applySla(id: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      const sla = slaFor(this.db, { customerId: r.customer.customerId, siteId: r.location.siteId, assetId: r.assetId, priority: r.priority, coverage: r.coverage, serviceId: r.classification.requestedServiceId, type: r.type, date: r.createdAt });
      const next = this.store.replace({ ...r, sla: { ...sla, respondedAt: r.sla.respondedAt, resolvedAt: r.sla.resolvedAt } });
      this.store.log(next, 'SLA Applied', sla.slaId ? `${sla.applicability}` : 'No applicable SLA', r.sla.slaNumber, sla.slaNumber, 'Manual', sla.slaId);
      return undefined;
    });
  }

  assign(id: string, input: AssignInput): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      const check = this.assignable(r);
      if (check) return check;
      if (!this.db.reference.teams.includes(input.team)) return new Error('Select a valid team.');
      if (input.technician) {
        const t = this.db.reference.technicians.find((x) => x.name === input.technician);
        if (!t) return new Error('Select an active technician.');
        if (r.classification.requiredSkill && !t.skills.includes(r.classification.requiredSkill)) return new Error(`${t.name} does not have the required skill “${r.classification.requiredSkill}”.`);
        if (r.schedule && scheduleConflict(this.db, r, r.schedule, t.name)) return new Error(`${t.name} already has an appointment at ${r.schedule.scheduledDate} ${r.schedule.startTime}.`);
      }
      this.doAssign(r, input, 'Manual');
      return undefined;
    });
  }

  autoAssign(id: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      const check = this.assignable(r);
      if (check) return check;
      const done = this.doAssign(r, null, 'Automation rule: automatic technician assignment');
      return done.assignment.technician ? undefined : new Error(`No technician with ${done.assignment.skill} is available in ${done.assignment.region} — assigned to ${done.assignment.team} queue.`);
    });
  }

  private assignable(r: ServiceRequest): Error | null {
    if (!r.priority) return new Error('Priority must be assigned before operational assignment.');
    if (r.status === 'Under Validation' || r.status === 'New') return new Error(r.coverage.chargeable && r.coverage.approval === 'Pending' ? 'Chargeable work needs customer approval before assignment.' : 'Validate the request before assignment.');
    if (r.status === 'Pending') return new Error('Resume the request before reassigning.');
    return null;
  }

  private doAssign(r: ServiceRequest, input: AssignInput | null, source: string): ServiceRequest {
    const rt = route(this.db, r.serviceCategory, r.location.siteId, r.id);
    const now = this.store.now();
    const assignment = input
      ? { team: input.team, technician: input.technician, dispatcher: input.dispatcher ?? this.store.user, method: input.method || 'Manual Assignment', skill: r.classification.requiredSkill || rt.skill, region: rt.region, assignedAt: now, reason: input.reason }
      : { team: rt.team, technician: rt.technician, dispatcher: 'System', method: rt.technician ? 'Automatic Assignment' : 'Team-Based Assignment', skill: rt.skill, region: rt.region, assignedAt: now, reason: rt.technician ? `Skill ${rt.skill} · ${rt.region} · workload ${rt.load} open` : `No ${rt.skill} available in ${rt.region} — team queue` };
    const reassigned = !!r.assignment.technician && r.assignment.technician !== assignment.technician;
    const status: RequestStatus = assignment.technician && ['Validated', 'Reopened'].includes(r.status) ? 'Assigned' : r.status;
    const next = this.store.replace({ ...r, status, assignment, assignmentHistory: [...r.assignmentHistory, { ...assignment, by: source === 'Manual' ? this.store.user : 'System' }], sla: { ...r.sla, respondedAt: r.sla.respondedAt ?? (assignment.technician ? now : null) }, workOrders: r.workOrders.map((w) => (['Open', 'Assigned'].includes(w.status) ? { ...w, team: assignment.team, technician: assignment.technician, status: assignment.technician ? 'Assigned' : w.status } : w)) });
    this.store.log(next, reassigned ? 'Assignment Changed' : 'Assignment Created', assignment.reason || assignment.method, r.assignment.technician ?? r.assignment.team, assignment.technician ?? assignment.team, source);
    if (status !== r.status) this.store.log(next, 'Status Changed', 'Technician assigned', r.status, status, source);
    return next;
  }

  schedule(id: string, s: Schedule, reason: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (!r.assignment.technician) return new Error('Assign a technician before scheduling.');
      if (!s.scheduledDate || !s.startTime || !s.endTime || s.endTime <= s.startTime) return new Error('Enter a valid date and time window.');
      const clash = scheduleConflict(this.db, r, s);
      if (clash) return new Error(`Scheduling conflict: ${r.assignment.technician} is booked on ${clash.number} at ${clash.schedule!.startTime}–${clash.schedule!.endTime}.`);
      const item = toItem(this.db, r);
      const lateForSla = item.resolutionClock.dueAt && `${s.scheduledDate}T${s.startTime}` > item.resolutionClock.dueAt.slice(0, 16);
      const rescheduled = !!r.schedule;
      const status: RequestStatus = ['Validated', 'Assigned', 'Reopened'].includes(r.status) ? 'Scheduled' : r.status;
      const next = this.store.replace({ ...r, status, schedule: s, scheduleHistory: [...r.scheduleHistory, { ...s, at: this.store.now(), by: this.store.user, reason: reason || (rescheduled ? 'Rescheduled' : 'Initial appointment') }], workOrders: r.workOrders.map((w) => (w.status !== 'Completed' && w.status !== 'Cancelled' ? { ...w, scheduledDate: s.scheduledDate } : w)) });
      this.store.log(next, rescheduled ? 'Schedule Changed' : 'Schedule Created', `${reason || s.appointmentType}${lateForSla ? ' — warning: appointment is after the SLA resolution deadline' : ''}`, r.schedule ? `${r.schedule.scheduledDate} ${r.schedule.startTime}` : null, `${s.scheduledDate} ${s.startTime}`);
      return undefined;
    });
  }

  start(id: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (!['Assigned', 'Scheduled', 'Reopened'].includes(r.status)) return new Error('Only assigned or scheduled requests can be started.');
      if (!r.assignment.technician) return new Error('Assign a technician first.');
      const next = this.store.replace({ ...r, status: 'In Progress', sla: { ...r.sla, respondedAt: r.sla.respondedAt ?? this.store.now() } });
      this.store.log(next, 'Status Changed', 'Work started', r.status, 'In Progress');
      return undefined;
    });
  }

  escalate(id: string, level: number, reason: string, action: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (level < 1 || level > 4) return new Error('Escalation level must be 1–4.');
      if (!reason.trim()) return new Error('An escalation reason is required.');
      const next = this.store.replace({ ...r, escalation: { level: Math.max(level, r.escalation.level), events: [...r.escalation.events, { at: this.store.now(), level, trigger: 'Customer escalation', action, by: this.store.user, reason }] } });
      this.store.log(next, 'Request Escalated', `${reason} — ${action}`, r.escalation.level ? `Level ${r.escalation.level}` : null, `Level ${level}`);
      return undefined;
    });
  }

  hold(id: string, input: HoldInput): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (!['Assigned', 'Scheduled', 'In Progress', 'Validated', 'Reopened'].includes(r.status)) return new Error('Only active requests can be put on hold.');
      if (!input.reason) return new Error('Pending requests must have a valid hold reason.');
      const pausesSla = SR_RULES.slaPauseReasons.includes(input.reason);
      const next = this.store.replace({ ...r, status: 'Pending', holds: [...r.holds, { ...input, startedAt: this.store.now(), endedAt: null, pausesSla, previousStatus: r.status }] });
      this.store.log(next, 'Request Put On Hold', `${input.reason}${pausesSla ? ' — SLA clock paused (approved pause reason)' : ' — SLA clock continues'}`, r.status, 'Pending');
      return undefined;
    });
  }

  resume(id: string, comment: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      const hold = r.holds.find((h) => !h.endedAt);
      if (r.status !== 'Pending' || !hold) return new Error('The request is not on hold.');
      const next = this.store.replace({ ...r, status: hold.previousStatus, holds: r.holds.map((h) => (h === hold ? { ...h, endedAt: this.store.now() } : h)) });
      this.store.log(next, 'Request Resumed', comment || 'Hold released', 'Pending', hold.previousStatus);
      return undefined;
    });
  }

  /** SRS 9.18 — the request stays the demand record; the work order is the execution record. */
  createWorkOrder(id: string): Observable<string> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (!ACTIVE_WORK_STATUSES.includes(r.status)) return new Error('Validate and assign the request before generating a work order.');
      if (r.coverage.chargeable && r.coverage.approval !== 'Approved') return new Error('Non-covered work needs customer approval before a billable work order.');
      if (r.workOrders.some((w) => !['Completed', 'Cancelled'].includes(w.status))) return new Error('An open work order already exists.');
      const woId = this.store.uid('SWO');
      const number = `WO-SR-${woId.slice(-5)}`;
      const next = this.store.replace({ ...r, status: r.status === 'Validated' ? r.status : 'In Progress', workOrders: [...r.workOrders, { id: woId, number, status: r.assignment.technician ? 'Assigned' : 'Open', createdAt: this.store.now(), team: r.assignment.team, technician: r.assignment.technician, scheduledDate: r.schedule?.scheduledDate ?? null, completedAt: null, labourMinutes: 0, travelCost: SR_RULES.travelCostPerVisit, parts: [], billable: r.coverage.chargeable, checklistCompleted: false }] });
      this.store.log(next, 'Work Order Created', `${r.coverage.chargeable ? 'Billable' : 'Covered'} work order for field execution`, null, number, 'Manual', number);
      return number;
    });
  }

  completeWorkOrder(id: string, workOrderId: string, input: { labourMinutes: number; parts: readonly PartUsage[]; checklistCompleted: boolean }): Observable<void> {
    return mutate(() => {
      const r = this.store.request(id);
      const wo = r?.workOrders.find((w) => w.id === workOrderId);
      if (!r || !wo) return new Error('Work order not found.');
      if (['Completed', 'Cancelled'].includes(wo.status)) return new Error('Work order is already closed.');
      if (!(input.labourMinutes > 0)) return new Error('Record the labour used.');
      const next = this.store.replace({ ...r, workOrders: r.workOrders.map((w) => (w.id === workOrderId ? { ...w, status: 'Completed', completedAt: this.store.now(), labourMinutes: input.labourMinutes, parts: input.parts, checklistCompleted: input.checklistCompleted } : w)) });
      this.store.log(next, 'Work Order Updated', `Completed — ${input.labourMinutes} min labour${input.parts.length ? `, parts ${input.parts.map((p) => `${p.quantity} × ${p.partNumber}`).join(', ')}` : ''}. Reflected on the request.`, wo.status, 'Completed', 'Work Order', wo.number);
      return undefined;
    });
  }

  resolve(id: string, input: ResolutionInput): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (!['Assigned', 'Scheduled', 'In Progress', 'Reopened'].includes(r.status)) return new Error('Only active requests can be resolved.');
      if (!input.code || !input.description.trim() || !input.category) return new Error('Resolution code, category and description are required.');
      const open = r.workOrders.filter((w) => !['Completed', 'Cancelled'].includes(w.status));
      if (open.length) return new Error(`Complete work order ${open[0].number} before resolving.`);
      const now = this.store.now();
      const labour = input.labourMinutes || r.workOrders.reduce((s, w) => s + w.labourMinutes, 0);
      const next = this.store.replace({ ...r, status: 'Resolved', resolution: { ...input, labourMinutes: labour, completedAt: now, resolvedBy: r.assignment.technician ?? this.store.user, confirmation: null, closureNotes: '' }, sla: { ...r.sla, respondedAt: r.sla.respondedAt ?? now, resolvedAt: now } });
      this.store.log(next, 'Resolution Added', `${input.code} · ${input.category}`, null, input.code);
      this.store.log(next, 'Request Resolved', input.description, r.status, 'Resolved');
      return undefined;
    });
  }

  confirm(id: string, accepted: boolean, by: string, comment: string): Observable<void> {
    return mutate(() => {
      const r = this.store.request(id);
      if (!r || r.status !== 'Resolved' || !r.resolution) return new Error('Only resolved requests can be confirmed.');
      if (!by.trim()) return new Error('Enter who confirmed the resolution.');
      if (!accepted) return this.doReopen(r, 'Customer Rejection', comment || 'Customer did not accept the resolution.') ?? undefined;
      const next = this.store.replace({ ...r, resolution: { ...r.resolution, confirmation: { confirmed: true, by, at: this.store.now(), comment } } });
      this.store.log(next, 'Customer Confirmation', comment || 'Resolution accepted', null, 'Accepted', 'Customer');
      return undefined;
    });
  }

  close(id: string, notes: string): Observable<void> {
    return mutate(() => {
      const r = this.store.request(id);
      if (!r || r.status !== 'Resolved' || !r.resolution) return new Error('Only resolved requests can be closed.');
      const failed = validation(this.db, r).find((g) => g.group === 'Closure')!.checks.filter((c) => c.result === 'fail');
      if (failed.length) return new Error(`Closure validation failed: ${failed.map((c) => `${c.check} — ${c.detail}`).join('; ')}`);
      const next = this.store.replace({ ...r, status: 'Closed', resolution: { ...r.resolution, closureNotes: notes } });
      this.store.log(next, 'Request Closed', notes || 'Closure validation passed — final outcome recorded.', 'Resolved', 'Closed');
      return undefined;
    });
  }

  reopen(id: string, reason: string, comment: string): Observable<void> {
    return mutate(() => {
      const r = this.store.request(id);
      if (!r) return new Error('Request not found.');
      return this.doReopen(r, reason, comment) ?? undefined;
    });
  }

  /** SRS 9.22 — previous resolution retained; the SLA resolution clock resumes. */
  private doReopen(r: ServiceRequest, reason: string, comment: string): Error | null {
    if (!['Resolved', 'Closed'].includes(r.status) || !r.resolution) return new Error('Only resolved or closed requests can be reopened.');
    if (!reason) return new Error('A reopen reason is required.');
    const days = (Date.now() - new Date(r.resolution.completedAt).getTime()) / 86_400_000;
    if (days > SR_RULES.reopenWindowDays) return new Error(`Requests can be reopened within ${SR_RULES.reopenWindowDays} days — raise a follow-up request instead.`);
    const next = this.store.replace({ ...r, status: 'Reopened', previousResolutions: [...r.previousResolutions, r.resolution], resolution: null, reopenCount: r.reopenCount + 1, sla: { ...r.sla, resolvedAt: null } });
    this.store.log(next, 'Request Reopened', `${reason}${comment ? ` — ${comment}` : ''}. Previous resolution retained.`, r.status, 'Reopened');
    return null;
  }

  cancel(id: string, reason: string, comment: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (!reason) return new Error('A cancellation reason is required.');
      const next = this.store.replace({ ...r, status: 'Cancelled', cancellation: { reason, comment, by: this.store.user, at: this.store.now() }, workOrders: r.workOrders.map((w) => (w.status === 'Completed' ? w : { ...w, status: 'Cancelled' })), holds: r.holds.map((h) => (h.endedAt ? h : { ...h, endedAt: this.store.now() })) });
      this.store.log(next, 'Request Cancelled', `${reason}${comment ? ` — ${comment}` : ''}`, r.status, 'Cancelled');
      return undefined;
    });
  }

  reject(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const r = this.open(id);
      if (r instanceof Error) return r;
      if (!['New', 'Under Validation', 'Validated'].includes(r.status)) return new Error('Only requests that are not yet assigned can be rejected.');
      if (!reason.trim()) return new Error('A rejection reason is required.');
      const next = this.store.replace({ ...r, status: 'Rejected', cancellation: { reason, comment: '', by: this.store.user, at: this.store.now() } });
      this.store.log(next, 'Request Rejected', reason, r.status, 'Rejected');
      return undefined;
    });
  }

  linkDuplicate(id: string, otherId: string, merge: boolean): Observable<void> {
    return mutate(() => {
      const r = this.store.request(id);
      const o = this.store.request(otherId);
      if (!r || !o || id === otherId) return new Error('Select two different requests.');
      if (merge && !SR_RULES.supervisorRoles.includes(this.store.role)) return new Error('Merging requires supervisor approval.');
      if (merge && !OPEN_STATUSES.includes(r.status)) return new Error('Only open requests can be merged.');
      this.db.requests = this.db.requests.map((x) => (x.id === otherId ? { ...x, linkedRequestIds: [...new Set([...x.linkedRequestIds, id])], activities: merge ? [...x.activities, ...r.activities.map((a) => ({ ...a, id: this.store.uid('ACT'), message: `[from ${r.number}] ${a.message}` }))] : x.activities } : x));
      const next = this.store.replace({ ...r, linkedRequestIds: [...new Set([...r.linkedRequestIds, otherId])], duplicateOf: otherId, ...(merge ? { status: 'Cancelled' as const, cancellation: { reason: 'Merged into Another Request', comment: `Merged into ${o.number}`, by: this.store.user, at: this.store.now() } } : {}) });
      this.store.log(next, merge ? 'Request Merged' : 'Duplicate Linked', merge ? `Merged into ${o.number} — record kept (not deleted), activities copied.` : `Linked to ${o.number}`, null, o.number, 'Manual', o.number);
      return undefined;
    });
  }

  addActivity(id: string, input: Omit<Activity, 'id' | 'at' | 'user'>): Observable<void> {
    return mutate(() => {
      const r = this.store.request(id);
      if (!r) return new Error('Request not found.');
      if (!input.message.trim()) return new Error('Enter a message.');
      const now = this.store.now();
      const firstResponse = !r.sla.respondedAt && input.visibility === 'Customer Visible' && input.direction === 'Outbound';
      const next = this.store.replace({ ...r, activities: [...r.activities, { ...input, id: this.store.uid('ACT'), at: now, user: this.store.user }], sla: firstResponse ? { ...r.sla, respondedAt: now } : r.sla });
      this.store.log(next, 'Communication Added', `${input.type} (${input.visibility})${firstResponse ? ' — first response recorded' : ''}`, null, null);
      return undefined;
    });
  }

  addAttachment(id: string, file: { name: string; size: number; kind: 'Image' | 'Video' | 'Document' | 'Evidence'; visibility: 'Customer Visible' | 'Internal Only' }): Observable<void> {
    return mutate(() => {
      const r = this.store.request(id);
      if (!r) return new Error('Request not found.');
      const next = this.store.replace({ ...r, attachments: [...r.attachments, { ...file, id: this.store.uid('ATT'), by: this.store.user, at: this.store.now() }] });
      this.store.log(next, 'Attachment Added', `${file.kind} “${file.name}” (${file.visibility})`, null, file.name);
      return undefined;
    });
  }

  validation(id: string): Observable<ValidationGroup[]> {
    return query(this.store, () => validation(this.db, this.store.request(id)!));
  }

  /** SRS 9.9 — customer / site / asset identification by name, code, phone, email, serial or asset number. */
  identify(q: string): Observable<IdentificationResult> {
    return query(this.store, () => {
      const t = q.trim().toLowerCase();
      const ref = this.db.reference;
      if (t.length < 2) return { customers: [], sites: [], assets: [], openRequests: [] };
      const contactHits = ref.contacts.filter((c) => c.phone.replace(/\s/g, '').includes(t.replace(/\s/g, '')) || c.email.toLowerCase().includes(t) || c.name.toLowerCase().includes(t));
      const customers = ref.customers.filter((c) => c.name.toLowerCase().includes(t) || c.code.toLowerCase().includes(t) || contactHits.some((h) => h.customerId === c.id)).slice(0, 8).map((c) => ({ id: c.id, name: c.name, code: c.code, status: c.status, matchedOn: c.name.toLowerCase().includes(t) ? 'Name' : c.code.toLowerCase().includes(t) ? 'Code' : 'Contact phone / email' }));
      const sites = ref.sites.filter((s) => s.name.toLowerCase().includes(t) || s.address.toLowerCase().includes(t) || customers.some((c) => c.id === s.customerId)).slice(0, 10).map((s) => ({ id: s.id, name: s.name, customerId: s.customerId, city: s.city, matchedOn: s.name.toLowerCase().includes(t) ? 'Site name' : s.address.toLowerCase().includes(t) ? 'Address' : 'Customer' }));
      const assets = ref.assets.filter((a) => a.id.toLowerCase().includes(t) || a.code.toLowerCase().includes(t) || a.serialNumber.toLowerCase().includes(t) || a.name.toLowerCase().includes(t) || sites.some((s) => s.id === a.siteId)).slice(0, 12).map((a) => ({ id: a.id, name: a.name, siteId: a.siteId, customerId: a.customerId, serialNumber: a.serialNumber, status: a.status, warranty: a.warrantyStatus, matchedOn: a.serialNumber.toLowerCase().includes(t) ? 'Serial number' : a.id.toLowerCase().includes(t) || a.code.toLowerCase().includes(t) ? 'Asset number' : a.name.toLowerCase().includes(t) ? 'Asset name' : 'Site' }));
      const ids = new Set([...customers.map((c) => c.id)]);
      const siteIds = new Set(sites.map((s) => s.id));
      const assetIds = new Set(assets.map((a) => a.id));
      const openRequests = this.db.requests.filter((r) => OPEN_STATUSES.includes(r.status) && (ids.has(r.customer.customerId) || siteIds.has(r.location.siteId) || (r.assetId && assetIds.has(r.assetId)))).slice(0, 10).map((r) => this.store.item(r));
      return { customers, sites, assets, openRequests };
    });
  }

  runAutomation(): Observable<number> {
    return mutate(() => automate(this.db, (e) => this.db.history.unshift({ ...e, id: this.store.uid('SRH') }), this.store.uid));
  }

  dashboard(f: SrDashboardFilters): Observable<SrDashboard> {
    return query(this.store, () => {
      const has = (l: readonly string[], v: string | null | undefined) => !l.length || l.includes(v ?? '');
      const inRange = (d: string) => (!f.period.from || d.slice(0, 10) >= f.period.from) && (!f.period.to || d.slice(0, 10) <= f.period.to);
      const items = this.db.requests.map((r) => this.store.item(r)).filter((r) => has(f.companies, r.company) && has(f.branches, r.branch) && has(f.customers, r.customer.customerId) && has(f.sites, r.location.siteId) && has(f.assets, r.assetId) && has(f.categories, r.serviceCategory) && has(f.types, r.type) && has(f.priorities, r.priority) && has(f.slas, r.sla.slaId) && (!f.agreements.length || f.agreements.includes(r.coverage.amcId ?? '') || f.agreements.includes(r.coverage.contractId ?? '')) && has(f.teams, r.assignment.team) && has(f.technicians, r.assignment.technician) && has(f.statuses, r.status) && inRange(r.createdAt));
      const open = items.filter((r) => OPEN_STATUSES.includes(r.status));
      const hold = (reason: string) => open.filter((r) => r.onHold?.reason === reason).length;
      const responded = items.filter((r) => r.sla.respondedAt).map((r) => (new Date(r.sla.respondedAt!).getTime() - new Date(r.createdAt).getTime()) / 60_000);
      const resolved = items.filter((r) => r.resolution).map((r) => (new Date(r.resolution!.completedAt).getTime() - new Date(r.createdAt).getTime()) / 60_000);
      const done = items.filter((r) => ['Resolved', 'Closed'].includes(r.status));
      const ftr = done.filter((r) => r.reopenCount === 0 && r.workOrders.filter((w) => w.status === 'Completed').length <= 1);
      const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10));
      return {
        kpis: {
          total: items.length, new: items.filter((r) => r.status === 'New').length, unassigned: open.filter((r) => !r.assignment.technician).length, assigned: items.filter((r) => r.status === 'Assigned').length, inProgress: items.filter((r) => r.status === 'In Progress').length,
          scheduled: items.filter((r) => r.status === 'Scheduled').length, pendingCustomer: hold('Waiting for Customer'), pendingParts: hold('Waiting for Parts'), pendingApproval: hold('Waiting for Approval') + open.filter((r) => r.status === 'Under Validation').length,
          escalated: open.filter((r) => r.escalated).length, atRisk: open.filter((r) => r.slaState === 'At Risk').length, breached: open.filter((r) => r.slaState === 'Breached').length, resolved: items.filter((r) => r.status === 'Resolved').length,
          closed: items.filter((r) => r.status === 'Closed').length, reopened: items.filter((r) => r.reopenCount > 0).length, avgResponseMinutes: avg(responded), avgResolutionMinutes: avg(resolved), firstTimeResolution: pct(ftr.length, done.length),
        },
        byPriority: count(open, (r) => [r.priority, r.priority]),
        byCustomer: count(open, (r) => [r.customer.customerId, r.customerName]),
        bySite: count(open, (r) => [r.location.siteId, r.siteName]),
        byAsset: count(open, (r) => (r.assetId ? [r.assetId, r.assetName ?? r.assetId] : null)),
        byTechnician: count(open, (r) => [r.assignment.technician ?? 'Unassigned', r.assignment.technician ?? 'Unassigned']),
        byType: count(items, (r) => [r.type, r.type], 11),
        byAgreement: count(items, (r) => (r.amcNumber ? [r.amcNumber, r.amcNumber] : r.contractNumber ? [r.contractNumber, r.contractNumber] : ['none', 'No contract / AMC'])),
        byChannel: count(items, (r) => [r.source, r.source]),
        trend: days.map((d) => ({ key: d, label: d.slice(5), value: items.filter((r) => r.createdAt.slice(0, 10) === d).length })),
        atRiskList: open.filter((r) => r.slaState === 'At Risk' || r.slaState === 'Breached').sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '')).slice(0, 6),
        unassignedList: open.filter((r) => !r.assignment.technician).sort((a, b) => ['Critical', 'High', 'Medium', 'Low'].indexOf(a.priority) - ['Critical', 'High', 'Medium', 'Low'].indexOf(b.priority)).slice(0, 6),
      };
    });
  }

  performance(): Observable<SrPerformance> {
    return query(this.store, () => {
      const items = this.db.requests.map((r) => this.store.item(r));
      const open = items.filter((r) => OPEN_STATUSES.includes(r.status));
      const decidedResp = items.filter((r) => ['Met', 'Breached'].includes(r.response.state));
      const decidedRes = items.filter((r) => ['Met', 'Breached'].includes(r.resolutionClock.state));
      const done = items.filter((r) => ['Resolved', 'Closed'].includes(r.status));
      const holds = items.flatMap((r) => r.holds.map((h) => ((h.endedAt ? new Date(h.endedAt).getTime() : Date.now()) - new Date(h.startedAt).getTime()) / 3_600_000));
      const assignTimes = items.filter((r) => r.assignment.assignedAt).map((r) => (new Date(r.assignment.assignedAt!).getTime() - new Date(r.createdAt).getTime()) / 60_000);
      const delays = items.filter((r) => r.schedule && r.requestedDate).map((r) => (new Date(r.schedule!.scheduledDate).getTime() - new Date(r.requestedDate!).getTime()) / 86_400_000);
      const needConfirm = done.filter((r) => closureNeedsConfirmation(r));
      return {
        volume: items.length, newRequests: items.filter((r) => Date.now() - new Date(r.createdAt).getTime() < 7 * 86_400_000).length, open: open.length, avgAgeHours: avg(open.map((r) => r.ageHours)),
        avgResponseMinutes: avg(items.filter((r) => r.sla.respondedAt).map((r) => (new Date(r.sla.respondedAt!).getTime() - new Date(r.createdAt).getTime()) / 60_000)),
        avgResolutionMinutes: avg(items.filter((r) => r.resolution).map((r) => (new Date(r.resolution!.completedAt).getTime() - new Date(r.createdAt).getTime()) / 60_000)),
        responseCompliance: pct(decidedResp.filter((r) => r.response.state === 'Met').length, decidedResp.length), resolutionCompliance: pct(decidedRes.filter((r) => r.resolutionClock.state === 'Met').length, decidedRes.length),
        breachRate: pct(items.filter((r) => r.slaState === 'Breached').length, items.filter((r) => r.slaState !== 'No SLA').length), firstTimeResolution: pct(done.filter((r) => r.reopenCount === 0).length, done.length),
        reopenRate: pct(items.filter((r) => r.reopenCount > 0).length, done.length + items.filter((r) => r.status === 'Reopened').length), cancellationRate: pct(items.filter((r) => r.status === 'Cancelled').length, items.length),
        escalationRate: pct(items.filter((r) => r.escalation.level > 0).length, items.length), avgPendingHours: avg(holds), avgAssignmentMinutes: avg(assignTimes), scheduleDelayDays: delays.length ? Math.round((delays.reduce((s, d) => s + d, 0) / delays.length) * 10) / 10 : null,
        confirmationRate: pct(needConfirm.filter((r) => r.resolution?.confirmation?.confirmed).length, needConfirm.length),
        byCustomer: count(items, (r) => [r.customer.customerId, r.customerName]), byAsset: count(items, (r) => (r.assetId ? [r.assetId, r.assetName ?? r.assetId] : null)), byCategory: count(items, (r) => [r.serviceCategory, r.serviceCategory]),
        byTechnician: count(items, (r) => (r.assignment.technician ? [r.assignment.technician, r.assignment.technician] : null)), byAgreement: count(items, (r) => (r.amcNumber ? [r.amcNumber, r.amcNumber] : r.contractNumber ? [r.contractNumber, r.contractNumber] : null)),
        byRootCause: count(items, (r) => { const rc = r.resolution?.rootCause ?? r.previousResolutions.at(-1)?.rootCause; return rc ? [rc, rc] : null; }),
      };
    });
  }

  rules(): Observable<{ classification: ClassificationRule[]; routing: RoutingRule[] }> {
    return defer(() => respond({ classification: [...CLASSIFICATION_RULES], routing: [...ROUTING_RULES] }, 100));
  }

  private open(id: string): ServiceRequest | Error {
    const r = this.store.request(id);
    if (!r) return new Error('Request not found.');
    if (!OPEN_STATUSES.includes(r.status)) return new Error(`${r.status} requests are protected from modification.`);
    return r;
  }

  /** SRS 9.23 / 9.24 — draft validation. */
  private checkDraft(d: RequestDraft): Error | null {
    const ref = this.db.reference;
    if (d.type !== 'Internal Service Request' && !d.customer.customerId) return new Error('Customer is mandatory for external service requests.');
    const c = ref.customers.find((x) => x.id === d.customer.customerId);
    if (d.customer.customerId && !c) return new Error('Select a valid customer.');
    if (c && c.status !== 'Active' && d.type !== 'Internal Service Request') return new Error(`${c.name} is ${c.status.toLowerCase()} — new requests need an active customer.`);
    if (!d.location.siteId) return new Error('Select the service location (site).');
    if (ref.sites.find((s) => s.id === d.location.siteId)?.customerId !== d.customer.customerId) return new Error('The site does not belong to the selected customer.');
    if (d.assetId) {
      const a = ref.assets.find((x) => x.id === d.assetId);
      if (!a || a.siteId !== d.location.siteId) return new Error('The asset does not belong to the selected site.');
      if (['Retired', 'Decommissioned', 'Disposed', 'Inactive'].includes(a.status)) return new Error(`Asset ${a.id} is ${a.status.toLowerCase()} and cannot be selected for new requests.`);
    }
    if (!REQUEST_TYPES.includes(d.type)) return new Error('Request type is mandatory.');
    if (!d.serviceCategory) return new Error('Service category is mandatory.');
    if (!d.subject.trim()) return new Error('Subject is required.');
    if (d.description.trim().length < 15) return new Error('Description must provide sufficient service-demand information (at least 15 characters).');
    if (!d.customer.phone && !d.customer.email) return new Error('Enter a contact phone or email.');
    return null;
  }
}

@Injectable()
export class MockSrHistoryApi extends SrHistoryApi {
  private readonly store = inject(MockSrStore);

  list(requestId?: string): Observable<SrHistoryEvent[]> {
    return query(this.store, () => this.store.db.history.filter((h) => !requestId || h.requestId === requestId));
  }
}

@Injectable()
export class MockSrReferenceApi extends SrReferenceApi {
  private readonly store = inject(MockSrStore);

  get(): Observable<SrReferenceData> {
    return defer(() => respond(this.store.db.reference, 150));
  }
}
