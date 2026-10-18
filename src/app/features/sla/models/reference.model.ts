export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

export interface SlaReferenceData {
  readonly customers: readonly (NamedRef & { readonly code: string; readonly legalName: string; readonly status: string; readonly segment: string; readonly accountManagerId: string | null; readonly primaryContact: string; readonly currency: string; readonly region: string; readonly defaultSlaId: string | null })[];
  readonly sites: readonly (NamedRef & { readonly customerId: string; readonly city: string; readonly region: string })[];
  readonly assets: readonly (NamedRef & { readonly customerId: string; readonly siteId: string; readonly category: string })[];
  readonly assetCategories: readonly string[];
  readonly services: readonly (NamedRef & { readonly code: string; readonly category: string; readonly type: string })[];
  readonly serviceCategories: readonly string[];
  readonly serviceTypes: readonly string[];
  readonly contracts: readonly (NamedRef & { readonly number: string; readonly customerId: string | null; readonly status: string; readonly startDate: string; readonly endDate: string })[];
  readonly amcs: readonly (NamedRef & { readonly number: string; readonly customerId: string; readonly contractId: string | null; readonly status: string; readonly siteIds: readonly string[]; readonly startDate: string; readonly endDate: string })[];
  readonly users: readonly (NamedRef & { readonly role: string })[];
  readonly teams: readonly string[];
  readonly technicians: readonly (NamedRef & { readonly team: string; readonly region: string })[];
  readonly regions: readonly string[];
  readonly currencies: readonly string[];
  readonly currentUser: NamedRef & { readonly role: string };
}
