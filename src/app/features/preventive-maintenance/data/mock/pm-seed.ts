import { buildAmcSeed } from '../../../amc-agreements/data/mock/amc-seed';
import { buildAssetSeed } from '../../../assets/data/mock/asset-seed';
import { pad, random } from '../../../customers/data/mock/mock-utils';
import type { Checklist, ChecklistItem, Completion, MaintenanceTask, Occurrence, PmWorkOrder, StockPart } from '../../models/operations.model';
import type { FrequencyType, MaintenancePlan, Priority, Strategy } from '../../models/plan.model';
import type { PmTechnician } from '../../models/reference.model';
import { PM_RULES } from '../pm.config';
import { addDays, addMonths, frequencyLabel, planDates, today } from '../pm-recurrence';
import type { PmDatabase } from './pm-engine';

const SKILLS: Record<string, [string[], string[]]> = {
  'HVAC Team': [['HVAC Technician', 'Multi-Skill Technician'], ['EPA 608 Refrigerant Handling']],
  'Electrical Team': [['Electrician', 'Generator Technician'], ['High Voltage Authorised Person']],
  'Mechanical Team': [['Elevator Technician', 'Plumber'], ['Lift Engineer Certificate', 'Confined Space Entry']],
  'Fire & Safety Team': [['Fire Systems Technician'], ['NFPA 72 Fire Alarm']],
  'Multi-Skill Team': [['Multi-Skill Technician', 'HVAC Technician', 'Electrician', 'Plumber', 'Generator Technician'], ['EPA 608 Refrigerant Handling']],
};

const CATEGORY_PROFILE: Record<string, { skill: string; cert: string; team: string; checklist: string; parts: { partNumber: string; quantity: number }[]; tools: string }> = {
  HVAC: { skill: 'HVAC Technician', cert: 'EPA 608 Refrigerant Handling', team: 'HVAC Team', checklist: 'CHK-HVAC', parts: [{ partNumber: 'FLT-24x24', quantity: 2 }, { partNumber: 'BLT-A42', quantity: 1 }], tools: 'Manifold gauge set, thermometer, vacuum pump' },
  Refrigeration: { skill: 'HVAC Technician', cert: 'EPA 608 Refrigerant Handling', team: 'HVAC Team', checklist: 'CHK-HVAC', parts: [{ partNumber: 'FLT-24x24', quantity: 1 }], tools: 'Manifold gauge set, leak detector' },
  Power: { skill: 'Generator Technician', cert: 'High Voltage Authorised Person', team: 'Electrical Team', checklist: 'CHK-GEN', parts: [{ partNumber: 'OIL-15W40', quantity: 2 }, { partNumber: 'FLT-OIL-G', quantity: 1 }], tools: 'Multimeter, insulation tester, torque wrench' },
  'Vertical Transport': { skill: 'Elevator Technician', cert: 'Lift Engineer Certificate', team: 'Mechanical Team', checklist: 'CHK-LIFT', parts: [{ partNumber: 'GRS-LIFT', quantity: 1 }], tools: 'Rope gauge, multimeter' },
  'Fire & Safety': { skill: 'Fire Systems Technician', cert: 'NFPA 72 Fire Alarm', team: 'Fire & Safety Team', checklist: 'CHK-FIRE', parts: [{ partNumber: 'BAT-12V7', quantity: 1 }], tools: 'Smoke detector tester, sound meter' },
  Plumbing: { skill: 'Plumber', cert: 'None', team: 'Mechanical Team', checklist: 'CHK-PUMP', parts: [{ partNumber: 'SEAL-MECH', quantity: 1 }], tools: 'Pressure gauge, pipe wrench' },
};
const DEFAULT_PROFILE = { skill: 'Multi-Skill Technician', cert: 'None', team: 'Multi-Skill Team', checklist: 'CHK-MEP', parts: [] as { partNumber: string; quantity: number }[], tools: 'General tool kit' };

const PARTS: Omit<StockPart, 'reserved'>[] = [
  { partNumber: 'FLT-24x24', description: 'Pleated air filter 24x24 MERV 13', kind: 'Consumable', category: 'Filters', unit: 'pcs', stock: 140, warehouse: 'Riyadh Central', unitCost: 45 },
  { partNumber: 'BLT-A42', description: 'V-belt A42', kind: 'Part', category: 'Belts', unit: 'pcs', stock: 36, warehouse: 'Riyadh Central', unitCost: 38 },
  { partNumber: 'REF-R410A', description: 'Refrigerant R-410A (11.3 kg)', kind: 'Consumable', category: 'Chemicals', unit: 'cyl', stock: 12, warehouse: 'Riyadh Central', unitCost: 420 },
  { partNumber: 'OIL-15W40', description: 'Engine oil 15W-40 (5 L)', kind: 'Consumable', category: 'Lubricants', unit: 'can', stock: 48, warehouse: 'Riyadh Central', unitCost: 95 },
  { partNumber: 'FLT-OIL-G', description: 'Generator oil filter', kind: 'Consumable', category: 'Filters', unit: 'pcs', stock: 30, warehouse: 'Riyadh Central', unitCost: 65 },
  { partNumber: 'FLT-FUEL-G', description: 'Generator fuel filter', kind: 'Consumable', category: 'Filters', unit: 'pcs', stock: 22, warehouse: 'Jeddah Depot', unitCost: 72 },
  { partNumber: 'COOL-50', description: 'Coolant 50/50 (20 L)', kind: 'Consumable', category: 'Chemicals', unit: 'drum', stock: 10, warehouse: 'Riyadh Central', unitCost: 160 },
  { partNumber: 'GRS-LIFT', description: 'Guide rail lubricant', kind: 'Consumable', category: 'Lubricants', unit: 'tube', stock: 60, warehouse: 'Riyadh Central', unitCost: 28 },
  { partNumber: 'ROPE-LIFT', description: 'Elevator suspension rope (per m)', kind: 'Part', category: 'Ropes', unit: 'm', stock: 0, warehouse: 'Jeddah Depot', unitCost: 85 },
  { partNumber: 'BAT-12V7', description: 'Sealed lead-acid battery 12V 7Ah', kind: 'Part', category: 'Batteries', unit: 'pcs', stock: 54, warehouse: 'Dammam Depot', unitCost: 75 },
  { partNumber: 'DET-SMK', description: 'Optical smoke detector head', kind: 'Part', category: 'Detectors', unit: 'pcs', stock: 25, warehouse: 'Dammam Depot', unitCost: 140 },
  { partNumber: 'SEAL-MECH', description: 'Pump mechanical seal 35 mm', kind: 'Part', category: 'Seals', unit: 'pcs', stock: 8, warehouse: 'Riyadh Central', unitCost: 210 },
  { partNumber: 'BRG-6205', description: 'Bearing 6205-2RS', kind: 'Part', category: 'Bearings', unit: 'pcs', stock: 40, warehouse: 'Riyadh Central', unitCost: 32 },
  { partNumber: 'CLN-COIL', description: 'Coil cleaner (5 L)', kind: 'Consumable', category: 'Cleaning Materials', unit: 'can', stock: 26, warehouse: 'Riyadh Central', unitCost: 55 },
  { partNumber: 'FST-KIT', description: 'Assorted fasteners kit', kind: 'Consumable', category: 'Fasteners', unit: 'kit', stock: 30, warehouse: 'Riyadh Central', unitCost: 40 },
  { partNumber: 'UPS-BAT', description: 'UPS battery block 12V 100Ah', kind: 'Part', category: 'Batteries', unit: 'pcs', stock: 16, warehouse: 'Riyadh Central', unitCost: 690 },
];

const item = (id: string, sequence: number, task: string, type: ChecklistItem['type'], extra: Partial<ChecklistItem> = {}): ChecklistItem => ({ id, sequence, task, type, required: true, inspectionPoint: '', expected: '', unit: '', min: null, max: null, options: [], ...extra });

const CHECKLISTS: Checklist[] = [
  { id: 'CHK-HVAC', number: 'CHK-001', name: 'HVAC Preventive Maintenance Checklist', assetCategory: 'HVAC', serviceId: null, version: '2.1', status: 'Active', items: [
    item('H1', 1, 'Safety isolation applied', 'Yes / No', { expected: 'Yes', inspectionPoint: 'Main isolator' }),
    item('H2', 2, 'Filter condition', 'Pass / Fail', { inspectionPoint: 'Return air filters' }),
    item('H3', 3, 'Supply air temperature', 'Measurement', { unit: '°C', min: 10, max: 16, inspectionPoint: 'Supply diffuser' }),
    item('H4', 4, 'Suction pressure', 'Numeric', { unit: 'psi', min: 110, max: 145, inspectionPoint: 'Service valve' }),
    item('H5', 5, 'Condenser coil condition', 'Selection', { options: ['Clean', 'Light dust', 'Heavy fouling'] }),
    item('H6', 6, 'Photo of unit after service', 'Photo Required', { required: false }),
    item('H7', 7, 'Customer confirmation', 'Signature Required'),
  ] },
  { id: 'CHK-GEN', number: 'CHK-002', name: 'Generator Run Test Checklist', assetCategory: 'Power', serviceId: null, version: '1.4', status: 'Active', items: [
    item('G1', 1, 'Lock-out / tag-out completed', 'Yes / No', { expected: 'Yes' }),
    item('G2', 2, 'Oil level', 'Pass / Fail'),
    item('G3', 3, 'Battery voltage', 'Measurement', { unit: 'V', min: 24, max: 28.5 }),
    item('G4', 4, 'Load test output', 'Measurement', { unit: 'kW', min: 300, max: 520 }),
    item('G5', 5, 'Coolant temperature at load', 'Measurement', { unit: '°C', min: 70, max: 95 }),
    item('G6', 6, 'Observations', 'Text', { required: false }),
  ] },
  { id: 'CHK-LIFT', number: 'CHK-003', name: 'Elevator Monthly Service Checklist', assetCategory: 'Vertical Transport', serviceId: null, version: '3.0', status: 'Active', items: [
    item('L1', 1, 'Car stopped and secured', 'Yes / No', { expected: 'Yes' }),
    item('L2', 2, 'Door operation and safety edge', 'Pass / Fail'),
    item('L3', 3, 'Levelling accuracy', 'Measurement', { unit: 'mm', min: 0, max: 10 }),
    item('L4', 4, 'Rope condition', 'Pass / Fail'),
    item('L5', 5, 'Emergency alarm test', 'Pass / Fail'),
    item('L6', 6, 'Technician signature', 'Signature Required'),
  ] },
  { id: 'CHK-FIRE', number: 'CHK-004', name: 'Fire Alarm Quarterly Test Checklist', assetCategory: 'Fire & Safety', serviceId: null, version: '1.2', status: 'Active', items: [
    item('F1', 1, 'Monitoring station notified', 'Yes / No', { expected: 'Yes' }),
    item('F2', 2, 'Panel fault-free', 'Pass / Fail'),
    item('F3', 3, 'Detectors tested', 'Numeric', { unit: 'pcs', min: 1, max: null }),
    item('F4', 4, 'Sounder level', 'Measurement', { unit: 'dB', min: 65, max: 120 }),
    item('F5', 5, 'Standby battery voltage', 'Measurement', { unit: 'V', min: 24, max: 27.6 }),
  ] },
  { id: 'CHK-PUMP', number: 'CHK-005', name: 'Pump Station Checklist', assetCategory: 'Plumbing', serviceId: null, version: '1.0', status: 'Active', items: [
    item('P1', 1, 'Seal leakage', 'Pass / Fail'),
    item('P2', 2, 'Discharge pressure', 'Measurement', { unit: 'bar', min: 2, max: 6 }),
    item('P3', 3, 'Motor current', 'Measurement', { unit: 'A', min: 5, max: 30 }),
  ] },
  { id: 'CHK-MEP', number: 'CHK-006', name: 'General MEP Checklist', assetCategory: 'General', serviceId: null, version: '1.1', status: 'Active', items: [
    item('M1', 1, 'Visual inspection', 'Pass / Fail'),
    item('M2', 2, 'Operating normally', 'Yes / No', { expected: 'Yes' }),
    item('M3', 3, 'Notes', 'Text', { required: false }),
  ] },
  { id: 'CHK-UPS', number: 'CHK-007', name: 'UPS Annual Battery Test', assetCategory: 'Power', serviceId: null, version: '1.0', status: 'Active', items: [
    item('U1', 1, 'Bypass transfer test', 'Pass / Fail'),
    item('U2', 2, 'Battery autonomy at load', 'Measurement', { unit: 'min', min: 10, max: null }),
    item('U3', 3, 'Cell voltage deviation', 'Measurement', { unit: '%', min: 0, max: 3 }),
  ] },
];

const task = (n: number, name: string, type: string, durationMinutes: number, category: string, dependsOn: string | null, extra: Partial<MaintenanceTask> = {}): MaintenanceTask => ({
  id: `TSK-${pad(n, 3)}`, number: `TSK-${pad(n, 3)}`, name, description: `${name} as per manufacturer procedure.`, type, sequence: n, durationMinutes, skill: '', certification: '', tool: '', partNumber: null, consumable: '', safety: '', procedure: '', acceptance: 'Within manufacturer limits.', dependsOn, assetCategory: category, ...extra,
});

const TASKS: MaintenanceTask[] = [
  task(1, 'Safety isolation', 'Safety Check', 10, 'General', null, { safety: 'Lock-out / tag-out, verify zero energy.', procedure: 'Isolate, lock, tag and test for dead.' }),
  task(2, 'Visual inspection', 'Inspection', 15, 'General', 'TSK-001'),
  task(3, 'Clean coils and filters', 'Cleaning', 30, 'HVAC', 'TSK-002', { consumable: 'Coil cleaner', partNumber: 'FLT-24x24', skill: 'HVAC Technician' }),
  task(4, 'Lubricate fan bearings', 'Lubrication', 15, 'HVAC', 'TSK-003', { consumable: 'Bearing grease' }),
  task(5, 'Adjust belt tension', 'Adjustment', 10, 'HVAC', 'TSK-004', { tool: 'Belt tension gauge', partNumber: 'BLT-A42' }),
  task(6, 'Refrigerant pressure test', 'Measurement', 20, 'HVAC', 'TSK-005', { tool: 'Manifold gauge set', certification: 'EPA 608 Refrigerant Handling' }),
  task(7, 'Functional test', 'Functional Test', 15, 'General', null),
  task(8, 'Final inspection', 'Inspection', 10, 'General', 'TSK-007'),
  task(9, 'Change engine oil and filter', 'Replacement', 45, 'Power', 'TSK-001', { partNumber: 'FLT-OIL-G', consumable: 'Engine oil 15W-40', skill: 'Generator Technician' }),
  task(10, 'Battery and charger test', 'Testing', 15, 'Power', 'TSK-009', { tool: 'Multimeter' }),
  task(11, 'Load bank test', 'Testing', 60, 'Power', 'TSK-010', { tool: 'Load bank', certification: 'High Voltage Authorised Person' }),
  task(12, 'Door and safety-edge adjustment', 'Adjustment', 30, 'Vertical Transport', 'TSK-001', { skill: 'Elevator Technician' }),
  task(13, 'Rope and sheave inspection', 'Inspection', 25, 'Vertical Transport', 'TSK-012', { tool: 'Rope gauge' }),
  task(14, 'Detector and sounder test', 'Testing', 40, 'Fire & Safety', 'TSK-001', { tool: 'Detector tester', skill: 'Fire Systems Technician' }),
  task(15, 'Calibrate sensors', 'Calibration', 30, 'General', 'TSK-002', { tool: 'Calibrator' }),
  task(16, 'Replace pump seal', 'Replacement', 60, 'Plumbing', 'TSK-001', { partNumber: 'SEAL-MECH' }),
];

const TASKS_FOR: Record<string, string[]> = {
  HVAC: ['TSK-001', 'TSK-002', 'TSK-003', 'TSK-004', 'TSK-005', 'TSK-006', 'TSK-007', 'TSK-008'],
  Refrigeration: ['TSK-001', 'TSK-002', 'TSK-003', 'TSK-006', 'TSK-008'],
  Power: ['TSK-001', 'TSK-009', 'TSK-010', 'TSK-011', 'TSK-008'],
  'Vertical Transport': ['TSK-001', 'TSK-012', 'TSK-013', 'TSK-007', 'TSK-008'],
  'Fire & Safety': ['TSK-001', 'TSK-014', 'TSK-008'],
  Plumbing: ['TSK-001', 'TSK-002', 'TSK-007', 'TSK-008'],
};

export function buildPmSeed(): PmDatabase {
  const assetDb = buildAssetSeed();
  const amcDb = buildAmcSeed();
  const ref = amcDb.reference;
  const rng = random(20261219);
  const year = new Date().getUTCFullYear();
  const holidays = [year - 1, year, year + 1].flatMap((y) => [`${y}-02-22`, `${y}-09-23`]);
  const technicians: PmTechnician[] = ref.technicians.map((t) => ({ id: t.id, name: t.name, team: t.team, region: t.region, skills: SKILLS[t.team]?.[0] ?? ['Multi-Skill Technician'], certifications: ['None', ...(SKILLS[t.team]?.[1] ?? [])], dailyCapacity: 4 }));
  const managers = ref.users.filter((u) => u.role === 'Contract Manager');

  const db: PmDatabase = {
    reference: {
      customers: ref.customers.map((c) => ({ id: c.id, name: c.name, code: c.code, legalName: c.legalName, region: c.serviceRegion })),
      sites: ref.sites.map((s) => ({ id: s.id, name: s.name, customerId: s.customerId, city: s.city, region: s.region })),
      assets: assetDb.assets.filter((a) => a.customerId && a.siteId).map((a) => ({
        id: a.id, name: a.name, code: a.code, customerId: a.customerId!, siteId: a.siteId!, category: a.category, type: a.type, manufacturer: a.manufacturer, model: a.model, serialNumber: a.serialNumber, installationDate: a.installation.date, commissioningDate: a.installation.commissioningDate,
        criticality: a.criticality, status: a.status, floor: a.installation.floor, area: a.installation.area, building: a.installation.location, meterType: a.operational.meterType, meterReading: a.operational.currentMeterReading, maintenanceClass: a.maintenanceClass,
      })),
      assetCategories: [...new Set(assetDb.assets.map((a) => a.category))].sort(),
      services: ref.services.filter((s) => s.status === 'Active').map((s) => ({ id: s.id, name: s.name, code: s.code, category: s.category, type: s.type })),
      serviceCategories: ref.serviceCategories,
      contracts: ref.contracts.map((c) => ({ id: c.id, name: c.title, number: c.number, customerId: c.customerId, status: c.status, endDate: amcDb.amcs.find((a) => a.parentContractId === c.id)?.period.endDate ?? null })),
      amcs: amcDb.amcs.map((a) => ({ id: a.id, name: a.title, number: a.number, customerId: a.customer.customerId, contractId: a.parentContractId, status: a.period.endDate < today() && a.status === 'Active' ? 'Expired' : a.status, startDate: a.period.startDate, endDate: a.period.endDate, assetIds: a.scope.assetIds, slaId: a.sla.slaId })),
      slas: ref.slas,
      technicians,
      teams: ['HVAC Team', 'Electrical Team', 'Mechanical Team', 'Fire & Safety Team', 'ELV & Security Team', 'Multi-Skill Team'],
      regions: ref.serviceRegions,
      users: [...ref.users, { id: 'USR-50', name: 'Khalid Al-Mutairi', role: 'Service Supervisor' }],
      holidays,
      currentUser: { id: 'USR-50', name: 'Khalid Al-Mutairi', role: 'Service Supervisor' },
    },
    plans: [], versions: [], occurrences: [], workOrders: [], checklists: CHECKLISTS, tasks: TASKS, meters: [], parts: PARTS.map((p) => ({ ...p, reserved: 0 })), history: [],
  };
  let seq = 1;
  const uid = (p: string) => `${p}-${pad(seq++, 6)}`;
  const log = (timestamp: string, action: PmDatabase['history'][number]['action'], entity: PmDatabase['history'][number]['entity'], entityId: string, planId: string | null, comments: string, prev: string | null = null, next: string | null = null, user?: string, reference: string | null = null) =>
    db.history.push({ id: uid('PH'), timestamp, user: user ?? rng.pick(managers).name, action, entity, entityId, planId, label: planId ?? entityId, previousValue: prev, newValue: next, reference, comments });

  let planSeq = 1;
  const makePlan = (o: { name: string; type: string; strategy: Strategy; frequency: FrequencyType; value?: number; unit?: MaintenancePlan['frequency']['unit']; calendarRule?: MaintenancePlan['frequency']['calendarRule']; dayOfMonth?: number; weekOfMonth?: number; dayOfWeek?: number; month?: number; assetIds: string[]; startDate: string; endDate?: string | null; serviceId?: string | null; contractId?: string | null; amcId?: string | null; slaId?: string | null; status?: MaintenancePlan['status']; priority?: Priority; window?: string; technician?: string | null }): MaintenancePlan => {
    const first = db.reference.assets.find((a) => a.id === o.assetIds[0])!;
    const profile = CATEGORY_PROFILE[first.category] ?? DEFAULT_PROFILE;
    const site = db.reference.sites.find((s) => s.id === first.siteId)!;
    const customer = db.reference.customers.find((c) => c.id === first.customerId)!;
    const svc = o.serviceId ? db.reference.services.find((s) => s.id === o.serviceId) : null;
    const tech = o.technician === undefined ? (technicians.find((t) => t.region === site.region && t.skills.includes(profile.skill)) ?? null) : o.technician ? technicians.find((t) => t.name === o.technician) ?? null : null;
    const id = `PMP-${pad(planSeq++, 5)}`;
    const p: MaintenancePlan = {
      id, number: id, name: o.name, maintenanceType: o.type, description: `${o.type} for ${first.category.toLowerCase()} assets at ${site.name}.`, status: o.status ?? 'Active', approval: (o.status ?? 'Active') === 'Draft' ? 'Not Submitted' : 'Approved', version: '1.0', externalReference: '',
      location: { customerId: customer.id, legalEntity: customer.legalName, siteId: site.id, building: first.building || 'Main Building', floor: first.floor, area: first.area, region: site.region },
      assetIds: o.assetIds, assetCategory: first.category,
      service: { serviceId: o.serviceId ?? null, serviceCategory: svc?.category ?? '', contractId: o.contractId ?? null, amcId: o.amcId ?? null, slaId: o.slaId ?? null, coveredService: !!o.amcId, entitlement: o.amcId ? `AMC ${o.amcId}` : '' },
      strategy: { strategy: o.strategy, preventive: true, recurring: o.strategy !== 'Event-Based' },
      frequency: { type: o.frequency, value: o.value ?? 1, unit: o.unit ?? 'Months', calendarRule: o.calendarRule ?? 'None', dayOfMonth: o.dayOfMonth ?? null, weekOfMonth: o.weekOfMonth ?? null, dayOfWeek: o.dayOfWeek ?? null, month: o.month ?? null, startDate: o.startDate, endDate: o.endDate ?? null, leadTimeDays: PM_RULES.defaultLeadDays, graceDays: PM_RULES.defaultGraceDays, effectiveDate: o.startDate },
      scheduling: { preferredDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday'], preferredTime: '09:00', window: o.window ?? 'Business Hours (08:00–17:00)', serviceHours: 'Business Hours', businessCalendar: 'KSA Business Hours', holidayHandling: 'Move to next working day', weekendHandling: 'Friday and Saturday are non-working', autoReschedule: true, maxRescheduleDays: 14 },
      resources: { skill: profile.skill, certification: profile.cert, technician: tech?.name ?? null, team: profile.team, tools: profile.tools, equipment: '' },
      parts: { required: profile.parts, replacementParts: '', materialList: profile.parts.map((x) => x.partNumber).join(', ') },
      procedure: { checklistId: first.category === 'Power' && o.type === 'Financial-Year Maintenance' ? 'CHK-UPS' : profile.checklist, taskIds: TASKS_FOR[first.category] ?? ['TSK-001', 'TSK-002', 'TSK-007', 'TSK-008'], standardProcedure: 'Follow the manufacturer service manual and site method statement.', safety: 'Permit to work, PPE, lock-out / tag-out.', inspectionPoints: 'See checklist.', measurements: 'Record all checklist measurements.', acceptance: 'All readings within limits; no alarms.' },
      automation: { autoGenerate: true, leadDays: PM_RULES.defaultLeadDays, woType: 'Preventive', priority: o.priority ?? (first.criticality === 'Critical' ? 'High' : 'Medium'), team: profile.team, technician: tech?.name ?? null, autoAssign: !!tech, autoDispatch: false },
      notifications: { reminder: true, reminderDays: 3, technician: true, supervisor: true, customer: !!o.amcId, overdue: true, escalation: true },
      notes: { internal: '', customer: '' }, documents: [],
      createdAt: `${o.startDate}T08:00:00.000Z`, createdBy: rng.pick(managers).name, updatedAt: null, updatedBy: null,
    };
    db.plans.push(p);
    db.versions.push({ planId: id, version: '1.0', createdAt: p.createdAt, createdBy: p.createdBy, summary: 'Initial version.', frequency: frequencyLabel(p) });
    log(p.createdAt, 'Maintenance Plan Created', 'Plan', id, id, `${p.maintenanceType} plan for ${p.assetIds.length} asset(s).`, null, p.name, p.createdBy);
    if (p.status !== 'Draft') log(`${o.startDate}T09:00:00.000Z`, 'Maintenance Plan Activated', 'Plan', id, id, 'Plan activated.', 'Approved', 'Active', p.createdBy);
    return p;
  };

  /** Builds history (completed / missed / cancelled / overdue) and near-term work orders. */
  const seedHistory = (p: MaintenancePlan) => {
    const from = [p.frequency.startDate, addDays(today(), -180)].sort().at(-1)!;
    const to = addDays(today(), PM_RULES.horizonDays);
    const dates = planDates(p, from, to, holidays);
    let completedCount = 0;
    for (const assetId of p.assetIds) {
      const asset = db.reference.assets.find((a) => a.id === assetId)!;
      for (const d of dates) {
        const id = uid('PMS');
        const past = d.scheduledDate < today();
        const roll = rng.next();
        const recent = past && d.scheduledDate >= addDays(today(), -25);
        let status: Occurrence['status'] = past ? (recent && roll < 0.25 ? 'Scheduled' : roll < 0.84 ? 'Completed' : roll < 0.91 ? 'Missed' : roll < 0.95 ? 'Cancelled' : 'Completed') : d.scheduledDate <= addDays(today(), 14) ? 'Assigned' : d.scheduledDate <= addDays(today(), 30) ? 'Scheduled' : 'Planned';
        if (p.status !== 'Active' && !past) status = 'Planned';
        const rescheduled = status === 'Completed' && rng.chance(0.1);
        const scheduledDate = rescheduled ? addDays(d.scheduledDate, rng.int(2, 6)) : d.scheduledDate;
        const tech = status === 'Planned' ? null : p.resources.technician;
        let occ: Occurrence = {
          id, number: id, planId: p.id, planVersion: '1.0', assetId, siteId: asset.siteId, customerId: asset.customerId, serviceId: p.service.serviceId, maintenanceType: p.maintenanceType, originalDate: d.ruleDate, scheduledDate, dueDate: addDays(scheduledDate, p.frequency.graceDays),
          window: p.scheduling.window, team: p.resources.team, technician: tech, priority: p.automation.priority, status, assignment: status === 'Completed' ? 'Completed' : tech ? 'Assigned' : 'Unassigned', workOrderId: null, generatedBy: `Recurrence rule: ${frequencyLabel(p)} (v1.0)`,
          reschedules: rescheduled ? [{ at: `${addDays(d.scheduledDate, -3)}T10:00:00.000Z`, fromDate: d.scheduledDate, toDate: scheduledDate, fromWindow: p.scheduling.window, toWindow: p.scheduling.window, reason: rng.pick(['Customer Requested Delay', 'Site Access Issue', 'Technician Unavailable']), requestedBy: 'Customer', approvedBy: 'Khalid Al-Mutairi', slaImpact: 'None — preventive work', amcImpact: 'Within AMC period', customerApproval: false, notes: '' }] : [],
          overdueReason: status === 'Scheduled' && past ? rng.pick(['Parts Unavailable', 'Customer Unavailable', 'Emergency Workload']) : null, escalationLevel: 0, cancelReason: status === 'Cancelled' ? 'Site closed for refurbishment.' : status === 'Missed' ? 'Technician unavailable — not performed.' : null, completion: null, correctiveWorkOrderIds: [],
        };
        if (status === 'Completed' || status === 'Assigned' || (status === 'Scheduled' && past)) {
          const woId = uid('PWO');
          const wo: PmWorkOrder = {
            id: woId, number: `WO-PM-${woId.slice(-5)}`, kind: 'Preventive', occurrenceId: id, planId: p.id, customerId: asset.customerId, siteId: asset.siteId, assetId, serviceId: p.service.serviceId, maintenanceType: p.maintenanceType, priority: p.automation.priority, plannedDate: scheduledDate, dueDate: occ.dueDate,
            team: p.resources.team, technician: tech, checklistId: p.procedure.checklistId, parts: p.parts.required, tools: p.resources.tools, status: status === 'Completed' ? 'Completed' : tech ? 'Assigned' : 'Open', generatedBy: `Generate ${p.automation.leadDays} days before due date`, createdAt: `${addDays(scheduledDate, -p.automation.leadDays)}T05:00:00.000Z`, defect: null, severity: null, estimatedCost: null,
          };
          db.workOrders.push(wo);
          occ = { ...occ, workOrderId: woId };
        }
        if (status === 'Completed') {
          const checklist = db.checklists.find((c) => c.id === p.procedure.checklistId);
          const findings = rng.chance(0.12);
          const results = (checklist?.items ?? []).map((it) => {
            const failThis = findings && it.type === 'Pass / Fail' && rng.chance(0.5);
            const value = it.type === 'Measurement' || it.type === 'Numeric' ? String(it.min !== null && it.max !== null ? Math.round((it.min + (it.max - it.min) * (0.3 + rng.next() * 0.4)) * 10) / 10 : (it.min ?? 0) + rng.int(1, 12)) : it.type === 'Pass / Fail' ? (failThis ? 'Fail' : 'Pass') : it.type === 'Yes / No' ? 'Yes' : it.type === 'Selection' ? it.options[0] ?? '' : it.type === 'Signature Required' || it.type === 'Photo Required' ? 'Captured' : '';
            return { itemId: it.id, value, pass: it.type === 'Pass / Fail' ? !failThis : it.type === 'Measurement' || it.type === 'Numeric' ? true : null };
          });
          const duration = rng.int(45, 150);
          const completion: Completion = {
            startedAt: `${scheduledDate}T07:${pad(rng.int(0, 59), 2)}:00.000Z`, endedAt: new Date(new Date(`${scheduledDate}T07:00:00Z`).getTime() + duration * 60_000).toISOString(), durationMinutes: duration, checklist: results, tasksDone: p.procedure.taskIds, partsUsed: p.parts.required,
            toolsUsed: p.resources.tools, assetCondition: findings ? 'Fair' : rng.pick(['Good', 'Good', 'Excellent']), defects: findings ? rng.pick(['Belt worn', 'Bearing noise', 'Seal weeping', 'Door sensor misaligned', 'Battery low capacity']) : '', correctiveActions: findings ? 'Corrective work order raised.' : '',
            recommendations: findings ? 'Replace worn component at next visit.' : 'No action required.', technicianNotes: 'PPM completed as per checklist.', customerNotes: '', customerSignature: true, technicianSignature: true, photos: rng.int(1, 4), result: findings ? 'Maintenance Requires Corrective Action' : 'Maintenance Completed Successfully', reportNumber: `RPT-${id.slice(-6)}`,
          };
          occ = { ...occ, completion };
          completedCount++;
          if (findings) {
            const cwId = uid('PWO');
            const done = scheduledDate < addDays(today(), -10);
            db.workOrders.push({
              id: cwId, number: `WO-CM-${cwId.slice(-5)}`, kind: 'Corrective', occurrenceId: id, planId: p.id, customerId: asset.customerId, siteId: asset.siteId, assetId, serviceId: null, maintenanceType: 'Corrective Maintenance', priority: 'High', plannedDate: addDays(scheduledDate, 3), dueDate: addDays(scheduledDate, 7),
              team: p.resources.team, technician: tech, checklistId: null, parts: [], tools: p.resources.tools, status: done ? 'Completed' : 'Assigned', generatedBy: `Defect found on ${id}`, createdAt: completion.endedAt, defect: completion.defects, severity: 'Medium', estimatedCost: rng.int(4, 30) * 100,
            });
            occ = { ...occ, correctiveWorkOrderIds: [cwId] };
          }
        }
        db.occurrences.push(occ);
      }
    }
    if (dates.length) log(`${from}T05:00:00.000Z`, 'Schedule Generated', 'Schedule', p.id, p.id, `${dates.length * p.assetIds.length} occurrences generated (${frequencyLabel(p)}).`, null, null, 'System');
    return completedCount;
  };

  // Plans derived from AMC service plans.
  const freqMap: Record<string, FrequencyType> = { Monthly: 'Monthly', Quarterly: 'Quarterly', 'Semi-Annual': 'Semi-Annual', Annual: 'Annual', 'Bi-Monthly': 'Bi-Monthly' };
  const liveAmcs = amcDb.amcs.filter((a) => a.status === 'Active');
  for (const line of amcDb.plans.filter((l) => liveAmcs.some((a) => a.id === l.amcId)).slice(0, 14)) {
    const amc = liveAmcs.find((a) => a.id === line.amcId)!;
    const scope = (line.assetIds.length ? line.assetIds : amc.scope.assetIds).filter((id) => db.reference.assets.some((x) => x.id === id));
    if (!scope.length) continue;
    const bySite = new Map<string, string[]>();
    scope.forEach((id) => {
      const s = db.reference.assets.find((x) => x.id === id)!.siteId;
      bySite.set(s, [...(bySite.get(s) ?? []), id]);
    });
    const assets = [...bySite.values()].sort((a, b) => b.length - a.length)[0].slice(0, 6);
    const frequency = freqMap[line.frequency] ?? 'Quarterly';
    const p = makePlan({ name: `${amc.title} — ${line.serviceType}`, type: `${frequency === 'Semi-Annual' ? 'Semi-Annual' : frequency} Maintenance`, strategy: 'Time-Based', frequency, assetIds: assets, startDate: amc.period.startDate, endDate: amc.period.endDate, serviceId: line.serviceId, contractId: amc.parentContractId, amcId: amc.id, slaId: amc.sla.slaId });
    seedHistory(p);
  }

  // Standalone plans covering the other strategies.
  const pick = (category: string, n = 1) => {
    const site = db.reference.sites.find((s) => db.reference.assets.filter((a) => a.siteId === s.id && a.category === category).length >= n);
    return site ? db.reference.assets.filter((a) => a.siteId === site.id && a.category === category).slice(0, n).map((a) => a.id) : [];
  };
  const gens = pick('Power', 2);
  if (gens.length) {
    const p = makePlan({ name: 'Generator 250-hour service', type: 'Operating Hours', strategy: 'Meter-Based', frequency: 'Meter-Based', value: 250, unit: 'Hours', assetIds: gens, startDate: addDays(today(), -400), priority: 'High' });
    gens.forEach((assetId, i) => {
      const base = 4000 + i * 900;
      const last = base - (i === 0 ? 30 : 180);
      const readings = [0, 1, 2, 3].map((k) => ({ at: `${addDays(today(), -30 + k * 9)}T06:00:00.000Z`, value: last + 20 + k * (i === 0 ? 55 : 15), by: 'Rashid Khan', triggered: false }));
      db.meters.push({ id: uid('MTR'), number: `MTR-${pad(db.meters.length + 1, 3)}`, kind: 'Meter', planId: p.id, assetId, meterType: 'Operating Hours', parameter: '', operator: '>', unit: 'Hours', interval: 250, lastTriggerReading: last, readings, status: 'Active' });
    });
  }
  const chillers = pick('HVAC', 1);
  if (chillers.length) {
    const p = makePlan({ name: 'Chiller high-temperature inspection', type: 'Temperature Threshold', strategy: 'Condition-Based', frequency: 'Condition-Based', assetIds: chillers, startDate: addDays(today(), -200), priority: 'High' });
    db.meters.push({ id: uid('MTR'), number: `MTR-${pad(db.meters.length + 1, 3)}`, kind: 'Condition', planId: p.id, assetId: chillers[0], meterType: '', parameter: 'Temperature', operator: '>', unit: '°C', interval: 9, lastTriggerReading: 0, readings: [6.8, 7.1, 7.4, 8.2].map((v, k) => ({ at: `${addDays(today(), -12 + k * 3)}T08:00:00.000Z`, value: v, by: 'BMS sensor', triggered: false })), status: 'Active' });
    db.meters.push({ id: uid('MTR'), number: `MTR-${pad(db.meters.length + 1, 3)}`, kind: 'Condition', planId: p.id, assetId: chillers[0], meterType: '', parameter: 'Vibration', operator: '>', unit: 'mm/s', interval: 7.1, lastTriggerReading: 0, readings: [2.1, 2.4, 2.6].map((v, k) => ({ at: `${addDays(today(), -9 + k * 3)}T08:00:00.000Z`, value: v, by: 'Vibration analyser', triggered: false })), status: 'Active' });
  }
  const fire = pick('Fire & Safety', 2);
  if (fire.length) seedHistory(makePlan({ name: 'Monthly fire extinguisher & panel inspection', type: 'End-of-Month Maintenance', strategy: 'Calendar-Based', frequency: 'Monthly', calendarRule: 'End of Month', assetIds: fire, startDate: addDays(today(), -365) }));
  const lifts = pick('Vertical Transport', 2);
  if (lifts.length) seedHistory(makePlan({ name: 'Elevator service — 2nd Tuesday', type: 'Specific Week of Month', strategy: 'Calendar-Based', frequency: 'Monthly', calendarRule: 'Specific Week of Month', weekOfMonth: 2, dayOfWeek: 2, assetIds: lifts, startDate: addDays(today(), -365) }));
  const crac = pick('HVAC', 2);
  if (crac.length) seedHistory(makePlan({ name: 'Data centre CRAC weekly check', type: 'Specific Day of Week', strategy: 'Calendar-Based', frequency: 'Weekly', calendarRule: 'Specific Day of Week', dayOfWeek: 0, assetIds: crac.slice(-1), startDate: addDays(today(), -90), priority: 'High', window: 'Early Morning (06:00–09:00)' }));
  const ups = gens.slice(0, 1);
  if (ups.length) seedHistory(makePlan({ name: 'Annual UPS / battery autonomy test', type: 'Financial-Year Maintenance', strategy: 'Calendar-Based', frequency: 'Annual', calendarRule: 'Financial Year', dayOfMonth: 15, month: 1, assetIds: ups, startDate: addDays(today(), -500), window: 'Weekend Shutdown' }));
  const newest = [...db.reference.assets].filter((a) => a.installationDate && a.installationDate >= addDays(today(), -60) && a.installationDate <= today()).sort((a, b) => (b.installationDate ?? '').localeCompare(a.installationDate ?? ''))[0] ?? db.reference.assets.find((a) => a.installationDate);
  if (newest) makePlan({ name: `Post-installation check — ${newest.name}`, type: 'After Installation', strategy: 'Event-Based', frequency: 'Event-Based', value: 30, unit: 'Days', assetIds: [newest.id], startDate: addDays(newest.installationDate ?? today(), 0) });
  const pumps = pick('Plumbing', 1);
  if (pumps.length) {
    makePlan({ name: 'Booster pump bi-monthly service', type: 'Bi-Monthly Maintenance', strategy: 'Time-Based', frequency: 'Bi-Monthly', assetIds: pumps, startDate: addDays(today(), 10), status: 'Draft' });
    const s = makePlan({ name: 'Daily pump room walk-round', type: 'Daily Maintenance', strategy: 'Time-Based', frequency: 'Daily', assetIds: pumps, startDate: addDays(today(), -20), status: 'Suspended' });
    log(`${addDays(today(), -6)}T09:00:00.000Z`, 'Maintenance Plan Suspended', 'Plan', s.id, s.id, 'Suspended during pump room refurbishment.', 'Active', 'Suspended');
  }
  // Recently completed plan edits for version history.
  const sample = db.plans[0];
  if (sample) {
    db.versions.push({ planId: sample.id, version: '1.1', createdAt: `${addMonths(today(), -2)}T10:00:00.000Z`, createdBy: 'Khalid Al-Mutairi', summary: 'Checklist updated after failure review.', frequency: frequencyLabel(sample) });
    db.plans = db.plans.map((p) => (p.id === sample.id ? { ...p, version: '1.1' } : p));
  }
  db.history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return db;
}
