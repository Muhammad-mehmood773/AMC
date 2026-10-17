import type { CoverageType } from '../models/entitlement.model';

/** Configurable business rules of the Service Catalog & Entitlements module (SRS 4.14 / 4.15). */
export const CATALOG_RULES = {
  /** Entitlements ending within this window are "Expiring". */
  expiringWindowDays: 60,
  /** Remaining usage at or below this percentage raises a near-limit alert (SRS 4.17). */
  nearLimitPercent: 20,
  /** Contract / AMC statuses that provide active coverage. */
  liveAgreementStatuses: ['Active', 'Expiring'] as readonly string[],
  /** Customer statuses allowed to receive covered services. */
  activeCustomerStatuses: ['Active'] as readonly string[],
  /** Asset statuses that keep asset-level entitlements valid. */
  invalidAssetStatuses: ['Retired', 'Decommissioned', 'Transferred'] as readonly string[],
} as const;

/** Service types each coverage model includes (SRS 4.16) when no explicit service list is given. */
export const COVERAGE_SERVICE_TYPES: Readonly<Record<CoverageType, readonly string[]>> = {
  'Full Coverage': ['Preventive Maintenance', 'Corrective Maintenance', 'Breakdown Service', 'Inspection', 'Repair', 'Replacement', 'Calibration', 'Remote Support'],
  'Labor Only': ['Preventive Maintenance', 'Corrective Maintenance', 'Breakdown Service', 'Inspection', 'Repair', 'Replacement'],
  'Parts Only': ['Repair', 'Replacement', 'Corrective Maintenance'],
  'Preventive Maintenance': ['Preventive Maintenance', 'Inspection', 'Calibration'],
  'Breakdown Service': ['Corrective Maintenance', 'Breakdown Service', 'Repair'],
  'Emergency Service': ['Emergency Service', 'Breakdown Service'],
  'Inspection Only': ['Inspection'],
  'Remote Support': ['Remote Support', 'Consultation'],
  Other: [],
};

/** Default labor / parts flags per coverage model. */
export const COVERAGE_LABOR_PARTS: Readonly<Record<CoverageType, { labor: boolean; parts: boolean }>> = {
  'Full Coverage': { labor: true, parts: true },
  'Labor Only': { labor: true, parts: false },
  'Parts Only': { labor: false, parts: true },
  'Preventive Maintenance': { labor: true, parts: false },
  'Breakdown Service': { labor: true, parts: false },
  'Emergency Service': { labor: true, parts: false },
  'Inspection Only': { labor: true, parts: false },
  'Remote Support': { labor: true, parts: false },
  Other: { labor: false, parts: false },
};
