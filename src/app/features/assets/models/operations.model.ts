/** SRS 3.8 Installation / Commissioning and SRS 3.9 Transfer / Relocation. */

export const INSTALLATION_STATUSES = ['Scheduled', 'In Progress', 'Completed'] as const;
export type InstallationStatus = (typeof INSTALLATION_STATUSES)[number];

export const COMMISSIONING_STATUSES = ['Pending', 'In Progress', 'Completed', 'Failed', 'Rework Required'] as const;
export type CommissioningStatus = (typeof COMMISSIONING_STATUSES)[number];

export const INITIAL_CONDITIONS = ['New', 'Good', 'Fair', 'Refurbished', 'Damaged on Arrival'] as const;

/** Default commissioning checklist applied to new installations. */
export const COMMISSIONING_CHECKLIST = [
  'Physical installation verified against drawings',
  'Electrical connections and earthing checked',
  'Safety devices and interlocks tested',
  'Controls and set points configured',
  'Performance / load test completed',
  'Customer operators trained',
  'As-built documents handed over',
] as const;

export interface ChecklistItem {
  readonly item: string;
  readonly done: boolean;
}

export interface CustomerConfirmation {
  readonly name: string;
  readonly designation: string;
  readonly date: string;
  readonly remarks: string;
}

export interface InstallationRecord {
  readonly id: string;
  readonly assetId: string;
  readonly customerId: string | null;
  readonly siteId: string | null;
  readonly installationDate: string;
  readonly installationTeam: string;
  readonly technician: string;
  readonly location: string;
  readonly reference: string;
  readonly notes: string;
  readonly installationStatus: InstallationStatus;
  readonly commissioningDate: string | null;
  readonly commissionedBy: string;
  readonly checklist: readonly ChecklistItem[];
  readonly initialMeterReading: number | null;
  readonly initialCondition: string;
  readonly testResults: string;
  readonly commissioningStatus: CommissioningStatus;
  readonly customerConfirmation: CustomerConfirmation | null;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface InstallationListItem extends InstallationRecord {
  readonly assetCode: string;
  readonly assetName: string;
  readonly assetTag: string;
  readonly assetStatus: string;
  readonly customerName: string | null;
  readonly siteName: string | null;
  readonly documentCount: number;
}

export type InstallationInput = Pick<
  InstallationRecord,
  'assetId' | 'installationDate' | 'installationTeam' | 'technician' | 'location' | 'reference' | 'notes'
>;

export interface CommissioningInput {
  readonly commissioningDate: string;
  readonly commissionedBy: string;
  readonly checklist: readonly ChecklistItem[];
  readonly initialMeterReading: number | null;
  readonly initialCondition: string;
  readonly testResults: string;
  readonly outcome: Extract<CommissioningStatus, 'Completed' | 'Failed' | 'Rework Required'>;
}

export const TRANSFER_REASONS = [
  'Customer Request',
  'Site Relocation',
  'Replacement',
  'Operational Requirement',
  'Project Requirement',
  'Maintenance Requirement',
  'Other',
] as const;
export type TransferReason = (typeof TRANSFER_REASONS)[number];

export const TRANSFER_STATUSES = ['Requested', 'Approved', 'Completed', 'Rejected', 'Cancelled'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

/** SRS 3.9 workflow steps. */
export const TRANSFER_WORKFLOW = ['Transfer Request', 'Approval', 'Asset Movement', 'New Location Assignment', 'Asset History Update'] as const;

export interface AssetLocation {
  readonly customerId: string | null;
  readonly siteId: string | null;
  readonly location: string;
}

export interface AssetTransfer {
  readonly id: string;
  readonly assetId: string;
  readonly from: AssetLocation;
  readonly to: AssetLocation;
  readonly transferDate: string;
  readonly reason: TransferReason;
  readonly requestedBy: string;
  readonly approvedBy: string | null;
  readonly reference: string;
  readonly notes: string;
  readonly status: TransferStatus;
  readonly requestedAt: string;
  readonly approvedAt: string | null;
  readonly completedAt: string | null;
  /** Asset status before movement; restored on completion. */
  readonly previousAssetStatus: string;
}

export interface TransferListItem extends AssetTransfer {
  readonly assetCode: string;
  readonly assetName: string;
  readonly assetTag: string;
  readonly fromCustomerName: string | null;
  readonly fromSiteName: string | null;
  readonly toCustomerName: string | null;
  readonly toSiteName: string | null;
  readonly customerChanged: boolean;
}

export type TransferInput = Pick<AssetTransfer, 'assetId' | 'to' | 'transferDate' | 'reason' | 'requestedBy' | 'reference' | 'notes'>;

/** One entry of the asset's location history (SRS 3.16 location rules). */
export interface LocationHistoryEntry {
  readonly from: string;
  readonly to: string | null;
  readonly customerName: string | null;
  readonly siteName: string | null;
  readonly siteId: string | null;
  readonly location: string;
  readonly reason: string;
  readonly reference: string | null;
  readonly current: boolean;
}

export interface OperationsFilter {
  readonly assetId?: string;
}
