import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { provideAmcData } from './data/provide-amc-data';

/** SRS 06 — AMC / Service Contract Management. */
export const AMC_AGREEMENTS_ROUTES: Routes = [
  {
    path: '',
    providers: [provideAmcData()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'AMC Dashboard', loadComponent: () => import('./pages/amc-dashboard.page').then((m) => m.AmcDashboardPage) },
      { path: 'list', title: 'AMC / Service Contracts', loadComponent: () => import('./pages/amc-list.page').then((m) => m.AmcListPage) },
      { path: 'new', title: 'New AMC', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/amc-form/amc-form.page').then((m) => m.AmcFormPage) },
      { path: 'coverage', title: 'AMC Coverage', loadComponent: () => import('./pages/coverage.page').then((m) => m.CoveragePage) },
      { path: 'service-plan', title: 'AMC Service Plan', loadComponent: () => import('./pages/service-plan.page').then((m) => m.ServicePlanPage) },
      { path: 'schedule', title: 'Preventive Maintenance Schedule', loadComponent: () => import('./pages/schedule.page').then((m) => m.SchedulePage) },
      { path: 'visits', title: 'AMC Service Visit Plan', loadComponent: () => import('./pages/visits.page').then((m) => m.VisitsPage) },
      { path: 'consumption', title: 'AMC Consumption & Utilization', loadComponent: () => import('./pages/consumption.page').then((m) => m.ConsumptionPage) },
      { path: 'billing', title: 'AMC Billing Schedule', loadComponent: () => import('./pages/billing.page').then((m) => m.BillingPage) },
      { path: 'suspensions', title: 'AMC Suspension / Termination', loadComponent: () => import('./pages/suspensions.page').then((m) => m.SuspensionsPage) },
      { path: 'history', title: 'AMC History & Audit', loadComponent: () => import('./pages/amc-history.page').then((m) => m.AmcHistoryPage) },
      { path: ':amcId', title: 'AMC 360', loadComponent: () => import('./pages/amc-detail/amc-detail.page').then((m) => m.AmcDetailPage) },
      { path: ':amcId/edit', title: 'Edit AMC', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/amc-form/amc-form.page').then((m) => m.AmcFormPage) },
    ],
  },
];
