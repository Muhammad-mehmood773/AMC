/**
 * Read-only summaries of records owned by downstream modules (assets, contracts, service,
 * billing), surfaced in Customer 360 and Site 360 views.
 */

export type AssetStatus = 'In Service' | 'Under Maintenance' | 'Out of Service' | 'Decommissioned';

export interface AssetSummary {
  readonly id: string;
  readonly tag: string;
  readonly name: string;
  readonly category: string;
  readonly model: string;
  readonly serialNumber: string;
  readonly customerId: string;
  readonly siteId: string;
  readonly status: AssetStatus;
  readonly installDate: string;
  readonly warrantyEnd: string | null;
}

export type AgreementKind = 'Contract' | 'AMC';
export type AgreementStatus = 'Draft' | 'Active' | 'Expiring' | 'Expired' | 'Terminated';

export interface AgreementSummary {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly kind: AgreementKind;
  readonly customerId: string;
  readonly siteIds: readonly string[];
  readonly status: AgreementStatus;
  readonly startDate: string;
  readonly endDate: string;
  readonly value: number;
  readonly currency: string;
  readonly coverage: string;
}

export type RequestPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type ServiceRequestStatus =
  | 'New'
  | 'Assigned'
  | 'In Progress'
  | 'On Hold'
  | 'Resolved'
  | 'Closed';

export interface ServiceRequestSummary {
  readonly id: string;
  readonly number: string;
  readonly subject: string;
  readonly customerId: string;
  readonly siteId: string;
  readonly priority: RequestPriority;
  readonly status: ServiceRequestStatus;
  readonly createdAt: string;
  readonly slaDue: string;
}

export type WorkOrderType = 'Corrective' | 'Preventive' | 'Installation' | 'Inspection';
export type WorkOrderStatus = 'Scheduled' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';

export interface WorkOrderSummary {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly customerId: string;
  readonly siteId: string;
  readonly type: WorkOrderType;
  readonly status: WorkOrderStatus;
  readonly technician: string;
  readonly scheduledDate: string;
  readonly completedDate: string | null;
}

export type MaintenanceStatus = 'Scheduled' | 'Due' | 'Overdue';

export interface MaintenanceSummary {
  readonly id: string;
  readonly plan: string;
  readonly customerId: string;
  readonly siteId: string;
  readonly assetName: string;
  readonly frequency: string;
  readonly nextDue: string;
  readonly status: MaintenanceStatus;
}

export type InvoiceStatus = 'Draft' | 'Issued' | 'Partially Paid' | 'Paid' | 'Overdue';

export interface InvoiceSummary {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly reference: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly amount: number;
  readonly paid: number;
  readonly currency: string;
  readonly status: InvoiceStatus;
}

export type ServiceOutcome = 'Resolved' | 'Completed' | 'Follow-up Required';

export interface ServiceHistoryEntry {
  readonly id: string;
  readonly date: string;
  readonly customerId: string;
  readonly siteId: string;
  readonly visitType: string;
  readonly reference: string;
  readonly summary: string;
  readonly technician: string;
  readonly outcome: ServiceOutcome;
}

export interface RelatedRecords {
  readonly assets: readonly AssetSummary[];
  readonly contracts: readonly AgreementSummary[];
  readonly amcs: readonly AgreementSummary[];
  readonly serviceRequests: readonly ServiceRequestSummary[];
  readonly workOrders: readonly WorkOrderSummary[];
  readonly maintenance: readonly MaintenanceSummary[];
  readonly invoices: readonly InvoiceSummary[];
  readonly serviceHistory: readonly ServiceHistoryEntry[];
}
