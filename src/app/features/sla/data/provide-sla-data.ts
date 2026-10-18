import type { Provider } from '@angular/core';
import { LOOKUP_TYPES, LookupValuesApi } from '@shared/lookups/lookup';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { SlaReferenceStore } from './sla-reference.store';
import { EscalationApi, SlaApi, SlaBreachApi, SlaCalendarApi, SlaClockApi, SlaCoverageApi, SlaHistoryApi, SlaMappingApi, SlaPerformanceApi, SlaReferenceApi, SlaTargetApi } from './sla.api';
import { SLA_LOOKUP_TYPES } from './sla.lookups';
import {
  MockEscalationApi,
  MockSlaApi,
  MockSlaBreachApi,
  MockSlaCalendarApi,
  MockSlaClockApi,
  MockSlaCoverageApi,
  MockSlaHistoryApi,
  MockSlaMappingApi,
  MockSlaPerformanceApi,
  MockSlaReferenceApi,
  MockSlaTargetApi,
} from './mock/mock-sla-apis';
import { MockSlaLookupValuesApi } from './mock/mock-sla-lookup-values.api';
import { MockSlaStore } from './mock/mock-sla-store';

/** Binds the SLA Management data-access contracts (mock adapters for now). */
export function provideSlaData(): Provider[] {
  return [
    MockSlaStore,
    { provide: SlaApi, useClass: MockSlaApi },
    { provide: SlaTargetApi, useClass: MockSlaTargetApi },
    { provide: SlaCoverageApi, useClass: MockSlaCoverageApi },
    { provide: SlaCalendarApi, useClass: MockSlaCalendarApi },
    { provide: EscalationApi, useClass: MockEscalationApi },
    { provide: SlaMappingApi, useClass: MockSlaMappingApi },
    { provide: SlaClockApi, useClass: MockSlaClockApi },
    { provide: SlaBreachApi, useClass: MockSlaBreachApi },
    { provide: SlaPerformanceApi, useClass: MockSlaPerformanceApi },
    { provide: SlaHistoryApi, useClass: MockSlaHistoryApi },
    { provide: SlaReferenceApi, useClass: MockSlaReferenceApi },
    { provide: LookupValuesApi, useClass: MockSlaLookupValuesApi },
    { provide: LOOKUP_TYPES, useValue: SLA_LOOKUP_TYPES },
    LookupValuesStore,
    SlaReferenceStore,
  ];
}
