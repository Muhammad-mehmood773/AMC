import { Injectable } from '@angular/core';
import { daysBetween } from '@shared/utils/format';
import type {
  EscalationEventListItem,
  PerformanceDimension,
  PerformanceRow,
  SlaBreachListItem,
  SlaClock,
  SlaClockListItem,
  SlaCoverage,
  SlaCoverageListItem,
  SlaHistoryAction,
  SlaHistoryEntity,
  SlaMapping,
  SlaMappingListItem,
  SlaPerformance,
} from '../../models/operations.model';
import { ESCALATION_LEVELS } from '../../models/operations.model';
import type { Sla, SlaListItem } from '../../models/sla.model';
import { SLA_RULES } from '../sla.config';
import { type SlaDatabase, calendar, clockMetrics, slaStatus, specificity, tick, today } from './sla-engine';
import { buildSlaSeed } from './sla-seed';

const pct = (a: number, total: number) => (total ? Math.round((a / total) * 1000) / 10 : null);
const avg = (values: number[]) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null);

/** In-memory SLA database; runs automatic monitoring (SRS 7.19) on every read. */
@Injectable()
export class MockSlaStore {
  readonly db: SlaDatabase = buildSlaSeed();
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

  log(action: SlaHistoryAction, entity: SlaHistoryEntity, entityId: string, slaId: string | null, comments: string, previousValue: string | null = null, newValue: string | null = null, reference: string | null = null): void {
    this.db.history.unshift({ id: this.uid('SH'), timestamp: this.now(), user: this.user, action, entity, entityId, slaId, label: slaId ?? entityId, previousValue, newValue, reference, comments });
  }

  monitor(): void {
    const events = tick(this.db, Date.now(), (p) => this.uid(p));
    for (const e of events) this.db.history.unshift({ ...e, id: this.uid('SH') });
  }

  sla(id: string): Sla | undefined {
    return this.db.slas.find((s) => s.id === id);
  }

  replace(next: Sla): void {
    this.db.slas = this.db.slas.map((s) => (s.id === next.id ? next : s));
  }

  customerName(id: string | null | undefined): string {
    return (id && this.db.reference.customers.find((c) => c.id === id)?.name) || '';
  }

  siteName(id: string | null | undefined): string {
    return (id && this.db.reference.sites.find((s) => s.id === id)?.name) || '';
  }

  assetName(id: string | null | undefined): string | null {
    const a = id ? this.db.reference.assets.find((x) => x.id === id) : undefined;
    return a ? `${a.id} · ${a.name}` : null;
  }

  serviceName(id: string | null | undefined): string | null {
    return (id && this.db.reference.services.find((s) => s.id === id)?.name) || null;
  }

  clockItem(c: SlaClock, now = Date.now()): SlaClockListItem {
    const m = clockMetrics(this.db, c, now);
    const s = this.sla(c.slaId);
    const breached = m.consumption >= 100;
    const monitoring: SlaClockListItem['monitoringStatus'] =
      c.status === 'Met' || c.status === 'Cancelled' || c.status === 'Not Started' ? c.status : c.stoppedAt ? 'Breached' : breached ? 'Breached' : c.status === 'Paused' ? 'Paused' : m.consumption >= c.escalationPercent ? 'Critical' : m.consumption >= c.warningPercent ? 'Warning' : 'Running';
    const events = this.db.events.filter((e) => e.clockId === c.id);
    const top = events.reduce((max, e) => Math.max(max, e.level), 0);
    return {
      ...c,
      monitoringStatus: monitoring,
      warningLevel: breached ? 'Breached' : m.consumption >= c.escalationPercent ? 'Critical' : m.consumption >= c.warningPercent ? 'Warning' : 'Normal',
      slaNumber: s?.number ?? c.slaId,
      slaName: s?.name ?? '',
      customerName: this.customerName(c.customerId),
      siteName: this.siteName(c.siteId),
      assetName: this.assetName(c.assetId),
      serviceName: this.serviceName(c.serviceId),
      elapsedMinutes: Math.round(m.elapsed),
      remainingMinutes: Math.round(m.remaining),
      pausedMinutes: Math.round(m.paused),
      consumption: m.consumption,
      dueAt: new Date(m.dueAt).toISOString(),
      breachRisk: breached ? 'Breached' : m.consumption >= c.escalationPercent ? 'High' : m.consumption >= c.warningPercent ? 'Medium' : 'Low',
      escalationStatus: top ? `Level ${top} — ${ESCALATION_LEVELS[top - 1]?.split(' — ')[1] ?? ''}` : 'None',
      breachId: this.db.breaches.find((b) => b.clockId === c.id)?.id ?? null,
    };
  }

  breachItem(id: string): SlaBreachListItem {
    const b = this.db.breaches.find((x) => x.id === id)!;
    const c = this.db.clocks.find((x) => x.id === b.clockId)!;
    const s = this.sla(b.slaId);
    const m = clockMetrics(this.db, c);
    const events = this.db.events.filter((e) => e.clockId === c.id);
    const windowStart = new Date(new Date(b.targetAt).getTime() - SLA_RULES.repeatedBreachDays * 86_400_000).toISOString();
    const repeated = this.db.breaches.some((o) => o.id !== b.id && o.targetAt >= windowStart && o.targetAt < b.targetAt && this.db.clocks.find((x) => x.id === o.clockId)?.customerId === c.customerId);
    return {
      ...b,
      slaNumber: s?.number ?? b.slaId,
      slaName: s?.name ?? '',
      customerId: c.customerId,
      customerName: this.customerName(c.customerId),
      transactionType: c.transactionType,
      transactionNumber: c.transactionNumber,
      siteName: this.siteName(c.siteId),
      assetName: this.assetName(c.assetId),
      serviceName: this.serviceName(c.serviceId),
      priority: c.priority,
      targetType: c.targetType,
      breachMinutes: Math.max(0, Math.round((b.actualMinutes ?? m.elapsed) - b.targetMinutes)),
      team: c.team,
      technician: c.technician,
      escalationStatus: events.length ? `Level ${Math.max(...events.map((e) => e.level))} · ${events.filter((e) => e.status === 'Open').length} open` : 'Not escalated',
      repeated,
    };
  }

  eventItem(id: string): EscalationEventListItem {
    const e = this.db.events.find((x) => x.id === id)!;
    const c = this.db.clocks.find((x) => x.id === e.clockId)!;
    return { ...e, slaNumber: this.sla(e.slaId)?.number ?? e.slaId, transactionNumber: c.transactionNumber, customerName: this.customerName(c.customerId), priority: c.priority, targetType: c.targetType, levelName: ESCALATION_LEVELS[e.level - 1] ?? `Level ${e.level}` };
  }

  /** SRS 7.15 — measured from actual clock data. */
  performance(clocks: readonly SlaClock[]): SlaPerformance {
    const items = clocks.filter((c) => c.status !== 'Cancelled').map((c) => this.clockItem(c));
    const decided = items.filter((c) => c.monitoringStatus === 'Met' || c.monitoringStatus === 'Breached');
    const resp = decided.filter((c) => c.targetType === 'First Response' || c.targetType === 'On-Site Arrival');
    const reso = decided.filter((c) => c.targetType === 'Resolution');
    const breaches = this.db.breaches.filter((b) => items.some((c) => c.id === b.clockId));
    const ids = new Set(items.map((c) => c.id));
    const txIds = new Set(items.map((c) => c.transactionId));
    const byCustomer = new Map<string, number>();
    breaches.forEach((b) => {
      const cid = this.db.clocks.find((c) => c.id === b.clockId)!.customerId;
      byCustomer.set(cid, (byCustomer.get(cid) ?? 0) + 1);
    });
    const met = decided.filter((c) => c.monitoringStatus === 'Met').length;
    const resolvedTx = new Set(reso.filter((c) => c.monitoringStatus === 'Met').map((c) => c.transactionId));
    return {
      total: items.length,
      requests: new Set(items.filter((c) => c.transactionType === 'Service Request').map((c) => c.transactionId)).size,
      workOrders: new Set(items.filter((c) => c.transactionType === 'Work Order').map((c) => c.transactionId)).size,
      met,
      breached: decided.length - met,
      compliance: pct(met, decided.length),
      responseMet: resp.filter((c) => c.monitoringStatus === 'Met').length,
      responseBreached: resp.filter((c) => c.monitoringStatus === 'Breached').length,
      responseCompliance: pct(resp.filter((c) => c.monitoringStatus === 'Met').length, resp.length),
      resolutionMet: reso.filter((c) => c.monitoringStatus === 'Met').length,
      resolutionBreached: reso.filter((c) => c.monitoringStatus === 'Breached').length,
      resolutionCompliance: pct(reso.filter((c) => c.monitoringStatus === 'Met').length, reso.length),
      avgResponseMinutes: avg(resp.filter((c) => c.stoppedAt).map((c) => c.elapsedMinutes)),
      avgResolutionMinutes: avg(reso.filter((c) => c.stoppedAt).map((c) => c.elapsedMinutes)),
      avgBreachMinutes: avg(breaches.map((b) => this.breachItem(b.id).breachMinutes)),
      escalations: this.db.events.filter((e) => ids.has(e.clockId)).length,
      repeatedBreaches: [...byCustomer.values()].filter((n) => n > 1).reduce((s, n) => s + n - 1, 0),
      firstResponseCompliance: pct(decided.filter((c) => c.targetType === 'First Response' && c.monitoringStatus === 'Met').length, decided.filter((c) => c.targetType === 'First Response').length),
      onTimeResolution: pct(resolvedTx.size, new Set(reso.map((c) => c.transactionId)).size),
      availability: pct(items.length - breaches.filter((b) => b.breachType === 'Restoration Breach').length, items.length),
      firstTimeResolution: pct(resolvedTx.size, txIds.size),
    };
  }

  breakdown(dimension: PerformanceDimension, clocks: readonly SlaClock[]): PerformanceRow[] {
    const key = (c: SlaClock): [string, string] | null => {
      switch (dimension) {
        case 'Customer':
          return [c.customerId, this.customerName(c.customerId)];
        case 'SLA':
          return [c.slaId, `${this.sla(c.slaId)?.number} · ${this.sla(c.slaId)?.name}`];
        case 'Contract': {
          const s = this.sla(c.slaId);
          return s?.contract.contractId ? [s.contract.contractId, this.db.reference.contracts.find((x) => x.id === s.contract.contractId)?.number ?? s.contract.contractId] : null;
        }
        case 'AMC': {
          const s = this.sla(c.slaId);
          return s?.contract.amcId ? [s.contract.amcId, s.contract.amcId] : null;
        }
        case 'Service':
          return c.serviceId ? [c.serviceId, this.serviceName(c.serviceId) ?? c.serviceId] : ['none', 'Unspecified service'];
        case 'Site':
          return [c.siteId, this.siteName(c.siteId)];
        case 'Asset':
          return c.assetId ? [c.assetId, this.assetName(c.assetId) ?? c.assetId] : null;
        case 'Priority':
          return [c.priority, c.priority];
        case 'Service Team':
          return [c.team, c.team];
        case 'Technician':
          return c.technician ? [c.technician, c.technician] : ['none', 'Unassigned'];
        case 'Region':
          return [c.region, c.region];
      }
    };
    const groups = new Map<string, { label: string; clocks: SlaClock[] }>();
    for (const c of clocks) {
      const k = key(c);
      if (!k) continue;
      const g = groups.get(k[0]) ?? { label: k[1], clocks: [] };
      g.clocks.push(c);
      groups.set(k[0], g);
    }
    return [...groups.entries()].map(([k, g]) => {
      const p = this.performance(g.clocks);
      return { key: k, label: g.label, total: p.total, met: p.met, breached: p.breached, compliance: p.compliance, avgResponseMinutes: p.avgResponseMinutes, avgResolutionMinutes: p.avgResolutionMinutes, escalations: p.escalations };
    }).sort((a, b) => b.breached - a.breached || b.total - a.total);
  }

  item(s: Sla): SlaListItem {
    const status = slaStatus(s);
    const clocks = this.db.clocks.filter((c) => c.slaId === s.id);
    const open = clocks.filter((c) => !c.stoppedAt && c.status !== 'Cancelled');
    const p = this.performance(clocks);
    const coverage = this.db.coverage.filter((c) => c.slaId === s.id && c.status === 'Active');
    const mappings = this.db.mappings.filter((m) => m.slaId === s.id && m.status === 'Active');
    const customers = new Set([...coverage.map((c) => c.customerId), ...mappings.map((m) => m.customerId), s.customer.customerId].filter(Boolean));
    const sites = new Set([...coverage.map((c) => c.siteId), ...mappings.map((m) => m.siteId)].filter(Boolean));
    const amc = this.db.reference.amcs.find((a) => a.id === s.contract.amcId);
    if (amc) amc.siteIds.forEach((x) => sites.add(x));
    const assets = new Set([...coverage.map((c) => c.assetId), ...mappings.map((m) => m.assetId)].filter(Boolean));
    if (amc) this.db.reference.assets.filter((a) => amc.siteIds.includes(a.siteId)).forEach((a) => assets.add(a.id));
    return {
      ...s,
      effectiveStatus: status,
      customerName: s.customer.customerId ? this.customerName(s.customer.customerId) : null,
      contractNumber: this.db.reference.contracts.find((c) => c.id === s.contract.contractId)?.number ?? null,
      amcNumber: amc?.number ?? null,
      serviceNames: s.scope.serviceIds.map((id) => this.serviceName(id) ?? id),
      calendarName: calendar(this.db, s.serviceHours.calendarId).name,
      daysRemaining: s.validity.expiryDate ? daysBetween(new Date(), s.validity.expiryDate) : null,
      coverage: { customers: customers.size, sites: sites.size, assets: assets.size, services: new Set([...s.scope.serviceIds, ...coverage.map((c) => c.serviceId).filter(Boolean)]).size + s.scope.serviceCategories.length },
      activeClocks: open.length,
      activeRequests: new Set(open.filter((c) => c.transactionType === 'Service Request').map((c) => c.transactionId)).size,
      activeWorkOrders: new Set(open.filter((c) => c.transactionType === 'Work Order').map((c) => c.transactionId)).size,
      breaches: this.db.breaches.filter((b) => b.slaId === s.id).length,
      openEscalations: this.db.events.filter((e) => e.slaId === s.id && e.status === 'Open').length,
      compliance: p.compliance,
      responseCompliance: p.responseCompliance,
      resolutionCompliance: p.resolutionCompliance,
      avgResponseMinutes: p.avgResponseMinutes,
      avgResolutionMinutes: p.avgResolutionMinutes,
      renewedById: this.db.slas.find((x) => x.previousSlaId === s.id)?.id ?? null,
    };
  }

  coverageItem(c: SlaCoverage): SlaCoverageListItem {
    const s = this.sla(c.slaId);
    const target =
      c.level === 'Customer' ? (c.customerId ? this.customerName(c.customerId) : 'All mapped customers') : c.level === 'Contract' ? (this.db.reference.contracts.find((x) => x.id === c.contractId)?.number ?? '') : c.level === 'AMC' ? (c.amcId ?? '') :
      c.level === 'Site' ? this.siteName(c.siteId) : c.level === 'Asset' ? (this.assetName(c.assetId) ?? '') : c.level === 'Asset Category' ? (c.assetCategory ?? '') : c.level === 'Service' ? (this.serviceName(c.serviceId) ?? '') : (c.serviceCategory ?? '');
    return { ...c, slaNumber: s?.number ?? c.slaId, slaName: s?.name ?? '', target, effectiveStatus: c.status === 'Active' && c.endDate && c.endDate < today() ? 'Expired' : c.status };
  }

  mappingItem(m: SlaMapping): SlaMappingListItem {
    const s = this.sla(m.slaId);
    const parts = [
      m.customerId && this.customerName(m.customerId), m.contractId && this.db.reference.contracts.find((c) => c.id === m.contractId)?.number, m.amcId, m.siteId && this.siteName(m.siteId), m.assetId,
      m.serviceId && this.serviceName(m.serviceId), m.serviceCategory, m.priority,
    ].filter(Boolean);
    return { ...m, slaNumber: s?.number ?? m.slaId, slaName: s?.name ?? '', slaStatus: s ? slaStatus(s) : '', scope: parts.join(' + ') || 'All transactions', specificity: specificity(m) };
  }
}
