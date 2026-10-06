export interface LookupItem {
  readonly id: string;
  readonly name: string;
}

export interface BranchLookup extends LookupItem {
  readonly companyId: string;
}

export interface UserLookup extends LookupItem {
  readonly email: string;
  readonly role: string;
}

export interface SlaLookup extends LookupItem {
  readonly responseHours: number;
  readonly resolutionHours: number;
}

export interface TerritoryLookup extends LookupItem {
  readonly region: string;
}

export interface RegionLookup {
  readonly name: string;
  readonly cities: readonly string[];
}

export interface CountryLookup {
  readonly name: string;
  readonly regions: readonly RegionLookup[];
}

/** Reference data supplied by Organization & Master Data. */
export interface CustomerLookups {
  readonly companies: readonly LookupItem[];
  readonly branches: readonly BranchLookup[];
  readonly users: readonly UserLookup[];
  readonly accountManagers: readonly UserLookup[];
  readonly salesReps: readonly UserLookup[];
  readonly paymentTerms: readonly LookupItem[];
  readonly currencies: readonly string[];
  readonly taxProfiles: readonly LookupItem[];
  readonly priceLists: readonly LookupItem[];
  readonly slas: readonly SlaLookup[];
  readonly serviceRegions: readonly string[];
  readonly territories: readonly TerritoryLookup[];
  readonly countries: readonly CountryLookup[];
}
