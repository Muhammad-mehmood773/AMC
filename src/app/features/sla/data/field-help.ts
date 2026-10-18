import type { FieldHelp } from '@shared/ui/field-info';

/** Contextual help for SLA fields that carry business rules (SRS 7.20). */
export const SLA_FIELD_HELP = {
  number: { title: 'SLA Number', lines: ['Every SLA has a unique number, generated automatically.'] },
  effective: { title: 'Effective date', lines: ['Every active SLA must have an effective date.', 'Expired SLAs are never assigned to new transactions.'] },
  targets: { title: 'Priority targets', lines: ['Targets must be defined before activation.', 'Clocks snapshot the target when they start, so later changes never alter historical calculations.'] },
  calendar: { title: 'Service calendar', lines: ['Every SLA must reference a valid service calendar.', 'Clocks only count working time of the calendar, in its time zone, excluding holidays and approved pauses.'] },
  escalation: { title: 'Escalation percentage', lines: ['Escalations fire when this share of the target has been consumed. Detailed multi-level rules are configured on the Escalation Rules screen.'] },
  penalty: { title: 'Penalties & service credits', lines: ['Penalty per breach as a percentage of the monthly SLA value, capped per month. Financial processing belongs to Billing & Revenue.'] },
} satisfies Record<string, FieldHelp>;
