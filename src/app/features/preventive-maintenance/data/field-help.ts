import type { FieldHelp } from '@shared/ui/field-info';

/** Contextual help for maintenance plan fields that carry business rules (SRS 8.25). */
export const PM_FIELD_HELP = {
  number: { title: 'Plan Number', lines: ['Every maintenance plan has a unique number, generated automatically.'] },
  assets: { title: 'Asset scope', lines: ['Every active plan must reference a valid asset or asset scope at the site.', 'One occurrence is generated per asset per recurrence.'] },
  frequency: { title: 'Frequency', lines: ['The frequency must be defined before activation.', 'Changes apply from the effective date; historical occurrences are never changed.'] },
  lead: { title: 'Lead time & grace period', lines: ['Work orders are generated this many days before the due date.', 'After the grace period the event becomes overdue and escalates.'] },
  holiday: { title: 'Holiday & weekend handling', lines: ['Generated dates falling on Friday / Saturday or a public holiday are moved according to this rule.'] },
  reschedule: { title: 'Maximum reschedule days', lines: ['Rescheduling beyond this limit requires approval. Moves of more than 7 days require customer approval.'] },
  autoAssign: { title: 'Auto assignment', lines: ['Generated work orders are assigned to the default technician when skills and territory match.'] },
} satisfies Record<string, FieldHelp>;
