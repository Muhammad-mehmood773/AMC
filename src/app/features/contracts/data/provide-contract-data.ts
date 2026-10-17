import type { Provider } from '@angular/core';
import { LOOKUP_TYPES, LookupValuesApi } from '@shared/lookups/lookup';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { ContractReferenceStore } from './contract-reference.store';
import {
  AmendmentApi,
  ApprovalApi,
  ContractApi,
  ContractHistoryApi,
  ContractReferenceApi,
  ContractRequestApi,
  ObligationApi,
  RenewalApi,
  ReviewApi,
  SignatureApi,
  TemplateApi,
  TerminationApi,
} from './contract.api';
import { CONTRACT_LOOKUP_TYPES } from './contract.lookups';
import {
  ContractOps,
  MockAmendmentApi,
  MockApprovalApi,
  MockContractApi,
  MockContractHistoryApi,
  MockContractReferenceApi,
  MockContractRequestApi,
  MockObligationApi,
  MockRenewalApi,
  MockReviewApi,
  MockSignatureApi,
  MockTemplateApi,
  MockTerminationApi,
} from './mock/mock-contract-apis';
import { MockContractLookupValuesApi } from './mock/mock-contract-lookup-values.api';
import { MockContractStore } from './mock/mock-contract-store';

/**
 * Binds the Contract Lifecycle Management data-access contracts. Replace the mock classes with HTTP
 * adapters when the backend becomes available; no component changes required.
 */
export function provideContractData(): Provider[] {
  return [
    MockContractStore,
    ContractOps,
    { provide: ContractApi, useClass: MockContractApi },
    { provide: ContractRequestApi, useClass: MockContractRequestApi },
    { provide: TemplateApi, useClass: MockTemplateApi },
    { provide: ReviewApi, useClass: MockReviewApi },
    { provide: ApprovalApi, useClass: MockApprovalApi },
    { provide: SignatureApi, useClass: MockSignatureApi },
    { provide: ObligationApi, useClass: MockObligationApi },
    { provide: AmendmentApi, useClass: MockAmendmentApi },
    { provide: RenewalApi, useClass: MockRenewalApi },
    { provide: TerminationApi, useClass: MockTerminationApi },
    { provide: ContractHistoryApi, useClass: MockContractHistoryApi },
    { provide: ContractReferenceApi, useClass: MockContractReferenceApi },
    { provide: LookupValuesApi, useClass: MockContractLookupValuesApi },
    { provide: LOOKUP_TYPES, useValue: CONTRACT_LOOKUP_TYPES },
    LookupValuesStore,
    ContractReferenceStore,
  ];
}
