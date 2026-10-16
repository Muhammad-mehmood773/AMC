/** SRS 3.7 — Asset hierarchy / components. */

export const COMPONENT_STATUSES = ['Active', 'Under Repair', 'Replaced', 'Removed', 'Inactive'] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

/** Components no longer installed — kept for history (SRS 3.16 component rules). */
export const HISTORICAL_COMPONENT_STATUSES: readonly ComponentStatus[] = ['Replaced', 'Removed'];

/** Seed values; maintained through the generic lookup mechanism. */
export const COMPONENT_TYPES = [
  'Outdoor Unit',
  'Indoor Unit',
  'Compressor',
  'Control Panel',
  'Sensor',
  'Motor',
  'Fan',
  'Pump',
  'Engine',
  'Alternator',
  'Battery',
  'Fuel System',
  'Controller',
  'Drive',
  'Door Operator',
  'Filter',
  'Valve',
  'Other',
] as const;

export interface AssetComponent {
  readonly id: string;
  readonly assetId: string;
  readonly name: string;
  readonly componentType: string;
  readonly serialNumber: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly installationDate: string | null;
  readonly replacementDate: string | null;
  readonly status: ComponentStatus;
  readonly warrantyEnd: string | null;
  readonly warrantyProvider: string;
  /** The component this one replaced (preserves the historical chain). */
  readonly replacesId: string | null;
  /** The component that replaced this one. */
  readonly replacedById: string | null;
  readonly notes: string;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface ComponentListItem extends AssetComponent {
  readonly assetCode: string;
  readonly assetName: string;
  readonly replacesName: string | null;
  readonly replacedByName: string | null;
  readonly serviceCount: number;
  readonly documentCount: number;
  readonly warrantyActive: boolean;
}

export type ComponentInput = Omit<AssetComponent, 'id' | 'assetId' | 'replacesId' | 'replacedById' | 'createdAt' | 'createdBy'>;

export interface ComponentReplacement {
  readonly replacementDate: string;
  readonly reason: string;
  readonly component: ComponentInput;
}

export interface ComponentFilter {
  readonly assetId?: string;
}
