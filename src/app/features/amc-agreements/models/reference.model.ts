export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

export interface UserRef extends NamedRef {
  readonly role: string;
}

export interface CustomerRef extends NamedRef {
  readonly code: string;
  readonly legalName: string;
  readonly status: string;
  readonly primaryContact: string;
  readonly accountManagerId: string | null;
  readonly currency: string;
  readonly paymentTermsId: string | null;
  readonly taxProfileId: string | null;
  readonly serviceRegion: string;
  readonly territoryId: string | null;
  readonly defaultSlaId: string | null;
}

export interface SiteRef extends NamedRef {
  readonly code: string;
  readonly customerId: string;
  readonly city: string;
  readonly region: string;
}

export interface AssetRef extends NamedRef {
  readonly category: string;
  readonly customerId: string;
  readonly siteId: string;
  readonly status: string;
}

export interface ServiceRef extends NamedRef {
  readonly code: string;
  readonly category: string;
  readonly type: string;
  readonly status: string;
  readonly durationHours: number;
  readonly skill: string;
  readonly team: string;
}

export interface ContractRef {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly customerId: string | null;
  readonly status: string;
  readonly approved: boolean;
}

export interface TechnicianRef extends NamedRef {
  readonly team: string;
  readonly region: string;
}

export interface RequestRef {
  readonly id: string;
  readonly number: string;
  readonly subject: string;
  readonly siteId: string;
  readonly priority: string;
  readonly status: string;
  readonly createdAt: string;
  readonly kind: 'Service Request' | 'Work Order';
}

export interface AmcReferenceData {
  readonly customers: readonly CustomerRef[];
  readonly sites: readonly SiteRef[];
  readonly assets: readonly AssetRef[];
  readonly assetCategories: readonly string[];
  readonly services: readonly ServiceRef[];
  readonly serviceCategories: readonly string[];
  readonly contracts: readonly ContractRef[];
  readonly technicians: readonly TechnicianRef[];
  readonly requests: readonly RequestRef[];
  readonly users: readonly UserRef[];
  readonly slas: readonly (NamedRef & { readonly responseHours: number; readonly resolutionHours: number })[];
  readonly paymentTerms: readonly NamedRef[];
  readonly taxProfiles: readonly NamedRef[];
  readonly territories: readonly (NamedRef & { readonly region: string })[];
  readonly serviceRegions: readonly string[];
  readonly currencies: readonly string[];
  readonly currentUser: UserRef;
}
