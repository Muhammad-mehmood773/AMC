import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { provideCatalogData } from './data/provide-catalog-data';

/** SRS 04 — Service Catalog & Entitlements. */
export const CATALOG_ROUTES: Routes = [
  {
    path: '',
    providers: [provideCatalogData()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Service Catalog Dashboard', loadComponent: () => import('./pages/catalog-dashboard.page').then((m) => m.CatalogDashboardPage) },
      { path: 'services', title: 'Service Catalog', loadComponent: () => import('./pages/service-list.page').then((m) => m.ServiceListPage) },
      { path: 'services/new', title: 'New Service', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/service-form/service-form.page').then((m) => m.ServiceFormPage) },
      { path: 'services/:serviceId', title: 'Service Details', loadComponent: () => import('./pages/service-detail.page').then((m) => m.ServiceDetailPage) },
      { path: 'services/:serviceId/edit', title: 'Edit Service', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/service-form/service-form.page').then((m) => m.ServiceFormPage) },
      { path: 'categories', title: 'Service Categories', loadComponent: () => import('./pages/categories.page').then((m) => m.CategoriesPage) },
      { path: 'pricing', title: 'Service Pricing & Commercial Rules', loadComponent: () => import('./pages/pricing.page').then((m) => m.PricingPage) },
      { path: 'entitlements', title: 'Entitlements', loadComponent: () => import('./pages/entitlement-list.page').then((m) => m.EntitlementListPage) },
      { path: 'entitlements/new', title: 'New Entitlement', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/entitlement-form/entitlement-form.page').then((m) => m.EntitlementFormPage) },
      { path: 'entitlements/:entitlementId', title: 'Entitlement 360', loadComponent: () => import('./pages/entitlement-detail.page').then((m) => m.EntitlementDetailPage) },
      { path: 'entitlements/:entitlementId/edit', title: 'Edit Entitlement', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/entitlement-form/entitlement-form.page').then((m) => m.EntitlementFormPage) },
      { path: 'history', title: 'Service / Entitlement History', loadComponent: () => import('./pages/catalog-history.page').then((m) => m.CatalogHistoryPage) },
    ],
  },
];
