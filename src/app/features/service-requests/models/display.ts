import type { IconName } from '@shared/ui/icon';
import type { BadgeTone } from '@shared/ui/status-badge';
import type { SrHistoryAction } from './operations.model';
import type { CoverageResult, RequestStatus, SlaState } from './request.model';

export const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  New: 'info',
  'Under Validation': 'warn',
  Validated: 'brand',
  Assigned: 'accent',
  Scheduled: 'accent',
  'In Progress': 'brand',
  Pending: 'warn',
  Resolved: 'ok',
  Closed: 'neutral',
  Cancelled: 'neutral',
  Rejected: 'danger',
  Reopened: 'danger',
};

export const SLA_TONE: Record<SlaState, BadgeTone> = { 'On Track': 'ok', 'At Risk': 'warn', Breached: 'danger', Met: 'ok', Paused: 'accent', 'No SLA': 'neutral' };
export const COVERAGE_TONE: Record<CoverageResult, BadgeTone> = { Covered: 'ok', 'Partially Covered': 'warn', 'Not Covered': 'danger', 'Expired Coverage': 'danger', 'Coverage Pending Validation': 'neutral' };
export const PRIORITY_TONE: Record<string, BadgeTone> = { Critical: 'danger', High: 'warn', Medium: 'info', Low: 'neutral' };

export const HISTORY_ICON: Partial<Record<SrHistoryAction, IconName>> = {
  'Request Created': 'plus',
  'Request Updated': 'pencil',
  'Classification Changed': 'tag',
  'Priority Changed': 'alert-triangle',
  'SLA Applied': 'clock',
  'Coverage Validated': 'shield-check',
  'Assignment Created': 'user-check',
  'Assignment Changed': 'user-check',
  'Schedule Created': 'calendar',
  'Schedule Changed': 'calendar',
  'Status Changed': 'refresh',
  'Request Escalated': 'alert-triangle',
  'Request Put On Hold': 'pause',
  'Request Resumed': 'play',
  'Work Order Created': 'wrench',
  'Work Order Updated': 'wrench',
  'Resolution Added': 'check',
  'Request Resolved': 'check-circle',
  'Customer Confirmation': 'pen-tool',
  'Request Closed': 'lock',
  'Request Reopened': 'refresh',
  'Request Cancelled': 'ban',
  'Request Rejected': 'x',
  'Attachment Added': 'paperclip',
  'Communication Added': 'send',
  'Duplicate Linked': 'link',
  'Request Merged': 'layers',
  'Chargeable Approval': 'wallet',
  Automation: 'activity',
};

export const HISTORY_TONE: Partial<Record<SrHistoryAction, BadgeTone>> = {
  'Request Created': 'brand',
  'Request Resolved': 'ok',
  'Request Closed': 'ok',
  'Customer Confirmation': 'ok',
  'Request Escalated': 'danger',
  'Request Reopened': 'danger',
  'Request Rejected': 'danger',
  'Request Put On Hold': 'warn',
  'Request Cancelled': 'neutral',
  'Work Order Created': 'accent',
  'SLA Applied': 'info',
  Automation: 'info',
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

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—';
  const sign = minutes < 0 ? '−' : '';
  let m = Math.round(Math.abs(minutes));
  const d = Math.floor(m / 1440);
  m -= d * 1440;
  const h = Math.floor(m / 60);
  m -= h * 60;
  if (d) return `${sign}${d}d${h ? ` ${h}h` : ''}`;
  if (h) return `${sign}${h}h${m ? ` ${m}m` : ''}`;
  return `${sign}${m}m`;
}
