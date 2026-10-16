/** SRS 3.12 — Asset documents. */

export const ASSET_DOCUMENT_TYPES = [
  'Purchase Documents',
  'Warranty Documents',
  'Installation Documents',
  'Commissioning Reports',
  'Technical Manuals',
  'Equipment Datasheets',
  'Inspection Reports',
  'Compliance Certificates',
  'Service Reports',
  'Calibration Certificates',
  'Photos',
  'Other',
] as const;

export const DOCUMENT_STATUSES = ['Valid', 'Expiring Soon', 'Expired', 'No Expiry', 'Archived'] as const;
export type AssetDocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_ACCESS_LEVELS = ['Internal', 'Technicians', 'Customer Visible', 'Restricted'] as const;
export type DocumentAccess = (typeof DOCUMENT_ACCESS_LEVELS)[number];

export interface DocumentFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export interface DocumentVersion {
  readonly version: number;
  readonly fileName: string;
  readonly fileSize: number;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly note: string;
}

export interface AssetDocument {
  readonly id: string;
  readonly assetId: string;
  readonly componentId: string | null;
  readonly name: string;
  readonly type: string;
  readonly documentNumber: string;
  readonly issueDate: string | null;
  readonly expiryDate: string | null;
  readonly reminderDays: number;
  readonly version: number;
  readonly versions: readonly DocumentVersion[];
  readonly access: DocumentAccess;
  readonly fileName: string;
  readonly fileSize: number;
  readonly mimeType: string;
  readonly notes: string;
  readonly archived: boolean;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
}

export interface AssetDocumentListItem extends AssetDocument {
  readonly status: AssetDocumentStatus;
  readonly daysToExpiry: number | null;
  readonly assetCode: string;
  readonly assetName: string;
  readonly customerName: string | null;
  readonly componentName: string | null;
}

export interface DocumentUpload {
  readonly assetId: string;
  readonly componentId: string | null;
  readonly name: string;
  readonly type: string;
  readonly documentNumber: string;
  readonly issueDate: string | null;
  readonly expiryDate: string | null;
  readonly reminderDays: number;
  readonly access: DocumentAccess;
  readonly notes: string;
  readonly file: DocumentFile;
}

export interface DocumentReplace {
  readonly file: DocumentFile;
  readonly note: string;
  readonly issueDate: string | null;
  readonly expiryDate: string | null;
}

export interface DocumentFilter {
  readonly assetId?: string;
}
