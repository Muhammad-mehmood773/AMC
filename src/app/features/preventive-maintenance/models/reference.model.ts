export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

export interface PmTechnician extends NamedRef {
  readonly team: string;
  readonly region: string;
  readonly skills: readonly string[];
  readonly certifications: readonly string[];
  readonly dailyCapacity: number;
}

export interface PmReferenceData {
  readonly customers: readonly (NamedRef & { readonly code: string; readonly legalName: string; readonly region: string })[];
  readonly sites: readonly (NamedRef & { readonly customerId: string; readonly city: string; readonly region: string })[];
  readonly assets: readonly (NamedRef & {
    readonly code: string; readonly customerId: string; readonly siteId: string; readonly category: string; readonly type: string; readonly manufacturer: string; readonly model: string; readonly serialNumber: string;
    readonly installationDate: string | null; readonly commissioningDate: string | null; readonly criticality: string; readonly status: string; readonly floor: string; readonly area: string; readonly building: string;
    readonly meterType: string; readonly meterReading: number | null; readonly maintenanceClass: string;
  })[];
  readonly assetCategories: readonly string[];
  readonly services: readonly (NamedRef & { readonly code: string; readonly category: string; readonly type: string })[];
  readonly serviceCategories: readonly string[];
  readonly contracts: readonly (NamedRef & { readonly number: string; readonly customerId: string | null; readonly status: string; readonly endDate: string | null })[];
  readonly amcs: readonly (NamedRef & { readonly number: string; readonly customerId: string; readonly contractId: string | null; readonly status: string; readonly startDate: string; readonly endDate: string; readonly assetIds: readonly string[]; readonly slaId: string | null })[];
  readonly slas: readonly (NamedRef & { readonly responseHours: number; readonly resolutionHours: number })[];
  readonly technicians: readonly PmTechnician[];
  readonly teams: readonly string[];
  readonly regions: readonly string[];
  readonly users: readonly (NamedRef & { readonly role: string })[];
  readonly holidays: readonly string[];
  readonly currentUser: NamedRef & { readonly role: string };
}
