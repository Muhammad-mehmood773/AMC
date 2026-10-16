/** SRS 3.10 — Asset warranty management. */

export const WARRANTY_TYPES = ['Manufacturer Warranty', 'Supplier Warranty', 'Extended Warranty', 'Service Warranty', 'Other'] as const;
export type WarrantyType = (typeof WARRANTY_TYPES)[number];

export const WARRANTY_STATUSES = ['Not Started', 'Active', 'Expiring Soon', 'Expired', 'Cancelled'] as const;
/** "No Warranty" is used for assets without any warranty record. */
export type WarrantyStatus = (typeof WARRANTY_STATUSES)[number] | 'No Warranty';

export const CLAIM_STATUSES = ['Submitted', 'Approved', 'Rejected', 'Settled'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface WarrantyClaim {
  readonly id: string;
  readonly reference: string;
  readonly date: string;
  readonly description: string;
  readonly status: ClaimStatus;
  readonly amount: number | null;
  readonly serviceRecordId: string | null;
}

export interface AssetWarranty {
  readonly id: string;
  readonly assetId: string;
  /** Set when the warranty covers a component rather than the whole asset. */
  readonly componentId: string | null;
  readonly provider: string;
  readonly type: WarrantyType;
  readonly reference: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly coverageDetails: string;
  readonly exclusions: string;
  readonly cancelled: boolean;
  readonly documentId: string | null;
  readonly notes: string;
  /** The warranty captured on the asset master record. */
  readonly isPrimary: boolean;
  readonly claims: readonly WarrantyClaim[];
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface WarrantyListItem extends AssetWarranty {
  readonly status: Exclude<WarrantyStatus, 'No Warranty'>;
  readonly daysRemaining: number;
  readonly assetCode: string;
  readonly assetName: string;
  readonly assetTag: string;
  readonly customerName: string | null;
  readonly siteName: string | null;
  readonly componentName: string | null;
  readonly documentName: string | null;
  readonly warrantyServices: number;
}

export type WarrantyInput = Omit<AssetWarranty, 'id' | 'claims' | 'createdAt' | 'createdBy' | 'isPrimary'>;
export type ClaimInput = Omit<WarrantyClaim, 'id'>;

export interface WarrantyFilter {
  readonly assetId?: string;
}
