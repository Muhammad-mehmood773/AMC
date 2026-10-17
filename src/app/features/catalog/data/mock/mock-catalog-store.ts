import { Injectable } from '@angular/core';
import { daysBetween } from '@shared/utils/format';
import type { CatalogService, CategoryListItem, ServiceCategory, ServiceListItem } from '../../models/catalog.model';
import type { Entitlement, EntitlementListItem, EntitlementStatus, UsageRecord, UsageRecordListItem, UsageSummary } from '../../models/entitlement.model';
import type { HistoryAction, HistoryEntity } from '../../models/history.model';
import type { PriceRule, PriceRuleListItem, PriceRuleState } from '../../models/pricing.model';
import { CATALOG_RULES } from '../catalog.config';
import { type CatalogDatabase, buildCatalogSeed } from './catalog-seed';

const today = () => new Date().toISOString().slice(0, 10);

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

const RESET_MONTHS: Record<string, number> = { Monthly: 1, Quarterly: 3, Yearly: 12 };

/** In-memory database for the catalog mock adapters; derives read models. */
@Injectable()
export class MockCatalogStore {
  readonly db: CatalogDatabase = buildCatalogSeed();
  private seq = this.db.history.length + 1;

  get currentUser(): string {
    return this.db.reference.currentUser;
  }

  now(): string {
    return new Date().toISOString();
  }

  audit() {
    return { createdAt: this.now(), createdBy: this.currentUser, updatedAt: null, updatedBy: null };
  }

  log(action: HistoryAction, entity: HistoryEntity, entityId: string, entityLabel: string, comments: string, previousValue: string | null = null, newValue: string | null = null, reference: string | null = null): void {
    this.db.history.unshift({ id: `HIS-N${String(this.seq++).padStart(6, '0')}`, timestamp: this.now(), user: this.currentUser, action, entity, entityId, entityLabel, previousValue, newValue, reference, comments });
  }

  service(id: string): CatalogService | undefined {
    return this.db.services.find((s) => s.id === id);
  }

  category(id: string | null | undefined): ServiceCategory | undefined {
    return id ? this.db.categories.find((c) => c.id === id) : undefined;
  }

  entitlement(id: string): Entitlement | undefined {
    return this.db.entitlements.find((e) => e.id === id);
  }

  customerName(id: string | null | undefined): string {
    return (id && this.db.reference.customers.find((c) => c.id === id)?.name) || '';
  }

  // ----- Read models ---------------------------------------------------------

  categoryItem(c: ServiceCategory): CategoryListItem {
    const services = this.db.services.filter((s) => s.categoryId === c.id || s.subcategoryId === c.id);
    return {
      ...c,
      parentName: this.category(c.parentId)?.name ?? null,
      childCount: this.db.categories.filter((x) => x.parentId === c.id).length,
      serviceCount: services.length,
      activeServiceCount: services.filter((s) => s.status === 'Active').length,
    };
  }

  serviceItem(s: CatalogService): ServiceListItem {
    const entitlements = this.db.entitlements.filter((e) => e.coverage.serviceIds.includes(s.id));
    return {
      ...s,
      categoryName: this.category(s.categoryId)?.name ?? 'Unknown category',
      subcategoryName: this.category(s.subcategoryId)?.name ?? null,
      slaName: this.db.reference.slas.find((x) => x.id === s.sla.defaultSlaId)?.name ?? null,
      entitlementCount: entitlements.length,
      activeEntitlementCount: entitlements.filter((e) => this.effectiveStatus(e) === 'Active').length,
      usageCount: this.db.usage.filter((u) => u.serviceId === s.id).length,
      priceRuleCount: this.db.priceRules.filter((r) => r.serviceId === s.id).length,
    };
  }

  priceState(r: PriceRule, on = today()): PriceRuleState {
    if (on < r.effectiveFrom) return 'Scheduled';
    if (r.effectiveTo && on > r.effectiveTo) return 'Expired';
    return 'Active';
  }

  /** Higher = more specific scope (customer > contract/AMC > category > type > region > price list). */
  specificity(r: PriceRule): number {
    return (r.customerId ? 32 : 0) + (r.agreementId ? 16 : 0) + (r.customerCategory ? 8 : 0) + (r.customerType ? 4 : 0) + (r.serviceRegion ? 2 : 0) + (r.priceListId && r.priceListId !== 'PL-STD' ? 1 : 0);
  }

  priceItem(r: PriceRule): PriceRuleListItem {
    const s = this.service(r.serviceId);
    const ref = this.db.reference;
    const agreement = ref.agreements.find((a) => a.id === r.agreementId);
    const scope = [
      r.customerId ? `Customer: ${this.customerName(r.customerId)}` : null,
      agreement ? `${agreement.kind}: ${agreement.number}` : null,
      r.customerCategory ? `Category: ${r.customerCategory}` : null,
      r.customerType ? `Type: ${r.customerType}` : null,
      r.serviceRegion ? `Region: ${r.serviceRegion}` : null,
    ].filter(Boolean);
    return {
      ...r,
      state: this.priceState(r),
      serviceCode: s?.code ?? '',
      serviceName: s?.name ?? '',
      serviceType: s?.type ?? '',
      priceListName: ref.priceLists.find((p) => p.id === r.priceListId)?.name ?? null,
      customerName: r.customerId ? this.customerName(r.customerId) : null,
      agreementNumber: agreement?.number ?? null,
      taxProfileName: ref.taxProfiles.find((t) => t.id === r.taxProfileId)?.name ?? null,
      scope: scope.length ? scope.join(' · ') : 'All customers',
      specificity: this.specificity(r),
    };
  }

  effectiveStatus(e: Entitlement): EntitlementStatus {
    return e.status === 'Active' && e.validity.endDate < today() ? 'Expired' : e.status;
  }

  usageSummary(e: Entitlement): UsageSummary {
    const u = e.usage;
    const unit = !u.limitApplicable ? 'None' : u.maxVisits !== null ? 'Visits' : u.maxHours !== null ? 'Hours' : u.maxQuantity !== null ? 'Quantity' : 'None';
    const allowed = unit === 'Visits' ? u.maxVisits : unit === 'Hours' ? u.maxHours : unit === 'Quantity' ? u.maxQuantity : null;
    const consumed = unit === 'Hours' ? u.usedHours : unit === 'Quantity' ? u.usedQuantity : u.usedVisits;
    const remaining = allowed === null ? null : Math.max(0, allowed - consumed);
    const percentage = allowed ? Math.round((consumed / allowed) * 100) : null;
    const state = allowed === null ? 'Unlimited' : consumed > allowed ? 'Overused' : remaining === 0 ? 'Exhausted' : (remaining! / allowed) * 100 <= CATALOG_RULES.nearLimitPercent ? 'Near Limit' : 'Within Limit';
    const months = RESET_MONTHS[u.resetFrequency];
    let resetDate: string | null = u.resetFrequency === 'Contract Period' ? e.validity.endDate : null;
    if (months) {
      resetDate = addMonths(u.lastResetDate, months);
      while (resetDate <= today()) resetDate = addMonths(resetDate, months);
    }
    return { unit, allowed, consumed, remaining, percentage, state, periodStart: u.lastResetDate, resetDate };
  }

  entitlementItem(e: Entitlement): EntitlementListItem {
    const ref = this.db.reference;
    const agreement = ref.agreements.find((a) => a.id === (e.contractId ?? e.amcId));
    const customer = ref.customers.find((c) => c.id === e.customerId);
    const status = this.effectiveStatus(e);
    const daysRemaining = daysBetween(new Date(), e.validity.endDate);
    return {
      ...e,
      effectiveStatus: status,
      customerName: customer?.name ?? 'Unknown customer',
      customerStatus: customer?.status ?? '',
      agreementNumber: agreement?.number ?? null,
      agreementKind: agreement?.kind ?? null,
      siteNames: e.siteIds.map((id) => ref.sites.find((s) => s.id === id)?.name ?? id),
      assetLabels: e.assetIds.map((id) => {
        const a = ref.assets.find((x) => x.id === id);
        return a ? `${a.code} · ${a.name}` : id;
      }),
      serviceNames: e.coverage.serviceIds.map((id) => this.service(id)?.name ?? id),
      slaName: ref.slas.find((s) => s.id === e.sla.slaId)?.name ?? null,
      daysRemaining,
      expiring: status === 'Active' && daysRemaining >= 0 && daysRemaining <= CATALOG_RULES.expiringWindowDays,
      usageSummary: this.usageSummary(e),
    };
  }

  usageItem(u: UsageRecord): UsageRecordListItem {
    const ref = this.db.reference;
    const e = this.entitlement(u.entitlementId);
    const s = this.service(u.serviceId);
    const asset = ref.assets.find((a) => a.id === u.assetId);
    return {
      ...u,
      entitlementNumber: e?.number ?? u.entitlementId,
      customerName: this.customerName(e?.customerId),
      serviceName: s?.name ?? u.serviceId,
      serviceType: s?.type ?? '',
      siteName: ref.sites.find((x) => x.id === u.siteId)?.name ?? null,
      assetLabel: asset ? `${asset.code} · ${asset.name}` : null,
    };
  }
}
