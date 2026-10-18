import type { LookupTypeDefinition } from '@shared/lookups/lookup';

export const PM_LOOKUP = {
  team: 'pm-team',
  skill: 'pm-skill',
  certification: 'pm-certification',
} as const;

export type PmLookupType = (typeof PM_LOOKUP)[keyof typeof PM_LOOKUP];

/** User-maintainable lists; maintenance types, frequencies and statuses stay fixed. */
export const PM_LOOKUP_TYPES: readonly LookupTypeDefinition[] = [
  { key: PM_LOOKUP.team, label: 'Technician Team', editable: true },
  { key: PM_LOOKUP.skill, label: 'Required Skill', editable: true },
  { key: PM_LOOKUP.certification, label: 'Certification', editable: true },
];

export const PM_LOOKUP_SEED: Readonly<Record<PmLookupType, readonly string[]>> = {
  [PM_LOOKUP.team]: ['HVAC Team', 'Electrical Team', 'Mechanical Team', 'Fire & Safety Team', 'ELV & Security Team', 'Multi-Skill Team'],
  [PM_LOOKUP.skill]: ['HVAC Technician', 'Electrician', 'Elevator Technician', 'Fire Systems Technician', 'Generator Technician', 'Plumber', 'Multi-Skill Technician'],
  [PM_LOOKUP.certification]: ['None', 'EPA 608 Refrigerant Handling', 'High Voltage Authorised Person', 'Lift Engineer Certificate', 'NFPA 72 Fire Alarm', 'Confined Space Entry'],
};
