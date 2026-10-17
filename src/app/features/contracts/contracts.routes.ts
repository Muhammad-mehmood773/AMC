import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { provideContractData } from './data/provide-contract-data';

/** SRS 05 — Contract Lifecycle Management. */
export const CONTRACTS_ROUTES: Routes = [
  {
    path: '',
    providers: [provideContractData()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Contract Dashboard', loadComponent: () => import('./pages/contract-dashboard.page').then((m) => m.ContractDashboardPage) },
      { path: 'list', title: 'Contracts', loadComponent: () => import('./pages/contract-list.page').then((m) => m.ContractListPage) },
      { path: 'requests', title: 'Contract Requests', loadComponent: () => import('./pages/contract-requests.page').then((m) => m.ContractRequestsPage) },
      { path: 'new', title: 'New Contract', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/contract-form/contract-form.page').then((m) => m.ContractFormPage) },
      { path: 'templates', title: 'Contract Templates', loadComponent: () => import('./pages/templates.page').then((m) => m.TemplatesPage) },
      { path: 'clauses', title: 'Contract Clauses', loadComponent: () => import('./pages/clauses.page').then((m) => m.ClausesPage) },
      { path: 'review', title: 'Contract Review & Negotiation', loadComponent: () => import('./pages/review.page').then((m) => m.ReviewPage) },
      { path: 'approvals', title: 'Contract Approval', loadComponent: () => import('./pages/approvals.page').then((m) => m.ApprovalsPage) },
      { path: 'execution', title: 'Contract Execution / E-Signature', loadComponent: () => import('./pages/execution.page').then((m) => m.ExecutionPage) },
      { path: 'obligations', title: 'Contract Obligations', loadComponent: () => import('./pages/obligations.page').then((m) => m.ObligationsPage) },
      { path: 'amendments', title: 'Contract Amendments', loadComponent: () => import('./pages/amendments.page').then((m) => m.AmendmentsPage) },
      { path: 'renewals', title: 'Contract Renewal / Extension', loadComponent: () => import('./pages/renewals.page').then((m) => m.RenewalsPage) },
      { path: 'terminations', title: 'Contract Termination', loadComponent: () => import('./pages/terminations.page').then((m) => m.TerminationsPage) },
      { path: 'history', title: 'Contract History & Audit', loadComponent: () => import('./pages/contract-history.page').then((m) => m.ContractHistoryPage) },
      { path: ':contractId', title: 'Contract 360', loadComponent: () => import('./pages/contract-detail/contract-detail.page').then((m) => m.ContractDetailPage) },
      { path: ':contractId/edit', title: 'Edit Contract', canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./pages/contract-form/contract-form.page').then((m) => m.ContractFormPage) },
    ],
  },
];
