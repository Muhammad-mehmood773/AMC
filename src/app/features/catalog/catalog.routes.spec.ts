import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CATALOG_ROUTES } from './catalog.routes';

/** Waits for simulated API latency and re-renders. */
async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
}

describe('Service Catalog & Entitlements routes', { timeout: 30_000 }, () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'app/catalog', children: CATALOG_ROUTES }], withComponentInputBinding())],
    });
    harness = await RouterTestingHarness.create();
  });

  const text = () => (harness.routeNativeElement?.textContent ?? '').replace(/\s+/g, ' ');

  const cases: [string, string[]][] = [
    ['/app/catalog/dashboard', ['Service Catalog Dashboard', 'Total Services', 'AMC-Eligible', 'Near Usage Limit', 'Most Used Services', 'Service Usage by Customer']],
    ['/app/catalog/services', ['Service Catalog', 'Service Name', '1–10 of']],
    ['/app/catalog/services?status=Inactive', ['Generator Fuel Polishing']],
    ['/app/catalog/services/new', ['New Service', 'A. Basic information', 'D. Maintenance information', 'G. SLA information', 'Save & Add Another']],
    ['/app/catalog/services/SVC-HVAC-PPM-Q', ['Chiller Quarterly PPM', 'Standard Price', 'Active Entitlements', 'Operational Requirements']],
    ['/app/catalog/services/SVC-HVAC-PPM-Q?tab=pricing', ['Pricing & commercial rules', 'Manage pricing']],
    ['/app/catalog/services/SVC-HVAC-PPM-Q?tab=history', ['Service Created']],
    ['/app/catalog/services/SVC-HVAC-PPM-Q/edit', ['Edit Service', 'F. Commercial information', 'Save & Duplicate']],
    ['/app/catalog/categories', ['Service Categories', 'HVAC Services', 'Chiller Services', 'Create Category']],
    ['/app/catalog/pricing', ['Service Pricing & Commercial Rules', 'Price simulator', 'Applies To']],
    ['/app/catalog/entitlements', ['Entitlements', 'Coverage Type', 'Validate Entitlement']],
    ['/app/catalog/entitlements?flag=near-limit', ['Near usage limit']],
    ['/app/catalog/entitlements/new', ['New Entitlement', 'A. Basic information', 'D. Usage limits', 'H. Exclusions', 'I. Commercial rules', 'Save & Activate']],
    ['/app/catalog/entitlements/ENT-00001', ['ENT-00001', 'Covered Services', 'Remaining Visits', 'Days Remaining', 'Entitlement summary']],
    ['/app/catalog/entitlements/ENT-00001?tab=usage', ['Usage management', 'Record Usage']],
    ['/app/catalog/entitlements/ENT-00001?tab=included', ['Labor', 'Call-out charges']],
    ['/app/catalog/entitlements/ENT-00001?tab=activity', ['Entitlement Created']],
    ['/app/catalog/entitlements/ENT-00001/edit', ['Edit Entitlement', 'G. SLA coverage']],
    ['/app/catalog/history', ['Service / Entitlement History', 'Showing']],
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

  it('shows not-found states for unknown records', async () => {
    await harness.navigateByUrl('/app/catalog/services/SVC-NOPE');
    await settle(harness);
    expect(text()).toContain('Service not found');
    await harness.navigateByUrl('/app/catalog/entitlements/ENT-99999');
    await settle(harness);
    expect(text()).toContain('Entitlement not found');
  });
});
