import type { DataColumn } from '@shared/ui/data-table';
import type { AmcListItem } from '../models/amc.model';
import { AMC_STATUS_TONE, BILLING_TONE, COVERAGE_STATUS_TONE, PM_TONE, VISIT_TONE } from '../models/display';
import type { BillingListItem, CoverageListItem, PmEventListItem, ServicePlanListItem, VisitListItem } from '../models/operations.model';

const amcLink = (id: string) => `/app/amc-agreements/${id}`;

/** SRS 6.5 list columns. */
export function amcColumns(showCustomer = true): DataColumn<AmcListItem>[] {
  return [
    { key: 'title', label: 'AMC', value: (a) => a.title, secondary: (a) => `${a.number} · v${a.version}`, link: (a) => amcLink(a.id), sortable: true, mobile: 'title', width: 280, hideable: false },
    { key: 'number', label: 'AMC Number', value: (a) => a.number, type: 'mono', sortable: true, visibility: '2xl', width: 130 },
    { key: 'type', label: 'AMC Type', value: (a) => a.type, sortable: true, visibility: 'xl', width: 220 },
    ...(showCustomer ? [{ key: 'customer', label: 'Customer', value: (a: AmcListItem) => a.customerName, secondary: (a: AmcListItem) => a.customerCode, link: (a: AmcListItem) => `/app/customers/${a.customer.customerId}`, sortable: true, visibility: 'md' as const, mobile: 'meta' as const, width: 220 }] : []),
    { key: 'sites', label: 'Covered Sites', value: (a) => a.scope.siteIds.length, type: 'number', sortable: true, visibility: 'lg', width: 110 },
    { key: 'assets', label: 'Covered Assets', value: (a) => a.scope.assetIds.length, type: 'number', sortable: true, visibility: 'lg', width: 120 },
    { key: 'start', label: 'Start Date', value: (a) => a.period.startDate, type: 'date', sortable: true, visibility: 'xl', width: 120 },
    { key: 'end', label: 'End Date', value: (a) => a.period.endDate, type: 'date', sortable: true, visibility: 'md', mobile: 'meta', width: 120 },
    { key: 'renewal', label: 'Renewal Date', value: (a) => a.period.renewalDate, type: 'date', sortable: true, visibility: '2xl', width: 120 },
    { key: 'value', label: 'Contract Value', value: (a) => a.commercial.value, type: 'currency', currency: (a) => a.commercial.currency, sortable: true, visibility: 'lg', width: 140 },
    { key: 'included', label: 'Visits Included', value: (a) => a.consumption.includedVisits, type: 'number', visibility: '2xl', width: 110 },
    { key: 'used', label: 'Visits Used', value: (a) => a.consumption.usedVisits, type: 'number', sortable: true, visibility: 'xl', width: 100 },
    { key: 'remaining', label: 'Visits Remaining', value: (a) => a.consumption.remainingVisits, type: 'badge', tone: (a) => (a.consumption.overConsumed ? 'danger' : a.consumption.visitUtilization >= 80 ? 'warn' : 'ok'), sortable: true, visibility: 'lg', width: 120 },
    { key: 'status', label: 'Status', value: (a) => a.effectiveStatus, type: 'badge', tone: (a) => AMC_STATUS_TONE[a.effectiveStatus], sortable: true, mobile: 'badge', width: 140 },
  ];
}

export function coverageColumns(showAmc = true): DataColumn<CoverageListItem>[] {
  return [
    { key: 'target', label: 'Covered', value: (c) => c.target, secondary: (c) => `${c.level} level`, mobile: 'title', sortable: true, width: 240 },
    ...(showAmc ? [{ key: 'amc', label: 'AMC', value: (c: CoverageListItem) => c.amcNumber, secondary: (c: CoverageListItem) => c.customerName, link: (c: CoverageListItem) => amcLink(c.amcId), sortable: true, visibility: 'md' as const, width: 200 }] : []),
    { key: 'type', label: 'Coverage Type', value: (c) => c.coverageType, sortable: true, mobile: 'meta', width: 180 },
    { key: 'labor', label: 'Labor', value: (c) => c.labor, type: 'badge', tone: (c) => (c.labor === 'Included' ? 'ok' : c.labor === 'Excluded' ? 'danger' : 'warn'), visibility: 'lg', width: 140 },
    { key: 'parts', label: 'Parts', value: (c) => c.parts, visibility: 'lg', width: 150 },
    { key: 'limits', label: 'Restrictions', value: (c) => [c.maxVisits !== null ? `${c.maxVisits} visits` : '', c.maxHours !== null ? `${c.maxHours} h` : '', c.maxPartsValue !== null ? `parts ≤ ${c.maxPartsValue.toLocaleString('en-US')}` : '', c.maxCallOuts !== null ? `${c.maxCallOuts} call-outs` : ''].filter(Boolean).join(' · ') || 'None', visibility: 'xl', width: 260 },
    { key: 'hours', label: 'Service Hours', value: (c) => c.serviceHours, visibility: '2xl', width: 130 },
    { key: 'period', label: 'Period', value: (c) => `${c.startDate} → ${c.endDate}`, visibility: '2xl', width: 200 },
    { key: 'status', label: 'Status', value: (c) => c.effectiveStatus, type: 'badge', tone: (c) => COVERAGE_STATUS_TONE[c.effectiveStatus], mobile: 'badge', width: 110 },
  ];
}

export function planColumns(showAmc = true): DataColumn<ServicePlanListItem>[] {
  return [
    { key: 'service', label: 'Service', value: (p) => p.serviceName, secondary: (p) => p.serviceType, mobile: 'title', sortable: true, width: 240 },
    ...(showAmc ? [{ key: 'amc', label: 'AMC', value: (p: ServicePlanListItem) => p.amcNumber, secondary: (p: ServicePlanListItem) => p.customerName, link: (p: ServicePlanListItem) => amcLink(p.amcId), sortable: true, visibility: 'md' as const, width: 200 }] : []),
    { key: 'frequency', label: 'Frequency', value: (p) => p.frequency, secondary: (p) => `${p.occurrences} / asset / year`, sortable: true, mobile: 'meta', width: 150 },
    { key: 'assets', label: 'Assets', value: (p) => p.assetCount, type: 'number', visibility: 'lg', width: 90 },
    { key: 'duration', label: 'Std. Duration', value: (p) => `${p.durationHours} h`, visibility: 'xl', width: 110 },
    { key: 'skill', label: 'Required Skill / Team', value: (p) => p.skill, secondary: (p) => p.team, visibility: 'xl', width: 190 },
    { key: 'checklist', label: 'Checklist', value: (p) => p.checklist, visibility: '2xl', width: 230 },
    { key: 'events', label: 'Events', value: (p) => `${p.completedEvents} / ${p.plannedEvents}`, secondary: () => 'completed / scheduled', visibility: 'lg', width: 120 },
    { key: 'status', label: 'Status', value: (p) => (p.active ? 'Active' : 'Inactive'), type: 'badge', tone: (p) => (p.active ? 'ok' : 'neutral'), mobile: 'badge', width: 100 },
  ];
}

export function pmColumns(showAmc = true): DataColumn<PmEventListItem>[] {
  return [
    { key: 'asset', label: 'Asset', value: (e) => e.assetName, secondary: (e) => `${e.number} · ${e.siteName}`, link: (e) => `/app/assets/${e.assetId}`, mobile: 'title', sortable: true, width: 260 },
    ...(showAmc ? [{ key: 'amc', label: 'AMC', value: (e: PmEventListItem) => e.amcNumber, secondary: (e: PmEventListItem) => e.customerName, link: (e: PmEventListItem) => amcLink(e.amcId), sortable: true, visibility: 'md' as const, width: 190 }] : []),
    { key: 'service', label: 'Service', value: (e) => e.serviceName, secondary: (e) => e.maintenanceType, visibility: 'lg', width: 200 },
    { key: 'scheduled', label: 'Scheduled Date', value: (e) => e.scheduledDate, type: 'date', secondary: (e) => (e.rescheduledFrom ? `from ${e.rescheduledFrom}` : null), sortable: true, mobile: 'meta', width: 140 },
    { key: 'due', label: 'Due Date', value: (e) => e.dueDate, type: 'date', sortable: true, visibility: 'xl', width: 120 },
    { key: 'assigned', label: 'Team / Technician', value: (e) => e.technician ?? 'Unassigned', secondary: (e) => e.team, visibility: 'lg', width: 170 },
    { key: 'priority', label: 'Priority', value: (e) => e.priority, type: 'badge', tone: (e) => (e.priority === 'Critical' ? 'danger' : e.priority === 'High' ? 'warn' : 'neutral'), visibility: '2xl', width: 100 },
    { key: 'wo', label: 'Work Order', value: (e) => e.workOrder, type: 'mono', visibility: '2xl', width: 110 },
    { key: 'status', label: 'Status', value: (e) => (e.escalated && e.effectiveStatus === 'Overdue' ? 'Overdue · Escalated' : e.effectiveStatus), type: 'badge', tone: (e) => PM_TONE[e.effectiveStatus], sortable: true, mobile: 'badge', width: 150 },
  ];
}

export function visitColumns(showAmc = true): DataColumn<VisitListItem>[] {
  return [
    { key: 'number', label: 'Visit', value: (v) => `${v.type} · ${v.siteName}`, secondary: (v) => `${v.number}${v.assetNames.length ? ` · ${v.assetNames.length} asset(s)` : ''}`, mobile: 'title', sortable: true, width: 280 },
    ...(showAmc ? [{ key: 'amc', label: 'AMC', value: (v: VisitListItem) => v.amcNumber, secondary: (v: VisitListItem) => v.customerName, link: (v: VisitListItem) => amcLink(v.amcId), sortable: true, visibility: 'md' as const, width: 190 }] : []),
    { key: 'date', label: 'Planned Date', value: (v) => v.plannedDate, type: 'date', secondary: (v) => v.window, sortable: true, mobile: 'meta', width: 150 },
    { key: 'tech', label: 'Technician / Team', value: (v) => v.technician ?? 'Unassigned', secondary: (v) => v.team, visibility: 'lg', width: 170 },
    { key: 'service', label: 'Service', value: (v) => v.serviceName, visibility: 'xl', width: 200 },
    { key: 'hours', label: 'Hours', value: (v) => (v.status === 'Completed' ? v.hours : null), type: 'number', visibility: 'xl', width: 80 },
    { key: 'parts', label: 'Parts', value: (v) => (v.partsValue ? v.partsValue : null), type: 'number', visibility: '2xl', width: 90 },
    { key: 'wo', label: 'Work Order', value: (v) => v.workOrder, type: 'mono', visibility: 'lg', width: 110 },
    { key: 'covered', label: 'Coverage', value: (v) => (v.status !== 'Completed' ? '—' : v.covered ? 'Covered' : 'Billable'), type: 'badge', tone: (v) => (v.status !== 'Completed' ? 'neutral' : v.covered ? 'ok' : 'danger'), visibility: 'xl', width: 100 },
    { key: 'status', label: 'Status', value: (v) => v.status, type: 'badge', tone: (v) => VISIT_TONE[v.status], sortable: true, mobile: 'badge', width: 120 },
  ];
}

export function billingColumns(showAmc = true): DataColumn<BillingListItem>[] {
  return [
    { key: 'number', label: 'Billing Schedule', value: (b) => b.period, secondary: (b) => b.number, mobile: 'title', sortable: true, width: 240 },
    ...(showAmc ? [{ key: 'amc', label: 'AMC', value: (b: BillingListItem) => b.amcNumber, secondary: (b: BillingListItem) => b.customerName, link: (b: BillingListItem) => amcLink(b.amcId), sortable: true, visibility: 'md' as const, width: 190 }] : []),
    { key: 'frequency', label: 'Frequency', value: (b) => b.billingFrequency, visibility: '2xl', width: 110 },
    { key: 'date', label: 'Billing Date', value: (b) => b.billingDate, type: 'date', sortable: true, mobile: 'meta', width: 120 },
    { key: 'due', label: 'Due Date', value: (b) => b.dueDate, type: 'date', sortable: true, visibility: 'lg', width: 120 },
    { key: 'amount', label: 'Amount', value: (b) => b.amount, type: 'currency', currency: (b) => b.currency, visibility: 'xl', width: 120 },
    { key: 'discount', label: 'Discount', value: (b) => b.discount, type: 'currency', currency: (b) => b.currency, visibility: '2xl', width: 110 },
    { key: 'tax', label: 'Tax', value: (b) => b.tax, type: 'currency', currency: (b) => b.currency, visibility: '2xl', width: 110 },
    { key: 'net', label: 'Net Amount', value: (b) => b.net, type: 'currency', currency: (b) => b.currency, sortable: true, visibility: 'md', width: 130 },
    { key: 'paid', label: 'Paid', value: (b) => b.paidAmount, type: 'currency', currency: (b) => b.currency, visibility: 'xl', width: 120 },
    { key: 'invoice', label: 'Invoice', value: (b) => b.invoiceNumber, type: 'mono', visibility: 'lg', width: 110 },
    { key: 'status', label: 'Billing Status', value: (b) => (b.onHold && b.effectiveStatus === 'Planned' ? 'Planned · On hold' : b.effectiveStatus), type: 'badge', tone: (b) => BILLING_TONE[b.effectiveStatus], sortable: true, mobile: 'badge', width: 150 },
  ];
}
