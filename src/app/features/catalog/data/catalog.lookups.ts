import type { LookupTypeDefinition } from '@shared/lookups/lookup';
import { CERTIFICATIONS, MAINTENANCE_TYPES, SERVICE_CLASSES, TEAMS, TECHNICIAN_SKILLS } from '../models/catalog.model';

/** Lookup type keys used by the Service Catalog module. */
export const CATALOG_LOOKUP = {
  serviceClass: 'catalog-service-class',
  skill: 'catalog-technician-skill',
  certification: 'catalog-certification',
  team: 'catalog-team',
  maintenanceType: 'catalog-maintenance-type',
} as const;

export type CatalogLookupType = (typeof CATALOG_LOOKUP)[keyof typeof CATALOG_LOOKUP];

/**
 * Lists organisations maintain themselves. Service types, units, billing methods, coverage types,
 * statuses and master data owned by other modules stay fixed selects; categories have their own screen.
 */
export const CATALOG_LOOKUP_TYPES: readonly LookupTypeDefinition[] = [
  { key: CATALOG_LOOKUP.serviceClass, label: 'Service Class', editable: true },
  { key: CATALOG_LOOKUP.skill, label: 'Technician Skill', editable: true, description: 'Skill required to perform the service; used for technician matching.' },
  { key: CATALOG_LOOKUP.certification, label: 'Technician Certification', editable: true },
  { key: CATALOG_LOOKUP.team, label: 'Team', editable: true },
  { key: CATALOG_LOOKUP.maintenanceType, label: 'Maintenance Type', editable: true },
];

export const CATALOG_LOOKUP_SEED: Readonly<Record<CatalogLookupType, readonly string[]>> = {
  [CATALOG_LOOKUP.serviceClass]: SERVICE_CLASSES,
  [CATALOG_LOOKUP.skill]: TECHNICIAN_SKILLS,
  [CATALOG_LOOKUP.certification]: CERTIFICATIONS,
  [CATALOG_LOOKUP.team]: TEAMS,
  [CATALOG_LOOKUP.maintenanceType]: MAINTENANCE_TYPES,
};
