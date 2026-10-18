export interface SrReferenceData {
  readonly customers: readonly { id: string; name: string; code: string; status: string; segment: string; region: string; defaultSlaId: string | null }[];
  readonly contacts: readonly { id: string; customerId: string; siteId: string | null; name: string; phone: string; email: string; isPrimary: boolean }[];
  readonly sites: readonly { id: string; name: string; customerId: string; city: string; region: string; address: string; access: string; status: string }[];
  readonly assets: readonly {
    id: string; name: string; code: string; customerId: string; siteId: string; category: string; type: string; manufacturer: string; model: string; serialNumber: string; installationDate: string | null;
    status: string; criticality: string; floor: string; area: string; building: string; warrantyStatus: string; warrantyEnd: string | null; warrantyProvider: string;
  }[];
  readonly services: readonly { id: string; name: string; code: string; category: string; type: string }[];
  readonly serviceCategories: readonly string[];
  readonly contracts: readonly { id: string; number: string; name: string; customerId: string | null; status: string }[];
  readonly amcs: readonly { id: string; number: string; name: string; customerId: string; contractId: string | null; status: string; startDate: string; endDate: string; assetIds: readonly string[]; siteIds: readonly string[]; serviceCategories: readonly string[]; slaId: string | null }[];
  readonly slas: readonly { id: string; number: string; name: string }[];
  readonly technicians: readonly { id: string; name: string; team: string; region: string; skills: readonly string[]; dailyCapacity: number }[];
  readonly teams: readonly string[];
  readonly regions: readonly string[];
  readonly branches: readonly string[];
  readonly companies: readonly string[];
  readonly parts: readonly { partNumber: string; description: string; unitCost: number }[];
  readonly users: readonly { id: string; name: string; role: string }[];
  readonly currentUser: { readonly id: string; readonly name: string; readonly role: string };
}
