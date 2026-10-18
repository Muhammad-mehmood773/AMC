import type { Provider } from '@angular/core';
import { LOOKUP_TYPES, LookupValuesApi } from '@shared/lookups/lookup';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { PmReferenceStore } from './pm-reference.store';
import { ChecklistApi, MeterApi, PlanApi, PmHistoryApi, PmPerformanceApi, PmReferenceApi, PmWorkOrderApi, ScheduleApi, TaskApi } from './pm.api';
import { PM_LOOKUP_TYPES } from './pm.lookups';
import { MockChecklistApi, MockMeterApi, MockPlanApi, MockPmHistoryApi, MockPmPerformanceApi, MockPmReferenceApi, MockPmWorkOrderApi, MockScheduleApi, MockTaskApi } from './mock/mock-pm-apis';
import { MockPmLookupValuesApi } from './mock/mock-pm-lookup-values.api';
import { MockPmStore } from './mock/mock-pm-store';

/** Binds the Preventive Maintenance data-access contracts (mock adapters for now). */
export function providePmData(): Provider[] {
  return [
    MockPmStore,
    { provide: PlanApi, useClass: MockPlanApi },
    { provide: ScheduleApi, useClass: MockScheduleApi },
    { provide: PmWorkOrderApi, useClass: MockPmWorkOrderApi },
    { provide: ChecklistApi, useClass: MockChecklistApi },
    { provide: TaskApi, useClass: MockTaskApi },
    { provide: MeterApi, useClass: MockMeterApi },
    { provide: PmPerformanceApi, useClass: MockPmPerformanceApi },
    { provide: PmHistoryApi, useClass: MockPmHistoryApi },
    { provide: PmReferenceApi, useClass: MockPmReferenceApi },
    { provide: LookupValuesApi, useClass: MockPmLookupValuesApi },
    { provide: LOOKUP_TYPES, useValue: PM_LOOKUP_TYPES },
    LookupValuesStore,
    PmReferenceStore,
  ];
}
