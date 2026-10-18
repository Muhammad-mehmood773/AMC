/** Configurable preventive maintenance rules (SRS 8.14, 8.16, 8.17, 8.18, 8.25). */
export const PM_RULES = {
  /** Automatic schedule generation horizon (12-month maintenance calendar). */
  horizonDays: 365,
  /** Default "generate X days before due date". */
  defaultLeadDays: 7,
  /** Default grace period before an event is overdue. */
  defaultGraceDays: 3,
  /** Days overdue after which an event is "Severely Overdue" (management escalation). */
  severelyOverdueDays: 14,
  /** Days overdue after which an untouched event is automatically marked Missed. */
  autoMissDays: 45,
  /** Window for "Due Soon". */
  dueSoonDays: 30,
  /** Days of the week without maintenance (0 = Sunday … 6 = Saturday). */
  nonWorkingDays: [5, 6] as readonly number[],
  /** Customer approval is required when an event moves more than this many days. */
  customerApprovalDays: 7,
  /** Plans covering Critical assets require approval before activation. */
  approvalForCriticalAssets: true,
  /** Meter readings within this share of the interval count as "Approaching". */
  meterApproachingPercent: 90,
  /** Cost model (SRS 8.24). */
  laborRatePerHour: 180,
  travelCostPerVisit: 150,
  toolCostPerVisit: 25,
} as const;
