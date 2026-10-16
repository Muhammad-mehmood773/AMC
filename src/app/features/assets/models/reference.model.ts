import type { AgreementRef, SlaRef } from './coverage.model';

/** Master data owned by upstream modules (Customer & Site, Contracts, SLA, Organization). */

export interface CustomerRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly serviceRegion: string;
  readonly currency: string;
}

export interface SiteRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly customerId: string;
  readonly status: string;
  readonly city: string;
  readonly region: string;
  readonly addressLine: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly serviceTerritoryId: string | null;
  readonly defaultSlaId: string | null;
}

export interface TerritoryRef {
  readonly id: string;
  readonly name: string;
  readonly region: string;
}

export interface AssetReferenceData {
  readonly customers: readonly CustomerRef[];
  readonly sites: readonly SiteRef[];
  readonly agreements: readonly AgreementRef[];
  readonly slas: readonly SlaRef[];
  readonly territories: readonly TerritoryRef[];
  readonly serviceRegions: readonly string[];
  readonly technicians: readonly string[];
  readonly users: readonly string[];
  readonly currencies: readonly string[];
  readonly currentUser: string;
}
