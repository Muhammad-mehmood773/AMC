import { Injectable, inject } from '@angular/core';
import { type Observable, defer } from 'rxjs';
import { fail, pad, respond, uid } from '../../../customers/data/mock/mock-utils';
import {
  END_OF_LIFE_STATUSES,
  NON_CUSTOMER_OWNERSHIP,
  OPERATIONAL_STATUSES,
  PRE_INSTALLATION_STATUSES,
  type Asset,
  type AssetBulkUpdate,
  type AssetDetail,
  type AssetListItem,
  type AssetStatus,
  type AssetUpsert,
  type SerialCheck,
} from '../../models/asset.model';
import type { AssetComponent, ComponentFilter, ComponentInput, ComponentListItem, ComponentReplacement } from '../../models/component.model';
import type { AssetCoverage, CoverageFilter, CoverageFlag, CoverageListItem, EntitlementCheck, ServiceKind } from '../../models/coverage.model';
import type { AssetDashboard, AssetDashboardFilters, DashboardAssetRow } from '../../models/dashboard.model';
import type { AssetDocument, AssetDocumentListItem, DocumentFilter, DocumentReplace, DocumentUpload } from '../../models/document.model';
import type {
  AssetRelated,
  LifecycleEventListItem,
  LifecycleFilter,
  PartUsageRow,
  ServiceHistoryFilter,
  ServiceRecordListItem,
} from '../../models/history.model';
import {
  COMMISSIONING_CHECKLIST,
  type AssetTransfer,
  type CommissioningInput,
  type CustomerConfirmation,
  type InstallationInput,
  type InstallationListItem,
  type InstallationRecord,
  type LocationHistoryEntry,
  type OperationsFilter,
  type TransferInput,
  type TransferListItem,
} from '../../models/operations.model';
import type { AssetReferenceData } from '../../models/reference.model';
import type { AssetWarranty, ClaimInput, WarrantyFilter, WarrantyInput, WarrantyListItem } from '../../models/warranty.model';
import {
  AssetApi,
  AssetDocumentApi,
  AssetReferenceApi,
  ComponentApi,
  EntitlementApi,
  InstallationApi,
  LifecycleApi,
  ServiceHistoryApi,
  TransferApi,
  WarrantyApi,
} from '../asset.api';
import { ASSET_RULES, SITE_REQUIRED_STATUSES, STATUS_TRANSITIONS, TRANSACTION_BLOCKED_STATUSES } from '../asset.config';
import { attentionReasons, matchesFlag } from '../asset-flags';
import { coverageTerms } from './asset-seed';
import { MockAssetStore } from './mock-asset-store';

const BLOCKED_CUSTOMER = new Set(['Inactive', 'Archived']);
const today = () => new Date().toISOString().slice(0, 10);
const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** Runs the mutation lazily on subscribe, then emits the result with simulated latency. */
function mutate<T>(work: () => T | Error): Observable<T> {
  return defer(() => {
    const result = work();
    return result instanceof Error ? fail(result.message) : respond(result, 380);
  });
}

function query<T>(work: () => T): Observable<T> {
  return defer(() => respond(work()));
}

function blockedError(asset: Asset, action: string): Error | null {
  return TRANSACTION_BLOCKED_STATUSES.includes(asset.status) ? new Error(`${action} is not available for ${asset.status.toLowerCase()} assets.`) : null;
}

@Injectable()
export class MockAssetApi extends AssetApi {
  private readonly store = inject(MockAssetStore);

  list(): Observable<AssetListItem[]> {
    return query(() => {
      const index = this.store.index();
      return [...this.store.db.assets].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((a) => this.store.listItem(a, index));
    });
  }

  get(id: string): Observable<AssetDetail> {
    return defer(() => {
      const asset = this.store.asset(id);
      return asset ? respond(this.store.detail(asset)) : fail(`Asset ${id} was not found.`);
    });
  }

  create(input: AssetUpsert): Observable<Asset> {
    return mutate(() => {
      const code = input.code.trim().toUpperCase();
      if (!this.codeFree(code)) return new Error(`Asset ID ${code} is already in use.`);
      const error = this.validate(input);
      if (error) return error;
      const customer = this.store.db.reference.customers.find((c) => c.id === input.customerId);
      if (customer && BLOCKED_CUSTOMER.has(customer.status)) return new Error(`New assets cannot be added for ${customer.status.toLowerCase()} customers.`);
      const { warranty, ...fields } = input;
      const asset: Asset = { ...fields, id: code, code, createdAt: this.store.now(), createdBy: this.store.currentUser, updatedAt: null, updatedBy: null };
      this.store.db.assets = [asset, ...this.store.db.assets];
      this.store.log(asset.id, 'Asset Created', `${asset.name} (${asset.model || asset.type}) registered.`, asset.code);
      this.syncWarranty(asset, warranty ?? null);
      this.syncCoverage(asset);
      return asset;
    });
  }

  update(id: string, input: AssetUpsert): Observable<Asset> {
    return mutate(() => {
      const current = this.store.asset(id);
      if (!current) return new Error(`Asset ${id} was not found.`);
      const error = this.validate(input, id);
      if (error) return error;
      const { warranty, ...fields } = input;
      const asset: Asset = { ...current, ...fields, id, code: current.code, updatedAt: this.store.now(), updatedBy: this.store.currentUser };
      this.store.replaceAsset(asset);
      if (current.status !== asset.status) this.store.log(id, 'Status Changed', 'Status updated on the asset record.', null, current.status, asset.status);
      if (current.siteId !== asset.siteId || current.installation.location !== asset.installation.location) {
        this.store.log(id, 'Location Changed', 'Location updated on the asset record.', null, this.locationLabel(current), this.locationLabel(asset));
      }
      if (current.ownership.type !== asset.ownership.type || current.ownership.owner !== asset.ownership.owner) {
        this.store.log(id, 'Ownership Changed', 'Ownership details updated.', null, `${current.ownership.type} · ${current.ownership.owner}`, `${asset.ownership.type} · ${asset.ownership.owner}`);
      }
      const changed = this.changedSections(current, asset);
      if (changed.length) this.store.log(id, 'Asset Updated', `Updated ${changed.join(', ')}.`, asset.code);
      this.syncWarranty(asset, warranty ?? null);
      this.syncCoverage(asset);
      return asset;
    });
  }

  setStatus(ids: readonly string[], status: AssetStatus, comment = ''): Observable<void> {
    return mutate(() => {
      const assets = ids.map((id) => this.store.asset(id)).filter((a): a is Asset => !!a);
      const invalid = assets.filter((a) => a.status !== status && !STATUS_TRANSITIONS[a.status].includes(status));
      if (invalid.length) {
        return new Error(`${invalid.length === 1 ? `${invalid[0].code} (${invalid[0].status})` : `${invalid.length} assets`} cannot be changed to ${status}.`);
      }
      for (const asset of assets) {
        if (asset.status === status) continue;
        const next: Asset = {
          ...asset,
          status,
          operational: END_OF_LIFE_STATUSES.includes(status) ? { ...asset.operational, nextMaintenanceDate: null } : asset.operational,
          updatedAt: this.store.now(),
          updatedBy: this.store.currentUser,
        };
        this.store.replaceAsset(next);
        const type = status === 'Retired' ? 'Asset Retired' : status === 'Decommissioned' ? 'Asset Decommissioned' : 'Status Changed';
        this.store.log(asset.id, type, comment || `Status changed to ${status}.`, null, asset.status, status);
        if (END_OF_LIFE_STATUSES.includes(status)) {
          this.store.db.maintenance = this.store.db.maintenance.filter((m) => m.assetId !== asset.id);
        }
      }
      return undefined;
    });
  }

  bulkUpdate(ids: readonly string[], changes: AssetBulkUpdate): Observable<void> {
    if (changes.status) return this.setStatus(ids, changes.status);
    return mutate(() => {
      for (const id of ids) {
        const asset = this.store.asset(id);
        if (!asset) continue;
        const next: Asset = {
          ...asset,
          category: changes.category ?? asset.category,
          operational: { ...asset.operational, serviceRegion: changes.serviceRegion ?? asset.operational.serviceRegion },
          service: { ...asset.service, maintenancePlan: changes.maintenancePlan ?? asset.service.maintenancePlan },
          updatedAt: this.store.now(),
          updatedBy: this.store.currentUser,
        };
        this.store.replaceAsset(next);
        const [field, from, to] = changes.category
          ? ['Category', asset.category, changes.category]
          : changes.serviceRegion
            ? ['Service Region', asset.operational.serviceRegion, changes.serviceRegion]
            : ['Maintenance Plan', asset.service.maintenancePlan, changes.maintenancePlan ?? ''];
        this.store.log(id, 'Asset Updated', `${field} updated through bulk action.`, null, from || null, to || null);
      }
      return undefined;
    });
  }

  nextCode(): Observable<string> {
    return query(() => {
      const max = this.store.db.assets.reduce((m, a) => Math.max(m, Number(a.code.match(/(\d+)$/)?.[1] ?? 0)), 0);
      return `AST-${pad(max + 1, 5)}`;
    });
  }

  isCodeAvailable(code: string, excludeId?: string): Observable<boolean> {
    return defer(() => respond(this.codeFree(code, excludeId), 200));
  }

  isTagAvailable(tag: string, excludeId?: string): Observable<boolean> {
    return defer(() => respond(this.tagFree(tag, excludeId), 200));
  }

  isSerialAvailable(check: SerialCheck, excludeId?: string): Observable<boolean> {
    return defer(() => respond(this.serialFree(check, excludeId), 200));
  }

  related(id: string): Observable<AssetRelated> {
    return query(() => {
      const { db } = this.store;
      return {
        serviceRequests: db.serviceRequests.filter((r) => r.assetId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        workOrders: db.workOrders.filter((w) => w.assetId === id).sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)),
        maintenance: db.maintenance.filter((m) => m.assetId === id).sort((a, b) => a.nextDue.localeCompare(b.nextDue)),
      };
    });
  }

  locationHistory(id: string): Observable<LocationHistoryEntry[]> {
    return query(() => {
      const asset = this.store.asset(id);
      if (!asset) return [];
      const transfers = this.store.db.transfers.filter((t) => t.assetId === id && t.status === 'Completed').sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
      const entries: LocationHistoryEntry[] = [];
      let start = asset.installation.date ?? asset.createdAt.slice(0, 10);
      let reason = asset.installation.date ? 'Initial installation' : 'Registered';
      let reference: string | null = null;
      for (const t of transfers) {
        entries.push({ from: start, to: t.completedAt, customerName: this.store.customerName(t.from.customerId), siteName: this.store.siteName(t.from.siteId), siteId: t.from.siteId, location: t.from.location, reason, reference, current: false });
        start = t.completedAt ?? start;
        reason = `Transfer — ${t.reason}`;
        reference = t.reference;
      }
      entries.push({ from: start, to: null, customerName: this.store.customerName(asset.customerId), siteName: this.store.siteName(asset.siteId), siteId: asset.siteId, location: asset.installation.location, reason, reference, current: true });
      return entries.reverse();
    });
  }

  dashboard(f: AssetDashboardFilters): Observable<AssetDashboard> {
    return query(() => {
      const index = this.store.index();
      const has = (list: readonly string[], value: string | null | undefined) => !list.length || list.includes(value ?? '');
      const inRange = (from: string, to: string, value: string | null) => (!from && !to) || (!!value && (!from || value >= from) && (!to || value <= to));
      const items = this.store.db.assets
        .map((a) => this.store.listItem(a, index))
        .filter(
          (a) =>
            has(f.customers, a.customerId) && has(f.sites, a.siteId) && has(f.categories, a.category) && has(f.types, a.type) &&
            has(f.manufacturers, a.manufacturer) && has(f.models, a.model) && has(f.statuses, a.status) && has(f.warrantyStatuses, a.warrantyStatus) &&
            has(f.coverageStates, a.coverageState) && has(f.regions, a.operational.serviceRegion) &&
            inRange(f.installedFrom, f.installedTo, a.installation.date) && inRange(f.maintenanceFrom, f.maintenanceTo, a.operational.nextMaintenanceDate),
        );
      const ids = new Set(items.map((a) => a.id));
      const count = (flag: string) => items.filter((a) => matchesFlag(a, flag)).length;
      const row = (a: AssetListItem, date: string | null, detail: string, n = 0): DashboardAssetRow => ({
        id: a.id, code: a.code, name: a.name, tag: a.tag, category: a.category, status: a.status, criticality: a.criticality,
        customerName: a.customerName, siteName: a.siteName, date, detail, count: n,
      });
      const tally = (values: string[]) => [...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
      const daysTo = (date: string) => Math.round((new Date(date).getTime() - Date.now()) / 86_400_000);
      return {
        kpis: {
          total: items.length,
          active: count('active'),
          inactive: count('inactive'),
          installed: count('installed'),
          underWarranty: items.filter((a) => a.warrantyStatus === 'Active' || a.warrantyStatus === 'Expiring Soon').length,
          warrantyExpiring: items.filter((a) => a.warrantyStatus === 'Expiring Soon').length,
          underAmc: count('under-amc'),
          withActiveSla: count('active-sla'),
          requiringMaintenance: count('maintenance-required'),
          withOpenServiceRequests: count('open-sr'),
          withOpenWorkOrders: count('open-wo'),
          duePreventiveMaintenance: count('pm-due'),
          underBreakdown: count('breakdown'),
          retired: count('retired'),
        },
        byStatus: tally(items.map((a) => a.status)),
        byCategory: tally(items.map((a) => a.category)),
        byCriticality: tally(items.map((a) => a.criticality)),
        recentlyAdded: [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((a) => row(a, a.createdAt, `${a.category} · ${a.siteName ?? 'No site'}`)),
        recentlyInstalled: items.filter((a) => a.installation.date).sort((a, b) => b.installation.date!.localeCompare(a.installation.date!)).slice(0, 6).map((a) => row(a, a.installation.date, a.installation.location)),
        warrantyExpiry: items.filter((a) => a.warrantyStatus === 'Expiring Soon').sort((a, b) => (a.warrantyEnd ?? '').localeCompare(b.warrantyEnd ?? '')).slice(0, 6).map((a) => row(a, a.warrantyEnd, a.manufacturer, daysTo(a.warrantyEnd!))),
        upcomingMaintenance: items.filter((a) => a.operational.nextMaintenanceDate && !END_OF_LIFE_STATUSES.includes(a.status)).sort((a, b) => a.operational.nextMaintenanceDate!.localeCompare(b.operational.nextMaintenanceDate!)).slice(0, 6).map((a) => row(a, a.operational.nextMaintenanceDate, a.service.maintenancePlan, daysTo(a.operational.nextMaintenanceDate!))),
        openServiceRequests: items.filter((a) => a.openServiceRequests > 0).sort((a, b) => b.openServiceRequests - a.openServiceRequests).slice(0, 6).map((a) => row(a, null, a.siteName ?? '', a.openServiceRequests)),
        openWorkOrders: items.filter((a) => a.openWorkOrders > 0).sort((a, b) => b.openWorkOrders - a.openWorkOrders).slice(0, 6).map((a) => row(a, null, a.siteName ?? '', a.openWorkOrders)),
        repeatedFailures: items.filter((a) => matchesFlag(a, 'repeated-failures')).sort((a, b) => b.failuresLast180Days - a.failuresLast180Days).slice(0, 6).map((a) => row(a, a.lastServiceDate, `${a.failuresLast180Days} failures in ${ASSET_RULES.repeatedFailureWindowDays} days`, a.failuresLast180Days)),
        requiringAttention: items.map((a) => ({ a, reasons: attentionReasons(a) })).filter((x) => x.reasons.length).sort((x, y) => y.reasons.length - x.reasons.length || (x.a.criticality === 'Critical' ? -1 : 1)).slice(0, 6).map((x) => row(x.a, null, x.reasons.join(' · '), x.reasons.length)),
        recentlyTransferred: this.store.db.transfers
          .filter((t) => t.status === 'Completed' && ids.has(t.assetId))
          .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
          .slice(0, 6)
          .map((t) => row(this.store.listItem(this.store.asset(t.assetId)!, index), t.completedAt, `${this.store.siteName(t.from.siteId) ?? '—'} → ${this.store.siteName(t.to.siteId) ?? '—'}`)),
      };
    });
  }

  // ----- Rules -------------------------------------------------------------

  private codeFree(code: string, excludeId?: string): boolean {
    return !this.store.db.assets.some((a) => a.id !== excludeId && norm(a.code) === norm(code));
  }

  private tagFree(tag: string, excludeId?: string): boolean {
    return !ASSET_RULES.uniqueTag || !tag.trim() || !this.store.db.assets.some((a) => a.id !== excludeId && norm(a.tag) === norm(tag));
  }

  private serialFree(check: SerialCheck, excludeId?: string): boolean {
    const scope = ASSET_RULES.serialScope;
    if (scope === 'none' || !check.serialNumber.trim() || ASSET_RULES.serialExemptTypes.includes(check.type)) return true;
    return !this.store.db.assets.some(
      (a) =>
        a.id !== excludeId &&
        norm(a.serialNumber) === norm(check.serialNumber) &&
        (scope === 'global' || (norm(a.manufacturer) === norm(check.manufacturer) && (scope === 'manufacturer' || norm(a.type) === norm(check.type)))),
    );
  }

  private validate(input: AssetUpsert, excludeId?: string): Error | null {
    if (!this.tagFree(input.tag, excludeId)) return new Error(`Asset tag ${input.tag} is already in use.`);
    if (!this.serialFree(input, excludeId)) return new Error(`Serial number ${input.serialNumber} already exists for ${input.manufacturer} ${input.type}.`);
    if (!input.customerId && !NON_CUSTOMER_OWNERSHIP.includes(input.ownership.type)) return new Error('A customer is required unless the asset is company or vendor owned.');
    if (!input.customerId && !input.ownership.owner.trim()) return new Error('An asset owner is required for assets without a customer.');
    if (input.customerId && SITE_REQUIRED_STATUSES.includes(input.status) && !input.siteId) return new Error('Installed customer assets must be associated with a service site.');
    if (input.siteId) {
      const site = this.store.db.reference.sites.find((s) => s.id === input.siteId);
      if (!site || (input.customerId && site.customerId !== input.customerId)) return new Error('The selected site does not belong to the selected customer.');
    }
    return null;
  }

  private locationLabel(asset: Asset): string {
    return [this.store.siteName(asset.siteId), asset.installation.location].filter(Boolean).join(' — ') || 'Not set';
  }

  private changedSections(a: Asset, b: Asset): string[] {
    const sections: [string, unknown, unknown][] = [
      ['identification', [a.tag, a.name, a.barcode, a.rfid], [b.tag, b.name, b.barcode, b.rfid]],
      ['classification', [a.category, a.type, a.subType, a.criticality, a.serviceClass, a.maintenanceClass], [b.category, b.type, b.subType, b.criticality, b.serviceClass, b.maintenanceClass]],
      ['manufacturer information', [a.manufacturer, a.brand, a.model, a.modelNumber, a.serialNumber, a.partNumber, a.productFamily, a.manufacturingDate], [b.manufacturer, b.brand, b.model, b.modelNumber, b.serialNumber, b.partNumber, b.productFamily, b.manufacturingDate]],
      ['installation information', a.installation, b.installation],
      ['technical information', [a.technical, a.customAttributes], [b.technical, b.customAttributes]],
      ['service information', a.service, b.service],
      ['financial information', a.ownership, b.ownership],
      ['operational information', a.operational, b.operational],
      ['notes', a.notes, b.notes],
    ];
    return sections.filter(([, x, y]) => JSON.stringify(x) !== JSON.stringify(y)).map(([name]) => name);
  }

  /** The form's warranty section maintains the asset's primary warranty record. */
  private syncWarranty(asset: Asset, input: AssetUpsert['warranty'] | null): void {
    if (!input?.startDate || !input.endDate) return;
    const { db } = this.store;
    const existing = db.warranties.find((w) => w.assetId === asset.id && w.isPrimary);
    const fields = { provider: input.provider, reference: input.reference, startDate: input.startDate, endDate: input.endDate, coverageDetails: input.terms, notes: input.notes };
    if (existing) {
      const changed = JSON.stringify([existing.provider, existing.reference, existing.startDate, existing.endDate, existing.coverageDetails, existing.notes]) !== JSON.stringify(Object.values(fields));
      if (!changed) return;
      db.warranties = db.warranties.map((w) => (w.id === existing.id ? { ...w, ...fields } : w));
      this.store.log(asset.id, 'Warranty Updated', 'Primary warranty updated from the asset record.', input.reference || null, `${existing.startDate} – ${existing.endDate}`, `${input.startDate} – ${input.endDate}`);
    } else {
      db.warranties = [
        ...db.warranties,
        { id: uid('WAR'), assetId: asset.id, componentId: null, type: 'Manufacturer Warranty', exclusions: '', cancelled: false, documentId: null, isPrimary: true, claims: [], createdAt: this.store.now(), createdBy: this.store.currentUser, ...fields },
      ];
      this.store.log(asset.id, input.startDate <= today() ? 'Warranty Started' : 'Warranty Updated', `${input.provider || 'Manufacturer'} warranty registered.`, input.reference || null, null, `Until ${input.endDate}`);
    }
  }

  /** Links the asset to its active contract / AMC as covered asset. */
  private syncCoverage(asset: Asset): void {
    const { db } = this.store;
    for (const agreementId of [asset.service.contractId, asset.service.amcId]) {
      if (!agreementId || db.coverages.some((c) => c.assetId === asset.id && c.agreementId === agreementId)) continue;
      const agreement = this.store.agreement(agreementId);
      if (!agreement) continue;
      const type = agreement.kind === 'AMC' ? 'Comprehensive' : 'Labor Only';
      const coverage: AssetCoverage = {
        id: uid('COV'), assetId: asset.id, agreementId, slaId: asset.service.slaId, entitlement: `${agreement.kind} ${type} — ${asset.category}`,
        coverageType: type, serviceFrequency: asset.service.serviceFrequency ?? 'Quarterly', ...coverageTerms(type), visitsAllowed: 4, visitsUsed: 0,
      };
      db.coverages = [...db.coverages, coverage];
      this.store.log(asset.id, 'Contract Started', `Linked to ${agreement.number} (${agreement.title}).`, agreement.number, null, type);
    }
  }
}

@Injectable()
export class MockComponentApi extends ComponentApi {
  private readonly store = inject(MockAssetStore);

  list(filter: ComponentFilter = {}): Observable<ComponentListItem[]> {
    return query(() => this.store.db.components.filter((c) => !filter.assetId || c.assetId === filter.assetId).map((c) => this.store.componentItem(c)));
  }

  create(assetId: string, input: ComponentInput): Observable<AssetComponent> {
    return mutate(() => {
      const asset = this.store.asset(assetId);
      if (!asset) return new Error('Parent asset was not found.');
      const blocked = blockedError(asset, 'Adding components');
      if (blocked) return blocked;
      const component: AssetComponent = { ...input, id: uid('CMP'), assetId, replacesId: null, replacedById: null, createdAt: this.store.now(), createdBy: this.store.currentUser };
      this.store.db.components = [...this.store.db.components, component];
      this.store.log(assetId, 'Component Added', `${component.name} added as a component.`, component.id, null, component.name);
      return component;
    });
  }

  update(id: string, input: ComponentInput): Observable<AssetComponent> {
    return mutate(() => {
      const current = this.store.db.components.find((c) => c.id === id);
      if (!current) return new Error('Component was not found.');
      const next: AssetComponent = { ...current, ...input };
      this.store.db.components = this.store.db.components.map((c) => (c.id === id ? next : c));
      if (current.status !== next.status) this.store.log(current.assetId, 'Asset Updated', `Component ${next.name} status changed.`, id, current.status, next.status);
      return next;
    });
  }

  replace(id: string, replacement: ComponentReplacement): Observable<AssetComponent> {
    return mutate(() => {
      const current = this.store.db.components.find((c) => c.id === id);
      if (!current) return new Error('Component was not found.');
      if (current.status === 'Replaced' || current.status === 'Removed') return new Error('Only installed components can be replaced.');
      const component: AssetComponent = {
        ...replacement.component, id: uid('CMP'), assetId: current.assetId, replacesId: current.id, replacedById: null,
        installationDate: replacement.component.installationDate ?? replacement.replacementDate, createdAt: this.store.now(), createdBy: this.store.currentUser,
      };
      this.store.db.components = [
        ...this.store.db.components.map((c) => (c.id === id ? { ...c, status: 'Replaced' as const, replacementDate: replacement.replacementDate, replacedById: component.id } : c)),
        component,
      ];
      this.store.log(current.assetId, 'Component Replaced', `${current.name} replaced${replacement.reason ? ` — ${replacement.reason}` : ''}.`, component.id, current.serialNumber || current.name, component.serialNumber || component.name);
      return component;
    });
  }

  move(id: string, targetAssetId: string, reason: string): Observable<AssetComponent> {
    return mutate(() => {
      const current = this.store.db.components.find((c) => c.id === id);
      const target = this.store.asset(targetAssetId);
      if (!current || !target) return new Error('Component or target asset was not found.');
      if (current.assetId === targetAssetId) return new Error('The component already belongs to this asset.');
      const blocked = blockedError(target, 'Moving components');
      if (blocked) return blocked;
      const source = this.store.asset(current.assetId);
      const next: AssetComponent = { ...current, assetId: targetAssetId };
      this.store.db.components = this.store.db.components.map((c) => (c.id === id ? next : c));
      this.store.log(current.assetId, 'Component Moved', `${current.name} moved to ${target.code}${reason ? ` — ${reason}` : ''}.`, id, source?.code ?? null, target.code);
      this.store.log(targetAssetId, 'Component Added', `${current.name} moved in from ${source?.code ?? 'another asset'}.`, id, source?.code ?? null, target.code);
      return next;
    });
  }

  remove(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const current = this.store.db.components.find((c) => c.id === id);
      if (!current) return new Error('Component was not found.');
      this.store.db.components = this.store.db.components.map((c) => (c.id === id ? { ...c, status: 'Removed' as const, replacementDate: today() } : c));
      this.store.log(current.assetId, 'Component Removed', `${current.name} removed${reason ? ` — ${reason}` : ''}. History is retained.`, id, current.status, 'Removed');
      return undefined;
    });
  }
}

@Injectable()
export class MockInstallationApi extends InstallationApi {
  private readonly store = inject(MockAssetStore);

  list(filter: OperationsFilter = {}): Observable<InstallationListItem[]> {
    return query(() =>
      this.store.db.installations
        .filter((r) => !filter.assetId || r.assetId === filter.assetId)
        .sort((a, b) => b.installationDate.localeCompare(a.installationDate))
        .map((r) => this.store.installationItem(r)),
    );
  }

  schedule(input: InstallationInput): Observable<InstallationRecord> {
    return mutate(() => {
      const asset = this.store.asset(input.assetId);
      if (!asset) return new Error('Asset was not found.');
      if (!PRE_INSTALLATION_STATUSES.includes(asset.status) && asset.installation.date) return new Error(`${asset.code} is already installed.`);
      if (this.store.db.installations.some((r) => r.assetId === asset.id && r.installationStatus !== 'Completed')) return new Error(`${asset.code} already has an open installation.`);
      if (!asset.siteId) return new Error('Assign a service site to the asset before scheduling installation.');
      const record: InstallationRecord = {
        ...input, id: uid('INS'), customerId: asset.customerId, siteId: asset.siteId, installationStatus: 'Scheduled', commissioningDate: null, commissionedBy: '',
        checklist: COMMISSIONING_CHECKLIST.map((item) => ({ item, done: false })), initialMeterReading: null, initialCondition: '', testResults: '',
        commissioningStatus: 'Pending', customerConfirmation: null, createdAt: this.store.now(), createdBy: this.store.currentUser,
      };
      this.store.db.installations = [record, ...this.store.db.installations];
      this.store.log(asset.id, 'Asset Updated', `Installation scheduled for ${input.installationDate}.`, input.reference || record.id);
      return record;
    });
  }

  startInstallation(id: string): Observable<void> {
    return this.step(id, (r, asset) => {
      if (r.installationStatus !== 'Scheduled') return new Error('Only scheduled installations can be started.');
      if (asset.status === 'Planned' || asset.status === 'Ordered') this.setAsset(asset, { status: 'Received' }, 'Asset Received', 'Equipment received on site for installation.');
      this.store.log(asset.id, 'Asset Updated', 'Installation started.', r.reference || r.id);
      return { installationStatus: 'In Progress' };
    });
  }

  completeInstallation(id: string): Observable<void> {
    return this.step(id, (r, asset) => {
      if (r.installationStatus !== 'In Progress') return new Error('Start the installation before completing it.');
      const date = r.installationDate > today() ? today() : r.installationDate;
      this.setAsset(asset, { status: 'Installed', installation: { ...asset.installation, date, installedBy: r.technician, location: r.location || asset.installation.location } }, 'Asset Installed', `Installed at ${this.store.siteName(asset.siteId) ?? 'site'} — ${r.location}.`, asset.status, 'Installed');
      return { installationStatus: 'Completed', installationDate: date };
    });
  }

  startCommissioning(id: string): Observable<void> {
    return this.step(id, (r, asset) => {
      if (r.installationStatus !== 'Completed') return new Error('Complete the installation before commissioning.');
      if (r.commissioningStatus === 'Completed') return new Error('Commissioning is already completed.');
      this.store.log(asset.id, 'Asset Updated', 'Commissioning started.', r.reference || r.id);
      return { commissioningStatus: 'In Progress' };
    });
  }

  completeCommissioning(id: string, input: CommissioningInput): Observable<void> {
    return this.step(id, (r, asset) => {
      if (r.commissioningStatus !== 'In Progress' && r.commissioningStatus !== 'Rework Required') return new Error('Start commissioning first.');
      if (input.outcome === 'Completed' && input.checklist.some((c) => !c.done)) return new Error('All checklist items must be completed before commissioning can be completed.');
      if (input.outcome === 'Completed') {
        this.setAsset(
          asset,
          { status: 'Active', installation: { ...asset.installation, commissioningDate: input.commissioningDate, initialMeterReading: input.initialMeterReading ?? asset.installation.initialMeterReading } },
          'Asset Commissioned',
          `Commissioning completed by ${input.commissionedBy}.`,
          asset.status,
          'Active',
        );
      } else {
        this.store.log(asset.id, 'Asset Updated', `Commissioning ${input.outcome.toLowerCase()}: ${input.testResults || 'see test results'}.`, r.reference || r.id, r.commissioningStatus, input.outcome);
      }
      return { ...input, commissioningStatus: input.outcome, commissioningDate: input.outcome === 'Completed' ? input.commissioningDate : null };
    });
  }

  confirm(id: string, confirmation: CustomerConfirmation): Observable<void> {
    return this.step(id, (r, asset) => {
      if (r.installationStatus !== 'Completed') return new Error('Customer confirmation is captured after installation is completed.');
      this.store.log(asset.id, 'Asset Updated', `Customer confirmation captured from ${confirmation.name}.`, r.reference || r.id);
      return { customerConfirmation: confirmation };
    });
  }

  private step(id: string, work: (r: InstallationRecord, asset: Asset) => Partial<InstallationRecord> | Error): Observable<void> {
    return mutate(() => {
      const record = this.store.db.installations.find((r) => r.id === id);
      const asset = record ? this.store.asset(record.assetId) : undefined;
      if (!record || !asset) return new Error('Installation record was not found.');
      const changes = work(record, asset);
      if (changes instanceof Error) return changes;
      this.store.db.installations = this.store.db.installations.map((r) => (r.id === id ? { ...r, ...changes } : r));
      return undefined;
    });
  }

  private setAsset(asset: Asset, changes: Partial<Asset>, event: 'Asset Received' | 'Asset Installed' | 'Asset Commissioned', comment: string, from: string | null = null, to: string | null = null): void {
    const current = this.store.asset(asset.id) ?? asset;
    this.store.replaceAsset({ ...current, ...changes, updatedAt: this.store.now(), updatedBy: this.store.currentUser });
    this.store.log(asset.id, event, comment, null, from, to);
  }
}

@Injectable()
export class MockTransferApi extends TransferApi {
  private readonly store = inject(MockAssetStore);

  list(filter: OperationsFilter = {}): Observable<TransferListItem[]> {
    return query(() =>
      this.store.db.transfers
        .filter((t) => !filter.assetId || t.assetId === filter.assetId)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
        .map((t) => this.store.transferItem(t)),
    );
  }

  request(input: TransferInput): Observable<AssetTransfer> {
    return mutate(() => {
      const asset = this.store.asset(input.assetId);
      if (!asset) return new Error('Asset was not found.');
      const blocked = blockedError(asset, 'Transfer');
      if (blocked) return blocked;
      if (this.store.db.transfers.some((t) => t.assetId === asset.id && (t.status === 'Requested' || t.status === 'Approved'))) return new Error(`${asset.code} already has a pending transfer.`);
      if (!input.to.siteId) return new Error('Select the new site.');
      const site = this.store.db.reference.sites.find((s) => s.id === input.to.siteId);
      if (!site || site.customerId !== input.to.customerId) return new Error('The new site does not belong to the selected customer.');
      if (input.to.siteId === asset.siteId && input.to.location.trim() === asset.installation.location.trim()) return new Error('The new location must differ from the current location.');
      const transfer: AssetTransfer = {
        ...input, id: uid('TRF'), from: { customerId: asset.customerId, siteId: asset.siteId, location: asset.installation.location },
        approvedBy: null, status: 'Requested', requestedAt: this.store.now(), approvedAt: null, completedAt: null, previousAssetStatus: asset.status,
        reference: input.reference || `TR-${Date.now().toString().slice(-6)}`,
      };
      this.store.db.transfers = [transfer, ...this.store.db.transfers];
      this.store.log(asset.id, 'Transfer Requested', `Transfer to ${site.name} requested (${input.reason}).`, transfer.reference);
      return transfer;
    });
  }

  approve(id: string): Observable<void> {
    return this.step(id, (t, asset) => {
      if (t.status !== 'Requested') return new Error('Only requested transfers can be approved.');
      this.store.replaceAsset({ ...asset, status: 'Transferred', updatedAt: this.store.now(), updatedBy: this.store.currentUser });
      this.store.log(asset.id, 'Status Changed', 'Transfer approved — asset movement in progress.', t.reference, asset.status, 'Transferred');
      return { status: 'Approved', approvedBy: this.store.currentUser, approvedAt: this.store.now(), previousAssetStatus: asset.status };
    });
  }

  reject(id: string, reason: string): Observable<void> {
    return this.step(id, (t, asset) => {
      if (t.status !== 'Requested') return new Error('Only requested transfers can be rejected.');
      this.store.log(asset.id, 'Asset Updated', `Transfer ${t.reference} rejected${reason ? `: ${reason}` : ''}.`, t.reference);
      return { status: 'Rejected', notes: [t.notes, reason ? `Rejected: ${reason}` : 'Rejected'].filter(Boolean).join('\n') };
    });
  }

  complete(id: string): Observable<void> {
    return this.step(id, (t, asset) => {
      if (t.status !== 'Approved') return new Error('Approve the transfer before completing the movement.');
      const site = this.store.db.reference.sites.find((s) => s.id === t.to.siteId);
      const restored = (t.previousAssetStatus as AssetStatus) || 'Active';
      const customerChanged = t.to.customerId !== asset.customerId;
      const owner = customerChanged && asset.ownership.type === 'Customer Owned' ? (this.store.customerName(t.to.customerId) ?? asset.ownership.owner) : asset.ownership.owner;
      this.store.replaceAsset({
        ...asset,
        status: OPERATIONAL_STATUSES.includes(restored) || restored === 'Temporarily Out of Service' ? restored : 'Active',
        customerId: t.to.customerId,
        siteId: t.to.siteId,
        installation: { ...asset.installation, location: t.to.location, room: t.to.location },
        service: { ...asset.service, serviceTerritoryId: site?.serviceTerritoryId ?? asset.service.serviceTerritoryId },
        ownership: { ...asset.ownership, owner },
        updatedAt: this.store.now(),
        updatedBy: this.store.currentUser,
      });
      this.store.log(asset.id, 'Location Changed', `Moved to ${site?.name ?? 'new site'} — ${t.to.location}.`, t.reference, `${this.store.siteName(t.from.siteId) ?? '—'} — ${t.from.location}`, `${site?.name ?? '—'} — ${t.to.location}`);
      this.store.log(asset.id, 'Asset Transferred', `Transfer ${t.reference} completed.`, t.reference, 'Transferred', restored);
      if (customerChanged) this.store.log(asset.id, 'Ownership Changed', 'Customer changed through transfer.', t.reference, this.store.customerName(asset.customerId), this.store.customerName(t.to.customerId));
      return { status: 'Completed', completedAt: this.store.now() };
    });
  }

  cancel(id: string): Observable<void> {
    return this.step(id, (t, asset) => {
      if (t.status !== 'Requested' && t.status !== 'Approved') return new Error('Only pending transfers can be cancelled.');
      if (t.status === 'Approved') {
        this.store.replaceAsset({ ...asset, status: (t.previousAssetStatus as AssetStatus) || 'Active' });
        this.store.log(asset.id, 'Status Changed', 'Transfer cancelled — asset status restored.', t.reference, 'Transferred', t.previousAssetStatus);
      } else {
        this.store.log(asset.id, 'Asset Updated', `Transfer ${t.reference} cancelled.`, t.reference);
      }
      return { status: 'Cancelled' };
    });
  }

  private step(id: string, work: (t: AssetTransfer, asset: Asset) => Partial<AssetTransfer> | Error): Observable<void> {
    return mutate(() => {
      const transfer = this.store.db.transfers.find((t) => t.id === id);
      const asset = transfer ? this.store.asset(transfer.assetId) : undefined;
      if (!transfer || !asset) return new Error('Transfer was not found.');
      const changes = work(transfer, asset);
      if (changes instanceof Error) return changes;
      this.store.db.transfers = this.store.db.transfers.map((t) => (t.id === id ? { ...t, ...changes } : t));
      return undefined;
    });
  }
}

@Injectable()
export class MockWarrantyApi extends WarrantyApi {
  private readonly store = inject(MockAssetStore);

  list(filter: WarrantyFilter = {}): Observable<WarrantyListItem[]> {
    return query(() =>
      this.store.db.warranties
        .filter((w) => !filter.assetId || w.assetId === filter.assetId)
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .map((w) => this.store.warrantyItem(w)),
    );
  }

  create(input: WarrantyInput): Observable<AssetWarranty> {
    return mutate(() => {
      const error = this.validate(input);
      if (error) return error;
      const isPrimary = !this.store.db.warranties.some((w) => w.assetId === input.assetId && w.isPrimary) && !input.componentId;
      const warranty: AssetWarranty = { ...input, id: uid('WAR'), isPrimary, claims: [], createdAt: this.store.now(), createdBy: this.store.currentUser };
      this.store.db.warranties = [...this.store.db.warranties, warranty];
      this.store.log(input.assetId, input.startDate <= today() ? 'Warranty Started' : 'Warranty Updated', `${input.type} from ${input.provider} registered.`, input.reference || null, null, `${input.startDate} – ${input.endDate}`);
      return warranty;
    });
  }

  update(id: string, input: WarrantyInput): Observable<AssetWarranty> {
    return mutate(() => {
      const current = this.store.db.warranties.find((w) => w.id === id);
      if (!current) return new Error('Warranty was not found.');
      const error = this.validate(input);
      if (error) return error;
      const next: AssetWarranty = { ...current, ...input };
      this.store.db.warranties = this.store.db.warranties.map((w) => (w.id === id ? next : w));
      this.store.log(current.assetId, 'Warranty Updated', `${next.type} updated.`, next.reference || null, `${current.startDate} – ${current.endDate}`, `${next.startDate} – ${next.endDate}`);
      return next;
    });
  }

  cancel(id: string, reason: string): Observable<void> {
    return mutate(() => {
      const current = this.store.db.warranties.find((w) => w.id === id);
      if (!current) return new Error('Warranty was not found.');
      this.store.db.warranties = this.store.db.warranties.map((w) => (w.id === id ? { ...w, cancelled: true, notes: [w.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n') } : w));
      this.store.log(current.assetId, 'Warranty Updated', `${current.type} cancelled${reason ? ` — ${reason}` : ''}.`, current.reference || null, this.store.warrantyStatus(current), 'Cancelled');
      return undefined;
    });
  }

  addClaim(id: string, claim: ClaimInput): Observable<AssetWarranty> {
    return mutate(() => {
      const current = this.store.db.warranties.find((w) => w.id === id);
      if (!current) return new Error('Warranty was not found.');
      if (claim.date < current.startDate || claim.date > current.endDate || current.cancelled) return new Error('The claim date must fall within an active warranty period.');
      const next: AssetWarranty = { ...current, claims: [...current.claims, { ...claim, id: uid('CLM') }] };
      this.store.db.warranties = this.store.db.warranties.map((w) => (w.id === id ? next : w));
      this.store.log(current.assetId, 'Warranty Updated', `Warranty claim ${claim.reference} submitted: ${claim.description}`, claim.reference);
      return next;
    });
  }

  private validate(input: WarrantyInput): Error | null {
    if (!this.store.asset(input.assetId)) return new Error('Asset was not found.');
    if (input.endDate < input.startDate) return new Error('The warranty end date must be on or after the start date.');
    if (input.componentId && !this.store.db.components.some((c) => c.id === input.componentId && c.assetId === input.assetId)) return new Error('The component does not belong to this asset.');
    return null;
  }
}

const KIND_FLAG: Record<ServiceKind, CoverageFlag> = {
  Preventive: 'preventive',
  Breakdown: 'breakdown',
  Emergency: 'emergency',
  Inspection: 'inspection',
  Remote: 'remote',
};

@Injectable()
export class MockEntitlementApi extends EntitlementApi {
  private readonly store = inject(MockAssetStore);

  list(filter: CoverageFilter = {}): Observable<CoverageListItem[]> {
    return query(() =>
      this.store.db.coverages
        .filter((c) => !filter.assetId || c.assetId === filter.assetId)
        .map((c) => this.store.coverageItem(c))
        .sort((a, b) => b.endDate.localeCompare(a.endDate)),
    );
  }

  evaluate(assetId: string, serviceKind: ServiceKind, date = today()): Observable<EntitlementCheck> {
    return query(() => {
      const asset = this.store.asset(assetId);
      const reasons: string[] = [];
      if (!asset) return { assetId, serviceKind, date, covered: false, coverage: null, warrantyActive: false, warrantyReference: null, laborIncluded: false, partsIncluded: false, visitsRemaining: null, reasons: ['Asset not found.'] };
      if (TRANSACTION_BLOCKED_STATUSES.includes(asset.status)) reasons.push(`Asset is ${asset.status.toLowerCase()} — new service transactions are blocked.`);
      const coverages = this.store.db.coverages.filter((c) => c.assetId === assetId).map((c) => this.store.coverageItem(c));
      const inPeriod = coverages.filter((c) => (c.status === 'Active' || c.status === 'Expiring') && date >= c.startDate && date <= c.endDate);
      const expired = coverages.filter((c) => !inPeriod.includes(c));
      if (!coverages.length) reasons.push('No contract or AMC covers this asset.');
      else if (!inPeriod.length) reasons.push(`Linked agreements are not active on ${date} (${expired.map((c) => `${c.agreementNumber} ${c.status.toLowerCase()}`).join(', ')}). Expired agreements do not provide entitlement.`);
      const flag = KIND_FLAG[serviceKind];
      const eligible = inPeriod.filter((c) => c.flags[flag]);
      if (inPeriod.length && !eligible.length) reasons.push(`${serviceKind} service is excluded from the active coverage.`);
      const withVisits = eligible.find((c) => c.visitsAllowed === null || serviceKind !== 'Preventive' || c.visitsUsed < c.visitsAllowed);
      if (eligible.length && !withVisits) reasons.push('All entitled preventive visits have been used.');
      const warranty = this.store.db.warranties.find((w) => w.assetId === assetId && !w.componentId && !w.cancelled && date >= w.startDate && date <= w.endDate);
      const warrantyCovers = !!warranty && (serviceKind === 'Breakdown' || serviceKind === 'Emergency');
      if (warrantyCovers) reasons.push(`Under ${warranty!.type.toLowerCase()} (${warranty!.reference}) — identify the service as warranty service.`);
      const coverage = withVisits ?? null;
      const blocked = TRANSACTION_BLOCKED_STATUSES.includes(asset.status);
      return {
        assetId,
        serviceKind,
        date,
        covered: !blocked && (!!coverage || warrantyCovers),
        coverage,
        warrantyActive: !!warranty,
        warrantyReference: warranty?.reference ?? null,
        laborIncluded: !!coverage?.flags.labor || warrantyCovers,
        partsIncluded: !!coverage?.flags.parts || warrantyCovers,
        visitsRemaining: coverage && coverage.visitsAllowed !== null ? coverage.visitsAllowed - coverage.visitsUsed : null,
        reasons: coverage ? [`Entitled under ${coverage.agreementNumber} — ${coverage.entitlement}.`, ...reasons] : reasons,
      };
    });
  }
}

@Injectable()
export class MockAssetDocumentApi extends AssetDocumentApi {
  private readonly store = inject(MockAssetStore);

  list(filter: DocumentFilter = {}): Observable<AssetDocumentListItem[]> {
    return query(() =>
      this.store.db.documents
        .filter((d) => !filter.assetId || d.assetId === filter.assetId)
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        .map((d) => this.store.documentItem(d)),
    );
  }

  upload(input: DocumentUpload): Observable<AssetDocument> {
    return mutate(() => {
      if (!this.store.asset(input.assetId)) return new Error('Asset was not found.');
      if (input.expiryDate && input.issueDate && input.expiryDate < input.issueDate) return new Error('Expiry date must be on or after the issue date.');
      const { file, ...fields } = input;
      const uploadedAt = this.store.now();
      const doc: AssetDocument = {
        ...fields, id: uid('ADOC'), version: 1, versions: [{ version: 1, fileName: file.name, fileSize: file.size, uploadedBy: this.store.currentUser, uploadedAt, note: 'Initial upload' }],
        fileName: file.name, fileSize: file.size, mimeType: file.type || 'application/octet-stream', archived: false, uploadedBy: this.store.currentUser, uploadedAt,
      };
      this.store.db.documents = [doc, ...this.store.db.documents];
      this.store.log(input.assetId, 'Document Added', `${doc.type}: ${doc.name} uploaded.`, doc.documentNumber || doc.id);
      return doc;
    });
  }

  replace(id: string, input: DocumentReplace): Observable<AssetDocument> {
    return mutate(() => {
      const current = this.store.db.documents.find((d) => d.id === id);
      if (!current) return new Error('Document was not found.');
      if (current.archived) return new Error('Archived documents cannot be replaced.');
      const version = current.version + 1;
      const uploadedAt = this.store.now();
      const next: AssetDocument = {
        ...current, version, fileName: input.file.name, fileSize: input.file.size, mimeType: input.file.type || current.mimeType,
        issueDate: input.issueDate ?? current.issueDate, expiryDate: input.expiryDate ?? current.expiryDate, uploadedAt, uploadedBy: this.store.currentUser,
        versions: [...current.versions, { version, fileName: input.file.name, fileSize: input.file.size, uploadedBy: this.store.currentUser, uploadedAt, note: input.note || `Version ${version}` }],
      };
      this.store.db.documents = this.store.db.documents.map((d) => (d.id === id ? next : d));
      this.store.log(current.assetId, 'Document Added', `${current.name} replaced with version ${version}.`, current.documentNumber || id, `v${current.version}`, `v${version}`);
      return next;
    });
  }

  setAccess(id: string, access: AssetDocument['access']): Observable<void> {
    return mutate(() => {
      const current = this.store.db.documents.find((d) => d.id === id);
      if (!current) return new Error('Document was not found.');
      this.store.db.documents = this.store.db.documents.map((d) => (d.id === id ? { ...d, access } : d));
      this.store.log(current.assetId, 'Asset Updated', `Access to ${current.name} changed.`, current.documentNumber || id, current.access, access);
      return undefined;
    });
  }

  archive(id: string): Observable<void> {
    return mutate(() => {
      const current = this.store.db.documents.find((d) => d.id === id);
      if (!current) return new Error('Document was not found.');
      this.store.db.documents = this.store.db.documents.map((d) => (d.id === id ? { ...d, archived: true } : d));
      this.store.log(current.assetId, 'Asset Updated', `${current.name} archived.`, current.documentNumber || id);
      return undefined;
    });
  }
}

@Injectable()
export class MockServiceHistoryApi extends ServiceHistoryApi {
  private readonly store = inject(MockAssetStore);

  list(filter: ServiceHistoryFilter = {}): Observable<ServiceRecordListItem[]> {
    return query(() =>
      this.store.db.serviceRecords
        .filter((r) => !filter.assetId || r.assetId === filter.assetId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((r) => this.store.serviceItem(r)),
    );
  }

  parts(filter: ServiceHistoryFilter = {}): Observable<PartUsageRow[]> {
    return query(() =>
      this.store.db.serviceRecords
        .filter((r) => !filter.assetId || r.assetId === filter.assetId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .flatMap((r) =>
          r.partsUsed.map((p, i) => ({
            ...p, id: `${r.id}-${i}`, serviceRecordId: r.id, date: r.date, serviceType: r.serviceType, workOrder: r.workOrder,
            technician: r.technician, totalCost: p.quantity * p.unitCost, currency: r.currency,
          })),
        ),
    );
  }
}

@Injectable()
export class MockLifecycleApi extends LifecycleApi {
  private readonly store = inject(MockAssetStore);

  list(filter: LifecycleFilter = {}): Observable<LifecycleEventListItem[]> {
    return query(() => this.store.db.lifecycle.filter((e) => !filter.assetId || e.assetId === filter.assetId).map((e) => this.store.lifecycleItem(e)));
  }
}

@Injectable()
export class MockAssetReferenceApi extends AssetReferenceApi {
  private readonly store = inject(MockAssetStore);

  get(): Observable<AssetReferenceData> {
    return defer(() => respond(this.store.db.reference, 150));
  }
}
