import type {
  EscalationEvent,
  EscalationRule,
  Holiday,
  SlaBreach,
  SlaCalendar,
  SlaCandidate,
  SlaClock,
  SlaCoverage,
  SlaHistoryEvent,
  SlaMapping,
  SlaRequest,
  SlaSelection,
  SlaTarget,
  TargetType,
} from '../../models/operations.model';
import type { SlaReferenceData } from '../../models/reference.model';
import { LIVE_SLA_STATUSES, type Priority, type Sla, type SlaStatus, type SlaVersion } from '../../models/sla.model';
import { SLA_RULES } from '../sla.config';
import { addBusinessMinutes, elapsedMinutes } from '../sla-time';

export interface SlaDatabase {
  reference: SlaReferenceData;
  slas: Sla[];
  versions: SlaVersion[];
  targets: SlaTarget[];
  coverage: SlaCoverage[];
  calendars: SlaCalendar[];
  holidays: Holiday[];
  rules: EscalationRule[];
  events: EscalationEvent[];
  mappings: SlaMapping[];
  clocks: SlaClock[];
  breaches: SlaBreach[];
  history: SlaHistoryEvent[];
  /** Stopped clocks already evaluated by `tick`. */
  processed: Set<string>;
}

export const today = () => new Date().toISOString().slice(0, 10);
const DAY = 86_400_000;

export function slaStatus(s: Sla, now = Date.now()): SlaStatus {
  const day = new Date(now).toISOString().slice(0, 10);
  if (s.status === 'Pending Activation' && s.validity.effectiveDate <= day) return 'Pending Activation';
  if (s.status !== 'Active') return s.status;
  if (s.validity.expiryDate && s.validity.expiryDate < day) return 'Expired';
  if (s.validity.expiryDate && (new Date(s.validity.expiryDate).getTime() - now) / DAY <= SLA_RULES.expiringWindowDays) return 'Expiring Soon';
  return 'Active';
}

export function calendar(db: SlaDatabase, id: string): SlaCalendar {
  return db.calendars.find((c) => c.id === id) ?? db.calendars[0];
}

export function targetFor(db: SlaDatabase, slaId: string, priority: Priority, type: TargetType): SlaTarget | undefined {
  return db.targets.find((t) => t.slaId === slaId && t.priority === priority && t.targetType === type) ?? db.targets.find((t) => t.slaId === slaId && t.priority === 'All' && t.targetType === type);
}

/** Regenerates priority and response/resolution targets from the SLA definition, keeping thresholds. */
export function syncTargets(db: SlaDatabase, s: Sla, uid: () => string): void {
  const keep = (priority: Priority | 'All', targetType: TargetType, minutes: number | null, calendarId: string, startEvent: string, stopEvent: string) => {
    const existing = db.targets.find((t) => t.slaId === s.id && t.priority === priority && t.targetType === targetType);
    if (minutes === null || minutes <= 0) {
      if (existing && priority === 'All') db.targets = db.targets.filter((t) => t !== existing);
      return;
    }
    const base = { durationMinutes: minutes, calendarId, unit: minutes % 1440 === 0 && minutes >= 1440 ? 'Days' as const : minutes % 60 === 0 ? 'Hours' as const : 'Minutes' as const };
    if (existing) db.targets = db.targets.map((t) => (t === existing ? { ...t, ...base } : t));
    else db.targets.push({ id: uid(), slaId: s.id, priority, targetType, ...base, startEvent, stopEvent, pauseEvents: ['Waiting for Customer', 'Waiting for Parts', 'Site Inaccessible'], resumeEvent: 'Pause condition cleared', warningPercent: SLA_RULES.warningPercent, escalationPercent: SLA_RULES.escalationPercent, breachPercent: SLA_RULES.breachPercent });
  };
  for (const p of ['Critical', 'High', 'Medium', 'Low'] as const) {
    keep(p, 'First Response', s.priorityTargets[p].response, s.response.calendarId, 'Service Request Created', 'First Response Sent');
    keep(p, 'Resolution', s.priorityTargets[p].resolution, s.resolution.calendarId, 'Service Request Created', 'Resolution Confirmed');
  }
  keep('All', 'Acknowledgement', s.response.acknowledgement, s.response.calendarId, 'Service Request Created', 'Request Acknowledged');
  keep('All', 'Assignment', s.response.assignment, s.response.calendarId, 'Service Request Created', 'Technician Assigned');
  keep('All', 'On-Site Arrival', s.response.onSiteArrival, s.response.calendarId, 'Work Order Created', 'Technician Arrived');
  keep('All', 'Restoration', s.resolution.restoration, s.resolution.calendarId, 'Service Request Created', 'Service Restored');
  keep('All', 'Closure', s.resolution.closure, s.resolution.calendarId, 'Service Request Created', 'Request Closed');
}

const MAPPING_FIELDS = ['customerId', 'contractId', 'amcId', 'siteId', 'assetId', 'serviceId', 'serviceCategory', 'priority'] as const;

export function specificity(m: SlaMapping): number {
  return MAPPING_FIELDS.reduce((s, f) => s + (m[f] ? (SLA_RULES.specificityWeights[f] ?? 1) : 0), 0);
}

function mappingMatches(m: SlaMapping, r: SlaRequest, serviceCategory: string | null): boolean {
  return (!m.customerId || m.customerId === r.customerId) && (!m.contractId || m.contractId === r.contractId) && (!m.amcId || m.amcId === r.amcId) && (!m.siteId || m.siteId === r.siteId) &&
    (!m.assetId || m.assetId === r.assetId) && (!m.serviceId || m.serviceId === r.serviceId) && (!m.serviceCategory || m.serviceCategory === serviceCategory) && (!m.priority || m.priority === r.priority);
}

/** SRS 7.9 — coverage dimensions; returns the first uncovered dimension or null. */
function coverageGap(db: SlaDatabase, slaId: string, r: SlaRequest, day: string): 'Customer' | 'Site' | 'Asset' | 'Service' | 'Priority' | null {
  const lines = db.coverage.filter((c) => c.slaId === slaId && c.status === 'Active' && c.startDate <= day && (!c.endDate || c.endDate >= day));
  if (!lines.length) return 'Customer';
  const asset = db.reference.assets.find((a) => a.id === r.assetId);
  const category = db.reference.services.find((s) => s.id === r.serviceId)?.category ?? null;
  const groups: [name: 'Customer' | 'Site' | 'Asset' | 'Service', levels: string[], match: (c: SlaCoverage) => boolean][] = [
    ['Customer', ['Customer', 'Contract', 'AMC'], (c) => (c.level === 'Customer' && (!c.customerId || c.customerId === r.customerId)) || (c.level === 'Contract' && c.contractId === r.contractId) || (c.level === 'AMC' && c.amcId === r.amcId)],
    ['Site', ['Site'], (c) => c.siteId === r.siteId],
    ['Asset', ['Asset', 'Asset Category'], (c) => (c.level === 'Asset' && c.assetId === r.assetId) || (c.level === 'Asset Category' && !!asset && c.assetCategory === asset.category)],
    ['Service', ['Service', 'Service Category'], (c) => (c.level === 'Service' && c.serviceId === r.serviceId) || (c.level === 'Service Category' && c.serviceCategory === category)],
  ];
  for (const [name, levels, match] of groups) {
    const group = lines.filter((c) => levels.includes(c.level));
    if (name === 'Customer' && !group.length) continue;
    if (group.length && !group.some(match)) return name;
  }
  const restricted = lines.filter((c) => c.priority);
  if (restricted.length === lines.length && !restricted.some((c) => c.priority === r.priority)) return 'Priority';
  return null;
}

/** SRS 7.21 validation + SRS 7.12 most-specific selection. */
export function resolveSla(db: SlaDatabase, r: SlaRequest, now = Date.now()): SlaSelection {
  const steps: SlaSelection['steps'][number][] = [];
  const day = r.date.slice(0, 10);
  const ref = db.reference;
  const step = (name: string, ok: boolean | null, pass: string, fail: string, warn = false) => {
    steps.push({ step: name, result: ok === null ? 'na' : ok ? 'pass' : warn ? 'warn' : 'fail', detail: ok === null ? 'Not specified.' : ok ? pass : fail });
    return ok !== false;
  };
  const done = (result: SlaSelection['result'], applicability: SlaSelection['applicability'], sla: Sla | null, candidates: SlaCandidate[], summary: string): SlaSelection => ({
    request: r, result, applicability, slaId: sla?.id ?? null, slaNumber: sla?.number ?? null,
    responseMinutes: sla ? (targetFor(db, sla.id, r.priority, 'First Response')?.durationMinutes ?? null) : null,
    resolutionMinutes: sla ? (targetFor(db, sla.id, r.priority, 'Resolution')?.durationMinutes ?? null) : null,
    calendarName: sla ? calendar(db, sla.serviceHours.calendarId).name : null, candidates, steps, summary,
  });

  const customer = ref.customers.find((c) => c.id === r.customerId);
  if (!step('Customer', !!customer && customer.status !== 'Inactive', `${customer?.name} is valid.`, 'Customer is not valid or inactive.')) return done('Customer Not Covered', 'SLA Not Applicable', null, [], 'The customer is not covered.');
  const amc = ref.amcs.find((a) => a.id === r.amcId);
  const contract = ref.contracts.find((c) => c.id === r.contractId);
  step('Contract / AMC', r.amcId || r.contractId ? (!!amc && amc.customerId === r.customerId) || (!!contract && contract.customerId === r.customerId) : null, `${amc?.number ?? contract?.number} belongs to the customer.`, 'The contract / AMC does not belong to the customer.', true);

  const category = ref.services.find((s) => s.id === r.serviceId)?.category ?? null;
  const matching = db.mappings.filter((m) => m.status === 'Active' && m.effectiveDate <= day && (!m.expiryDate || m.expiryDate >= day) && mappingMatches(m, r, category));
  const candidates: SlaCandidate[] = matching.map((m) => {
    const s = db.slas.find((x) => x.id === m.slaId)!;
    const st = slaStatus(s, now);
    const live = LIVE_SLA_STATUSES.includes(st);
    const valid = s.validity.effectiveDate <= day && (!s.validity.expiryDate || s.validity.expiryDate >= day);
    const gap = live && valid ? coverageGap(db, s.id, r, day) : null;
    const hasTargets = !!targetFor(db, s.id, r.priority, 'First Response') && !!targetFor(db, s.id, r.priority, 'Resolution');
    const eligible = live && valid && !gap && hasTargets;
    const reason = !live ? `SLA is ${st.toLowerCase()}.` : !valid ? 'Outside the SLA validity period.' : gap ? `${gap} not covered.` : !hasTargets ? `No ${r.priority} targets defined.` : 'Eligible.';
    return { slaId: s.id, slaNumber: s.number, slaName: s.name, mappingId: m.id, level: m.level, specificity: specificity(m), assignmentPriority: m.assignmentPriority, status: st, eligible, reason };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.specificity - a.specificity || a.assignmentPriority - b.assignmentPriority);

  if (!step('SLA', candidates.length > 0, `${candidates.length} mapped SLA candidate(s).`, 'No SLA is mapped to this customer, contract, site, asset, service or priority.')) return done('No Applicable SLA', 'SLA Not Applicable', null, candidates, 'No applicable SLA was found.');
  const eligible = candidates.filter((c) => c.eligible);
  if (!eligible.length) {
    const first = candidates[0];
    const s = db.slas.find((x) => x.id === first.slaId)!;
    const st = first.status;
    step('SLA Status', LIVE_SLA_STATUSES.includes(st as SlaStatus), `${st}.`, `${s.number} is ${st.toLowerCase()} — expired or suspended SLAs are never assigned.`);
    if (st === 'Expired' || st === 'Renewed') return done('SLA Expired', 'SLA Expired', null, candidates, `${s.number} has expired.`);
    if (st === 'Suspended') return done('SLA Suspended', 'SLA Suspended', null, candidates, `${s.number} is suspended.`);
    if (!LIVE_SLA_STATUSES.includes(st as SlaStatus)) return done('SLA Not Applicable', 'SLA Not Applicable', null, candidates, `${s.number} is not active.`);
    step('Validity Period', !first.reason.startsWith('Outside'), 'Within validity.', first.reason);
    if (first.reason.startsWith('Outside')) return done('SLA Expired', 'SLA Expired', null, candidates, first.reason);
    const gap = first.reason.split(' ')[0];
    const map: Record<string, SlaSelection['result']> = { Customer: 'Customer Not Covered', Site: 'Site Not Covered', Asset: 'Asset Not Covered', Service: 'Service Not Covered', Priority: 'Priority Not Covered' };
    for (const g of ['Customer', 'Site', 'Asset', 'Service', 'Priority']) step(`${g} Coverage`, g !== gap, `${g} covered.`, `${g} is outside the SLA coverage.`);
    if (map[gap]) return done(map[gap], 'SLA Not Applicable', null, candidates, first.reason);
    step('SLA Target', false, '', first.reason);
    return done('SLA Not Applicable', 'SLA Not Applicable', null, candidates, first.reason);
  }
  const winner = eligible[0];
  const sla = db.slas.find((x) => x.id === winner.slaId)!;
  step('SLA Status', true, `${sla.number} is ${winner.status.toLowerCase()}.`, '');
  step('Validity Period', true, `${sla.validity.effectiveDate} – ${sla.validity.expiryDate ?? 'open-ended'}.`, '');
  for (const g of ['Customer', 'Site', 'Asset', 'Service']) step(`${g} Coverage`, g === 'Site' && !r.siteId ? null : g === 'Asset' && !r.assetId ? null : g === 'Service' && !r.serviceId ? null : true, `${g} covered.`, '');
  step('Priority', true, `${r.priority} targets defined.`, '');
  const resp = targetFor(db, sla.id, r.priority, 'First Response')!;
  const reso = targetFor(db, sla.id, r.priority, 'Resolution')!;
  step('SLA Target', true, `First response ${resp.durationMinutes} min · resolution ${reso.durationMinutes} min.`, '');
  const cal = db.calendars.find((c) => c.id === sla.serviceHours.calendarId);
  step('Service Calendar', !!cal && cal.status === 'Active', `${cal?.name} (${cal?.timeZone}).`, 'The service calendar is missing or inactive.');
  step('Escalation Rules', db.rules.some((x) => x.slaId === sla.id && x.status === 'Active'), `${db.rules.filter((x) => x.slaId === sla.id && x.status === 'Active').length} active rule(s).`, 'No escalation rules configured.', true);
  step('SLA Clock', true, 'Clock can start.', '');
  const tie = eligible[1] && eligible[1].specificity === winner.specificity && eligible[1].assignmentPriority === winner.assignmentPriority && eligible[1].slaId !== winner.slaId;
  if (tie) return done('SLA Assignment Conflict', 'Multiple SLA Candidates', null, candidates, `${winner.slaNumber} and ${eligible[1].slaNumber} have the same specificity and assignment priority.`);
  const applicability: SlaSelection['applicability'] = eligible.length > 1 ? 'Higher Priority SLA Applied' : winner.level === 'AMC' || winner.level === 'Contract' ? 'Contract SLA Applied' : winner.level === 'Service' || winner.level === 'Service Category' ? 'Service-Specific SLA Applied' : winner.level === 'Customer' ? 'Customer SLA Applied' : 'SLA Applicable';
  steps.push({ step: 'Applicable SLA', result: 'pass', detail: `${sla.number} · ${sla.name} (${winner.level} mapping${eligible.length > 1 ? `, most specific of ${eligible.length}` : ''}).` });
  return done('SLA Applied', applicability, sla, candidates, `${sla.number} applied — ${applicability.toLowerCase()}.`);
}

export interface ClockMetrics {
  readonly elapsed: number;
  readonly paused: number;
  readonly consumption: number;
  readonly remaining: number;
  readonly dueAt: number;
}

export function clockMetrics(db: SlaDatabase, c: SlaClock, now = Date.now()): ClockMetrics {
  const cal = calendar(db, c.calendarId);
  const { elapsed, paused } = elapsedMinutes(cal, db.holidays, c.startedAt, c.stoppedAt, c.pauses, now);
  const consumption = c.targetMinutes ? Math.round((elapsed / c.targetMinutes) * 1000) / 10 : 0;
  const dueAt = addBusinessMinutes(cal, db.holidays, c.startedAt, c.targetMinutes + paused);
  return { elapsed, paused, consumption, remaining: c.targetMinutes - elapsed, dueAt };
}

const BREACH_TYPE: Record<TargetType, string> = {
  'First Response': 'Response Breach',
  Acknowledgement: 'Response Breach',
  Assignment: 'Assignment Breach',
  'Technician Dispatch': 'Assignment Breach',
  'On-Site Arrival': 'Arrival Breach',
  Restoration: 'Restoration Breach',
  Resolution: 'Resolution Breach',
  Closure: 'Closure Breach',
};

/** Monthly penalty for one breach (SRS 7.26), capped per customer per month. */
function penaltyFor(db: SlaDatabase, s: Sla, customerId: string, at: number): number {
  if (!s.commercial.penaltyApplicable && !s.commercial.serviceCreditApplicable) return 0;
  const monthly = s.commercial.value / 12;
  const month = new Date(at).toISOString().slice(0, 7);
  const already = db.breaches.filter((b) => b.slaId === s.id && b.status !== 'Waived' && b.targetAt.slice(0, 7) === month && db.clocks.find((c) => c.id === b.clockId)?.customerId === customerId).reduce((sum, b) => sum + b.penalty, 0);
  const cap = (monthly * s.commercial.penaltyCapPercent) / 100;
  return Math.max(0, Math.min(Math.round((monthly * s.commercial.penaltyPercent) / 100), Math.round(cap - already)));
}

/**
 * Automatic monitoring (SRS 7.19): fires escalation rules at their thresholds and creates breach records once a
 * target is exceeded. Returns the new history events so callers can log them.
 */
export function tick(db: SlaDatabase, now = Date.now(), uid: (p: string) => string): Omit<SlaHistoryEvent, 'id'>[] {
  const logs: Omit<SlaHistoryEvent, 'id'>[] = [];
  for (const c of db.clocks) {
    if (c.status === 'Cancelled' || c.status === 'Not Started' || (c.stoppedAt && db.processed.has(c.id))) continue;
    if (c.stoppedAt) db.processed.add(c.id);
    const m = clockMetrics(db, c, now);
    const sla = db.slas.find((s) => s.id === c.slaId);
    if (!sla) continue;
    const at = (pct: number) => Math.min(c.stoppedAt ? new Date(c.stoppedAt).getTime() : now, addBusinessMinutes(calendar(db, c.calendarId), db.holidays, c.startedAt, (c.targetMinutes * pct) / 100 + m.paused));
    for (const r of db.rules.filter((x) => x.slaId === c.slaId && x.status === 'Active' && x.triggerPercent !== null && (x.targetType === 'Any' || x.targetType === c.targetType))) {
      if (m.consumption < (r.triggerPercent ?? 0) || db.events.some((e) => e.clockId === c.id && e.ruleId === r.id)) continue;
      const when = at(r.triggerPercent ?? 0);
      db.events.push({ id: uid('ESC'), ruleId: r.id, clockId: c.id, slaId: c.slaId, level: r.level, triggeredAt: new Date(when).toISOString(), consumption: r.triggerPercent ?? 0, recipient: r.recipient, channel: r.channel, action: r.action, status: c.stoppedAt ? 'Closed' : 'Open' });
      logs.push({ timestamp: new Date(when).toISOString(), user: 'System', action: 'Escalation Triggered', entity: 'Escalation', entityId: c.id, slaId: c.slaId, label: c.transactionNumber, previousValue: null, newValue: `Level ${r.level}`, reference: c.transactionNumber, comments: `${c.targetType} at ${r.triggerPercent}% — ${r.action} via ${r.channel} (${r.recipient}).` });
    }
    const breached = m.consumption >= 100;
    if (breached && !db.breaches.some((b) => b.clockId === c.id)) {
      const due = m.dueAt;
      db.breaches.push({
        id: uid('BRH'), number: `BR-${String(db.breaches.length + 1001).padStart(5, '0')}`, clockId: c.id, slaId: c.slaId, breachType: BREACH_TYPE[c.targetType], detectedAt: new Date(Math.min(due, now)).toISOString(),
        targetAt: new Date(due).toISOString(), targetMinutes: c.targetMinutes, actualAt: c.stoppedAt, actualMinutes: c.stoppedAt ? Math.round(m.elapsed) : null, reason: null, owner: null, rootCause: '', correctiveAction: '', waiver: null,
        status: 'Detected', penalty: penaltyFor(db, sla, c.customerId, due), currency: sla.commercial.currency,
      });
      logs.push({ timestamp: new Date(Math.min(due, now)).toISOString(), user: 'System', action: 'SLA Breached', entity: 'Breach', entityId: c.id, slaId: c.slaId, label: c.transactionNumber, previousValue: `${c.targetMinutes} min target`, newValue: c.stoppedAt ? `${Math.round(m.elapsed)} min actual` : 'Running', reference: c.transactionNumber, comments: `${c.targetType} target exceeded — breach record created automatically.` });
    }
  }
  return logs;
}
