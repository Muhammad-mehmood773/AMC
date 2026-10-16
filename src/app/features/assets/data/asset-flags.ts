import {
  END_OF_LIFE_STATUSES,
  INACTIVE_STATUSES,
  OPERATIONAL_STATUSES,
  PRE_INSTALLATION_STATUSES,
  type AssetListItem,
} from '../models/asset.model';
import type { AssetFlag } from '../models/dashboard.model';
import { ASSET_RULES } from './asset.config';

const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Maintenance is overdue or the asset is under maintenance. */
export function requiresMaintenance(a: AssetListItem): boolean {
  if (END_OF_LIFE_STATUSES.includes(a.status)) return false;
  return a.status === 'Under Maintenance' || (!!a.operational.nextMaintenanceDate && a.operational.nextMaintenanceDate < isoDay());
}

/** Next maintenance falls within the preventive-maintenance window. */
export function duePreventiveMaintenance(a: AssetListItem): boolean {
  const next = a.operational.nextMaintenanceDate;
  return !!next && !END_OF_LIFE_STATUSES.includes(a.status) && next >= isoDay() && next <= isoDay(ASSET_RULES.pmDueWindowDays);
}

export function hasRepeatedFailures(a: AssetListItem): boolean {
  return a.failuresLast180Days >= ASSET_RULES.repeatedFailureThreshold;
}

/** Derived KPI filters shared by the dashboard and the asset list (`?flag=`). */
export function matchesFlag(a: AssetListItem, flag: AssetFlag | string): boolean {
  switch (flag) {
    case 'active':
      return OPERATIONAL_STATUSES.includes(a.status);
    case 'inactive':
      return INACTIVE_STATUSES.includes(a.status) || PRE_INSTALLATION_STATUSES.includes(a.status);
    case 'installed':
      return !!a.installation.date && !END_OF_LIFE_STATUSES.includes(a.status);
    case 'under-amc':
      return a.amcActive;
    case 'active-sla':
      return a.hasActiveSla;
    case 'maintenance-required':
      return requiresMaintenance(a);
    case 'open-sr':
      return a.openServiceRequests > 0;
    case 'open-wo':
      return a.openWorkOrders > 0;
    case 'pm-due':
      return duePreventiveMaintenance(a);
    case 'breakdown':
      return a.status === 'Under Repair';
    case 'retired':
      return END_OF_LIFE_STATUSES.includes(a.status);
    case 'repeated-failures':
      return hasRepeatedFailures(a);
    default:
      return true;
  }
}

/** Reasons an asset needs attention (dashboard widget, Asset 360 health). */
export function attentionReasons(a: AssetListItem): string[] {
  if (END_OF_LIFE_STATUSES.includes(a.status)) return [];
  const reasons: string[] = [];
  if (a.status === 'Under Repair') reasons.push('Under breakdown');
  if (a.operational.nextMaintenanceDate && a.operational.nextMaintenanceDate < isoDay()) reasons.push('Maintenance overdue');
  if (hasRepeatedFailures(a)) reasons.push(`${a.failuresLast180Days} failures in 180 days`);
  if (a.criticality === 'Critical' && a.coverageState !== 'Active' && a.coverageState !== 'Expiring' && a.warrantyStatus !== 'Active' && a.warrantyStatus !== 'Expiring Soon') {
    reasons.push('Critical asset without coverage');
  }
  if (a.openServiceRequests > 1) reasons.push(`${a.openServiceRequests} open service requests`);
  return reasons;
}
