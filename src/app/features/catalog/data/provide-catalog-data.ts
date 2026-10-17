import type { Provider } from '@angular/core';
import { LOOKUP_TYPES, LookupValuesApi } from '@shared/lookups/lookup';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { CatalogReferenceStore } from './catalog-reference.store';
import { CatalogHistoryApi, CatalogReferenceApi, CategoryApi, EntitlementApi, PricingApi, ServiceCatalogApi } from './catalog.api';
import { CATALOG_LOOKUP_TYPES } from './catalog.lookups';
import {
  MockCatalogHistoryApi,
  MockCatalogReferenceApi,
  MockCategoryApi,
  MockEntitlementApi,
  MockPricingApi,
  MockServiceCatalogApi,
} from './mock/mock-catalog-apis';
import { MockCatalogLookupValuesApi } from './mock/mock-catalog-lookup-values.api';
import { MockCatalogStore } from './mock/mock-catalog-store';

/**
 * Binds the Service Catalog & Entitlements data-access contracts. Replace the mock classes with HTTP
 * adapters (built on `ApiClient`) when the backend becomes available; no component changes required.
 */
export function provideCatalogData(): Provider[] {
  return [
    MockCatalogStore,
    { provide: ServiceCatalogApi, useClass: MockServiceCatalogApi },
    { provide: CategoryApi, useClass: MockCategoryApi },
    { provide: PricingApi, useClass: MockPricingApi },
    { provide: EntitlementApi, useClass: MockEntitlementApi },
    { provide: CatalogHistoryApi, useClass: MockCatalogHistoryApi },
    { provide: CatalogReferenceApi, useClass: MockCatalogReferenceApi },
    { provide: LookupValuesApi, useClass: MockCatalogLookupValuesApi },
    { provide: LOOKUP_TYPES, useValue: CATALOG_LOOKUP_TYPES },
    LookupValuesStore,
    CatalogReferenceStore,
  ];
}
