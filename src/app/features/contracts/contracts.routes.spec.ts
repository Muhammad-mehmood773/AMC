import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONTRACTS_ROUTES } from './contracts.routes';

/** Waits for simulated API latency and re-renders. */
async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
}

describe('Contract Lifecycle Management routes', { timeout: 30_000 }, () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'app/contracts', children: CONTRACTS_ROUTES }], withComponentInputBinding())],
    });
    harness = await RouterTestingHarness.create();
  });

  const text = () => (harness.routeNativeElement?.textContent ?? '').replace(/\s+/g, ' ');

  const cases: [string, string[]][] = [
    ['/app/contracts/dashboard', ['Contract Dashboard', 'Total Contracts', 'Pending Signature', 'Active Contract Value', 'Contracts Expiring Soon', 'Obligation Due Dates', 'Contract Value by Contract Type']],
    ['/app/contracts/list', ['Contracts', 'Contract Value', 'Approval Status', '1–10 of']],
    ['/app/contracts/requests', ['Contract Requests', 'Contract Request', 'Contract Creation', 'CRQ-']],
    ['/app/contracts/new', ['New Contract', 'A. Contract identification', 'C. Contract period', 'F. Financial information', 'H. Legal & compliance', 'Save & Submit for Review']],
    ['/app/contracts/CON-00100', ['CON-00100', 'Contract Value', 'Remaining Value', 'Days Remaining', 'Renewal Status', 'Contract summary']],
    ['/app/contracts/CON-00100?tab=versions', ['Version history', 'Compare versions', 'v1.0']],
    ['/app/contracts/CON-00100?tab=financials', ['Commercial tracking', 'Gross Margin', 'Recognized Revenue']],
    ['/app/contracts/CON-00100?tab=activity', ['Contract Created']],
    ['/app/contracts/CON-00100/edit', ['Edit Contract', 'E. Commercial information']],
    ['/app/contracts/templates', ['Contract Templates', 'AMC Standard Agreement', 'Arabic']],
    ['/app/contracts/clauses', ['Contract Clauses', 'Limitation of Liability', 'Mandatory']],
    ['/app/contracts/review', ['Contract Review & Negotiation', 'Contract workspace', 'Review Type']],
    ['/app/contracts/approvals', ['Contract Approval', 'Approval rules', 'Approval Level 1']],
    ['/app/contracts/execution', ['Contract Execution / E-Signature', 'Signature Status', 'Select a contract']],
    ['/app/contracts/obligations', ['Contract Obligations', 'Overdue', 'Due Date']],
    ['/app/contracts/amendments', ['Contract Amendments', 'Amendment Request', 'Commercial Impact']],
    ['/app/contracts/renewals', ['Contract Renewal / Extension', 'Renewal Pipeline', 'Days Remaining']],
    ['/app/contracts/terminations', ['Contract Termination', 'Termination Request', 'Settlement']],
    ['/app/contracts/history', ['Contract History & Audit', 'Notifications & alerts', 'Showing']],
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

  it('opens the review workspace for a contract under review', async () => {
    await harness.navigateByUrl('/app/contracts/review?contractId=CON-00100');
    await settle(harness);
    expect(text()).toContain('Version Comparison');
    expect(text()).toContain('Clause Comparison');
  });

  it('shows a not-found state for unknown contracts', async () => {
    await harness.navigateByUrl('/app/contracts/CON-99999');
    await settle(harness);
    expect(text()).toContain('Contract not found');
  });
});
