import type { IconName } from '@shared/ui/icon';
import type { BadgeTone } from '@shared/ui/status-badge';
import type { AssignmentStatus, DueCategory, OccurrenceStatus, PmHistoryAction, PmValidationResult, PmWoStatus } from './operations.model';
import type { PlanStatus } from './plan.model';

export const PLAN_STATUS_TONE: Record<PlanStatus, BadgeTone> = { Draft: 'neutral', 'Under Review': 'warn', Approved: 'brand', Active: 'ok', Suspended: 'warn', Cancelled: 'neutral', Archived: 'neutral' };

export const OCC_TONE: Record<OccurrenceStatus, BadgeTone> = {
  Planned: 'neutral',
  Scheduled: 'info',
  Assigned: 'accent',
  Confirmed: 'brand',
  'In Progress': 'brand',
  Completed: 'ok',
  Rescheduled: 'warn',
  Missed: 'danger',
  Cancelled: 'neutral',
  Overdue: 'danger',
};

export const ASSIGN_TONE: Record<AssignmentStatus, BadgeTone> = { Unassigned: 'neutral', Assigned: 'info', Accepted: 'accent', Rejected: 'danger', Reassigned: 'warn', Confirmed: 'brand', 'In Progress': 'brand', Completed: 'ok' };

export const WO_TONE: Record<PmWoStatus, BadgeTone> = { Open: 'neutral', Assigned: 'info', Dispatched: 'accent', 'In Progress': 'brand', Completed: 'ok', Cancelled: 'neutral' };

export const DUE_TONE: Record<DueCategory, BadgeTone> = { 'Due Today': 'warn', 'Due Tomorrow': 'warn', 'Due This Week': 'info', 'Due This Month': 'neutral', 'Due Soon': 'neutral', Overdue: 'danger', 'Severely Overdue': 'danger', Missed: 'danger' };

export const PRIORITY_TONE: Record<string, BadgeTone> = { Critical: 'danger', High: 'warn', Medium: 'info', Low: 'neutral' };

export const VALIDATION_TONE: Record<PmValidationResult, BadgeTone> = {
  'Maintenance Scheduled': 'ok',
  'Maintenance Not Applicable': 'danger',
  'Asset Not Covered': 'danger',
  'Maintenance Plan Inactive': 'danger',
  'Maintenance Plan Suspended': 'warn',
  'Contract Expired': 'danger',
  'AMC Expired': 'danger',
  'Required Parts Unavailable': 'warn',
  'Technician Not Available': 'warn',
  'Maintenance Window Conflict': 'warn',
  'Duplicate Schedule Detected': 'danger',
  'Invalid Recurrence Rule': 'danger',
  'Maintenance Overdue': 'warn',
  'Maintenance Requires Approval': 'warn',
};

export const HISTORY_ICON: Partial<Record<PmHistoryAction, IconName>> = {
  'Maintenance Plan Created': 'plus',
  'Maintenance Plan Activated': 'play',
  'Maintenance Plan Modified': 'pencil',
  'Schedule Generated': 'calendar-check',
  'Work Order Generated': 'wrench',
  'Technician Assigned': 'user-check',
  'Maintenance Scheduled': 'calendar',
  'Maintenance Rescheduled': 'calendar',
  'Maintenance Started': 'play',
  'Checklist Completed': 'clipboard-list',
  'Parts Issued': 'box',
  'Parts Consumed': 'box',
  'Defect Identified': 'alert-triangle',
  'Corrective Work Order Created': 'wrench',
  'Maintenance Completed': 'check-circle',
  'Maintenance Missed': 'x',
  'Maintenance Cancelled': 'ban',
  'Maintenance Overdue': 'alert-circle',
  'Maintenance Plan Suspended': 'pause',
  'Maintenance Plan Resumed': 'play',
  'Submitted for Approval': 'send',
  'Maintenance Plan Approved': 'check-circle',
  'Meter Reading Recorded': 'activity',
  'Maintenance Triggered': 'activity',
  'Plan Reviewed': 'refresh',
  'Document Uploaded': 'paperclip',
};

export const HISTORY_TONE: Partial<Record<PmHistoryAction, BadgeTone>> = {
  'Maintenance Plan Created': 'brand',
  'Maintenance Plan Activated': 'ok',
  'Maintenance Completed': 'ok',
  'Maintenance Plan Approved': 'ok',
  'Maintenance Plan Resumed': 'ok',
  'Maintenance Missed': 'danger',
  'Maintenance Overdue': 'danger',
  'Defect Identified': 'warn',
  'Corrective Work Order Created': 'warn',
  'Maintenance Plan Suspended': 'warn',
  'Maintenance Rescheduled': 'warn',
  'Work Order Generated': 'accent',
  'Maintenance Triggered': 'accent',
  'Schedule Generated': 'info',
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

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}
