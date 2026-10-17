export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface UserRef {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly email: string;
}

export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

export interface CustomerRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly legalName: string;
  readonly type: string;
  readonly status: string;
  readonly companyId: string;
  readonly branchId: string | null;
  readonly accountManagerId: string | null;
  readonly currency: string;
  readonly paymentTermsId: string | null;
  readonly taxProfileId: string | null;
  readonly primaryContact: string;
}

export interface SiteRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly customerId: string;
  readonly city: string;
}

export interface AssetRef {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly customerId: string;
  readonly siteId: string;
}

export interface ServiceRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly status: string;
}

/** Catalog entitlement linked to a contract / AMC (SRS 5.24). */
export interface EntitlementRef {
  readonly id: string;
  readonly number: string;
  readonly agreementId: string | null;
  readonly coverageType: string;
  readonly status: string;
  readonly endDate: string;
  readonly used: number;
  readonly allowed: number | null;
}

export interface ServiceHistoryRef {
  readonly id: string;
  readonly date: string;
  readonly siteId: string;
  readonly reference: string;
  readonly visitType: string;
  readonly summary: string;
  readonly technician: string;
  readonly outcome: string;
}

export interface ContractReferenceData {
  readonly customers: readonly CustomerRef[];
  readonly sites: readonly SiteRef[];
  readonly assets: readonly AssetRef[];
  readonly services: readonly ServiceRef[];
  readonly entitlements: readonly EntitlementRef[];
  readonly serviceHistory: readonly ServiceHistoryRef[];
  readonly users: readonly UserRef[];
  readonly companies: readonly NamedRef[];
  readonly branches: readonly (NamedRef & { readonly companyId: string })[];
  readonly slas: readonly (NamedRef & { readonly responseHours: number; readonly resolutionHours: number })[];
  readonly paymentTerms: readonly NamedRef[];
  readonly taxProfiles: readonly NamedRef[];
  readonly currencies: readonly string[];
  readonly serviceCategories: readonly string[];
  readonly currentUser: UserRef;
}
