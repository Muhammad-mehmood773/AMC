import type { IconName } from '@shared/ui/icon';
import type { BadgeTone } from '@shared/ui/status-badge';
import type { AssetStatus, Criticality } from './asset.model';
import type { ComponentStatus } from './component.model';
import type { AgreementStatus, CoverageState } from './coverage.model';
import type { AssetDocumentStatus } from './document.model';
import type { LifecycleEventType, MaintenanceStatus, ServiceResult, ServiceType } from './history.model';
import type { CommissioningStatus, InstallationStatus, TransferStatus } from './operations.model';
import type { ClaimStatus, WarrantyStatus } from './warranty.model';

/** Status → badge tone mappings shared by all asset screens. */

export const ASSET_STATUS_TONE: Record<AssetStatus, BadgeTone> = {
  Planned: 'neutral',
  Ordered: 'accent',
  Received: 'info',
  Installed: 'brand',
  Active: 'ok',
  'Under Maintenance': 'warn',
  'Under Repair': 'danger',
  'Temporarily Out of Service': 'warn',
  Transferred: 'info',
  Retired: 'neutral',
  Decommissioned: 'neutral',
};

export const CRITICALITY_TONE: Record<Criticality, BadgeTone> = {
  Critical: 'danger',
  High: 'warn',
  Medium: 'info',
  Low: 'neutral',
};

export const WARRANTY_STATUS_TONE: Record<WarrantyStatus, BadgeTone> = {
  'Not Started': 'info',
  Active: 'ok',
  'Expiring Soon': 'warn',
  Expired: 'danger',
  Cancelled: 'neutral',
  'No Warranty': 'neutral',
};

export const COVERAGE_STATE_TONE: Record<CoverageState, BadgeTone> = {
  Active: 'ok',
  Expiring: 'warn',
  Expired: 'danger',
  None: 'neutral',
};

export const AGREEMENT_STATUS_TONE: Record<AgreementStatus, BadgeTone> = {
  Draft: 'accent',
  Active: 'ok',
  Expiring: 'warn',
  Expired: 'danger',
  Terminated: 'danger',
};

export const COMPONENT_STATUS_TONE: Record<ComponentStatus, BadgeTone> = {
  Active: 'ok',
  'Under Repair': 'warn',
  Replaced: 'neutral',
  Removed: 'neutral',
  Inactive: 'neutral',
};

export const INSTALLATION_STATUS_TONE: Record<InstallationStatus, BadgeTone> = {
  Scheduled: 'info',
  'In Progress': 'warn',
  Completed: 'ok',
};

export const COMMISSIONING_STATUS_TONE: Record<CommissioningStatus, BadgeTone> = {
  Pending: 'neutral',
  'In Progress': 'info',
  Completed: 'ok',
  Failed: 'danger',
  'Rework Required': 'warn',
};

export const TRANSFER_STATUS_TONE: Record<TransferStatus, BadgeTone> = {
  Requested: 'info',
  Approved: 'brand',
  Completed: 'ok',
  Rejected: 'danger',
  Cancelled: 'neutral',
};

export const CLAIM_STATUS_TONE: Record<ClaimStatus, BadgeTone> = {
  Submitted: 'info',
  Approved: 'ok',
  Rejected: 'danger',
  Settled: 'brand',
};

export const DOCUMENT_STATUS_TONE: Record<AssetDocumentStatus, BadgeTone> = {
  Valid: 'ok',
  'Expiring Soon': 'warn',
  Expired: 'danger',
  'No Expiry': 'neutral',
  Archived: 'neutral',
};

export const SERVICE_RESULT_TONE: Record<ServiceResult, BadgeTone> = {
  Completed: 'ok',
  Resolved: 'ok',
  'Follow-up Required': 'warn',
  Unresolved: 'danger',
};

export const MAINTENANCE_STATUS_TONE: Record<MaintenanceStatus, BadgeTone> = {
  Scheduled: 'info',
  Due: 'warn',
  Overdue: 'danger',
};

export const SERVICE_TYPE_ICON: Record<ServiceType, IconName> = {
  'Preventive Maintenance': 'calendar-check',
  'Corrective Maintenance': 'wrench',
  'Breakdown Service': 'alert-triangle',
  Inspection: 'search',
  Installation: 'box',
  Commissioning: 'check-circle',
  Calibration: 'sliders',
  Replacement: 'refresh',
  'Warranty Service': 'shield-check',
  'Emergency Service': 'alert-circle',
};

export const SERVICE_TYPE_TONE: Record<ServiceType, BadgeTone> = {
  'Preventive Maintenance': 'ok',
  'Corrective Maintenance': 'warn',
  'Breakdown Service': 'danger',
  Inspection: 'info',
  Installation: 'brand',
  Commissioning: 'brand',
  Calibration: 'accent',
  Replacement: 'accent',
  'Warranty Service': 'info',
  'Emergency Service': 'danger',
};

export const LIFECYCLE_ICON: Record<LifecycleEventType, IconName> = {
  'Asset Created': 'box',
  'Asset Ordered': 'receipt',
  'Asset Received': 'inbox',
  'Asset Installed': 'wrench',
  'Asset Commissioned': 'check-circle',
  'Warranty Started': 'shield-check',
  'Contract Started': 'file-check',
  'Location Changed': 'map-pin',
  'Ownership Changed': 'briefcase',
  'Component Added': 'layers',
  'Component Replaced': 'refresh',
  'Maintenance Performed': 'calendar-check',
  'Repair Performed': 'wrench',
  'Warranty Expired': 'clock',
  'Contract Expired': 'clock',
  'Asset Transferred': 'arrow-right',
  'Asset Retired': 'archive',
  'Asset Decommissioned': 'ban',
  'Asset Updated': 'pencil',
  'Status Changed': 'refresh',
  'Component Moved': 'arrow-right',
  'Component Removed': 'x',
  'Document Added': 'upload',
  'Warranty Updated': 'shield-check',
  'Transfer Requested': 'history',
};

export const LIFECYCLE_TONE: Record<LifecycleEventType, BadgeTone> = {
  'Asset Created': 'brand',
  'Asset Ordered': 'accent',
  'Asset Received': 'info',
  'Asset Installed': 'brand',
  'Asset Commissioned': 'ok',
  'Warranty Started': 'ok',
  'Contract Started': 'ok',
  'Location Changed': 'info',
  'Ownership Changed': 'accent',
  'Component Added': 'info',
  'Component Replaced': 'accent',
  'Maintenance Performed': 'ok',
  'Repair Performed': 'warn',
  'Warranty Expired': 'danger',
  'Contract Expired': 'danger',
  'Asset Transferred': 'info',
  'Asset Retired': 'neutral',
  'Asset Decommissioned': 'neutral',
  'Asset Updated': 'neutral',
  'Status Changed': 'warn',
  'Component Moved': 'info',
  'Component Removed': 'neutral',
  'Document Added': 'info',
  'Warranty Updated': 'neutral',
  'Transfer Requested': 'info',
};

/** Icon tone classes used by timelines and summary cards. */
export const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  brand: 'bg-brand-subtle text-brand',
  ok: 'bg-ok-subtle text-ok',
  warn: 'bg-warn-subtle text-warn',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent',
};

/** Generic tone resolver for statuses of related downstream records. */
export function recordTone(status: string): BadgeTone {
  switch (status) {
    case 'Active':
    case 'Completed':
    case 'Resolved':
    case 'Closed':
      return 'ok';
    case 'Expiring':
    case 'On Hold':
    case 'Due':
    case 'High':
      return 'warn';
    case 'Expired':
    case 'Overdue':
    case 'Critical':
    case 'Terminated':
    case 'Cancelled':
      return 'danger';
    case 'New':
    case 'Assigned':
    case 'In Progress':
    case 'Scheduled':
    case 'Medium':
      return 'info';
    case 'Draft':
      return 'accent';
    default:
      return 'neutral';
  }
}
