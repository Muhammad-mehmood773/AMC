import type { Observable } from 'rxjs';
import type { CatalogService, CategoryInput, CategoryListItem, ServiceCategory, ServiceListItem, ServiceStatus, ServiceUpsert } from '../models/catalog.model';
import type { CatalogDashboard, CatalogDashboardFilters } from '../models/dashboard.model';
import type {
  Entitlement,
  EntitlementFilter,
  EntitlementListItem,
  EntitlementUpsert,
  UsageFilter,
  UsageInput,
  UsageRecordListItem,
  ValidationRequest,
  ValidationResult,
} from '../models/entitlement.model';
import type { HistoryEvent, HistoryFilter } from '../models/history.model';
import type { PriceContext, PriceQuote, PriceRule, PriceRuleFilter, PriceRuleInput, PriceRuleListItem } from '../models/pricing.model';
import type { CatalogReferenceData } from '../models/reference.model';

/*
 * Data-access contracts for the Service Catalog & Entitlements feature. Components depend only on
 * these abstractions; `provideCatalogData()` binds the in-memory mocks (later HTTP adapters).
 */

export abstract class ServiceCatalogApi {
  abstract list(): Observable<ServiceListItem[]>;
  abstract get(id: string): Observable<ServiceListItem>;
  abstract create(input: ServiceUpsert): Observable<CatalogService>;
  abstract update(id: string, input: ServiceUpsert): Observable<CatalogService>;
  abstract duplicate(id: string): Observable<CatalogService>;
  abstract setStatus(ids: readonly string[], status: ServiceStatus): Observable<void>;
  abstract nextCode(): Observable<string>;
  abstract isCodeAvailable(code: string, excludeId?: string): Observable<boolean>;
  abstract dashboard(filters: CatalogDashboardFilters): Observable<CatalogDashboard>;
}

export abstract class CategoryApi {
  abstract list(): Observable<CategoryListItem[]>;
  abstract create(input: CategoryInput): Observable<ServiceCategory>;
  abstract update(id: string, input: CategoryInput): Observable<ServiceCategory>;
  abstract setStatus(id: string, status: ServiceCategory['status']): Observable<void>;
  abstract isCodeAvailable(code: string, excludeId?: string): Observable<boolean>;
}

export abstract class PricingApi {
  abstract list(filter?: PriceRuleFilter): Observable<PriceRuleListItem[]>;
  abstract create(input: PriceRuleInput): Observable<PriceRule>;
  abstract update(id: string, input: PriceRuleInput): Observable<PriceRule>;
  abstract quote(context: PriceContext): Observable<PriceQuote>;
}

export abstract class EntitlementApi {
  abstract list(filter?: EntitlementFilter): Observable<EntitlementListItem[]>;
  abstract get(id: string): Observable<EntitlementListItem>;
  abstract create(input: EntitlementUpsert): Observable<Entitlement>;
  abstract update(id: string, input: EntitlementUpsert): Observable<Entitlement>;
  abstract activate(id: string): Observable<void>;
  abstract suspend(id: string, reason: string): Observable<void>;
  abstract cancel(id: string, reason: string): Observable<void>;
  abstract extend(id: string, endDate: string, comment: string): Observable<void>;
  abstract renew(id: string, months: number): Observable<Entitlement>;
  abstract nextNumber(): Observable<string>;
  abstract usage(filter?: UsageFilter): Observable<UsageRecordListItem[]>;
  abstract recordUsage(id: string, input: UsageInput): Observable<void>;
  abstract validate(request: ValidationRequest): Observable<ValidationResult>;
}

export abstract class CatalogHistoryApi {
  abstract list(filter?: HistoryFilter): Observable<HistoryEvent[]>;
}

export abstract class CatalogReferenceApi {
  abstract get(): Observable<CatalogReferenceData>;
}
