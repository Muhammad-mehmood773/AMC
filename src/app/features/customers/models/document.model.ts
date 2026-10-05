export const DOCUMENT_CATEGORIES = [
  'Legal Documents',
  'Commercial Registration',
  'VAT Certificate',
  'Contracts',
  'Insurance',
  'Site Documents',
  'Technical Documents',
  'Compliance Documents',
  'Other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_ACCESS_LEVELS = ['Internal', 'Restricted', 'Customer Visible'] as const;
export type DocumentAccess = (typeof DOCUMENT_ACCESS_LEVELS)[number];

export type DocumentRecordStatus = 'Active' | 'Archived';
export type RenewalStatus = 'None' | 'In Progress' | 'Renewed';

/** Display status combining record status, renewal workflow and expiry tracking. */
export const DOCUMENT_STATUSES = [
  'Valid',
  'Expiring Soon',
  'Expired',
  'Renewal In Progress',
  'No Expiry',
  'Archived',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export interface DocumentVersion {
  readonly version: number;
  readonly fileName: string;
  readonly fileSize: number;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly note: string;
}

export interface CustomerDocument {
  readonly id: string;
  readonly name: string;
  readonly category: DocumentCategory;
  readonly customerId: string;
  readonly siteId: string | null;
  readonly documentNumber: string;
  readonly issueDate: string | null;
  readonly expiryDate: string | null;
  readonly reminderDays: number;
  readonly responsibleUserId: string | null;
  readonly access: DocumentAccess;
  readonly recordStatus: DocumentRecordStatus;
  readonly renewalStatus: RenewalStatus;
  readonly fileName: string;
  readonly fileSize: number;
  readonly mimeType: string;
  readonly version: number;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly versions: readonly DocumentVersion[];
  readonly notes: string;
}

export interface DocumentListItem extends CustomerDocument {
  readonly customerName: string;
  readonly siteName: string | null;
  readonly responsibleUserName: string | null;
  readonly status: DocumentStatus;
  readonly daysToExpiry: number | null;
}

export interface DocumentUpload {
  readonly name: string;
  readonly category: DocumentCategory;
  readonly customerId: string;
  readonly siteId: string | null;
  readonly documentNumber: string;
  readonly issueDate: string | null;
  readonly expiryDate: string | null;
  readonly reminderDays: number;
  readonly responsibleUserId: string | null;
  readonly access: DocumentAccess;
  readonly notes: string;
  readonly file: { readonly name: string; readonly size: number; readonly type: string };
}

export interface DocumentReplace {
  readonly file: { readonly name: string; readonly size: number; readonly type: string };
  readonly note: string;
  readonly issueDate: string | null;
  readonly expiryDate: string | null;
}

export interface DocumentFilter {
  readonly customerId?: string;
  readonly siteId?: string;
}
