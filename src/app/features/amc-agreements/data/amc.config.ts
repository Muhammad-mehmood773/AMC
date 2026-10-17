import type { ServiceFrequency } from '../models/amc.model';

/** Configurable business rules of AMC / Service Contract Management (SRS 6.10, 6.12, 6.16, 6.19). */
export const AMC_RULES = {
  /** Active AMCs ending within this window are reported as "Expiring Soon". */
  expiringWindowDays: 60,
  /** AMCs up to this value can be approved by the contract manager on "Save & Activate". */
  autoApprovalLimit: 100_000,
  /** An AMC should normally be linked to an approved / executed commercial contract (warning only when false). */
  requireApprovedParentContract: false,
  /** Days of the week without scheduled maintenance (0 = Sunday … 6 = Saturday). Friday / Saturday weekend. */
  nonWorkingDays: [5, 6] as readonly number[],
  /** Public holidays (MM-DD) skipped by schedule generation. */
  holidays: ['02-22', '09-23'] as readonly string[],
  /** Scheduled events due within this many days count as "upcoming". */
  upcomingDays: 30,
  /** Utilization percentage that raises a usage threshold alert. */
  usageAlertPercent: 80,
  /** Grace period (days) after the due date before a planned / scheduled event is "Overdue". */
  overdueGraceDays: 0,
  /** Cost model used for AMC profitability (SRS 6.21). */
  laborRatePerHour: 180,
  travelCostPerVisit: 150,
  taxRate: 0.15,
} as const;

/** Occurrences per year for each service frequency (Custom / Meter / Condition use the plan value). */
export const FREQUENCY_PER_YEAR: Readonly<Record<ServiceFrequency, number>> = {
  Daily: 260,
  Weekly: 52,
  'Bi-Weekly': 26,
  Monthly: 12,
  'Bi-Monthly': 6,
  Quarterly: 4,
  'Semi-Annual': 2,
  Annual: 1,
  Custom: 0,
  'Meter-Based': 0,
  'Condition-Based': 0,
};

/** Billing periods per year for each billing frequency. */
export const BILLING_PER_YEAR: Readonly<Record<string, number>> = { Monthly: 12, Quarterly: 4, 'Semi-Annual': 2, Annual: 1 };
