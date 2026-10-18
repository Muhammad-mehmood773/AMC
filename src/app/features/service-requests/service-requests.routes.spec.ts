import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buildSrSeed } from './data/mock/sr-seed';
import { SERVICE_REQUESTS_ROUTES } from './service-requests.routes';

/** Waits for simulated API latency and re-renders. */
async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
}

describe('Service Request routes', { timeout: 30_000 }, () => {
  let harness: RouterTestingHarness;
  const seed = buildSrSeed();
  const request = seed.requests.find((r) => r.status === 'In Progress') ?? seed.requests[0];
  const resolved = seed.requests.find((r) => r.status === 'Resolved') ?? request;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'app/service-requests', children: SERVICE_REQUESTS_ROUTES }], withComponentInputBinding())],
    });
    harness = await RouterTestingHarness.create();
  });

  const text = () => (harness.routeNativeElement?.textContent ?? '').replace(/\s+/g, ' ');
  const base = '/app/service-requests';

  const cases: [string, string[]][] = [
    [`${base}/dashboard`, ['Service Request Dashboard', 'Total Requests', 'Unassigned', 'SLA At Risk', 'First-Time Resolution', 'Requests by Priority']],
    [`${base}/list`, ['Service Requests', 'SLA Status', 'New Request']],
    [`${base}/new`, ['New Service Request', 'Request Type', 'Customer, Site & Asset', 'Create Request']],
    [`${base}/identification`, ['Customer / Site / Asset Identification', 'Identify a caller or asset']],
    [`${base}/classification`, ['Request Classification', 'Classification Rules', 'Routing Rules', 'Test Classification']],
    [`${base}/coverage`, ['Coverage Validation', 'Coverage']],
    [`${base}/sla`, ['SLA & Priority', 'Response', 'Resolution']],
    [`${base}/assignment`, ['Assignment & Routing', 'Team Workload', 'Technicians']],
    [`${base}/scheduling`, ['Scheduling', 'Technician day load']],
    [`${base}/communication`, ['Communication & Activity']],
    [`${base}/escalations`, ['Escalation', 'Automatic Triggers', 'Escalation Levels']],
    [`${base}/resolution`, ['Resolution & Closure', 'Confirmation']],
    [`${base}/history`, ['Request History & Audit']],
    [`${base}/performance`, ['Request Performance', 'First-Time Resolution', 'Volume by Customer', 'Root Causes']],
  ];

  for (const [url, expected] of cases) {
    it(`renders ${url}`, async () => {
      await harness.navigateByUrl(url);
      await settle(harness);
      for (const fragment of expected) expect(text()).toContain(fragment);
    });
  }

  it('renders Request 360 with tabs and KPIs', async () => {
    await harness.navigateByUrl(`${base}/${request.id}`);
    await settle(harness);
    for (const fragment of [request.number, request.subject, 'Response Clock', 'Resolution Clock', 'Request Details', 'Customer', 'Assignment']) {
      expect(text()).toContain(fragment);
    }
  });

  it('renders Request 360 tabs', async () => {
    for (const [tab, fragment] of [
      ['coverage', 'Validation steps'],
      ['sla', 'Why this priority'],
      ['resolution', 'Resolution'],
      ['history', 'Request Created'],
    ] as const) {
      await harness.navigateByUrl(`${base}/${request.id}?tab=${tab}`);
      await settle(harness);
      expect(text()).toContain(fragment);
    }
  });

  it('renders the resolved request resolution tab', async () => {
    await harness.navigateByUrl(`${base}/${resolved.id}?tab=resolution`);
    await settle(harness);
    expect(text()).toContain(resolved.resolution?.code ?? 'Resolution');
  });

  it('renders the edit form for an existing request', async () => {
    await harness.navigateByUrl(`${base}/${request.id}/edit`);
    await settle(harness);
    expect(text()).toContain('Edit Service Request');
  });

  it('shows an error state for unknown requests', async () => {
    await harness.navigateByUrl(`${base}/SR-99999`);
    await settle(harness);
    expect(text()).toContain('could not be loaded');
  });
});
