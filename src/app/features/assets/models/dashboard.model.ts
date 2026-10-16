/** Multi-value filters; empty arrays / dates mean "no restriction". Dates are yyyy-MM-dd. */
export interface AssetDashboardFilters {
  readonly customers: readonly string[];
  readonly sites: readonly string[];
  readonly categories: readonly string[];
  readonly types: readonly string[];
  readonly manufacturers: readonly string[];
  readonly models: readonly string[];
  readonly statuses: readonly string[];
  readonly warrantyStatuses: readonly string[];
  readonly coverageStates: readonly string[];
  readonly regions: readonly string[];
  readonly installedFrom: string;
  readonly installedTo: string;
  readonly maintenanceFrom: string;
  readonly maintenanceTo: string;
}

export interface AssetDashboardKpis {
  readonly total: number;
  readonly active: number;
  readonly inactive: number;
  readonly installed: number;
  readonly underWarranty: number;
  readonly warrantyExpiring: number;
  readonly underAmc: number;
  readonly withActiveSla: number;
  readonly requiringMaintenance: number;
  readonly withOpenServiceRequests: number;
  readonly withOpenWorkOrders: number;
  readonly duePreventiveMaintenance: number;
  readonly underBreakdown: number;
  readonly retired: number;
}

/** Compact asset row used by dashboard widgets. */
export interface DashboardAssetRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly tag: string;
  readonly category: string;
  readonly status: string;
  readonly criticality: string;
  readonly customerName: string | null;
  readonly siteName: string | null;
  /** Widget-specific date (created, installed, warranty end, next maintenance, transfer…). */
  readonly date: string | null;
  /** Widget-specific detail text. */
  readonly detail: string;
  /** Widget-specific count (open SRs, failures, days left…). */
  readonly count: number;
}

export interface AssetDashboard {
  readonly kpis: AssetDashboardKpis;
  readonly byStatus: readonly { readonly label: string; readonly value: number }[];
  readonly byCategory: readonly { readonly label: string; readonly value: number }[];
  readonly byCriticality: readonly { readonly label: string; readonly value: number }[];
  readonly recentlyAdded: readonly DashboardAssetRow[];
  readonly recentlyInstalled: readonly DashboardAssetRow[];
  readonly warrantyExpiry: readonly DashboardAssetRow[];
  readonly upcomingMaintenance: readonly DashboardAssetRow[];
  readonly openServiceRequests: readonly DashboardAssetRow[];
  readonly openWorkOrders: readonly DashboardAssetRow[];
  readonly repeatedFailures: readonly DashboardAssetRow[];
  readonly requiringAttention: readonly DashboardAssetRow[];
  readonly recentlyTransferred: readonly DashboardAssetRow[];
}

/** Derived list filters reachable from dashboard KPIs (`?flag=`). */
export const ASSET_FLAGS = {
  active: 'Active assets',
  inactive: 'Inactive assets',
  installed: 'Installed assets',
  'under-amc': 'Under AMC',
  'active-sla': 'With active SLA',
  'maintenance-required': 'Requiring maintenance',
  'open-sr': 'With open service requests',
  'open-wo': 'With open work orders',
  'pm-due': 'Due for preventive maintenance',
  breakdown: 'Under breakdown',
  retired: 'Retired / decommissioned',
  'repeated-failures': 'Repeated failures',
} as const;
export type AssetFlag = keyof typeof ASSET_FLAGS;
