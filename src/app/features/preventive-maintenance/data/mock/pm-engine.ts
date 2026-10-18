import type {
  Checklist,
  Completion,
  DueCategory,
  MaintenanceTask,
  MeterRule,
  Occurrence,
  OccurrenceStatus,
  PmHistoryAction,
  PmHistoryEntity,
  PmHistoryEvent,
  PmValidation,
  PmWorkOrder,
  StockPart,
} from '../../models/operations.model';
import { OPEN_STATUSES } from '../../models/operations.model';
import type { MaintenancePlan, PlanVersion } from '../../models/plan.model';
import type { PmReferenceData } from '../../models/reference.model';
import { PM_RULES } from '../pm.config';
import { addDays, daysBetweenIso, frequencyLabel, isNonWorking, planDates, recurrenceError, today } from '../pm-recurrence';

export interface PmDatabase {
  reference: PmReferenceData;
  plans: MaintenancePlan[];
  versions: PlanVersion[];
  occurrences: Occurrence[];
  workOrders: PmWorkOrder[];
  checklists: Checklist[];
  tasks: MaintenanceTask[];
  meters: MeterRule[];
  parts: StockPart[];
  history: PmHistoryEvent[];
}

export type Logger = (action: PmHistoryAction, entity: PmHistoryEntity, entityId: string, planId: string | null, comments: string, prev?: string | null, next?: string | null, ref?: string | null, user?: string, at?: string) => void;

export function effectiveStatus(o: Occurrence, day = today()): OccurrenceStatus {
  return OPEN_STATUSES.includes(o.status) && o.dueDate < day ? 'Overdue' : o.status;
}

export function dueCategory(o: Occurrence, day = today()): DueCategory | null {
  if (o.status === 'Missed') return 'Missed';
  if (!OPEN_STATUSES.includes(o.status)) return null;
  const overdue = daysBetweenIso(o.dueDate, day);
  if (overdue > PM_RULES.severelyOverdueDays) return 'Severely Overdue';
  if (overdue > 0) return 'Overdue';
  const d = daysBetweenIso(day, o.scheduledDate);
  if (d <= 0) return 'Due Today';
  if (d === 1) return 'Due Tomorrow';
  if (d <= 7) return 'Due This Week';
  if (d <= 30) return 'Due This Month';
  return d <= PM_RULES.dueSoonDays + 30 ? 'Due Soon' : null;
}

const key = (planId: string, assetId: string, date: string) => `${planId}|${assetId}|${date}`;

/** Existing occurrence keys — superseded (recalculated) occurrences are excluded so the new rule can regenerate. */
export function occurrenceKeys(db: PmDatabase): Set<string> {
  return new Set(db.occurrences.filter((o) => !(o.status === 'Cancelled' && o.cancelReason?.startsWith('Superseded'))).map((o) => key(o.planId, o.assetId, o.originalDate)));
}

export function newOccurrence(db: PmDatabase, p: MaintenancePlan, assetId: string, ruleDate: string, scheduledDate: string, generatedBy: string, uid: (p: string) => string): Occurrence {
  const asset = db.reference.assets.find((a) => a.id === assetId)!;
  const id = uid('PMS');
  return {
    id, number: id, planId: p.id, planVersion: p.version, assetId, siteId: asset.siteId, customerId: asset.customerId, serviceId: p.service.serviceId, maintenanceType: p.maintenanceType, originalDate: ruleDate, scheduledDate,
    dueDate: addDays(scheduledDate, p.frequency.graceDays), window: p.scheduling.window, team: p.resources.team, technician: null, priority: p.automation.priority, status: daysBetweenIso(today(), scheduledDate) <= 30 ? 'Scheduled' : 'Planned',
    assignment: 'Unassigned', workOrderId: null, generatedBy, reschedules: [], overdueReason: null, escalationLevel: 0, cancelReason: null, completion: null, correctiveWorkOrderIds: [],
  };
}

/** SRS 8.18 — generates future occurrences up to the horizon without duplicates. Only active plans generate. */
export function generateFor(db: PmDatabase, p: MaintenancePlan, uid: (p: string) => string, keys = occurrenceKeys(db), from = today()): Occurrence[] {
  if (p.status !== 'Active' || recurrenceError(p)) return [];
  const start = [from, p.frequency.effectiveDate, p.frequency.startDate].sort().at(-1)!;
  const to = addDays(today(), PM_RULES.horizonDays);
  const assets = p.assetIds.filter((id) => db.reference.assets.some((a) => a.id === id && a.status !== 'Retired' && a.status !== 'Decommissioned'));
  const created: Occurrence[] = [];
  if (p.strategy.strategy === 'Time-Based' || p.strategy.strategy === 'Calendar-Based') {
    const dates = planDates(p, start, to, db.reference.holidays);
    for (const assetId of assets) {
      for (const d of dates) {
        if (keys.has(key(p.id, assetId, d.ruleDate))) continue;
        const o = newOccurrence(db, p, assetId, d.ruleDate, d.scheduledDate, `Recurrence rule: ${frequencyLabel(p)} (v${p.version})`, uid);
        keys.add(key(p.id, assetId, d.ruleDate));
        created.push(o);
      }
    }
  } else if (p.strategy.strategy === 'Event-Based') {
    for (const assetId of assets) {
      const a = db.reference.assets.find((x) => x.id === assetId)!;
      const anchor = p.maintenanceType === 'After Commissioning' ? a.commissioningDate : p.maintenanceType === 'After Installation' ? a.installationDate
        : db.workOrders.filter((w) => w.assetId === assetId && w.kind === 'Corrective' && w.status === 'Completed').map((w) => w.plannedDate).sort().at(-1) ?? null;
      if (!anchor) continue;
      const ruleDate = addDays(anchor, p.frequency.value);
      if (ruleDate < p.frequency.startDate || keys.has(key(p.id, assetId, ruleDate))) continue;
      const o = newOccurrence(db, p, assetId, ruleDate, ruleDate, `Event rule: ${p.maintenanceType} + ${p.frequency.value} days`, uid);
      keys.add(key(p.id, assetId, ruleDate));
      created.push(o);
    }
  }
  db.occurrences.push(...created);
  return created;
}

export function partsAvailable(db: PmDatabase, parts: readonly { partNumber: string; quantity: number }[]): boolean {
  return parts.every((r) => {
    const s = db.parts.find((x) => x.partNumber === r.partNumber);
    return !!s && s.stock - s.reserved >= r.quantity;
  });
}

/** Skill, certification, territory and capacity check for an assignment (SRS 8.15, 8.25). */
export function assignmentIssue(db: PmDatabase, o: Occurrence, technician: string, day = o.scheduledDate): string | null {
  const t = db.reference.technicians.find((x) => x.name === technician);
  if (!t) return 'Select a valid technician.';
  const p = db.plans.find((x) => x.id === o.planId);
  if (p?.resources.skill && !t.skills.includes(p.resources.skill)) return `${t.name} does not have the required skill “${p.resources.skill}”.`;
  if (p?.resources.certification && p.resources.certification !== 'None' && !t.certifications.includes(p.resources.certification)) return `${t.name} does not hold the required certification “${p.resources.certification}”.`;
  const site = db.reference.sites.find((s) => s.id === o.siteId);
  if (site && t.region !== site.region) return `Service territory: ${t.name} covers ${t.region}; the site is in ${site.region}.`;
  const load = db.occurrences.filter((x) => x.id !== o.id && x.technician === technician && x.scheduledDate === day && !['Cancelled', 'Completed', 'Missed'].includes(x.status)).length;
  if (load >= t.dailyCapacity) return `${t.name} is fully booked on ${day} (${load} of ${t.dailyCapacity} jobs).`;
  return null;
}

export function createWorkOrder(db: PmDatabase, o: Occurrence, generatedBy: string, uid: (p: string) => string, log: Logger): PmWorkOrder {
  const p = db.plans.find((x) => x.id === o.planId)!;
  const id = uid('PWO');
  const wo: PmWorkOrder = {
    id, number: `WO-PM-${id.slice(-5)}`, kind: 'Preventive', occurrenceId: o.id, planId: p.id, customerId: o.customerId, siteId: o.siteId, assetId: o.assetId, serviceId: o.serviceId, maintenanceType: o.maintenanceType, priority: o.priority,
    plannedDate: o.scheduledDate, dueDate: o.dueDate, team: o.team, technician: o.technician, checklistId: p.procedure.checklistId, parts: p.parts.required, tools: p.resources.tools, status: o.technician ? 'Assigned' : 'Open', generatedBy, createdAt: new Date().toISOString(), defect: null, severity: null, estimatedCost: null,
  };
  db.workOrders.push(wo);
  db.occurrences = db.occurrences.map((x) => (x.id === o.id ? { ...x, workOrderId: id, status: x.status === 'Planned' ? 'Scheduled' : x.status } : x));
  log('Work Order Generated', 'Work Order', id, p.id, `${wo.number} generated for ${o.number} — ${generatedBy}.`, null, wo.number, o.number, 'System');
  return wo;
}

/**
 * Continuous automation (SRS 8.14, 8.16, 8.18): horizon generation, work orders X days before due,
 * auto-assignment / dispatch, overdue reminders and escalation, auto-missed.
 */
export function automate(db: PmDatabase, uid: (p: string) => string, log: Logger): number {
  let changes = 0;
  const day = today();
  const keys = occurrenceKeys(db);
  for (const p of db.plans.filter((x) => x.status === 'Active')) {
    const created = generateFor(db, p, uid, keys);
    if (created.length) {
      changes += created.length;
      log('Schedule Generated', 'Schedule', p.id, p.id, `${created.length} occurrence(s) generated automatically up to ${addDays(day, PM_RULES.horizonDays)}.`, null, String(created.length), null, 'System');
    }
  }
  for (const o of [...db.occurrences]) {
    const p = db.plans.find((x) => x.id === o.planId);
    if (!p) continue;
    const open = OPEN_STATUSES.includes(o.status);
    if (open && !o.workOrderId && p.status === 'Active' && p.automation.autoGenerate && addDays(o.scheduledDate, -p.automation.leadDays) <= day && o.dueDate >= addDays(day, -PM_RULES.autoMissDays)) {
      let current = db.occurrences.find((x) => x.id === o.id)!;
      if (p.automation.autoAssign && p.automation.technician && !current.technician && !assignmentIssue(db, current, p.automation.technician)) {
        current = { ...current, technician: p.automation.technician, team: p.automation.team || current.team, status: 'Assigned', assignment: 'Assigned' };
        db.occurrences = db.occurrences.map((x) => (x.id === o.id ? current : x));
        log('Technician Assigned', 'Schedule', o.id, p.id, `${o.number} auto-assigned to ${p.automation.technician}.`, null, p.automation.technician, o.number, 'System');
      }
      const wo = createWorkOrder(db, current, `Generate ${p.automation.leadDays} days before due date`, uid, log);
      if (p.automation.autoDispatch && wo.technician) db.workOrders = db.workOrders.map((w) => (w.id === wo.id ? { ...w, status: 'Dispatched' } : w));
      changes++;
    }
    const latest = db.occurrences.find((x) => x.id === o.id)!;
    if (OPEN_STATUSES.includes(latest.status) && latest.dueDate < day) {
      const overdue = daysBetweenIso(latest.dueDate, day);
      if (overdue > PM_RULES.autoMissDays) {
        db.occurrences = db.occurrences.map((x) => (x.id === o.id ? { ...x, status: 'Missed', cancelReason: `Not performed within ${PM_RULES.autoMissDays} days of the due date.` } : x));
        log('Maintenance Missed', 'Schedule', o.id, p.id, `${o.number} marked missed automatically — overdue ${overdue} days.`, 'Overdue', 'Missed', o.number, 'System', new Date(`${addDays(latest.dueDate, PM_RULES.autoMissDays + 1)}T06:00:00Z`).toISOString());
        changes++;
        continue;
      }
      const level = overdue > PM_RULES.severelyOverdueDays ? 2 : 1;
      if (latest.escalationLevel < level && p.notifications.overdue) {
        db.occurrences = db.occurrences.map((x) => (x.id === o.id ? { ...x, escalationLevel: level } : x));
        log('Maintenance Overdue', 'Schedule', o.id, p.id, level === 1 ? `${o.number} overdue — supervisor notified.` : `${o.number} severely overdue (${overdue} days) — management escalation.`, `Level ${latest.escalationLevel}`, `Level ${level}`, o.number, 'System', new Date(`${addDays(latest.dueDate, level === 1 ? 1 : PM_RULES.severelyOverdueDays + 1)}T06:00:00Z`).toISOString());
        changes++;
      }
    }
  }
  return changes;
}

/** SRS 8.26 — validation before generation / execution. */
export function validateOccurrence(db: PmDatabase, o: Occurrence): PmValidation {
  const steps: PmValidation['steps'][number][] = [];
  const step = (name: string, ok: boolean | null, pass: string, fail: string, warn = false) => {
    steps.push({ step: name, result: ok === null ? 'na' : ok ? 'pass' : warn ? 'warn' : 'fail', detail: ok === null ? 'Not applicable.' : ok ? pass : fail });
    return ok !== false;
  };
  const done = (result: PmValidation['result'], summary: string): PmValidation => ({ result, ok: result === 'Maintenance Scheduled' || result === 'Maintenance Overdue', steps, summary });
  const ref = db.reference;
  const p = db.plans.find((x) => x.id === o.planId)!;
  const customer = ref.customers.find((c) => c.id === o.customerId);
  step('Customer', !!customer, `${customer?.name}.`, 'Customer not found.');
  const site = ref.sites.find((s) => s.id === o.siteId);
  step('Site', !!site && site.customerId === o.customerId, `${site?.name}.`, 'Site does not belong to the customer.');
  const asset = ref.assets.find((a) => a.id === o.assetId);
  if (!step('Asset', !!asset && asset.siteId === o.siteId, `${asset?.id} · ${asset?.name}.`, 'Asset is not at the plan site.')) return done('Asset Not Covered', 'The asset is outside the plan scope.');
  if (!step('Asset Status', !['Retired', 'Decommissioned', 'Disposed'].includes(asset!.status), asset!.status, `Asset is ${asset!.status.toLowerCase()}.`)) return done('Maintenance Not Applicable', 'Retired or decommissioned assets are not maintained.');
  if (!step('Maintenance Plan', p.assetIds.includes(o.assetId), `${p.number} covers the asset.`, 'The asset is not in the plan scope.')) return done('Asset Not Covered', 'Asset not in plan scope.');
  if (p.status === 'Suspended') {
    step('Plan Status', false, '', 'Plan is suspended — no new maintenance work unless explicitly authorized.');
    return done('Maintenance Plan Suspended', `${p.number} is suspended.`);
  }
  if (!step('Plan Status', p.status === 'Active', 'Active.', `Plan is ${p.status.toLowerCase()}.`)) return done(p.approval === 'Pending' ? 'Maintenance Requires Approval' : 'Maintenance Plan Inactive', `${p.number} is not active.`);
  step('Maintenance Frequency', true, frequencyLabel(p), '');
  const rec = recurrenceError(p);
  if (!step('Recurrence Rule', !rec, 'Valid recurrence rule.', rec ?? '')) return done('Invalid Recurrence Rule', rec ?? '');
  const dup = db.occurrences.some((x) => x.id !== o.id && x.planId === o.planId && x.assetId === o.assetId && x.originalDate === o.originalDate && x.status !== 'Cancelled');
  if (!step('Duplicate Check', !dup, 'No duplicate event.', 'Another event exists for the same plan, asset and date.')) return done('Duplicate Schedule Detected', 'Duplicate recurring event.');
  step('Service Coverage', p.service.serviceId ? true : null, 'Service is defined.', '');
  const amc = ref.amcs.find((a) => a.id === p.service.amcId);
  if (p.service.amcId) {
    const live = !!amc && ['Active', 'Expiring Soon'].includes(amc.status) && amc.endDate >= o.scheduledDate;
    if (!step('AMC / Contract', live && amc!.assetIds.includes(o.assetId), `${amc?.number} covers the asset until ${amc?.endDate}.`, !live ? `${amc?.number ?? p.service.amcId} is ${amc?.status.toLowerCase() ?? 'missing'} or ends before the event.` : 'The asset is not covered by the AMC.')) return done(!live ? 'AMC Expired' : 'Asset Not Covered', 'AMC entitlement is not valid for this event.');
  } else {
    const contract = ref.contracts.find((c) => c.id === p.service.contractId);
    if (!step('AMC / Contract', p.service.contractId ? !!contract && (!contract.endDate || contract.endDate >= o.scheduledDate) && !['Expired', 'Terminated'].includes(contract.status) : null, `${contract?.number} is valid.`, `${contract?.number} has expired.`)) return done('Contract Expired', 'The contract has expired.');
  }
  const sla = ref.slas.find((s) => s.id === p.service.slaId);
  step('SLA', p.service.slaId ? !!sla : null, `${sla?.name} applies.`, 'SLA not found.', true);
  const holiday = isNonWorking(o.scheduledDate, ref.holidays);
  step('Maintenance Calendar', !holiday || p.scheduling.holidayHandling === 'Keep date' || o.window === 'Weekend Shutdown', 'Working day.', `${o.scheduledDate} is a non-working day or holiday.`, true);
  const clash = db.occurrences.some((x) => x.id !== o.id && x.assetId === o.assetId && x.scheduledDate === o.scheduledDate && !['Cancelled', 'Missed'].includes(x.status));
  if (!step('Maintenance Window', !clash, `${o.window}.`, 'Another maintenance event is scheduled on this asset the same day.', true)) return done('Maintenance Window Conflict', 'Maintenance window conflict on the asset.');
  const tech = o.technician ?? p.automation.technician;
  const issue = tech ? assignmentIssue(db, o, tech) : null;
  step('Required Skills', p.resources.skill ? (tech ? !issue?.includes('skill') && !issue?.includes('certification') : null) : null, `${p.resources.skill} available.`, issue ?? '', true);
  const parts = partsAvailable(db, p.parts.required);
  if (!step('Required Parts', p.parts.required.length ? parts : null, 'Required parts are available.', 'One or more required parts are not in stock.', true)) return done('Required Parts Unavailable', 'Required parts are unavailable.');
  step('Work Order', o.workOrderId ? true : null, 'Work order generated.', '');
  if (!step('Technician Assignment', tech ? !issue : null, `${tech} is available.`, issue ?? '', true)) return done('Technician Not Available', issue ?? '');
  const overdue = effectiveStatus(o) === 'Overdue';
  step('Maintenance Execution', !overdue, 'Within due date.', `Overdue since ${o.dueDate}.`, true);
  return done(overdue ? 'Maintenance Overdue' : 'Maintenance Scheduled', overdue ? 'Valid but overdue — schedule as soon as possible.' : 'All checks passed — maintenance can proceed.');
}

export function occurrenceCost(db: PmDatabase, o: Occurrence): number {
  if (!o.completion) return 0;
  const parts = o.completion.partsUsed.reduce((s, u) => s + (db.parts.find((p) => p.partNumber === u.partNumber)?.unitCost ?? 0) * u.quantity, 0);
  return Math.round((o.completion.durationMinutes / 60) * PM_RULES.laborRatePerHour + parts + PM_RULES.travelCostPerVisit + PM_RULES.toolCostPerVisit);
}

/** Checklist / measurement rules before completion (SRS 8.25). */
export function completionIssue(db: PmDatabase, o: Occurrence, c: Omit<Completion, 'reportNumber'>): string | null {
  const p = db.plans.find((x) => x.id === o.planId)!;
  const checklist = db.checklists.find((x) => x.id === p.procedure.checklistId);
  for (const item of checklist?.items ?? []) {
    const r = c.checklist.find((x) => x.itemId === item.id);
    if (item.required && (!r || r.value === '')) return `Checklist item “${item.task}” is required.`;
    if (r && (item.type === 'Measurement' || item.type === 'Numeric') && r.value !== '' && Number.isNaN(Number(r.value))) return `“${item.task}” must be a number.`;
  }
  if (c.durationMinutes <= 0) return 'Enter the actual duration.';
  for (const u of c.partsUsed) {
    const s = db.parts.find((x) => x.partNumber === u.partNumber);
    if (!s || s.stock < u.quantity) return `Insufficient stock for ${u.partNumber}.`;
  }
  return null;
}

/** Evaluates checklist results against expected values and limits. */
export function evaluateChecklist(db: PmDatabase, planId: string, results: readonly { itemId: string; value: string }[]): { itemId: string; value: string; pass: boolean | null }[] {
  const p = db.plans.find((x) => x.id === planId)!;
  const checklist = db.checklists.find((x) => x.id === p.procedure.checklistId);
  return results.map((r) => {
    const item = checklist?.items.find((i) => i.id === r.itemId);
    if (!item || r.value === '') return { ...r, pass: null };
    if (item.type === 'Measurement' || item.type === 'Numeric') {
      const v = Number(r.value);
      return { ...r, pass: (item.min === null || v >= item.min) && (item.max === null || v <= item.max) };
    }
    if (item.type === 'Pass / Fail') return { ...r, pass: r.value === 'Pass' };
    if (item.type === 'Yes / No') return { ...r, pass: item.expected ? r.value === item.expected : true };
    return { ...r, pass: null };
  });
}
