import type { IconName } from '@shared/ui/icon';

export interface NavItem {
  readonly label: string;
  readonly icon: IconName;
  readonly path: string;
  /** URL pattern that marks the item active (defaults to prefix match on `path`). */
  readonly match?: RegExp;
}

export interface NavSection {
  readonly label: string;
  readonly icon: IconName;
  readonly items: readonly NavItem[];
}

const CUSTOMER_RESERVED = 'dashboard|contacts|sites|documents|history';
const CONTRACT_RESERVED = 'dashboard|requests|templates|clauses|review|approvals|execution|obligations|amendments|renewals|terminations|history';
const PM_RESERVED = 'dashboard|strategy|schedule|calendar|checklists|tasks|meters|work-orders|dispatch|due|performance';
const SR_RESERVED = 'dashboard|identification|classification|coverage|sla|assignment|scheduling|communication|escalations|resolution|history|performance';
const SLA_RESERVED = 'dashboard|targets|coverage|calendars|escalations|mapping|monitoring|breaches|performance';
const AMC_RESERVED = 'dashboard|coverage|service-plan|schedule|visits|consumption|billing|suspensions|history';
const ASSET_RESERVED = 'dashboard|hierarchy|installations|transfers|warranties|entitlements|documents|service-history|lifecycle';

/**
 * Application navigation. Each business module contributes its own section as it is delivered.
 */
export const APP_NAVIGATION: readonly NavSection[] = [
  {
    label: 'Customers & Sites',
    icon: 'building',
    items: [
      { label: 'Dashboard', icon: 'layout-dashboard', path: '/app/customers/dashboard' },
      {
        label: 'Customers',
        icon: 'building',
        path: '/app/customers/list',
        match: new RegExp(`^/app/customers/(list|new|(?!(${CUSTOMER_RESERVED})(/|$|\\?))[^/?]+)`),
      },
      { label: 'Contacts', icon: 'book-user', path: '/app/customers/contacts' },
      { label: 'Sites', icon: 'map-pin', path: '/app/customers/sites' },
      { label: 'Documents', icon: 'file-text', path: '/app/customers/documents' },
      { label: 'History', icon: 'history', path: '/app/customers/history' },
    ],
  },
  {
    label: 'Assets & Installed Base',
    icon: 'box',
    items: [
      { label: 'Dashboard', icon: 'layout-dashboard', path: '/app/assets/dashboard' },
      {
        label: 'Assets',
        icon: 'box',
        path: '/app/assets/list',
        match: new RegExp(`^/app/assets/(list|new|(?!(${ASSET_RESERVED})(/|$|\\?))[^/?]+)`),
      },
      { label: 'Hierarchy', icon: 'layers', path: '/app/assets/hierarchy' },
      { label: 'Installations', icon: 'wrench', path: '/app/assets/installations' },
      { label: 'Transfers', icon: 'arrow-right', path: '/app/assets/transfers' },
      { label: 'Warranties', icon: 'shield-check', path: '/app/assets/warranties' },
      { label: 'Entitlements', icon: 'file-check', path: '/app/assets/entitlements' },
      { label: 'Documents', icon: 'file-text', path: '/app/assets/documents' },
      { label: 'Service History', icon: 'clipboard-list', path: '/app/assets/service-history' },
      { label: 'Lifecycle', icon: 'history', path: '/app/assets/lifecycle' },
    ],
  },
  {
    label: 'Service Catalog & Entitlements',
    icon: 'tag',
    items: [
      { label: 'Dashboard', icon: 'layout-dashboard', path: '/app/catalog/dashboard' },
      { label: 'Services', icon: 'list', path: '/app/catalog/services' },
      { label: 'Categories', icon: 'tag', path: '/app/catalog/categories' },
      { label: 'Pricing', icon: 'receipt', path: '/app/catalog/pricing' },
      { label: 'Entitlements', icon: 'shield-check', path: '/app/catalog/entitlements' },
      { label: 'History', icon: 'history', path: '/app/catalog/history' },
    ],
  },
  {
    label: 'Contract Lifecycle',
    icon: 'file-text',
    items: [
      { label: 'Dashboard', icon: 'layout-dashboard', path: '/app/contracts/dashboard' },
      {
        label: 'Contracts',
        icon: 'file-text',
        path: '/app/contracts/list',
        match: new RegExp(`^/app/contracts/(list|new|(?!(${CONTRACT_RESERVED})(/|$|\\?))[^/?]+)`),
      },
      { label: 'Requests', icon: 'inbox', path: '/app/contracts/requests' },
      { label: 'Templates', icon: 'file-check', path: '/app/contracts/templates' },
      { label: 'Clauses', icon: 'align-justify', path: '/app/contracts/clauses' },
      { label: 'Review & Negotiation', icon: 'users', path: '/app/contracts/review' },
      { label: 'Approvals', icon: 'check-circle', path: '/app/contracts/approvals' },
      { label: 'E-Signature', icon: 'pen-tool', path: '/app/contracts/execution' },
      { label: 'Obligations', icon: 'clipboard-list', path: '/app/contracts/obligations' },
      { label: 'Amendments', icon: 'layers', path: '/app/contracts/amendments' },
      { label: 'Renewals', icon: 'refresh', path: '/app/contracts/renewals' },
      { label: 'Terminations', icon: 'ban', path: '/app/contracts/terminations' },
      { label: 'History & Audit', icon: 'history', path: '/app/contracts/history' },
    ],
  },
  {
    label: 'AMC / Service Contracts',
    icon: 'shield-check',
    items: [
      { label: 'Dashboard', icon: 'layout-dashboard', path: '/app/amc-agreements/dashboard' },
      {
        label: 'AMCs',
        icon: 'shield-check',
        path: '/app/amc-agreements/list',
        match: new RegExp(`^/app/amc-agreements/(list|new|(?!(${AMC_RESERVED})(/|$|\\?))[^/?]+)`),
      },
      { label: 'Coverage', icon: 'layers', path: '/app/amc-agreements/coverage' },
      { label: 'Service Plan', icon: 'clipboard-list', path: '/app/amc-agreements/service-plan' },
      { label: 'PM Schedule', icon: 'calendar-check', path: '/app/amc-agreements/schedule' },
      { label: 'Visit Plan', icon: 'calendar', path: '/app/amc-agreements/visits' },
      { label: 'Consumption', icon: 'activity', path: '/app/amc-agreements/consumption' },
      { label: 'Billing Schedule', icon: 'receipt', path: '/app/amc-agreements/billing' },
      { label: 'Suspension / Termination', icon: 'pause', path: '/app/amc-agreements/suspensions' },
      { label: 'History & Audit', icon: 'history', path: '/app/amc-agreements/history' },
    ],
  },
  {
    label: 'SLA Management',
    icon: 'clock',
    items: [
      { label: 'Dashboard', icon: 'layout-dashboard', path: '/app/sla/dashboard' },
      {
        label: 'SLAs',
        icon: 'clock',
        path: '/app/sla/list',
        match: new RegExp(`^/app/sla/(list|new|(?!(${SLA_RESERVED})(/|$|\\?))[^/?]+)`),
      },
      { label: 'Targets', icon: 'layers', path: '/app/sla/targets' },
      { label: 'Coverage', icon: 'shield-check', path: '/app/sla/coverage' },
      { label: 'Calendars', icon: 'calendar', path: '/app/sla/calendars' },
      { label: 'Escalation Rules', icon: 'alert-triangle', path: '/app/sla/escalations' },
      { label: 'Assignment / Mapping', icon: 'link', path: '/app/sla/mapping' },
      { label: 'Monitoring', icon: 'activity', path: '/app/sla/monitoring' },
      { label: 'Breaches', icon: 'alert-circle', path: '/app/sla/breaches' },
      { label: 'Performance & History', icon: 'bar-chart', path: '/app/sla/performance' },
    ],
  },
  {
    label: 'Preventive Maintenance',
    icon: 'calendar-check',
    items: [
      { label: 'Dashboard', icon: 'layout-dashboard', path: '/app/preventive-maintenance/dashboard' },
      {
        label: 'Maintenance Plans',
        icon: 'calendar-check',
        path: '/app/preventive-maintenance/list',
        match: new RegExp(`^/app/preventive-maintenance/(list|new|(?!(${PM_RESERVED})(/|$|\\?))[^/?]+)`),
      },
      { label: 'Strategy & Frequency', icon: 'refresh', path: '/app/preventive-maintenance/strategy' },
      { label: 'Recurring Schedule', icon: 'calendar', path: '/app/preventive-maintenance/schedule' },
      { label: 'Calendar', icon: 'calendar', path: '/app/preventive-maintenance/calendar' },
      { label: 'Checklists', icon: 'clipboard-list', path: '/app/preventive-maintenance/checklists' },
      { label: 'Tasks & Procedures', icon: 'list', path: '/app/preventive-maintenance/tasks' },
      { label: 'Meter / Condition Rules', icon: 'activity', path: '/app/preventive-maintenance/meters' },
      { label: 'Work Order Generation', icon: 'wrench', path: '/app/preventive-maintenance/work-orders' },
      { label: 'Assignment & Dispatch', icon: 'user-check', path: '/app/preventive-maintenance/dispatch' },
      { label: 'Due / Overdue', icon: 'alert-circle', path: '/app/preventive-maintenance/due' },
      { label: 'History & Performance', icon: 'bar-chart', path: '/app/preventive-maintenance/performance' },
    ],
  },
  {
    label: 'Service Requests',
    icon: 'ticket',
    items: [
      { label: 'Dashboard', icon: 'layout-dashboard', path: '/app/service-requests/dashboard' },
      {
        label: 'Requests',
        icon: 'ticket',
        path: '/app/service-requests/list',
        match: new RegExp(`^/app/service-requests/(list|new|(?!(${SR_RESERVED})(/|$|\\?))[^/?]+)`),
      },
      { label: 'Identification', icon: 'search', path: '/app/service-requests/identification' },
      { label: 'Classification', icon: 'list', path: '/app/service-requests/classification' },
      { label: 'Coverage', icon: 'shield-check', path: '/app/service-requests/coverage' },
      { label: 'SLA & Priority', icon: 'clock', path: '/app/service-requests/sla' },
      { label: 'Assignment & Routing', icon: 'user-check', path: '/app/service-requests/assignment' },
      { label: 'Scheduling', icon: 'calendar-check', path: '/app/service-requests/scheduling' },
      { label: 'Communication', icon: 'inbox', path: '/app/service-requests/communication' },
      { label: 'Escalation', icon: 'alert-triangle', path: '/app/service-requests/escalations' },
      { label: 'Resolution & Closure', icon: 'check-circle', path: '/app/service-requests/resolution' },
      { label: 'History & Audit', icon: 'history', path: '/app/service-requests/history' },
      { label: 'Performance', icon: 'bar-chart', path: '/app/service-requests/performance' },
    ],
  },
];

export function isNavItemActive(item: NavItem, url: string): boolean {
  return item.match ? item.match.test(url) : url === item.path || url.startsWith(`${item.path}/`) || url.startsWith(`${item.path}?`);
}
