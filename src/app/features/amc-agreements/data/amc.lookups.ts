import type { LookupTypeDefinition } from '@shared/lookups/lookup';
import { MAINTENANCE_TYPES, SERVICE_TEAMS } from '../models/amc.model';

export const AMC_LOOKUP = {
  maintenanceType: 'amc-maintenance-type',
  team: 'amc-service-team',
  checklist: 'amc-checklist',
} as const;

export type AmcLookupType = (typeof AMC_LOOKUP)[keyof typeof AMC_LOOKUP];

/** User-maintainable lists; AMC types, statuses and frequencies stay fixed. */
export const AMC_LOOKUP_TYPES: readonly LookupTypeDefinition[] = [
  { key: AMC_LOOKUP.maintenanceType, label: 'Maintenance Type', editable: true },
  { key: AMC_LOOKUP.team, label: 'Service Team', editable: true },
  { key: AMC_LOOKUP.checklist, label: 'Maintenance Checklist', editable: true },
];

export const AMC_LOOKUP_SEED: Readonly<Record<AmcLookupType, readonly string[]>> = {
  [AMC_LOOKUP.maintenanceType]: MAINTENANCE_TYPES,
  [AMC_LOOKUP.team]: SERVICE_TEAMS,
  [AMC_LOOKUP.checklist]: [
    'HVAC Preventive Maintenance Checklist',
    'Chiller Inspection Checklist',
    'Generator Run Test Checklist',
    'Elevator Monthly Service Checklist',
    'Fire Alarm Quarterly Test Checklist',
    'UPS Service Checklist',
    'Pump Station Checklist',
    'General MEP Checklist',
  ],
};
