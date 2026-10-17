import { CUSTOMER_CATEGORIES, CUSTOMER_TYPES } from '../../../customers/models/customer.model';
import { LOOKUPS_SEED } from '../../../customers/data/mock/lookups.seed';
import { dateFromNow, daysFromNow, pad, random } from '../../../customers/data/mock/mock-utils';
import { buildSeed } from '../../../customers/data/mock/seed';
import type { BillingMethod, CatalogService, Priority, ServiceCategory, ServiceType, ServiceUnit } from '../../models/catalog.model';
import type { CoverageType, Entitlement, EntitlementStatus, UsageRecord } from '../../models/entitlement.model';
import type { HistoryAction, HistoryEntity, HistoryEvent } from '../../models/history.model';
import type { PriceRule, PricingModel } from '../../models/pricing.model';
import type { AgreementRef, AssetRef, CatalogReferenceData } from '../../models/reference.model';
import { COVERAGE_LABOR_PARTS, COVERAGE_SERVICE_TYPES } from '../catalog.config';

export interface CatalogDatabase {
  reference: CatalogReferenceData;
  categories: ServiceCategory[];
  services: CatalogService[];
  priceRules: PriceRule[];
  entitlements: Entitlement[];
  usage: UsageRecord[];
  history: HistoryEvent[];
}

/** SRS 4.7 example categories, with sub-categories. */
const CATEGORY_TREE: readonly { key: string; name: string; description: string; children?: readonly [string, string][] }[] = [
  { key: 'HVAC', name: 'HVAC Services', description: 'Chillers, air handling, split / VRF and refrigeration services.', children: [['HVAC-CHL', 'Chiller Services'], ['HVAC-AHU', 'Air Handling & Ventilation'], ['HVAC-REF', 'Refrigeration Services']] },
  { key: 'ELEC', name: 'Electrical Services', description: 'LV distribution, UPS and building electrical services.', children: [['ELEC-UPS', 'UPS & Power Quality'], ['ELEC-LV', 'LV Distribution']] },
  { key: 'GEN', name: 'Generator Services', description: 'Standby and prime generator maintenance and testing.' },
  { key: 'ELV', name: 'Elevator Services', description: 'Passenger, service elevators and escalators.' },
  { key: 'FIRE', name: 'Fire & Safety Services', description: 'Fire alarm, suppression and life-safety systems.', children: [['FIRE-FA', 'Fire Alarm Systems'], ['FIRE-SUP', 'Fire Suppression']] },
  { key: 'SEC', name: 'CCTV & Security Services', description: 'CCTV, access control and security systems.' },
  { key: 'IT', name: 'IT Equipment Services', description: 'Network, server room and BMS controller services.' },
  { key: 'MED', name: 'Medical Equipment Services', description: 'Biomedical equipment maintenance and calibration.' },
  { key: 'PLB', name: 'Plumbing Services', description: 'Pumps, water systems and drainage.' },
  { key: 'SOL', name: 'Solar Services', description: 'Solar PV and inverter services.' },
  { key: 'PM', name: 'Preventive Maintenance', description: 'Planned preventive maintenance programmes across disciplines.' },
  { key: 'INSP', name: 'Inspection & Compliance', description: 'Statutory inspections, audits and compliance certification.' },
  { key: 'INST', name: 'Installation & Commissioning', description: 'New equipment installation, testing and commissioning.' },
];

type ServiceSeed = readonly [code: string, name: string, category: string, sub: string | null, type: ServiceType, unit: ServiceUnit, hours: number, price: number, billing: BillingMethod, skill: string, team: string];

const SERVICES: readonly ServiceSeed[] = [
  ['HVAC-PPM-Q', 'Chiller Quarterly PPM', 'HVAC', 'HVAC-CHL', 'Preventive Maintenance', 'Visit', 4, 1800, 'Per Visit', 'HVAC Technician', 'HVAC Team'],
  ['HVAC-OVH-A', 'Chiller Annual Overhaul', 'HVAC', 'HVAC-CHL', 'Preventive Maintenance', 'Job', 16, 9500, 'Fixed Price', 'HVAC Technician', 'HVAC Team'],
  ['HVAC-BRK', 'HVAC Breakdown Call-Out', 'HVAC', null, 'Breakdown Service', 'Visit', 3, 650, 'Per Visit', 'HVAC Technician', 'HVAC Team'],
  ['HVAC-RPR', 'HVAC Corrective Repair', 'HVAC', null, 'Corrective Maintenance', 'Hour', 1, 220, 'Time & Material', 'HVAC Technician', 'HVAC Team'],
  ['HVAC-AHU-M', 'AHU Monthly Service', 'HVAC', 'HVAC-AHU', 'Preventive Maintenance', 'Visit', 2, 450, 'Per Visit', 'HVAC Technician', 'HVAC Team'],
  ['HVAC-FLT', 'Filter Replacement', 'HVAC', 'HVAC-AHU', 'Replacement', 'Item', 0.5, 120, 'Per Unit', 'HVAC Technician', 'HVAC Team'],
  ['HVAC-REF-G', 'Refrigerant Recharge', 'HVAC', 'HVAC-REF', 'Repair', 'Job', 2, 780, 'Fixed Price', 'HVAC Technician', 'HVAC Team'],
  ['HVAC-COLD', 'Cold Room Monthly Service', 'HVAC', 'HVAC-REF', 'Preventive Maintenance', 'Visit', 2, 520, 'Per Visit', 'HVAC Technician', 'HVAC Team'],
  ['ELEC-UPS-S', 'UPS Semi-Annual Service', 'ELEC', 'ELEC-UPS', 'Preventive Maintenance', 'Visit', 3, 1400, 'Per Visit', 'Electrical Technician', 'Electrical Team'],
  ['ELEC-UPS-B', 'UPS Battery Replacement', 'ELEC', 'ELEC-UPS', 'Replacement', 'Job', 4, 6200, 'Fixed Price', 'Electrical Technician', 'Electrical Team'],
  ['ELEC-THERM', 'Thermographic Survey', 'ELEC', 'ELEC-LV', 'Inspection', 'Inspection', 4, 2100, 'Fixed Price', 'Electrical Technician', 'Electrical Team'],
  ['ELEC-BRK', 'Electrical Breakdown Repair', 'ELEC', 'ELEC-LV', 'Breakdown Service', 'Hour', 1, 240, 'Time & Material', 'Electrical Technician', 'Electrical Team'],
  ['GEN-RUN-M', 'Generator Monthly Run Test', 'GEN', null, 'Inspection', 'Visit', 1.5, 380, 'Per Visit', 'Generator Specialist', 'Electrical Team'],
  ['GEN-PPM-Q', 'Generator Quarterly Service', 'GEN', null, 'Preventive Maintenance', 'Visit', 4, 1650, 'Per Visit', 'Generator Specialist', 'Electrical Team'],
  ['GEN-LOAD', 'Generator Load Bank Test', 'GEN', null, 'Inspection', 'Job', 6, 3800, 'Fixed Price', 'Generator Specialist', 'Electrical Team'],
  ['GEN-EMR', 'Generator Emergency Response', 'GEN', null, 'Emergency Service', 'Visit', 3, 1200, 'Per Visit', 'Generator Specialist', 'Electrical Team'],
  ['ELV-SVC-M', 'Elevator Monthly Service', 'ELV', null, 'Preventive Maintenance', 'Visit', 2, 600, 'Per Visit', 'Elevator Technician', 'Mechanical Team'],
  ['ELV-RESC', 'Elevator Entrapment Rescue', 'ELV', null, 'Emergency Service', 'Visit', 1, 900, 'Per Visit', 'Elevator Technician', 'Mechanical Team'],
  ['ELV-INSP', 'Elevator Annual Safety Inspection', 'ELV', null, 'Inspection', 'Inspection', 3, 1500, 'Fixed Price', 'Elevator Technician', 'Mechanical Team'],
  ['ELV-RPR', 'Elevator Repair', 'ELV', null, 'Repair', 'Hour', 1, 260, 'Time & Material', 'Elevator Technician', 'Mechanical Team'],
  ['FIRE-TST-Q', 'Fire Alarm Quarterly Test', 'FIRE', 'FIRE-FA', 'Inspection', 'Visit', 4, 1250, 'Per Visit', 'Fire Systems Technician', 'Fire & Safety Team'],
  ['FIRE-DET', 'Detector Cleaning & Replacement', 'FIRE', 'FIRE-FA', 'Replacement', 'Item', 0.3, 160, 'Per Unit', 'Fire Systems Technician', 'Fire & Safety Team'],
  ['FIRE-SUP-A', 'Suppression System Annual Service', 'FIRE', 'FIRE-SUP', 'Preventive Maintenance', 'Job', 6, 4200, 'Fixed Price', 'Fire Systems Technician', 'Fire & Safety Team'],
  ['FIRE-CERT', 'Civil Defense Compliance Certification', 'INSP', null, 'Inspection', 'Job', 8, 5500, 'Fixed Price', 'Fire Systems Technician', 'Fire & Safety Team'],
  ['SEC-CCTV-S', 'CCTV Semi-Annual Health Check', 'SEC', null, 'Preventive Maintenance', 'Visit', 3, 950, 'Per Visit', 'ELV / CCTV Technician', 'ELV & Security Team'],
  ['SEC-CAM', 'Camera Replacement', 'SEC', null, 'Replacement', 'Item', 1, 850, 'Per Unit', 'ELV / CCTV Technician', 'ELV & Security Team'],
  ['SEC-REM', 'Security System Remote Support', 'SEC', null, 'Remote Support', 'Hour', 1, 180, 'Per Hour', 'ELV / CCTV Technician', 'ELV & Security Team'],
  ['IT-BMS-A', 'BMS Annual Health Check', 'IT', null, 'Inspection', 'Job', 5, 2600, 'Fixed Price', 'IT Field Engineer', 'IT Field Team'],
  ['IT-REM', 'IT / BMS Remote Support', 'IT', null, 'Remote Support', 'Hour', 1, 160, 'Per Hour', 'IT Field Engineer', 'IT Field Team'],
  ['IT-NET', 'Network Equipment Repair', 'IT', null, 'Repair', 'Hour', 1, 210, 'Time & Material', 'IT Field Engineer', 'IT Field Team'],
  ['MED-CAL', 'Biomedical Equipment Calibration', 'MED', null, 'Calibration', 'Item', 2, 950, 'Per Unit', 'Biomedical Engineer', 'Biomedical Team'],
  ['MED-PPM', 'Medical Equipment PPM', 'MED', null, 'Preventive Maintenance', 'Visit', 3, 1350, 'Per Visit', 'Biomedical Engineer', 'Biomedical Team'],
  ['PLB-PMP-Q', 'Booster Pump Quarterly Service', 'PLB', null, 'Preventive Maintenance', 'Visit', 2, 550, 'Per Visit', 'Plumber', 'Mechanical Team'],
  ['PLB-LEAK', 'Leak Detection & Repair', 'PLB', null, 'Corrective Maintenance', 'Hour', 1, 190, 'Time & Material', 'Plumber', 'Mechanical Team'],
  ['SOL-CLN', 'Solar Panel Cleaning', 'SOL', null, 'Preventive Maintenance', 'Visit', 4, 1100, 'Per Visit', 'Solar Technician', 'Electrical Team'],
  ['SOL-INV', 'Inverter Inspection', 'SOL', null, 'Inspection', 'Inspection', 2, 700, 'Fixed Price', 'Solar Technician', 'Electrical Team'],
  ['PM-MEP-M', 'MEP Monthly Planned Maintenance', 'PM', null, 'Preventive Maintenance', 'Visit', 6, 2400, 'Contract Included', 'General Technician', 'Mechanical Team'],
  ['PM-AUDIT', 'Facility Condition Audit', 'INSP', null, 'Consultation', 'Day', 8, 4800, 'Fixed Price', 'General Technician', 'Mechanical Team'],
  ['INST-EQP', 'Equipment Installation', 'INST', null, 'Installation', 'Job', 16, 7500, 'Fixed Price', 'General Technician', 'Installation Team'],
  ['INST-COM', 'Testing & Commissioning', 'INST', null, 'Commissioning', 'Job', 8, 4200, 'Fixed Price', 'General Technician', 'Installation Team'],
  ['GEN-OLD', 'Generator Fuel Polishing (legacy)', 'GEN', null, 'Other', 'Job', 4, 1900, 'Fixed Price', 'Generator Specialist', 'Electrical Team'],
  ['HVAC-DUCT', 'Duct Cleaning', 'HVAC', 'HVAC-AHU', 'Other', 'Day', 8, 3200, 'Per Unit', 'HVAC Technician', 'HVAC Team'],
];

const ASSET_CATEGORY_TO_SERVICE: Record<string, readonly string[]> = {
  HVAC: ['HVAC', 'PM'],
  Refrigeration: ['HVAC'],
  Power: ['GEN', 'ELEC', 'PM'],
  'Vertical Transport': ['ELV'],
  'Fire & Safety': ['FIRE', 'INSP'],
  Security: ['SEC'],
  Plumbing: ['PLB', 'PM'],
  'Building Automation': ['IT'],
};

const AGREEMENT_CATEGORIES: readonly [string, readonly string[]][] = [
  ['HVAC', ['HVAC']],
  ['MEP', ['HVAC', 'ELEC', 'PLB', 'PM']],
  ['Elevator', ['ELV']],
  ['Fire', ['FIRE', 'INSP']],
  ['Generator', ['GEN']],
  ['Integrated Facility Management', ['HVAC', 'ELEC', 'GEN', 'ELV', 'FIRE', 'PLB', 'SEC', 'PM']],
  ['Hard Services', ['HVAC', 'ELEC', 'PLB', 'GEN']],
  ['Critical Systems Support', ['GEN', 'ELEC', 'FIRE', 'IT']],
];

const TECHNICIANS = ['Rashid Khan', 'Bilal Ahmed', 'Saeed Al-Amri', 'Jomar Santos', 'Vikram Patel', 'Ali Hassan', 'Mahmoud Saleh'];
const today = () => new Date().toISOString().slice(0, 10);

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function at(date: string, hour = 10): string {
  const iso = `${date}T${pad(hour, 2)}:${pad((hour * 11) % 60, 2)}:00.000Z`;
  return iso > new Date().toISOString() ? daysFromNow(-0.02) : iso;
}

export function buildCatalogSeed(): CatalogDatabase {
  const base = buildSeed();
  const rng = random(20261017);
  const users = base.lookups.users.map((u) => u.name);
  const assets: AssetRef[] = base.assets.map((a) => ({
    id: a.id, code: a.id, name: a.name, category: a.category, customerId: a.customerId, siteId: a.siteId,
    status: a.status === 'In Service' ? 'Active' : a.status === 'Out of Service' ? 'Under Repair' : a.status,
  }));
  const agreements: AgreementRef[] = base.agreements.map((a) => ({ id: a.id, number: a.number, title: a.title, kind: a.kind, customerId: a.customerId, siteIds: a.siteIds, status: a.status, startDate: a.startDate, endDate: a.endDate }));
  const reference: CatalogReferenceData = {
    customers: base.customers.map((c) => ({ id: c.id, code: c.code, name: c.name, status: c.status, type: c.type, category: c.category, serviceRegion: c.operational.serviceRegion ?? '', currency: c.commercial.currency })),
    sites: base.sites.map((s) => ({ id: s.id, code: s.code, name: s.name, customerId: s.customerId, status: s.status, city: s.location.city })),
    assets,
    agreements,
    slas: base.lookups.slas,
    priceLists: LOOKUPS_SEED.priceLists,
    taxProfiles: LOOKUPS_SEED.taxProfiles,
    territories: base.lookups.territories,
    serviceRegions: base.lookups.serviceRegions,
    currencies: LOOKUPS_SEED.currencies,
    customerTypes: [...CUSTOMER_TYPES],
    customerCategories: [...CUSTOMER_CATEGORIES],
    technicians: TECHNICIANS,
    currentUser: users[0],
  };
  const db: CatalogDatabase = { reference, categories: [], services: [], priceRules: [], entitlements: [], usage: [], history: [] };

  let evtSeq = 1;
  const log = (timestamp: string, action: HistoryAction, entity: HistoryEntity, entityId: string, entityLabel: string, comments: string, previousValue: string | null = null, newValue: string | null = null, reference: string | null = null, user?: string) =>
    db.history.push({ id: `HIS-${pad(evtSeq++, 6)}`, timestamp, user: user ?? rng.pick(users), action, entity, entityId, entityLabel, previousValue, newValue, reference, comments });
  const audit = (createdAt: string) => ({ createdAt, createdBy: rng.pick(users), updatedAt: null, updatedBy: null });

  // ── Categories ──────────────────────────────────────────────────────────────
  const catId = new Map<string, string>();
  CATEGORY_TREE.forEach((c, i) => {
    const id = `CAT-${c.key}`;
    catId.set(c.key, id);
    const createdAt = daysFromNow(-900 + i * 3, 9);
    db.categories.push({ id, code: c.key, name: c.name, parentId: null, description: c.description, status: c.key === 'SOL' && rng.chance(0.5) ? 'Inactive' : 'Active', displayOrder: (i + 1) * 10, ...audit(createdAt) });
    log(createdAt, 'Category Created', 'Category', id, c.name, `Category ${c.name} created.`, null, null, c.key);
    c.children?.forEach(([key, name], j) => {
      const childId = `CAT-${key}`;
      catId.set(key, childId);
      db.categories.push({ id: childId, code: key, name, parentId: id, description: `${name} within ${c.name}.`, status: 'Active', displayOrder: (j + 1) * 10, ...audit(createdAt) });
      log(createdAt, 'Category Created', 'Category', childId, name, `Sub-category of ${c.name}.`, null, null, key);
    });
  });

  // ── Services ────────────────────────────────────────────────────────────────
  SERVICES.forEach(([code, name, cat, sub, type, unit, hours, price, billing, skill, team], i) => {
    const id = `SVC-${code}`;
    const createdAt = daysFromNow(-850 + i * 9, 10);
    const maintenance = type === 'Preventive Maintenance' || type === 'Inspection' || type === 'Calibration';
    const frequency = name.includes('Monthly') ? 1 : name.includes('Quarterly') ? 3 : name.includes('Semi-Annual') ? 6 : name.includes('Annual') ? 12 : null;
    const emergency = type === 'Emergency Service' || type === 'Breakdown Service';
    const priority: Priority = emergency ? 'Critical' : type === 'Corrective Maintenance' || type === 'Repair' ? 'High' : maintenance ? 'Medium' : 'Low';
    const sla = emergency ? 'SLA-PLT' : priority === 'High' ? 'SLA-GLD' : maintenance ? 'SLA-SLV' : null;
    const slaRef = base.lookups.slas.find((s) => s.id === sla);
    const status = code === 'GEN-OLD' ? 'Inactive' : code === 'HVAC-DUCT' ? 'Draft' : cat === 'SOL' && db.categories.find((c) => c.id === catId.get('SOL'))?.status === 'Inactive' ? 'Inactive' : 'Active';
    const billable = billing !== 'Non-Billable' && billing !== 'Contract Included';
    db.services.push({
      id, code, name, shortName: name.replace(/ (Service|Services|Test)$/, '').slice(0, 24), categoryId: catId.get(cat)!, subcategoryId: sub ? catId.get(sub)! : null, type, status,
      description: `${name} performed by certified ${skill.toLowerCase()}s in line with manufacturer recommendations.`,
      serviceClass: emergency ? 'Critical Systems' : type === 'Inspection' ? 'Compliance' : billing === 'Time & Material' ? 'Ad-hoc' : 'Standard', priority,
      customerDescription: `${name} — includes ${maintenance ? 'checklist-based inspection, cleaning and adjustment' : 'diagnosis and rectification'} with a service report.`,
      internalDescription: `Standard work instruction ${code}. Record readings and photos in the work order.`,
      operational: { standardDuration: hours, minDuration: Math.max(0.25, Math.round(hours * 0.5 * 4) / 4), maxDuration: Math.round(hours * 2 * 4) / 4, unit, territoryId: null, serviceHours: emergency ? '24/7' : 'Business Hours', emergencyAllowed: emergency || rng.chance(0.3) },
      maintenance: { maintenanceType: maintenance ? (type === 'Inspection' && cat === 'INSP' ? 'Statutory / Compliance' : 'Time-Based') : '', recommendedFrequency: maintenance ? frequency : null, frequencyUnit: maintenance && frequency ? 'Months' : null, checklistRequired: maintenance, inspectionRequired: type === 'Inspection' || type === 'Commissioning', meterBased: code.startsWith('GEN-PPM'), conditionBased: code.startsWith('ELEC-THERM') },
      resources: { skill, certification: cat === 'FIRE' || cat === 'INSP' ? 'NFPA 72' : cat === 'HVAC' ? 'EPA 608' : cat === 'ELV' ? 'Lift Inspector Licence' : cat === 'MED' ? 'Biomedical Certification' : 'None', team, equipment: emergency ? 'Service van with emergency kit' : '', tools: 'Standard tool kit, multimeter', parts: type === 'Replacement' ? 'As per asset specification' : '', consumables: maintenance ? 'Cleaning agents, lubricants' : '' },
      commercial: { billable, billingMethod: billing, standardPrice: price, currency: 'SAR', taxProfileId: 'TAX-STD', costRate: Math.round(price * (0.45 + rng.next() * 0.2)), priceListId: 'PL-STD', discountAllowed: billing !== 'Contract Included', contractEligible: type !== 'Consultation' && status !== 'Inactive', amcEligible: maintenance || emergency || type === 'Remote Support' },
      sla: { applicable: !!sla, defaultSlaId: sla, responseHours: slaRef?.responseHours ?? null, resolutionHours: slaRef?.resolutionHours ?? null, priority, escalationRequired: priority === 'Critical' || priority === 'High' },
      documentation: { serviceInstructions: 'Confirm access and permits with the site contact before starting.', technicianInstructions: maintenance ? 'Follow the service checklist; capture meter readings and before/after photos.' : 'Isolate equipment; diagnose root cause before replacing parts.', customerInstructions: 'Ensure equipment access and a responsible person on site.' },
      attachments: rng.chance(0.4) ? [{ id: `ATT-${id}`, name: `${code} Method Statement.pdf`, size: rng.int(80, 900) * 1024, type: 'application/pdf', uploadedBy: rng.pick(users), uploadedAt: createdAt }] : [],
      ...audit(createdAt),
    });
    log(createdAt, 'Service Created', 'Service', id, name, `Service ${code} created.`, null, null, code);
    if (status === 'Inactive') log(daysFromNow(-rng.int(20, 120), 11), 'Service Deactivated', 'Service', id, name, 'Service withdrawn from the catalog.', 'Active', 'Inactive', code);
    if (rng.chance(0.25)) log(daysFromNow(-rng.int(30, 300), 14), 'SLA Changed', 'Service', id, name, 'Service-specific SLA updated.', 'Bronze', slaRef?.name ?? 'None', code);
    if (rng.chance(0.2)) log(daysFromNow(-rng.int(10, 200), 15), 'Service Requirement Changed', 'Service', id, name, 'Required certification updated.', 'None', 'Certified technician', code);
  });

  // ── Pricing rules ───────────────────────────────────────────────────────────
  let priceSeq = 1;
  const rule = (serviceId: string, fields: Partial<PriceRule> & { basePrice: number; effectiveFrom: string; model: PricingModel }) =>
    db.priceRules.push({
      id: `PRC-${pad(priceSeq++, 5)}`, serviceId, priceListId: 'PL-STD', customerId: null, customerType: null, customerCategory: null, agreementId: null, serviceRegion: null,
      currency: 'SAR', unit: db.services.find((s) => s.id === serviceId)!.operational.unit, minCharge: null, maxCharge: null, discountAllowed: true, discountLimit: 10, taxProfileId: 'TAX-STD',
      effectiveTo: null, createdAt: at(fields.effectiveFrom, 9), createdBy: rng.pick(users), ...fields,
    });
  const lastYear = dateFromNow(-365 - rng.int(0, 60));
  const thisYear = dateFromNow(-rng.int(30, 120));
  const nextYear = dateFromNow(rng.int(30, 75));
  for (const s of db.services) {
    const price = s.commercial.standardPrice ?? 0;
    const model: PricingModel = s.commercial.billingMethod === 'Per Hour' || s.commercial.billingMethod === 'Time & Material' ? (s.commercial.billingMethod === 'Per Hour' ? 'Per Hour' : 'Time & Material') : s.commercial.billingMethod === 'Per Visit' ? 'Per Visit' : s.commercial.billingMethod === 'Per Unit' ? 'Per Unit' : 'Fixed Price';
    const older = Math.round(price * 0.93);
    rule(s.id, { basePrice: older, effectiveFrom: lastYear, effectiveTo: dateFromNow(-1 - rng.int(120, 130)), model, minCharge: model === 'Time & Material' ? older * 2 : null });
    rule(s.id, { basePrice: price, effectiveFrom: dateFromNow(-rng.int(118, 125)), model, minCharge: model === 'Time & Material' ? price * 2 : null });
    if (rng.chance(0.5)) rule(s.id, { basePrice: Math.round(price * 1.05), effectiveFrom: nextYear, model, minCharge: model === 'Time & Material' ? price * 2 : null });
    rule(s.id, { basePrice: Math.round(price * 0.9), effectiveFrom: thisYear, model, priceListId: 'PL-GOV', customerType: 'Government', discountLimit: 5 });
    if (rng.chance(0.6)) rule(s.id, { basePrice: Math.round(price * 0.92), effectiveFrom: thisYear, model, priceListId: 'PL-ENT', customerCategory: 'Enterprise' });
    if (rng.chance(0.3)) rule(s.id, { basePrice: Math.round(price * 1.08), effectiveFrom: thisYear, model, serviceRegion: 'GCC', currency: 'SAR' });
    if (rng.chance(0.2)) rule(s.id, { basePrice: Math.round(price * 0.95), effectiveFrom: thisYear, model, priceListId: 'PL-PRT', customerType: 'Partner' });
    log(at(lastYear, 9), 'Price Rule Added', 'Price Rule', s.id, s.name, 'Standard price list rule created.', null, `SAR ${older}`, s.code);
    log(at(dateFromNow(-120), 9), 'Price Changed', 'Service', s.id, s.name, 'Annual price revision.', `SAR ${older}`, `SAR ${price}`, s.code);
  }

  // ── Entitlements & usage ────────────────────────────────────────────────────
  const assetsBySite = new Map<string, AssetRef[]>();
  for (const a of assets) if (a.siteId) assetsBySite.set(a.siteId, [...(assetsBySite.get(a.siteId) ?? []), a]);
  const customers = new Map(base.customers.map((c) => [c.id, c]));
  let entSeq = 1;
  let usageSeq = 1;
  for (const agreement of agreements) {
    if (agreement.status === 'Draft') continue;
    const cats = AGREEMENT_CATEGORIES.find(([prefix]) => agreement.title.startsWith(prefix))?.[1] ?? ['PM'];
    const customer = customers.get(agreement.customerId)!;
    const groups = agreement.kind === 'AMC' ? [cats] : rng.chance(0.4) && cats.length > 2 ? [cats.slice(0, Math.ceil(cats.length / 2)), cats.slice(Math.ceil(cats.length / 2))] : [cats];
    for (const group of groups) {
      const coverageType: CoverageType = agreement.kind === 'AMC' ? rng.pick<CoverageType>(['Full Coverage', 'Preventive Maintenance', 'Full Coverage']) : rng.pick<CoverageType>(['Full Coverage', 'Labor Only', 'Breakdown Service', 'Emergency Service', 'Full Coverage']);
      const types = COVERAGE_SERVICE_TYPES[coverageType];
      const categoryIds = group.map((k) => catId.get(k)!);
      const inCategory = (s: CatalogService) => categoryIds.includes(s.categoryId) || (s.subcategoryId !== null && categoryIds.includes(db.categories.find((c) => c.id === s.subcategoryId)?.parentId ?? ''));
      const services = db.services.filter((s) => s.status === 'Active' && inCategory(s) && types.includes(s.type));
      if (!services.length) continue;
      const assetCats = Object.entries(ASSET_CATEGORY_TO_SERVICE).filter(([, keys]) => keys.some((k) => group.includes(k))).map(([c]) => c);
      const siteAssets = agreement.siteIds.flatMap((id) => assetsBySite.get(id) ?? []).filter((a) => assetCats.includes(a.category));
      const assetLevel = rng.chance(0.45) && siteAssets.length > 0;
      const status: EntitlementStatus = agreement.status === 'Expired' ? 'Expired' : agreement.status === 'Terminated' ? 'Cancelled' : customer.status === 'On Hold' ? 'Suspended' : 'Active';
      const monthsLong = Math.max(1, Math.round((new Date(agreement.endDate).getTime() - new Date(agreement.startDate).getTime()) / (30.4 * 86_400_000)));
      const pm = coverageType === 'Preventive Maintenance' || (agreement.kind === 'AMC' && rng.chance(0.6));
      const limit = pm || rng.chance(0.35);
      const maxVisits = limit ? (pm ? rng.pick([4, 6, 12, 24]) : rng.pick([6, 10, 12])) : null;
      const maxHours = limit && !pm && rng.chance(0.4) ? rng.pick([40, 80, 120]) : null;
      const elapsed = Math.min(1, Math.max(0, (Date.now() - new Date(agreement.startDate).getTime()) / (new Date(agreement.endDate).getTime() - new Date(agreement.startDate).getTime())));
      const targetVisits = maxVisits ? Math.min(maxVisits + (rng.chance(0.08) ? 1 : 0), Math.round(maxVisits * Math.min(1, elapsed * (0.8 + rng.next() * 0.5)))) : rng.int(1, 8);
      const id = `ENT-${pad(entSeq++, 5)}`;
      const sla = base.lookups.slas.find((s) => s.id === customer.operational.defaultSlaId) ?? base.lookups.slas[1];
      const createdAt = at(agreement.startDate, 9);
      const usageRecords: UsageRecord[] = [];
      let hoursUsed = 0;
      for (let u = 0; u < targetVisits; u++) {
        const end = agreement.endDate < today() ? agreement.endDate : today();
        const span = Math.max(1, Math.round((new Date(end).getTime() - new Date(agreement.startDate).getTime()) / 86_400_000));
        const date = daysFromNow(-Math.round((new Date(today()).getTime() - new Date(agreement.startDate).getTime()) / 86_400_000) + Math.round((span * (u + 0.5)) / targetVisits), rng.int(8, 16));
        const service = rng.pick(services);
        const siteId = rng.pick(agreement.siteIds.length ? agreement.siteIds : [null as unknown as string]);
        const asset = (assetsBySite.get(siteId) ?? []).filter((a) => assetCats.includes(a.category));
        const hours = Math.max(1, Math.round((service.operational.standardDuration ?? 2) + rng.int(-1, 2)));
        hoursUsed += hours;
        usageRecords.push({
          id: `USG-${pad(usageSeq++, 6)}`, entitlementId: id, date: date > new Date().toISOString() ? daysFromNow(-0.1) : date, serviceId: service.id, siteId: siteId ?? null, assetId: asset.length ? rng.pick(asset).id : null,
          visits: 1, hours, quantity: 1, reference: `WO-${rng.int(5000, 7999)}`, technician: rng.pick(TECHNICIANS), covered: !maxVisits || u < maxVisits, notes: '',
        });
      }
      db.usage.push(...usageRecords);
      const labor = COVERAGE_LABOR_PARTS[coverageType];
      db.entitlements.push({
        id, number: id, name: `${agreement.title} — ${group.map((k) => CATEGORY_TREE.find((c) => c.key === k)?.name.replace(' Services', '')).join(', ')}`,
        customerId: agreement.customerId, contractId: agreement.kind === 'Contract' ? agreement.id : null, amcId: agreement.kind === 'AMC' ? agreement.id : null,
        siteIds: agreement.siteIds, assetIds: assetLevel ? siteAssets.filter(() => rng.chance(0.75)).map((a) => a.id) : [], status,
        coverage: {
          serviceIds: services.map((s) => s.id), categoryIds, coverageType, includedServices: `${coverageType} for ${group.length} discipline(s) as per ${agreement.number}.`,
          excludedServices: 'Civil works, consumables beyond the agreed list, damage due to misuse.', coveredServiceTypes: [...types], serviceFrequency: pm ? rng.pick(['Monthly', 'Quarterly']) : 'On demand',
          includedVisits: maxVisits, emergencyService: coverageType === 'Full Coverage' || coverageType === 'Emergency Service', afterHoursService: coverageType === 'Emergency Service' || rng.chance(0.3),
        },
        validity: { startDate: agreement.startDate, endDate: agreement.endDate, effectiveDate: agreement.startDate, autoRenewal: rng.chance(0.4), renewalPeriodMonths: Math.min(36, monthsLong) },
        usage: { limitApplicable: limit, maxVisits, maxHours, maxQuantity: null, usedVisits: usageRecords.length, usedHours: hoursUsed, usedQuantity: usageRecords.length, resetFrequency: limit ? 'Contract Period' : 'No Reset', lastResetDate: agreement.startDate },
        laborParts: { labor: labor.labor, parts: labor.parts, consumables: coverageType === 'Full Coverage', travel: coverageType !== 'Parts Only', callOut: coverageType !== 'Preventive Maintenance' && coverageType !== 'Parts Only', overtime: coverageType === 'Emergency Service' },
        sla: { applicable: true, slaId: sla.id, responseHours: sla.responseHours, resolutionHours: sla.resolutionHours, priority: customer.operational.servicePriority, serviceWindow: customer.operational.preferredServiceWindow === '24/7' ? '24/7' : 'Business Hours (08:00–17:00)', escalationPolicy: sla.id === 'SLA-PLT' ? 'Executive Escalation' : 'Standard' },
        exclusions: { serviceIds: [], assetIds: [], parts: coverageType === 'Full Coverage' ? 'Compressors and major components above SAR 10,000' : 'All parts unless stated', locations: rng.chance(0.3) ? 'Rooftop areas without safe access' : '', serviceHours: coverageType === 'Emergency Service' ? '' : 'Public holidays', notes: '' },
        commercial: {
          billableServiceIds: db.services.filter((s) => inCategory(s) && s.status === 'Active' && !services.includes(s)).slice(0, 4).map((s) => s.id), nonBillableServiceIds: services.map((s) => s.id),
          customerPrice: null, currency: customer.commercial.currency, discountRules: customer.type === 'Government' ? '10% on additional chargeable services' : '5% on chargeable parts', additionalCharges: 'Call-outs outside service window charged at standard rates.',
          taxTreatment: customer.commercial.taxProfileId === 'TAX-ZERO' ? 'Zero-Rated' : 'Standard VAT',
        },
        attachments: [],
        ...audit(createdAt),
      });
      log(createdAt, 'Entitlement Created', 'Entitlement', id, id, `Created from ${agreement.number}.`, null, coverageType, agreement.number);
      log(at(agreement.startDate, 10), 'Entitlement Activated', 'Entitlement', id, id, 'Entitlement activated on contract start.', 'Draft', 'Active', agreement.number);
      usageRecords.slice(-3).forEach((u, k) => log(u.date, 'Usage Updated', 'Entitlement', id, id, `Visit consumed (${u.reference}).`, String(usageRecords.length - 3 + k < 0 ? 0 : usageRecords.length - 3 + k), String(usageRecords.length - 2 + k), u.reference, 'System'));
      if (status === 'Suspended') log(daysFromNow(-rng.int(3, 40), 11), 'Entitlement Suspended', 'Entitlement', id, id, 'Suspended — customer account on hold.', 'Active', 'Suspended', agreement.number);
      if (status === 'Expired') log(at(agreement.endDate, 0), 'Entitlement Expired', 'Entitlement', id, id, 'Validity period ended.', 'Active', 'Expired', agreement.number, 'System');
      if (status === 'Cancelled') log(daysFromNow(-rng.int(5, 60), 11), 'Entitlement Cancelled', 'Entitlement', id, id, 'Contract terminated.', 'Active', 'Cancelled', agreement.number);
    }
  }
  // A draft entitlement awaiting activation.
  const draftCustomer = base.customers.find((c) => c.status === 'Active' && c.type === 'SME')!;
  const draftSites = base.sites.filter((s) => s.customerId === draftCustomer.id).map((s) => s.id);
  const draftServices = db.services.filter((s) => s.categoryId === 'CAT-SEC' && s.status === 'Active').map((s) => s.id);
  db.entitlements.push({
    ...db.entitlements[0], id: `ENT-${pad(entSeq, 5)}`, number: `ENT-${pad(entSeq, 5)}`, name: 'Security Systems Support — proposal', customerId: draftCustomer.id, contractId: null, amcId: null,
    siteIds: draftSites, assetIds: [], status: 'Draft',
    coverage: { ...db.entitlements[0].coverage, serviceIds: draftServices, categoryIds: ['CAT-SEC'], coverageType: 'Remote Support', coveredServiceTypes: [...COVERAGE_SERVICE_TYPES['Remote Support']], includedVisits: null },
    validity: { startDate: dateFromNow(14), endDate: addMonths(dateFromNow(14), 12), effectiveDate: dateFromNow(14), autoRenewal: false, renewalPeriodMonths: 12 },
    usage: { limitApplicable: true, maxVisits: null, maxHours: 60, maxQuantity: null, usedVisits: 0, usedHours: 0, usedQuantity: 0, resetFrequency: 'Quarterly', lastResetDate: dateFromNow(14) },
    commercial: { ...db.entitlements[0].commercial, billableServiceIds: [], nonBillableServiceIds: draftServices, customerPrice: 18000, currency: draftCustomer.commercial.currency },
    ...audit(daysFromNow(-2, 10)),
  });
  log(daysFromNow(-2, 10), 'Entitlement Created', 'Entitlement', `ENT-${pad(entSeq, 5)}`, `ENT-${pad(entSeq, 5)}`, 'Draft entitlement prepared for customer review.', null, 'Remote Support');

  db.history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return db;
}
