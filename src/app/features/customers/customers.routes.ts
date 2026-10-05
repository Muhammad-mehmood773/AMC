import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { CustomerSiteImports } from './data/import.service';
import { CustomerLookupsStore } from './data/lookups.store';
import { ModuleHandoff } from './data/module-handoff.service';
import { provideCustomerSiteData } from './data/provide-customer-site-data';

/** SRS 02 — Customer & Site Management. */
export const CUSTOMERS_ROUTES: Routes = [
  {
    path: '',
    providers: [provideCustomerSiteData(), CustomerLookupsStore, ModuleHandoff, CustomerSiteImports],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Customer Dashboard',
        loadComponent: () =>
          import('./pages/customer-dashboard/customer-dashboard.page').then(
            (m) => m.CustomerDashboardPage,
          ),
      },
      {
        path: 'list',
        title: 'Customers',
        loadComponent: () =>
          import('./pages/customer-list/customer-list.page').then((m) => m.CustomerListPage),
      },
      {
        path: 'new',
        title: 'New Customer',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./pages/customer-form/customer-form.page').then((m) => m.CustomerFormPage),
      },
      {
        path: 'contacts',
        title: 'Contacts',
        loadComponent: () =>
          import('./pages/contact-management/contact-management.page').then(
            (m) => m.ContactManagementPage,
          ),
      },
      {
        path: 'sites',
        children: [
          {
            path: '',
            title: 'Sites',
            loadComponent: () =>
              import('./pages/site-list/site-list.page').then((m) => m.SiteListPage),
          },
          {
            path: 'new',
            title: 'New Site',
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () =>
              import('./pages/site-form/site-form.page').then((m) => m.SiteFormPage),
          },
          {
            path: ':siteId',
            title: 'Site 360',
            loadComponent: () =>
              import('./pages/site-detail/site-detail.page').then((m) => m.SiteDetailPage),
          },
          {
            path: ':siteId/edit',
            title: 'Edit Site',
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () =>
              import('./pages/site-form/site-form.page').then((m) => m.SiteFormPage),
          },
        ],
      },
      {
        path: 'documents',
        title: 'Customer & Site Documents',
        loadComponent: () =>
          import('./pages/documents/documents.page').then((m) => m.DocumentsPage),
      },
      {
        path: 'history',
        title: 'Customer & Site History',
        loadComponent: () => import('./pages/history/history.page').then((m) => m.HistoryPage),
      },
      {
        path: ':customerId',
        title: 'Customer 360',
        loadComponent: () =>
          import('./pages/customer-detail/customer-detail.page').then(
            (m) => m.CustomerDetailPage,
          ),
      },
      {
        path: ':customerId/edit',
        title: 'Edit Customer',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./pages/customer-form/customer-form.page').then((m) => m.CustomerFormPage),
      },
    ],
  },
];
