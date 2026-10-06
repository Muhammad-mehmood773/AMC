import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AUTH_ROUTES } from '../auth/auth.routes';
import { CUSTOMERS_ROUTES } from './customers.routes';

/** Waits for simulated API latency and re-renders. */
async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
}

describe('Customer & Site Management routes', { timeout: 20_000 }, () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'app/customers', children: CUSTOMERS_ROUTES },
            { path: 'auth', children: AUTH_ROUTES },
            { path: 'error/:code', loadComponent: () => import('../errors/error-page').then((m) => m.ErrorPage) },
          ],
          withComponentInputBinding(),
        ),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  const text = () => (harness.routeNativeElement?.textContent ?? '').replace(/\s+/g, ' ');

  const cases: [string, string[]][] = [
    ['/app/customers/dashboard', ['Customer Dashboard', 'Total Customers', 'Expiring Contracts', 'Outstanding Customer Amounts']],
    ['/app/customers/list', ['Customers', 'Sahara Smart Offices', '1–10 of 28']],
    ['/app/customers/list?status=Inactive', ['Taif Rose Resorts', 'Customer Status:', 'Clear all', 'Import', 'Columns']],
    ['/app/customers/new', ['New Customer', 'Basic information', 'Primary address', 'Commercial information', 'Operational information']],
    ['/app/customers/CUS-00101', ['King Faisal Specialist Medical Group', 'Company profile', 'Outstanding Amount']],
    ['/app/customers/CUS-00101?tab=sites', ['KFSMG Main Hospital']],
    ['/app/customers/CUS-00101?tab=invoices', ['INV-']],
    ['/app/customers/CUS-00101?tab=activity', ['Showing', 'events', 'Filters']],
    ['/app/customers/CUS-00101/edit', ['Edit Customer', 'Legal & registration']],
    ['/app/customers/contacts', ['Contacts', 'Contact Name']],
    ['/app/customers/sites', ['Sites', 'Site Code', '1–10 of']],
    ['/app/customers/sites/new?customerId=CUS-00101', ['New Site', 'Site operations', 'Preferred Visit Days']],
    ['/app/customers/sites/SITE-0001', ['KFSMG Main Hospital', 'Site operations', 'Upcoming Maintenance']],
    ['/app/customers/sites/SITE-0001?tab=maintenance', ['Preventive Maintenance']],
    ['/app/customers/sites/SITE-0001/edit', ['Edit Site', 'Location information']],
    ['/app/customers/documents', ['Customer & Site Documents', 'Commercial Registration Certificate']],
    ['/app/customers/history', ['Customer & Site History']],
  ];

  for (const [url, expected] of cases) {
    it(`renders ${url}`, async () => {
      await harness.navigateByUrl(url);
      await settle(harness);
      for (const fragment of expected) {
        expect(text()).toContain(fragment);
      }
    });
  }

  it('renders auth and error pages', async () => {
    const h = harness;
    for (const [url, text] of [
      ['/auth/login', 'Demo account'],
      ['/auth/forgot-password', 'Send reset link'],
      ['/auth/reset-password', 'At least 8 characters'],
      ['/auth/session-expired', 'Your session has expired'],
      ['/auth/account-locked', 'Account locked'],
      ['/error/403', 'Access denied'],
      ['/error/503', 'Service unavailable'],
    ]) {
      await h.navigateByUrl(url);
      await settle(h);
      expect((h.routeNativeElement?.textContent ?? '').replace(/\s+/g, ' ')).toContain(text);
    }
  });

  it('shows a not-found state for unknown customers', async () => {
    await harness.navigateByUrl('/app/customers/CUS-99999');
    await settle(harness);
    expect(text()).toContain('Customer not found');
  });
});
