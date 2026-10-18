import type { Provider } from '@angular/core';
import { LOOKUP_TYPES, LookupValuesApi } from '@shared/lookups/lookup';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { RequestApi, SrHistoryApi, SrReferenceApi } from './sr.api';
import { SR_LOOKUP_TYPES } from './sr.lookups';
import { SrReferenceStore } from './sr-reference.store';
import { MockRequestApi, MockSrHistoryApi, MockSrReferenceApi } from './mock/mock-sr-apis';
import { MockSrLookupValuesApi } from './mock/mock-sr-lookup-values.api';
import { MockSrStore } from './mock/mock-sr-store';

/** Binds the Service Request Management data-access contracts (mock adapters for now). */
export function provideSrData(): Provider[] {
  return [
    MockSrStore,
    { provide: RequestApi, useClass: MockRequestApi },
    { provide: SrHistoryApi, useClass: MockSrHistoryApi },
    { provide: SrReferenceApi, useClass: MockSrReferenceApi },
    { provide: LookupValuesApi, useClass: MockSrLookupValuesApi },
    { provide: LOOKUP_TYPES, useValue: SR_LOOKUP_TYPES },
    LookupValuesStore,
    SrReferenceStore,
  ];
}
