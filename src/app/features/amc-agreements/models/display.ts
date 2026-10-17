import type { IconName } from '@shared/ui/icon';
import type { BadgeTone } from '@shared/ui/status-badge';
import type { AmcStatus } from './amc.model';
import type { AmcHistoryAction, BillingStatus, CoverageResult, CoverageStatus, PmStatus, VisitStatus } from './operations.model';

export const AMC_STATUS_TONE: Record<AmcStatus, BadgeTone> = {
  Draft: 'neutral',
  'Under Review': 'info',
  'Pending Approval': 'warn',
  Approved: 'brand',
  'Pending Activation': 'accent',
  Active: 'ok',
  Suspended: 'warn',
  'Expiring Soon': 'warn',
  Expired: 'danger',
  Terminated: 'danger',
  Renewed: 'info',
  Cancelled: 'neutral',
  Archived: 'neutral',
};

export const PM_TONE: Record<PmStatus, BadgeTone> = {
  Planned: 'neutral',
  Scheduled: 'info',
  Assigned: 'accent',
  'In Progress': 'brand',
  Completed: 'ok',
  Rescheduled: 'warn',
  Missed: 'danger',
  Cancelled: 'neutral',
  Overdue: 'danger',
};

export const VISIT_TONE: Record<VisitStatus, BadgeTone> = {
  Planned: 'neutral',
  Scheduled: 'info',
  Assigned: 'accent',
  Confirmed: 'brand',
  'In Progress': 'brand',
  Completed: 'ok',
  Rescheduled: 'warn',
  Cancelled: 'neutral',
  Missed: 'danger',
};

export const BILLING_TONE: Record<BillingStatus, BadgeTone> = {
  Planned: 'neutral',
  'Ready for Billing': 'info',
  Invoiced: 'accent',
  'Partially Paid': 'warn',
  Paid: 'ok',
  Overdue: 'danger',
  Cancelled: 'neutral',
};

export const COVERAGE_STATUS_TONE: Record<CoverageStatus, BadgeTone> = { Active: 'ok', Inactive: 'neutral', Expired: 'danger' };

export const COVERAGE_RESULT_TONE: Record<CoverageResult, BadgeTone> = {
  'Fully Covered': 'ok',
  'Partially Covered': 'warn',
  'Not Covered': 'danger',
  'Coverage Expired': 'danger',
  'Usage Limit Exceeded': 'danger',
  'Asset Not Covered': 'danger',
  'Service Not Covered': 'danger',
  'Site Not Covered': 'danger',
};

export const HISTORY_ICON: Partial<Record<AmcHistoryAction, IconName>> = {
  'AMC Created': 'plus',
  'AMC Updated': 'pencil',
  'Submitted for Approval': 'send',
  'AMC Approved': 'check-circle',
  'AMC Rejected': 'x',
  'AMC Activated': 'play',
  'Site Added': 'map-pin',
  'Asset Added': 'box',
  'Asset Removed': 'box',
  'Service Added': 'list',
  'Service Removed': 'list',
  'Coverage Changed': 'shield-check',
  'Plan Updated': 'clipboard-list',
  'Schedule Created': 'calendar-check',
  'Visit Scheduled': 'calendar',
  'Visit Completed': 'check-circle',
  'Visit Rescheduled': 'calendar',
  'Visit Cancelled': 'x',
  'Parts Used': 'wrench',
  'Entitlement Consumed': 'activity',
  'Billing Generated': 'receipt',
  'Billing Updated': 'wallet',
  'AMC Suspended': 'pause',
  'AMC Resumed': 'play',
  'AMC Amended': 'layers',
  'AMC Renewed': 'refresh',
  'AMC Terminated': 'ban',
  'AMC Expired': 'clock',
  'Document Uploaded': 'paperclip',
  'Maintenance Escalated': 'alert-triangle',
};

export const HISTORY_TONE: Partial<Record<AmcHistoryAction, BadgeTone>> = {
  'AMC Created': 'brand',
  'AMC Approved': 'ok',
  'AMC Activated': 'ok',
  'AMC Resumed': 'ok',
  'Visit Completed': 'ok',
  'AMC Rejected': 'danger',
  'AMC Terminated': 'danger',
  'AMC Expired': 'danger',
  'Visit Cancelled': 'neutral',
  'AMC Suspended': 'warn',
  'Maintenance Escalated': 'warn',
  'Visit Rescheduled': 'warn',
  'AMC Renewed': 'info',
  'Billing Generated': 'accent',
  'Entitlement Consumed': 'info',
};

export const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  brand: 'bg-brand-subtle text-brand',
  ok: 'bg-ok-subtle text-ok',
  warn: 'bg-warn-subtle text-warn',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent',
};
