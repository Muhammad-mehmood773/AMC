import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buildPmSeed } from './data/mock/pm-seed';
import { PREVENTIVE_MAINTENANCE_ROUTES } from './preventive-maintenance.routes';

/** Waits for simulated API latency and re-renders. */
async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
}

describe('Preventive Maintenance routes', { timeout: 30_000 }, () => {
  let harness: RouterTestingHarness;
  const seed = buildPmSeed();
  const plan = seed.plans.find((p) => p.status === 'Active' && p.service.amcId)!;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'app/preventive-maintenance', children: PREVENTIVE_MAINTENANCE_ROUTES }], withComponentInputBinding())],
    });
    harness = await RouterTestingHarness.create();
  });

  const text = () => (harness.routeNativeElement?.textContent ?? '').replace(/\s+/g, ' ');
  const base = '/app/preventive-maintenance';

  const cases: [string, string[]][] = [
    [`${base}/dashboard`, ['Preventive Maintenance Dashboard', 'Total Maintenance Plans', 'Overdue Maintenance', 'Maintenance Compliance %', 'Maintenance Due Today', 'Assets Without Maintenance Plans', 'Maintenance Cost Trend']],
    [`${base}/list`, ['Maintenance Plans', 'Frequency', 'Next Due Date']],
    [`${base}/new`, ['New Maintenance Plan', 'A. Plan identification', 'F. Frequency', 'K. Work order automation', 'M. Documents & notes', 'Save & Activate']],
    [`${base}/${plan.id}`, [plan.number, 'Total Planned', 'Maintenance Compliance %', 'Plan summary']],
    [`${base}/${plan.id}?tab=schedule`, ['Every event keeps the rule']],
    [`${base}/${plan.id}?tab=checklist`, ['Manage checklists']],
    [`${base}/${plan.id}?tab=amc`, ['AMC Status']],
    [`${base}/${plan.id}?tab=cost`, ['Technician Labor', 'Total Maintenance Cost']],
    [`${base}/${plan.id}?tab=strategy`, ['Version history']],
    [`${base}/${plan.id}/edit`, ['Edit Maintenance Plan', 'G. Scheduling']],
    [`${base}/strategy`, ['Maintenance Strategy & Frequency', 'Recurrence preview', 'Grace Period']],
    [`${base}/schedule`, ['Recurring Maintenance Schedule', 'Generate Schedule', 'Scheduled Date']],
    [`${base}/calendar`, ['Maintenance Calendar', 'Conflict detection', 'Technician availability']],
    [`${base}/checklists`, ['Maintenance Checklists', 'HVAC Preventive Maintenance Checklist']],
    [`${base}/tasks`, ['Maintenance Tasks & Procedures', 'Task dependency', 'Safety isolation']],
    [`${base}/meters`, ['Meter / Condition-Based Rules', 'Operating Hours', 'Next Maintenance Reading']],
    [`${base}/work-orders`, ['Automatic Work Order Generation', 'Run Automation Now', 'Generated Work Orders']],
    [`${base}/dispatch`, ['Maintenance Assignment & Dispatch', 'Assignment rules', 'Assignment Status']],
    [`${base}/due`, ['Maintenance Due / Overdue', 'Severely Overdue', 'Overdue reasons']],
    [`${base}/performance`, ['Maintenance History & Performance', 'Performance metrics', 'Asset performance']],
  ];

  for (const [url, expected] of cases) {
    it(`renders ${url}`, async () => {
      await harness.navigateByUrl(url);
      await settle(harness);
      for (const fragment of expected) expect(text()).toContain(fragment);
    });
  }

  it('shows a not-found state for unknown plans', async () => {
    await harness.navigateByUrl(`${base}/PMP-99999`);
    await settle(harness);
    expect(text()).toContain('Maintenance plan not found');
  });
});
