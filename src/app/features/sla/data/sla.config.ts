/** Configurable SLA business rules (SRS 7.8, 7.11, 7.12, 7.20). */
export const SLA_RULES = {
  /** Active SLAs ending within this window are "Expiring Soon". */
  expiringWindowDays: 60,
  /** Default thresholds (% of target consumed). */
  warningPercent: 75,
  escalationPercent: 90,
  breachPercent: 100,
  /** Clocks due within this many minutes count as "Targets Due Soon". */
  dueSoonMinutes: 240,
  /** Breaches on the same customer within this many days count as repeated. */
  repeatedBreachDays: 30,
  /** SLAs with penalties or service credits need formal approval; others are approved on activation. */
  commercialSlaRequiresApproval: true,
  /** Waivers require approval by these roles (SRS 7.20). */
  waiverApproverRoles: ['Operations Director', 'Contract Manager'] as readonly string[],
  /** Selection hierarchy weight per matched field (higher = more specific). */
  specificityWeights: { assetId: 6, siteId: 5, serviceId: 4, amcId: 4, contractId: 3, serviceCategory: 2, priority: 2, customerId: 1 } as Readonly<Record<string, number>>,
} as const;

/** Fixed UTC offsets (minutes) for supported SLA time zones. */
export const TZ_OFFSET: Readonly<Record<string, number>> = { 'Asia/Riyadh': 180, 'Asia/Dubai': 240, 'Asia/Karachi': 300, 'Europe/London': 0, UTC: 0 };
