import type { Provider } from '@angular/core';
import { LOOKUP_TYPES, LookupValuesApi } from '@shared/lookups/lookup';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { AmcReferenceStore } from './amc-reference.store';
import { AmcApi, AmcHistoryApi, AmcReferenceApi, BillingApi, CoverageApi, ScheduleApi, ServicePlanApi, VisitApi } from './amc.api';
import { AMC_LOOKUP_TYPES } from './amc.lookups';
import { AmcOps, MockAmcApi, MockAmcHistoryApi, MockAmcReferenceApi, MockBillingApi, MockCoverageApi, MockScheduleApi, MockServicePlanApi, MockVisitApi } from './mock/mock-amc-apis';
import { MockAmcLookupValuesApi } from './mock/mock-amc-lookup-values.api';
import { MockAmcStore } from './mock/mock-amc-store';

/** Binds the AMC / Service Contract Management data-access contracts (mock adapters for now). */
export function provideAmcData(): Provider[] {
  return [
    MockAmcStore,
    AmcOps,
    { provide: AmcApi, useClass: MockAmcApi },
    { provide: CoverageApi, useClass: MockCoverageApi },
    { provide: ServicePlanApi, useClass: MockServicePlanApi },
    { provide: ScheduleApi, useClass: MockScheduleApi },
    { provide: VisitApi, useClass: MockVisitApi },
    { provide: BillingApi, useClass: MockBillingApi },
    { provide: AmcHistoryApi, useClass: MockAmcHistoryApi },
    { provide: AmcReferenceApi, useClass: MockAmcReferenceApi },
    { provide: LookupValuesApi, useClass: MockAmcLookupValuesApi },
    { provide: LOOKUP_TYPES, useValue: AMC_LOOKUP_TYPES },
    LookupValuesStore,
    AmcReferenceStore,
  ];
}
