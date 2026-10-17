import type { DataColumn } from '@shared/ui/data-table';
import { recordTone } from '../models/display';
import type {
  AgreementSummary,
  AssetSummary,
  InvoiceSummary,
  MaintenanceSummary,
  ServiceHistoryEntry,
  ServiceRequestSummary,
  WorkOrderSummary,
} from '../models/related.model';

type SiteNamer = (siteId: string) => string;

export function assetColumns(siteName?: SiteNamer): DataColumn<AssetSummary>[] {
  return [
    { key: 'name', label: 'Asset', value: (a) => a.name, secondary: (a) => a.tag, link: (a) => `/app/assets/${a.id}`, sortable: true, mobile: 'title' },
    { key: 'category', label: 'Category', value: (a) => a.category, sortable: true, visibility: 'md', mobile: 'meta' },
    { key: 'model', label: 'Model', value: (a) => a.model, visibility: 'lg', mobile: 'meta' },
    { key: 'serial', label: 'Serial No.', value: (a) => a.serialNumber, type: 'mono', visibility: 'xl' },
    ...(siteName
      ? [{ key: 'site', label: 'Site', value: (a: AssetSummary) => siteName(a.siteId), link: (a: AssetSummary) => `/app/customers/sites/${a.siteId}`, sortable: true, visibility: 'lg' as const, mobile: 'meta' as const }]
      : []),
    { key: 'install', label: 'Installed', value: (a) => a.installDate, type: 'date', sortable: true, visibility: 'xl' },
    { key: 'warranty', label: 'Warranty End', value: (a) => a.warrantyEnd, type: 'date', sortable: true, visibility: '2xl' },
    { key: 'status', label: 'Status', value: (a) => a.status, type: 'badge', tone: (a) => recordTone(a.status), sortable: true, mobile: 'badge' },
  ];
}

export function agreementColumns(): DataColumn<AgreementSummary>[] {
  return [
    { key: 'number', label: 'Number', value: (a) => a.number, type: 'mono', sortable: true, mobile: 'hidden' },
    { key: 'title', label: 'Title', value: (a) => a.title, secondary: (a) => a.coverage, link: (a) => `/app/contracts/${a.id}`, sortable: true, mobile: 'title' },
    { key: 'sites', label: 'Sites', value: (a) => a.siteIds.length, type: 'number', visibility: 'xl' },
    { key: 'start', label: 'Start', value: (a) => a.startDate, type: 'date', sortable: true, visibility: 'lg', mobile: 'meta' },
    { key: 'end', label: 'End', value: (a) => a.endDate, type: 'date', sortable: true, visibility: 'md', mobile: 'meta' },
    { key: 'value', label: 'Value', value: (a) => a.value, type: 'currency', currency: (a) => a.currency, sortable: true, visibility: 'lg' },
    { key: 'status', label: 'Status', value: (a) => a.status, type: 'badge', tone: (a) => recordTone(a.status), sortable: true, mobile: 'badge' },
  ];
}

export function serviceRequestColumns(siteName?: SiteNamer): DataColumn<ServiceRequestSummary>[] {
  return [
    { key: 'number', label: 'Request', value: (r) => r.number, type: 'mono', sortable: true, mobile: 'hidden' },
    { key: 'subject', label: 'Subject', value: (r) => r.subject, sortable: true, mobile: 'title' },
    ...(siteName
      ? [{ key: 'site', label: 'Site', value: (r: ServiceRequestSummary) => siteName(r.siteId), link: (r: ServiceRequestSummary) => `/app/customers/sites/${r.siteId}`, visibility: 'lg' as const, mobile: 'meta' as const }]
      : []),
    { key: 'priority', label: 'Priority', value: (r) => r.priority, type: 'badge', tone: (r) => recordTone(r.priority), sortable: true, visibility: 'md' },
    { key: 'created', label: 'Created', value: (r) => r.createdAt, type: 'datetime', sortable: true, visibility: 'lg', mobile: 'meta' },
    { key: 'sla', label: 'SLA Due', value: (r) => r.slaDue, type: 'datetime', sortable: true, visibility: 'xl' },
    { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => recordTone(r.status), sortable: true, mobile: 'badge' },
  ];
}

export function workOrderColumns(siteName?: SiteNamer): DataColumn<WorkOrderSummary>[] {
  return [
    { key: 'number', label: 'Work Order', value: (w) => w.number, type: 'mono', sortable: true, mobile: 'hidden' },
    { key: 'title', label: 'Title', value: (w) => w.title, secondary: (w) => w.type, sortable: true, mobile: 'title' },
    ...(siteName
      ? [{ key: 'site', label: 'Site', value: (w: WorkOrderSummary) => siteName(w.siteId), link: (w: WorkOrderSummary) => `/app/customers/sites/${w.siteId}`, visibility: 'lg' as const, mobile: 'meta' as const }]
      : []),
    { key: 'technician', label: 'Technician', value: (w) => w.technician, sortable: true, visibility: 'xl', mobile: 'meta' },
    { key: 'scheduled', label: 'Scheduled', value: (w) => w.scheduledDate, type: 'date', sortable: true, visibility: 'md', mobile: 'meta' },
    { key: 'completed', label: 'Completed', value: (w) => w.completedDate, type: 'date', sortable: true, visibility: '2xl' },
    { key: 'status', label: 'Status', value: (w) => w.status, type: 'badge', tone: (w) => recordTone(w.status), sortable: true, mobile: 'badge' },
  ];
}

export function maintenanceColumns(): DataColumn<MaintenanceSummary>[] {
  return [
    { key: 'plan', label: 'Maintenance Plan', value: (m) => m.plan, secondary: (m) => m.assetName, sortable: true, mobile: 'title' },
    { key: 'frequency', label: 'Frequency', value: (m) => m.frequency, sortable: true, visibility: 'md', mobile: 'meta' },
    { key: 'due', label: 'Next Due', value: (m) => m.nextDue, type: 'date', sortable: true, mobile: 'meta' },
    { key: 'status', label: 'Status', value: (m) => m.status, type: 'badge', tone: (m) => recordTone(m.status), sortable: true, mobile: 'badge' },
  ];
}

export function invoiceColumns(): DataColumn<InvoiceSummary>[] {
  return [
    { key: 'number', label: 'Invoice', value: (i) => i.number, type: 'mono', secondary: (i) => i.reference, sortable: true, mobile: 'title' },
    { key: 'issue', label: 'Issued', value: (i) => i.issueDate, type: 'date', sortable: true, visibility: 'md', mobile: 'meta' },
    { key: 'due', label: 'Due', value: (i) => i.dueDate, type: 'date', sortable: true, visibility: 'lg', mobile: 'meta' },
    { key: 'amount', label: 'Amount', value: (i) => i.amount, type: 'currency', currency: (i) => i.currency, sortable: true, visibility: 'md' },
    { key: 'balance', label: 'Balance', value: (i) => i.amount - i.paid, type: 'currency', currency: (i) => i.currency, sortable: true, mobile: 'meta' },
    { key: 'status', label: 'Status', value: (i) => i.status, type: 'badge', tone: (i) => recordTone(i.status), sortable: true, mobile: 'badge' },
  ];
}

export function serviceHistoryColumns(siteName?: SiteNamer): DataColumn<ServiceHistoryEntry>[] {
  return [
    { key: 'date', label: 'Date', value: (h) => h.date, type: 'date', sortable: true, mobile: 'meta' },
    { key: 'type', label: 'Visit', value: (h) => h.visitType, secondary: (h) => h.summary, sortable: true, mobile: 'title' },
    ...(siteName
      ? [{ key: 'site', label: 'Site', value: (h: ServiceHistoryEntry) => siteName(h.siteId), link: (h: ServiceHistoryEntry) => `/app/customers/sites/${h.siteId}`, visibility: 'lg' as const, mobile: 'meta' as const }]
      : []),
    { key: 'technician', label: 'Technician', value: (h) => h.technician, sortable: true, visibility: 'xl' },
    { key: 'reference', label: 'Reference', value: (h) => h.reference, type: 'mono', visibility: 'xl' },
    { key: 'outcome', label: 'Outcome', value: (h) => h.outcome, type: 'badge', tone: (h) => recordTone(h.outcome), sortable: true, mobile: 'badge' },
  ];
}
