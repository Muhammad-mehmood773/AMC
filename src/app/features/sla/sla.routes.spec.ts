import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SLA_ROUTES } from './sla.routes';

/** Waits for simulated API latency and re-renders. */
async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
}

describe('SLA Management routes', { timeout: 30_000 }, () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'app/sla', children: SLA_ROUTES }], withComponentInputBinding())],
    });
    harness = await RouterTestingHarness.create();
  });

  const text = () => (harness.routeNativeElement?.textContent ?? '').replace(/\s+/g, ' ');

  const cases: [string, string[]][] = [
    ['/app/sla/dashboard', ['SLA Dashboard', 'Total SLAs', 'Active SLA Clocks', 'Open Escalations', 'SLA Compliance %', 'SLA Breaches Today', 'SLA Performance by Technician Team', 'Resolution Time Trend']],
    ['/app/sla/list', ['SLAs', 'AMC SLA', 'Response Target']],
    ['/app/sla/new', ['New SLA', 'A. SLA identification', 'F. Response targets', 'H. Priority targets', 'J. Escalation', 'L. Documents & notes', 'Save & Activate']],
    ['/app/sla/SLA-PLT', ['SLA-PLT', 'Covered Customers', 'Active SLA Clocks', 'SLA Compliance %', 'SLA summary']],
    ['/app/sla/SLA-PLT?tab=targets', ['First Response', 'Resolution', 'Modify Targets']],
    ['/app/sla/SLA-PLT?tab=priorities', ['Critical', 'Response Target']],
    ['/app/sla/SLA-PLT?tab=calendar', ['24x7 Support', 'Sunday']],
    ['/app/sla/SLA-PLT?tab=performance', ['SLA performance', 'Version history']],
    ['/app/sla/SLA-PLT?tab=history', ['Showing', 'events']],
    ['/app/sla/SLA-SLV/edit', ['Edit SLA', 'I. Service hours']],
    ['/app/sla/targets', ['SLA Definition & Targets', 'Warning levels', 'Target Type']],
    ['/app/sla/coverage', ['SLA Coverage & Applicability', 'Check Applicability', 'Coverage Status']],
    ['/app/sla/calendars', ['SLA Calendar & Service Hours', 'KSA Business Hours', 'Time zone handling']],
    ['/app/sla/escalations', ['SLA Escalation Rules', 'Level 1', 'Triggered Escalations']],
    ['/app/sla/mapping', ['SLA Assignment / Mapping', 'SLA validation & selection', 'Assignment Priority']],
    ['/app/sla/monitoring', ['SLA Monitoring', 'Start SLA Clock', 'Breached (open)']],
    ['/app/sla/breaches', ['SLA Breach Management', 'Penalties / Credits', 'Breach Duration']],
    ['/app/sla/performance', ['SLA Performance & History', 'Performance metrics', 'Trend analysis', 'Compliance by dimension']],
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

  it('shows a not-found state for unknown SLAs', async () => {
    await harness.navigateByUrl('/app/sla/SLA-999999');
    await settle(harness);
    expect(text()).toContain('SLA not found');
  });
});
