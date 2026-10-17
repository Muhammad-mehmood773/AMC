/** SRS 5.4 dashboard filters; empty means "no restriction". */
export interface ContractDashboardFilters {
  readonly companies: readonly string[];
  readonly branches: readonly string[];
  readonly customers: readonly string[];
  readonly types: readonly string[];
  readonly statuses: readonly string[];
  readonly managers: readonly string[];
  readonly accountManagers: readonly string[];
  readonly start: { readonly from: string; readonly to: string };
  readonly end: { readonly from: string; readonly to: string };
  readonly renewal: { readonly from: string; readonly to: string };
  readonly minValue: number | null;
  readonly maxValue: number | null;
}

export interface ContractDashboardKpis {
  readonly total: number;
  readonly draft: number;
  readonly underReview: number;
  readonly pendingApproval: number;
  readonly pendingSignature: number;
  readonly active: number;
  readonly expiring: number;
  readonly expired: number;
  readonly terminated: number;
  readonly renewed: number;
  readonly withOutstandingObligations: number;
  readonly withSlaBreaches: number;
  readonly withOpenAmendments: number;
  readonly totalValue: number;
  readonly activeValue: number;
  readonly currency: string;
}

export interface ContractRow {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly date: string | null;
  readonly value: number;
  readonly currency: string;
}

export interface ContractDashboard {
  readonly kpis: ContractDashboardKpis;
  readonly expiringSoon: readonly ContractRow[];
  readonly pendingApproval: readonly ContractRow[];
  readonly pendingSignature: readonly ContractRow[];
  readonly recentlyCreated: readonly ContractRow[];
  readonly recentlyRenewed: readonly ContractRow[];
  readonly recentlyAmended: readonly ContractRow[];
  readonly obligationsDue: readonly ContractRow[];
  readonly upcomingRenewals: readonly ContractRow[];
  readonly valueByCustomer: readonly { readonly id: string; readonly label: string; readonly value: number }[];
  readonly valueByType: readonly { readonly label: string; readonly value: number }[];
  readonly statusDistribution: readonly { readonly label: string; readonly value: number }[];
}
