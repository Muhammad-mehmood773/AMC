import { Injectable, inject } from '@angular/core';
import { type Observable, defer } from 'rxjs';
import { fail, pad, respond } from '../../../customers/data/mock/mock-utils';
import type {
  EscalationEventListItem,
  EscalationRuleInput,
  EscalationRuleListItem,
  Holiday,
  HolidayInput,
  PauseReason,
  PerformanceDimension,
  PerformanceRow,
  SlaBreachListItem,
  SlaCalendar,
  SlaCalendarInput,
  SlaClock,
  SlaClockListItem,
  SlaCoverageInput,
  SlaCoverageListItem,
  SlaDashboard,
  SlaDashboardFilters,
  SlaHistoryEntity,
  SlaHistoryEvent,
  SlaMappingInput,
  SlaMappingListItem,
  SlaPerformance,
  SlaRenewalInput,
  SlaRenewalReview,
  SlaRequest,
  SlaSelection,
  SlaTargetInput,
  SlaTargetListItem,
  TargetType,
  TrendPoint,
} from '../../models/operations.model';
import { ESCALATION_LEVELS } from '../../models/operations.model';
import type { SlaReferenceData } from '../../models/reference.model';
import { EDITABLE_SLA_STATUSES, LIVE_SLA_STATUSES, type Sla, type SlaDocument, type SlaListItem, SLA_TYPES, type SlaUpsert, type SlaVersion } from '../../models/sla.model';
import {
  type BreachPatch,
  EscalationApi,
  SlaApi,
  SlaBreachApi,
  SlaCalendarApi,
  SlaClockApi,
  SlaCoverageApi,
  SlaHistoryApi,
  SlaMappingApi,
  SlaPerformanceApi,
  SlaReferenceApi,
  SlaTargetApi,
  type StartClockInput,
} from '../sla.api';
import { SLA_RULES } from '../sla.config';
import { calendar, clockMetrics, resolveSla, slaStatus, syncTargets, targetFor, today } from './sla-engine';
import { MockSlaStore } from './mock-sla-store';

const norm = (v: string) => v.trim().toLowerCase();

function mutate<T>(work: () => T | Error): Observable<T> {
  return defer(() => {
    const result = work();
    return result instanceof Error ? fail(result.message) : respond(result, 320);
  });
}

function query<T>(store: MockSlaStore, work: () => T): Observable<T> {
  return defer(() => {
    store.monitor();
    return respond(work());
  });
}

const nextMinor = (v: string) => {
  const [a, b] = v.split('.').map(Number);
  return `${a}.${(b || 0) + 1}`;
};

const addMonths = (date: string, months: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

@Injectable()
export class MockSlaApi extends SlaApi {
  private readonly store = inject(MockSlaStore);

  list(): Observable<SlaListItem[]> {
    return query(this.store, () => [...this.store.db.slas].sort((a, b) => a.number.localeCompare(b.number)).map((s) => this.store.item(s)));
  }

  get(id: string): Observable<SlaListItem> {
    return defer(() => {
      this.store.monitor();
      const s = this.store.sla(id);
      return s ? respond(this.store.item(s)) : fail(`SLA ${id} was not found.`);
    });
  }

  create(input: SlaUpsert): Observable<Sla> {
    return mutate(() => {
      if (this.store.db.slas.some((s) => norm(s.number) === norm(input.number))) return new Error(`SLA number ${input.number} is already in use.`);
      const error = this.check(input);
      if (error) return error;
      const s: Sla = { ...input, number: input.number.toUpperCase(), id: input.number.toUpperCase(), status: 'Draft', approval: 'Not Submitted', version: '1.0', previousSlaId: null, documents: [], createdAt: this.store.now(), createdBy: this.store.user, updatedAt: null, updatedBy: null };
      this.store.db.slas.push(s);
      this.store.db.versions.push({ slaId: s.id, version: '1.0', createdAt: s.createdAt, createdBy: s.createdBy, summary: 'Initial version.', snapshot: s.priorityTargets });
      syncTargets(this.store.db, s, () => this.store.uid('TGT'));
      if (s.customer.customerId) this.store.db.coverage.push({ id: this.store.uid('SCV'), slaId: s.id, level: 'Customer', customerId: s.customer.customerId, contractId: null, amcId: null, siteId: null, assetId: null, assetCategory: null, serviceId: null, serviceCategory: null, priority: null, startDate: s.validity.effectiveDate, endDate: s.validity.expiryDate, status: 'Active' });
      this.store.log('SLA Created', 'SLA', s.id, s.id, `${s.type} created.`, null, s.name);
      this.store.log('Target Added', 'Target', s.id, s.id, 'Priority targets defined.');
      return s;
    });
  }

  update(id: string, input: SlaUpsert, summary: string): Observable<Sla> {
    return mutate(() => {
      const current = this.store.sla(id);
      if (!current) return new Error('SLA was not found.');
      if (!EDITABLE_SLA_STATUSES.includes(slaStatus(current))) return new Error(`${slaStatus(current)} SLAs cannot be changed — history is preserved.`);
      const error = this.check(input);
      if (error) return error;
      const version = nextMinor(current.version);
      const next: Sla = { ...current, ...input, id, number: current.number, version, updatedAt: this.store.now(), updatedBy: this.store.user };
      this.store.replace(next);
      syncTargets(this.store.db, next, () => this.store.uid('TGT'));
      // Running clocks keep their snapshot: SLA modifications never alter historical calculations.
      this.store.db.versions.push({ slaId: id, version, createdAt: this.store.now(), createdBy: this.store.user, summary: summary || 'Updated.', snapshot: next.priorityTargets });
      if (JSON.stringify(current.priorityTargets) !== JSON.stringify(next.priorityTargets)) this.store.log('Target Modified', 'Target', id, id, 'Priority targets changed — running clocks keep their original targets.', current.version, version);
      if (current.serviceHours.calendarId !== next.serviceHours.calendarId) this.store.log('Calendar Changed', 'Calendar', id, id, 'Service calendar changed.', calendar(this.store.db, current.serviceHours.calendarId).name, calendar(this.store.db, next.serviceHours.calendarId).name);
      this.store.log(LIVE_SLA_STATUSES.includes(slaStatus(current)) ? 'SLA Amended' : 'SLA Created', 'SLA', id, id, summary || 'SLA updated.', current.version, version);
      return next;
    });
  }

  nextNumber(): Observable<string> {
    return query(this.store, () => `SLA-${pad(Math.max(100, ...this.store.db.slas.map((s) => Number(/^SLA-(\d+)$/.exec(s.number)?.[1] ?? 0))) + 1, 3)}`);
  }

  duplicate(id: string): Observable<Sla> {
    return mutate(() => {
      const s = this.store.sla(id);
      if (!s) return new Error('SLA was not found.');
      const number = `SLA-${pad(Math.max(100, ...this.store.db.slas.map((x) => Number(/^SLA-(\d+)$/.exec(x.number)?.[1] ?? 0))) + 1, 3)}`;
      const copy: Sla = { ...s, id: number, number, name: `${s.name} (Copy)`, status: 'Draft', approval: 'Not Submitted', version: '1.0', previousSlaId: null, parentSlaId: s.id, documents: [], createdAt: this.store.now(), createdBy: this.store.user, updatedAt: null, updatedBy: null };
      this.store.db.slas.push(copy);
      this.store.db.versions.push({ slaId: number, version: '1.0', createdAt: copy.createdAt, createdBy: copy.createdBy, summary: `Duplicated from ${s.number}.`, snapshot: copy.priorityTargets });
      this.store.db.targets.push(...this.store.db.targets.filter((t) => t.slaId === id).map((t) => ({ ...t, id: this.store.uid('TGT'), slaId: number })));
      this.store.db.rules.push(...this.store.db.rules.filter((r) => r.slaId === id).map((r) => ({ ...r, id: this.store.uid('ER'), slaId: number })));
      this.store.log('SLA Created', 'SLA', number, number, `Duplicated from ${s.number}.`, null, copy.name, s.number);
      return copy;
    });
  }

  submitForApproval(id: string): Observable<void> {
    return mutate(() => {
      const s = this.store.sla(id);
      if (!s || !['Draft', 'Under Review'].includes(s.status)) return new Error('Only draft SLAs can be submitted.');
      const missing = this.missingTargets(s);
      if (missing) return new Error(missing);
      this.store.replace({ ...s, status: 'Pending Approval', approval: 'Pending' });
      this.store.log('Submitted for Approval', 'SLA', id, id, 'Submitted for approval.', s.status, 'Pending Approval');
      return undefined;
    });
  }

  decide(id: string, approve: boolean, comment: string): Observable<void> {
    return mutate(() => {
      const s = this.store.sla(id);
      if (!s || s.status !== 'Pending Approval') return new Error('Only SLAs pending approval can be decided.');
      if (!approve && !comment.trim()) return new Error('A comment is required when rejecting.');
      this.store.replace({ ...s, status: approve ? 'Approved' : 'Draft', approval: approve ? 'Approved' : 'Rejected' });
      this.store.log(approve ? 'SLA Approved' : 'SLA Rejected', 'SLA', id, id, comment || 'Approved.', 'Pending Approval', approve ? 'Approved' : 'Draft');
      return undefined;
    });
  }

  activate(id: string): Observable<Sla> {
    return mutate(() => {
      const s = this.store.sla(id);
      if (!s) return new Error('SLA was not found.');
      if (!['Draft', 'Pending Approval', 'Approved', 'Pending Activation'].includes(s.status)) return new Error(`${s.status} SLAs cannot be activated.`);
      if (!s.validity.effectiveDate) return new Error('Every active SLA must have an effective date.');
      const missing = this.missingTargets(s);
      if (missing) return new Error(missing);
      if (!this.store.db.calendars.some((c) => c.id === s.serviceHours.calendarId && c.status === 'Active')) return new Error('Every SLA must reference a valid, active service calendar.');
      if (s.validity.expiryDate && s.validity.expiryDate < today()) return new Error('The SLA validity period has already ended.');
      if (s.approval !== 'Approved' && s.status !== 'Approved') {
        if (SLA_RULES.commercialSlaRequiresApproval && (s.commercial.penaltyApplicable || s.commercial.serviceCreditApplicable)) return new Error('SLAs with penalties or service credits must be approved before activation — submit it for approval.');
        this.store.log('SLA Approved', 'SLA', id, id, 'Approved on activation by the service manager (no commercial penalties).', s.approval, 'Approved');
      }
      const future = s.validity.effectiveDate > today();
      const next: Sla = { ...s, status: future ? 'Pending Activation' : 'Active', approval: 'Approved' };
      this.store.replace(next);
      if (!future && s.previousSlaId) {
        const prev = this.store.sla(s.previousSlaId);
        if (prev && prev.status !== 'Renewed') {
          this.store.replace({ ...prev, status: 'Renewed' });
          this.store.db.mappings = this.store.db.mappings.map((m) => (m.slaId === prev.id ? { ...m, slaId: s.id } : m));
          this.store.log('SLA Renewed', 'SLA', prev.id, prev.id, `Superseded by ${s.number}; mappings moved, history preserved.`, slaStatus(prev), 'Renewed', s.number);
        }
      }
      this.store.log('SLA Activated', 'SLA', id, id, future ? `Activates on ${s.validity.effectiveDate}.` : 'SLA activated.', s.status, next.status);
      return next;
    });
  }

  suspend(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const s = this.store.sla(id);
      if (!s || !LIVE_SLA_STATUSES.includes(slaStatus(s))) return new Error('Only active SLAs can be suspended.');
      if (!reason.trim()) return new Error('A suspension reason is required.');
      this.store.replace({ ...s, status: 'Suspended' });
      this.store.log('SLA Suspended', 'SLA', id, id, `${reason} — no new SLA commitments will be created; running clocks continue.`, slaStatus(s), 'Suspended');
      return undefined;
    });
  }

  reactivate(id: string): Observable<void> {
    return mutate(() => {
      const s = this.store.sla(id);
      if (!s || s.status !== 'Suspended') return new Error('Only suspended SLAs can be reactivated.');
      this.store.replace({ ...s, status: 'Active' });
      this.store.log('SLA Reactivated', 'SLA', id, id, 'Suspension lifted.', 'Suspended', 'Active');
      return undefined;
    });
  }

  expire(id: string): Observable<void> {
    return mutate(() => {
      const s = this.store.sla(id);
      if (!s || ![...LIVE_SLA_STATUSES, 'Suspended'].includes(slaStatus(s))) return new Error('Only active or suspended SLAs can be expired.');
      this.store.replace({ ...s, status: 'Expired', validity: { ...s.validity, expiryDate: s.validity.expiryDate && s.validity.expiryDate < today() ? s.validity.expiryDate : today() } });
      this.store.log('SLA Expired', 'SLA', id, id, 'Expired manually — no longer assigned to new transactions; performance history remains available.', slaStatus(s), 'Expired');
      return undefined;
    });
  }

  renewalReview(id: string): Observable<SlaRenewalReview> {
    return query(this.store, () => {
      const s = this.store.sla(id)!;
      const clocks = this.store.db.clocks.filter((c) => c.slaId === id);
      const p = this.store.performance(clocks);
      const months = Math.max(1, (Date.now() - new Date(s.validity.effectiveDate).getTime()) / (30 * 86_400_000));
      const suggestion = (p.compliance ?? 100) < 85 ? 'Compliance is below 85% — review resourcing before tightening targets; consider relaxing Low-priority targets.' : (p.compliance ?? 100) > 97 ? 'Consistently met — targets can be tightened or the SLA value increased.' : 'Performance is stable — renew with current targets.';
      return { slaId: id, previousVersion: s.version, previousValue: s.commercial.value, currency: s.commercial.currency, performance: p, breachFrequency: Math.round((p.breached / months) * 10) / 10, escalationFrequency: Math.round((p.escalations / months) * 10) / 10, complaints: this.store.db.breaches.filter((b) => b.slaId === id && b.reason === 'Customer Delay').length, suggestion };
    });
  }

  renew(id: string, input: SlaRenewalInput): Observable<Sla> {
    return mutate(() => {
      const s = this.store.sla(id);
      if (!s) return new Error('SLA was not found.');
      if (!['Active', 'Expiring Soon', 'Expired'].includes(slaStatus(s))) return new Error(`${slaStatus(s)} SLAs cannot be renewed.`);
      if (this.store.db.slas.some((x) => x.previousSlaId === id)) return new Error('A renewal already exists for this SLA.');
      const baseNo = s.number.replace(/-R\d+$/, '');
      let n = 1;
      while (this.store.db.slas.some((x) => x.number === `${baseNo}-R${n}`)) n++;
      const start = s.validity.expiryDate && s.validity.expiryDate >= today() ? new Date(new Date(s.validity.expiryDate).getTime() + 86_400_000).toISOString().slice(0, 10) : today();
      const end = addMonths(start, input.termMonths);
      const number = `${baseNo}-R${n}`;
      const renewed: Sla = {
        ...s, id: number, number, previousSlaId: id, status: 'Approved', approval: 'Approved', version: `${Number(s.version.split('.')[0]) + 1}.0`, documents: [],
        validity: { ...s.validity, effectiveDate: start, expiryDate: end, renewalDate: new Date(new Date(end).getTime() - 60 * 86_400_000).toISOString().slice(0, 10), renewalTermMonths: input.termMonths },
        priorityTargets: input.revisedTargets, serviceHours: { ...s.serviceHours, calendarId: input.revisedCalendarId }, response: { ...s.response, calendarId: input.revisedCalendarId }, resolution: { ...s.resolution, calendarId: input.revisedCalendarId },
        commercial: { ...s.commercial, value: input.revisedValue }, notes: { ...s.notes, internal: [input.revisedEscalation, input.revisedCoverage, input.revisedCommercial].filter(Boolean).join(' · ') || s.notes.internal },
        createdAt: this.store.now(), createdBy: this.store.user, updatedAt: null, updatedBy: null,
      };
      this.store.db.slas.push(renewed);
      this.store.db.versions.push({ slaId: number, version: renewed.version, createdAt: renewed.createdAt, createdBy: renewed.createdBy, summary: `Renewal of ${s.number}.`, snapshot: renewed.priorityTargets });
      syncTargets(this.store.db, renewed, () => this.store.uid('TGT'));
      this.store.db.rules.push(...this.store.db.rules.filter((r) => r.slaId === id).map((r) => ({ ...r, id: this.store.uid('ER'), slaId: number })));
      this.store.db.coverage.push(...this.store.db.coverage.filter((c) => c.slaId === id).map((c) => ({ ...c, id: this.store.uid('SCV'), slaId: number, startDate: start, endDate: end })));
      this.store.log('SLA Renewed', 'SLA', id, id, `Renewal ${number} prepared (${start} → ${end}); mappings move when it is activated.`, s.version, renewed.version, number);
      return renewed;
    });
  }

  uploadDocument(id: string, type: SlaDocument['type'], file: { name: string; size: number }): Observable<void> {
    return mutate(() => {
      const s = this.store.sla(id);
      if (!s) return new Error('SLA was not found.');
      this.store.replace({ ...s, documents: [{ id: this.store.uid('SDOC'), name: file.name, type, size: file.size, uploadedBy: this.store.user, uploadedAt: this.store.now() }, ...s.documents] });
      this.store.log('Document Uploaded', 'Document', id, id, `${type} “${file.name}” uploaded.`);
      return undefined;
    });
  }

  versions(id: string): Observable<SlaVersion[]> {
    return query(this.store, () => this.store.db.versions.filter((v) => v.slaId === id).reverse());
  }

  dashboard(f: SlaDashboardFilters): Observable<SlaDashboard> {
    return query(this.store, () => {
      const has = (list: readonly string[], v: string | null | undefined) => !list.length || list.includes(v ?? '');
      const slas = this.store.db.slas.filter((s) => has(f.slas, s.id) && has(f.types, s.type) && has(f.statuses, slaStatus(s)) && (!f.customers.length || !s.customer.customerId || f.customers.includes(s.customer.customerId)) && has(f.contracts, s.contract.contractId ?? '') && has(f.amcs, s.contract.amcId ?? ''));
      const ids = new Set(slas.map((s) => s.id));
      const inPeriod = (iso: string) => (!f.period.from || iso.slice(0, 10) >= f.period.from) && (!f.period.to || iso.slice(0, 10) <= f.period.to);
      const clocks = this.store.db.clocks.filter((c) => ids.has(c.slaId) && has(f.customers, c.customerId) && has(f.sites, c.siteId) && has(f.services, c.serviceId ?? '') && has(f.assets, c.assetId ?? '') && has(f.priorities, c.priority) && has(f.regions, c.region) && has(f.teams, c.team) && has(f.technicians, c.technician ?? '') && inPeriod(c.startedAt));
      const items = clocks.map((c) => this.store.clockItem(c));
      const open = items.filter((c) => !c.stoppedAt && c.status !== 'Cancelled');
      const clockIds = new Set(clocks.map((c) => c.id));
      const breaches = this.store.db.breaches.filter((b) => clockIds.has(b.clockId));
      const p = this.store.performance(clocks);
      const count = (...s: string[]) => slas.filter((x) => s.includes(slaStatus(x))).length;
      const now = Date.now();
      const since = (days: number) => breaches.filter((b) => now - new Date(b.detectedAt).getTime() <= days * 86_400_000).length;
      const dueSoon = open.filter((c) => c.monitoringStatus !== 'Breached' && c.monitoringStatus !== 'Paused' && c.remainingMinutes <= SLA_RULES.dueSoonMinutes).sort((a, b) => a.remainingMinutes - b.remainingMinutes);
      const events = this.store.db.events.filter((e) => clockIds.has(e.clockId) && e.status === 'Open').map((e) => this.store.eventItem(e.id)).sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
      const trend: TrendPoint[] = [];
      for (let w = 11; w >= 0; w--) {
        const from = now - (w + 1) * 7 * 86_400_000;
        const to = now - w * 7 * 86_400_000;
        const week = clocks.filter((c) => { const t = new Date(c.stoppedAt ?? c.startedAt).getTime(); return t >= from && t < to; });
        const wp = this.store.performance(week);
        trend.push({ label: new Date(to).toISOString().slice(5, 10), compliance: wp.compliance, avgResponseMinutes: wp.avgResponseMinutes, avgResolutionMinutes: wp.avgResolutionMinutes, breaches: wp.breached, escalations: wp.escalations });
      }
      const customers = this.store.breakdown('Customer', clocks);
      const services = this.store.breakdown('Service', clocks);
      return {
        kpis: {
          total: slas.length, draft: count('Draft', 'Under Review'), pendingApproval: count('Pending Approval'), active: count('Active'), expiring: count('Expiring Soon'), expired: count('Expired'), suspended: count('Suspended'),
          activeClocks: open.length, requestsUnderSla: new Set(open.filter((c) => c.transactionType === 'Service Request').map((c) => c.transactionId)).size, workOrdersUnderSla: new Set(open.filter((c) => c.transactionType === 'Work Order').map((c) => c.transactionId)).size,
          dueSoon: dueSoon.length, breaches: breaches.length, responseBreaches: breaches.filter((b) => b.breachType === 'Response Breach' || b.breachType === 'Arrival Breach').length, resolutionBreaches: breaches.filter((b) => b.breachType === 'Resolution Breach').length,
          openEscalations: events.length, compliance: p.compliance, firstResponseCompliance: p.firstResponseCompliance, resolutionCompliance: p.resolutionCompliance, avgResponseMinutes: p.avgResponseMinutes, avgResolutionMinutes: p.avgResolutionMinutes,
        },
        breachesToday: breaches.filter((b) => b.detectedAt.slice(0, 10) === today()).length, breachesWeek: since(7), breachesMonth: since(30),
        dueSoon: dueSoon.slice(0, 6), activeClocks: [...open].sort((a, b) => b.consumption - a.consumption).slice(0, 6), critical: open.filter((c) => c.priority === 'Critical').slice(0, 6), escalations: events.slice(0, 6),
        customersWithBreaches: customers.filter((r) => r.breached > 0).slice(0, 6), servicesWithBreaches: services.filter((r) => r.breached > 0 && r.key !== 'none').slice(0, 6), trend,
        byCustomer: customers.slice(0, 8), byService: services.slice(0, 8), byPriority: this.store.breakdown('Priority', clocks), byTeam: this.store.breakdown('Service Team', clocks),
      };
    });
  }

  /** SRS 7.20 — number, type, effective date, valid time units. */
  private check(input: SlaUpsert): Error | null {
    if (!SLA_TYPES.includes(input.type)) return new Error('Every SLA must have a valid SLA type.');
    if (!input.validity.effectiveDate) return new Error('The effective date is required.');
    if (input.validity.expiryDate && input.validity.expiryDate < input.validity.effectiveDate) return new Error('The expiry date must be after the effective date.');
    if (!this.store.db.calendars.some((c) => c.id === input.serviceHours.calendarId)) return new Error('Every SLA must reference a valid service calendar.');
    for (const [p, t] of Object.entries(input.priorityTargets)) {
      if (t.response < 0 || t.resolution < 0 || !Number.isFinite(t.response) || !Number.isFinite(t.resolution)) return new Error(`${p} targets must be valid durations.`);
      if (t.response && t.resolution && t.resolution < t.response) return new Error(`${p} resolution target cannot be shorter than its response target.`);
    }
    if (input.customer.customerId && !this.store.db.reference.customers.some((c) => c.id === input.customer.customerId)) return new Error('Select a valid customer.');
    if (input.contract.amcId && this.store.db.reference.amcs.find((a) => a.id === input.contract.amcId)?.customerId !== input.customer.customerId) return new Error('The AMC must belong to the SLA customer.');
    return null;
  }

  private missingTargets(s: Sla): string | null {
    const missing = (['Critical', 'High', 'Medium', 'Low'] as const).filter((p) => !s.priorityTargets[p].response || !s.priorityTargets[p].resolution);
    return missing.length ? `SLA targets must be defined before activation — missing ${missing.join(', ')} targets.` : null;
  }
}

@Injectable()
export class MockSlaTargetApi extends SlaTargetApi {
  private readonly store = inject(MockSlaStore);

  list(slaId?: string): Observable<SlaTargetListItem[]> {
    const order = ['Critical', 'High', 'Medium', 'Low', 'All'];
    return query(this.store, () => this.store.db.targets.filter((t) => !slaId || t.slaId === slaId).map((t) => ({ ...t, slaNumber: this.store.sla(t.slaId)?.number ?? t.slaId, slaName: this.store.sla(t.slaId)?.name ?? '', calendarName: calendar(this.store.db, t.calendarId).name }))
      .sort((a, b) => a.slaNumber.localeCompare(b.slaNumber) || order.indexOf(a.priority) - order.indexOf(b.priority) || a.targetType.localeCompare(b.targetType)));
  }

  create(input: SlaTargetInput): Observable<void> {
    return mutate(() => {
      const error = this.check(input);
      if (error) return error;
      if (this.store.db.targets.some((t) => t.slaId === input.slaId && t.priority === input.priority && t.targetType === input.targetType)) return new Error('A target for this priority and type already exists — edit it instead.');
      const id = this.store.uid('TGT');
      this.store.db.targets.push({ ...input, id });
      this.syncBack(input);
      this.store.log('Target Added', 'Target', id, input.slaId, `${input.priority} ${input.targetType}: ${input.durationMinutes} min.`);
      return undefined;
    });
  }

  update(id: string, input: SlaTargetInput): Observable<void> {
    return mutate(() => {
      const current = this.store.db.targets.find((t) => t.id === id);
      if (!current) return new Error('Target was not found.');
      const error = this.check(input);
      if (error) return error;
      this.store.db.targets = this.store.db.targets.map((t) => (t.id === id ? { ...input, id } : t));
      this.syncBack(input);
      this.store.log('Target Modified', 'Target', id, input.slaId, `${input.priority} ${input.targetType} changed — running clocks keep their original targets.`, `${current.durationMinutes} min`, `${input.durationMinutes} min`);
      return undefined;
    });
  }

  private check(input: SlaTargetInput): Error | null {
    const s = this.store.sla(input.slaId);
    if (!s) return new Error('Select a valid SLA.');
    if (!EDITABLE_SLA_STATUSES.includes(slaStatus(s))) return new Error('Targets of expired or archived SLAs cannot be changed.');
    if (!(input.durationMinutes > 0)) return new Error('Target duration must be greater than zero with a valid time unit.');
    if (!this.store.db.calendars.some((c) => c.id === input.calendarId)) return new Error('Select a valid calendar.');
    if (!(input.warningPercent < input.escalationPercent && input.escalationPercent <= input.breachPercent)) return new Error('Thresholds must increase: warning < escalation ≤ breach.');
    return null;
  }

  /** Keeps the SLA definition's priority table in step with First Response / Resolution targets. */
  private syncBack(input: SlaTargetInput): void {
    if (input.priority === 'All' || (input.targetType !== 'First Response' && input.targetType !== 'Resolution')) return;
    const s = this.store.sla(input.slaId)!;
    const key = input.targetType === 'First Response' ? 'response' : 'resolution';
    this.store.replace({ ...s, priorityTargets: { ...s.priorityTargets, [input.priority]: { ...s.priorityTargets[input.priority], [key]: input.durationMinutes } } });
  }
}

@Injectable()
export class MockSlaCoverageApi extends SlaCoverageApi {
  private readonly store = inject(MockSlaStore);

  list(slaId?: string): Observable<SlaCoverageListItem[]> {
    return query(this.store, () => this.store.db.coverage.filter((c) => !slaId || c.slaId === slaId).map((c) => this.store.coverageItem(c)));
  }

  create(input: SlaCoverageInput): Observable<void> {
    return mutate(() => {
      const error = this.check(input);
      if (error) return error;
      const id = this.store.uid('SCV');
      this.store.db.coverage.push({ ...input, id });
      const action = input.level === 'Customer' ? 'Customer Added' : input.level === 'Site' ? 'Site Added' : input.level === 'Asset' ? 'Asset Added' : input.level.startsWith('Service') ? 'Service Added' : 'Coverage Changed';
      this.store.log(action, 'Coverage', id, input.slaId, `${input.level}-level coverage added.`, null, this.store.coverageItem({ ...input, id }).target);
      return undefined;
    });
  }

  update(id: string, input: SlaCoverageInput): Observable<void> {
    return mutate(() => {
      if (!this.store.db.coverage.some((c) => c.id === id)) return new Error('Coverage line was not found.');
      const error = this.check(input);
      if (error) return error;
      this.store.db.coverage = this.store.db.coverage.map((c) => (c.id === id ? { ...input, id } : c));
      this.store.log('Coverage Changed', 'Coverage', id, input.slaId, `${input.level}-level coverage updated.`);
      return undefined;
    });
  }

  private check(input: SlaCoverageInput): Error | null {
    const s = this.store.sla(input.slaId);
    if (!s) return new Error('Select a valid SLA.');
    const need: Record<string, keyof SlaCoverageInput> = { Contract: 'contractId', AMC: 'amcId', Site: 'siteId', Asset: 'assetId', 'Asset Category': 'assetCategory', Service: 'serviceId', 'Service Category': 'serviceCategory' };
    const field = need[input.level];
    if (field && !input[field]) return new Error(`Select the ${input.level.toLowerCase()} for this coverage line.`);
    if (s.customer.customerId) {
      const ref = this.store.db.reference;
      if (input.siteId && ref.sites.find((x) => x.id === input.siteId)?.customerId !== s.customer.customerId) return new Error('Coverage must respect the SLA customer scope — the site belongs to another customer.');
      if (input.assetId && ref.assets.find((x) => x.id === input.assetId)?.customerId !== s.customer.customerId) return new Error('The asset belongs to another customer.');
      if (input.customerId && input.customerId !== s.customer.customerId) return new Error('A customer-specific SLA cannot cover another customer.');
    }
    if (input.endDate && input.endDate < input.startDate) return new Error('End date must be after the start date.');
    return null;
  }
}

@Injectable()
export class MockSlaCalendarApi extends SlaCalendarApi {
  private readonly store = inject(MockSlaStore);

  list(): Observable<SlaCalendar[]> {
    return query(this.store, () => [...this.store.db.calendars]);
  }

  create(input: SlaCalendarInput): Observable<void> {
    return mutate(() => {
      const error = this.check(input, null);
      if (error) return error;
      this.store.db.calendars.push({ ...input, id: this.store.uid('CAL') });
      this.store.log('Calendar Changed', 'Calendar', input.name, null, `Calendar “${input.name}” created (${input.timeZone}).`);
      return undefined;
    });
  }

  update(id: string, input: SlaCalendarInput): Observable<void> {
    return mutate(() => {
      const error = this.check(input, id);
      if (error) return error;
      if (input.status === 'Inactive' && this.store.db.slas.some((s) => s.serviceHours.calendarId === id && LIVE_SLA_STATUSES.includes(slaStatus(s)))) return new Error('This calendar is used by active SLAs and cannot be deactivated.');
      this.store.db.calendars = this.store.db.calendars.map((c) => (c.id === id ? { ...input, id } : c));
      this.store.log('Calendar Changed', 'Calendar', id, null, `Calendar “${input.name}” updated — running clocks recalculate against the new working time.`);
      return undefined;
    });
  }

  holidays(): Observable<Holiday[]> {
    return query(this.store, () => [...this.store.db.holidays].sort((a, b) => a.date.localeCompare(b.date)));
  }

  createHoliday(input: HolidayInput): Observable<void> {
    return mutate(() => {
      if (!input.name.trim() || !input.date) return new Error('Holiday name and date are required.');
      if (this.store.db.holidays.some((h) => h.date === input.date && h.calendar === input.calendar)) return new Error('This holiday calendar already has an entry on that date.');
      this.store.db.holidays.push({ ...input, id: this.store.uid('HOL') });
      this.store.log('Calendar Changed', 'Calendar', input.calendar, null, `Holiday “${input.name}” (${input.date}) added to ${input.calendar}.`);
      return undefined;
    });
  }

  updateHoliday(id: string, input: HolidayInput): Observable<void> {
    return mutate(() => {
      if (!this.store.db.holidays.some((h) => h.id === id)) return new Error('Holiday was not found.');
      this.store.db.holidays = this.store.db.holidays.map((h) => (h.id === id ? { ...input, id } : h));
      this.store.log('Calendar Changed', 'Calendar', input.calendar, null, `Holiday “${input.name}” updated.`);
      return undefined;
    });
  }

  private check(input: SlaCalendarInput, id: string | null): Error | null {
    if (!input.name.trim()) return new Error('Calendar name is required.');
    if (this.store.db.calendars.some((c) => c.id !== id && norm(c.name) === norm(input.name))) return new Error('A calendar with this name already exists.');
    if (!input.days.some((d) => d.working)) return new Error('Select at least one working day.');
    if (input.days.some((d) => d.working && d.end <= d.start && d.end !== '24:00')) return new Error('End time must be after start time for every working day.');
    return null;
  }
}

@Injectable()
export class MockEscalationApi extends EscalationApi {
  private readonly store = inject(MockSlaStore);

  rules(slaId?: string): Observable<EscalationRuleListItem[]> {
    return query(this.store, () => this.store.db.rules.filter((r) => !slaId || r.slaId === slaId).map((r) => ({ ...r, slaNumber: this.store.sla(r.slaId)?.number ?? r.slaId, slaName: this.store.sla(r.slaId)?.name ?? '', levelName: ESCALATION_LEVELS[r.level - 1] ?? `Level ${r.level}`, triggered: this.store.db.events.filter((e) => e.ruleId === r.id).length }))
      .sort((a, b) => a.slaNumber.localeCompare(b.slaNumber) || a.level - b.level));
  }

  createRule(input: EscalationRuleInput): Observable<void> {
    return mutate(() => {
      const error = this.check(input);
      if (error) return error;
      const id = this.store.uid('ER');
      this.store.db.rules.push({ ...input, id });
      this.store.log('Escalation Added', 'Escalation', id, input.slaId, `Level ${input.level} at ${input.triggerPercent ?? input.triggerMinutes}${input.triggerPercent !== null ? '%' : ' min'} — ${input.action}.`);
      return undefined;
    });
  }

  updateRule(id: string, input: EscalationRuleInput): Observable<void> {
    return mutate(() => {
      if (!this.store.db.rules.some((r) => r.id === id)) return new Error('Rule was not found.');
      const error = this.check(input);
      if (error) return error;
      this.store.db.rules = this.store.db.rules.map((r) => (r.id === id ? { ...input, id } : r));
      this.store.log('Escalation Modified', 'Escalation', id, input.slaId, `Level ${input.level} rule updated.`);
      return undefined;
    });
  }

  events(slaId?: string): Observable<EscalationEventListItem[]> {
    return query(this.store, () => this.store.db.events.filter((e) => !slaId || e.slaId === slaId).map((e) => this.store.eventItem(e.id)).sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt)));
  }

  setEventStatus(id: string, status: 'Acknowledged' | 'Closed'): Observable<void> {
    return mutate(() => {
      const e = this.store.db.events.find((x) => x.id === id);
      if (!e) return new Error('Escalation was not found.');
      this.store.db.events = this.store.db.events.map((x) => (x.id === id ? { ...x, status } : x));
      this.store.log('Escalation Modified', 'Escalation', id, e.slaId, `Level ${e.level} escalation ${status.toLowerCase()}.`, e.status, status);
      return undefined;
    });
  }

  private check(input: EscalationRuleInput): Error | null {
    if (!this.store.sla(input.slaId)) return new Error('Select a valid SLA.');
    if (input.level < 1 || input.level > 5) return new Error('Escalation level must be between 1 and 5.');
    if (input.triggerPercent === null && input.triggerMinutes === null) return new Error('Enter a trigger percentage or trigger time.');
    if (input.triggerType === 'Before SLA Breach' && (input.triggerPercent ?? 0) >= 100) return new Error('“Before SLA Breach” rules must trigger below 100%.');
    if (input.triggerType === 'After SLA Breach' && input.triggerPercent !== null && input.triggerPercent <= 100) return new Error('“After SLA Breach” rules must trigger above 100%.');
    if (!input.recipient.trim()) return new Error('A recipient is required.');
    return null;
  }
}

@Injectable()
export class MockSlaMappingApi extends SlaMappingApi {
  private readonly store = inject(MockSlaStore);

  list(slaId?: string): Observable<SlaMappingListItem[]> {
    return query(this.store, () => this.store.db.mappings.filter((m) => !slaId || m.slaId === slaId).map((m) => this.store.mappingItem(m)).sort((a, b) => b.specificity - a.specificity || a.assignmentPriority - b.assignmentPriority));
  }

  create(input: SlaMappingInput): Observable<void> {
    return mutate(() => {
      const error = this.check(input, null);
      if (error) return error;
      const id = this.store.uid('MAP');
      this.store.db.mappings.push({ ...input, id });
      this.store.log('Mapping Changed', 'Mapping', id, input.slaId, `${input.level} → ${this.store.sla(input.slaId)?.number} mapping added (assignment priority ${input.assignmentPriority}).`);
      return undefined;
    });
  }

  update(id: string, input: SlaMappingInput): Observable<void> {
    return mutate(() => {
      const error = this.check(input, id);
      if (error) return error;
      this.store.db.mappings = this.store.db.mappings.map((m) => (m.id === id ? { ...input, id } : m));
      this.store.log('Mapping Changed', 'Mapping', id, input.slaId, `${input.level} mapping updated.`);
      return undefined;
    });
  }

  resolve(request: SlaRequest): Observable<SlaSelection> {
    return query(this.store, () => resolveSla(this.store.db, request));
  }

  private check(input: SlaMappingInput, id: string | null): Error | null {
    const s = this.store.sla(input.slaId);
    if (!s) return new Error('Select a valid SLA.');
    const need: Record<string, keyof SlaMappingInput> = { Customer: 'customerId', Contract: 'contractId', AMC: 'amcId', Site: 'siteId', Asset: 'assetId', Service: 'serviceId', 'Service Category': 'serviceCategory', Priority: 'priority' };
    if (!input[need[input.level]]) return new Error(`Select the ${input.level.toLowerCase()} for a ${input.level} → SLA mapping.`);
    if (s.customer.customerId && input.customerId && input.customerId !== s.customer.customerId) return new Error('A customer-specific SLA cannot be mapped to another customer.');
    const dup = this.store.db.mappings.find((m) => m.id !== id && m.status === 'Active' && input.status === 'Active' && m.slaId !== input.slaId && m.assignmentPriority === input.assignmentPriority &&
      (['customerId', 'contractId', 'amcId', 'siteId', 'assetId', 'serviceId', 'serviceCategory', 'priority'] as const).every((f) => m[f] === input[f]));
    if (dup) return new Error(`Assignment conflict: ${this.store.sla(dup.slaId)?.number} already has the same scope and assignment priority.`);
    return null;
  }
}

@Injectable()
export class MockSlaClockApi extends SlaClockApi {
  private readonly store = inject(MockSlaStore);

  list(filter: { slaId?: string; open?: boolean } = {}): Observable<SlaClockListItem[]> {
    return query(this.store, () => this.store.db.clocks.filter((c) => (!filter.slaId || c.slaId === filter.slaId) && (!filter.open || (!c.stoppedAt && c.status !== 'Cancelled'))).map((c) => this.store.clockItem(c)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
  }

  start(input: StartClockInput): Observable<SlaClockListItem[]> {
    return mutate(() => {
      const sel = resolveSla(this.store.db, input.request);
      if (!sel.slaId) return new Error(`SLA validation failed: ${sel.result} — ${sel.summary}`);
      const s = this.store.sla(sel.slaId)!;
      const n = this.store.db.clocks.length;
      const number = `${input.transactionType === 'Service Request' ? 'SR' : 'WO'}-T${pad(n + 1, 4)}`;
      const site = this.store.db.reference.sites.find((x) => x.id === input.request.siteId);
      const types: TargetType[] = input.transactionType === 'Service Request' ? ['First Response', 'Resolution'] : ['On-Site Arrival', 'Resolution'];
      const created: SlaClock[] = [];
      for (const type of types) {
        const t = targetFor(this.store.db, s.id, input.request.priority, type);
        if (!t) continue;
        const clock: SlaClock = {
          id: this.store.uid('CLK'), number: `CLK-${pad(this.store.db.clocks.length + 1, 5)}`, slaId: s.id, slaVersion: s.version, selection: sel.summary, transactionType: input.transactionType, transactionId: number, transactionNumber: number, subject: input.subject,
          customerId: input.request.customerId, siteId: input.request.siteId ?? '', assetId: input.request.assetId, serviceId: input.request.serviceId, priority: input.request.priority, targetType: type, targetMinutes: t.durationMinutes, calendarId: t.calendarId,
          warningPercent: t.warningPercent, escalationPercent: t.escalationPercent, startEvent: t.startEvent, stopEvent: t.stopEvent, startedAt: this.store.now(), stoppedAt: null, status: 'Running', pauses: [], team: 'Service Desk', technician: null, region: site?.region ?? 'Central', notes: [],
        };
        this.store.db.clocks.push(clock);
        created.push(clock);
      }
      this.store.log('SLA Assigned', 'Clock', number, s.id, `${s.number} recorded against ${number} — ${sel.applicability}.`, null, s.number, number);
      this.store.log('SLA Clock Started', 'Clock', number, s.id, `${created.map((c) => `${c.targetType} ${c.targetMinutes} min`).join(' · ')} on ${calendar(this.store.db, s.serviceHours.calendarId).name}.`, null, null, number);
      return created.map((c) => this.store.clockItem(c));
    });
  }

  pause(id: string, reason: PauseReason, notes: string): Observable<void> {
    return this.change(id, (c) => {
      if (c.status !== 'Running') return new Error('Only running clocks can be paused.');
      return { patch: { status: 'Paused', pauses: [...c.pauses, { id: this.store.uid('PAU'), reason, requestedBy: this.store.user, approvedBy: 'Khalid Al-Mutairi', startedAt: this.store.now(), endedAt: null, resumeReason: '', notes }] }, action: 'SLA Paused', comment: `${reason}${notes ? ` — ${notes}` : ''}. Pause time is excluded from SLA consumption.` };
    });
  }

  resume(id: string, reason: string): Observable<void> {
    return this.change(id, (c) => {
      if (c.status !== 'Paused') return new Error('Only paused clocks can be resumed.');
      const pauses = c.pauses.map((p) => (p.endedAt ? p : { ...p, endedAt: this.store.now(), resumeReason: reason }));
      return { patch: { status: 'Running', pauses }, action: 'SLA Resumed', comment: `${reason || 'Pause condition cleared'} — clock continues.` };
    });
  }

  stop(id: string): Observable<void> {
    return this.change(id, (c) => {
      if (c.stoppedAt || c.status === 'Cancelled') return new Error('This clock has already stopped.');
      const pauses = c.pauses.map((p) => (p.endedAt ? p : { ...p, endedAt: this.store.now(), resumeReason: 'Clock stopped' }));
      const m = clockMetrics(this.store.db, { ...c, pauses, stoppedAt: this.store.now() });
      const met = m.consumption < 100;
      return { patch: { stoppedAt: this.store.now(), pauses, status: met ? 'Met' : 'Breached' }, action: met ? 'SLA Met' : 'SLA Breached', comment: `${c.stopEvent} — ${Math.round(m.elapsed)} of ${c.targetMinutes} min (${m.consumption}%).`, after: (clock) => {
        const b = this.store.db.breaches.find((x) => x.clockId === clock.id);
        if (b && !b.actualAt) this.store.db.breaches = this.store.db.breaches.map((x) => (x.id === b.id ? { ...x, actualAt: clock.stoppedAt, actualMinutes: Math.round(m.elapsed) } : x));
        this.store.db.events = this.store.db.events.map((e) => (e.clockId === clock.id && e.status === 'Open' ? { ...e, status: 'Closed' } : e));
      } };
    });
  }

  escalate(id: string): Observable<void> {
    return mutate(() => {
      const c = this.store.db.clocks.find((x) => x.id === id);
      if (!c || c.stoppedAt) return new Error('Only running clocks can be escalated.');
      const level = Math.min(5, Math.max(0, ...this.store.db.events.filter((e) => e.clockId === id).map((e) => e.level)) + 1);
      const m = clockMetrics(this.store.db, c);
      this.store.db.events.push({ id: this.store.uid('ESC'), ruleId: 'MANUAL', clockId: id, slaId: c.slaId, level, triggeredAt: this.store.now(), consumption: m.consumption, recipient: ESCALATION_LEVELS[level - 1].split(' — ')[1], channel: 'Email', action: 'Manual escalation', status: 'Open' });
      this.store.log('Escalation Triggered', 'Escalation', id, c.slaId, `Manual escalation to ${ESCALATION_LEVELS[level - 1]} at ${m.consumption}%.`, null, `Level ${level}`, c.transactionNumber);
      return undefined;
    });
  }

  reassign(id: string, team: string, technician: string | null): Observable<void> {
    return this.change(id, (c) => ({ patch: { team, technician }, action: 'SLA Assigned', comment: `${c.transactionNumber} reassigned to ${technician ?? team}.` }));
  }

  addNote(id: string, text: string): Observable<void> {
    return this.change(id, (c) => (text.trim() ? { patch: { notes: [...c.notes, { at: this.store.now(), by: this.store.user, text }] }, action: null, comment: '' } : new Error('Enter a note.')));
  }

  private change(id: string, work: (c: SlaClock) => { patch: Partial<SlaClock>; action: SlaHistoryEvent['action'] | null; comment: string; after?: (c: SlaClock) => void } | Error): Observable<void> {
    return mutate(() => {
      const c = this.store.db.clocks.find((x) => x.id === id);
      if (!c) return new Error('Clock was not found.');
      const result = work(c);
      if (result instanceof Error) return result;
      const next = { ...c, ...result.patch };
      this.store.db.clocks = this.store.db.clocks.map((x) => (x.id === id ? next : x));
      result.after?.(next);
      if (result.action) this.store.log(result.action, 'Clock', id, c.slaId, `${c.transactionNumber} · ${c.targetType}: ${result.comment}`, c.status, next.status, c.transactionNumber);
      return undefined;
    });
  }
}

@Injectable()
export class MockSlaBreachApi extends SlaBreachApi {
  private readonly store = inject(MockSlaStore);

  list(slaId?: string): Observable<SlaBreachListItem[]> {
    return query(this.store, () => this.store.db.breaches.filter((b) => !slaId || b.slaId === slaId).map((b) => this.store.breachItem(b.id)).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)));
  }

  update(id: string, patch: BreachPatch): Observable<void> {
    return this.change(id, (b) => {
      if (['Closed', 'Waived'].includes(b.status)) return new Error('Closed or waived breaches cannot be changed.');
      const status = patch.correctiveAction?.trim() ? 'Corrective Action' : patch.rootCause?.trim() ? 'Root Cause Identified' : patch.owner && b.status === 'Detected' ? 'Under Review' : b.status;
      return { patch: { ...patch, status }, comment: patch.correctiveAction ? 'Corrective action recorded.' : patch.rootCause ? 'Root cause recorded.' : patch.owner ? `Owner assigned: ${patch.owner}.` : 'Breach updated.' };
    });
  }

  acknowledge(id: string): Observable<void> {
    return this.change(id, (b) => (['Detected', 'Under Review'].includes(b.status) ? { patch: { status: 'Acknowledged', owner: b.owner ?? this.store.user }, comment: 'Breach acknowledged.' } : new Error('Only detected or under-review breaches can be acknowledged.')));
  }

  requestWaiver(id: string, reason: string): Observable<void> {
    return this.change(id, (b) => {
      if (['Closed', 'Waived'].includes(b.status)) return new Error('This breach is already closed.');
      if (b.waiver && !b.waiver.approvedBy) return new Error('A waiver request is already pending.');
      if (!reason.trim()) return new Error('A waiver reason is required.');
      return { patch: { waiver: { requestedBy: this.store.user, reason, approvedBy: null } }, comment: `Waiver requested: ${reason}` };
    });
  }

  approveWaiver(id: string, approve: boolean): Observable<void> {
    return this.change(id, (b) => {
      if (!b.waiver || b.waiver.approvedBy) return new Error('There is no pending waiver request.');
      const role = this.store.db.reference.currentUser.role;
      if (!SLA_RULES.waiverApproverRoles.includes(role) && role !== 'Service Manager') return new Error('Breach waivers require appropriate authorization.');
      return approve
        ? { patch: { status: 'Waived', waiver: { ...b.waiver, approvedBy: this.store.user }, penalty: 0 }, comment: 'Waiver approved — penalty / service credit removed.', action: 'Breach Waived' as const }
        : { patch: { waiver: null }, comment: 'Waiver rejected.' };
    });
  }

  close(id: string): Observable<void> {
    return this.change(id, (b) => {
      if (['Closed', 'Waived'].includes(b.status)) return new Error('This breach is already closed.');
      if (!b.reason || !b.rootCause.trim()) return new Error('Record the breach reason and root cause before closing.');
      return { patch: { status: 'Closed' }, comment: 'Breach closed.' };
    });
  }

  private change(id: string, work: (b: SlaBreachListItem) => { patch: Partial<SlaBreachListItem>; comment: string; action?: 'Breach Waived' } | Error): Observable<void> {
    return mutate(() => {
      const b = this.store.db.breaches.find((x) => x.id === id);
      if (!b) return new Error('Breach was not found.');
      const result = work(this.store.breachItem(id));
      if (result instanceof Error) return result;
      const { reason, owner, rootCause, correctiveAction, status, waiver, penalty } = result.patch;
      const next = { ...b, ...(reason !== undefined ? { reason } : {}), ...(owner !== undefined ? { owner } : {}), ...(rootCause !== undefined ? { rootCause } : {}), ...(correctiveAction !== undefined ? { correctiveAction } : {}), ...(status ? { status } : {}), ...(waiver !== undefined ? { waiver } : {}), ...(penalty !== undefined ? { penalty } : {}) };
      this.store.db.breaches = this.store.db.breaches.map((x) => (x.id === id ? next : x));
      this.store.log(result.action ?? 'Breach Updated', 'Breach', id, b.slaId, `${b.number}: ${result.comment}`, b.status, next.status);
      return undefined;
    });
  }
}

@Injectable()
export class MockSlaPerformanceApi extends SlaPerformanceApi {
  private readonly store = inject(MockSlaStore);

  summary(slaId?: string): Observable<SlaPerformance> {
    return query(this.store, () => this.store.performance(this.store.db.clocks.filter((c) => !slaId || c.slaId === slaId)));
  }

  breakdown(dimension: PerformanceDimension, period: { from: string; to: string }, slaId?: string): Observable<PerformanceRow[]> {
    return query(this.store, () => this.store.breakdown(dimension, this.store.db.clocks.filter((c) => (!slaId || c.slaId === slaId) && (!period.from || c.startedAt.slice(0, 10) >= period.from) && (!period.to || c.startedAt.slice(0, 10) <= period.to))));
  }

  trend(granularity: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly', slaId?: string): Observable<TrendPoint[]> {
    return query(this.store, () => {
      const now = Date.now();
      const spec = { Daily: { n: 14, days: 1 }, Weekly: { n: 12, days: 7 }, Monthly: { n: 6, days: 30 }, Quarterly: { n: 4, days: 91 } }[granularity];
      const clocks = this.store.db.clocks.filter((c) => !slaId || c.slaId === slaId);
      const points: TrendPoint[] = [];
      for (let i = spec.n - 1; i >= 0; i--) {
        const from = now - (i + 1) * spec.days * 86_400_000;
        const to = now - i * spec.days * 86_400_000;
        const bucket = clocks.filter((c) => { const t = new Date(c.stoppedAt ?? c.startedAt).getTime(); return t >= from && t < to; });
        const p = this.store.performance(bucket);
        points.push({ label: new Date(to).toISOString().slice(granularity === 'Monthly' || granularity === 'Quarterly' ? 0 : 5, granularity === 'Monthly' || granularity === 'Quarterly' ? 7 : 10), compliance: p.compliance, avgResponseMinutes: p.avgResponseMinutes, avgResolutionMinutes: p.avgResolutionMinutes, breaches: p.breached, escalations: p.escalations });
      }
      return points;
    });
  }
}

@Injectable()
export class MockSlaHistoryApi extends SlaHistoryApi {
  private readonly store = inject(MockSlaStore);

  list(filter: { slaId?: string; entity?: SlaHistoryEntity } = {}): Observable<SlaHistoryEvent[]> {
    return query(this.store, () => this.store.db.history.filter((h) => (!filter.slaId || h.slaId === filter.slaId) && (!filter.entity || h.entity === filter.entity)));
  }
}

@Injectable()
export class MockSlaReferenceApi extends SlaReferenceApi {
  private readonly store = inject(MockSlaStore);

  get(): Observable<SlaReferenceData> {
    return defer(() => respond(this.store.db.reference, 150));
  }

  calendars(): Observable<SlaCalendar[]> {
    return defer(() => respond([...this.store.db.calendars], 100));
  }

  slaOptions(): Observable<{ id: string; number: string; name: string; status: string }[]> {
    return defer(() => respond(this.store.db.slas.map((s) => ({ id: s.id, number: s.number, name: s.name, status: slaStatus(s) })), 100));
  }
}
