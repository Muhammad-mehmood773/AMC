import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ASSETS_ROUTES } from './assets.routes';

/** Waits for simulated API latency and re-renders. */
async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
}

describe('Asset / Installed Base routes', { timeout: 30_000 }, () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'app/assets', children: ASSETS_ROUTES }], withComponentInputBinding())],
    });
    harness = await RouterTestingHarness.create();
  });

  const text = () => (harness.routeNativeElement?.textContent ?? '').replace(/\s+/g, ' ');

  const cases: [string, string[]][] = [
    ['/app/assets/dashboard', ['Asset Dashboard', 'Total Assets', 'Under Warranty', 'Assets Requiring Attention', 'Recently Transferred Assets']],
    ['/app/assets/list', ['Assets', 'Asset Name', '1–10 of']],
    ['/app/assets/list?flag=breakdown', ['Under breakdown', 'Under Repair']],
    ['/app/assets/new', ['New Asset', 'A. Asset identification', 'E. Technical information', 'H. Ownership & financial information', 'Save & Install']],
    ['/app/assets/AST-00001', ['AST-00001', 'Asset Age', 'Warranty Remaining', 'Asset lifecycle', 'Identification']],
    ['/app/assets/AST-00001?tab=components', ['Add Component']],
    ['/app/assets/AST-00001?tab=location', ['Current location', 'Location history', 'Request Transfer']],
    ['/app/assets/AST-00001?tab=entitlements', ['Evaluate entitlement', 'Check Entitlement']],
    ['/app/assets/AST-00001?tab=costs', ['Purchase Cost', 'Service cost by year']],
    ['/app/assets/AST-00001?tab=activity', ['Asset Created', 'events']],
    ['/app/assets/AST-00001/edit', ['Edit Asset', 'F. Warranty information', 'G. Contract / service information']],
    ['/app/assets/hierarchy', ['Asset Hierarchy / Components', 'parent assets']],
    ['/app/assets/installations', ['Asset Installation / Commissioning', 'Schedule Installation']],
    ['/app/assets/transfers', ['Asset Transfer / Relocation', 'Request Transfer', 'Completed']],
    ['/app/assets/warranties', ['Asset Warranty Management', 'Expiring Soon', 'Add Warranty']],
    ['/app/assets/entitlements', ['Asset Contract / Entitlement View', 'Contract / AMC']],
    ['/app/assets/documents', ['Asset Documents', 'Upload Document', 'No Expiry']],
    ['/app/assets/service-history', ['Asset Service History', 'Service Visits', 'Parts Consumption']],
    ['/app/assets/lifecycle', ['Asset Lifecycle History', 'Showing']],
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

  it('shows a not-found state for unknown assets', async () => {
    await harness.navigateByUrl('/app/assets/AST-99999');
    await settle(harness);
    expect(text()).toContain('Asset not found');
  });
});
