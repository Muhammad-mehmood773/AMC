import { Injectable } from '@angular/core';
import { daysBetween } from '@shared/utils/format';
import type { Asset, AssetDetail, AssetListItem } from '../../models/asset.model';
import type { AssetComponent, ComponentListItem } from '../../models/component.model';
import type { AgreementRef, AssetCoverage, CoverageListItem, CoverageState } from '../../models/coverage.model';
import type { AssetDocument, AssetDocumentListItem, AssetDocumentStatus } from '../../models/document.model';
import {
  FAILURE_SERVICE_TYPES,
  type LifecycleEvent,
  type LifecycleEventListItem,
  type LifecycleEventType,
  type ServiceRecord,
  type ServiceRecordListItem,
} from '../../models/history.model';
import type { AssetTransfer, InstallationRecord, InstallationListItem, TransferListItem } from '../../models/operations.model';
import type { AssetWarranty, WarrantyListItem, WarrantyStatus } from '../../models/warranty.model';
import { ASSET_RULES } from '../asset.config';
import { type AssetDatabase, buildAssetSeed } from './asset-seed';

const OPEN_SR = new Set(['New', 'Assigned', 'In Progress', 'On Hold']);
const OPEN_WO = new Set(['Scheduled', 'In Progress', 'On Hold']);
const LIVE = new Set(['Active', 'Expiring']);

const today = () => new Date().toISOString().slice(0, 10);

function groupBy<T extends { assetId: string }>(items: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.assetId);
    if (list) list.push(item);
    else map.set(item.assetId, [item]);
  }
  return map;
}

interface AssetIndex {
  readonly coverages: Map<string, AssetCoverage[]>;
  readonly warranties: Map<string, AssetWarranty[]>;
  readonly components: Map<string, AssetComponent[]>;
  readonly records: Map<string, ServiceRecord[]>;
  readonly requests: Map<string, number>;
  readonly workOrders: Map<string, number>;
}

/**
 * In-memory database shared by the asset mock adapters. Holds the seeded data for the lifetime of
 * the feature injector and derives the read models (warranty / coverage status, aggregates).
 */
@Injectable()
export class MockAssetStore {
  readonly db: AssetDatabase = buildAssetSeed();
  private eventSeq = this.db.lifecycle.length + 1;

  get currentUser(): string {
    return this.db.reference.currentUser;
  }

  now(): string {
    return new Date().toISOString();
  }

  log(assetId: string, eventType: LifecycleEventType, comments: string, reference: string | null = null, previousValue: string | null = null, newValue: string | null = null): void {
    const entry: LifecycleEvent = {
      id: `EVT-N${String(this.eventSeq++).padStart(6, '0')}`,
      assetId,
      timestamp: this.now(),
      user: this.currentUser,
      eventType,
      previousValue,
      newValue,
      reference,
      comments,
    };
    this.db.lifecycle.unshift(entry);
  }

  private assetCache: { source: readonly Asset[]; map: Map<string, Asset> } | null = null;

  asset(id: string): Asset | undefined {
    if (this.assetCache?.source !== this.db.assets) {
      this.assetCache = { source: this.db.assets, map: new Map(this.db.assets.map((a) => [a.id, a])) };
    }
    return this.assetCache.map.get(id);
  }

  replaceAsset(next: Asset): void {
    this.db.assets = this.db.assets.map((a) => (a.id === next.id ? next : a));
  }

  customerName(id: string | null | undefined): string | null {
    return id ? (this.db.reference.customers.find((c) => c.id === id)?.name ?? null) : null;
  }

  siteName(id: string | null | undefined): string | null {
    return id ? (this.db.reference.sites.find((s) => s.id === id)?.name ?? null) : null;
  }

  agreement(id: string): AgreementRef | undefined {
    return this.db.reference.agreements.find((a) => a.id === id);
  }

  // ----- Derived statuses ---------------------------------------------------

  warrantyStatus(w: AssetWarranty, on = today()): Exclude<WarrantyStatus, 'No Warranty'> {
    if (w.cancelled) return 'Cancelled';
    if (on < w.startDate) return 'Not Started';
    if (on > w.endDate) return 'Expired';
    return daysBetween(on, w.endDate) <= ASSET_RULES.warrantyExpiringDays ? 'Expiring Soon' : 'Active';
  }

  /** Asset-level warranty status from its (non-component) warranties. */
  assetWarranty(warranties: readonly AssetWarranty[]): { status: WarrantyStatus; end: string | null; reference: string | null } {
    const own = warranties.filter((w) => !w.componentId);
    if (!own.length) return { status: 'No Warranty', end: null, reference: null };
    const ranked = (['Active', 'Expiring Soon', 'Not Started', 'Expired', 'Cancelled'] as const).map((status) => ({
      status,
      items: own.filter((w) => this.warrantyStatus(w) === status).sort((a, b) => b.endDate.localeCompare(a.endDate)),
    }));
    const live = [...ranked[0].items, ...ranked[1].items].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    if (live) return { status: this.warrantyStatus(live), end: live.endDate, reference: live.reference };
    const first = ranked.find((r) => r.items.length)!;
    return { status: first.status, end: first.items[0].endDate, reference: first.items[0].reference };
  }

  coverageState(coverages: readonly AssetCoverage[]): { state: CoverageState; amcActive: boolean; contract: AgreementRef | null } {
    const agreements = coverages.map((c) => this.agreement(c.agreementId)).filter((a): a is AgreementRef => !!a);
    const live = agreements.filter((a) => LIVE.has(a.status)).sort((a, b) => (a.status === 'Active' ? -1 : 1) - (b.status === 'Active' ? -1 : 1));
    const state: CoverageState = agreements.some((a) => a.status === 'Active')
      ? 'Active'
      : agreements.some((a) => a.status === 'Expiring')
        ? 'Expiring'
        : agreements.some((a) => a.status === 'Expired' || a.status === 'Terminated')
          ? 'Expired'
          : 'None';
    return { state, amcActive: live.some((a) => a.kind === 'AMC'), contract: live[0] ?? null };
  }

  documentStatus(doc: AssetDocument): { status: AssetDocumentStatus; daysToExpiry: number | null } {
    const daysToExpiry = doc.expiryDate ? daysBetween(new Date(), doc.expiryDate) : null;
    let status: AssetDocumentStatus;
    if (doc.archived) status = 'Archived';
    else if (daysToExpiry === null) status = 'No Expiry';
    else if (daysToExpiry < 0) status = 'Expired';
    else if (daysToExpiry <= doc.reminderDays) status = 'Expiring Soon';
    else status = 'Valid';
    return { status, daysToExpiry };
  }

  // ----- Read models --------------------------------------------------------

  index(): AssetIndex {
    const { db } = this;
    const count = (items: readonly { assetId: string; status: string }[], open: Set<string>) => {
      const map = new Map<string, number>();
      for (const item of items) if (open.has(item.status)) map.set(item.assetId, (map.get(item.assetId) ?? 0) + 1);
      return map;
    };
    return {
      coverages: groupBy(db.coverages),
      warranties: groupBy(db.warranties),
      components: groupBy(db.components),
      records: groupBy(db.serviceRecords),
      requests: count(db.serviceRequests, OPEN_SR),
      workOrders: count(db.workOrders, OPEN_WO),
    };
  }

  listItem(asset: Asset, index: AssetIndex = this.index()): AssetListItem {
    const site = this.db.reference.sites.find((s) => s.id === asset.siteId);
    const customer = this.db.reference.customers.find((c) => c.id === asset.customerId);
    const coverages = index.coverages.get(asset.id) ?? [];
    const warranty = this.assetWarranty(index.warranties.get(asset.id) ?? []);
    const coverage = this.coverageState(coverages);
    const records = index.records.get(asset.id) ?? [];
    const since = new Date(Date.now() - ASSET_RULES.repeatedFailureWindowDays * 86_400_000).toISOString();
    return {
      ...asset,
      customerName: customer?.name ?? null,
      customerCode: customer?.code ?? null,
      siteName: site?.name ?? null,
      siteCity: site?.city ?? null,
      warrantyStatus: warranty.status,
      warrantyEnd: warranty.end,
      coverageState: coverage.state,
      amcActive: coverage.amcActive,
      activeContractNumber: coverage.contract?.number ?? null,
      hasActiveSla: !!asset.service.slaId && (coverage.state === 'Active' || coverage.state === 'Expiring'),
      componentCount: (index.components.get(asset.id) ?? []).filter((c) => c.status !== 'Replaced' && c.status !== 'Removed').length,
      openServiceRequests: index.requests.get(asset.id) ?? 0,
      openWorkOrders: index.workOrders.get(asset.id) ?? 0,
      failuresLast180Days: records.filter((r) => r.date >= since && (FAILURE_SERVICE_TYPES.includes(r.serviceType) || (r.serviceType === 'Warranty Service'))).length,
      lastServiceDate: records.reduce<string | null>((latest, r) => (!latest || r.date > latest ? r.date : latest), null),
    };
  }

  detail(asset: Asset): AssetDetail {
    const index = this.index();
    const item = this.listItem(asset, index);
    const site = this.db.reference.sites.find((s) => s.id === asset.siteId);
    const records = index.records.get(asset.id) ?? [];
    return {
      ...item,
      siteAddress: site?.addressLine ?? null,
      latitude: site?.latitude ?? null,
      longitude: site?.longitude ?? null,
      slaName: this.db.reference.slas.find((s) => s.id === asset.service.slaId)?.name ?? null,
      territoryName: this.db.reference.territories.find((t) => t.id === asset.service.serviceTerritoryId)?.name ?? null,
      totalServiceVisits: records.length,
      totalPartsUsed: records.reduce((sum, r) => sum + r.partsUsed.reduce((s, p) => s + p.quantity, 0), 0),
      totalServiceCost: records.reduce((sum, r) => sum + this.serviceCost(r), 0),
      totalDocuments: this.db.documents.filter((d) => d.assetId === asset.id && !d.archived).length,
    };
  }

  serviceCost(r: ServiceRecord): number {
    return r.laborCost + r.partsUsed.reduce((s, p) => s + p.quantity * p.unitCost, 0);
  }

  private assetRef(assetId: string) {
    const asset = this.asset(assetId);
    return {
      assetCode: asset?.code ?? assetId,
      assetName: asset?.name ?? 'Unknown asset',
      assetTag: asset?.tag ?? '',
      customerName: this.customerName(asset?.customerId),
      siteName: this.siteName(asset?.siteId),
    };
  }

  private componentName(id: string | null): string | null {
    return id ? (this.db.components.find((c) => c.id === id)?.name ?? null) : null;
  }

  componentItem(c: AssetComponent): ComponentListItem {
    const ref = this.assetRef(c.assetId);
    return {
      ...c,
      assetCode: ref.assetCode,
      assetName: ref.assetName,
      replacesName: this.componentName(c.replacesId),
      replacedByName: this.componentName(c.replacedById),
      serviceCount: this.db.serviceRecords.filter((r) => r.componentId === c.id).length,
      documentCount: this.db.documents.filter((d) => d.componentId === c.id).length,
      warrantyActive: !!c.warrantyEnd && c.warrantyEnd >= today() && c.status !== 'Replaced' && c.status !== 'Removed',
    };
  }

  warrantyItem(w: AssetWarranty): WarrantyListItem {
    const ref = this.assetRef(w.assetId);
    return {
      ...w,
      ...ref,
      status: this.warrantyStatus(w),
      daysRemaining: daysBetween(new Date(), w.endDate),
      componentName: this.componentName(w.componentId),
      documentName: w.documentId ? (this.db.documents.find((d) => d.id === w.documentId)?.name ?? null) : null,
      warrantyServices: this.db.serviceRecords.filter((r) => r.assetId === w.assetId && r.warrantyService && r.date.slice(0, 10) >= w.startDate && r.date.slice(0, 10) <= w.endDate).length,
    };
  }

  coverageItem(c: AssetCoverage): CoverageListItem {
    const ref = this.assetRef(c.assetId);
    const agreement = this.agreement(c.agreementId)!;
    const sla = this.db.reference.slas.find((s) => s.id === c.slaId);
    return {
      ...c,
      assetCode: ref.assetCode,
      assetName: ref.assetName,
      assetTag: ref.assetTag,
      customerName: ref.customerName ?? '',
      siteName: ref.siteName,
      agreementNumber: agreement.number,
      agreementTitle: agreement.title,
      kind: agreement.kind,
      startDate: agreement.startDate,
      endDate: agreement.endDate,
      status: agreement.status,
      slaName: sla?.name ?? null,
      responseHours: sla?.responseHours ?? null,
      resolutionHours: sla?.resolutionHours ?? null,
      visitCoverage: c.visitsAllowed === null ? 'Unlimited breakdown visits' : `${c.visitsUsed} of ${c.visitsAllowed} visits used`,
    };
  }

  installationItem(r: InstallationRecord): InstallationListItem {
    const ref = this.assetRef(r.assetId);
    return {
      ...r,
      assetCode: ref.assetCode,
      assetName: ref.assetName,
      assetTag: ref.assetTag,
      assetStatus: this.asset(r.assetId)?.status ?? '',
      customerName: this.customerName(r.customerId),
      siteName: this.siteName(r.siteId),
      documentCount: this.db.documents.filter((d) => d.assetId === r.assetId && (d.type === 'Installation Documents' || d.type === 'Commissioning Reports')).length,
    };
  }

  transferItem(t: AssetTransfer): TransferListItem {
    const ref = this.assetRef(t.assetId);
    return {
      ...t,
      assetCode: ref.assetCode,
      assetName: ref.assetName,
      assetTag: ref.assetTag,
      fromCustomerName: this.customerName(t.from.customerId),
      fromSiteName: this.siteName(t.from.siteId),
      toCustomerName: this.customerName(t.to.customerId),
      toSiteName: this.siteName(t.to.siteId),
      customerChanged: t.from.customerId !== t.to.customerId,
    };
  }

  documentItem(d: AssetDocument): AssetDocumentListItem {
    const ref = this.assetRef(d.assetId);
    return { ...d, ...this.documentStatus(d), assetCode: ref.assetCode, assetName: ref.assetName, customerName: ref.customerName, componentName: this.componentName(d.componentId) };
  }

  serviceItem(r: ServiceRecord): ServiceRecordListItem {
    const ref = this.assetRef(r.assetId);
    const partsCost = r.partsUsed.reduce((s, p) => s + p.quantity * p.unitCost, 0);
    return {
      ...r,
      assetCode: ref.assetCode,
      assetName: ref.assetName,
      customerName: ref.customerName,
      siteName: ref.siteName,
      componentName: this.componentName(r.componentId),
      partsCost,
      serviceCost: partsCost + r.laborCost,
      partsCount: r.partsUsed.reduce((s, p) => s + p.quantity, 0),
    };
  }

  lifecycleItem(e: LifecycleEvent): LifecycleEventListItem {
    const ref = this.assetRef(e.assetId);
    return { ...e, assetCode: ref.assetCode, assetName: ref.assetName, customerName: ref.customerName };
  }
}
