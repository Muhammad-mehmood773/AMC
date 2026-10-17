import { Injectable } from '@angular/core';
import { daysBetween } from '@shared/utils/format';
import type { Amc, AmcFinancials, AmcListItem, AmcStatus, Consumption } from '../../models/amc.model';
import type {
  AmcHistoryAction,
  AmcHistoryEntity,
  BillingLine,
  BillingListItem,
  BillingStatus,
  CoverageLine,
  CoverageListItem,
  PmEvent,
  PmEventListItem,
  PmStatus,
  Visit,
  VisitListItem,
} from '../../models/operations.model';
import { AMC_RULES } from '../amc.config';
import { type AmcDatabase, buildAmcSeed, today } from './amc-seed';

const OPEN_REQUEST = ['New', 'Assigned', 'In Progress', 'On Hold', 'Scheduled'];
const pct = (used: number, total: number | null) => (total ? Math.round((used / total) * 1000) / 10 : null);

/** In-memory database for the AMC mock adapters; derives read models. */
@Injectable()
export class MockAmcStore {
  readonly db: AmcDatabase = buildAmcSeed();
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

  log(action: AmcHistoryAction, entity: AmcHistoryEntity, entityId: string, amcId: string | null, comments: string, previousValue: string | null = null, newValue: string | null = null, reference: string | null = null): void {
    this.db.history.unshift({ id: this.uid('AH'), timestamp: this.now(), user: this.user, action, entity, entityId, amcId, label: amcId ?? entityId, previousValue, newValue, reference, comments });
  }

  amc(id: string): Amc | undefined {
    return this.db.amcs.find((a) => a.id === id);
  }

  replace(next: Amc): void {
    this.db.amcs = this.db.amcs.map((a) => (a.id === next.id ? next : a));
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

  serviceName(id: string | null | undefined): string {
    return (id && this.db.reference.services.find((s) => s.id === id)?.name) || '';
  }

  effectiveStatus(a: Amc): AmcStatus {
    if (a.status === 'Pending Activation' && a.approval === 'Approved' && a.period.startDate <= today() && a.period.endDate >= today()) return 'Pending Activation';
    if (a.status !== 'Active') return a.status;
    if (a.period.endDate < today()) return 'Expired';
    return daysBetween(new Date(), a.period.endDate) <= AMC_RULES.expiringWindowDays ? 'Expiring Soon' : 'Active';
  }

  pmStatus(e: PmEvent): PmStatus {
    const open = e.status === 'Planned' || e.status === 'Scheduled' || e.status === 'Assigned' || e.status === 'Rescheduled';
    return open && e.dueDate < today() ? 'Overdue' : e.status;
  }

  billingStatus(b: BillingLine): BillingStatus {
    return (b.status === 'Invoiced' || b.status === 'Partially Paid') && b.dueDate < today() ? 'Overdue' : b.status;
  }

  coverageStatus(c: CoverageLine): CoverageLine['status'] {
    return c.status === 'Active' && c.endDate < today() ? 'Expired' : c.status;
  }

  /** SRS 6.12 — consumption derived from completed covered visits. */
  consumption(a: Amc): Consumption {
    const visits = this.db.visits.filter((v) => v.amcId === a.id && v.status === 'Completed' && v.covered);
    const usedVisits = visits.length;
    const usedHours = Math.round(visits.reduce((s, v) => s + v.hours, 0) * 10) / 10;
    const usedPartsValue = visits.reduce((s, v) => s + v.partsValue, 0);
    const usedCallOuts = visits.filter((v) => v.type === 'Breakdown' || v.type === 'Emergency').length;
    const included = a.maintenance.visitsIncluded;
    const visitUtilization = pct(usedVisits, included) ?? 0;
    const hourUtilization = pct(usedHours, a.limits.maxHours);
    const partsUtilization = pct(usedPartsValue, a.limits.maxPartsValue);
    const callUtilization = pct(usedCallOuts, a.limits.maxCallOuts);
    const parts = [visitUtilization, hourUtilization, partsUtilization].filter((x): x is number => x !== null);
    const alerts: string[] = [];
    const check = (label: string, value: number | null) => {
      if (value === null) return;
      if (value > 100) alerts.push(`${label} over-consumed (${value}%).`);
      else if (value >= AMC_RULES.usageAlertPercent) alerts.push(`${label} at ${value}% of the included limit.`);
    };
    check('Visits', visitUtilization);
    check('Service hours', hourUtilization);
    check('Parts value', partsUtilization);
    check('Call-outs', callUtilization);
    return {
      includedVisits: included, usedVisits, remainingVisits: Math.max(0, included - usedVisits),
      includedHours: a.limits.maxHours, usedHours, remainingHours: a.limits.maxHours === null ? null : Math.max(0, Math.round((a.limits.maxHours - usedHours) * 10) / 10),
      includedPartsValue: a.limits.maxPartsValue, usedPartsValue, remainingPartsValue: a.limits.maxPartsValue === null ? null : Math.max(0, a.limits.maxPartsValue - usedPartsValue),
      includedCallOuts: a.limits.maxCallOuts, usedCallOuts, remainingCallOuts: a.limits.maxCallOuts === null ? null : Math.max(0, a.limits.maxCallOuts - usedCallOuts),
      visitUtilization, hourUtilization, partsUtilization,
      overallUtilization: parts.length ? Math.round((parts.reduce((s, x) => s + x, 0) / parts.length) * 10) / 10 : 0,
      alerts,
      overConsumed: [visitUtilization, hourUtilization, partsUtilization, callUtilization].some((x) => x !== null && x > 100),
    };
  }

  /** SRS 6.21 — revenue, cost and gross profit. */
  financials(a: Amc): AmcFinancials {
    const bills = this.db.billing.filter((b) => b.amcId === a.id && b.status !== 'Cancelled');
    const invoiced = bills.filter((b) => ['Invoiced', 'Partially Paid', 'Paid'].includes(b.status)).reduce((s, b) => s + b.amount - b.discount, 0);
    const collected = bills.reduce((s, b) => s + b.paidAmount, 0);
    const invoicedGross = bills.filter((b) => ['Invoiced', 'Partially Paid', 'Paid'].includes(b.status)).reduce((s, b) => s + b.net, 0);
    const visits = this.db.visits.filter((v) => v.amcId === a.id && v.status === 'Completed');
    const laborCost = Math.round(visits.reduce((s, v) => s + v.hours, 0) * AMC_RULES.laborRatePerHour);
    const partsCost = visits.reduce((s, v) => s + v.partsValue, 0);
    const consumablesCost = visits.reduce((s, v) => s + v.consumablesValue, 0);
    const travelCost = visits.length * AMC_RULES.travelCostPerVisit;
    const subcontractorCost = a.type === 'Full-Service Maintenance Contract' ? Math.round(invoiced * 0.12) : 0;
    const otherCost = Math.round(visits.length * 25);
    const totalCost = laborCost + partsCost + consumablesCost + travelCost + subcontractorCost + otherCost;
    const grossProfit = invoiced - totalCost;
    return {
      contractValue: a.commercial.value, invoiced, collected, outstanding: Math.max(0, invoicedGross - collected), laborCost, partsCost, consumablesCost, travelCost, subcontractorCost, otherCost, totalCost,
      grossProfit, grossMargin: invoiced ? Math.round((grossProfit / invoiced) * 1000) / 10 : 0,
    };
  }

  item(a: Amc): AmcListItem {
    const ref = this.db.reference;
    const customer = ref.customers.find((c) => c.id === a.customer.customerId);
    const parent = ref.contracts.find((c) => c.id === a.parentContractId);
    const events = this.db.events.filter((e) => e.amcId === a.id);
    const requests = ref.requests.filter((r) => a.scope.siteIds.includes(r.siteId) && OPEN_REQUEST.includes(r.status));
    return {
      ...a,
      effectiveStatus: this.effectiveStatus(a),
      customerName: customer?.name ?? '',
      customerCode: customer?.code ?? '',
      siteNames: a.scope.siteIds.map((id) => this.siteName(id)),
      contractManagerName: ref.users.find((u) => u.id === a.customer.contractManagerId)?.name ?? '',
      parentContractNumber: parent?.number ?? null,
      parentContractStatus: parent?.status ?? null,
      daysRemaining: daysBetween(new Date(), a.period.endDate),
      consumption: this.consumption(a),
      financials: this.financials(a),
      upcomingPm: events.filter((e) => ['Planned', 'Scheduled', 'Assigned'].includes(this.pmStatus(e)) && e.scheduledDate <= this.addDays(today(), AMC_RULES.upcomingDays)).length,
      overduePm: events.filter((e) => this.pmStatus(e) === 'Overdue').length,
      openRequests: requests.filter((r) => r.kind === 'Service Request').length,
      openWorkOrders: requests.filter((r) => r.kind === 'Work Order').length,
      renewedById: this.db.amcs.find((x) => x.previousAmcId === a.id)?.id ?? null,
    };
  }

  eventItem(e: PmEvent): PmEventListItem {
    const a = this.amc(e.amcId);
    return {
      ...e, effectiveStatus: this.pmStatus(e), amcNumber: a?.number ?? e.amcId, customerName: this.customerName(a?.customer.customerId), siteName: this.siteName(e.siteId), assetName: this.assetName(e.assetId),
      serviceName: this.serviceName(e.serviceId), daysToDue: daysBetween(new Date(), e.dueDate),
    };
  }

  visitItem(v: Visit): VisitListItem {
    const a = this.amc(v.amcId);
    return { ...v, amcNumber: a?.number ?? v.amcId, customerName: this.customerName(a?.customer.customerId), siteName: this.siteName(v.siteId), assetNames: v.assetIds.map((id) => this.assetName(id)), serviceName: v.serviceId ? this.serviceName(v.serviceId) : null };
  }

  billingItem(b: BillingLine): BillingListItem {
    const a = this.amc(b.amcId);
    return { ...b, effectiveStatus: this.billingStatus(b), amcNumber: a?.number ?? b.amcId, customerName: this.customerName(a?.customer.customerId), billingFrequency: a?.commercial.billingFrequency ?? '' };
  }

  coverageItem(c: CoverageLine): CoverageListItem {
    const a = this.amc(c.amcId);
    const target =
      c.level === 'Customer' ? this.customerName(a?.customer.customerId) : c.level === 'Site' ? this.siteName(c.siteId) : c.level === 'Asset' ? this.assetName(c.assetId) : c.level === 'Asset Category' ? (c.assetCategory ?? '') : this.serviceName(c.serviceId);
    return { ...c, effectiveStatus: this.coverageStatus(c), amcNumber: a?.number ?? c.amcId, customerName: this.customerName(a?.customer.customerId), target };
  }

  addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
