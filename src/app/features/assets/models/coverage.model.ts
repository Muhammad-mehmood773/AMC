/** SRS 3.11 — commercial and service entitlements of an asset. */

export type AgreementKind = 'Contract' | 'AMC';
export type AgreementStatus = 'Draft' | 'Active' | 'Expiring' | 'Expired' | 'Terminated';

/** Aggregate contract / AMC state of an asset (list column, filters, dashboard). */
export const COVERAGE_STATES = ['Active', 'Expiring', 'Expired', 'None'] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

export const COVERAGE_TYPES = ['Comprehensive', 'Non-Comprehensive', 'Labor Only', 'Parts Only', 'Preventive Only', 'Breakdown Only'] as const;
export type CoverageType = (typeof COVERAGE_TYPES)[number];

/** SRS 3.11 coverage examples. */
export const COVERAGE_FLAGS = [
  { key: 'labor', label: 'Labor Included' },
  { key: 'parts', label: 'Parts Included' },
  { key: 'preventive', label: 'Preventive Maintenance Included' },
  { key: 'breakdown', label: 'Breakdown Service Included' },
  { key: 'emergency', label: 'Emergency Service Included' },
  { key: 'remote', label: 'Remote Support Included' },
  { key: 'inspection', label: 'Inspection Included' },
] as const;
export type CoverageFlag = (typeof COVERAGE_FLAGS)[number]['key'];

export interface AgreementRef {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly kind: AgreementKind;
  readonly customerId: string;
  readonly siteIds: readonly string[];
  readonly status: AgreementStatus;
  readonly startDate: string;
  readonly endDate: string;
}

export interface SlaRef {
  readonly id: string;
  readonly name: string;
  readonly responseHours: number;
  readonly resolutionHours: number;
}

/** Link between an asset and an agreement with its entitlement terms. */
export interface AssetCoverage {
  readonly id: string;
  readonly assetId: string;
  readonly agreementId: string;
  readonly slaId: string | null;
  readonly entitlement: string;
  readonly coverageType: CoverageType;
  readonly serviceFrequency: string;
  readonly includedServices: readonly string[];
  readonly excludedServices: readonly string[];
  readonly flags: Readonly<Record<CoverageFlag, boolean>>;
  readonly visitsAllowed: number | null;
  readonly visitsUsed: number;
  readonly partsCoverage: string;
  readonly laborCoverage: string;
}

export interface CoverageListItem extends AssetCoverage {
  readonly assetCode: string;
  readonly assetName: string;
  readonly assetTag: string;
  readonly customerName: string;
  readonly siteName: string | null;
  readonly agreementNumber: string;
  readonly agreementTitle: string;
  readonly kind: AgreementKind;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: AgreementStatus;
  readonly slaName: string | null;
  readonly responseHours: number | null;
  readonly resolutionHours: number | null;
  readonly visitCoverage: string;
}

export interface CoverageFilter {
  readonly assetId?: string;
}

export type ServiceKind = 'Preventive' | 'Breakdown' | 'Emergency' | 'Inspection' | 'Remote';

/** Result of evaluating the active entitlement for a new service transaction (SRS 3.11 / 3.16). */
export interface EntitlementCheck {
  readonly assetId: string;
  readonly serviceKind: ServiceKind;
  readonly date: string;
  readonly covered: boolean;
  readonly coverage: CoverageListItem | null;
  readonly warrantyActive: boolean;
  readonly warrantyReference: string | null;
  readonly laborIncluded: boolean;
  readonly partsIncluded: boolean;
  readonly visitsRemaining: number | null;
  readonly reasons: readonly string[];
}
