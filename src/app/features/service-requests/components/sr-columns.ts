import type { DataColumn } from '@shared/ui/data-table';
import { COVERAGE_TONE, PRIORITY_TONE, SLA_TONE, STATUS_TONE, formatMinutes } from '../models/display';
import type { RequestListItem } from '../models/request.model';

/** SRS 9.5 list columns. */
export function requestColumns(): DataColumn<RequestListItem>[] {
  return [
    { key: 'number', label: 'Request', value: (r) => r.number, secondary: (r) => r.subject, link: (r) => `/app/service-requests/${r.id}`, sortable: true, mobile: 'title', width: 230 },
    { key: 'created', label: 'Request Date', value: (r) => r.createdAt, type: 'datetime', sortable: true, visibility: 'md', width: 140 },
    { key: 'type', label: 'Type', value: (r) => r.type, visibility: 'xl', width: 150 },
    { key: 'customer', label: 'Customer / Site', value: (r) => r.customerName, secondary: (r) => r.siteName, link: (r) => `/app/customers/${r.customer.customerId}`, mobile: 'meta', sortable: true, width: 220 },
    { key: 'asset', label: 'Asset', value: (r) => r.assetName ?? '—', link: (r) => (r.assetId ? `/app/assets/${r.assetId}` : null), visibility: 'lg', width: 190 },
    { key: 'category', label: 'Service Category', value: (r) => r.serviceCategory, visibility: 'xl', width: 160 },
    { key: 'priority', label: 'Priority', value: (r) => r.priority, type: 'badge', tone: (r) => PRIORITY_TONE[r.priority], sortable: true, width: 95 },
    { key: 'sla', label: 'SLA', value: (r) => r.sla.slaNumber ?? '—', secondary: (r) => (r.slaState === 'No SLA' ? null : `${formatMinutes(r.resolutionClock.remainingMinutes)} ${r.resolutionClock.remainingMinutes !== null && r.resolutionClock.remainingMinutes < 0 ? 'over' : 'left'}`), link: (r) => (r.sla.slaId ? `/app/sla/${r.sla.slaId}` : null), visibility: 'lg', width: 150 },
    { key: 'agreement', label: 'Contract / AMC', value: (r) => r.amcNumber ?? r.contractNumber ?? '—', link: (r) => (r.coverage.amcId ? `/app/amc-agreements/${r.coverage.amcId}` : r.coverage.contractId ? `/app/contracts/${r.coverage.contractId}` : null), visibility: '2xl', width: 140 },
    { key: 'coverage', label: 'Coverage', value: (r) => r.coverage.result, type: 'badge', tone: (r) => COVERAGE_TONE[r.coverage.result], visibility: 'xl', width: 135 },
    { key: 'team', label: 'Team / Technician', value: (r) => r.assignment.team ?? '—', secondary: (r) => r.assignment.technician, visibility: 'lg', mobile: 'meta', width: 180 },
    { key: 'status', label: 'Status', value: (r) => (r.status === 'Pending' && r.onHold ? `${r.status} — ${r.onHold.reason}` : r.status), type: 'badge', tone: (r) => STATUS_TONE[r.status], sortable: true, mobile: 'badge', width: 150 },
    { key: 'due', label: 'Due Date', value: (r) => r.dueAt, type: 'datetime', sortable: true, visibility: 'xl', width: 140 },
    { key: 'slaState', label: 'SLA Status', value: (r) => r.slaState, type: 'badge', tone: (r) => SLA_TONE[r.slaState], sortable: true, visibility: 'md', width: 115 },
    { key: 'source', label: 'Source', value: (r) => r.source, visibility: '2xl', width: 110 },
    { key: 'by', label: 'Created By', value: (r) => r.createdBy, secondary: (r) => (r.origin.planNumber ? `via ${r.origin.planNumber}` : r.origin.parentRequestId ? `follow-up of ${r.origin.parentRequestId}` : null), visibility: '2xl', width: 160 },
    { key: 'updated', label: 'Last Updated', value: (r) => r.updatedAt, type: 'datetime', sortable: true, visibility: '2xl', width: 140 },
    { key: 'age', label: 'Age', value: (r) => formatMinutes(r.ageHours * 60), visibility: 'lg', width: 90 },
  ];
}
