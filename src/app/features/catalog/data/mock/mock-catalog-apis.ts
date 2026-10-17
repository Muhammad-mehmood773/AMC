import { Injectable, inject } from '@angular/core';
import { type Observable, defer } from 'rxjs';
import { fail, pad, respond, uid } from '../../../customers/data/mock/mock-utils';
import type { CatalogService, CategoryInput, CategoryListItem, ServiceCategory, ServiceListItem, ServiceStatus, ServiceUpsert } from '../../models/catalog.model';
import type { CatalogDashboard, CatalogDashboardFilters, DashboardRow } from '../../models/dashboard.model';
import type {
  Entitlement,
  EntitlementFilter,
  EntitlementListItem,
  EntitlementUpsert,
  UsageFilter,
  UsageInput,
  UsageRecordListItem,
  ValidationCheck,
  ValidationRequest,
  ValidationResult,
} from '../../models/entitlement.model';
import type { HistoryEvent, HistoryFilter } from '../../models/history.model';
import type { PriceContext, PriceQuote, PriceRule, PriceRuleFilter, PriceRuleInput, PriceRuleListItem } from '../../models/pricing.model';
import type { CatalogReferenceData } from '../../models/reference.model';
import { CatalogHistoryApi, CatalogReferenceApi, CategoryApi, EntitlementApi, PricingApi, ServiceCatalogApi } from '../catalog.api';
import { CATALOG_RULES, COVERAGE_SERVICE_TYPES } from '../catalog.config';
import { MockCatalogStore } from './mock-catalog-store';

const today = () => new Date().toISOString().slice(0, 10);
const norm = (v: string) => v.trim().toLowerCase();

function mutate<T>(work: () => T | Error): Observable<T> {
  return defer(() => {
    const result = work();
    return result instanceof Error ? fail(result.message) : respond(result, 360);
  });
}

function query<T>(work: () => T): Observable<T> {
  return defer(() => respond(work()));
}

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class MockServiceCatalogApi extends ServiceCatalogApi {
  private readonly store = inject(MockCatalogStore);

  list(): Observable<ServiceListItem[]> {
    return query(() => [...this.store.db.services].sort((a, b) => a.code.localeCompare(b.code)).map((s) => this.store.serviceItem(s)));
  }

  get(id: string): Observable<ServiceListItem> {
    return defer(() => {
      const s = this.store.service(id);
      return s ? respond(this.store.serviceItem(s)) : fail(`Service ${id} was not found.`);
    });
  }

  create(input: ServiceUpsert): Observable<CatalogService> {
    return mutate(() => {
      if (!this.codeFree(input.code)) return new Error(`Service code ${input.code} is already in use.`);
      const error = this.validate(input);
      if (error) return error;
      const service: CatalogService = { ...input, code: input.code.trim().toUpperCase(), id: `SVC-${input.code.trim().toUpperCase()}`, ...this.store.audit() };
      this.store.db.services = [...this.store.db.services, service];
      this.store.log('Service Created', 'Service', service.id, service.name, `Service ${service.code} created.`, null, null, service.code);
      return service;
    });
  }

  update(id: string, input: ServiceUpsert): Observable<CatalogService> {
    return mutate(() => {
      const current = this.store.service(id);
      if (!current) return new Error('Service was not found.');
      const error = this.validate(input);
      if (error) return error;
      const next: CatalogService = { ...current, ...input, id, code: current.code, updatedAt: this.store.now(), updatedBy: this.store.currentUser };
      this.store.db.services = this.store.db.services.map((s) => (s.id === id ? next : s));
      const label = next.name;
      if (current.commercial.standardPrice !== next.commercial.standardPrice) this.store.log('Price Changed', 'Service', id, label, 'Standard price updated.', `${current.commercial.currency} ${current.commercial.standardPrice ?? 0}`, `${next.commercial.currency} ${next.commercial.standardPrice ?? 0}`, next.code);
      if (JSON.stringify(current.sla) !== JSON.stringify(next.sla)) this.store.log('SLA Changed', 'Service', id, label, 'Service SLA updated.', this.slaLabel(current), this.slaLabel(next), next.code);
      if (JSON.stringify([current.resources, current.operational, current.maintenance]) !== JSON.stringify([next.resources, next.operational, next.maintenance])) this.store.log('Service Requirement Changed', 'Service', id, label, 'Operational, maintenance or resource requirements updated.', null, null, next.code);
      if (current.status !== next.status) this.store.log(next.status === 'Active' ? 'Service Activated' : 'Service Deactivated', 'Service', id, label, 'Status changed on the service record.', current.status, next.status, next.code);
      this.store.log('Service Updated', 'Service', id, label, 'Service definition updated.', null, null, next.code);
      return next;
    });
  }

  duplicate(id: string): Observable<CatalogService> {
    return mutate(() => {
      const current = this.store.service(id);
      if (!current) return new Error('Service was not found.');
      let n = 1;
      while (!this.codeFree(`${current.code}-C${n}`)) n++;
      const code = `${current.code}-C${n}`;
      const copy: CatalogService = { ...current, id: `SVC-${code}`, code, name: `${current.name} (Copy)`, status: 'Draft', attachments: [], ...this.store.audit() };
      this.store.db.services = [...this.store.db.services, copy];
      this.store.log('Service Created', 'Service', copy.id, copy.name, `Duplicated from ${current.code}.`, null, null, code);
      return copy;
    });
  }

  setStatus(ids: readonly string[], status: ServiceStatus): Observable<void> {
    return mutate(() => {
      for (const id of ids) {
        const s = this.store.service(id);
        if (!s) continue;
        if (status === 'Active' && this.store.category(s.categoryId)?.status !== 'Active') return new Error(`${s.code} cannot be activated — its category is inactive.`);
      }
      for (const id of ids) {
        const s = this.store.service(id);
        if (!s || s.status === status) continue;
        this.store.db.services = this.store.db.services.map((x) => (x.id === id ? { ...x, status, updatedAt: this.store.now(), updatedBy: this.store.currentUser } : x));
        this.store.log(status === 'Active' ? 'Service Activated' : 'Service Deactivated', 'Service', id, s.name, status === 'Active' ? 'Service activated.' : 'Service deactivated — no longer selectable for new transactions; history unchanged.', s.status, status, s.code);
      }
      return undefined;
    });
  }

  nextCode(): Observable<string> {
    return query(() => {
      let n = this.store.db.services.length + 1;
      while (!this.codeFree(`SVC-${pad(n, 4)}`)) n++;
      return `SVC-${pad(n, 4)}`;
    });
  }

  isCodeAvailable(code: string, excludeId?: string): Observable<boolean> {
    return defer(() => respond(this.codeFree(code, excludeId), 200));
  }

  dashboard(f: CatalogDashboardFilters): Observable<CatalogDashboard> {
    return query(() => {
      const { db } = this.store;
      const has = (list: readonly string[], value: string | null | undefined) => !list.length || list.includes(value ?? '');
      const inRange = (iso: string) => (!f.from || iso.slice(0, 10) >= f.from) && (!f.to || iso.slice(0, 10) <= f.to);
      const services = db.services
        .map((s) => this.store.serviceItem(s))
        .filter((s) => has(f.categories, s.categoryId) && has(f.types, s.type) && has(f.statuses, s.status) && has(f.billing, s.commercial.billable ? 'Billable' : 'Non-Billable'));
      const serviceIds = new Set(services.map((s) => s.id));
      const entitlements = db.entitlements
        .map((e) => this.store.entitlementItem(e))
        .filter((e) => has(f.customers, e.customerId) && has(f.contracts, e.contractId) && has(f.amcs, e.amcId) && (!f.from && !f.to ? true : inRange(e.createdAt)));
      const entIds = new Set(entitlements.map((e) => e.id));
      const usage = db.usage.filter((u) => serviceIds.has(u.serviceId) && entIds.has(u.entitlementId) && inRange(u.date));
      const active = entitlements.filter((e) => e.effectiveStatus === 'Active');
      const near = active.filter((e) => e.usageSummary.state === 'Near Limit' || e.usageSummary.state === 'Exhausted' || e.usageSummary.state === 'Overused');
      const countBy = <T>(items: readonly T[], key: (item: T) => string) => [...items.reduce((m, i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1), new Map<string, number>())];
      const entRow = (e: EntitlementListItem, date: string | null, value: number): DashboardRow => ({
        id: e.id, code: e.number, title: e.customerName, subtitle: `${e.agreementNumber ?? 'No agreement'} · ${e.coverage.coverageType}`, status: e.effectiveStatus, date, value, percentage: e.usageSummary.percentage,
      });
      return {
        kpis: {
          totalServices: services.length,
          activeServices: services.filter((s) => s.status === 'Active').length,
          inactiveServices: services.filter((s) => s.status !== 'Active').length,
          categories: db.categories.filter((c) => c.status === 'Active' && (!f.categories.length || f.categories.includes(c.id))).length,
          contractEligible: services.filter((s) => s.commercial.contractEligible).length,
          amcEligible: services.filter((s) => s.commercial.amcEligible).length,
          billable: services.filter((s) => s.commercial.billable).length,
          nonBillable: services.filter((s) => !s.commercial.billable).length,
          activeEntitlements: active.length,
          expiringEntitlements: active.filter((e) => e.expiring).length,
          withUsageLimits: active.filter((e) => e.usage.limitApplicable).length,
          nearLimit: near.length,
        },
        recentServices: [...services].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((s) => ({ id: s.id, code: s.code, title: s.name, subtitle: `${s.categoryName} · ${s.type}`, status: s.status, date: s.createdAt, value: 0, percentage: null })),
        mostUsedServices: countBy(usage, (u) => u.serviceId).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, count]) => {
          const s = this.store.serviceItem(this.store.service(id)!);
          return { id, code: s.code, title: s.name, subtitle: s.categoryName, status: s.status, date: null, value: count, percentage: null };
        }),
        expiringEntitlements: active.filter((e) => e.expiring).sort((a, b) => a.daysRemaining - b.daysRemaining).slice(0, 6).map((e) => entRow(e, e.validity.endDate, e.daysRemaining)),
        nearLimit: [...near].sort((a, b) => (b.usageSummary.percentage ?? 0) - (a.usageSummary.percentage ?? 0)).slice(0, 6).map((e) => entRow(e, null, e.usageSummary.remaining ?? 0)),
        recentEntitlements: [...entitlements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((e) => entRow(e, e.createdAt, 0)),
        requestsByType: countBy(usage, (u) => this.store.service(u.serviceId)?.type ?? 'Other').map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
        usageByCustomer: countBy(usage, (u) => this.store.entitlement(u.entitlementId)?.customerId ?? '').sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, value]) => ({ id, label: this.store.customerName(id), value })),
        servicesByCategory: countBy(services, (s) => s.categoryName).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      };
    });
  }

  private codeFree(code: string, excludeId?: string): boolean {
    return !this.store.db.services.some((s) => s.id !== excludeId && norm(s.code) === norm(code));
  }

  private validate(input: ServiceUpsert): Error | null {
    const category = this.store.category(input.categoryId);
    if (!category) return new Error('Select a valid service category.');
    if (input.status === 'Active' && category.status !== 'Active') return new Error('Active services must belong to an active category.');
    if (input.subcategoryId && this.store.category(input.subcategoryId)?.parentId !== input.categoryId) return new Error('The subcategory does not belong to the selected category.');
    const { minDuration, maxDuration, standardDuration } = input.operational;
    if (minDuration !== null && maxDuration !== null && minDuration > maxDuration) return new Error('Minimum duration cannot exceed the maximum duration.');
    if (standardDuration !== null && ((minDuration !== null && standardDuration < minDuration) || (maxDuration !== null && standardDuration > maxDuration))) return new Error('Standard duration must be between the minimum and maximum duration.');
    return null;
  }

  private slaLabel(s: CatalogService): string {
    return s.sla.applicable ? `${this.store.db.reference.slas.find((x) => x.id === s.sla.defaultSlaId)?.name ?? 'Custom'} · ${s.sla.responseHours ?? '—'}h/${s.sla.resolutionHours ?? '—'}h` : 'Not applicable';
  }
}

@Injectable()
export class MockCategoryApi extends CategoryApi {
  private readonly store = inject(MockCatalogStore);

  list(): Observable<CategoryListItem[]> {
    return query(() => [...this.store.db.categories].sort((a, b) => a.displayOrder - b.displayOrder).map((c) => this.store.categoryItem(c)));
  }

  create(input: CategoryInput): Observable<ServiceCategory> {
    return mutate(() => {
      const error = this.validate(input);
      if (error) return error;
      const category: ServiceCategory = { ...input, code: input.code.trim().toUpperCase(), id: uid('CAT'), ...this.store.audit() };
      this.store.db.categories = [...this.store.db.categories, category];
      this.store.log('Category Created', 'Category', category.id, category.name, `Category ${category.code} created.`, null, null, category.code);
      return category;
    });
  }

  update(id: string, input: CategoryInput): Observable<ServiceCategory> {
    return mutate(() => {
      const current = this.store.category(id);
      if (!current) return new Error('Category was not found.');
      const error = this.validate(input, id);
      if (error) return error;
      if (current.status === 'Active' && input.status === 'Inactive') {
        const blocked = this.blockedDeactivation(id);
        if (blocked) return blocked;
      }
      const next: ServiceCategory = { ...current, ...input, code: current.code, updatedAt: this.store.now(), updatedBy: this.store.currentUser };
      this.store.db.categories = this.store.db.categories.map((c) => (c.id === id ? next : c));
      this.store.log('Category Updated', 'Category', id, next.name, 'Category updated.', current.name !== next.name ? current.name : null, current.name !== next.name ? next.name : null, next.code);
      return next;
    });
  }

  setStatus(id: string, status: ServiceCategory['status']): Observable<void> {
    return mutate(() => {
      const current = this.store.category(id);
      if (!current) return new Error('Category was not found.');
      if (status === 'Inactive') {
        const blocked = this.blockedDeactivation(id);
        if (blocked) return blocked;
      } else if (current.parentId && this.store.category(current.parentId)?.status !== 'Active') {
        return new Error('Activate the parent category first.');
      }
      this.store.db.categories = this.store.db.categories.map((c) => (c.id === id ? { ...c, status } : c));
      this.store.log(status === 'Active' ? 'Category Activated' : 'Category Deactivated', 'Category', id, current.name, `Category ${status === 'Active' ? 'activated' : 'deactivated'}.`, current.status, status, current.code);
      return undefined;
    });
  }

  isCodeAvailable(code: string, excludeId?: string): Observable<boolean> {
    return defer(() => respond(!this.store.db.categories.some((c) => c.id !== excludeId && norm(c.code) === norm(code)), 200));
  }

  private validate(input: CategoryInput, excludeId?: string): Error | null {
    if (this.store.db.categories.some((c) => c.id !== excludeId && norm(c.code) === norm(input.code))) return new Error(`Category code ${input.code} is already in use.`);
    if (input.parentId) {
      if (input.parentId === excludeId) return new Error('A category cannot be its own parent.');
      const parent = this.store.category(input.parentId);
      if (!parent) return new Error('Parent category was not found.');
      if (parent.parentId) return new Error('Only two category levels are supported (category → subcategory).');
      if (excludeId && this.store.db.categories.some((c) => c.parentId === excludeId)) return new Error('A category with subcategories cannot become a subcategory.');
    }
    return null;
  }

  /** Every active service must belong to a valid (active) category. */
  private blockedDeactivation(id: string): Error | null {
    const ids = [id, ...this.store.db.categories.filter((c) => c.parentId === id).map((c) => c.id)];
    const active = this.store.db.services.filter((s) => s.status === 'Active' && (ids.includes(s.categoryId) || (s.subcategoryId && ids.includes(s.subcategoryId))));
    return active.length ? new Error(`${active.length} active service${active.length === 1 ? '' : 's'} belong to this category. Deactivate or move them first.`) : null;
  }
}

@Injectable()
export class MockPricingApi extends PricingApi {
  private readonly store = inject(MockCatalogStore);

  list(filter: PriceRuleFilter = {}): Observable<PriceRuleListItem[]> {
    return query(() =>
      this.store.db.priceRules
        .filter((r) => !filter.serviceId || r.serviceId === filter.serviceId)
        .map((r) => this.store.priceItem(r))
        .sort((a, b) => a.serviceCode.localeCompare(b.serviceCode) || b.effectiveFrom.localeCompare(a.effectiveFrom)),
    );
  }

  create(input: PriceRuleInput): Observable<PriceRule> {
    return mutate(() => {
      const error = this.validate(input);
      if (error) return error;
      const rule: PriceRule = { ...input, id: uid('PRC'), createdAt: this.store.now(), createdBy: this.store.currentUser };
      this.store.db.priceRules = [...this.store.db.priceRules, rule];
      const s = this.store.service(input.serviceId)!;
      this.store.log('Price Rule Added', 'Price Rule', rule.id, s.name, `${this.store.priceItem(rule).scope} · effective ${input.effectiveFrom}.`, null, `${input.currency} ${input.basePrice}`, s.code);
      this.store.log('Price Changed', 'Service', s.id, s.name, `New ${input.model.toLowerCase()} rule for ${this.store.priceItem(rule).scope}.`, null, `${input.currency} ${input.basePrice}`, s.code);
      return rule;
    });
  }

  update(id: string, input: PriceRuleInput): Observable<PriceRule> {
    return mutate(() => {
      const current = this.store.db.priceRules.find((r) => r.id === id);
      if (!current) return new Error('Price rule was not found.');
      const error = this.validate(input, id);
      if (error) return error;
      const next: PriceRule = { ...current, ...input };
      this.store.db.priceRules = this.store.db.priceRules.map((r) => (r.id === id ? next : r));
      const s = this.store.service(input.serviceId)!;
      this.store.log('Price Rule Updated', 'Price Rule', id, s.name, `Rule for ${this.store.priceItem(next).scope} updated.`, `${current.currency} ${current.basePrice}`, `${next.currency} ${next.basePrice}`, s.code);
      if (current.basePrice !== next.basePrice) this.store.log('Price Changed', 'Service', s.id, s.name, `Price for ${this.store.priceItem(next).scope} changed.`, `${current.currency} ${current.basePrice}`, `${next.currency} ${next.basePrice}`, s.code);
      return next;
    });
  }

  quote(ctx: PriceContext): Observable<PriceQuote> {
    return query(() => {
      const s = this.store.service(ctx.serviceId);
      const customer = this.store.db.reference.customers.find((c) => c.id === ctx.customerId);
      const region = ctx.serviceRegion ?? customer?.serviceRegion ?? null;
      const candidates = this.store.db.priceRules
        .filter((r) => r.serviceId === ctx.serviceId && this.store.priceState(r, ctx.date) === 'Active')
        .filter(
          (r) =>
            (!r.customerId || r.customerId === ctx.customerId) &&
            (!r.agreementId || r.agreementId === ctx.agreementId) &&
            (!r.customerType || r.customerType === customer?.type) &&
            (!r.customerCategory || r.customerCategory === customer?.category) &&
            (!r.serviceRegion || r.serviceRegion === region),
        )
        .sort((a, b) => this.store.specificity(b) - this.store.specificity(a) || b.effectiveFrom.localeCompare(a.effectiveFrom));
      const best = candidates[0] ? this.store.priceItem(candidates[0]) : null;
      const unitPrice = best?.basePrice ?? s?.commercial.standardPrice ?? 0;
      const quantity = Math.max(1, ctx.quantity);
      const subtotal = unitPrice * quantity;
      const charged = Math.min(best?.maxCharge ?? Number.POSITIVE_INFINITY, Math.max(best?.minCharge ?? 0, subtotal));
      const notes: string[] = [];
      if (s?.status !== 'Active') notes.push('Service is not active — it cannot be used for new transactions.');
      if (!s?.commercial.billable) notes.push('Service is non-billable / contract included.');
      if (best?.minCharge && subtotal < best.minCharge) notes.push(`Minimum charge of ${best.currency} ${best.minCharge} applied.`);
      if (best?.maxCharge && subtotal > best.maxCharge) notes.push(`Capped at maximum charge of ${best.currency} ${best.maxCharge}.`);
      if (candidates.length > 1) notes.push(`${candidates.length} rules matched; the most specific scope wins.`);
      return {
        serviceId: ctx.serviceId,
        rule: best,
        source: best ? `${best.priceListName ?? 'Price rule'} · ${best.scope}` : 'Standard price (no matching rule)',
        model: best?.model ?? s?.commercial.billingMethod ?? '',
        currency: best?.currency ?? s?.commercial.currency ?? 'SAR',
        unitPrice,
        quantity,
        subtotal,
        charged,
        notes,
      };
    });
  }

  private validate(input: PriceRuleInput, excludeId?: string): Error | null {
    if (!this.store.service(input.serviceId)) return new Error('Select a valid service.');
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) return new Error('Effective To must be on or after Effective From.');
    if (input.minCharge !== null && input.maxCharge !== null && input.minCharge > input.maxCharge) return new Error('Minimum charge cannot exceed the maximum charge.');
    const overlap = this.store.db.priceRules.find(
      (r) =>
        r.id !== excludeId && r.serviceId === input.serviceId && r.priceListId === input.priceListId && r.customerId === input.customerId && r.customerType === input.customerType &&
        r.customerCategory === input.customerCategory && r.agreementId === input.agreementId && r.serviceRegion === input.serviceRegion &&
        r.effectiveFrom <= (input.effectiveTo ?? '9999-12-31') && input.effectiveFrom <= (r.effectiveTo ?? '9999-12-31'),
    );
    return overlap ? new Error(`An existing rule with the same scope overlaps this effective period (from ${overlap.effectiveFrom}). Set an end date on it first.`) : null;
  }
}

@Injectable()
export class MockEntitlementApi extends EntitlementApi {
  private readonly store = inject(MockCatalogStore);

  list(filter: EntitlementFilter = {}): Observable<EntitlementListItem[]> {
    return query(() =>
      this.store.db.entitlements
        .filter((e) => (!filter.customerId || e.customerId === filter.customerId) && (!filter.serviceId || e.coverage.serviceIds.includes(filter.serviceId)))
        .sort((a, b) => b.number.localeCompare(a.number))
        .map((e) => this.store.entitlementItem(e)),
    );
  }

  get(id: string): Observable<EntitlementListItem> {
    return defer(() => {
      const e = this.store.entitlement(id);
      return e ? respond(this.store.entitlementItem(e)) : fail(`Entitlement ${id} was not found.`);
    });
  }

  create(input: EntitlementUpsert): Observable<Entitlement> {
    return mutate(() => {
      const error = this.checkInput(input);
      if (error) return error;
      const number = input.number.trim().toUpperCase();
      if (this.store.db.entitlements.some((e) => e.number === number)) return new Error(`Entitlement number ${number} is already in use.`);
      const entitlement: Entitlement = { ...input, number, id: number, ...this.store.audit() };
      this.store.db.entitlements = [entitlement, ...this.store.db.entitlements];
      this.store.log('Entitlement Created', 'Entitlement', entitlement.id, number, `Entitlement for ${this.store.customerName(input.customerId)} created.`, null, input.coverage.coverageType, this.agreementNumber(entitlement));
      if (input.status === 'Active') this.store.log('Entitlement Activated', 'Entitlement', entitlement.id, number, 'Activated on creation.', 'Draft', 'Active');
      return entitlement;
    });
  }

  update(id: string, input: EntitlementUpsert): Observable<Entitlement> {
    return mutate(() => {
      const current = this.store.entitlement(id);
      if (!current) return new Error('Entitlement was not found.');
      const error = this.checkInput(input, current);
      if (error) return error;
      const next: Entitlement = { ...current, ...input, id, number: current.number, updatedAt: this.store.now(), updatedBy: this.store.currentUser };
      this.replace(next);
      if (JSON.stringify([current.coverage, current.siteIds, current.assetIds, current.laborParts, current.exclusions]) !== JSON.stringify([next.coverage, next.siteIds, next.assetIds, next.laborParts, next.exclusions])) {
        this.store.log('Coverage Changed', 'Entitlement', id, next.number, 'Covered services, sites, assets, labor/parts or exclusions changed.', `${current.coverage.serviceIds.length} services`, `${next.coverage.serviceIds.length} services`);
      }
      if (current.status !== next.status && next.status === 'Active') this.store.log('Entitlement Activated', 'Entitlement', id, next.number, 'Entitlement activated.', current.status, 'Active');
      this.store.log('Entitlement Modified', 'Entitlement', id, next.number, 'Entitlement updated.', null, null, this.agreementNumber(next));
      return next;
    });
  }

  activate(id: string): Observable<void> {
    return this.transition(id, (e) => {
      if (e.status !== 'Draft' && e.status !== 'Suspended') return new Error(`${e.status} entitlements cannot be activated.`);
      if (e.validity.endDate < today()) return new Error('The validity period has ended — extend or renew the entitlement instead.');
      return { next: { status: 'Active' }, action: 'Entitlement Activated', comment: e.status === 'Suspended' ? 'Suspension lifted.' : 'Entitlement activated.' };
    });
  }

  suspend(id: string, reason: string): Observable<void> {
    return this.transition(id, (e) => {
      if (this.store.effectiveStatus(e) !== 'Active') return new Error('Only active entitlements can be suspended.');
      return { next: { status: 'Suspended' }, action: 'Entitlement Suspended', comment: reason || 'Entitlement suspended.' };
    });
  }

  cancel(id: string, reason: string): Observable<void> {
    return this.transition(id, (e) => {
      if (e.status === 'Cancelled') return new Error('The entitlement is already cancelled.');
      return { next: { status: 'Cancelled' }, action: 'Entitlement Cancelled', comment: reason || 'Entitlement cancelled.' };
    });
  }

  extend(id: string, endDate: string, comment: string): Observable<void> {
    return this.transition(id, (e) => {
      if (e.status === 'Cancelled') return new Error('Cancelled entitlements cannot be extended.');
      if (endDate <= e.validity.endDate) return new Error('The new end date must be after the current end date.');
      return {
        next: { validity: { ...e.validity, endDate }, status: e.status === 'Expired' || this.store.effectiveStatus(e) === 'Expired' ? 'Active' : e.status },
        action: 'Entitlement Extended',
        comment: comment || 'Validity extended.',
        from: e.validity.endDate,
        to: endDate,
      };
    });
  }

  renew(id: string, months: number): Observable<Entitlement> {
    return mutate(() => {
      const e = this.store.entitlement(id);
      if (!e) return new Error('Entitlement was not found.');
      if (e.status === 'Cancelled') return new Error('Cancelled entitlements cannot be renewed.');
      const start = addDays(e.validity.endDate, 1) > today() ? addDays(e.validity.endDate, 1) : today();
      const end = addDays(addMonths(start, months), -1);
      const next: Entitlement = {
        ...e,
        status: 'Active',
        validity: { ...e.validity, startDate: start, effectiveDate: start, endDate: end },
        usage: { ...e.usage, usedVisits: 0, usedHours: 0, usedQuantity: 0, lastResetDate: start },
        updatedAt: this.store.now(),
        updatedBy: this.store.currentUser,
      };
      this.replace(next);
      this.store.log('Entitlement Renewed', 'Entitlement', id, e.number, `Renewed for ${months} months; usage reset.`, `${e.validity.startDate} – ${e.validity.endDate}`, `${start} – ${end}`);
      return next;
    });
  }

  nextNumber(): Observable<string> {
    return query(() => {
      const max = this.store.db.entitlements.reduce((m, e) => Math.max(m, Number(e.number.match(/(\d+)$/)?.[1] ?? 0)), 0);
      return `ENT-${pad(max + 1, 5)}`;
    });
  }

  usage(filter: UsageFilter = {}): Observable<UsageRecordListItem[]> {
    return query(() =>
      this.store.db.usage
        .filter((u) => (!filter.entitlementId || u.entitlementId === filter.entitlementId) && (!filter.serviceId || u.serviceId === filter.serviceId))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((u) => this.store.usageItem(u)),
    );
  }

  /** Records consumption of a covered service and updates usage automatically (SRS 4.15 / 4.17). */
  recordUsage(id: string, input: UsageInput): Observable<void> {
    return mutate(() => {
      const e = this.store.entitlement(id);
      if (!e) return new Error('Entitlement was not found.');
      if (this.store.effectiveStatus(e) !== 'Active') return new Error(`Usage cannot be recorded against a ${this.store.effectiveStatus(e).toLowerCase()} entitlement.`);
      const day = input.date.slice(0, 10);
      if (day < e.validity.startDate || day > e.validity.endDate) return new Error('The service date is outside the entitlement validity period.');
      if (e.exclusions.serviceIds.includes(input.serviceId)) return new Error('This service is excluded from the entitlement.');
      const before = this.store.usageSummary(e);
      const usage = { ...e.usage, usedVisits: e.usage.usedVisits + input.visits, usedHours: e.usage.usedHours + input.hours, usedQuantity: e.usage.usedQuantity + input.quantity };
      const covered = before.remaining === null || before.remaining > 0;
      this.replace({ ...e, usage });
      this.store.db.usage = [{ ...input, id: uid('USG'), entitlementId: id, covered }, ...this.store.db.usage];
      const after = this.store.usageSummary({ ...e, usage });
      this.store.log('Usage Updated', 'Entitlement', id, e.number, `${input.visits} visit(s), ${input.hours} h consumed${covered ? '' : ' — beyond the usage limit (billable)'}.`, String(before.consumed), String(after.consumed), input.reference || null);
      return undefined;
    });
  }

  /** SRS 4.12 / 4.18 — entitlement validation and service eligibility. */
  validate(request: ValidationRequest): Observable<ValidationResult> {
    return query(() => {
      const { db } = this.store;
      const customer = db.reference.customers.find((c) => c.id === request.customerId);
      const service = this.store.service(request.serviceId);
      const candidates = db.entitlements.filter((e) => e.customerId === request.customerId && (!request.entitlementId || e.id === request.entitlementId));
      const evaluations = candidates.map((e) => this.evaluate(e, request));
      const best = evaluations.find((x) => x.covered) ?? evaluations.sort((a, b) => b.score - a.score)[0] ?? null;
      const checks: ValidationCheck[] = best?.checks ?? [
        { question: 'Is the customer active?', result: customer && CATALOG_RULES.activeCustomerStatuses.includes(customer.status) ? 'pass' : 'fail', detail: customer ? `Customer status: ${customer.status}.` : 'Customer not found.' },
        { question: 'Is the entitlement active?', result: 'fail', detail: 'No entitlement exists for this customer.' },
      ];
      const covered = !!best?.covered;
      const entitlement = best ? this.store.entitlementItem(best.entitlement) : null;
      const billable = !covered || !(entitlement?.laborParts.labor || entitlement?.laborParts.parts) || (entitlement?.commercial.billableServiceIds.includes(request.serviceId) ?? false);
      const serviceActive = service?.status === 'Active';
      return {
        request,
        eligible: covered && serviceActive,
        covered,
        billable,
        entitlement,
        checks: [{ question: 'Is the requested service active in the catalog?', result: serviceActive ? 'pass' : 'fail', detail: service ? `${service.code} is ${service.status.toLowerCase()}.` : 'Service not found.' }, ...checks],
        laborCovered: covered && !!entitlement?.laborParts.labor,
        partsCovered: covered && !!entitlement?.laborParts.parts,
        responseHours: covered ? (entitlement?.sla.applicable ? entitlement.sla.responseHours : null) ?? service?.sla.responseHours ?? null : service?.sla.responseHours ?? null,
        resolutionHours: covered ? (entitlement?.sla.applicable ? entitlement.sla.resolutionHours : null) ?? service?.sla.resolutionHours ?? null : service?.sla.resolutionHours ?? null,
        remaining: entitlement?.usageSummary.remaining ?? null,
        summary: !serviceActive
          ? 'The service is not active and cannot be used for new transactions.'
          : covered
            ? `Covered by ${entitlement!.number}${entitlement!.agreementNumber ? ` (${entitlement!.agreementNumber})` : ''} — ${billable ? 'partially billable' : 'non-billable'}.`
            : best
              ? `Not covered — ${best.checks.find((c) => c.result === 'fail')?.detail ?? 'coverage rules not met'} The service is billable.`
              : 'Not covered — the customer has no entitlement. The service is billable.',
      };
    });
  }

  private evaluate(e: Entitlement, r: ValidationRequest) {
    const { db } = this.store;
    const ref = db.reference;
    const customer = ref.customers.find((c) => c.id === r.customerId);
    const site = ref.sites.find((s) => s.id === r.siteId);
    const asset = ref.assets.find((a) => a.id === r.assetId);
    const service = this.store.service(r.serviceId);
    const contract = ref.agreements.find((a) => a.id === e.contractId);
    const amc = ref.agreements.find((a) => a.id === e.amcId);
    const status = this.store.effectiveStatus(e);
    const usage = this.store.usageSummary(e);
    const typeCovered = service && (e.coverage.serviceIds.includes(service.id) || (!e.coverage.serviceIds.length && (e.coverage.categoryIds.includes(service.categoryId) || COVERAGE_SERVICE_TYPES[e.coverage.coverageType].includes(service.type))));
    const excluded = !!service && e.exclusions.serviceIds.includes(service.id);
    const check = (question: string, ok: boolean | null, pass: string, failDetail: string, warn = false): ValidationCheck => ({
      question,
      result: ok === null ? 'na' : ok ? 'pass' : warn ? 'warn' : 'fail',
      detail: ok === null ? 'Not applicable.' : ok ? pass : failDetail,
    });
    const siteOk = !r.siteId ? null : !!site && site.customerId === e.customerId && (!e.siteIds.length || e.siteIds.includes(site.id));
    const assetOk = !r.assetId
      ? null
      : !!asset && !e.exclusions.assetIds.includes(asset.id) && (!e.assetIds.length || e.assetIds.includes(asset.id)) && (!e.siteIds.length || (asset.siteId !== null && e.siteIds.includes(asset.siteId))) && !CATALOG_RULES.invalidAssetStatuses.includes(asset.status);
    const day = r.date.slice(0, 10);
    const checks: ValidationCheck[] = [
      check('Is the customer active?', !!customer && CATALOG_RULES.activeCustomerStatuses.includes(customer.status), `${customer?.name} is active.`, `Customer status is ${customer?.status ?? 'unknown'}.`),
      check('Is the site covered?', siteOk, `${site?.name} is an authorized site.`, `${site?.name ?? 'The site'} is not covered by ${e.number}.`),
      check('Is the asset covered?', assetOk, `${asset?.code} is covered at its current location.`, asset && CATALOG_RULES.invalidAssetStatuses.includes(asset.status) ? `${asset.code} is ${asset.status.toLowerCase()}.` : `${asset?.code ?? 'The asset'} is not covered or is excluded.`),
      check('Is the contract active?', contract ? CATALOG_RULES.liveAgreementStatuses.includes(contract.status) : null, `${contract?.number} is ${contract?.status.toLowerCase()}.`, `${contract?.number} is ${contract?.status.toLowerCase()}.`),
      check('Is the AMC active?', amc ? CATALOG_RULES.liveAgreementStatuses.includes(amc.status) : null, `${amc?.number} is ${amc?.status.toLowerCase()}.`, `${amc?.number} is ${amc?.status.toLowerCase()}.`),
      check('Is the entitlement active?', status === 'Active', `${e.number} is active.`, `${e.number} is ${status.toLowerCase()}.`),
      check('Is the requested service covered?', !!typeCovered, `${service?.name} is included.`, `${service?.name ?? 'The service'} is not included in ${e.number}.`),
      check('Is the service within the validity period?', day >= e.validity.startDate && day <= e.validity.endDate, `Valid ${e.validity.startDate} – ${e.validity.endDate}.`, `Outside ${e.validity.startDate} – ${e.validity.endDate}.`),
      check('Is the usage limit available?', usage.allowed === null ? null : (usage.remaining ?? 0) > 0, `${usage.remaining} ${usage.unit.toLowerCase()} remaining of ${usage.allowed}.`, `Usage limit exhausted (${usage.consumed}/${usage.allowed} ${usage.unit.toLowerCase()}).`),
      check('Are parts covered?', e.laborParts.parts, 'Parts are included.', 'Parts are chargeable.', true),
      check('Is labor covered?', e.laborParts.labor, 'Labor is included.', 'Labor is chargeable.', true),
      check('Is emergency service covered?', r.emergency ? e.coverage.emergencyService : null, 'Emergency service is included.', 'Emergency service is not included.'),
      check('Is the requested service excluded?', !excluded, 'Not excluded.', `${service?.name} is excluded.`),
    ];
    const covered = checks.every((c) => c.result !== 'fail');
    return { entitlement: e, checks, covered, score: checks.filter((c) => c.result === 'pass').length };
  }

  private checkInput(input: EntitlementUpsert, current?: Entitlement): Error | null {
    const ref = this.store.db.reference;
    const customer = ref.customers.find((c) => c.id === input.customerId);
    if (!customer) return new Error('Every entitlement must reference a valid customer.');
    for (const agreementId of [input.contractId, input.amcId]) {
      if (agreementId && ref.agreements.find((a) => a.id === agreementId)?.customerId !== input.customerId) return new Error('The contract / AMC does not belong to the selected customer.');
    }
    if (input.siteIds.some((id) => ref.sites.find((s) => s.id === id)?.customerId !== input.customerId)) return new Error('Covered sites must belong to the customer.');
    if (input.assetIds.some((id) => ref.assets.find((a) => a.id === id)?.customerId !== input.customerId)) return new Error('Covered assets must belong to the customer.');
    if (input.validity.endDate < input.validity.startDate) return new Error('The end date must be on or after the start date.');
    const newServices = input.coverage.serviceIds.filter((id) => !current?.coverage.serviceIds.includes(id));
    const inactive = newServices.map((id) => this.store.service(id)).filter((s) => s && s.status !== 'Active');
    if (inactive.length) return new Error(`Inactive services cannot be added: ${inactive.map((s) => s!.code).join(', ')}.`);
    const overlap = input.coverage.serviceIds.filter((id) => input.exclusions.serviceIds.includes(id));
    if (overlap.length) return new Error('A service cannot be both covered and excluded.');
    if (input.usage.limitApplicable && input.usage.maxVisits === null && input.usage.maxHours === null && input.usage.maxQuantity === null) return new Error('Enter at least one usage limit (visits, hours or quantity).');
    return null;
  }

  private agreementNumber(e: Entitlement): string | null {
    return this.store.db.reference.agreements.find((a) => a.id === (e.contractId ?? e.amcId))?.number ?? null;
  }

  private replace(next: Entitlement): void {
    this.store.db.entitlements = this.store.db.entitlements.map((e) => (e.id === next.id ? next : e));
  }

  private transition(id: string, work: (e: Entitlement) => { next: Partial<Entitlement>; action: 'Entitlement Activated' | 'Entitlement Suspended' | 'Entitlement Cancelled' | 'Entitlement Extended'; comment: string; from?: string; to?: string } | Error): Observable<void> {
    return mutate(() => {
      const e = this.store.entitlement(id);
      if (!e) return new Error('Entitlement was not found.');
      const result = work(e);
      if (result instanceof Error) return result;
      const next = { ...e, ...result.next, updatedAt: this.store.now(), updatedBy: this.store.currentUser };
      this.replace(next);
      this.store.log(result.action, 'Entitlement', id, e.number, result.comment, result.from ?? this.store.effectiveStatus(e), result.to ?? this.store.effectiveStatus(next));
      return undefined;
    });
  }
}

@Injectable()
export class MockCatalogHistoryApi extends CatalogHistoryApi {
  private readonly store = inject(MockCatalogStore);

  list(filter: HistoryFilter = {}): Observable<HistoryEvent[]> {
    return query(() => this.store.db.history.filter((h) => (!filter.entity || h.entity === filter.entity) && (!filter.entityId || h.entityId === filter.entityId)));
  }
}

@Injectable()
export class MockCatalogReferenceApi extends CatalogReferenceApi {
  private readonly store = inject(MockCatalogStore);

  get(): Observable<CatalogReferenceData> {
    return defer(() => respond(this.store.db.reference, 150));
  }
}
