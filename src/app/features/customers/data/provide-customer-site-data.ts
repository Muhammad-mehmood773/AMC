import type { Provider } from '@angular/core';
import {
  ActivityApi,
  ContactApi,
  CustomerApi,
  DocumentApi,
  LookupApi,
  RelatedRecordsApi,
  SiteApi,
} from './customer-site.api';
import {
  MockActivityApi,
  MockContactApi,
  MockCustomerApi,
  MockDocumentApi,
  MockLookupApi,
  MockRelatedRecordsApi,
  MockSiteApi,
} from './mock/mock-apis';
import { MockCustomerSiteStore } from './mock/mock-store';

/**
 * Binds the feature's data-access contracts. Replace the mock classes with HTTP adapters
 * (built on `ApiClient`) when the backend becomes available; no component changes required.
 */
export function provideCustomerSiteData(): Provider[] {
  return [
    MockCustomerSiteStore,
    { provide: CustomerApi, useClass: MockCustomerApi },
    { provide: SiteApi, useClass: MockSiteApi },
    { provide: ContactApi, useClass: MockContactApi },
    { provide: DocumentApi, useClass: MockDocumentApi },
    { provide: ActivityApi, useClass: MockActivityApi },
    { provide: RelatedRecordsApi, useClass: MockRelatedRecordsApi },
    { provide: LookupApi, useClass: MockLookupApi },
  ];
}
