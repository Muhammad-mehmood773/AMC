import type { IconName } from '@shared/ui/icon';
import type { BadgeTone } from '@shared/ui/status-badge';
import type { CategoryStatus, Priority, ServiceStatus, ServiceType } from './catalog.model';
import type { CheckResult, EntitlementStatus, UsageState } from './entitlement.model';
import type { HistoryAction } from './history.model';
import type { PriceRuleState } from './pricing.model';

export const SERVICE_STATUS_TONE: Record<ServiceStatus, BadgeTone> = { Active: 'ok', Inactive: 'neutral', Draft: 'accent' };
export const CATEGORY_STATUS_TONE: Record<CategoryStatus, BadgeTone> = { Active: 'ok', Inactive: 'neutral' };
export const PRICE_STATE_TONE: Record<PriceRuleState, BadgeTone> = { Active: 'ok', Scheduled: 'info', Expired: 'neutral' };
export const PRIORITY_TONE: Record<Priority, BadgeTone> = { Critical: 'danger', High: 'warn', Medium: 'info', Low: 'neutral' };

export const ENTITLEMENT_STATUS_TONE: Record<EntitlementStatus, BadgeTone> = {
  Draft: 'accent',
  Active: 'ok',
  Suspended: 'warn',
  Expired: 'danger',
  Cancelled: 'neutral',
};

export const USAGE_STATE_TONE: Record<UsageState, BadgeTone> = {
  'Within Limit': 'ok',
  'Near Limit': 'warn',
  Exhausted: 'danger',
  Overused: 'danger',
  Unlimited: 'neutral',
};

export const CHECK_TONE: Record<CheckResult, BadgeTone> = { pass: 'ok', fail: 'danger', warn: 'warn', na: 'neutral' };
export const CHECK_ICON: Record<CheckResult, IconName> = { pass: 'check-circle', fail: 'alert-circle', warn: 'alert-triangle', na: 'info' };

export const SERVICE_TYPE_ICON: Record<ServiceType, IconName> = {
  'Preventive Maintenance': 'calendar-check',
  'Corrective Maintenance': 'wrench',
  'Breakdown Service': 'alert-triangle',
  Inspection: 'search',
  Installation: 'box',
  Commissioning: 'check-circle',
  Calibration: 'sliders',
  Repair: 'wrench',
  Replacement: 'refresh',
  'Emergency Service': 'alert-circle',
  'Remote Support': 'monitor',
  Consultation: 'users',
  Other: 'tag',
};

export const HISTORY_TONE: Partial<Record<HistoryAction, BadgeTone>> = {
  'Service Created': 'brand',
  'Service Activated': 'ok',
  'Service Deactivated': 'neutral',
  'Price Changed': 'accent',
  'SLA Changed': 'info',
  'Entitlement Created': 'brand',
  'Entitlement Activated': 'ok',
  'Usage Updated': 'info',
  'Entitlement Suspended': 'warn',
  'Entitlement Extended': 'accent',
  'Entitlement Renewed': 'ok',
  'Entitlement Expired': 'danger',
  'Entitlement Cancelled': 'danger',
  'Category Created': 'brand',
  'Price Rule Added': 'accent',
};

export const HISTORY_ICON: Partial<Record<HistoryAction, IconName>> = {
  'Service Created': 'plus',
  'Service Updated': 'pencil',
  'Price Changed': 'wallet',
  'Service Activated': 'check-circle',
  'Service Deactivated': 'ban',
  'SLA Changed': 'clock',
  'Service Requirement Changed': 'sliders',
  'Entitlement Created': 'shield-check',
  'Entitlement Activated': 'check-circle',
  'Entitlement Modified': 'pencil',
  'Coverage Changed': 'layers',
  'Usage Updated': 'activity',
  'Entitlement Suspended': 'ban',
  'Entitlement Extended': 'calendar',
  'Entitlement Renewed': 'refresh',
  'Entitlement Expired': 'clock',
  'Entitlement Cancelled': 'x',
  'Category Created': 'tag',
  'Category Updated': 'pencil',
  'Category Activated': 'check-circle',
  'Category Deactivated': 'ban',
  'Price Rule Added': 'receipt',
  'Price Rule Updated': 'receipt',
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
