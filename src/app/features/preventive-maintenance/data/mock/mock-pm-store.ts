import { Injectable } from '@angular/core';
import type { AssetPerformanceRow, MeterRule, MeterRuleListItem, Occurrence, OccurrenceListItem, PmHistoryAction, PmHistoryEntity, PmPerformance, PmWorkOrder, PmWorkOrderListItem } from '../../models/operations.model';
import { OPEN_STATUSES } from '../../models/operations.model';
import type { MaintenancePlan, PlanListItem } from '../../models/plan.model';
import { PM_RULES } from '../pm.config';
import { daysBetweenIso, frequencyLabel, today } from '../pm-recurrence';
import { type Logger, type PmDatabase, automate, dueCategory, effectiveStatus, occurrenceCost, partsAvailable } from './pm-engine';
import { buildPmSeed } from './pm-seed';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** In-memory preventive maintenance database; runs automation (SRS 8.14 / 8.16 / 8.18) on every read. */
@Injectable()
export class MockPmStore {
  readonly db: PmDatabase = buildPmSeed();
  private seq = 1;

  get user(): string {
    return this.db.reference.currentUser.name;
  }

  now(): string {
    return new Date().toISOString();
  }

  uid = (prefix: string): string => `${prefix}-N${String(this.seq++).padStart(5, '0')}`;

  readonly log: Logger = (action, entity, entityId, planId, comments, prev = null, next = null, ref = null, user, at) => {
    this.db.history.unshift({ id: this.uid('PH'), timestamp: at ?? this.now(), user: user ?? this.user, action, entity, entityId, planId, label: planId ?? entityId, previousValue: prev, newValue: next, reference: ref, comments });
  };

  record(action: PmHistoryAction, entity: PmHistoryEntity, entityId: string, planId: string | null, comments: string, prev: string | null = null, next: string | null = null, ref: string | null = null): void {
    this.log(action, entity, entityId, planId, comments, prev, next, ref);
  }

  monitor(): void {
    if (automate(this.db, this.uid, this.log)) this.db.history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  plan(id: string): MaintenancePlan | undefined {
    return this.db.plans.find((p) => p.id === id);
  }

  replacePlan(next: MaintenancePlan): void {
    this.db.plans = this.db.plans.map((p) => (p.id === next.id ? next : p));
  }

  occurrence(id: string): Occurrence | undefined {
    return this.db.occurrences.find((o) => o.id === id);
  }

  patchOccurrence(id: string, patch: Partial<Occurrence>): Occurrence {
    let next!: Occurrence;
    this.db.occurrences = this.db.occurrences.map((o) => (o.id === id ? (next = { ...o, ...patch }) : o));
    return next;
  }

  patchWorkOrder(id: string | null, patch: Partial<PmWorkOrder>): void {
    if (id) this.db.workOrders = this.db.workOrders.map((w) => (w.id === id ? { ...w, ...patch } : w));
  }

  customerName(id: string | null | undefined): string {
    return (id && this.db.reference.customers.find((c) => c.id === id)?.name) || '';
  }

  siteName(id: string | null | undefined): string {
    return (id && this.db.reference.sites.find((s) => s.id === id)?.name) || '';
  }

  assetName(id: string | null | undefined): string {
    const a = id ? this.db.reference.assets.find((x) => x.id === id) : undefined;
    return a ? `${a.id} · ${a.name}` : '';
  }

  serviceName(id: string | null | undefined): string | null {
    return (id && this.db.reference.services.find((s) => s.id === id)?.name) || null;
  }

  occurrenceItem(o: Occurrence): OccurrenceListItem {
    const p = this.plan(o.planId);
    const day = today();
    return {
      ...o, effectiveStatus: effectiveStatus(o, day), dueCategory: dueCategory(o, day), daysOverdue: OPEN_STATUSES.includes(o.status) ? Math.max(0, daysBetweenIso(o.dueDate, day)) : 0, daysToDue: daysBetweenIso(day, o.dueDate),
      planNumber: p?.number ?? o.planId, planName: p?.name ?? '', customerName: this.customerName(o.customerId), siteName: this.siteName(o.siteId), assetName: this.assetName(o.assetId), serviceName: this.serviceName(o.serviceId),
      workOrderNumber: this.db.workOrders.find((w) => w.id === o.workOrderId)?.number ?? null, region: this.db.reference.sites.find((s) => s.id === o.siteId)?.region ?? '',
    };
  }

  workOrderItem(w: PmWorkOrder): PmWorkOrderListItem {
    return { ...w, planNumber: this.plan(w.planId)?.number ?? w.planId, occurrenceNumber: this.occurrence(w.occurrenceId)?.number ?? w.occurrenceId, customerName: this.customerName(w.customerId), siteName: this.siteName(w.siteId), assetName: this.assetName(w.assetId), serviceName: this.serviceName(w.serviceId), partsAvailable: partsAvailable(this.db, w.parts) };
  }

  meterItem(m: MeterRule): MeterRuleListItem {
    const p = this.plan(m.planId);
    const current = m.readings.at(-1)?.value ?? null;
    const previous = m.readings.at(-2)?.value ?? null;
    const next = m.kind === 'Meter' ? m.lastTriggerReading + m.interval : null;
    const progress = current === null ? 0 : m.kind === 'Meter' ? Math.round(((current - m.lastTriggerReading) / m.interval) * 1000) / 10 : Math.round((current / m.interval) * 1000) / 10;
    const reached = m.kind === 'Meter' ? current !== null && next !== null && current >= next : current !== null && (m.operator === '>' ? current > m.interval : current < m.interval);
    return {
      ...m, planNumber: p?.number ?? m.planId, planName: p?.name ?? '', assetName: this.assetName(m.assetId), currentReading: current, previousReading: previous, readingDate: m.readings.at(-1)?.at ?? null, nextMaintenanceReading: next, progress,
      state: reached ? 'Threshold Reached' : progress >= PM_RULES.meterApproachingPercent ? 'Approaching' : 'Normal',
    };
  }

  performance(occurrences: readonly Occurrence[]): PmPerformance {
    const day = today();
    const past = occurrences.filter((o) => o.scheduledDate <= day);
    const completed = occurrences.filter((o) => o.status === 'Completed');
    const onTime = completed.filter((o) => o.completion && o.completion.endedAt.slice(0, 10) <= o.dueDate);
    const decided = past.filter((o) => ['Completed', 'Missed'].includes(o.status) || effectiveStatus(o, day) === 'Overdue');
    const ids = new Set(occurrences.map((o) => o.id));
    const corrective = this.db.workOrders.filter((w) => w.kind === 'Corrective' && ids.has(w.occurrenceId));
    const failsByAsset = new Map<string, number>();
    corrective.forEach((w) => failsByAsset.set(w.assetId, (failsByAsset.get(w.assetId) ?? 0) + 1));
    const durations = completed.map((o) => o.completion?.durationMinutes ?? 0).filter(Boolean);
    return {
      planned: occurrences.length,
      scheduled: occurrences.filter((o) => ['Scheduled', 'Assigned', 'Confirmed'].includes(o.status)).length,
      completed: completed.length,
      due: occurrences.filter((o) => { const c = dueCategory(o, day); return c === 'Due Today' || c === 'Due Tomorrow' || c === 'Due This Week'; }).length,
      overdue: occurrences.filter((o) => effectiveStatus(o, day) === 'Overdue').length,
      missed: occurrences.filter((o) => o.status === 'Missed').length,
      rescheduled: occurrences.filter((o) => o.reschedules.length > 0).length,
      compliance: pct(completed.length, decided.length),
      onTime: pct(onTime.length, completed.length),
      avgCompletionMinutes: durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null,
      repeatFailureRate: failsByAsset.size ? Math.round(([...failsByAsset.values()].filter((n) => n > 1).length / failsByAsset.size) * 100) : 0,
      correctiveGenerated: corrective.length,
      preventiveVsCorrective: `${completed.length} : ${corrective.length}`,
      partsConsumption: completed.reduce((s, o) => s + (o.completion?.partsUsed.reduce((a, u) => a + u.quantity, 0) ?? 0), 0),
      cost: completed.reduce((s, o) => s + occurrenceCost(this.db, o), 0),
      technicianHours: Math.round(durations.reduce((s, d) => s + d, 0) / 6) / 10,
    };
  }

  planItem(p: MaintenancePlan): PlanListItem {
    const occ = this.db.occurrences.filter((o) => o.planId === p.id);
    const day = today();
    const open = occ.filter((o) => OPEN_STATUSES.includes(o.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const perf = this.performance(occ);
    const wos = this.db.workOrders.filter((w) => w.planId === p.id && w.kind === 'Preventive');
    return {
      ...p,
      customerName: this.customerName(p.location.customerId),
      siteName: this.siteName(p.location.siteId),
      assetNames: p.assetIds.map((id) => this.assetName(id)),
      serviceName: this.serviceName(p.service.serviceId),
      frequencyLabel: frequencyLabel(p),
      nextDueDate: open[0]?.dueDate ?? null,
      nextScheduledDate: open.filter((o) => o.scheduledDate >= day).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]?.scheduledDate ?? null,
      lastCompletedDate: occ.filter((o) => o.completion).map((o) => o.completion!.endedAt.slice(0, 10)).sort().at(-1) ?? null,
      kpis: {
        planned: occ.length, completed: perf.completed, pending: open.length, due: perf.due, overdue: perf.overdue, missed: perf.missed, rescheduled: perf.rescheduled, workOrders: wos.length, completedWorkOrders: wos.filter((w) => w.status === 'Completed').length,
        partsUsed: perf.partsConsumption, cost: perf.cost, avgCompletionMinutes: perf.avgCompletionMinutes, compliance: perf.compliance,
      },
    };
  }

  assetPerformance(): AssetPerformanceRow[] {
    const byAsset = new Map<string, Occurrence[]>();
    this.db.occurrences.forEach((o) => byAsset.set(o.assetId, [...(byAsset.get(o.assetId) ?? []), o]));
    return [...byAsset.entries()].map(([assetId, list]) => {
      const a = this.db.reference.assets.find((x) => x.id === assetId)!;
      const perf = this.performance(list);
      const corrective = this.db.workOrders.filter((w) => w.kind === 'Corrective' && w.assetId === assetId).length;
      const downtime = corrective * 6 + perf.missed * 2;
      return { assetId, assetName: this.assetName(assetId), category: a.category, siteName: this.siteName(a.siteId), maintenanceFrequency: perf.completed, breakdowns: corrective, repeatFailures: Math.max(0, corrective - 1), cost: perf.cost, downtimeHours: downtime, availability: Math.round((1 - downtime / (180 * 24)) * 1000) / 10, compliance: perf.compliance, corrective };
    }).sort((x, y) => y.breakdowns - x.breakdowns || y.cost - x.cost);
  }
}
