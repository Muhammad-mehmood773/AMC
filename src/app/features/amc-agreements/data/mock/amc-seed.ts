import { buildCatalogSeed } from '../../../catalog/data/mock/catalog-seed';
import { buildContractSeed } from '../../../contracts/data/mock/contract-seed';
import type { Contract } from '../../../contracts/models/contract.model';
import { LOOKUPS_SEED } from '../../../customers/data/mock/lookups.seed';
import { daysFromNow, pad, random } from '../../../customers/data/mock/mock-utils';
import { buildSeed } from '../../../customers/data/mock/seed';
import type { Amc, AmcStatus, ServiceFrequency } from '../../models/amc.model';
import type { AmcHistoryAction, AmcHistoryEntity, AmcHistoryEvent, BillingLine, CoverageLine, PmEvent, ServicePlanLine, Suspension, Termination, Visit } from '../../models/operations.model';
import type { AmcReferenceData, TechnicianRef } from '../../models/reference.model';
import { AMC_RULES, BILLING_PER_YEAR, FREQUENCY_PER_YEAR } from '../amc.config';

export interface AmcDatabase {
  reference: AmcReferenceData;
  amcs: Amc[];
  coverage: CoverageLine[];
  plans: ServicePlanLine[];
  events: PmEvent[];
  visits: Visit[];
  billing: BillingLine[];
  suspensions: Suspension[];
  terminations: Termination[];
  history: AmcHistoryEvent[];
}

const TECHNICIANS: readonly TechnicianRef[] = [
  { id: 'TEC-01', name: 'Rashid Khan', team: 'HVAC Team', region: 'Central' },
  { id: 'TEC-02', name: 'Bilal Ahmed', team: 'Electrical Team', region: 'Central' },
  { id: 'TEC-03', name: 'Saeed Al-Amri', team: 'Mechanical Team', region: 'Western' },
  { id: 'TEC-04', name: 'Jomar Santos', team: 'HVAC Team', region: 'Western' },
  { id: 'TEC-05', name: 'Vikram Patel', team: 'Fire & Safety Team', region: 'Eastern' },
  { id: 'TEC-06', name: 'Ali Hassan', team: 'Multi-Skill Team', region: 'Eastern' },
  { id: 'TEC-07', name: 'Mahmoud Saleh', team: 'Mechanical Team', region: 'Central' },
  { id: 'TEC-08', name: 'Imran Qureshi', team: 'Electrical Team', region: 'Western' },
  { id: 'TEC-09', name: 'Fahad Al-Shehri', team: 'Multi-Skill Team', region: 'Southern' },
];

/** Agreement title → asset categories, catalog categories, AMC type, team and PM frequency. */
const PROFILES: readonly { key: string; assets: readonly string[]; services: readonly string[]; type: string; team: string; frequency: ServiceFrequency; checklist: string }[] = [
  { key: 'HVAC', assets: ['HVAC', 'Refrigeration'], services: ['HVAC Services'], type: 'Annual Maintenance Contract (AMC)', team: 'HVAC Team', frequency: 'Quarterly', checklist: 'HVAC Preventive Maintenance Checklist' },
  { key: 'MEP', assets: ['HVAC', 'Power', 'Plumbing'], services: ['HVAC Services', 'Electrical Services', 'Plumbing Services'], type: 'Comprehensive Maintenance Contract', team: 'Multi-Skill Team', frequency: 'Quarterly', checklist: 'General MEP Checklist' },
  { key: 'Elevator', assets: ['Vertical Transport'], services: ['Elevator Services'], type: 'Full-Service Maintenance Contract', team: 'Mechanical Team', frequency: 'Monthly', checklist: 'Elevator Monthly Service Checklist' },
  { key: 'Fire', assets: ['Fire & Safety'], services: ['Fire & Safety Services'], type: 'Inspection Contract', team: 'Fire & Safety Team', frequency: 'Quarterly', checklist: 'Fire Alarm Quarterly Test Checklist' },
  { key: 'Generator', assets: ['Power'], services: ['Generator Services'], type: 'Preventive Maintenance Contract', team: 'Electrical Team', frequency: 'Quarterly', checklist: 'Generator Run Test Checklist' },
];

export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Moves a date forward past non-working days and holidays (SRS 6.10 holiday handling). */
export function nextWorkingDay(date: string): string {
  let d = date;
  for (let i = 0; i < 7; i++) {
    const day = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (!AMC_RULES.nonWorkingDays.includes(day) && !AMC_RULES.holidays.includes(d.slice(5))) return d;
    d = addDays(d, 1);
  }
  return d;
}

/** Occurrence dates between start and end for a frequency. */
export function occurrenceDates(start: string, end: string, perYear: number, from = start, to = end): string[] {
  if (perYear <= 0) return [];
  const stepDays = Math.max(1, Math.round(365 / perYear));
  const dates: string[] = [];
  for (let d = addDays(start, Math.round(stepDays / 2)); d <= end; d = addDays(d, stepDays)) {
    if (d >= from && d <= to) dates.push(nextWorkingDay(d));
  }
  return dates;
}

const at = (date: string, hour = 10) => {
  const iso = `${date}T${pad(hour, 2)}:15:00.000Z`;
  return iso > new Date().toISOString() ? daysFromNow(-0.02) : iso;
};

const statusFrom = (c: Contract): AmcStatus => {
  switch (c.status) {
    case 'Draft':
    case 'Under Review':
    case 'Under Negotiation':
      return 'Draft';
    case 'Pending Approval':
      return 'Pending Approval';
    case 'Approved':
    case 'Pending Signature':
    case 'Partially Signed':
      return 'Pending Activation';
    case 'Archived':
      return 'Expired';
    case 'Cancelled':
      return 'Cancelled';
    default:
      return c.status === 'Expiring Soon' ? 'Active' : (c.status as AmcStatus);
  }
};

export function buildAmcSeed(): AmcDatabase {
  const base = buildSeed();
  const catalog = buildCatalogSeed();
  const clm = buildContractSeed();
  const rng = random(20261121);
  const users = clm.reference.users;
  const managers = users.filter((u) => u.role === 'Contract Manager');
  const categoryName = (id: string) => catalog.categories.find((c) => c.id === id)?.name ?? '';
  const services = catalog.services.map((s) => ({
    id: s.id, code: s.code, name: s.name, category: categoryName(s.categoryId), type: s.type, status: s.status, durationHours: s.operational.standardDuration ?? 2, skill: s.resources.skill, team: s.resources.team,
  }));
  const siteRegion = new Map(base.sites.map((s) => [s.id, base.customers.find((c) => c.id === s.customerId)?.operational.serviceRegion ?? 'Central']));

  const reference: AmcReferenceData = {
    customers: base.customers.map((c) => {
      const contact = base.contacts.find((x) => x.id === c.primaryContactId);
      return {
        id: c.id, code: c.code, name: c.name, legalName: c.legalName, status: c.status, primaryContact: contact ? `${contact.firstName} ${contact.lastName}` : '', accountManagerId: c.commercial.accountManagerId,
        currency: c.commercial.currency, paymentTermsId: c.commercial.paymentTermsId, taxProfileId: c.commercial.taxProfileId, serviceRegion: c.operational.serviceRegion ?? 'Central',
        territoryId: c.operational.serviceTerritoryId, defaultSlaId: c.operational.defaultSlaId,
      };
    }),
    sites: base.sites.map((s) => ({ id: s.id, code: s.code, name: s.name, customerId: s.customerId, city: s.location.city, region: siteRegion.get(s.id) ?? 'Central' })),
    assets: base.assets.map((a) => ({ id: a.id, name: a.name, category: a.category, customerId: a.customerId, siteId: a.siteId, status: a.status })),
    assetCategories: [...new Set(base.assets.map((a) => a.category))].sort(),
    services,
    serviceCategories: catalog.categories.filter((c) => !c.parentId).map((c) => c.name),
    contracts: clm.contracts.map((c) => ({ id: c.id, number: c.number, title: c.title, customerId: c.parties.customerId, status: c.status, approved: c.approvalStatus === 'Approved' })),
    technicians: TECHNICIANS,
    requests: [
      ...base.serviceRequests.map((r) => ({ id: r.id, number: r.number, subject: r.subject, siteId: r.siteId, priority: r.priority, status: r.status, createdAt: r.createdAt, kind: 'Service Request' as const })),
      ...base.workOrders.map((w) => ({ id: w.id, number: w.number, subject: w.title, siteId: w.siteId, priority: w.type, status: w.status, createdAt: w.scheduledDate, kind: 'Work Order' as const })),
    ],
    users: [...users.map((u) => ({ id: u.id, name: u.name, role: u.role }))],
    slas: LOOKUPS_SEED.slas,
    paymentTerms: LOOKUPS_SEED.paymentTerms,
    taxProfiles: LOOKUPS_SEED.taxProfiles,
    territories: LOOKUPS_SEED.territories,
    serviceRegions: LOOKUPS_SEED.serviceRegions,
    currencies: LOOKUPS_SEED.currencies,
    currentUser: { id: 'USR-10', name: 'Majed Al-Otaibi', role: 'Contract Manager' },
  };

  const db: AmcDatabase = { reference, amcs: [], coverage: [], plans: [], events: [], visits: [], billing: [], suspensions: [], terminations: [], history: [] };
  let seq = 1;
  const log = (timestamp: string, action: AmcHistoryAction, entity: AmcHistoryEntity, entityId: string, amcId: string | null, comments: string, previousValue: string | null = null, newValue: string | null = null, user?: string, ref: string | null = null) =>
    db.history.push({ id: `AH-${pad(seq++, 6)}`, timestamp, user: user ?? rng.pick(managers).name, action, entity, entityId, amcId, label: amcId ?? entityId, previousValue, newValue, reference: ref, comments });

  let covSeq = 1;
  let planSeq = 1;
  let pmSeq = 1;
  let visitSeq = 1;
  let billSeq = 1;

  for (const c of clm.contracts.filter((x) => x.type === 'AMC Contract' && x.parties.customerId)) {
    const customer = base.customers.find((x) => x.id === c.parties.customerId)!;
    const profile = PROFILES.find((p) => c.title.startsWith(p.key)) ?? PROFILES[1];
    const siteIds = c.scopeInfo.siteIds;
    const assets = base.assets.filter((a) => siteIds.includes(a.siteId) && profile.assets.includes(a.category)).slice(0, 8);
    const amcServices = services.filter((s) => s.status === 'Active' && profile.services.includes(s.category));
    const pmService = amcServices.find((s) => s.type === 'Preventive Maintenance') ?? amcServices[0];
    const inspection = amcServices.find((s) => s.type === 'Inspection');
    const status = statusFrom(c);
    const comprehensive = c.category === 'Comprehensive';
    const labourOnly = c.category === 'Labour Only';
    const years = Math.max(1, (new Date(c.period.endDate).getTime() - new Date(c.period.startDate).getTime()) / (365 * 86_400_000));
    const perYear = FREQUENCY_PER_YEAR[profile.frequency];
    const visitsIncluded = Math.round(Math.max(1, siteIds.length) * perYear * years) + 4;
    const region = customer.operational.serviceRegion ?? 'Central';
    const sla = LOOKUPS_SEED.slas.find((s) => s.id === (c.scopeInfo.slaId ?? customer.operational.defaultSlaId)) ?? LOOKUPS_SEED.slas[1];
    const live = status === 'Active' || status === 'Suspended' || status === 'Expired' || status === 'Terminated' || status === 'Renewed';
    const id = c.id;
    const createdAt = c.createdAt;

    const amc: Amc = {
      id, number: c.number, title: c.title, type: profile.type, parentContractId: c.id, previousAmcId: c.previousContractId, status, approval: live || status === 'Pending Activation' ? 'Approved' : status === 'Pending Approval' ? 'Pending' : 'Not Submitted',
      version: live ? '2.0' : '1.0', externalReference: c.externalReference,
      customer: { customerId: customer.id, legalEntity: customer.legalName, primaryContact: c.parties.primaryContact, contractManagerId: c.parties.managerId, accountManagerId: c.parties.accountManagerId },
      period: { startDate: c.period.startDate, endDate: c.period.endDate, renewalDate: c.period.renewalDate, noticePeriodDays: c.period.noticePeriodDays, autoRenewal: c.period.autoRenewal, renewalTermMonths: c.period.renewalTermMonths },
      scope: {
        siteIds: [...siteIds], assetIds: assets.map((a) => a.id), assetCategories: [...profile.assets], serviceIds: amcServices.map((s) => s.id), serviceCategories: [...profile.services],
        excludedSiteIds: [], excludedAssetIds: [], excludedServiceIds: amcServices.filter((s) => s.type === 'Installation').map((s) => s.id),
      },
      maintenance: {
        maintenanceType: 'Preventive + Corrective', maintenanceFrequency: profile.frequency, serviceFrequency: profile.frequency, visitsIncluded, visitDurationHours: pmService?.durationHours ?? 3,
        serviceWindow: c.service.serviceWindow, preferredDays: ['Sunday', 'Tuesday', 'Wednesday'], emergencyService: c.service.emergencyCoverage, afterHoursService: c.service.serviceWindow === '24/7',
      },
      labor: { included: true, technicianVisitsIncluded: true, overtime: comprehensive, emergencyLabor: c.service.emergencyCoverage, travel: true, callOut: !labourOnly },
      parts: { partsIncluded: !labourOnly, consumablesIncluded: comprehensive, majorComponents: comprehensive, minorParts: !labourOnly, partsCostLimit: labourOnly ? null : Math.round(c.commercial.value * 0.15), consumablesLimit: comprehensive ? Math.round(c.commercial.value * 0.03) : null, replacementCoverage: comprehensive, excludedParts: 'Compressors and components above SAR 10,000 unless comprehensive' },
      sla: { slaId: sla.id, responseHours: sla.responseHours, resolutionHours: sla.resolutionHours, priority: customer.operational.servicePriority, escalationPolicy: sla.id === 'SLA-PLT' ? 'Executive Escalation' : 'Standard', serviceHours: c.service.serviceWindow === '24/7' ? '24/7' : 'Business Hours' },
      commercial: { value: c.commercial.value, currency: c.commercial.currency, billingFrequency: (['Monthly', 'Quarterly', 'Annual'].includes(c.commercial.billingFrequency) ? c.commercial.billingFrequency : 'Quarterly') as Amc['commercial']['billingFrequency'], paymentTermsId: c.commercial.paymentTermsId, billingMethod: 'Fixed Fee', taxProfileId: c.commercial.taxProfileId, discountPercent: c.commercial.discountPercent, priceEscalationPercent: c.commercial.priceEscalationPercent, additionalCharges: 'Call-outs outside the service window at standard rates.' },
      operational: { serviceRegion: region, territoryId: customer.operational.serviceTerritoryId, serviceTeam: profile.team, technicianTeam: profile.team, communicationMethod: rng.pick(['Email', 'Phone', 'Customer Portal']) },
      limits: { maxHours: Math.round(visitsIncluded * (pmService?.durationHours ?? 3) * 1.3), maxPartsValue: labourOnly ? null : Math.round(c.commercial.value * 0.15), maxCallOuts: c.service.emergencyCoverage ? rng.pick([6, 8, 12]) : rng.pick([2, 4]) },
      notes: { internal: '', customer: '' },
      documents: [{ id: `ADOC-${id}-1`, name: `${c.number} Service Schedule.pdf`, type: 'AMC Document', size: rng.int(200, 900) * 1024, uploadedBy: rng.pick(managers).name, uploadedAt: createdAt, version: 1 }],
      suspension: status === 'Suspended' ? { reason: c.suspendedReason ?? 'Customer account on hold.', from: daysFromNow(-rng.int(5, 30)).slice(0, 10), to: null, pauseMaintenance: true, pauseBilling: true } : null,
      activatedAt: live ? at(c.period.startDate, 8) : null,
      createdAt, createdBy: rng.pick(managers).name, updatedAt: null, updatedBy: null,
    };
    db.amcs.push(amc);
    log(createdAt, 'AMC Created', 'AMC', id, id, `${amc.type} created from contract ${c.number}.`, null, amc.title);
    if (amc.approval === 'Approved') log(at(addDays(c.period.startDate, -5), 11), 'AMC Approved', 'AMC', id, id, 'Approved for activation.', 'Pending', 'Approved');
    if (live) log(at(c.period.startDate, 8), 'AMC Activated', 'AMC', id, id, 'Activated on start date.', 'Pending Activation', 'Active');

    // Coverage
    const coverageLine = (line: Omit<CoverageLine, 'id' | 'amcId' | 'startDate' | 'endDate' | 'status' | 'serviceHours' | 'geographicRestriction'> & Partial<CoverageLine>) =>
      db.coverage.push({ id: `COV-${pad(covSeq++, 5)}`, amcId: id, startDate: amc.period.startDate, endDate: amc.period.endDate, status: 'Active', serviceHours: amc.sla.serviceHours, geographicRestriction: `${region} region`, ...line });
    coverageLine({ level: 'Customer', siteId: null, assetId: null, assetCategory: null, serviceId: null, coverageType: comprehensive ? 'Full Maintenance' : 'Preventive Maintenance', labor: 'Included', parts: labourOnly ? 'Excluded' : comprehensive ? 'All Covered Parts' : 'Selected Parts', maxVisits: visitsIncluded, maxHours: amc.limits.maxHours, maxPartsValue: amc.limits.maxPartsValue, maxCallOuts: amc.limits.maxCallOuts });
    profile.assets.forEach((cat) => coverageLine({ level: 'Asset Category', siteId: null, assetId: null, assetCategory: cat, serviceId: null, coverageType: 'Corrective Maintenance', labor: 'Included', parts: labourOnly ? 'Excluded' : 'Selected Parts', maxVisits: null, maxHours: null, maxPartsValue: null, maxCallOuts: null }));
    if (c.service.emergencyCoverage) coverageLine({ level: 'Customer', siteId: null, assetId: null, assetCategory: null, serviceId: null, coverageType: 'Emergency Service', labor: 'Included', parts: 'Consumables Only', maxVisits: null, maxHours: null, maxPartsValue: null, maxCallOuts: amc.limits.maxCallOuts });
    if (siteIds[0]) coverageLine({ level: 'Site', siteId: siteIds[0], assetId: null, assetCategory: null, serviceId: null, coverageType: 'Inspection', labor: 'Partially Included', parts: 'Excluded', maxVisits: Math.round(2 * years), maxHours: null, maxPartsValue: null, maxCallOuts: null });

    // Service plan
    const planIds: string[] = [];
    if (pmService) {
      const planId = `PLN-${pad(planSeq++, 5)}`;
      planIds.push(planId);
      db.plans.push({ id: planId, amcId: id, serviceId: pmService.id, serviceType: 'Preventive Maintenance', frequency: profile.frequency, occurrences: perYear, assetIds: [], durationHours: pmService.durationHours, skill: pmService.skill, team: profile.team, parts: 'Filters, belts and lubricants as required', checklist: profile.checklist, serviceWindow: amc.maintenance.serviceWindow, priority: 'Medium', active: true });
    }
    if (inspection) {
      db.plans.push({ id: `PLN-${pad(planSeq++, 5)}`, amcId: id, serviceId: inspection.id, serviceType: 'Inspection', frequency: 'Semi-Annual', occurrences: 2, assetIds: assets.slice(0, 3).map((a) => a.id), durationHours: inspection.durationHours, skill: inspection.skill, team: profile.team, parts: '', checklist: profile.checklist, serviceWindow: amc.maintenance.serviceWindow, priority: 'Low', active: true });
    }
    if (planIds.length) log(createdAt, 'Plan Updated', 'Service Plan', planIds[0], id, `${profile.frequency} preventive maintenance plan created.`);

    // PM schedule & visits (only for agreements that have been active)
    if (live && pmService) {
      const from = [amc.period.startDate, addDays(today(), -365)].sort().at(-1)!;
      const to = [amc.period.endDate, addDays(today(), 180), status === 'Terminated' || status === 'Expired' || status === 'Renewed' ? amc.period.endDate : '9999'].sort()[0];
      const dates = occurrenceDates(amc.period.startDate, amc.period.endDate, perYear, from, to);
      for (const siteId of siteIds) {
        const siteAssets = assets.filter((a) => a.siteId === siteId);
        if (!siteAssets.length) continue;
        const tech = TECHNICIANS.find((t) => t.region === (siteRegion.get(siteId) ?? region) && t.team === profile.team) ?? TECHNICIANS.find((t) => t.region === region) ?? TECHNICIANS[0];
        for (const date of dates) {
          const past = date < today();
          const roll = rng.next();
          const pmStatus: PmEvent['status'] = past ? (roll < 0.86 ? 'Completed' : roll < 0.92 ? 'Missed' : roll < 0.96 ? 'Rescheduled' : 'Scheduled') : date <= addDays(today(), 14) ? 'Assigned' : date <= addDays(today(), 45) ? 'Scheduled' : 'Planned';
          if (status === 'Suspended' && !past) continue;
          const visitId = pmStatus === 'Completed' || pmStatus === 'Assigned' ? `VIS-${pad(visitSeq++, 5)}` : null;
          const eventIds: string[] = [];
          for (const a of siteAssets) {
            const eid = `PM-${pad(pmSeq++, 6)}`;
            eventIds.push(eid);
            db.events.push({
              id: eid, number: eid, amcId: id, planId: planIds[0] ?? null, assetId: a.id, siteId, serviceId: pmService.id, maintenanceType: 'Preventive Maintenance', scheduledDate: date, dueDate: addDays(date, 7),
              window: amc.maintenance.serviceWindow, team: profile.team, technician: pmStatus === 'Planned' ? null : tech.name, priority: 'Medium', status: pmStatus, rescheduledFrom: pmStatus === 'Rescheduled' ? addDays(date, -7) : null,
              visitId, workOrder: visitId ? `WO-${rng.int(5000, 7999)}` : null, escalated: false, completedAt: pmStatus === 'Completed' ? at(date, 14) : null,
            });
          }
          if (visitId) {
            const hours = Math.round(siteAssets.length * pmService.durationHours * (0.8 + rng.next() * 0.4) * 10) / 10;
            db.visits.push({
              id: visitId, number: visitId, amcId: id, siteId, assetIds: siteAssets.map((a) => a.id), serviceId: pmService.id, plannedDate: date, window: amc.maintenance.serviceWindow, technician: tech.name, team: profile.team,
              type: 'Preventive Maintenance', status: pmStatus === 'Completed' ? 'Completed' : 'Assigned', eventIds, workOrder: db.events.find((e) => e.id === eventIds[0])?.workOrder ?? null,
              hours: pmStatus === 'Completed' ? hours : 0, partsValue: pmStatus === 'Completed' && !labourOnly ? rng.int(0, 12) * 150 : 0, consumablesValue: pmStatus === 'Completed' ? rng.int(1, 6) * 40 : 0, covered: true,
              responseHours: null, firstTimeFix: pmStatus === 'Completed' ? true : null, report: pmStatus === 'Completed' ? 'PPM completed as per checklist; readings within limits.' : '', completedAt: pmStatus === 'Completed' ? at(date, 15) : null,
            });
          }
        }
      }
      if (dates.length) log(at(from, 9), 'Schedule Created', 'Schedule', id, id, `${dates.length} ${profile.frequency.toLowerCase()} maintenance occurrences generated.`);
      // Breakdown / emergency visits
      for (let b = 0; b < rng.int(0, 4); b++) {
        const date = addDays(from, rng.int(5, Math.max(6, Math.round((new Date([to, today()].sort()[0]).getTime() - new Date(from).getTime()) / 86_400_000))));
        if (date >= today()) continue;
        const siteId = rng.pick(siteIds);
        const asset = assets.find((a) => a.siteId === siteId);
        const emergency = rng.chance(0.3);
        const vid = `VIS-${pad(visitSeq++, 5)}`;
        db.visits.push({
          id: vid, number: vid, amcId: id, siteId, assetIds: asset ? [asset.id] : [], serviceId: amcServices.find((s) => s.type === (emergency ? 'Emergency Service' : 'Breakdown Service'))?.id ?? amcServices.find((s) => s.type === 'Corrective Maintenance')?.id ?? null,
          plannedDate: date, window: '24/7', technician: rng.pick(TECHNICIANS).name, team: profile.team, type: emergency ? 'Emergency' : 'Breakdown', status: 'Completed', eventIds: [], workOrder: `WO-${rng.int(5000, 7999)}`,
          hours: rng.int(2, 6), partsValue: labourOnly ? 0 : rng.int(2, 20) * 120, consumablesValue: rng.int(0, 3) * 50, covered: true, responseHours: Math.round((sla.responseHours * (0.5 + rng.next())) * 10) / 10, firstTimeFix: rng.chance(0.8),
          report: emergency ? 'Emergency call-out — fault isolated and system restored.' : 'Breakdown repaired; root cause documented.', completedAt: at(date, 18),
        });
      }
      db.visits.filter((v) => v.amcId === id && v.status === 'Completed').slice(-3).forEach((v) => log(v.completedAt!, 'Visit Completed', 'Visit', v.id, id, `${v.type} visit at ${base.sites.find((s) => s.id === v.siteId)?.name ?? ''} completed.`, null, `${v.hours} h`, 'System', v.workOrder));
    }

    // Billing schedule
    const periods = BILLING_PER_YEAR[amc.commercial.billingFrequency] ?? 4;
    const total = Math.max(1, Math.round(periods * years));
    const amount = Math.round(amc.commercial.value / total);
    const discount = Math.round((amount * amc.commercial.discountPercent) / 100);
    const tax = amc.commercial.taxProfileId === 'TAX-STD' ? Math.round((amount - discount) * AMC_RULES.taxRate) : 0;
    const stepMonths = 12 / periods;
    for (let i = 0; i < total; i++) {
      const billingDate = addMonths(amc.period.startDate, i * stepMonths);
      const due = addDays(billingDate, 30);
      const net = amount - discount + tax;
      let st: BillingLine['status'] = 'Planned';
      let paid = 0;
      if (live || status === 'Pending Activation') {
        if (due < today()) {
          const r = rng.next();
          st = r < 0.75 ? 'Paid' : r < 0.88 ? 'Partially Paid' : 'Invoiced';
          paid = st === 'Paid' ? net : st === 'Partially Paid' ? Math.round(net * 0.5) : 0;
        } else if (billingDate <= today()) st = rng.chance(0.5) ? 'Invoiced' : 'Ready for Billing';
        if (status === 'Terminated' && billingDate > (amc.period.endDate)) st = 'Cancelled';
      }
      const bid = `BIL-${pad(billSeq++, 5)}`;
      db.billing.push({
        id: bid, number: bid, amcId: id, period: `${billingDate} → ${addDays(addMonths(billingDate, stepMonths), -1)}`, billingDate, dueDate: due, amount, discount, tax, net, currency: amc.commercial.currency, status: st,
        invoiceNumber: ['Invoiced', 'Partially Paid', 'Paid'].includes(st) ? `INV-${rng.int(20000, 29999)}` : null, paidAmount: paid, onHold: status === 'Suspended' && st === 'Planned',
      });
    }
    log(createdAt, 'Billing Generated', 'Billing', id, id, `${total} ${amc.commercial.billingFrequency.toLowerCase()} billing lines generated.`, null, `${amc.commercial.currency} ${amount.toLocaleString('en-US')} each`);

    if (status === 'Suspended') {
      db.suspensions.push({ id: `SUS-${id}`, amcId: id, suspensionDate: amc.suspension!.from, requestedBy: 'Finance', approvedBy: rng.pick(managers).name, reason: amc.suspension!.reason, periodDays: null, pauseMaintenance: true, pauseBilling: true, notes: '', resumedAt: null, status: 'Active' });
      log(at(amc.suspension!.from, 10), 'AMC Suspended', 'Suspension', `SUS-${id}`, id, amc.suspension!.reason, 'Active', 'Suspended');
    }
    if (status === 'Terminated') {
      db.terminations.push({ id: `TRM-${id}`, amcId: id, terminationDate: amc.period.endDate, type: rng.pick(['Customer Request', 'Mutual Termination', 'Early Termination']), requestedBy: customer.name, approvedBy: 'Abdullah Al-Faisal', reason: 'Customer consolidating maintenance providers.', noticePeriodDays: amc.period.noticePeriodDays, finalServiceDate: amc.period.endDate, outstandingBilling: 0, outstandingServices: 0, settlementStatus: 'Settled', documents: [], notes: '', createdAt: at(addDays(amc.period.endDate, -45), 10) });
      log(at(amc.period.endDate, 17), 'AMC Terminated', 'Termination', `TRM-${id}`, id, 'Terminated — historical records preserved.', 'Active', 'Terminated');
    }
    if (status === 'Expired') log(at(amc.period.endDate, 0), 'AMC Expired', 'AMC', id, id, 'End date reached — no active service entitlement.', 'Active', 'Expired', 'System');
    if (status === 'Renewed') log(at(amc.period.endDate, 9), 'AMC Renewed', 'Renewal', id, id, 'Renewed into a new service period.', 'Active', 'Renewed');
  }

  db.history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return db;
}
