import type { DataColumn } from '@shared/ui/data-table';
import type { AssetListItem } from '../models/asset.model';
import type { CoverageListItem } from '../models/coverage.model';
import type { AssetMaintenance, AssetServiceRequest, AssetWorkOrder, PartUsageRow } from '../models/history.model';
import {
  AGREEMENT_STATUS_TONE,
  ASSET_STATUS_TONE,
  COVERAGE_STATE_TONE,
  CRITICALITY_TONE,
  MAINTENANCE_STATUS_TONE,
  WARRANTY_STATUS_TONE,
  recordTone,
} from '../models/display';

export const assetLink = (id: string) => `/app/assets/${id}`;

/** SRS 3.4 list columns. */
export function assetListColumns(): DataColumn<AssetListItem>[] {
  return [
    { key: 'name', label: 'Asset Name', value: (a) => a.name, secondary: (a) => `${a.code} · ${a.tag}`, link: (a) => assetLink(a.id), sortable: true, mobile: 'title', width: 250, hideable: false },
    { key: 'code', label: 'Asset ID', value: (a) => a.code, type: 'mono', sortable: true, visibility: '2xl', width: 120 },
    { key: 'tag', label: 'Asset Tag', value: (a) => a.tag, type: 'mono', sortable: true, visibility: '2xl', width: 120 },
    { key: 'customer', label: 'Customer', value: (a) => a.customerName, link: (a) => (a.customerId ? `/app/customers/${a.customerId}` : null), sortable: true, mobile: 'meta', width: 220 },
    { key: 'site', label: 'Site', value: (a) => a.siteName, secondary: (a) => a.siteCity, link: (a) => (a.siteId ? `/app/customers/sites/${a.siteId}` : null), sortable: true, visibility: 'lg', mobile: 'meta', width: 200 },
    { key: 'category', label: 'Category', value: (a) => a.category, sortable: true, visibility: 'lg', mobile: 'meta', width: 140 },
    { key: 'type', label: 'Type', value: (a) => a.type, sortable: true, visibility: 'xl', width: 150 },
    { key: 'manufacturer', label: 'Manufacturer', value: (a) => a.manufacturer, sortable: true, visibility: 'xl', width: 130 },
    { key: 'model', label: 'Model', value: (a) => a.model, sortable: true, visibility: '2xl', width: 170 },
    { key: 'serial', label: 'Serial Number', value: (a) => a.serialNumber, type: 'mono', sortable: true, visibility: '2xl', width: 150 },
    { key: 'criticality', label: 'Criticality', value: (a) => a.criticality, type: 'badge', tone: (a) => CRITICALITY_TONE[a.criticality], sortable: true, visibility: '2xl', width: 110 },
    { key: 'installed', label: 'Installation Date', value: (a) => a.installation.date, type: 'date', sortable: true, visibility: 'xl', width: 140 },
    { key: 'warranty', label: 'Warranty', value: (a) => a.warrantyStatus, type: 'badge', tone: (a) => WARRANTY_STATUS_TONE[a.warrantyStatus], sortable: true, visibility: 'lg', width: 130 },
    { key: 'coverage', label: 'Contract / AMC', value: (a) => a.coverageState, type: 'badge', tone: (a) => COVERAGE_STATE_TONE[a.coverageState], sortable: true, visibility: 'xl', width: 130 },
    { key: 'status', label: 'Status', value: (a) => a.status, type: 'badge', tone: (a) => ASSET_STATUS_TONE[a.status], sortable: true, mobile: 'badge', width: 150 },
    { key: 'next', label: 'Next Maintenance', value: (a) => a.operational.nextMaintenanceDate, type: 'date', sortable: true, visibility: 'xl', width: 150 },
    { key: 'created', label: 'Created', value: (a) => a.createdAt, type: 'date', sortable: true, visibility: '2xl', width: 120 },
  ];
}

export function serviceRequestColumns(): DataColumn<AssetServiceRequest>[] {
  return [
    { key: 'number', label: 'Request', value: (r) => r.number, type: 'mono', sortable: true, mobile: 'hidden' },
    { key: 'subject', label: 'Subject', value: (r) => r.subject, sortable: true, mobile: 'title' },
    { key: 'priority', label: 'Priority', value: (r) => r.priority, type: 'badge', tone: (r) => recordTone(r.priority), sortable: true, visibility: 'md' },
    { key: 'created', label: 'Created', value: (r) => r.createdAt, type: 'datetime', sortable: true, visibility: 'lg', mobile: 'meta' },
    { key: 'sla', label: 'SLA Due', value: (r) => r.slaDue, type: 'datetime', sortable: true, visibility: 'xl' },
    { key: 'status', label: 'Status', value: (r) => r.status, type: 'badge', tone: (r) => recordTone(r.status), sortable: true, mobile: 'badge' },
  ];
}

export function workOrderColumns(): DataColumn<AssetWorkOrder>[] {
  return [
    { key: 'number', label: 'Work Order', value: (w) => w.number, type: 'mono', sortable: true, mobile: 'hidden' },
    { key: 'title', label: 'Title', value: (w) => w.title, secondary: (w) => w.type, sortable: true, mobile: 'title' },
    { key: 'technician', label: 'Technician', value: (w) => w.technician, sortable: true, visibility: 'lg', mobile: 'meta' },
    { key: 'scheduled', label: 'Scheduled', value: (w) => w.scheduledDate, type: 'date', sortable: true, visibility: 'md', mobile: 'meta' },
    { key: 'completed', label: 'Completed', value: (w) => w.completedDate, type: 'date', sortable: true, visibility: 'xl' },
    { key: 'status', label: 'Status', value: (w) => w.status, type: 'badge', tone: (w) => recordTone(w.status), sortable: true, mobile: 'badge' },
  ];
}

export function maintenanceColumns(): DataColumn<AssetMaintenance>[] {
  return [
    { key: 'plan', label: 'Maintenance Plan', value: (m) => m.plan, sortable: true, mobile: 'title' },
    { key: 'frequency', label: 'Frequency', value: (m) => m.frequency, sortable: true, visibility: 'md', mobile: 'meta' },
    { key: 'last', label: 'Last Done', value: (m) => m.lastDone, type: 'date', sortable: true, visibility: 'lg' },
    { key: 'due', label: 'Next Due', value: (m) => m.nextDue, type: 'date', sortable: true, mobile: 'meta' },
    { key: 'status', label: 'Status', value: (m) => m.status, type: 'badge', tone: (m) => MAINTENANCE_STATUS_TONE[m.status], sortable: true, mobile: 'badge' },
  ];
}

export function partsColumns(): DataColumn<PartUsageRow>[] {
  return [
    { key: 'name', label: 'Part', value: (p) => p.name, secondary: (p) => p.partNumber, sortable: true, mobile: 'title' },
    { key: 'date', label: 'Date', value: (p) => p.date, type: 'date', sortable: true, mobile: 'meta' },
    { key: 'type', label: 'Service Type', value: (p) => p.serviceType, sortable: true, visibility: 'lg' },
    { key: 'wo', label: 'Work Order', value: (p) => p.workOrder, type: 'mono', visibility: 'xl' },
    { key: 'technician', label: 'Technician', value: (p) => p.technician, sortable: true, visibility: 'xl' },
    { key: 'qty', label: 'Qty', value: (p) => p.quantity, type: 'number', sortable: true, mobile: 'meta' },
    { key: 'unit', label: 'Unit Cost', value: (p) => p.unitCost, type: 'currency', currency: (p) => p.currency, visibility: 'lg' },
    { key: 'total', label: 'Total', value: (p) => p.totalCost, type: 'currency', currency: (p) => p.currency, sortable: true },
  ];
}

export function coverageColumns(showAsset: boolean): DataColumn<CoverageListItem>[] {
  return [
    ...(showAsset
      ? [{ key: 'asset', label: 'Asset', value: (c: CoverageListItem) => c.assetName, secondary: (c: CoverageListItem) => `${c.assetCode} · ${c.customerName}`, link: (c: CoverageListItem) => assetLink(c.assetId), sortable: true, mobile: 'title' as const, width: 240 }]
      : []),
    { key: 'agreement', label: 'Contract / AMC', value: (c) => c.agreementNumber, secondary: (c) => c.agreementTitle, sortable: true, mobile: showAsset ? 'meta' : 'title', width: 240 },
    { key: 'kind', label: 'Kind', value: (c) => c.kind, sortable: true, visibility: 'md', width: 90 },
    { key: 'coverage', label: 'Coverage Type', value: (c) => c.coverageType, sortable: true, visibility: 'lg', mobile: 'meta', width: 150 },
    { key: 'sla', label: 'SLA', value: (c) => c.slaName, secondary: (c) => (c.responseHours ? `${c.responseHours}h response · ${c.resolutionHours}h resolution` : null), sortable: true, visibility: 'xl', width: 200 },
    { key: 'visits', label: 'Visit Coverage', value: (c) => c.visitCoverage, visibility: 'xl', width: 170 },
    { key: 'start', label: 'Start', value: (c) => c.startDate, type: 'date', sortable: true, visibility: 'lg', width: 120 },
    { key: 'end', label: 'End', value: (c) => c.endDate, type: 'date', sortable: true, mobile: 'meta', width: 120 },
    { key: 'status', label: 'Status', value: (c) => c.status, type: 'badge', tone: (c) => AGREEMENT_STATUS_TONE[c.status], sortable: true, mobile: 'badge', width: 110 },
  ];
}
