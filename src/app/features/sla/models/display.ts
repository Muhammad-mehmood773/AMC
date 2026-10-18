import type { IconName } from '@shared/ui/icon';
import type { BadgeTone } from '@shared/ui/status-badge';
import type { BreachStatus, ClockStatus, SlaHistoryAction, SlaValidationResult, WarningLevel } from './operations.model';
import type { SlaStatus } from './sla.model';

export const SLA_STATUS_TONE: Record<SlaStatus, BadgeTone> = {
  Draft: 'neutral',
  'Under Review': 'info',
  'Pending Approval': 'warn',
  Approved: 'brand',
  'Pending Activation': 'accent',
  Active: 'ok',
  Suspended: 'warn',
  'Expiring Soon': 'warn',
  Expired: 'danger',
  Renewed: 'info',
  Cancelled: 'neutral',
  Archived: 'neutral',
};

export const CLOCK_TONE: Record<ClockStatus, BadgeTone> = {
  'Not Started': 'neutral',
  Running: 'info',
  Paused: 'accent',
  Warning: 'warn',
  Critical: 'danger',
  Breached: 'danger',
  Met: 'ok',
  Cancelled: 'neutral',
};

export const WARNING_TONE: Record<WarningLevel, BadgeTone> = { Normal: 'ok', Warning: 'warn', Critical: 'danger', Breached: 'danger' };

export const BREACH_TONE: Record<BreachStatus, BadgeTone> = {
  Detected: 'danger',
  'Under Review': 'warn',
  Acknowledged: 'info',
  'Root Cause Identified': 'accent',
  'Corrective Action': 'brand',
  Closed: 'ok',
  Waived: 'neutral',
};

export const VALIDATION_TONE: Record<SlaValidationResult, BadgeTone> = {
  'SLA Applied': 'ok',
  'SLA Not Applicable': 'danger',
  'SLA Expired': 'danger',
  'SLA Suspended': 'warn',
  'Customer Not Covered': 'danger',
  'Site Not Covered': 'danger',
  'Asset Not Covered': 'danger',
  'Service Not Covered': 'danger',
  'Priority Not Covered': 'danger',
  'No Applicable SLA': 'danger',
  'Multiple Applicable SLAs': 'warn',
  'SLA Assignment Conflict': 'warn',
};

export const PRIORITY_TONE: Record<string, BadgeTone> = { Critical: 'danger', High: 'warn', Medium: 'info', Low: 'neutral' };

export const HISTORY_ICON: Partial<Record<SlaHistoryAction, IconName>> = {
  'SLA Created': 'plus',
  'SLA Activated': 'play',
  'SLA Assigned': 'link',
  'Customer Added': 'building',
  'Site Added': 'map-pin',
  'Asset Added': 'box',
  'Service Added': 'list',
  'Target Added': 'clock',
  'Target Modified': 'clock',
  'Calendar Changed': 'calendar',
  'Escalation Added': 'alert-triangle',
  'Escalation Modified': 'alert-triangle',
  'SLA Clock Started': 'play',
  'SLA Paused': 'pause',
  'SLA Resumed': 'play',
  'SLA Met': 'check-circle',
  'SLA Breached': 'alert-circle',
  'Escalation Triggered': 'alert-triangle',
  'SLA Suspended': 'pause',
  'SLA Reactivated': 'play',
  'SLA Amended': 'layers',
  'SLA Renewed': 'refresh',
  'SLA Expired': 'clock',
  'Submitted for Approval': 'send',
  'SLA Approved': 'check-circle',
  'SLA Rejected': 'x',
  'Breach Updated': 'pencil',
  'Breach Waived': 'ban',
  'Mapping Changed': 'link',
  'Coverage Changed': 'shield-check',
  'Document Uploaded': 'paperclip',
};

export const HISTORY_TONE: Partial<Record<SlaHistoryAction, BadgeTone>> = {
  'SLA Created': 'brand',
  'SLA Activated': 'ok',
  'SLA Approved': 'ok',
  'SLA Met': 'ok',
  'SLA Reactivated': 'ok',
  'SLA Breached': 'danger',
  'SLA Rejected': 'danger',
  'SLA Expired': 'danger',
  'Escalation Triggered': 'warn',
  'SLA Suspended': 'warn',
  'SLA Paused': 'accent',
  'SLA Renewed': 'info',
  'Breach Waived': 'neutral',
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

/** "1d 4h", "3h 20m", "45m". */
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
