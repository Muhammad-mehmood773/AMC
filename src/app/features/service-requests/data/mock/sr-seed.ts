import { buildAssetSeed } from '../../../assets/data/mock/asset-seed';
import { pad, random } from '../../../customers/data/mock/mock-utils';
import { buildSeed } from '../../../customers/data/mock/seed';
import { buildPmSeed } from '../../../preventive-maintenance/data/mock/pm-seed';
import { calendar } from '../../../sla/data/mock/sla-engine';
import { buildSlaSeed } from '../../../sla/data/mock/sla-seed';
import { addBusinessMinutes } from '../../../sla/data/sla-time';
import type { SrHistoryEvent } from '../../models/operations.model';
import type { SrReferenceData } from '../../models/reference.model';
import type { Activity, Classification, Coverage, HoldReason, Priority, RequestStatus, RequestType, ServiceRequest, SrWorkOrder } from '../../models/request.model';
import { SR_RULES, SUBCATEGORIES } from '../sr.config';
import { type SrDatabase, classifyText, coverageFor, priorityFor, route, skillsFor, slaFor } from './sr-engine';

interface Upstream { sla: ReturnType<typeof buildSlaSeed>; pm: ReturnType<typeof buildPmSeed>; assets: ReturnType<typeof buildAssetSeed>; base: ReturnType<typeof buildSeed> }
let upstream: Upstream | null = null;

/** Upstream module seeds are read-only here, so they are built once per session. */
function upstreamSeeds(): Upstream {
  return (upstream ??= { sla: buildSlaSeed(), pm: buildPmSeed(), assets: buildAssetSeed(), base: buildSeed() });
}

const BRANCH: Record<string, string> = { Central: 'Riyadh Branch', Western: 'Jeddah Branch', Eastern: 'Dammam Branch', Southern: 'Abha Branch', Northern: 'Tabuk Branch', GCC: 'GCC Desk' };

export function buildSrSeed(now = Date.now()): SrDatabase {
  const { sla, pm, assets: assetDb, base } = upstreamSeeds();
  const rng = random(20270109);
  const warranty = new Map(assetDb.warranties.filter((w) => w.isPrimary && !w.cancelled).map((w) => [w.assetId, w]));
  const amcCategories = (amcId: string) => sla.slas.find((s) => s.contract.amcId === amcId)?.scope.serviceCategories ?? [];

  const reference: SrReferenceData = {
    customers: sla.reference.customers.map((c) => ({ id: c.id, name: c.name, code: c.code, status: c.status, segment: c.segment, region: c.region, defaultSlaId: c.defaultSlaId })),
    contacts: base.contacts.map((c) => ({ id: c.id, customerId: c.customerId, siteId: c.siteId, name: `${c.firstName} ${c.lastName}`, phone: c.mobile || c.phone, email: c.email, isPrimary: c.isPrimary })),
    sites: base.sites.map((s) => ({ id: s.id, name: s.name, customerId: s.customerId, city: s.location.city, region: sla.reference.sites.find((x) => x.id === s.id)?.region ?? s.location.region, address: s.location.addressLine, access: [s.accessRequirements, s.securityRequirements].filter(Boolean).join(' · '), status: s.status })),
    assets: pm.reference.assets.map((a) => {
      const w = warranty.get(a.id);
      return { id: a.id, name: a.name, code: a.code, customerId: a.customerId, siteId: a.siteId, category: a.category, type: a.type, manufacturer: a.manufacturer, model: a.model, serialNumber: a.serialNumber, installationDate: a.installationDate, status: a.status, criticality: a.criticality, floor: a.floor, area: a.area, building: a.building, warrantyStatus: w ? (w.endDate >= new Date(now).toISOString().slice(0, 10) ? 'Active' : 'Expired') : 'No Warranty', warrantyEnd: w?.endDate ?? null, warrantyProvider: w?.provider ?? '' };
    }),
    services: sla.reference.services,
    serviceCategories: sla.reference.serviceCategories,
    contracts: sla.reference.contracts.map((c) => ({ id: c.id, number: c.number, name: c.name, customerId: c.customerId, status: c.status })),
    amcs: pm.reference.amcs.map((a) => ({ id: a.id, number: a.number, name: a.name, customerId: a.customerId, contractId: a.contractId, status: a.status, startDate: a.startDate, endDate: a.endDate, assetIds: a.assetIds, siteIds: sla.reference.amcs.find((x) => x.id === a.id)?.siteIds ?? [], serviceCategories: amcCategories(a.id), slaId: a.slaId })),
    slas: sla.slas.map((s) => ({ id: s.id, number: s.number, name: s.name })),
    technicians: sla.reference.technicians.map((t) => ({ id: t.id, name: t.name, team: t.team, region: t.region, skills: skillsFor(t.team), dailyCapacity: 5 })),
    teams: sla.reference.teams.filter((t) => t !== 'Service Desk'),
    regions: sla.reference.regions,
    branches: [...new Set(Object.values(BRANCH))],
    companies: [SR_RULES.company],
    parts: pm.parts.map((p) => ({ partNumber: p.partNumber, description: p.description, unitCost: p.unitCost })),
    users: [...sla.reference.users, { id: 'USR-60', name: 'Noura Al-Harbi', role: 'Dispatcher' }],
    currentUser: { id: 'USR-50', name: 'Khalid Al-Mutairi', role: 'Service Supervisor' },
  };

  const db: SrDatabase = { reference, sla, requests: [], history: [] };
  let seq = 1;
  const uid = (p: string) => `${p}-${pad(seq++, 6)}`;
  const dispatcher = 'Noura Al-Harbi';
  const agents = ['Noura Al-Harbi', 'Fahad Al-Shehri', 'Customer Portal'];
  const log = (e: Omit<SrHistoryEvent, 'id'>) => db.history.push({ ...e, id: uid('SRH') });
  const assetOf = new Map(assetDb.serviceRequests.map((r) => [r.id, r.assetId]));
  const businessAt = (r: ServiceRequest, minutes: number) => (r.sla.calendarId ? new Date(addBusinessMinutes(calendar(sla, r.sla.calendarId), sla.holidays, r.createdAt, minutes)).toISOString() : new Date(new Date(r.createdAt).getTime() + minutes * 60_000).toISOString());
  const cap = (iso: string) => (new Date(iso).getTime() > now ? new Date(now - 3_600_000).toISOString() : iso);

  interface Seed { id: string; number: string; subject: string; customerId: string; siteId: string; assetId: string | null; priority: Priority | null; createdAt: string; status: RequestStatus; type?: RequestType; source?: string; origin?: ServiceRequest['origin']; category?: string; description?: string }
  const make = (s: Seed): ServiceRequest => {
    const asset = reference.assets.find((a) => a.id === s.assetId) ?? null;
    const site = reference.sites.find((x) => x.id === s.siteId);
    const { rule, category } = classifyText(db, s.subject, s.assetId);
    const serviceCategory = s.category ?? category ?? 'Inspection & Compliance';
    const type: RequestType = s.type ?? rule?.type ?? 'Service Request';
    const coverage = coverageFor(db, s.customerId, s.siteId, s.assetId, serviceCategory, type, 'Medium', s.createdAt.slice(0, 10));
    const urgency = rule?.urgency ?? 'Medium';
    const impact = rng.pick(['High', 'Medium', 'Medium', 'Low']);
    const users = rng.pick([1, 3, 5, 12, 25, 60]);
    const p = priorityFor(db, { urgency, businessImpact: impact, affectedUsers: users, assetId: s.assetId, customerId: s.customerId, coverage, serviceCategory });
    const priority = s.priority ?? p.priority;
    const coverageFinal: Coverage = { ...coverage, requiresCustomerConfirmation: SR_RULES.confirmationRequiredFor.includes(priority) || (SR_RULES.confirmationRequiredForCovered && (coverage.result === 'Covered' || coverage.result === 'Partially Covered')) };
    const service = reference.services.find((x) => x.category === serviceCategory && /Corrective|Breakdown|Repair|Emergency/.test(x.type)) ?? reference.services.find((x) => x.category === serviceCategory) ?? null;
    const contact = reference.contacts.find((c) => c.customerId === s.customerId && (c.siteId === s.siteId || c.isPrimary)) ?? reference.contacts.find((c) => c.customerId === s.customerId);
    const classification: Classification = {
      problemCategory: rule?.problemCategory ?? 'General', problemCode: rng.pick(['P-COOL-01 No cooling', 'P-ELEC-02 No power', 'P-LIFT-03 Lift stopped', 'P-FIRE-04 Panel fault', 'P-LEAK-05 Water leak', 'P-NOISE-06 Abnormal noise']), serviceCode: service?.code ?? '',
      failureType: rng.pick(['Mechanical', 'Electrical', 'Wear & Tear', 'Electronic / Control']), symptom: rng.pick(['Not working', 'Intermittent', 'Alarm active', 'Leaking', 'Noisy']), cause: '', requestedServiceId: service?.id ?? null,
      urgency, businessImpact: impact, affectedUsers: users, requiredSkill: route(db, serviceCategory, s.siteId).skill, suggestedBy: rule ? `${rule.id}: keyword classification` : 'Asset category',
    };
    const snapshot = slaFor(db, { customerId: s.customerId, siteId: s.siteId, assetId: s.assetId, priority, coverage, serviceId: service?.id ?? null, type, date: s.createdAt });
    const r: ServiceRequest = {
      id: s.id, number: s.number, createdAt: s.createdAt, createdBy: s.source === 'Customer Portal' ? 'Customer Portal' : rng.pick(agents), updatedAt: s.createdAt, company: SR_RULES.company, branch: BRANCH[site?.region ?? 'Central'] ?? 'Riyadh Branch',
      type, serviceCategory, subcategory: rule?.subcategory ?? SUBCATEGORIES[serviceCategory]?.[0] ?? '', subject: s.subject, description: s.description ?? `${s.subject}. Reported at ${site?.name ?? 'site'}${asset ? ` on ${asset.name}` : ''}. Customer requests attendance as soon as possible.`,
      source: s.source ?? rng.pick(['Phone', 'Phone', 'Email', 'Customer Portal', 'WhatsApp', 'Mobile App']), requestedDate: null, requestedTime: '', priority, priorityReason: p.factors.join('; '), customerReference: rng.chance(0.4) ? `CR-${rng.int(10000, 99999)}` : '',
      customer: { customerId: s.customerId, contactId: contact?.id ?? null, contactName: contact?.name ?? '', phone: contact?.phone ?? '', email: contact?.email ?? '' },
      location: { siteId: s.siteId, building: asset?.building ?? '', area: asset?.area ?? '', accessInstructions: site?.access ?? '' },
      assetId: s.assetId, classification, coverage: coverageFinal, sla: snapshot, status: 'New',
      assignment: { team: null, technician: null, dispatcher: null, method: '', skill: classification.requiredSkill, region: site?.region ?? '', assignedAt: null, reason: '' }, assignmentHistory: [], schedule: null, scheduleHistory: [], holds: [],
      escalation: { level: 0, events: [] }, workOrders: [], activities: [], attachments: [], resolution: null, previousResolutions: [], reopenCount: 0, linkedRequestIds: [], duplicateOf: null,
      origin: s.origin ?? { process: s.source === 'Customer Portal' ? 'Customer Portal' : 'Manual', planId: null, planNumber: null, occurrence: null, parentRequestId: null }, cancellation: null, notes: { customer: '', internal: '' },
    };
    return progress(r, s.status);
  };

  const act = (at: string, type: Activity['type'], user: string, message: string, visibility: Activity['visibility'] = 'Customer Visible', direction: Activity['direction'] = 'Outbound'): Activity => ({ id: uid('ACT'), type, at, user, direction, message, attachment: null, followUp: null, visibility });

  /** Moves a freshly created request along its lifecycle to the seeded status. */
  const progress = (r0: ServiceRequest, status: RequestStatus): ServiceRequest => {
    let r = r0;
    const ev = (timestamp: string, action: SrHistoryEvent['action'], prev: string | null, next: string | null, reason: string, source = 'Manual', related: string | null = null, user = dispatcher) => log({ timestamp, user, action, requestId: r.id, requestNumber: r.number, previousValue: prev, newValue: next, reason, source, relatedRecord: related });
    ev(r.createdAt, 'Request Created', null, r.number, `${r.type} via ${r.source}`, r.origin.process === 'PM Plan' ? `Preventive Maintenance — ${r.origin.planNumber}` : r.source === 'Customer Portal' ? 'Customer Portal' : 'Manual', r.origin.planNumber, r.createdBy);
    ev(r.createdAt, 'Coverage Validated', null, r.coverage.result, r.coverage.entitlement || 'No entitlement', 'Automation rule: contract / AMC validation', r.coverage.amcId, 'System');
    if (r.sla.slaId) ev(r.createdAt, 'SLA Applied', null, r.sla.slaNumber, `${r.sla.applicability} — response ${r.sla.responseMinutes} min, resolution ${r.sla.resolutionMinutes} min`, 'Automation rule: SLA assignment', r.sla.slaId, 'System');
    r = { ...r, activities: [act(r.createdAt, r.source === 'Email' ? 'Email' : r.source === 'Customer Portal' ? 'Portal Message' : 'Customer Call', r.customer.contactName || 'Customer', r.subject, 'Customer Visible', 'Inbound')] };
    if (status === 'New') return r;
    if (r.coverage.chargeable) {
      const approved = status !== 'Under Validation' && status !== 'Rejected';
      r = { ...r, coverage: { ...r.coverage, approval: approved ? 'Approved' : status === 'Rejected' ? 'Rejected' : 'Pending' } };
      if (status === 'Under Validation') return { ...r, status: 'Under Validation' };
      if (status === 'Rejected') {
        const at = cap(businessAt(r, 120));
        ev(at, 'Request Rejected', 'Under Validation', 'Rejected', 'Customer declined the chargeable quotation.');
        return { ...r, status: 'Rejected', updatedAt: at, cancellation: { reason: 'Customer declined quotation', comment: '', by: dispatcher, at } };
      }
      ev(r.createdAt, 'Chargeable Approval', 'Pending', 'Approved', 'Customer approved the quotation.');
    }
    r = { ...r, status: 'Validated' };
    if (status === 'Validated' || status === 'Under Validation') return r;
    if (status === 'Rejected') {
      const at = cap(businessAt(r, 90));
      ev(at, 'Request Rejected', 'Validated', 'Rejected', 'Service Not Supported');
      return { ...r, status: 'Rejected', updatedAt: at, cancellation: { reason: 'Service Not Supported', comment: '', by: dispatcher, at } };
    }
    if (status === 'Cancelled') {
      const at = cap(businessAt(r, 60));
      ev(at, 'Request Cancelled', 'Validated', 'Cancelled', 'Customer Withdrew Request');
      return { ...r, status: 'Cancelled', updatedAt: at, cancellation: { reason: 'Customer Withdrew Request', comment: 'Issue resolved by site staff.', by: dispatcher, at } };
    }
    const rt = route(db, r.serviceCategory, r.location.siteId);
    const respondFactor = 0.2 + rng.next() * (r.priority === 'Critical' ? 1.4 : 1.0);
    const assignedAt = cap(businessAt(r, (r.sla.responseMinutes ?? 120) * respondFactor));
    const assignment = { team: rt.team, technician: rt.technician ?? rng.pick(reference.technicians).name, dispatcher, method: rt.technician ? 'Automatic Assignment' : 'Manual Assignment', skill: rt.skill, region: rt.region, assignedAt, reason: rt.technician ? `Skill ${rt.skill} · ${rt.region} · lowest workload` : 'Manual dispatch' };
    r = { ...r, status: 'Assigned', assignment, assignmentHistory: [{ ...assignment, by: dispatcher }], sla: { ...r.sla, respondedAt: assignedAt }, activities: [...r.activities, act(assignedAt, 'SMS', 'System', `Technician ${assignment.technician} has been assigned to ${r.number}.`)] };
    ev(assignedAt, 'Assignment Created', null, assignment.technician, assignment.reason, assignment.method === 'Automatic Assignment' ? 'Automation rule: automatic technician assignment' : 'Manual');
    if (status === 'Assigned') return r;
    const schedDate = new Date(Math.min(now + 2 * 86_400_000, new Date(assignedAt).getTime() + 86_400_000)).toISOString().slice(0, 10);
    const startTime = rng.pick(['08:00', '09:30', '11:00', '13:30', '15:00']);
    const schedule = { scheduledDate: schedDate, startTime, endTime: `${String(+startTime.slice(0, 2) + 2).padStart(2, '0')}${startTime.slice(2)}`, durationMinutes: 120, appointmentType: r.priority === 'Critical' ? 'Emergency Call-Out' : 'On-Site Visit', customerAvailability: 'Business hours', access: r.location.accessInstructions };
    r = { ...r, status: 'Scheduled', schedule, scheduleHistory: [{ ...schedule, at: assignedAt, by: dispatcher, reason: 'Initial appointment' }] };
    ev(assignedAt, 'Schedule Created', null, `${schedDate} ${startTime}`, 'Appointment booked with the customer.');
    if (status === 'Scheduled') return r;
    const woId = uid('SWO');
    const wo: SrWorkOrder = { id: woId, number: `WO-SR-${woId.slice(-5)}`, status: 'In Progress', createdAt: assignedAt, team: assignment.team, technician: assignment.technician, scheduledDate: schedDate, completedAt: null, labourMinutes: 0, travelCost: SR_RULES.travelCostPerVisit, parts: [], billable: r.coverage.chargeable, checklistCompleted: false };
    r = { ...r, status: 'In Progress', workOrders: [wo] };
    ev(assignedAt, 'Work Order Created', null, wo.number, 'Field execution required.', 'Manual', wo.number);
    if (status === 'Pending') {
      const reason: HoldReason = rng.pick(['Waiting for Parts', 'Waiting for Customer', 'Waiting for Site Access', 'Waiting for Vendor', 'Waiting for Information'] as HoldReason[]);
      const startedAt = cap(new Date(Math.max(new Date(assignedAt).getTime() + 3_600_000, now - rng.int(10, 100) * 3_600_000)).toISOString());
      r = { ...r, status: 'Pending', holds: [{ reason, startedAt, expectedResume: new Date(now + rng.int(1, 4) * 86_400_000).toISOString().slice(0, 10), endedAt: null, notes: reason === 'Waiting for Parts' ? 'Compressor contactor on order.' : '', responsible: reason === 'Waiting for Customer' ? 'Customer' : 'Service team', pausesSla: SR_RULES.slaPauseReasons.includes(reason), previousStatus: 'In Progress' }] };
      ev(startedAt, 'Request Put On Hold', 'In Progress', 'Pending', reason);
      return r;
    }
    if (status === 'In Progress') return r;
    // Resolved / Closed / Reopened
    const resolveFactor = 0.3 + rng.next() * 1.2;
    const resolvedAt = cap(businessAt(r, (r.sla.resolutionMinutes ?? 1440) * resolveFactor));
    const labour = rng.int(45, 240);
    const parts = rng.chance(0.5) ? [rng.pick(reference.parts)].map((p) => ({ partNumber: p.partNumber, description: p.description, quantity: rng.int(1, 2), unitCost: p.unitCost })) : [];
    const code = rng.pick(['Repaired', 'Part Replaced', 'Adjusted / Calibrated', 'Cleaned / Serviced', 'No Fault Found']);
    const resolution = {
      code, category: code === 'No Fault Found' ? 'No Fault Found' : 'Fixed', description: `${code} — ${r.subject.toLowerCase()} rectified and tested.`, rootCause: rng.pick(['Worn component', 'Clogged filter', 'Loose connection', 'Control fault', 'Low refrigerant', 'Operator error']), correctiveAction: 'Component serviced and system tested under load.',
      recommendation: rng.pick(['Include in next PPM visit.', 'Replace unit within 12 months.', 'No further action.']), findings: 'Unit operating within parameters after repair.', labourMinutes: labour, completedAt: resolvedAt, resolvedBy: assignment.technician,
      confirmation: status === 'Closed' ? { confirmed: true, by: r.customer.contactName || 'Customer', at: cap(new Date(new Date(resolvedAt).getTime() + 4 * 3_600_000).toISOString()), comment: 'Thank you — working fine.' } : null, closureNotes: status === 'Closed' ? 'Closed after customer confirmation.' : '',
    };
    r = { ...r, status: 'Resolved', resolution, sla: { ...r.sla, resolvedAt }, workOrders: [{ ...wo, status: 'Completed', completedAt: resolvedAt, labourMinutes: labour, parts, checklistCompleted: true }], updatedAt: resolvedAt };
    ev(resolvedAt, 'Work Order Updated', 'In Progress', 'Completed', `${labour} min labour${parts.length ? `, ${parts.map((p) => p.partNumber).join(', ')}` : ''}`, 'Manual', wo.number, assignment.technician);
    ev(resolvedAt, 'Request Resolved', 'In Progress', 'Resolved', resolution.description, 'Manual', null, assignment.technician);
    if (status === 'Resolved') return r;
    if (status === 'Reopened') {
      const at = cap(new Date(new Date(resolvedAt).getTime() + 2 * 86_400_000).toISOString());
      ev(at, 'Request Reopened', 'Resolved', 'Reopened', 'Issue Recurred');
      return { ...r, status: 'Reopened', previousResolutions: [resolution], resolution: null, reopenCount: 1, sla: { ...r.sla, resolvedAt: null }, updatedAt: at, activities: [...r.activities, act(at, 'Customer Call', r.customer.contactName || 'Customer', 'Issue has come back — please revisit.', 'Customer Visible', 'Inbound')] };
    }
    if (status !== 'Closed' || !resolution.confirmation) return r;
    const closedAt = resolution.confirmation.at;
    ev(closedAt, 'Customer Confirmation', null, 'Accepted', resolution.confirmation!.comment, 'Customer', null, resolution.confirmation!.by);
    ev(closedAt, 'Request Closed', 'Resolved', 'Closed', 'Closure validation passed.');
    return { ...r, status: 'Closed', updatedAt: closedAt };
  };

  // Requests from the customer master data (same numbers as Customer 360 / Asset 360).
  const statusMap: Record<string, RequestStatus[]> = { New: ['New', 'Validated', 'Under Validation'], Assigned: ['Assigned', 'Scheduled'], 'In Progress': ['In Progress'], 'On Hold': ['Pending'], Resolved: ['Resolved'], Closed: ['Closed', 'Closed', 'Closed', 'Cancelled', 'Reopened'] };
  for (const sr of base.serviceRequests) {
    let status = rng.pick(statusMap[sr.status] ?? ['New']);
    if (status === 'Reopened' && (now - new Date(sr.createdAt).getTime()) / 86_400_000 > 20) status = 'Closed';
    db.requests.push(make({ id: sr.id, number: sr.number, subject: sr.subject, customerId: sr.customerId, siteId: sr.siteId, assetId: assetOf.get(sr.id) ?? null, priority: sr.priority, createdAt: sr.createdAt, status }));
  }
  let next = Math.max(...db.requests.map((r) => Number(r.number.replace(/\D/g, '')) || 0)) + 1;
  const newNumber = () => `SR-${next++}`;

  // PM-generated requests linked to the originating plan / occurrence (SRS 9.19).
  const day = new Date(now).toISOString().slice(0, 10);
  const pmDue = pm.occurrences.filter((o) => ['Scheduled', 'Assigned'].includes(o.status) && o.scheduledDate >= day && o.scheduledDate <= new Date(now + 5 * 86_400_000).toISOString().slice(0, 10)).slice(0, 6);
  for (const o of pmDue) {
    const plan = pm.plans.find((p) => p.id === o.planId)!;
    const number = newNumber();
    db.requests.push(make({ id: number, number, subject: `Preventive maintenance — ${plan.maintenanceType}`, description: `Generated from ${plan.number} occurrence ${o.number} due ${o.dueDate}.`, customerId: o.customerId, siteId: o.siteId, assetId: o.assetId, priority: 'Medium', createdAt: new Date(now - rng.int(2, 30) * 3_600_000).toISOString(), status: rng.pick(['Validated', 'Assigned', 'Scheduled'] as RequestStatus[]), type: 'PM Generated Request', source: 'PM Plan', category: 'Preventive Maintenance', origin: { process: 'PM Plan', planId: plan.id, planNumber: plan.number, occurrence: o.number, parentRequestId: null } }));
  }
  // Internal, follow-up, critical unassigned and duplicate examples.
  const site0 = reference.sites[3];
  const internal = newNumber();
  db.requests.push(make({ id: internal, number: internal, subject: 'Office AC not cooling — 3rd floor', customerId: site0.customerId, siteId: site0.id, assetId: null, priority: 'Low', createdAt: new Date(now - 5 * 3_600_000).toISOString(), status: 'Assigned', type: 'Internal Service Request', source: 'Internal', origin: { process: 'Internal', planId: null, planNumber: null, occurrence: null, parentRequestId: null } }));
  const closed = db.requests.filter((r) => r.status === 'Closed').slice(0, 2);
  for (const parent of closed) {
    const n = newNumber();
    db.requests.push(make({ id: n, number: n, subject: `Follow-up: ${parent.subject}`, customerId: parent.customer.customerId, siteId: parent.location.siteId, assetId: parent.assetId, priority: 'Low', createdAt: new Date(now - rng.int(10, 40) * 3_600_000).toISOString(), status: 'Validated', type: 'Follow-up Request', source: 'Technician', origin: { process: 'Follow-up', planId: null, planNumber: null, occurrence: null, parentRequestId: parent.id } }));
  }
  const liftAsset = reference.assets.find((a) => a.category === 'Vertical Transport' && reference.amcs.some((m) => m.assetIds.includes(a.id) && m.status === 'Active'));
  if (liftAsset) {
    const n = newNumber();
    db.requests.push(make({ id: n, number: n, subject: 'Passengers stuck in elevator — entrapment', customerId: liftAsset.customerId, siteId: liftAsset.siteId, assetId: liftAsset.id, priority: 'Critical', createdAt: new Date(now - 50 * 60_000).toISOString(), status: 'Validated', source: 'Phone' }));
    const d = newNumber();
    const dup = make({ id: d, number: d, subject: 'Elevator stopped between floors', customerId: liftAsset.customerId, siteId: liftAsset.siteId, assetId: liftAsset.id, priority: 'Critical', createdAt: new Date(now - 35 * 60_000).toISOString(), status: 'New', source: 'WhatsApp' });
    db.requests.push({ ...dup, duplicateOf: n, linkedRequestIds: [n] });
    db.requests = db.requests.map((r) => (r.id === n ? { ...r, linkedRequestIds: [d] } : r));
    log({ timestamp: dup.createdAt, user: 'System', action: 'Duplicate Linked', requestId: d, requestNumber: d, previousValue: null, newValue: n, reason: 'Same customer, site and asset; similar description', source: 'Automation rule: duplicate detection', relatedRecord: n });
  }
  db.history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return db;
}
