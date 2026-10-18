import type { DataColumn } from '@shared/ui/data-table';
import { BREACH_TONE, CLOCK_TONE, PRIORITY_TONE, SLA_STATUS_TONE, formatMinutes } from '../models/display';
import type { EscalationEventListItem, EscalationRuleListItem, SlaBreachListItem, SlaClockListItem, SlaCoverageListItem, SlaMappingListItem, SlaTargetListItem } from '../models/operations.model';
import type { SlaListItem } from '../models/sla.model';

const slaLink = (id: string) => `/app/sla/${id}`;

/** SRS 7.5 list columns. */
export function slaColumns(): DataColumn<SlaListItem>[] {
  return [
    { key: 'name', label: 'SLA', value: (s) => s.name, secondary: (s) => `${s.number} · v${s.version}`, link: (s) => slaLink(s.id), sortable: true, mobile: 'title', width: 260, hideable: false },
    { key: 'type', label: 'SLA Type', value: (s) => s.type, sortable: true, visibility: 'lg', width: 190 },
    { key: 'customer', label: 'Customer', value: (s) => s.customerName ?? 'Mapped customers', link: (s) => (s.customer.customerId ? `/app/customers/${s.customer.customerId}` : null), sortable: true, visibility: 'md', mobile: 'meta', width: 200 },
    { key: 'contract', label: 'Contract', value: (s) => s.contractNumber, type: 'mono', link: (s) => (s.contract.contractId ? `/app/contracts/${s.contract.contractId}` : null), visibility: 'xl', width: 130 },
    { key: 'amc', label: 'AMC', value: (s) => s.amcNumber, type: 'mono', link: (s) => (s.contract.amcId ? `/app/amc-agreements/${s.contract.amcId}` : null), visibility: 'xl', width: 130 },
    { key: 'service', label: 'Service', value: (s) => [...s.serviceNames, ...s.scope.serviceCategories].slice(0, 2).join(', ') || 'All services', visibility: '2xl', width: 180 },
    { key: 'response', label: 'Response Target', value: (s) => formatMinutes(s.priorityTargets.Medium.response), secondary: () => 'Medium priority', visibility: 'lg', width: 130 },
    { key: 'resolution', label: 'Resolution Target', value: (s) => formatMinutes(s.priorityTargets.Medium.resolution), visibility: 'lg', width: 130 },
    { key: 'hours', label: 'Service Hours', value: (s) => s.calendarName, visibility: 'xl', width: 150 },
    { key: 'effective', label: 'Effective Date', value: (s) => s.validity.effectiveDate, type: 'date', sortable: true, visibility: '2xl', width: 120 },
    { key: 'expiry', label: 'Expiry Date', value: (s) => s.validity.expiryDate, type: 'date', sortable: true, visibility: 'md', width: 120 },
    { key: 'version', label: 'Version', value: (s) => `v${s.version}`, type: 'mono', visibility: '2xl', width: 80 },
    { key: 'compliance', label: 'Compliance', value: (s) => (s.compliance === null ? '—' : `${s.compliance}%`), type: 'badge', tone: (s) => (s.compliance === null ? 'neutral' : s.compliance >= 95 ? 'ok' : s.compliance >= 85 ? 'warn' : 'danger'), sortable: true, visibility: 'lg', width: 110 },
    { key: 'status', label: 'Status', value: (s) => s.effectiveStatus, type: 'badge', tone: (s) => SLA_STATUS_TONE[s.effectiveStatus], sortable: true, mobile: 'badge', width: 140 },
  ];
}

export function targetColumns(showSla = true): DataColumn<SlaTargetListItem>[] {
  return [
    ...(showSla ? [{ key: 'sla', label: 'SLA', value: (t: SlaTargetListItem) => t.slaName, secondary: (t: SlaTargetListItem) => t.slaNumber, link: (t: SlaTargetListItem) => slaLink(t.slaId), sortable: true, mobile: 'title' as const, width: 220 }] : []),
    { key: 'priority', label: 'Priority', value: (t) => t.priority, type: 'badge', tone: (t) => PRIORITY_TONE[t.priority] ?? 'neutral', sortable: true, width: 100 },
    { key: 'type', label: 'Target Type', value: (t) => t.targetType, sortable: true, mobile: showSla ? 'meta' : 'title', width: 150 },
    { key: 'duration', label: 'Target Duration', value: (t) => formatMinutes(t.durationMinutes), secondary: (t) => t.unit, width: 130 },
    { key: 'calendar', label: 'Calendar', value: (t) => t.calendarName, visibility: 'lg', width: 160 },
    { key: 'events', label: 'Start → Stop Event', value: (t) => `${t.startEvent} → ${t.stopEvent}`, visibility: 'xl', width: 300 },
    { key: 'pause', label: 'Pause Events', value: (t) => t.pauseEvents.join(', '), visibility: '2xl', width: 260 },
    { key: 'thresholds', label: 'Warning / Escalation / Breach', value: (t) => `${t.warningPercent}% / ${t.escalationPercent}% / ${t.breachPercent}%`, visibility: 'md', width: 200 },
  ];
}

export function coverageColumns(showSla = true): DataColumn<SlaCoverageListItem>[] {
  return [
    { key: 'target', label: 'Covered', value: (c) => c.target, secondary: (c) => `${c.level} level${c.priority ? ` · ${c.priority} only` : ''}`, mobile: 'title', sortable: true, width: 260 },
    ...(showSla ? [{ key: 'sla', label: 'SLA', value: (c: SlaCoverageListItem) => c.slaNumber, secondary: (c: SlaCoverageListItem) => c.slaName, link: (c: SlaCoverageListItem) => slaLink(c.slaId), sortable: true, visibility: 'md' as const, width: 220 }] : []),
    { key: 'start', label: 'Coverage Start', value: (c) => c.startDate, type: 'date', visibility: 'lg', width: 120 },
    { key: 'end', label: 'Coverage End', value: (c) => c.endDate, type: 'date', visibility: 'lg', width: 120 },
    { key: 'status', label: 'Coverage Status', value: (c) => c.effectiveStatus, type: 'badge', tone: (c) => (c.effectiveStatus === 'Active' ? 'ok' : c.effectiveStatus === 'Expired' ? 'danger' : 'neutral'), mobile: 'badge', width: 120 },
  ];
}

export function mappingColumns(showSla = true): DataColumn<SlaMappingListItem>[] {
  return [
    { key: 'scope', label: 'Mapping', value: (m) => `${m.level} → SLA`, secondary: (m) => m.scope, mobile: 'title', sortable: true, width: 300 },
    ...(showSla ? [{ key: 'sla', label: 'SLA', value: (m: SlaMappingListItem) => m.slaNumber, secondary: (m: SlaMappingListItem) => m.slaName, link: (m: SlaMappingListItem) => slaLink(m.slaId), sortable: true, visibility: 'md' as const, width: 220 }] : []),
    { key: 'specificity', label: 'Specificity', value: (m) => m.specificity, type: 'number', sortable: true, visibility: 'lg', width: 100 },
    { key: 'priority', label: 'Assignment Priority', value: (m) => m.assignmentPriority, type: 'number', sortable: true, visibility: 'lg', width: 140 },
    { key: 'effective', label: 'Effective', value: (m) => m.effectiveDate, type: 'date', visibility: 'xl', width: 120 },
    { key: 'expiry', label: 'Expiry', value: (m) => m.expiryDate, type: 'date', visibility: 'xl', width: 120 },
    { key: 'slaStatus', label: 'SLA Status', value: (m) => m.slaStatus, type: 'badge', tone: (m) => SLA_STATUS_TONE[m.slaStatus as keyof typeof SLA_STATUS_TONE] ?? 'neutral', visibility: 'md', width: 130 },
    { key: 'status', label: 'Status', value: (m) => m.status, type: 'badge', tone: (m) => (m.status === 'Active' ? 'ok' : 'neutral'), mobile: 'badge', width: 100 },
  ];
}

export function clockColumns(showSla = true): DataColumn<SlaClockListItem>[] {
  return [
    { key: 'tx', label: 'Request / Work Order', value: (c) => c.transactionNumber, secondary: (c) => `${c.targetType} · ${c.subject}`, mobile: 'title', sortable: true, width: 260 },
    { key: 'customer', label: 'Customer / Site', value: (c) => c.customerName, secondary: (c) => c.siteName, visibility: 'md', mobile: 'meta', width: 220 },
    { key: 'asset', label: 'Asset / Service', value: (c) => c.assetName ?? '—', secondary: (c) => c.serviceName, visibility: '2xl', width: 200 },
    { key: 'priority', label: 'Priority', value: (c) => c.priority, type: 'badge', tone: (c) => PRIORITY_TONE[c.priority], sortable: true, visibility: 'lg', width: 100 },
    ...(showSla ? [{ key: 'sla', label: 'SLA', value: (c: SlaClockListItem) => c.slaNumber, link: (c: SlaClockListItem) => slaLink(c.slaId), visibility: 'xl' as const, width: 120 }] : []),
    { key: 'target', label: 'SLA Target', value: (c) => formatMinutes(c.targetMinutes), visibility: 'lg', width: 100 },
    { key: 'start', label: 'Start Time', value: (c) => c.startedAt, type: 'datetime', sortable: true, visibility: 'xl', width: 150 },
    { key: 'elapsed', label: 'Elapsed', value: (c) => formatMinutes(c.elapsedMinutes), secondary: (c) => (c.pausedMinutes ? `${formatMinutes(c.pausedMinutes)} paused` : null), visibility: 'lg', width: 110 },
    { key: 'remaining', label: 'Remaining', value: (c) => (c.stoppedAt ? '—' : formatMinutes(c.remainingMinutes)), sortable: true, visibility: 'md', width: 100 },
    { key: 'consumed', label: 'SLA Consumed', value: (c) => `${c.consumption}%`, type: 'badge', tone: (c) => (c.consumption >= 100 ? 'danger' : c.consumption >= c.escalationPercent ? 'danger' : c.consumption >= c.warningPercent ? 'warn' : 'ok'), sortable: true, width: 120 },
    { key: 'escalation', label: 'Escalation', value: (c) => c.escalationStatus, visibility: '2xl', width: 200 },
    { key: 'status', label: 'Status', value: (c) => c.monitoringStatus, type: 'badge', tone: (c) => CLOCK_TONE[c.monitoringStatus], sortable: true, mobile: 'badge', width: 110 },
  ];
}

export function breachColumns(showSla = true): DataColumn<SlaBreachListItem>[] {
  return [
    { key: 'number', label: 'Breach', value: (b) => b.breachType, secondary: (b) => `${b.number} · ${b.transactionNumber}`, mobile: 'title', sortable: true, width: 230 },
    { key: 'customer', label: 'Customer / Site', value: (b) => b.customerName, secondary: (b) => b.siteName, visibility: 'md', mobile: 'meta', width: 220 },
    ...(showSla ? [{ key: 'sla', label: 'SLA', value: (b: SlaBreachListItem) => b.slaNumber, link: (b: SlaBreachListItem) => slaLink(b.slaId), visibility: 'xl' as const, width: 120 }] : []),
    { key: 'priority', label: 'Priority', value: (b) => b.priority, type: 'badge', tone: (b) => PRIORITY_TONE[b.priority], visibility: 'lg', width: 100 },
    { key: 'target', label: 'Target Time', value: (b) => b.targetAt, type: 'datetime', sortable: true, visibility: 'lg', width: 150 },
    { key: 'actual', label: 'Actual Time', value: (b) => b.actualAt, type: 'datetime', visibility: '2xl', width: 150 },
    { key: 'duration', label: 'Breach Duration', value: (b) => formatMinutes(b.breachMinutes), sortable: true, visibility: 'md', width: 120 },
    { key: 'reason', label: 'Breach Reason', value: (b) => b.reason ?? 'Not set', visibility: 'xl', width: 160 },
    { key: 'team', label: 'Responsible', value: (b) => b.technician ?? b.team, secondary: (b) => b.team, visibility: '2xl', width: 160 },
    { key: 'penalty', label: 'Penalty / Credit', value: (b) => (b.penalty ? b.penalty : null), type: 'currency', currency: (b) => b.currency, visibility: 'xl', width: 120 },
    { key: 'escalation', label: 'Escalation', value: (b) => b.escalationStatus, visibility: '2xl', width: 150 },
    { key: 'status', label: 'Status', value: (b) => (b.waiver && !b.waiver.approvedBy ? 'Waiver Requested' : b.status), type: 'badge', tone: (b) => (b.waiver && !b.waiver.approvedBy ? 'accent' : BREACH_TONE[b.status]), sortable: true, mobile: 'badge', width: 150 },
  ];
}

export function ruleColumns(showSla = true): DataColumn<EscalationRuleListItem>[] {
  return [
    { key: 'level', label: 'Escalation Level', value: (r) => r.levelName, secondary: (r) => `${r.triggerType} · ${r.triggerPercent !== null ? `${r.triggerPercent}%` : `${r.triggerMinutes} min`}`, mobile: 'title', sortable: true, width: 280 },
    ...(showSla ? [{ key: 'sla', label: 'SLA', value: (r: EscalationRuleListItem) => r.slaNumber, secondary: (r: EscalationRuleListItem) => r.slaName, link: (r: EscalationRuleListItem) => slaLink(r.slaId), sortable: true, visibility: 'md' as const, width: 220 }] : []),
    { key: 'target', label: 'Target', value: (r) => r.targetType, visibility: 'xl', width: 130 },
    { key: 'recipient', label: 'Recipient / Team', value: (r) => r.recipient, secondary: (r) => r.team, visibility: 'lg', mobile: 'meta', width: 190 },
    { key: 'channel', label: 'Channel', value: (r) => r.channel, visibility: 'lg', width: 150 },
    { key: 'action', label: 'Action', value: (r) => r.action, visibility: 'xl', width: 190 },
    { key: 'triggered', label: 'Triggered', value: (r) => r.triggered, type: 'number', visibility: 'md', width: 90 },
    { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => (r.status === 'Active' ? 'ok' : 'neutral'), mobile: 'badge', width: 100 },
  ];
}

export function eventColumns(): DataColumn<EscalationEventListItem>[] {
  return [
    { key: 'level', label: 'Escalation', value: (e) => e.levelName, secondary: (e) => `${e.transactionNumber} · ${e.targetType} at ${e.consumption}%`, mobile: 'title', width: 280 },
    { key: 'customer', label: 'Customer', value: (e) => e.customerName, secondary: (e) => e.slaNumber, visibility: 'md', mobile: 'meta', width: 200 },
    { key: 'when', label: 'Triggered', value: (e) => e.triggeredAt, type: 'datetime', sortable: true, visibility: 'lg', width: 150 },
    { key: 'recipient', label: 'Recipient / Channel', value: (e) => e.recipient, secondary: (e) => e.channel, visibility: 'lg', width: 190 },
    { key: 'action', label: 'Action', value: (e) => e.action, visibility: 'xl', width: 190 },
    { key: 'status', label: 'Status', value: (e) => e.status, type: 'badge', tone: (e) => (e.status === 'Open' ? 'warn' : e.status === 'Acknowledged' ? 'info' : 'ok'), mobile: 'badge', width: 120 },
  ];
}
