import type { DataColumn } from '@shared/ui/data-table';
import { ASSIGN_TONE, DUE_TONE, OCC_TONE, PLAN_STATUS_TONE, PRIORITY_TONE, WO_TONE } from '../models/display';
import type { MeterRuleListItem, OccurrenceListItem, PmWorkOrderListItem } from '../models/operations.model';
import type { PlanListItem } from '../models/plan.model';

const planLink = (id: string) => `/app/preventive-maintenance/${id}`;

/** SRS 8.5 list columns. */
export function planColumns(): DataColumn<PlanListItem>[] {
  return [
    { key: 'name', label: 'Plan', value: (p) => p.name, secondary: (p) => `${p.number} · v${p.version}`, link: (p) => planLink(p.id), sortable: true, mobile: 'title', width: 280, hideable: false },
    { key: 'type', label: 'Maintenance Type', value: (p) => p.maintenanceType, secondary: (p) => p.strategy.strategy, sortable: true, visibility: 'lg', width: 190 },
    { key: 'customer', label: 'Customer / Site', value: (p) => p.customerName, secondary: (p) => p.siteName, link: (p) => `/app/customers/${p.location.customerId}`, sortable: true, visibility: 'md', mobile: 'meta', width: 220 },
    { key: 'asset', label: 'Asset', value: (p) => (p.assetIds.length === 1 ? p.assetNames[0] : `${p.assetIds.length} assets`), secondary: (p) => p.assetCategory, link: (p) => (p.assetIds.length === 1 ? `/app/assets/${p.assetIds[0]}` : null), visibility: 'xl', width: 200 },
    { key: 'service', label: 'Service', value: (p) => p.serviceName, visibility: '2xl', width: 180 },
    { key: 'frequency', label: 'Frequency', value: (p) => p.frequencyLabel, sortable: true, visibility: 'md', width: 170 },
    { key: 'nextDue', label: 'Next Due Date', value: (p) => p.nextDueDate, type: 'date', sortable: true, visibility: 'lg', width: 120 },
    { key: 'last', label: 'Last Completed', value: (p) => p.lastCompletedDate, type: 'date', sortable: true, visibility: 'xl', width: 120 },
    { key: 'nextScheduled', label: 'Next Scheduled', value: (p) => p.nextScheduledDate, type: 'date', visibility: '2xl', width: 120 },
    { key: 'team', label: 'Assigned Team', value: (p) => p.resources.team, secondary: (p) => p.resources.technician, visibility: 'xl', width: 160 },
    { key: 'compliance', label: 'Compliance', value: (p) => (p.kpis.compliance === null ? '—' : `${p.kpis.compliance}%`), type: 'badge', tone: (p) => (p.kpis.compliance === null ? 'neutral' : p.kpis.compliance >= 90 ? 'ok' : p.kpis.compliance >= 75 ? 'warn' : 'danger'), sortable: true, visibility: 'lg', width: 110 },
    { key: 'status', label: 'Status', value: (p) => p.status, type: 'badge', tone: (p) => PLAN_STATUS_TONE[p.status], sortable: true, mobile: 'badge', width: 120 },
  ];
}

export function occurrenceColumns(showPlan = true): DataColumn<OccurrenceListItem>[] {
  return [
    { key: 'number', label: 'Schedule', value: (o) => o.number, secondary: (o) => o.maintenanceType, mobile: 'title', sortable: true, width: 200 },
    ...(showPlan ? [{ key: 'plan', label: 'Maintenance Plan', value: (o: OccurrenceListItem) => o.planName, secondary: (o: OccurrenceListItem) => o.planNumber, link: (o: OccurrenceListItem) => planLink(o.planId), sortable: true, visibility: 'lg' as const, width: 240 }] : []),
    { key: 'customer', label: 'Customer / Site', value: (o) => o.customerName, secondary: (o) => o.siteName, visibility: 'md', mobile: 'meta', width: 220 },
    { key: 'asset', label: 'Asset', value: (o) => o.assetName, link: (o) => `/app/assets/${o.assetId}`, visibility: 'lg', width: 220 },
    { key: 'scheduled', label: 'Scheduled Date', value: (o) => o.scheduledDate, type: 'date', secondary: (o) => (o.scheduledDate !== o.originalDate ? `Planned ${o.originalDate}` : null), sortable: true, width: 130 },
    { key: 'due', label: 'Due Date', value: (o) => o.dueDate, type: 'date', sortable: true, visibility: 'md', width: 120 },
    { key: 'window', label: 'Window', value: (o) => o.window, visibility: '2xl', width: 200 },
    { key: 'tech', label: 'Team / Technician', value: (o) => o.technician ?? 'Unassigned', secondary: (o) => o.team, visibility: 'xl', width: 180 },
    { key: 'assignment', label: 'Assignment', value: (o) => o.assignment, type: 'badge', tone: (o) => ASSIGN_TONE[o.assignment], visibility: '2xl', width: 120 },
    { key: 'priority', label: 'Priority', value: (o) => o.priority, type: 'badge', tone: (o) => PRIORITY_TONE[o.priority], visibility: 'xl', width: 100 },
    { key: 'wo', label: 'Work Order', value: (o) => o.workOrderNumber, type: 'mono', visibility: 'xl', width: 130 },
    { key: 'status', label: 'Status', value: (o) => o.effectiveStatus, secondary: (o) => (o.daysOverdue ? `${o.daysOverdue} days overdue` : o.dueCategory && o.dueCategory.startsWith('Due') ? o.dueCategory : null), type: 'badge', tone: (o) => OCC_TONE[o.effectiveStatus], sortable: true, mobile: 'badge', width: 130 },
  ];
}

export function dueColumns(): DataColumn<OccurrenceListItem>[] {
  return [
    { key: 'plan', label: 'Maintenance Plan', value: (o) => o.planName, secondary: (o) => `${o.number} · ${o.planNumber}`, link: (o) => planLink(o.planId), mobile: 'title', sortable: true, width: 260 },
    { key: 'asset', label: 'Asset', value: (o) => o.assetName, visibility: 'lg', width: 220 },
    { key: 'customer', label: 'Customer / Site', value: (o) => o.customerName, secondary: (o) => o.siteName, visibility: 'md', mobile: 'meta', width: 220 },
    { key: 'original', label: 'Original Due Date', value: (o) => o.dueDate, type: 'date', sortable: true, width: 130 },
    { key: 'days', label: 'Days Overdue', value: (o) => o.daysOverdue || null, type: 'number', sortable: true, visibility: 'md', width: 110 },
    { key: 'tech', label: 'Assigned Technician', value: (o) => o.technician ?? 'Unassigned', visibility: 'xl', width: 170 },
    { key: 'wo', label: 'Work Order', value: (o) => o.workOrderNumber, type: 'mono', visibility: 'xl', width: 130 },
    { key: 'priority', label: 'Priority', value: (o) => o.priority, type: 'badge', tone: (o) => PRIORITY_TONE[o.priority], visibility: 'lg', width: 100 },
    { key: 'reason', label: 'Reason', value: (o) => o.overdueReason, visibility: '2xl', width: 170 },
    { key: 'escalation', label: 'Escalation', value: (o) => (o.escalationLevel === 2 ? 'Management' : o.escalationLevel === 1 ? 'Supervisor' : '—'), type: 'badge', tone: (o) => (o.escalationLevel === 2 ? 'danger' : o.escalationLevel === 1 ? 'warn' : 'neutral'), visibility: 'lg', width: 120 },
    { key: 'category', label: 'Category', value: (o) => o.dueCategory, type: 'badge', tone: (o) => (o.dueCategory ? DUE_TONE[o.dueCategory] : 'neutral'), sortable: true, mobile: 'badge', width: 140 },
  ];
}

export function workOrderColumns(showPlan = true): DataColumn<PmWorkOrderListItem>[] {
  return [
    { key: 'number', label: 'Work Order', value: (w) => w.number, secondary: (w) => `${w.kind} · ${w.maintenanceType}`, mobile: 'title', sortable: true, width: 220 },
    ...(showPlan ? [{ key: 'plan', label: 'Plan / Schedule', value: (w: PmWorkOrderListItem) => w.planNumber, secondary: (w: PmWorkOrderListItem) => w.occurrenceNumber, link: (w: PmWorkOrderListItem) => planLink(w.planId), visibility: 'lg' as const, width: 160 }] : []),
    { key: 'customer', label: 'Customer / Site', value: (w) => w.customerName, secondary: (w) => w.siteName, visibility: 'md', mobile: 'meta', width: 220 },
    { key: 'asset', label: 'Asset', value: (w) => w.assetName, visibility: 'xl', width: 220 },
    { key: 'planned', label: 'Planned Date', value: (w) => w.plannedDate, type: 'date', sortable: true, width: 120 },
    { key: 'due', label: 'Due Date', value: (w) => w.dueDate, type: 'date', visibility: 'lg', width: 120 },
    { key: 'tech', label: 'Team / Technician', value: (w) => w.technician ?? 'Unassigned', secondary: (w) => w.team, visibility: 'lg', width: 180 },
    { key: 'priority', label: 'Priority', value: (w) => w.priority, type: 'badge', tone: (w) => PRIORITY_TONE[w.priority], visibility: 'xl', width: 100 },
    { key: 'parts', label: 'Parts', value: (w) => (w.parts.length ? (w.partsAvailable ? 'Available' : 'Unavailable') : '—'), type: 'badge', tone: (w) => (!w.parts.length ? 'neutral' : w.partsAvailable ? 'ok' : 'danger'), visibility: 'xl', width: 110 },
    { key: 'rule', label: 'Generated By', value: (w) => w.generatedBy, visibility: '2xl', width: 260 },
    { key: 'status', label: 'Status', value: (w) => w.status, type: 'badge', tone: (w) => WO_TONE[w.status], sortable: true, mobile: 'badge', width: 120 },
  ];
}

export function meterColumns(): DataColumn<MeterRuleListItem>[] {
  return [
    { key: 'rule', label: 'Rule', value: (m) => (m.kind === 'Meter' ? m.meterType : `${m.parameter} ${m.operator} ${m.interval} ${m.unit}`), secondary: (m) => `${m.number} · ${m.kind}`, mobile: 'title', width: 240 },
    { key: 'plan', label: 'Plan / Asset', value: (m) => m.planName, secondary: (m) => m.assetName, link: (m) => planLink(m.planId), visibility: 'md', mobile: 'meta', width: 260 },
    { key: 'current', label: 'Current Reading', value: (m) => (m.currentReading === null ? null : `${m.currentReading.toLocaleString('en-US')} ${m.unit}`), secondary: (m) => (m.previousReading === null ? null : `prev ${m.previousReading.toLocaleString('en-US')}`), width: 150 },
    { key: 'date', label: 'Reading Date', value: (m) => m.readingDate, type: 'datetime', visibility: 'xl', width: 150 },
    { key: 'interval', label: 'Interval / Threshold', value: (m) => `${m.kind === 'Meter' ? 'Every ' : ''}${m.interval.toLocaleString('en-US')} ${m.unit}`, visibility: 'lg', width: 150 },
    { key: 'next', label: 'Next Maintenance Reading', value: (m) => (m.nextMaintenanceReading === null ? '—' : `${m.nextMaintenanceReading.toLocaleString('en-US')} ${m.unit}`), visibility: 'lg', width: 170 },
    { key: 'progress', label: 'Progress', value: (m) => `${m.progress}%`, visibility: 'md', width: 100 },
    { key: 'state', label: 'State', value: (m) => m.state, type: 'badge', tone: (m) => (m.state === 'Threshold Reached' ? 'danger' : m.state === 'Approaching' ? 'warn' : 'ok'), mobile: 'badge', width: 150 },
  ];
}
