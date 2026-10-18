import { buildAmcSeed } from '../../../amc-agreements/data/mock/amc-seed';
import { daysFromNow, pad, random } from '../../../customers/data/mock/mock-utils';
import { buildSeed } from '../../../customers/data/mock/seed';
import type { DayHours, EscalationRule, Holiday, SlaClock, SlaCoverage, SlaMapping, TargetType } from '../../models/operations.model';
import type { Priority, PriorityTarget, Sla } from '../../models/sla.model';
import { SLA_RULES } from '../sla.config';
import { addBusinessMinutes } from '../sla-time';
import { type SlaDatabase, calendar, resolveSla, syncTargets, targetFor, tick } from './sla-engine';

const day = (working: boolean, start = '08:00', end = '17:00'): DayHours => ({ working, start, end });
const WEEK_247 = Array.from({ length: 7 }, () => day(true, '00:00', '24:00'));
const KSA_BH = [day(true), day(true), day(true), day(true), day(true), day(false), day(false)];
const KSA_EXT = [day(true, '07:00', '22:00'), day(true, '07:00', '22:00'), day(true, '07:00', '22:00'), day(true, '07:00', '22:00'), day(true, '07:00', '22:00'), day(false), day(true, '08:00', '14:00')];
const UAE_BH = [day(false), day(true), day(true), day(true), day(true), day(true), day(false)];

const tiers = (critical: PriorityTarget, high: PriorityTarget, medium: PriorityTarget, low: PriorityTarget): Record<Priority, PriorityTarget> => ({ Critical: critical, High: high, Medium: medium, Low: low });
const h = (hours: number) => Math.round(hours * 60);

const SERVICE_FOR_ASSET: Record<string, string> = { HVAC: 'HVAC Services', Refrigeration: 'HVAC Services', 'Vertical Transport': 'Elevator Services', 'Fire & Safety': 'Fire & Safety Services', Power: 'Electrical Services', Plumbing: 'Plumbing Services' };

export function buildSlaSeed(now = Date.now()): SlaDatabase {
  const amcDb = buildAmcSeed();
  const base = buildSeed();
  const rng = random(20261207);
  const ref = amcDb.reference;
  const year = new Date(now).getUTCFullYear();
  const segmentOf = (slaId: string | null) => ({ 'SLA-PLT': 'Strategic', 'SLA-GLD': 'Enterprise', 'SLA-SLV': 'Standard', 'SLA-BRZ': 'SME' })[slaId ?? ''] ?? 'Standard';
  const managers = ref.users.filter((u) => u.role === 'Contract Manager');

  const db: SlaDatabase = {
    reference: {
      customers: ref.customers.map((c) => ({ id: c.id, name: c.name, code: c.code, legalName: c.legalName, status: c.status, segment: segmentOf(c.defaultSlaId), accountManagerId: c.accountManagerId, primaryContact: c.primaryContact, currency: c.currency, region: c.serviceRegion, defaultSlaId: c.defaultSlaId })),
      sites: ref.sites.map((s) => ({ id: s.id, name: s.name, customerId: s.customerId, city: s.city, region: s.region })),
      assets: ref.assets.map((a) => ({ id: a.id, name: a.name, customerId: a.customerId, siteId: a.siteId, category: a.category })),
      assetCategories: ref.assetCategories,
      services: ref.services.filter((s) => s.status === 'Active').map((s) => ({ id: s.id, name: s.name, code: s.code, category: s.category, type: s.type })),
      serviceCategories: ref.serviceCategories,
      serviceTypes: [...new Set(ref.services.map((s) => s.type))].sort(),
      contracts: ref.contracts.map((c) => {
        const amc = amcDb.amcs.find((a) => a.parentContractId === c.id);
        return { id: c.id, name: c.title, number: c.number, customerId: c.customerId, status: c.status, startDate: amc?.period.startDate ?? '', endDate: amc?.period.endDate ?? '' };
      }),
      amcs: amcDb.amcs.map((a) => ({ id: a.id, name: a.title, number: a.number, customerId: a.customer.customerId, contractId: a.parentContractId, status: a.status, siteIds: a.scope.siteIds, startDate: a.period.startDate, endDate: a.period.endDate })),
      users: [...ref.users, { id: 'USR-50', name: 'Khalid Al-Mutairi', role: 'Service Supervisor' }, { id: 'USR-51', name: 'Sara Al-Qahtani', role: 'Service Manager' }],
      teams: ['HVAC Team', 'Electrical Team', 'Mechanical Team', 'Fire & Safety Team', 'ELV & Security Team', 'Multi-Skill Team', 'Service Desk'],
      technicians: ref.technicians.map((t) => ({ id: t.id, name: t.name, team: t.team, region: t.region })),
      regions: ref.serviceRegions,
      currencies: ref.currencies,
      currentUser: { id: 'USR-11', name: 'Hessa Al-Dossary', role: 'Service Manager' },
    },
    slas: [], versions: [], targets: [], coverage: [], mappings: [], rules: [], events: [], clocks: [], breaches: [], history: [], processed: new Set(),
    calendars: [
      { id: 'CAL-247', name: '24x7 Support', type: '24x7', timeZone: 'Asia/Riyadh', days: WEEK_247, breakStart: null, breakEnd: null, weekendRules: 'Weekends and holidays are working time.', holidayCalendar: 'None', effectiveDate: '2024-01-01', status: 'Active', customerId: null },
      { id: 'CAL-KSA-BH', name: 'KSA Business Hours', type: 'Business Hours', timeZone: 'Asia/Riyadh', days: KSA_BH, breakStart: '12:00', breakEnd: '13:00', weekendRules: 'Friday and Saturday are non-working.', holidayCalendar: 'KSA Public Holidays', effectiveDate: '2024-01-01', status: 'Active', customerId: null },
      { id: 'CAL-KSA-EXT', name: 'KSA Extended Hours', type: 'Extended Business Hours', timeZone: 'Asia/Riyadh', days: KSA_EXT, breakStart: null, breakEnd: null, weekendRules: 'Saturday half day; Friday non-working.', holidayCalendar: 'KSA Public Holidays', effectiveDate: '2024-01-01', status: 'Active', customerId: null },
      { id: 'CAL-UAE-BH', name: 'UAE Business Hours', type: 'Business Hours', timeZone: 'Asia/Dubai', days: UAE_BH, breakStart: null, breakEnd: null, weekendRules: 'Saturday and Sunday are non-working.', holidayCalendar: 'UAE Public Holidays', effectiveDate: '2024-01-01', status: 'Active', customerId: null },
    ],
    holidays: [],
  };
  let seq = 1;
  const uid = (p: string) => `${p}-${pad(seq++, 6)}`;
  const holidays: Omit<Holiday, 'id'>[] = [];
  for (const y of [year - 1, year, year + 1]) {
    holidays.push(
      { name: 'Founding Day', date: `${y}-02-22`, type: 'Public Holiday', country: 'Saudi Arabia', region: 'All', siteId: null, calendar: 'KSA Public Holidays', working: false, overrideAllowed: false },
      { name: 'Saudi National Day', date: `${y}-09-23`, type: 'Public Holiday', country: 'Saudi Arabia', region: 'All', siteId: null, calendar: 'KSA Public Holidays', working: false, overrideAllowed: false },
      { name: 'UAE National Day', date: `${y}-12-02`, type: 'Public Holiday', country: 'United Arab Emirates', region: 'All', siteId: null, calendar: 'UAE Public Holidays', working: false, overrideAllowed: false },
      { name: 'Company Annual Day', date: `${y}-01-15`, type: 'Company Holiday', country: 'Saudi Arabia', region: 'All', siteId: null, calendar: 'Company Holidays', working: true, overrideAllowed: true },
    );
  }
  holidays.push(
    { name: 'Eid al-Fitr (approx.)', date: `${year}-03-20`, type: 'Religious Holiday', country: 'Saudi Arabia', region: 'All', siteId: null, calendar: 'KSA Public Holidays', working: false, overrideAllowed: true },
    { name: 'Eid al-Adha (approx.)', date: `${year}-05-27`, type: 'Religious Holiday', country: 'Saudi Arabia', region: 'All', siteId: null, calendar: 'KSA Public Holidays', working: false, overrideAllowed: true },
  );
  db.holidays = holidays.map((x) => ({ ...x, id: uid('HOL') }));

  const log = (timestamp: string, action: SlaDatabase['history'][number]['action'], entity: SlaDatabase['history'][number]['entity'], entityId: string, slaId: string | null, comments: string, previousValue: string | null = null, newValue: string | null = null, user?: string, reference: string | null = null) =>
    db.history.push({ id: uid('SH'), timestamp, user: user ?? rng.pick(managers).name, action, entity, entityId, slaId, label: slaId ?? entityId, previousValue, newValue, reference, comments });

  const make = (p: Partial<Sla> & Pick<Sla, 'id' | 'number' | 'name' | 'type' | 'priorityTargets'>, calendarId: string, status: Sla['status'] = 'Active'): Sla => {
    const s: Sla = {
      description: '', status, approval: ['Active', 'Expiring Soon', 'Suspended', 'Expired', 'Renewed', 'Approved', 'Pending Activation'].includes(status) ? 'Approved' : status === 'Pending Approval' ? 'Pending' : 'Not Submitted', version: status === 'Draft' ? '1.0' : '2.0',
      parentSlaId: null, previousSlaId: null, externalReference: '',
      customer: { customerId: null, legalEntity: '', segment: 'Standard', accountManagerId: null, contractManagerId: rng.pick(managers).id, primaryContact: '' },
      contract: { contractId: null, amcId: null, contractLine: '', contractStart: null, contractEnd: null },
      validity: { effectiveDate: '2024-01-01', expiryDate: null, renewalDate: null, noticePeriodDays: 30, autoRenewal: false, renewalTermMonths: 12 },
      scope: { serviceIds: [], serviceCategories: [], serviceTypes: [], servicePriority: null, requestTypes: ['Breakdown', 'Emergency', 'Service Request'], workOrderTypes: ['Corrective'] },
      response: { firstResponse: p.priorityTargets.Medium.response, acknowledgement: 15, assignment: Math.round(p.priorityTargets.Medium.response / 2), onSiteArrival: Math.round(p.priorityTargets.Medium.response * 1.5), unit: 'Hours', calendarId },
      resolution: { resolution: p.priorityTargets.Medium.resolution, restoration: Math.round(p.priorityTargets.Medium.resolution * 0.6), closure: Math.round(p.priorityTargets.Medium.resolution * 1.5), unit: 'Hours', calendarId },
      serviceHours: { calendarId, mode: calendarId === 'CAL-247' ? '24x7' : calendarId === 'CAL-KSA-EXT' ? 'Extended Business Hours' : 'Business Hours', afterHoursSupport: calendarId === 'CAL-247', holidayCalendar: calendar(db, calendarId).holidayCalendar, weekendRules: calendar(db, calendarId).weekendRules },
      escalation: { policy: 'Standard', first: 'Service Supervisor', second: 'Service Manager', management: 'Operations Director', percentage: SLA_RULES.escalationPercent, timeMinutes: null, recipients: 'service.desk@gfs.sa' },
      commercial: { value: 0, currency: 'SAR', billingImpact: 'None', penaltyApplicable: false, serviceCreditApplicable: false, penaltyRules: '', serviceCreditRules: '', penaltyPercent: 0, penaltyCapPercent: 0 },
      notes: { internal: '', customer: '' }, documents: [],
      createdAt: '2024-01-02T09:00:00.000Z', createdBy: rng.pick(managers).name, updatedAt: null, updatedBy: null,
      ...p,
    };
    db.slas.push(s);
    db.versions.push({ slaId: s.id, version: '1.0', createdAt: s.createdAt, createdBy: s.createdBy, summary: 'Initial version.', snapshot: s.priorityTargets });
    if (s.version === '2.0') db.versions.push({ slaId: s.id, version: '2.0', createdAt: daysFromNow(-rng.int(30, 200)), createdBy: s.createdBy, summary: 'Targets reviewed with customer.', snapshot: s.priorityTargets });
    syncTargets(db, s, () => uid('TGT'));
    log(s.createdAt, 'SLA Created', 'SLA', s.id, s.id, `${s.type} created.`, null, s.name, s.createdBy);
    if (s.approval === 'Approved') log(daysFromNow(-rng.int(200, 600)), 'SLA Activated', 'SLA', s.id, s.id, 'Activated.', 'Approved', 'Active', s.createdBy);
    return s;
  };

  const rule = (slaId: string, level: number, triggerType: EscalationRule['triggerType'], pct: number, recipient: string, team: string, channel: string, action: string, targetType: EscalationRule['targetType'] = 'Any') =>
    db.rules.push({ id: uid('ER'), slaId, level, triggerType, triggerPercent: pct, triggerMinutes: null, targetType, recipient, team, channel, action, status: 'Active' });
  const standardRules = (slaId: string, full: boolean) => {
    rule(slaId, 1, 'Before SLA Breach', 75, 'Assigned Technician', 'Service Desk', 'In-App Notification', 'Notify Technician');
    rule(slaId, 2, 'Before SLA Breach', 90, 'Khalid Al-Mutairi', 'Service Desk', 'Email', 'Notify Supervisor');
    rule(slaId, 3, 'After SLA Breach', 110, 'Sara Al-Qahtani', 'Service Desk', 'SMS', 'Notify Service Manager');
    if (full) {
      rule(slaId, 4, 'After SLA Breach', 150, 'Account Manager', 'Commercial', 'Email', 'Notify Customer');
      rule(slaId, 5, 'After SLA Breach', 200, 'Abdullah Al-Faisal', 'Management', 'Internal Alert', 'Trigger Management Review');
    }
  };
  const cover = (slaId: string, c: Partial<SlaCoverage> & Pick<SlaCoverage, 'level'>) => db.coverage.push({ id: uid('SCV'), slaId, customerId: null, contractId: null, amcId: null, siteId: null, assetId: null, assetCategory: null, serviceId: null, serviceCategory: null, priority: null, startDate: '2024-01-01', endDate: null, status: 'Active', ...c });
  const map = (slaId: string, m: Partial<SlaMapping> & Pick<SlaMapping, 'level' | 'assignmentPriority'>) => db.mappings.push({ id: uid('MAP'), slaId, customerId: null, contractId: null, amcId: null, siteId: null, assetId: null, serviceId: null, serviceCategory: null, priority: null, effectiveDate: '2024-01-01', expiryDate: null, status: 'Active', ...m });

  // Standard tiers (same ids as the customer master data SLAs).
  const std: [string, string, string, string, Record<Priority, PriorityTarget>, string, number][] = [
    ['SLA-PLT', 'Platinum 24/7', 'Premium Support SLA', 'Round-the-clock support for strategic customers.', tiers({ response: h(1), resolution: h(4) }, { response: h(1.5), resolution: h(6) }, { response: h(2), resolution: h(8) }, { response: h(4), resolution: h(24) }), 'CAL-247', 480_000],
    ['SLA-GLD', 'Gold', 'Standard Support SLA', 'Extended-hours support for enterprise customers.', tiers({ response: h(2), resolution: h(8) }, { response: h(3), resolution: h(16) }, { response: h(4), resolution: h(24) }, { response: h(8), resolution: h(48) }), 'CAL-KSA-EXT', 240_000],
    ['SLA-SLV', 'Silver', 'Business Hours SLA', 'Business-hours support.', tiers({ response: h(4), resolution: h(16) }, { response: h(6), resolution: h(32) }, { response: h(8), resolution: h(48) }, { response: h(16), resolution: h(72) }), 'CAL-KSA-BH', 120_000],
    ['SLA-BRZ', 'Bronze', 'Business Hours SLA', 'Basic business-hours support.', tiers({ response: h(8), resolution: h(24) }, { response: h(16), resolution: h(48) }, { response: h(24), resolution: h(72) }, { response: h(40), resolution: h(120) }), 'CAL-KSA-BH', 60_000],
  ];
  for (const [id, name, type, description, targets, cal, value] of std) {
    make({ id, number: id, name, type, description, priorityTargets: targets, commercial: { value, currency: 'SAR', billingImpact: id === 'SLA-PLT' ? 'Service Credit' : 'None', penaltyApplicable: false, serviceCreditApplicable: id === 'SLA-PLT', penaltyRules: '', serviceCreditRules: id === 'SLA-PLT' ? '2% of the monthly fee per breach, capped at 10%.' : '', penaltyPercent: id === 'SLA-PLT' ? 2 : 0, penaltyCapPercent: id === 'SLA-PLT' ? 10 : 0 } }, cal);
    standardRules(id, id === 'SLA-PLT');
    cover(id, { level: 'Customer' });
  }
  // Previous Gold version — renewed, history preserved.
  const oldGold = make({ id: 'SLA-GLD-2023', number: 'SLA-GLD-2023', name: 'Gold (2023)', type: 'Standard Support SLA', priorityTargets: tiers({ response: h(3), resolution: h(10) }, { response: h(4), resolution: h(20) }, { response: h(6), resolution: h(30) }, { response: h(10), resolution: h(56) }), validity: { effectiveDate: '2023-01-01', expiryDate: '2023-12-31', renewalDate: '2023-11-01', noticePeriodDays: 30, autoRenewal: false, renewalTermMonths: 12 } }, 'CAL-KSA-EXT', 'Renewed');
  db.slas = db.slas.map((s) => (s.id === 'SLA-GLD' ? { ...s, previousSlaId: oldGold.id } : s));
  log('2023-12-20T10:00:00.000Z', 'SLA Renewed', 'SLA', oldGold.id, oldGold.id, 'Renewed as SLA-GLD with tighter targets.', 'Gold (2023)', 'SLA-GLD');

  for (const c of db.reference.customers) {
    if (!c.defaultSlaId) continue;
    map(c.defaultSlaId, { level: 'Customer', customerId: c.id, assignmentPriority: 50 });
  }

  // AMC SLAs for active AMCs.
  let amcSeq = 1;
  for (const a of amcDb.amcs.filter((x) => x.status === 'Active').slice(0, 8)) {
    const respH = a.sla.responseHours ?? 4;
    const resoH = a.sla.resolutionHours ?? 24;
    const id = `SLA-A-${pad(amcSeq++, 3)}`;
    const cust = db.reference.customers.find((c) => c.id === a.customer.customerId)!;
    const cal = a.sla.serviceHours === '24/7' ? 'CAL-247' : 'CAL-KSA-BH';
    const status = amcSeq === 5 ? 'Suspended' : 'Active';
    make({
      id, number: id, name: `${a.title} SLA`, type: 'AMC SLA', description: `Service levels of ${a.number}.`, parentSlaId: cust.defaultSlaId,
      customer: { customerId: cust.id, legalEntity: cust.legalName, segment: cust.segment, accountManagerId: cust.accountManagerId, contractManagerId: a.customer.contractManagerId, primaryContact: cust.primaryContact },
      contract: { contractId: a.parentContractId, amcId: a.id, contractLine: 'Corrective & emergency service', contractStart: a.period.startDate, contractEnd: a.period.endDate },
      validity: { effectiveDate: a.period.startDate, expiryDate: a.period.endDate, renewalDate: a.period.renewalDate, noticePeriodDays: a.period.noticePeriodDays, autoRenewal: a.period.autoRenewal, renewalTermMonths: a.period.renewalTermMonths },
      priorityTargets: tiers({ response: h(Math.max(0.5, respH / 2)), resolution: h(resoH / 2) }, { response: h(respH * 0.75), resolution: h(resoH * 0.75) }, { response: h(respH), resolution: h(resoH) }, { response: h(respH * 2), resolution: h(resoH * 2) }),
      scope: { serviceIds: a.scope.serviceIds, serviceCategories: a.scope.serviceCategories, serviceTypes: [], servicePriority: null, requestTypes: ['Breakdown', 'Emergency', 'Service Request'], workOrderTypes: ['Corrective', 'Preventive'] },
      commercial: { value: Math.round(a.commercial.value * 0.1), currency: a.commercial.currency, billingImpact: 'Penalty Deduction', penaltyApplicable: true, serviceCreditApplicable: false, penaltyRules: '3% of the monthly SLA value per breach, capped at 15% per month.', serviceCreditRules: '', penaltyPercent: 3, penaltyCapPercent: 15 },
      escalation: { policy: 'Priority Escalation', first: 'Service Supervisor', second: 'Service Manager', management: 'Operations Director', percentage: 90, timeMinutes: null, recipients: 'amc.escalations@gfs.sa' },
      createdAt: a.createdAt,
    }, cal, status);
    standardRules(id, true);
    cover(id, { level: 'AMC', amcId: a.id, customerId: cust.id, startDate: a.period.startDate, endDate: a.period.endDate });
    a.scope.siteIds.forEach((siteId) => cover(id, { level: 'Site', siteId, startDate: a.period.startDate, endDate: a.period.endDate }));
    map(id, { level: 'AMC', customerId: cust.id, amcId: a.id, effectiveDate: a.period.startDate, expiryDate: a.period.endDate, assignmentPriority: 10 });
    map(id, { level: 'Site', customerId: cust.id, siteId: a.scope.siteIds[0], effectiveDate: a.period.startDate, expiryDate: a.period.endDate, assignmentPriority: 20 });
    if (status === 'Suspended') log(daysFromNow(-12), 'SLA Suspended', 'SLA', id, id, 'Suspended while the AMC is under commercial review.', 'Active', 'Suspended');
  }

  // Service-specific SLAs.
  const elevator = make({ id: 'SLA-S-001', number: 'SLA-S-001', name: 'Elevator Entrapment Emergency', type: 'Service-Specific SLA', description: 'Passenger entrapment and elevator emergencies.', priorityTargets: tiers({ response: 30, resolution: h(2) }, { response: 45, resolution: h(4) }, { response: h(1), resolution: h(8) }, { response: h(2), resolution: h(16) }), scope: { serviceIds: [], serviceCategories: ['Elevator Services'], serviceTypes: [], servicePriority: 'Critical', requestTypes: ['Emergency'], workOrderTypes: ['Corrective'] } }, 'CAL-247');
  standardRules(elevator.id, true);
  cover(elevator.id, { level: 'Service Category', serviceCategory: 'Elevator Services', priority: 'Critical' });
  cover(elevator.id, { level: 'Service Category', serviceCategory: 'Elevator Services', priority: 'High' });
  map(elevator.id, { level: 'Service Category', serviceCategory: 'Elevator Services', priority: 'Critical', assignmentPriority: 5 });
  map(elevator.id, { level: 'Service Category', serviceCategory: 'Elevator Services', priority: 'High', assignmentPriority: 5 });
  const fire = make({ id: 'SLA-S-002', number: 'SLA-S-002', name: 'Fire Alarm Emergency Response', type: 'Critical SLA', priorityTargets: tiers({ response: 45, resolution: h(4) }, { response: h(1), resolution: h(6) }, { response: h(2), resolution: h(12) }, { response: h(4), resolution: h(24) }), scope: { serviceIds: [], serviceCategories: ['Fire & Safety Services'], serviceTypes: [], servicePriority: 'Critical', requestTypes: ['Emergency'], workOrderTypes: ['Corrective'] } }, 'CAL-247');
  standardRules(fire.id, false);
  cover(fire.id, { level: 'Service Category', serviceCategory: 'Fire & Safety Services', priority: 'Critical' });
  map(fire.id, { level: 'Service Category', serviceCategory: 'Fire & Safety Services', priority: 'Critical', assignmentPriority: 5 });
  make({ id: 'SLA-S-003', number: 'SLA-S-003', name: 'Calibration Turnaround', type: 'Calibration SLA', priorityTargets: tiers({ response: h(8), resolution: h(48) }, { response: h(16), resolution: h(72) }, { response: h(24), resolution: h(120) }, { response: h(40), resolution: h(160) }) }, 'CAL-KSA-BH', 'Draft');
  const dc = db.reference.customers[2];
  make({ id: 'SLA-S-004', number: 'SLA-S-004', name: 'Data Centre Cooling', type: 'Strategic Customer SLA', customer: { customerId: dc.id, legalEntity: dc.legalName, segment: dc.segment, accountManagerId: dc.accountManagerId, contractManagerId: managers[0]?.id ?? null, primaryContact: dc.primaryContact }, priorityTargets: tiers({ response: 20, resolution: h(2) }, { response: 30, resolution: h(4) }, { response: h(1), resolution: h(8) }, { response: h(4), resolution: h(24) }), commercial: { value: 180_000, currency: 'SAR', billingImpact: 'Penalty Deduction', penaltyApplicable: true, serviceCreditApplicable: false, penaltyRules: '5% per breach, capped at 20%.', serviceCreditRules: '', penaltyPercent: 5, penaltyCapPercent: 20 } }, 'CAL-247', 'Pending Approval');

  // Clocks on service requests and work orders.
  let clockSeq = 1;
  const serviceFor = (siteId: string) => {
    const cats = db.reference.assets.filter((a) => a.siteId === siteId).map((a) => SERVICE_FOR_ASSET[a.category]).filter(Boolean);
    const cat = cats.length ? rng.pick(cats) : null;
    const services = db.reference.services.filter((s) => s.category === cat && (s.type === 'Corrective Maintenance' || s.type === 'Breakdown Service' || s.type === 'Emergency Service'));
    return services.length ? rng.pick(services) : null;
  };
  const addClock = (c: Omit<SlaClock, 'id' | 'number'>) => db.clocks.push({ ...c, id: uid('CLK'), number: `CLK-${pad(clockSeq++, 5)}` });

  const transactions = [
    ...base.serviceRequests.map((r) => ({ kind: 'Service Request' as const, id: r.id, number: r.number, subject: r.subject, customerId: r.customerId, siteId: r.siteId, priority: r.priority as Priority, start: r.createdAt, open: !['Resolved', 'Closed'].includes(r.status), hold: r.status === 'On Hold', responded: r.status !== 'New' })),
    ...base.workOrders.filter((w) => w.type === 'Corrective').map((w) => ({ kind: 'Work Order' as const, id: w.id, number: w.number, subject: w.title, customerId: w.customerId, siteId: w.siteId, priority: rng.pick(['High', 'Medium', 'Medium', 'Low'] as Priority[]), start: `${w.scheduledDate.slice(0, 10)}T07:30:00.000Z`, open: !['Completed', 'Cancelled'].includes(w.status), hold: w.status === 'On Hold', responded: w.status !== 'Scheduled', completed: w.completedDate })),
  ].filter((t) => new Date(t.start).getTime() > now - 120 * 86_400_000 && new Date(t.start).getTime() < now);

  for (const t of transactions) {
    const service = rng.chance(0.6) ? serviceFor(t.siteId) : null;
    const assets = db.reference.assets.filter((a) => a.siteId === t.siteId);
    const asset = assets.length && rng.chance(0.7) ? rng.pick(assets) : null;
    const amc = db.reference.amcs.find((a) => a.customerId === t.customerId && a.siteIds.includes(t.siteId) && a.status === 'Active');
    const priority = service?.category === 'Elevator Services' && rng.chance(0.4) ? 'Critical' : t.priority;
    const sel = resolveSla(db, { customerId: t.customerId, contractId: amc?.contractId ?? null, amcId: amc?.id ?? null, siteId: t.siteId, assetId: asset?.id ?? null, serviceId: service?.id ?? null, priority, requestType: t.kind === 'Service Request' ? 'Breakdown' : null, date: t.start.slice(0, 10) }, now);
    if (!sel.slaId) continue;
    const sla = db.slas.find((s) => s.id === sel.slaId)!;
    const site = db.reference.sites.find((s) => s.id === t.siteId);
    const tech = db.reference.technicians.find((x) => x.region === site?.region) ?? null;
    const types: TargetType[] = t.kind === 'Service Request' ? ['First Response', 'Resolution'] : ['On-Site Arrival', 'Resolution'];
    for (const type of types) {
      const target = targetFor(db, sla.id, priority, type);
      if (!target) continue;
      const cal = calendar(db, target.calendarId);
      const isFirst = type !== 'Resolution';
      const f = 0.25 + rng.next() * (isFirst ? 1.15 : 1.3);
      const stopAt = addBusinessMinutes(cal, db.holidays, t.start, target.durationMinutes * f);
      const finished = isFirst ? t.responded || !t.open : !t.open;
      const stopped = finished && stopAt < now ? new Date(stopAt).toISOString() : null;
      const pauses = !stopped && !isFirst && t.hold ? [{ id: uid('PAU'), reason: rng.pick(['Waiting for Parts', 'Waiting for Customer', 'Site Inaccessible'] as const), requestedBy: tech?.name ?? 'Service Desk', approvedBy: 'Khalid Al-Mutairi', startedAt: new Date(Math.max(new Date(t.start).getTime() + 3_600_000, now - rng.int(2, 30) * 3_600_000)).toISOString(), endedAt: null, resumeReason: '', notes: 'Approved hold.' }] : [];
      addClock({
        slaId: sla.id, slaVersion: sla.version, selection: sel.summary, transactionType: t.kind, transactionId: t.id, transactionNumber: t.number, subject: t.subject, customerId: t.customerId, siteId: t.siteId, assetId: asset?.id ?? null, serviceId: service?.id ?? null, priority, targetType: type,
        targetMinutes: target.durationMinutes, calendarId: target.calendarId, warningPercent: target.warningPercent, escalationPercent: target.escalationPercent, startEvent: target.startEvent, stopEvent: target.stopEvent, startedAt: t.start, stoppedAt: stopped,
        status: stopped ? (f <= 1 ? 'Met' : 'Breached') : pauses.length ? 'Paused' : 'Running', pauses, team: amc ? 'Multi-Skill Team' : rng.pick(['HVAC Team', 'Electrical Team', 'Mechanical Team']), technician: tech?.name ?? null, region: site?.region ?? 'Central', notes: [],
      });
    }
    log(t.start, 'SLA Assigned', 'Clock', t.id, sla.id, `${sla.number} assigned to ${t.number} — ${sel.applicability}.`, null, sla.number, 'System', t.number);
  }

  tick(db, now, uid).forEach((e) => db.history.push({ ...e, id: uid('SH') }));
  // Give older breaches a realistic workflow state.
  db.breaches = db.breaches.map((b) => {
    const age = (now - new Date(b.detectedAt).getTime()) / 86_400_000;
    if (age < 3) return b;
    const r = rng.next();
    const reason = rng.pick(['Technician Delay', 'Parts Unavailable', 'Customer Delay', 'Site Access Issue', 'Resource Constraint', 'Emergency Workload']);
    const status = r < 0.45 ? 'Closed' : r < 0.6 ? 'Corrective Action' : r < 0.72 ? 'Root Cause Identified' : r < 0.84 ? 'Acknowledged' : r < 0.9 ? 'Waived' : 'Under Review';
    return { ...b, status, reason, owner: 'Khalid Al-Mutairi', rootCause: status === 'Acknowledged' || status === 'Under Review' ? '' : `${reason} on ${b.breachType.toLowerCase()}.`, correctiveAction: ['Corrective Action', 'Closed'].includes(status) ? 'Additional standby technician allocated for the region.' : '', waiver: status === 'Waived' ? { requestedBy: 'Khalid Al-Mutairi', reason: 'Customer-caused delay confirmed.', approvedBy: 'Abdullah Al-Faisal' } : null, penalty: status === 'Waived' ? 0 : b.penalty };
  });
  db.events = db.events.map((e) => (e.status === 'Open' && (now - new Date(e.triggeredAt).getTime()) / 86_400_000 > 5 ? { ...e, status: 'Acknowledged' } : e));
  db.history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return db;
}
