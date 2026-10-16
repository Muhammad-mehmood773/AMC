import type { Observable } from 'rxjs';
import type {
  Asset,
  AssetBulkUpdate,
  AssetDetail,
  AssetListItem,
  AssetStatus,
  AssetUpsert,
  SerialCheck,
} from '../models/asset.model';
import type {
  AssetComponent,
  ComponentFilter,
  ComponentInput,
  ComponentListItem,
  ComponentReplacement,
} from '../models/component.model';
import type { CoverageFilter, CoverageListItem, EntitlementCheck, ServiceKind } from '../models/coverage.model';
import type { AssetDashboard, AssetDashboardFilters } from '../models/dashboard.model';
import type {
  AssetDocument,
  AssetDocumentListItem,
  DocumentFilter,
  DocumentReplace,
  DocumentUpload,
} from '../models/document.model';
import type {
  AssetRelated,
  LifecycleEventListItem,
  LifecycleFilter,
  PartUsageRow,
  ServiceHistoryFilter,
  ServiceRecordListItem,
} from '../models/history.model';
import type {
  AssetTransfer,
  CommissioningInput,
  CustomerConfirmation,
  InstallationInput,
  InstallationListItem,
  InstallationRecord,
  LocationHistoryEntry,
  OperationsFilter,
  TransferInput,
  TransferListItem,
} from '../models/operations.model';
import type { AssetReferenceData } from '../models/reference.model';
import type {
  AssetWarranty,
  ClaimInput,
  WarrantyFilter,
  WarrantyInput,
  WarrantyListItem,
} from '../models/warranty.model';

/*
 * Data-access contracts for the Asset / Installed Base feature.
 * Components depend only on these abstractions; the concrete implementation is bound in
 * `provideAssetData()` (currently in-memory mocks, later HTTP adapters over ApiClient).
 */

export abstract class AssetApi {
  abstract list(): Observable<AssetListItem[]>;
  abstract get(id: string): Observable<AssetDetail>;
  abstract create(input: AssetUpsert): Observable<Asset>;
  abstract update(id: string, input: AssetUpsert): Observable<Asset>;
  abstract setStatus(ids: readonly string[], status: AssetStatus, comment?: string): Observable<void>;
  abstract bulkUpdate(ids: readonly string[], changes: AssetBulkUpdate): Observable<void>;
  abstract nextCode(): Observable<string>;
  abstract isCodeAvailable(code: string, excludeId?: string): Observable<boolean>;
  abstract isTagAvailable(tag: string, excludeId?: string): Observable<boolean>;
  abstract isSerialAvailable(check: SerialCheck, excludeId?: string): Observable<boolean>;
  abstract related(id: string): Observable<AssetRelated>;
  abstract locationHistory(id: string): Observable<LocationHistoryEntry[]>;
  abstract dashboard(filters: AssetDashboardFilters): Observable<AssetDashboard>;
}

export abstract class ComponentApi {
  abstract list(filter?: ComponentFilter): Observable<ComponentListItem[]>;
  abstract create(assetId: string, input: ComponentInput): Observable<AssetComponent>;
  abstract update(id: string, input: ComponentInput): Observable<AssetComponent>;
  abstract replace(id: string, replacement: ComponentReplacement): Observable<AssetComponent>;
  abstract move(id: string, targetAssetId: string, reason: string): Observable<AssetComponent>;
  abstract remove(id: string, reason: string): Observable<void>;
}

export abstract class InstallationApi {
  abstract list(filter?: OperationsFilter): Observable<InstallationListItem[]>;
  abstract schedule(input: InstallationInput): Observable<InstallationRecord>;
  abstract startInstallation(id: string): Observable<void>;
  abstract completeInstallation(id: string): Observable<void>;
  abstract startCommissioning(id: string): Observable<void>;
  abstract completeCommissioning(id: string, input: CommissioningInput): Observable<void>;
  abstract confirm(id: string, confirmation: CustomerConfirmation): Observable<void>;
}

export abstract class TransferApi {
  abstract list(filter?: OperationsFilter): Observable<TransferListItem[]>;
  abstract request(input: TransferInput): Observable<AssetTransfer>;
  abstract approve(id: string): Observable<void>;
  abstract reject(id: string, reason: string): Observable<void>;
  abstract complete(id: string): Observable<void>;
  abstract cancel(id: string): Observable<void>;
}

export abstract class WarrantyApi {
  abstract list(filter?: WarrantyFilter): Observable<WarrantyListItem[]>;
  abstract create(input: WarrantyInput): Observable<AssetWarranty>;
  abstract update(id: string, input: WarrantyInput): Observable<AssetWarranty>;
  abstract cancel(id: string, reason: string): Observable<void>;
  abstract addClaim(id: string, claim: ClaimInput): Observable<AssetWarranty>;
}

export abstract class EntitlementApi {
  abstract list(filter?: CoverageFilter): Observable<CoverageListItem[]>;
  abstract evaluate(assetId: string, serviceKind: ServiceKind, date?: string): Observable<EntitlementCheck>;
}

export abstract class AssetDocumentApi {
  abstract list(filter?: DocumentFilter): Observable<AssetDocumentListItem[]>;
  abstract upload(input: DocumentUpload): Observable<AssetDocument>;
  abstract replace(id: string, input: DocumentReplace): Observable<AssetDocument>;
  abstract setAccess(id: string, access: AssetDocument['access']): Observable<void>;
  abstract archive(id: string): Observable<void>;
}

export abstract class ServiceHistoryApi {
  abstract list(filter?: ServiceHistoryFilter): Observable<ServiceRecordListItem[]>;
  abstract parts(filter?: ServiceHistoryFilter): Observable<PartUsageRow[]>;
}

export abstract class LifecycleApi {
  abstract list(filter?: LifecycleFilter): Observable<LifecycleEventListItem[]>;
}

export abstract class AssetReferenceApi {
  abstract get(): Observable<AssetReferenceData>;
}
