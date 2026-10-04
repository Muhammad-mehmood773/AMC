import { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  {
    path: 'organization',
    loadChildren: () =>
      import('./organization/organization.routes').then((m) => m.ORGANIZATION_ROUTES),
  },
  {
    path: 'customers',
    loadChildren: () => import('./customers/customers.routes').then((m) => m.CUSTOMERS_ROUTES),
  },
  {
    path: 'assets',
    loadChildren: () => import('./assets/assets.routes').then((m) => m.ASSETS_ROUTES),
  },
  {
    path: 'catalog',
    loadChildren: () => import('./catalog/catalog.routes').then((m) => m.CATALOG_ROUTES),
  },
  {
    path: 'contracts',
    loadChildren: () => import('./contracts/contracts.routes').then((m) => m.CONTRACTS_ROUTES),
  },
  {
    path: 'amc-agreements',
    loadChildren: () =>
      import('./amc-agreements/amc-agreements.routes').then((m) => m.AMC_AGREEMENTS_ROUTES),
  },
  {
    path: 'sla',
    loadChildren: () => import('./sla/sla.routes').then((m) => m.SLA_ROUTES),
  },
  {
    path: 'preventive-maintenance',
    loadChildren: () =>
      import('./preventive-maintenance/preventive-maintenance.routes').then(
        (m) => m.PREVENTIVE_MAINTENANCE_ROUTES,
      ),
  },
  {
    path: 'service-requests',
    loadChildren: () =>
      import('./service-requests/service-requests.routes').then((m) => m.SERVICE_REQUESTS_ROUTES),
  },
  {
    path: 'work-orders',
    loadChildren: () =>
      import('./work-orders/work-orders.routes').then((m) => m.WORK_ORDERS_ROUTES),
  },
  {
    path: 'technicians',
    loadChildren: () =>
      import('./technicians/technicians.routes').then((m) => m.TECHNICIANS_ROUTES),
  },
  {
    path: 'parts',
    loadChildren: () => import('./parts/parts.routes').then((m) => m.PARTS_ROUTES),
  },
  {
    path: 'billing',
    loadChildren: () => import('./billing/billing.routes').then((m) => m.BILLING_ROUTES),
  },
  {
    path: 'renewals',
    loadChildren: () => import('./renewals/renewals.routes').then((m) => m.RENEWALS_ROUTES),
  },
  {
    path: 'profitability',
    loadChildren: () =>
      import('./profitability/profitability.routes').then((m) => m.PROFITABILITY_ROUTES),
  },
  {
    path: 'documents',
    loadChildren: () => import('./documents/documents.routes').then((m) => m.DOCUMENTS_ROUTES),
  },
  {
    path: 'notifications',
    loadChildren: () =>
      import('./notifications/notifications.routes').then((m) => m.NOTIFICATIONS_ROUTES),
  },
  {
    path: 'reports',
    loadChildren: () => import('./reports/reports.routes').then((m) => m.REPORTS_ROUTES),
  },
];
