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
  readonly items: readonly NavItem[];
}

const CUSTOMER_RESERVED = 'dashboard|contacts|sites|documents|history';
const ASSET_RESERVED = 'dashboard|hierarchy|installations|transfers|warranties|entitlements|documents|service-history|lifecycle';

/**
 * Application navigation. Each business module contributes its own section as it is delivered.
 */
export const APP_NAVIGATION: readonly NavSection[] = [
  {
    label: 'Customers & Sites',
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
];

export function isNavItemActive(item: NavItem, url: string): boolean {
  return item.match ? item.match.test(url) : url === item.path || url.startsWith(`${item.path}/`) || url.startsWith(`${item.path}?`);
}
