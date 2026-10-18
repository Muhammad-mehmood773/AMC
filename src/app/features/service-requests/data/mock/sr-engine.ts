import type { SlaDatabase } from '../../../sla/data/mock/sla-engine';
import { calendar, resolveSla } from '../../../sla/data/mock/sla-engine';
import { addBusinessMinutes, elapsedMinutes } from '../../../sla/data/sla-time';
import type { DuplicateMatch, SrHistoryEvent, Suggestion, ValidationGroup } from '../../models/operations.model';
import type { SrReferenceData } from '../../models/reference.model';
import type { ClockView, Coverage, CoverageResult, CoverageStep, Priority, RequestDraft, RequestListItem, ServiceRequest, SlaSnapshot, SlaState } from '../../models/request.model';
import { OPEN_STATUSES } from '../../models/request.model';
import { ASSET_CATEGORY_SERVICE, CLASSIFICATION_RULES, PRIORITY_BANDS, PRIORITY_MATRIX, ROUTING_RULES, SR_RULES, TEAM_SKILLS } from '../sr.config';

export interface SrDatabase {
  reference: SrReferenceData;
  /** SLA Management database — read-only, used for SLA selection and business-hours calculation. */
  sla: SlaDatabase;
  requests: ServiceRequest[];
  history: SrHistoryEvent[];
}

export type SrLog = (e: Omit<SrHistoryEvent, 'id'>) => void;

const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);

/** SRS 9.8 — keyword rules over subject, description and asset category. */
export function classifyText(db: SrDatabase, text: string, assetId: string | null) {
  const t = ` ${text.toLowerCase()} `;
  const rule = CLASSIFICATION_RULES.find((r) => r.keywords.some((k) => t.includes(k)));
  const asset = db.reference.assets.find((a) => a.id === assetId);
  const assetCategory = asset ? ASSET_CATEGORY_SERVICE[asset.category] : undefined;
  return { rule, category: rule?.category ?? assetCategory ?? null };
}

/** SRS 9.11 — urgency × impact, affected users, asset criticality, customer priority, contractual commitment. */
export function priorityFor(db: SrDatabase, input: { urgency: string; businessImpact: string; affectedUsers: number; assetId: string | null; customerId: string; coverage: Coverage | null; serviceCategory: string }): { priority: Priority; score: number; factors: string[] } {
  let score = PRIORITY_MATRIX[input.urgency]?.[input.businessImpact] ?? 3;
  const factors = [`Urgency ${input.urgency} × impact ${input.businessImpact} = ${score}`];
  if (input.affectedUsers >= 50) {
    score += 2;
    factors.push(`${input.affectedUsers} affected users (+2)`);
  } else if (input.affectedUsers >= 10) {
    score += 1;
    factors.push(`${input.affectedUsers} affected users (+1)`);
  }
  const asset = db.reference.assets.find((a) => a.id === input.assetId);
  if (asset?.criticality === 'Critical') {
    score += 2;
    factors.push('Critical asset (+2)');
  } else if (asset?.criticality === 'High') {
    score += 1;
    factors.push('High-criticality asset (+1)');
  }
  const customer = db.reference.customers.find((c) => c.id === input.customerId);
  if (customer?.segment === 'Strategic') {
    score += 1;
    factors.push('Strategic customer (+1)');
  }
  if (input.coverage?.result === 'Covered' && input.coverage.amcId) {
    score += 1;
    factors.push('Contractual commitment — AMC (+1)');
  }
  if (input.serviceCategory === 'Fire & Safety Services' || input.serviceCategory === 'Elevator Services') {
    score += 1;
    factors.push('Life-safety service (+1)');
  }
  const priority = PRIORITY_BANDS.find(([min]) => score >= min)![1];
  return { priority, score, factors };
}

/** SRS 9.10 — contract / AMC / warranty / entitlement validation. */
export function coverageFor(db: SrDatabase, customerId: string, siteId: string | null, assetId: string | null, serviceCategory: string, type: string, priority: Priority = 'Medium', date = today()): Coverage {
  const confirmNeeded = (result: CoverageResult) => SR_RULES.confirmationRequiredFor.includes(priority) || (SR_RULES.confirmationRequiredForCovered && (result === 'Covered' || result === 'Partially Covered'));
  const steps: CoverageStep[] = [];
  const ref = db.reference;
  const asset = ref.assets.find((a) => a.id === assetId);
  const amcs = ref.amcs.filter((a) => a.customerId === customerId && (assetId ? a.assetIds.includes(assetId) : !!siteId && a.siteIds.includes(siteId)));
  const live = amcs.find((a) => ['Active', 'Expiring Soon'].includes(a.status) && a.startDate <= date && a.endDate >= date);
  const expired = amcs.find((a) => a.endDate < date || ['Expired', 'Terminated', 'Renewed'].includes(a.status));
  const warranty = asset && asset.warrantyStatus !== 'No Warranty' ? { status: asset.warrantyEnd && asset.warrantyEnd >= date ? 'Active' : 'Expired', endDate: asset.warrantyEnd, provider: asset.warrantyProvider } : null;
  const base = { contractId: null as string | null, amcId: null as string | null, warranty, validatedAt: new Date().toISOString() };
  if (live) {
    const inScope = !live.serviceCategories.length || live.serviceCategories.includes(serviceCategory) || serviceCategory === 'Preventive Maintenance';
    steps.push({ step: 'Active AMC', result: 'pass', detail: `${live.number} valid until ${live.endDate}.` });
    steps.push({ step: 'Asset / Site in scope', result: 'pass', detail: assetId ? 'Asset is covered by the AMC.' : 'Site is covered by the AMC.' });
    steps.push({ step: 'Covered service', result: inScope ? 'pass' : 'warn', detail: inScope ? `${serviceCategory} is in the AMC scope.` : `${serviceCategory} is outside the AMC service scope.` });
    steps.push({ step: 'Coverage period', result: 'pass', detail: `${live.startDate} – ${live.endDate}.` });
    const result: CoverageResult = inScope ? 'Covered' : 'Partially Covered';
    return { ...base, result, contractId: live.contractId, amcId: live.id, entitlement: `AMC ${live.number}`, coveredService: inScope ? serviceCategory : 'Labour covered; out-of-scope service chargeable', chargeable: !inScope, requiresCustomerConfirmation: confirmNeeded(result), approval: inScope ? 'Not Required' : 'Pending', steps };
  }
  steps.push({ step: 'Active AMC', result: expired ? 'fail' : 'na', detail: expired ? `${expired.number} ended ${expired.endDate} — expired coverage is never treated as active.` : 'No AMC covers this asset / site.' });
  if (warranty?.status === 'Active' && ['Repair Request', 'Incident / Breakdown', 'Warranty Request', 'Maintenance Request'].includes(type)) {
    steps.push({ step: 'Warranty', result: 'pass', detail: `${warranty.provider} warranty until ${warranty.endDate}.` });
    return { ...base, result: 'Covered', entitlement: `Warranty — ${warranty.provider}`, coveredService: 'Warranty repair', chargeable: false, requiresCustomerConfirmation: confirmNeeded('Covered'), approval: 'Not Required', steps };
  }
  steps.push({ step: 'Warranty', result: warranty ? 'fail' : 'na', detail: warranty ? `Warranty expired ${warranty.endDate}.` : 'No warranty on record.' });
  steps.push({ step: 'Service entitlement', result: 'fail', detail: 'No customer- or asset-specific entitlement applies.' });
  const result: CoverageResult = expired || warranty?.status === 'Expired' ? 'Expired Coverage' : 'Not Covered';
  return { ...base, result, entitlement: '', coveredService: '', chargeable: true, requiresCustomerConfirmation: confirmNeeded(result), approval: 'Pending', steps };
}

/** SRS 9.11 — applicable SLA via the SLA Management selection engine. */
export function slaFor(db: SrDatabase, r: { customerId: string; siteId: string | null; assetId: string | null; priority: Priority; coverage: Coverage; serviceId: string | null; type: string; date: string }): SlaSnapshot {
  const sel = resolveSla(db.sla, { customerId: r.customerId, contractId: r.coverage.contractId, amcId: r.coverage.amcId, siteId: r.siteId, assetId: r.assetId, serviceId: r.serviceId, priority: r.priority, requestType: r.type, date: r.date });
  const sla = db.sla.slas.find((s) => s.id === sel.slaId);
  return { slaId: sel.slaId, slaNumber: sel.slaNumber, slaName: sla?.name ?? null, applicability: sel.applicability, calendarId: sla?.serviceHours.calendarId ?? null, responseMinutes: sel.responseMinutes, resolutionMinutes: sel.resolutionMinutes, respondedAt: null, resolvedAt: null };
}

/** SRS 9.12 — category routing, skill, region and workload-based technician. */
export function route(db: SrDatabase, serviceCategory: string, siteId: string | null, excludeId?: string) {
  const rule = ROUTING_RULES.find((r) => r.category === serviceCategory) ?? ROUTING_RULES.find((r) => r.category === 'Inspection & Compliance')!;
  const region = db.reference.sites.find((s) => s.id === siteId)?.region ?? '';
  const load = (name: string) => db.requests.filter((x) => x.id !== excludeId && x.assignment.technician === name && OPEN_STATUSES.includes(x.status)).length;
  const candidates = db.reference.technicians.filter((t) => t.skills.includes(rule.skill) && t.region === region).sort((a, b) => load(a.name) - load(b.name));
  return { team: rule.team, skill: rule.skill, method: rule.method, region, technician: candidates[0]?.name ?? null, load: candidates[0] ? load(candidates[0].name) : 0 };
}

export function suggest(db: SrDatabase, d: RequestDraft): Suggestion {
  const { rule, category } = classifyText(db, `${d.subject} ${d.description}`, d.assetId);
  const serviceCategory = d.serviceCategory || category || 'Inspection & Compliance';
  const type = rule?.type ?? null;
  const coverage = coverageFor(db, d.customer.customerId, d.location.siteId || null, d.assetId, serviceCategory, d.type);
  const urgency = d.classification.urgency || rule?.urgency || 'Medium';
  const p = priorityFor(db, { urgency, businessImpact: d.classification.businessImpact || 'Medium', affectedUsers: d.classification.affectedUsers, assetId: d.assetId, customerId: d.customer.customerId, coverage, serviceCategory });
  const priority = d.priority ?? p.priority;
  const service = db.reference.services.find((s) => s.category === serviceCategory && /Corrective|Breakdown|Repair|Emergency/.test(s.type)) ?? db.reference.services.find((s) => s.category === serviceCategory) ?? null;
  const sla = d.customer.customerId ? slaFor(db, { customerId: d.customer.customerId, siteId: d.location.siteId || null, assetId: d.assetId, priority, coverage, serviceId: d.classification.requestedServiceId ?? service?.id ?? null, type: d.type, date: new Date().toISOString() }) : null;
  const r = route(db, serviceCategory, d.location.siteId || null);
  return {
    type, serviceCategory, subcategory: rule?.subcategory ?? null, problemCategory: rule?.problemCategory ?? null, requiredSkill: r.skill, team: r.team, technician: r.technician, serviceId: service?.id ?? null,
    priority: p.priority, priorityScore: p.score, priorityFactors: p.factors, coverage, slaId: sla?.slaId ?? null, slaNumber: sla?.slaNumber ?? null, slaName: sla?.slaName ?? null, responseMinutes: sla?.responseMinutes ?? null, resolutionMinutes: sla?.resolutionMinutes ?? null,
    rule: rule ? `${rule.id}: keywords ${rule.keywords.slice(0, 3).join(', ')}` : category ? 'Asset category' : null,
  };
}

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));

/** SRS 9.20 — duplicate detection (never deletes). */
export function findDuplicates(db: SrDatabase, d: Pick<RequestDraft, 'customer' | 'location' | 'assetId' | 'serviceCategory' | 'subject' | 'description'>, excludeId?: string): DuplicateMatch[] {
  const since = Date.now() - SR_RULES.duplicateWindowDays * DAY;
  const words = tokens(`${d.subject} ${d.description}`);
  return db.requests
    .filter((r) => r.id !== excludeId && r.customer.customerId === d.customer.customerId && OPEN_STATUSES.includes(r.status) && new Date(r.createdAt).getTime() >= since)
    .map((r) => {
      const reasons: string[] = ['Same customer', 'Open request', 'Recent'];
      let score = 20;
      if (r.location.siteId === d.location.siteId) { score += 20; reasons.push('Same site'); }
      if (d.assetId && r.assetId === d.assetId) { score += 30; reasons.push('Same asset'); }
      if (d.serviceCategory && r.serviceCategory === d.serviceCategory) { score += 10; reasons.push('Same service category'); }
      const other = tokens(`${r.subject} ${r.description}`);
      const inter = [...words].filter((w) => other.has(w)).length;
      const sim = words.size && other.size ? inter / Math.min(words.size, other.size) : 0;
      if (sim >= 0.3) { score += Math.round(sim * 30); reasons.push(`Similar description (${Math.round(sim * 100)}%)`); }
      return { id: r.id, number: r.number, subject: r.subject, status: r.status, createdAt: r.createdAt, score: Math.min(100, score), reasons };
    })
    .filter((m) => m.score >= SR_RULES.duplicateThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Business-hours clock with approved pauses excluded (SRS 9.21). */
export function clockFor(db: SrDatabase, r: ServiceRequest, kind: 'response' | 'resolution', now = Date.now()): ClockView {
  const target = kind === 'response' ? r.sla.responseMinutes : r.sla.resolutionMinutes;
  if (!r.sla.slaId || !target || !r.sla.calendarId) return { targetMinutes: null, elapsedMinutes: 0, remainingMinutes: null, dueAt: null, consumption: 0, state: 'No SLA' };
  const cal = calendar(db.sla, r.sla.calendarId);
  const stoppedAt = kind === 'response' ? r.sla.respondedAt : r.sla.resolvedAt ?? (['Cancelled', 'Rejected'].includes(r.status) ? r.cancellation?.at ?? r.updatedAt : null);
  const pauses = kind === 'resolution' ? r.holds.filter((h) => h.pausesSla).map((h, i) => ({ id: String(i), reason: 'Waiting for Customer' as const, requestedBy: h.responsible, approvedBy: '', startedAt: h.startedAt, endedAt: h.endedAt, resumeReason: '', notes: '' })) : [];
  const { elapsed, paused } = elapsedMinutes(cal, db.sla.holidays, r.createdAt, stoppedAt, pauses, now);
  const consumption = Math.round((elapsed / target) * 1000) / 10;
  const dueAt = new Date(addBusinessMinutes(cal, db.sla.holidays, r.createdAt, target + paused)).toISOString();
  const onHold = kind === 'resolution' && r.holds.some((h) => !h.endedAt && h.pausesSla);
  const state: SlaState = stoppedAt ? (consumption <= 100 ? 'Met' : 'Breached') : consumption >= 100 ? 'Breached' : onHold ? 'Paused' : consumption >= SR_RULES.atRiskPercent ? 'At Risk' : 'On Track';
  return { targetMinutes: target, elapsedMinutes: Math.round(elapsed), remainingMinutes: Math.round(target - elapsed), dueAt, consumption, state };
}

export function toItem(db: SrDatabase, r: ServiceRequest, now = Date.now()): RequestListItem {
  const ref = db.reference;
  const customer = ref.customers.find((c) => c.id === r.customer.customerId);
  const site = ref.sites.find((s) => s.id === r.location.siteId);
  const asset = ref.assets.find((a) => a.id === r.assetId);
  const response = clockFor(db, r, 'response', now);
  const resolution = clockFor(db, r, 'resolution', now);
  const states = [response.state, resolution.state];
  const slaState: SlaState = states.includes('Breached') ? 'Breached' : !OPEN_STATUSES.includes(r.status) ? (resolution.state === 'No SLA' ? 'No SLA' : 'Met') : resolution.state === 'Paused' ? 'Paused' : states.includes('At Risk') ? 'At Risk' : resolution.state === 'No SLA' ? 'No SLA' : 'On Track';
  const labourMinutes = r.workOrders.reduce((s, w) => s + w.labourMinutes, 0) || r.resolution?.labourMinutes || 0;
  const labour = Math.round((labourMinutes / 60) * SR_RULES.labourRatePerHour);
  const parts = r.workOrders.reduce((s, w) => s + w.parts.reduce((a, p) => a + p.quantity * p.unitCost, 0), 0);
  const travel = r.workOrders.reduce((s, w) => s + w.travelCost, 0);
  return {
    ...r, customerName: customer?.name ?? r.customer.customerId, customerStatus: customer?.status ?? '', siteName: site?.name ?? '', region: site?.region ?? '', assetName: asset ? `${asset.id} · ${asset.name}` : null,
    contractNumber: ref.contracts.find((c) => c.id === r.coverage.contractId)?.number ?? null, amcNumber: ref.amcs.find((a) => a.id === r.coverage.amcId)?.number ?? null,
    ageHours: Math.round((now - new Date(r.createdAt).getTime()) / 3_600_000), response, resolutionClock: resolution, slaState, dueAt: !r.sla.respondedAt ? response.dueAt : resolution.dueAt,
    onHold: r.holds.find((h) => !h.endedAt) ?? null, escalated: r.escalation.level > 0 && OPEN_STATUSES.includes(r.status), cost: { labour, parts, travel, total: labour + parts + travel },
  };
}

/** SRS 9.24 — validation groups. */
export function validation(db: SrDatabase, r: ServiceRequest): ValidationGroup[] {
  const ref = db.reference;
  const c = ref.customers.find((x) => x.id === r.customer.customerId);
  const site = ref.sites.find((s) => s.id === r.location.siteId);
  const asset = ref.assets.find((a) => a.id === r.assetId);
  const item = toItem(db, r);
  const tech = ref.technicians.find((t) => t.name === r.assignment.technician);
  const skill = r.classification.requiredSkill;
  const v = (check: string, ok: boolean | null, pass: string, fail: string, warn = false) => ({ check, result: (ok === null ? 'na' : ok ? 'pass' : warn ? 'warn' : 'fail') as 'pass' | 'fail' | 'warn' | 'na', detail: ok === null ? 'Not applicable.' : ok ? pass : fail });
  const woOpen = r.workOrders.filter((w) => !['Completed', 'Cancelled'].includes(w.status));
  const needConfirm = closureNeedsConfirmation(r);
  return [
    { group: 'Customer', checks: [v('Customer required', !!c, c?.name ?? '', 'Customer missing.'), v('Customer active', c?.status === 'Active', 'Active.', `Customer is ${c?.status ?? 'unknown'}.`, true), v('Contact valid', !!(r.customer.phone || r.customer.email), `${r.customer.contactName} · ${r.customer.phone || r.customer.email}`, 'No contact phone or email.', true), v('Site belongs to customer', !!site && site.customerId === r.customer.customerId, site?.name ?? '', 'Site does not belong to the customer.')] },
    { group: 'Service', checks: [v('Request type required', !!r.type, r.type, 'Missing.'), v('Category required', !!r.serviceCategory, `${r.serviceCategory} / ${r.subcategory}`, 'Missing.'), v('Description required', r.description.trim().length >= 15, 'Sufficient detail.', 'Description is too short.'), v('Requested service supported', ref.serviceCategories.includes(r.serviceCategory), 'Supported by the service catalog.', 'Category not in the catalog.', true)] },
    { group: 'Asset', checks: [v('Asset belongs to selected site', r.assetId ? asset?.siteId === r.location.siteId : null, asset?.name ?? '', 'Asset is not at the site.'), v('Asset active / serviceable', r.assetId ? !!asset && !['Retired', 'Decommissioned', 'Disposed', 'Inactive'].includes(asset.status) : null, asset?.status ?? '', `Asset is ${asset?.status}.`), v('Warranty status available', r.assetId ? !!asset : null, asset?.warrantyStatus ?? '', 'Unknown.', true)] },
    { group: 'Coverage', checks: r.coverage.steps.map((s) => ({ check: s.step, result: s.result, detail: s.detail })).concat([{ check: 'Coverage result', result: r.coverage.result === 'Covered' ? 'pass' : r.coverage.result === 'Coverage Pending Validation' ? 'warn' : r.coverage.chargeable ? 'warn' : 'pass', detail: `${r.coverage.result}${r.coverage.chargeable ? ` — chargeable, approval ${r.coverage.approval.toLowerCase()}` : ''}.` }]) },
    { group: 'SLA', checks: [v('Applicable SLA exists', !!r.sla.slaId, `${r.sla.slaNumber} · ${r.sla.slaName}`, 'No applicable SLA.', true), v('Priority valid', !!r.priority, r.priority, 'Missing.'), v('Service hours available', !!r.sla.calendarId, r.sla.calendarId ? calendar(db.sla, r.sla.calendarId).name : '', 'No calendar.', true), v('SLA target calculated', !!item.resolutionClock.dueAt, `Response due ${item.response.dueAt?.slice(0, 16).replace('T', ' ')} · resolution due ${item.resolutionClock.dueAt?.slice(0, 16).replace('T', ' ')}`, 'No target.', true)] },
    { group: 'Assignment', checks: [v('Team valid', r.assignment.team ? ref.teams.includes(r.assignment.team) : null, r.assignment.team ?? '', 'Unknown team.'), v('Technician active', r.assignment.technician ? !!tech : null, tech ? `${tech.name} · ${tech.team}` : '', 'Unknown technician.'), v('Required skills available', r.assignment.technician && skill ? !!tech?.skills.includes(skill) : null, skill, `${r.assignment.technician} does not have ${skill}.`, true), v('Technician availability verified', r.assignment.technician ? !scheduleConflict(db, r, r.schedule) : null, 'No conflicting appointment.', 'Conflicting appointment.', true)] },
    { group: 'Closure', checks: [v('Resolution entered', r.resolution ? !!r.resolution.description : null, r.resolution?.code ?? '', 'Missing.'), v('Required work completed', r.workOrders.length ? !woOpen.length : null, 'All work orders completed.', `${woOpen.length} work order(s) still open.`), v('Parts / labour recorded', r.workOrders.length ? r.workOrders.every((w) => w.status !== 'Completed' || w.labourMinutes > 0) : null, 'Recorded.', 'Labour missing on a completed work order.'), v('Required evidence attached', SR_RULES.attachmentRequiredForTypes.includes(r.type) ? r.attachments.length > 0 : null, `${r.attachments.length} attachment(s).`, 'Evidence attachment required.'), v('Customer confirmation captured', needConfirm ? !!r.resolution?.confirmation?.confirmed : null, r.resolution?.confirmation ? `${r.resolution.confirmation.by}` : '', 'Customer confirmation required.')] },
  ];
}

export function closureNeedsConfirmation(r: ServiceRequest): boolean {
  return r.type !== 'Internal Service Request' && (SR_RULES.confirmationRequiredFor.includes(r.priority) || (SR_RULES.confirmationRequiredForCovered && r.coverage.result === 'Covered' && !!r.coverage.amcId));
}

/** SRS 9.14 / 9.23 — technician double booking. */
export function scheduleConflict(db: SrDatabase, r: ServiceRequest, s: ServiceRequest['schedule'], technician = r.assignment.technician): ServiceRequest | null {
  if (!s || !technician) return null;
  return db.requests.find((x) => x.id !== r.id && x.assignment.technician === technician && x.schedule?.scheduledDate === s.scheduledDate && OPEN_STATUSES.includes(x.status) && x.schedule.startTime < s.endTime && s.startTime < x.schedule.endTime) ?? null;
}

/**
 * SRS 9.15 / 9.31 automation: SLA escalation, critical unassigned, no progress, excessive pending,
 * repeated reopening, closure reminders. Each action records the responsible rule.
 */
export function automate(db: SrDatabase, log: SrLog, uid: (p: string) => string, now = Date.now()): number {
  let n = 0;
  const at = new Date(now).toISOString();
  db.requests = db.requests.map((r) => {
    if (!OPEN_STATUSES.includes(r.status) && r.status !== 'Resolved') return r;
    let next = r;
    const escalate = (level: number, trigger: string, action: string) => {
      if (next.escalation.level >= level || next.escalation.events.some((e) => e.trigger === trigger && e.level === level)) return;
      next = { ...next, escalation: { level, events: [...next.escalation.events, { at, level, trigger, action, by: 'System', reason: trigger }] } };
      log({ timestamp: at, user: 'System', action: 'Request Escalated', requestId: r.id, requestNumber: r.number, previousValue: r.escalation.level ? `Level ${r.escalation.level}` : null, newValue: `Level ${level}`, reason: trigger, source: `Automation rule: ${trigger}`, relatedRecord: null });
      n++;
    };
    if (OPEN_STATUSES.includes(r.status)) {
      const item = toItem(db, r, now);
      if (item.slaState === 'Breached') escalate(2, 'SLA breach', 'Management alert');
      else if (item.slaState === 'At Risk') escalate(1, 'SLA approaching breach', 'Notification');
      if (r.priority === 'Critical' && !r.assignment.technician && (now - new Date(r.createdAt).getTime()) / 60_000 > SR_RULES.criticalUnassignedMinutes) escalate(1, 'No assignment', 'Reassignment');
      if (['Assigned', 'Scheduled'].includes(r.status) && r.assignment.assignedAt && (now - new Date(r.assignment.assignedAt).getTime()) / 3_600_000 > SR_RULES.noProgressHours && (!r.schedule || r.schedule.scheduledDate < at.slice(0, 10))) escalate(1, 'No progress', 'Notification');
      const hold = r.holds.find((h) => !h.endedAt);
      if (hold && (now - new Date(hold.startedAt).getTime()) / DAY > SR_RULES.excessivePendingDays) escalate(1, 'Excessive pending duration', 'Customer communication');
      if (r.reopenCount >= SR_RULES.repeatedReopenCount) escalate(2, 'Repeated reopening', 'SLA review');
    }
    if (r.status === 'Resolved' && r.resolution && !r.resolution.confirmation && (now - new Date(r.resolution.completedAt).getTime()) / DAY > SR_RULES.closureReminderDays && !r.activities.some((a) => a.type === 'System Notification' && a.message.startsWith('Closure reminder'))) {
      next = { ...next, activities: [...next.activities, { id: uid('ACT'), type: 'System Notification', at, user: 'System', direction: 'Outbound', message: 'Closure reminder sent to the customer — please confirm the resolution.', attachment: null, followUp: null, visibility: 'Customer Visible' }] };
      log({ timestamp: at, user: 'System', action: 'Automation', requestId: r.id, requestNumber: r.number, previousValue: null, newValue: 'Closure reminder', reason: 'Resolved but not confirmed', source: 'Automation rule: closure reminder', relatedRecord: null });
      n++;
    }
    return next;
  });
  return n;
}

export const skillsFor = (team: string) => TEAM_SKILLS[team] ?? ['Multi-Skill Technician'];
