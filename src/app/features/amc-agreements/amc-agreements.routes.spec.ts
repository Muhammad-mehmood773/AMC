import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AMC_AGREEMENTS_ROUTES } from './amc-agreements.routes';
import { buildAmcSeed } from './data/mock/amc-seed';

/** Waits for simulated API latency and re-renders. */
async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
}

const seed = buildAmcSeed();
const ACTIVE = seed.amcs.find((a) => a.status === 'Active' && a.period.endDate > new Date().toISOString().slice(0, 10))!.id;

describe('AMC / Service Contract Management routes', { timeout: 30_000 }, () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'app/amc-agreements', children: AMC_AGREEMENTS_ROUTES }], withComponentInputBinding())],
    });
    harness = await RouterTestingHarness.create();
  });

  const text = () => (harness.routeNativeElement?.textContent ?? '').replace(/\s+/g, ' ');

  const cases: [string, string[]][] = [
    ['/app/amc-agreements/dashboard', ['AMC Dashboard', 'Total AMCs', 'Pending Activation', 'Upcoming PM Visits', 'Outstanding Amount', 'AMCs Expiring Soon', 'Assets Without Scheduled Maintenance', 'AMC Utilization']],
    ['/app/amc-agreements/list', ['AMC / Service Contracts', 'Visits Remaining', 'AMC Type']],
    ['/app/amc-agreements/new', ['New AMC', 'A. AMC identification', 'D. Coverage scope', 'G. Parts & consumables', 'K. Documents & notes', 'Save & Activate']],
    [`/app/amc-agreements/${ACTIVE}`, [ACTIVE, 'Covered Assets', 'Remaining Visits', 'Days Remaining', 'Operational performance', 'First-Time Fix Rate']],
    [`/app/amc-agreements/${ACTIVE}?tab=schedule`, ['Preventive maintenance events']],
    [`/app/amc-agreements/${ACTIVE}?tab=consumption`, ['Overall AMC utilization', 'Call-Outs']],
    [`/app/amc-agreements/${ACTIVE}?tab=revenue`, ['AMC Gross Margin', 'Collected Revenue']],
    [`/app/amc-agreements/${ACTIVE}?tab=history`, ['AMC Created']],
    [`/app/amc-agreements/${ACTIVE}/edit`, ['Edit AMC', 'I. Commercial information']],
    ['/app/amc-agreements/coverage', ['AMC Coverage', 'Validate Coverage', 'Coverage Type']],
    ['/app/amc-agreements/service-plan', ['AMC Service Plan', 'HVAC AMC', 'Frequency']],
    ['/app/amc-agreements/schedule', ['Preventive Maintenance Schedule', 'Overdue', 'Generate Schedule']],
    ['/app/amc-agreements/visits', ['AMC Service Visit Plan', 'Generate Visits', 'Technician']],
    ['/app/amc-agreements/consumption', ['AMC Consumption & Utilization', 'Overall AMC utilization', 'Usage History']],
    ['/app/amc-agreements/billing', ['AMC Billing Schedule', 'Ready for Billing', 'Net Amount']],
    ['/app/amc-agreements/suspensions', ['AMC Suspension / Termination', 'Terminate AMC']],
    ['/app/amc-agreements/history', ['AMC History & Audit', 'Showing']],
  ];

  for (const [url, expected] of cases) {
    it(`renders ${url.replace(ACTIVE, ':amcId')}`, async () => {
      await harness.navigateByUrl(url);
      await settle(harness);
      for (const fragment of expected) {
        expect(text()).toContain(fragment);
      }
    });
  }

  it('shows a not-found state for unknown AMCs', async () => {
    await harness.navigateByUrl('/app/amc-agreements/AMC-99999');
    await settle(harness);
    expect(text()).toContain('AMC not found');
  });
});
