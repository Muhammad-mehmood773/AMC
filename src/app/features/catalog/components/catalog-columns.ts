import type { DataColumn } from '@shared/ui/data-table';
import type { ServiceListItem } from '../models/catalog.model';
import type { EntitlementListItem, UsageRecordListItem } from '../models/entitlement.model';
import type { PriceRuleListItem } from '../models/pricing.model';
import { ENTITLEMENT_STATUS_TONE, PRICE_STATE_TONE, SERVICE_STATUS_TONE, USAGE_STATE_TONE } from '../models/display';

/** SRS 4.4 list columns. */
export function serviceColumns(): DataColumn<ServiceListItem>[] {
  return [
    { key: 'name', label: 'Service Name', value: (s) => s.name, secondary: (s) => s.code, link: (s) => `/app/catalog/services/${s.id}`, sortable: true, mobile: 'title', width: 260, hideable: false },
    { key: 'code', label: 'Service Code', value: (s) => s.code, type: 'mono', sortable: true, visibility: '2xl', width: 130 },
    { key: 'category', label: 'Service Category', value: (s) => s.categoryName, secondary: (s) => s.subcategoryName, sortable: true, visibility: 'md', mobile: 'meta', width: 200 },
    { key: 'type', label: 'Service Type', value: (s) => s.type, sortable: true, visibility: 'lg', mobile: 'meta', width: 170 },
    { key: 'billing', label: 'Billing Type', value: (s) => s.commercial.billingMethod, secondary: (s) => (s.commercial.billable ? 'Billable' : 'Non-billable'), sortable: true, visibility: 'xl', width: 150 },
    { key: 'unit', label: 'Unit', value: (s) => s.operational.unit, sortable: true, visibility: 'xl', width: 90 },
    { key: 'duration', label: 'Standard Duration', value: (s) => (s.operational.standardDuration === null ? null : `${s.operational.standardDuration} h`), visibility: '2xl', width: 130 },
    { key: 'price', label: 'Standard Price', value: (s) => s.commercial.standardPrice, type: 'currency', currency: (s) => s.commercial.currency, sortable: true, visibility: 'lg', width: 130 },
    { key: 'sla', label: 'SLA Eligible', value: (s) => (s.sla.applicable ? (s.slaName ?? 'Yes') : 'No'), sortable: true, visibility: 'xl', width: 120 },
    { key: 'entitlements', label: 'Entitlements', value: (s) => s.activeEntitlementCount, type: 'number', sortable: true, visibility: '2xl', width: 110 },
    { key: 'status', label: 'Status', value: (s) => s.status, type: 'badge', tone: (s) => SERVICE_STATUS_TONE[s.status], sortable: true, mobile: 'badge', width: 110 },
    { key: 'created', label: 'Created', value: (s) => s.createdAt, type: 'date', sortable: true, visibility: '2xl', width: 120 },
  ];
}

/** SRS 4.9 list columns. */
export function entitlementColumns(showCustomer = true): DataColumn<EntitlementListItem>[] {
  return [
    { key: 'number', label: 'Entitlement', value: (e) => e.number, secondary: (e) => e.name, link: (e) => `/app/catalog/entitlements/${e.id}`, sortable: true, mobile: 'title', width: 260, hideable: false },
    ...(showCustomer ? [{ key: 'customer', label: 'Customer', value: (e: EntitlementListItem) => e.customerName, link: (e: EntitlementListItem) => `/app/customers/${e.customerId}`, sortable: true, visibility: 'md' as const, mobile: 'meta' as const, width: 220 }] : []),
    { key: 'site', label: 'Site', value: (e) => (e.siteNames.length ? (e.siteNames.length === 1 ? e.siteNames[0] : `${e.siteNames.length} sites`) : 'All sites'), visibility: 'xl', width: 160 },
    { key: 'asset', label: 'Asset', value: (e) => (e.assetLabels.length ? (e.assetLabels.length === 1 ? e.assetLabels[0] : `${e.assetLabels.length} assets`) : 'All assets'), visibility: '2xl', width: 160 },
    { key: 'agreement', label: 'Contract / AMC', value: (e) => e.agreementNumber, secondary: (e) => e.agreementKind, type: 'mono', sortable: true, visibility: 'lg', width: 140 },
    { key: 'service', label: 'Service', value: (e) => (e.serviceNames.length === 1 ? e.serviceNames[0] : `${e.serviceNames.length} services`), visibility: 'xl', width: 160 },
    { key: 'coverage', label: 'Coverage Type', value: (e) => e.coverage.coverageType, sortable: true, visibility: 'lg', mobile: 'meta', width: 160 },
    { key: 'start', label: 'Start Date', value: (e) => e.validity.startDate, type: 'date', sortable: true, visibility: '2xl', width: 120 },
    { key: 'end', label: 'End Date', value: (e) => e.validity.endDate, type: 'date', sortable: true, visibility: 'md', mobile: 'meta', width: 120 },
    { key: 'limit', label: 'Usage Limit', value: (e) => (e.usageSummary.allowed === null ? 'Unlimited' : `${e.usageSummary.allowed} ${e.usageSummary.unit.toLowerCase()}`), visibility: 'xl', width: 120 },
    { key: 'used', label: 'Used', value: (e) => e.usageSummary.consumed, type: 'number', sortable: true, visibility: 'xl', width: 80 },
    { key: 'remaining', label: 'Remaining', value: (e) => e.usageSummary.remaining, type: 'badge', tone: (e) => USAGE_STATE_TONE[e.usageSummary.state], sortable: true, visibility: 'lg', width: 110 },
    { key: 'status', label: 'Status', value: (e) => e.effectiveStatus, type: 'badge', tone: (e) => ENTITLEMENT_STATUS_TONE[e.effectiveStatus], sortable: true, mobile: 'badge', width: 110 },
  ];
}

export function priceRuleColumns(showService = true): DataColumn<PriceRuleListItem>[] {
  return [
    ...(showService ? [{ key: 'service', label: 'Service', value: (r: PriceRuleListItem) => r.serviceName, secondary: (r: PriceRuleListItem) => r.serviceCode, link: (r: PriceRuleListItem) => `/app/catalog/services/${r.serviceId}`, sortable: true, mobile: 'title' as const, width: 230 }] : []),
    { key: 'scope', label: 'Applies To', value: (r) => r.scope, secondary: (r) => r.priceListName, sortable: true, mobile: showService ? 'meta' : 'title', width: 240 },
    { key: 'model', label: 'Pricing Model', value: (r) => r.model, sortable: true, visibility: 'lg', width: 150 },
    { key: 'price', label: 'Base Price', value: (r) => r.basePrice, type: 'currency', currency: (r) => r.currency, secondary: (r) => `per ${r.unit.toLowerCase()}`, sortable: true, mobile: 'meta', width: 140 },
    { key: 'min', label: 'Min / Max Charge', value: (r) => (r.minCharge === null && r.maxCharge === null ? null : `${r.minCharge ?? '—'} / ${r.maxCharge ?? '—'}`), visibility: 'xl', width: 140 },
    { key: 'discount', label: 'Discount', value: (r) => (r.discountAllowed ? `Up to ${r.discountLimit ?? 0}%` : 'Not allowed'), visibility: 'xl', width: 120 },
    { key: 'tax', label: 'Tax Profile', value: (r) => r.taxProfileName, visibility: '2xl', width: 140 },
    { key: 'from', label: 'Effective From', value: (r) => r.effectiveFrom, type: 'date', sortable: true, visibility: 'md', width: 130 },
    { key: 'to', label: 'Effective To', value: (r) => r.effectiveTo, type: 'date', sortable: true, visibility: 'lg', width: 130 },
    { key: 'state', label: 'State', value: (r) => r.state, type: 'badge', tone: (r) => PRICE_STATE_TONE[r.state], sortable: true, mobile: 'badge', width: 110 },
  ];
}

export function usageColumns(showEntitlement = true): DataColumn<UsageRecordListItem>[] {
  return [
    { key: 'date', label: 'Date', value: (u) => u.date, type: 'datetime', sortable: true, mobile: 'meta', width: 150 },
    ...(showEntitlement ? [{ key: 'entitlement', label: 'Entitlement', value: (u: UsageRecordListItem) => u.entitlementNumber, secondary: (u: UsageRecordListItem) => u.customerName, link: (u: UsageRecordListItem) => `/app/catalog/entitlements/${u.entitlementId}`, sortable: true, width: 200 }] : []),
    { key: 'service', label: 'Service', value: (u) => u.serviceName, secondary: (u) => u.serviceType, sortable: true, mobile: 'title', width: 220 },
    { key: 'site', label: 'Site', value: (u) => u.siteName, visibility: 'lg', width: 170 },
    { key: 'asset', label: 'Asset', value: (u) => u.assetLabel, visibility: 'xl', width: 180 },
    { key: 'visits', label: 'Visits', value: (u) => u.visits, type: 'number', visibility: 'md', width: 80 },
    { key: 'hours', label: 'Hours', value: (u) => u.hours, type: 'number', visibility: 'md', width: 80 },
    { key: 'reference', label: 'Reference', value: (u) => u.reference, type: 'mono', visibility: 'lg', width: 120 },
    { key: 'technician', label: 'Technician', value: (u) => u.technician, visibility: 'xl', width: 150 },
    { key: 'covered', label: 'Coverage', value: (u) => (u.covered ? 'Covered' : 'Over limit'), type: 'badge', tone: (u) => (u.covered ? 'ok' : 'danger'), sortable: true, mobile: 'badge', width: 110 },
  ];
}
