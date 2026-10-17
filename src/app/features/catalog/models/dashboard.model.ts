/** SRS 4.3 dashboard filters; empty arrays / dates mean "no restriction". */
export interface CatalogDashboardFilters {
  readonly categories: readonly string[];
  readonly types: readonly string[];
  readonly statuses: readonly string[];
  readonly billing: readonly string[];
  readonly customers: readonly string[];
  readonly contracts: readonly string[];
  readonly amcs: readonly string[];
  readonly from: string;
  readonly to: string;
}

export interface CatalogDashboardKpis {
  readonly totalServices: number;
  readonly activeServices: number;
  readonly inactiveServices: number;
  readonly categories: number;
  readonly contractEligible: number;
  readonly amcEligible: number;
  readonly billable: number;
  readonly nonBillable: number;
  readonly activeEntitlements: number;
  readonly expiringEntitlements: number;
  readonly withUsageLimits: number;
  readonly nearLimit: number;
}

export interface DashboardRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly date: string | null;
  readonly value: number;
  readonly percentage: number | null;
}

export interface CatalogDashboard {
  readonly kpis: CatalogDashboardKpis;
  readonly recentServices: readonly DashboardRow[];
  readonly mostUsedServices: readonly DashboardRow[];
  readonly expiringEntitlements: readonly DashboardRow[];
  readonly nearLimit: readonly DashboardRow[];
  readonly recentEntitlements: readonly DashboardRow[];
  readonly requestsByType: readonly { readonly label: string; readonly value: number }[];
  readonly usageByCustomer: readonly { readonly id: string; readonly label: string; readonly value: number }[];
  readonly servicesByCategory: readonly { readonly label: string; readonly value: number }[];
}
