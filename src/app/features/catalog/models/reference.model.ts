/** Master data owned by upstream modules (Customer & Site, Asset, Contracts, SLA, Organization). */

export interface CustomerRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly type: string;
  readonly category: string;
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
}

export interface AssetRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly customerId: string | null;
  readonly siteId: string | null;
  readonly status: string;
}

export interface AgreementRef {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly kind: 'Contract' | 'AMC';
  readonly customerId: string;
  readonly siteIds: readonly string[];
  readonly status: string;
  readonly startDate: string;
  readonly endDate: string;
}

export interface SlaRef {
  readonly id: string;
  readonly name: string;
  readonly responseHours: number;
  readonly resolutionHours: number;
}

export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

export interface TerritoryRef extends NamedRef {
  readonly region: string;
}

export interface CatalogReferenceData {
  readonly customers: readonly CustomerRef[];
  readonly sites: readonly SiteRef[];
  readonly assets: readonly AssetRef[];
  readonly agreements: readonly AgreementRef[];
  readonly slas: readonly SlaRef[];
  readonly priceLists: readonly NamedRef[];
  readonly taxProfiles: readonly NamedRef[];
  readonly territories: readonly TerritoryRef[];
  readonly serviceRegions: readonly string[];
  readonly currencies: readonly string[];
  readonly customerTypes: readonly string[];
  readonly customerCategories: readonly string[];
  readonly technicians: readonly string[];
  readonly currentUser: string;
}
