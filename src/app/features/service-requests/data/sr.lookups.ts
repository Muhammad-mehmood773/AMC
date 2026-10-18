import type { LookupTypeDefinition } from '@shared/lookups/lookup';

export const SR_LOOKUP = {
  problemCode: 'sr-problem-code',
  failureType: 'sr-failure-type',
  symptom: 'sr-symptom',
  cause: 'sr-cause',
} as const;

export type SrLookupType = (typeof SR_LOOKUP)[keyof typeof SR_LOOKUP];

/** User-maintainable classification lists; request types, statuses and priorities stay fixed. */
export const SR_LOOKUP_TYPES: readonly LookupTypeDefinition[] = [
  { key: SR_LOOKUP.problemCode, label: 'Problem Code', editable: true },
  { key: SR_LOOKUP.failureType, label: 'Failure Type', editable: true },
  { key: SR_LOOKUP.symptom, label: 'Symptom', editable: true },
  { key: SR_LOOKUP.cause, label: 'Cause', editable: true },
];

export const SR_LOOKUP_SEED: Readonly<Record<SrLookupType, readonly string[]>> = {
  [SR_LOOKUP.problemCode]: ['P-COOL-01 No cooling', 'P-ELEC-02 No power', 'P-LIFT-03 Lift stopped', 'P-FIRE-04 Panel fault', 'P-LEAK-05 Water leak', 'P-NOISE-06 Abnormal noise', 'P-INSP-07 Inspection', 'P-GEN-08 Generator fault'],
  [SR_LOOKUP.failureType]: ['Mechanical', 'Electrical', 'Electronic / Control', 'Wear & Tear', 'Operator Error', 'External Damage', 'No Fault Found'],
  [SR_LOOKUP.symptom]: ['Not working', 'Intermittent', 'Alarm active', 'Leaking', 'Noisy', 'Overheating', 'Low performance'],
  [SR_LOOKUP.cause]: ['Component failure', 'Clogged filter', 'Refrigerant loss', 'Power supply', 'Control fault', 'Misuse', 'Unknown'],
};
