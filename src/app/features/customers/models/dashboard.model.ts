import type { CustomerStatus } from './customer.model';

/** Multi-value filters; empty arrays / dates mean "no restriction". Dates are yyyy-MM-dd. */
export interface DashboardFilters {
  readonly companies: readonly string[];
  readonly branches: readonly string[];
  readonly types: readonly string[];
  readonly statuses: readonly string[];
  readonly categories: readonly string[];
  readonly managers: readonly string[];
  readonly from: string;
  readonly to: string;
}

export interface DashboardKpis {
  readonly totalCustomers: number;
  readonly activeCustomers: number;
  readonly inactiveCustomers: number;
  readonly newCustomers: number;
  readonly withActiveContracts: number;
  readonly withExpiringContracts: number;
  readonly withActiveAmcs: number;
  readonly withOpenServiceRequests: number;
  readonly withOpenWorkOrders: number;
  readonly withOutstandingInvoices: number;
  readonly outstandingTotal: number;
}

export interface DashboardCustomerRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: string;
  readonly status: CustomerStatus;
  readonly createdAt: string;
}

export interface DashboardSiteRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly customerName: string;
  readonly city: string;
  readonly createdAt: string;
}

export interface DashboardExpiringRow {
  readonly id: string;
  readonly number: string;
  readonly kind: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly endDate: string;
  readonly daysLeft: number;
  readonly value: number;
}

export interface DashboardRequestRow {
  readonly id: string;
  readonly number: string;
  readonly subject: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly priority: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface DashboardMaintenanceRow {
  readonly id: string;
  readonly plan: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly customerName: string;
  readonly nextDue: string;
  readonly status: string;
}

export interface DashboardActivityRow {
  readonly id: string;
  readonly date: string;
  readonly visitType: string;
  readonly summary: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly siteName: string;
  readonly technician: string;
  readonly outcome: string;
}

export interface DashboardOutstandingRow {
  readonly customerId: string;
  readonly customerName: string;
  readonly amount: number;
  readonly overdue: number;
  readonly invoices: number;
}

export interface CustomerDashboard {
  readonly kpis: DashboardKpis;
  readonly recentCustomers: readonly DashboardCustomerRow[];
  readonly recentSites: readonly DashboardSiteRow[];
  readonly expiringContracts: readonly DashboardExpiringRow[];
  readonly openServiceRequests: readonly DashboardRequestRow[];
  readonly upcomingMaintenance: readonly DashboardMaintenanceRow[];
  readonly recentActivity: readonly DashboardActivityRow[];
  readonly outstanding: readonly DashboardOutstandingRow[];
}
