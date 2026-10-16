import type { LookupTypeDefinition } from '@shared/lookups/lookup';
import {
  ASSET_CATEGORIES,
  ASSET_TYPES,
  FUEL_TYPES,
  MAINTENANCE_CLASSES,
  MANUFACTURERS,
  METER_TYPES,
  REFRIGERANT_TYPES,
  RESPONSIBLE_TEAMS,
  SERVICE_CLASSES,
  SERVICE_PLANS,
} from '../models/asset.model';
import { COMPONENT_TYPES } from '../models/component.model';
import { ASSET_DOCUMENT_TYPES } from '../models/document.model';

/** Lookup type keys used by the Asset / Installed Base module. */
export const ASSET_LOOKUP = {
  category: 'asset-category',
  type: 'asset-type',
  manufacturer: 'asset-manufacturer',
  serviceClass: 'asset-service-class',
  maintenanceClass: 'asset-maintenance-class',
  meterType: 'asset-meter-type',
  fuelType: 'asset-fuel-type',
  refrigerantType: 'asset-refrigerant-type',
  servicePlan: 'asset-service-plan',
  maintenancePlan: 'asset-maintenance-plan',
  responsibleTeam: 'asset-responsible-team',
  componentType: 'asset-component-type',
  documentType: 'asset-document-type',
} as const;

export type AssetLookupType = (typeof ASSET_LOOKUP)[keyof typeof ASSET_LOOKUP];

export const MAINTENANCE_PLANS = [
  'HVAC Quarterly PPM',
  'HVAC Monthly Inspection',
  'Generator Monthly Run Test',
  'Generator Annual Overhaul',
  'Elevator Monthly Service',
  'Fire System Quarterly Test',
  'UPS Semi-Annual Service',
  'Pump Quarterly Service',
  'BMS Annual Health Check',
  'Refrigeration Monthly Service',
  'Biomedical Calibration',
  'Network Annual Review',
] as const;

/**
 * Classification lists defined by the SRS that organisations maintain themselves. Statuses,
 * criticality, ownership types, warranty / transfer / commissioning values and master data owned
 * by other modules (customers, sites, contracts, SLAs, territories) remain fixed selects.
 */
export const ASSET_LOOKUP_TYPES: readonly LookupTypeDefinition[] = [
  { key: ASSET_LOOKUP.category, label: 'Asset Category', editable: true, description: 'Top-level equipment grouping; drives the technical fields and custom attributes captured.' },
  { key: ASSET_LOOKUP.type, label: 'Asset Type', editable: true, description: 'Specific kind of equipment within a category.' },
  { key: ASSET_LOOKUP.manufacturer, label: 'Manufacturer', editable: true },
  { key: ASSET_LOOKUP.serviceClass, label: 'Service Class', editable: true },
  { key: ASSET_LOOKUP.maintenanceClass, label: 'Maintenance Class', editable: true },
  { key: ASSET_LOOKUP.meterType, label: 'Meter Type', editable: true, maxLength: 40 },
  { key: ASSET_LOOKUP.fuelType, label: 'Fuel Type', editable: true, maxLength: 40 },
  { key: ASSET_LOOKUP.refrigerantType, label: 'Refrigerant Type', editable: true, maxLength: 40 },
  { key: ASSET_LOOKUP.servicePlan, label: 'Service Plan', editable: true },
  { key: ASSET_LOOKUP.maintenancePlan, label: 'Maintenance Plan', editable: true },
  { key: ASSET_LOOKUP.responsibleTeam, label: 'Responsible Team', editable: true },
  { key: ASSET_LOOKUP.componentType, label: 'Component Type', editable: true },
  { key: ASSET_LOOKUP.documentType, label: 'Document Type', editable: true, description: 'Categorises asset documents for search and compliance tracking.' },
];

export const ASSET_LOOKUP_SEED: Readonly<Record<AssetLookupType, readonly string[]>> = {
  [ASSET_LOOKUP.category]: ASSET_CATEGORIES,
  [ASSET_LOOKUP.type]: ASSET_TYPES,
  [ASSET_LOOKUP.manufacturer]: MANUFACTURERS,
  [ASSET_LOOKUP.serviceClass]: SERVICE_CLASSES,
  [ASSET_LOOKUP.maintenanceClass]: MAINTENANCE_CLASSES,
  [ASSET_LOOKUP.meterType]: METER_TYPES,
  [ASSET_LOOKUP.fuelType]: FUEL_TYPES,
  [ASSET_LOOKUP.refrigerantType]: REFRIGERANT_TYPES,
  [ASSET_LOOKUP.servicePlan]: SERVICE_PLANS,
  [ASSET_LOOKUP.maintenancePlan]: MAINTENANCE_PLANS,
  [ASSET_LOOKUP.responsibleTeam]: RESPONSIBLE_TEAMS,
  [ASSET_LOOKUP.componentType]: COMPONENT_TYPES,
  [ASSET_LOOKUP.documentType]: ASSET_DOCUMENT_TYPES,
};
