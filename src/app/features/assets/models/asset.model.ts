import type { Auditable, Identifiable } from '@shared/models/entity';
import type { CoverageState } from './coverage.model';
import type { WarrantyStatus } from './warranty.model';

/** SRS 3.5 A — asset statuses in lifecycle order. */
export const ASSET_STATUSES = [
  'Planned',
  'Ordered',
  'Received',
  'Installed',
  'Active',
  'Under Maintenance',
  'Under Repair',
  'Temporarily Out of Service',
  'Transferred',
  'Retired',
  'Decommissioned',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/** Not yet installed at a customer site. */
export const PRE_INSTALLATION_STATUSES: readonly AssetStatus[] = ['Planned', 'Ordered', 'Received'];
/** Installed and in operational use (counted as "Active Assets"). */
export const OPERATIONAL_STATUSES: readonly AssetStatus[] = ['Installed', 'Active', 'Under Maintenance', 'Under Repair'];
/** Temporarily not operational. */
export const INACTIVE_STATUSES: readonly AssetStatus[] = ['Temporarily Out of Service', 'Transferred'];
/** End of life — retained for history, never deleted. */
export const END_OF_LIFE_STATUSES: readonly AssetStatus[] = ['Retired', 'Decommissioned'];

/** SRS 3.17 */
export const CRITICALITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type Criticality = (typeof CRITICALITIES)[number];

/** SRS 3.5 H */
export const OWNERSHIP_TYPES = ['Customer Owned', 'Leased', 'Rented', 'Vendor Owned', 'Company Owned', 'Other'] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

/** Ownership structures that do not require a customer (SRS 3.16 — authorized ownership structure). */
export const NON_CUSTOMER_OWNERSHIP: readonly OwnershipType[] = ['Company Owned', 'Vendor Owned'];

export const SERVICE_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type ServicePriority = (typeof SERVICE_PRIORITIES)[number];

export const SERVICE_FREQUENCIES = ['Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'On Demand'] as const;
export type ServiceFrequency = (typeof SERVICE_FREQUENCIES)[number];

/** Seed values; maintained through the generic lookup mechanism. */
export const ASSET_CATEGORIES = [
  'HVAC',
  'Power',
  'Vertical Transport',
  'Fire & Safety',
  'Security',
  'Plumbing',
  'Building Automation',
  'Refrigeration',
  'Medical Equipment',
  'IT & Network',
] as const;

/** Seed values; maintained through the generic lookup mechanism. */
export const ASSET_TYPES = [
  'Chiller',
  'Air Handling Unit',
  'Split / VRF System',
  'Diesel Generator',
  'UPS',
  'Elevator',
  'Escalator',
  'Fire Alarm Panel',
  'Fire Pump',
  'CCTV System',
  'Access Control',
  'Pump Set',
  'BMS Controller',
  'Cold Room',
  'Compressor',
  'Imaging System',
  'Network Switch',
] as const;

export const MANUFACTURERS = [
  'Carrier',
  'Trane',
  'York',
  'Daikin',
  'Caterpillar',
  'Cummins',
  'KONE',
  'Otis',
  'Notifier',
  'Simplex',
  'APC',
  'Eaton',
  'Hikvision',
  'Milestone',
  'Grundfos',
  'Wilo',
  'Honeywell',
  'Siemens',
  'Bitzer',
  'Copeland',
  'GE Healthcare',
  'Cisco',
] as const;

export const SERVICE_CLASSES = ['Mission Critical', 'Essential', 'Standard', 'Non-Essential'] as const;
export const MAINTENANCE_CLASSES = ['Time-Based', 'Meter-Based', 'Condition-Based', 'Run-to-Failure'] as const;
export const METER_TYPES = ['Running Hours', 'Cycles', 'Kilometres', 'kWh', 'Starts', 'None'] as const;
export const FUEL_TYPES = ['Diesel', 'Natural Gas', 'Petrol', 'LPG', 'Electric', 'Not Applicable'] as const;
export const REFRIGERANT_TYPES = ['R-134a', 'R-410A', 'R-32', 'R-407C', 'R-404A', 'R-1234ze', 'Not Applicable'] as const;
export const SERVICE_PLANS = ['Comprehensive Care', 'Preventive Only', 'Breakdown Cover', 'Inspection Plan', 'Pay Per Visit'] as const;
export const RESPONSIBLE_TEAMS = ['HVAC Team', 'Electrical Team', 'Mechanical Team', 'Fire & Safety Team', 'ELV & Security Team', 'Biomedical Team', 'Installation Team'] as const;

export interface AssetInstallation {
  readonly date: string | null;
  readonly commissioningDate: string | null;
  readonly installedBy: string;
  readonly location: string;
  readonly floor: string;
  readonly room: string;
  readonly area: string;
  readonly initialMeterReading: number | null;
  readonly notes: string;
}

export interface AssetTechnical {
  readonly capacity: string;
  readonly powerRating: string;
  readonly voltage: string;
  readonly frequency: string;
  readonly dimensions: string;
  readonly weight: string;
  readonly operatingRange: string;
  readonly fuelType: string;
  readonly refrigerantType: string;
  readonly specifications: string;
}

export interface AssetService {
  readonly contractId: string | null;
  readonly amcId: string | null;
  readonly slaId: string | null;
  readonly servicePlan: string;
  readonly maintenancePlan: string;
  readonly serviceFrequency: ServiceFrequency | null;
  readonly servicePriority: ServicePriority;
  readonly serviceTerritoryId: string | null;
}

export interface AssetOwnership {
  readonly type: OwnershipType;
  readonly owner: string;
  readonly purchaseDate: string | null;
  readonly purchaseCost: number | null;
  readonly currency: string;
  readonly supplier: string;
  readonly purchaseReference: string;
  readonly depreciationReference: string;
  readonly financialAssetReference: string;
}

export interface AssetOperational {
  readonly responsibleTeam: string;
  readonly assignedTechnician: string;
  readonly serviceRegion: string;
  readonly operatingHours: number | null;
  readonly meterType: string;
  readonly currentMeterReading: number | null;
  readonly lastMaintenanceDate: string | null;
  readonly nextMaintenanceDate: string | null;
}

export interface AssetNotes {
  readonly internalNotes: string;
  readonly customerNotes: string;
  readonly technicianInstructions: string;
}

/** Primary warranty captured on the asset form (stored as the asset's primary warranty record). */
export interface AssetWarrantyInput {
  readonly provider: string;
  readonly reference: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly terms: string;
  readonly notes: string;
}

export interface Asset extends Identifiable, Auditable {
  /** Internal Asset ID — unique (SRS 3.16). */
  readonly code: string;
  readonly tag: string;
  readonly name: string;
  readonly customerId: string | null;
  readonly siteId: string | null;
  readonly status: AssetStatus;
  readonly category: string;
  readonly type: string;
  readonly subType: string;
  readonly criticality: Criticality;
  readonly serviceClass: string;
  readonly maintenanceClass: string;
  readonly manufacturer: string;
  readonly brand: string;
  readonly model: string;
  readonly modelNumber: string;
  readonly serialNumber: string;
  readonly partNumber: string;
  readonly productFamily: string;
  readonly manufacturingDate: string | null;
  readonly barcode: string;
  readonly rfid: string;
  readonly installation: AssetInstallation;
  readonly technical: AssetTechnical;
  readonly customAttributes: Readonly<Record<string, string>>;
  readonly service: AssetService;
  readonly ownership: AssetOwnership;
  readonly operational: AssetOperational;
  readonly notes: AssetNotes;
}

/** Create / update payload. The optional warranty becomes / updates the primary warranty record. */
export type AssetUpsert = Omit<Asset, keyof Identifiable | keyof Auditable> & {
  readonly warranty?: AssetWarrantyInput | null;
};

export interface AssetListItem extends Asset {
  readonly customerName: string | null;
  readonly customerCode: string | null;
  readonly siteName: string | null;
  readonly siteCity: string | null;
  readonly warrantyStatus: WarrantyStatus;
  readonly warrantyEnd: string | null;
  readonly coverageState: CoverageState;
  /** Covered by a live (active or expiring) AMC. */
  readonly amcActive: boolean;
  readonly activeContractNumber: string | null;
  readonly hasActiveSla: boolean;
  readonly componentCount: number;
  readonly openServiceRequests: number;
  readonly openWorkOrders: number;
  readonly failuresLast180Days: number;
  readonly lastServiceDate: string | null;
}

export interface AssetDetail extends AssetListItem {
  readonly siteAddress: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly slaName: string | null;
  readonly territoryName: string | null;
  readonly totalServiceVisits: number;
  readonly totalPartsUsed: number;
  readonly totalServiceCost: number;
  readonly totalDocuments: number;
}

/** Fields the bulk "Update" actions can change at once. */
export interface AssetBulkUpdate {
  readonly category?: string;
  readonly serviceRegion?: string;
  readonly status?: AssetStatus;
  readonly maintenancePlan?: string;
}

/** Serial-number uniqueness scope (SRS 3.16 — configurable by asset type and manufacturer). */
export type SerialUniquenessScope = 'global' | 'manufacturer' | 'type-manufacturer' | 'none';

export interface SerialCheck {
  readonly serialNumber: string;
  readonly manufacturer: string;
  readonly type: string;
}
