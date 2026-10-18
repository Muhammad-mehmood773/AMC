import type { LookupTypeDefinition } from '@shared/lookups/lookup';

export const SLA_LOOKUP = {
  team: 'sla-service-team',
  holidayCalendar: 'sla-holiday-calendar',
} as const;

export type SlaLookupType = (typeof SLA_LOOKUP)[keyof typeof SLA_LOOKUP];

/** User-maintainable lists; SLA types, statuses, target types and thresholds stay fixed. */
export const SLA_LOOKUP_TYPES: readonly LookupTypeDefinition[] = [
  { key: SLA_LOOKUP.team, label: 'Service Team', editable: true },
  { key: SLA_LOOKUP.holidayCalendar, label: 'Holiday Calendar', editable: true },
];

export const SLA_LOOKUP_SEED: Readonly<Record<SlaLookupType, readonly string[]>> = {
  [SLA_LOOKUP.team]: ['HVAC Team', 'Electrical Team', 'Mechanical Team', 'Fire & Safety Team', 'ELV & Security Team', 'Multi-Skill Team', 'Service Desk'],
  [SLA_LOOKUP.holidayCalendar]: ['KSA Public Holidays', 'UAE Public Holidays', 'Company Holidays'],
};
