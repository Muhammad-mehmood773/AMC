/** SRS 3.13 Service history and SRS 3.14 Lifecycle history. */

export const SERVICE_TYPES = [
  'Preventive Maintenance',
  'Corrective Maintenance',
  'Breakdown Service',
  'Inspection',
  'Installation',
  'Commissioning',
  'Calibration',
  'Replacement',
  'Warranty Service',
  'Emergency Service',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

/** Service types that represent a failure of the asset (failure history, repeated failures). */
export const FAILURE_SERVICE_TYPES: readonly ServiceType[] = ['Corrective Maintenance', 'Breakdown Service', 'Emergency Service'];
export const MAINTENANCE_SERVICE_TYPES: readonly ServiceType[] = ['Preventive Maintenance', 'Inspection', 'Calibration'];

export const SERVICE_RESULTS = ['Completed', 'Resolved', 'Follow-up Required', 'Unresolved'] as const;
export type ServiceResult = (typeof SERVICE_RESULTS)[number];

export const CONFIRMATION_STATES = ['Confirmed', 'Pending', 'Not Required'] as const;
export type ConfirmationState = (typeof CONFIRMATION_STATES)[number];

export interface PartUsage {
  readonly partNumber: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitCost: number;
}

export interface ServiceRecord {
  readonly id: string;
  readonly assetId: string;
  readonly componentId: string | null;
  readonly date: string;
  readonly serviceType: ServiceType;
  readonly serviceRequest: string | null;
  readonly workOrder: string | null;
  readonly technician: string;
  readonly serviceLocation: string;
  readonly problemReported: string;
  readonly diagnosis: string;
  readonly workPerformed: string;
  readonly partsUsed: readonly PartUsage[];
  readonly laborHours: number;
  readonly laborCost: number;
  readonly result: ServiceResult;
  readonly meterReading: number | null;
  readonly customerConfirmation: ConfirmationState;
  readonly warrantyService: boolean;
  /** Agreement number that covered the service, if any. */
  readonly coveredBy: string | null;
  readonly currency: string;
}

export interface ServiceRecordListItem extends ServiceRecord {
  readonly assetCode: string;
  readonly assetName: string;
  readonly customerName: string | null;
  readonly siteName: string | null;
  readonly componentName: string | null;
  readonly partsCost: number;
  readonly serviceCost: number;
  readonly partsCount: number;
}

export interface PartUsageRow extends PartUsage {
  readonly id: string;
  readonly serviceRecordId: string;
  readonly date: string;
  readonly serviceType: ServiceType;
  readonly workOrder: string | null;
  readonly technician: string;
  readonly totalCost: number;
  readonly currency: string;
}

export interface ServiceHistoryFilter {
  readonly assetId?: string;
}

/** SRS 3.14 lifecycle events, plus operational audit events. */
export const LIFECYCLE_EVENTS = [
  'Asset Created',
  'Asset Ordered',
  'Asset Received',
  'Asset Installed',
  'Asset Commissioned',
  'Warranty Started',
  'Contract Started',
  'Location Changed',
  'Ownership Changed',
  'Component Added',
  'Component Replaced',
  'Maintenance Performed',
  'Repair Performed',
  'Warranty Expired',
  'Contract Expired',
  'Asset Transferred',
  'Asset Retired',
  'Asset Decommissioned',
  'Asset Updated',
  'Status Changed',
  'Component Moved',
  'Component Removed',
  'Document Added',
  'Warranty Updated',
  'Transfer Requested',
] as const;
export type LifecycleEventType = (typeof LIFECYCLE_EVENTS)[number];

export interface LifecycleEvent {
  readonly id: string;
  readonly assetId: string;
  readonly timestamp: string;
  readonly user: string;
  readonly eventType: LifecycleEventType;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly reference: string | null;
  readonly comments: string;
}

export interface LifecycleEventListItem extends LifecycleEvent {
  readonly assetCode: string;
  readonly assetName: string;
  readonly customerName: string | null;
}

export interface LifecycleFilter {
  readonly assetId?: string;
}

/** SRS 3.15 — operational lifecycle stages. */
export const LIFECYCLE_STAGES = [
  'Creation',
  'Procurement / Registration',
  'Receipt',
  'Installation',
  'Commissioning',
  'Warranty',
  'Contract / AMC Coverage',
  'Preventive Maintenance',
  'Service Requests',
  'Work Orders',
  'Repairs / Parts Replacement',
  'Transfer / Relocation',
  'Warranty / Contract Expiry',
  'Retirement',
  'Decommissioning',
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** Related downstream records surfaced in Asset 360. */
export type RequestPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface AssetServiceRequest {
  readonly id: string;
  readonly number: string;
  readonly subject: string;
  readonly assetId: string;
  readonly priority: RequestPriority;
  readonly status: string;
  readonly createdAt: string;
  readonly slaDue: string;
}

export interface AssetWorkOrder {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly assetId: string;
  readonly type: string;
  readonly status: string;
  readonly technician: string;
  readonly scheduledDate: string;
  readonly completedDate: string | null;
}

export type MaintenanceStatus = 'Scheduled' | 'Due' | 'Overdue';

export interface AssetMaintenance {
  readonly id: string;
  readonly assetId: string;
  readonly plan: string;
  readonly frequency: string;
  readonly lastDone: string | null;
  readonly nextDue: string;
  readonly status: MaintenanceStatus;
}

export interface AssetRelated {
  readonly serviceRequests: readonly AssetServiceRequest[];
  readonly workOrders: readonly AssetWorkOrder[];
  readonly maintenance: readonly AssetMaintenance[];
}
