import type { Provider } from '@angular/core';
import { LOOKUP_TYPES, LookupValuesApi } from '@shared/lookups/lookup';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { AssetHandoff } from './asset-handoff.service';
import { AssetReferenceStore } from './asset-reference.store';
import {
  AssetApi,
  AssetDocumentApi,
  AssetReferenceApi,
  ComponentApi,
  EntitlementApi,
  InstallationApi,
  LifecycleApi,
  ServiceHistoryApi,
  TransferApi,
  WarrantyApi,
} from './asset.api';
import { ASSET_LOOKUP_TYPES } from './asset.lookups';
import {
  MockAssetApi,
  MockAssetDocumentApi,
  MockAssetReferenceApi,
  MockComponentApi,
  MockEntitlementApi,
  MockInstallationApi,
  MockLifecycleApi,
  MockServiceHistoryApi,
  MockTransferApi,
  MockWarrantyApi,
} from './mock/mock-asset-apis';
import { MockAssetLookupValuesApi } from './mock/mock-asset-lookup-values.api';
import { MockAssetStore } from './mock/mock-asset-store';

/**
 * Binds the Asset / Installed Base data-access contracts. Replace the mock classes with HTTP
 * adapters (built on `ApiClient`) when the backend becomes available; no component changes required.
 */
export function provideAssetData(): Provider[] {
  return [
    MockAssetStore,
    { provide: AssetApi, useClass: MockAssetApi },
    { provide: ComponentApi, useClass: MockComponentApi },
    { provide: InstallationApi, useClass: MockInstallationApi },
    { provide: TransferApi, useClass: MockTransferApi },
    { provide: WarrantyApi, useClass: MockWarrantyApi },
    { provide: EntitlementApi, useClass: MockEntitlementApi },
    { provide: AssetDocumentApi, useClass: MockAssetDocumentApi },
    { provide: ServiceHistoryApi, useClass: MockServiceHistoryApi },
    { provide: LifecycleApi, useClass: MockLifecycleApi },
    { provide: AssetReferenceApi, useClass: MockAssetReferenceApi },
    { provide: LookupValuesApi, useClass: MockAssetLookupValuesApi },
    { provide: LOOKUP_TYPES, useValue: ASSET_LOOKUP_TYPES },
    LookupValuesStore,
    AssetReferenceStore,
    AssetHandoff,
  ];
}
