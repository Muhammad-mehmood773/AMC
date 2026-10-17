import { buildCatalogSeed } from '../../../catalog/data/mock/catalog-seed';
import { LOOKUPS_SEED } from '../../../customers/data/mock/lookups.seed';
import { dateFromNow, daysFromNow, pad, random } from '../../../customers/data/mock/mock-utils';
import { buildSeed } from '../../../customers/data/mock/seed';
import type { AgreementSummary } from '../../../customers/models/related.model';
import type { Contract, ContractStatus, ContractType } from '../../models/contract.model';
import type { ContractReferenceData, UserRef } from '../../models/shared.model';
import type {
  Amendment,
  ApprovalStep,
  ContractClause,
  ContractDocument,
  ContractHistoryEvent,
  ContractRequest,
  ContractReview,
  ContractTemplate,
  ContractVersion,
  HistoryAction,
  HistoryEntity,
  NegotiationEntry,
  Obligation,
  ObligationType,
  Renewal,
  Signatory,
  SignatureEnvelope,
  Termination,
} from '../../models/workflow.model';
import { APPROVAL_LEVELS, CONTRACT_RULES } from '../contract.config';

export interface ContractDatabase {
  reference: ContractReferenceData;
  contracts: Contract[];
  requests: ContractRequest[];
  templates: ContractTemplate[];
  clauses: ContractClause[];
  reviews: ContractReview[];
  negotiation: NegotiationEntry[];
  approvals: ApprovalStep[];
  envelopes: SignatureEnvelope[];
  signatories: Signatory[];
  obligations: Obligation[];
  amendments: Amendment[];
  renewals: Renewal[];
  terminations: Termination[];
  versions: ContractVersion[];
  documents: ContractDocument[];
  history: ContractHistoryEvent[];
}

const CONTRACT_USERS: readonly UserRef[] = [
  { id: 'USR-10', name: 'Majed Al-Otaibi', email: 'majed.otaibi@gfs.sa', role: 'Contract Manager' },
  { id: 'USR-14', name: 'Hana Kamal', email: 'hana.kamal@gfs.sa', role: 'Contract Manager' },
  { id: 'USR-11', name: 'Reem Al-Saud', email: 'reem.saud@gfs.sa', role: 'Legal Counsel' },
  { id: 'USR-12', name: 'Tariq Mansour', email: 'tariq.mansour@gfs.sa', role: 'Finance Manager' },
  { id: 'USR-13', name: 'Abdullah Al-Faisal', email: 'abdullah.faisal@gfs.sa', role: 'Operations Director' },
  { id: 'USR-15', name: 'Imran Siddiqui', email: 'imran.siddiqui@gfs.sa', role: 'Technical Manager' },
];

const CLAUSES: readonly [string, string, ContractClause['type'], boolean, string][] = [
  ['CL-PAY-01', 'Standard Payment Terms', 'Payment Terms', true, 'The Customer shall pay each undisputed invoice within the agreed payment term from the invoice date. Late payments may attract a charge of 1% per month.'],
  ['CL-PAY-02', 'Advance Payment', 'Payment Terms', false, 'An advance payment of the agreed percentage of the annual contract value is payable on signature and adjusted against the first invoices.'],
  ['CL-SLA-01', 'Service Levels', 'SLA', true, 'The Company shall respond to and resolve service requests within the response and resolution times defined in the SLA schedule.'],
  ['CL-SLA-02', 'SLA Service Credits', 'SLA', false, 'Where the monthly SLA achievement falls below the target, the Customer is entitled to service credits as set out in the SLA schedule, capped at 10% of the monthly fee.'],
  ['CL-WAR-01', 'Workmanship Warranty', 'Warranty', true, 'All workmanship is warranted for ninety (90) days from completion. Replaced parts carry the manufacturer warranty.'],
  ['CL-CON-01', 'Confidentiality', 'Confidentiality', true, 'Each party shall keep confidential all information disclosed by the other party and use it only for the purposes of this Contract.'],
  ['CL-LIA-01', 'Limitation of Liability', 'Liability', true, 'Each party’s aggregate liability under this Contract is limited to the annual contract value, except for fraud, wilful misconduct or death and personal injury.'],
  ['CL-INS-01', 'Insurance', 'Insurance', true, 'The Company shall maintain public liability insurance of not less than SAR 5,000,000 and provide certificates on request.'],
  ['CL-PEN-01', 'Delay Penalties', 'Penalty', false, 'Delays in planned maintenance beyond 7 days attract a penalty of 0.5% of the monthly fee per day, capped at 10%.'],
  ['CL-TER-01', 'Termination for Convenience', 'Termination', true, 'Either party may terminate this Contract by giving the agreed notice in writing. Fees are payable up to the effective termination date.'],
  ['CL-TER-02', 'Termination for Breach', 'Termination', true, 'Either party may terminate immediately if the other party commits a material breach not remedied within thirty (30) days of notice.'],
  ['CL-REN-01', 'Renewal', 'Renewal', false, 'This Contract renews automatically for successive renewal terms unless either party gives notice of non-renewal before the notice period.'],
  ['CL-ESC-01', 'Annual Price Escalation', 'Price Escalation', false, 'Prices are reviewed annually on the price revision date and adjusted by the agreed escalation percentage.'],
  ['CL-DPR-01', 'Data Protection', 'Data Protection', true, 'The parties shall process personal data in accordance with the Personal Data Protection Law and applicable regulations.'],
  ['CL-CMP-01', 'Compliance with Laws', 'Compliance', true, 'The Company shall comply with all applicable laws, Civil Defense requirements, HSE regulations and site rules.'],
  ['CL-DIS-01', 'Dispute Resolution', 'Dispute Resolution', true, 'Disputes shall first be escalated to senior management; unresolved disputes shall be referred to the competent jurisdiction.'],
  ['CL-FM-01', 'Force Majeure', 'Force Majeure', true, 'Neither party is liable for failure to perform due to events beyond its reasonable control, provided notice is given promptly.'],
  ['CL-IP-01', 'Intellectual Property', 'Intellectual Property', false, 'Each party retains ownership of its pre-existing intellectual property. Reports produced under this Contract may be used by the Customer.'],
];

const TEMPLATES: readonly [string, string, ContractType, string, readonly string[]][] = [
  ['TPL-AMC-EN', 'AMC Standard Agreement', 'AMC Contract', 'English', ['CL-PAY-01', 'CL-SLA-01', 'CL-WAR-01', 'CL-CON-01', 'CL-LIA-01', 'CL-INS-01', 'CL-TER-01', 'CL-REN-01', 'CL-DIS-01', 'CL-FM-01']],
  ['TPL-AMC-AR', 'اتفاقية الصيانة السنوية', 'AMC Contract', 'Arabic', ['CL-PAY-01', 'CL-SLA-01', 'CL-WAR-01', 'CL-CON-01', 'CL-LIA-01', 'CL-TER-01', 'CL-DIS-01', 'CL-FM-01']],
  ['TPL-SVC-EN', 'Service Contract', 'Service Contract', 'English', ['CL-PAY-01', 'CL-SLA-01', 'CL-SLA-02', 'CL-CON-01', 'CL-LIA-01', 'CL-INS-01', 'CL-TER-01', 'CL-TER-02', 'CL-DIS-01', 'CL-FM-01']],
  ['TPL-MSA-BI', 'Master Service Agreement', 'Master Service Agreement', 'English / Arabic (bilingual)', ['CL-PAY-01', 'CL-CON-01', 'CL-LIA-01', 'CL-INS-01', 'CL-TER-01', 'CL-TER-02', 'CL-DPR-01', 'CL-CMP-01', 'CL-DIS-01', 'CL-FM-01', 'CL-IP-01']],
  ['TPL-MNG-EN', 'Managed Facility Services', 'Managed Service Contract', 'English', ['CL-PAY-01', 'CL-SLA-01', 'CL-SLA-02', 'CL-PEN-01', 'CL-CON-01', 'CL-LIA-01', 'CL-INS-01', 'CL-TER-01', 'CL-ESC-01', 'CL-DIS-01']],
  ['TPL-SUB-EN', 'Subcontractor Agreement', 'Subcontractor Contract', 'English', ['CL-PAY-01', 'CL-SLA-01', 'CL-INS-01', 'CL-CMP-01', 'CL-CON-01', 'CL-TER-02', 'CL-DIS-01']],
  ['TPL-PRJ-EN', 'Installation Project Contract', 'Project / Installation Contract', 'English', ['CL-PAY-02', 'CL-WAR-01', 'CL-PEN-01', 'CL-LIA-01', 'CL-INS-01', 'CL-TER-02', 'CL-DIS-01']],
];

const VENDORS: readonly [string, ContractType, string][] = [
  ['Schindler Saudi Arabia', 'Subcontractor Contract', 'Elevator OEM maintenance support'],
  ['Al-Zamil Air Conditioners', 'Supplier Contract', 'HVAC spare parts supply framework'],
  ['Tyco Fire & Security KSA', 'Partner Contract', 'Fire alarm systems partner agreement'],
  ['National Fleet Leasing Co.', 'Lease Contract', 'Service vehicle fleet lease'],
];

const DRAFT_PIPELINE: readonly ContractStatus[] = ['Draft', 'Under Review', 'Under Negotiation', 'Pending Approval', 'Approved', 'Pending Signature', 'Partially Signed', 'Draft', 'Under Review', 'Pending Approval'];
const STAGE_INDEX: Record<string, number> = { Draft: 0, 'Under Review': 1, 'Under Negotiation': 2, 'Pending Approval': 3, Approved: 4, 'Pending Signature': 5, 'Partially Signed': 6 };

const typeFor = (a: AgreementSummary): ContractType =>
  a.kind === 'AMC' ? 'AMC Contract' : a.title.startsWith('Integrated') ? 'Managed Service Contract' : a.title.startsWith('MEP') ? 'Service Contract' : a.title.startsWith('Hard') ? 'Maintenance Contract' : 'Support Contract';

const monthsBetween = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (30.44 * 86_400_000)));

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);
const at = (date: string, hour = 10) => {
  const iso = `${date}T${pad(hour, 2)}:${pad((hour * 7) % 60, 2)}:00.000Z`;
  return iso > new Date().toISOString() ? daysFromNow(-0.02) : iso;
};

/** Snapshot of the main terms, used for version and clause comparison. */
export function snapshotOf(c: Contract, clauseNames: (ids: readonly string[]) => string, slaName: (id: string | null) => string): Record<string, string> {
  return {
    Title: c.title,
    Type: c.type,
    'Contract Value': `${c.commercial.currency} ${c.commercial.value.toLocaleString('en-US')}`,
    Discount: `${c.commercial.discountPercent}%`,
    'Start Date': c.period.startDate,
    'End Date': c.period.endDate,
    'Notice Period': `${c.period.noticePeriodDays} days`,
    'Billing Frequency': c.commercial.billingFrequency,
    'Price Escalation': c.commercial.priceEscalationPercent === null ? '—' : `${c.commercial.priceEscalationPercent}%`,
    SLA: slaName(c.scopeInfo.slaId),
    'Sites Covered': String(c.scopeInfo.siteIds.length),
    'Assets Covered': String(c.scopeInfo.assetIds.length),
    'Services Covered': String(c.scopeInfo.serviceIds.length),
    'Liability Limit': c.legal.liabilityLimit === null ? 'Unlimited' : c.legal.liabilityLimit.toLocaleString('en-US'),
    'Governing Law': c.legal.governingLaw,
    'Penalty Terms': c.legal.penaltyTerms || '—',
    Clauses: clauseNames(c.clauseIds),
  };
}

export function buildContractSeed(): ContractDatabase {
  const base = buildSeed();
  const catalog = buildCatalogSeed();
  const rng = random(20261105);
  const users: UserRef[] = [...LOOKUPS_SEED.users, ...CONTRACT_USERS];
  const managers = CONTRACT_USERS.filter((u) => u.role === 'Contract Manager');
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const contactName = (id: string | null) => {
    const c = base.contacts.find((x) => x.id === id);
    return c ? `${c.firstName} ${c.lastName}` : '';
  };

  const reference: ContractReferenceData = {
    customers: base.customers.map((c) => ({
      id: c.id, code: c.code, name: c.name, legalName: c.legalName, type: c.type, status: c.status, companyId: c.companyId, branchId: c.branchId,
      accountManagerId: c.commercial.accountManagerId, currency: c.commercial.currency, paymentTermsId: c.commercial.paymentTermsId, taxProfileId: c.commercial.taxProfileId,
      primaryContact: contactName(c.primaryContactId),
    })),
    sites: base.sites.map((s) => ({ id: s.id, code: s.code, name: s.name, customerId: s.customerId, city: s.location.city })),
    assets: base.assets.map((a) => ({ id: a.id, name: a.name, category: a.category, customerId: a.customerId, siteId: a.siteId })),
    services: catalog.services.map((s) => ({ id: s.id, code: s.code, name: s.name, category: catalog.categories.find((c) => c.id === s.categoryId)?.name ?? '', status: s.status })),
    entitlements: catalog.entitlements.map((e) => ({
      id: e.id, number: e.number, agreementId: e.contractId ?? e.amcId, coverageType: e.coverage.coverageType, status: e.status === 'Active' && e.validity.endDate < today() ? 'Expired' : e.status,
      endDate: e.validity.endDate, used: e.usage.usedVisits, allowed: e.usage.maxVisits,
    })),
    serviceHistory: base.serviceHistory.map((h) => ({ id: h.id, date: h.date, siteId: h.siteId, reference: h.reference, visitType: h.visitType, summary: h.summary, technician: h.technician, outcome: h.outcome })),
    users,
    companies: LOOKUPS_SEED.companies,
    branches: LOOKUPS_SEED.branches,
    slas: LOOKUPS_SEED.slas,
    paymentTerms: LOOKUPS_SEED.paymentTerms,
    taxProfiles: LOOKUPS_SEED.taxProfiles,
    currencies: LOOKUPS_SEED.currencies,
    serviceCategories: catalog.categories.filter((c) => !c.parentId).map((c) => c.name),
    currentUser: CONTRACT_USERS[0],
  };

  const db: ContractDatabase = {
    reference, contracts: [], requests: [], templates: [], clauses: [], reviews: [], negotiation: [], approvals: [], envelopes: [], signatories: [], obligations: [],
    amendments: [], renewals: [], terminations: [], versions: [], documents: [], history: [],
  };

  let seq = 1;
  const log = (timestamp: string, action: HistoryAction, entity: HistoryEntity, entityId: string, contractId: string | null, label: string, comments: string, previousValue: string | null = null, newValue: string | null = null, user?: string, ref: string | null = null) =>
    db.history.push({
      id: `CH-${pad(seq++, 6)}`, timestamp, user: user ?? rng.pick(users).name, action, entity, entityId, contractId, label, previousValue, newValue, reference: ref, comments,
      systemReference: `10.20.${rng.int(1, 40)}.${rng.int(2, 250)} · web`,
    });
  const audit = (createdAt: string, by?: string) => ({ createdAt, createdBy: by ?? rng.pick(managers).name, updatedAt: null, updatedBy: null });

  // ── Clauses & templates ─────────────────────────────────────────────────────
  CLAUSES.forEach(([code, name, type, mandatory, text], i) => {
    const createdAt = daysFromNow(-800 + i * 4, 10);
    db.clauses.push({ id: code, code, name, type, text, version: i % 5 === 0 ? '1.1' : '1.0', mandatory, status: 'Active', effectiveDate: createdAt.slice(0, 10), approvalRequired: mandatory || type === 'Liability', previousVersionId: null, ...audit(createdAt, 'Reem Al-Saud') });
  });
  db.clauses.push({ ...db.clauses[6], id: 'CL-LIA-00', code: 'CL-LIA-00', version: '0.9', status: 'Inactive', text: 'Each party’s liability is limited to the fees paid in the preceding six months.', ...audit(daysFromNow(-900, 10), 'Reem Al-Saud') });
  db.clauses = db.clauses.map((c) => (c.id === 'CL-LIA-01' ? { ...c, previousVersionId: 'CL-LIA-00' } : c));
  TEMPLATES.forEach(([code, name, type, language, clauses], i) => {
    const createdAt = daysFromNow(-780 + i * 6, 11);
    db.templates.push({
      id: code, code, name, contractType: type, description: `Standard ${type.toLowerCase()} template in ${language}.`, version: i === 0 ? '3.0' : '1.0', status: 'Active', language,
      effectiveDate: createdAt.slice(0, 10), expiryDate: null, defaultTerms: 'Payment Net 30 · Notice 60 days · Auto renewal 12 months · Governing law: Kingdom of Saudi Arabia',
      defaultClauseIds: clauses, requiredFields: ['Customer Legal Entity', 'Payment Terms', 'SLA', 'Governing Law', 'Sites Covered'].slice(0, 3 + (i % 3)), previousVersionId: null,
      ...audit(createdAt, 'Reem Al-Saud'),
    });
  });
  db.templates.push({ ...db.templates[0], id: 'TPL-AMC-EN-V2', code: 'TPL-AMC-EN', version: '2.0', status: 'Inactive', expiryDate: daysFromNow(-200).slice(0, 10), ...audit(daysFromNow(-1000, 10), 'Reem Al-Saud') });
  db.templates = db.templates.map((t) => (t.id === 'TPL-AMC-EN' ? { ...t, previousVersionId: 'TPL-AMC-EN-V2' } : t));

  const clauseNames = (ids: readonly string[]) => ids.map((id) => db.clauses.find((c) => c.id === id)?.name ?? id).join(', ');
  const slaName = (id: string | null) => LOOKUPS_SEED.slas.find((s) => s.id === id)?.name ?? '—';

  // ── Contracts ───────────────────────────────────────────────────────────────
  const customerById = new Map(base.customers.map((c) => [c.id, c]));
  let docSeq = 1;
  let obSeq = 1;
  let amSeq = 1;
  let rnSeq = 1;
  let tmSeq = 1;
  let draftIndex = 0;
  const addDoc = (contractId: string, name: string, type: ContractDocument['type'], uploadedAt: string, version = 1, locked = false, reference = '') => {
    const id = `CDOC-${pad(docSeq++, 5)}`;
    db.documents.push({ id, contractId, name, type, version, size: rng.int(120, 2400) * 1024, mime: 'application/pdf', uploadedBy: rng.pick(managers).name, uploadedAt, supersededById: null, locked, reference });
    return id;
  };
  const addVersion = (c: Contract, version: string, createdAt: string, summary: string, approval: string, execution: ContractVersion['executionStatus'], documentId: string | null) =>
    db.versions.push({ id: `${c.id}-v${version}`, contractId: c.id, version, createdAt, createdBy: rng.pick(managers).name, changeSummary: summary, approvalStatus: approval, executionStatus: execution, documentId, snapshot: snapshotOf(c, clauseNames, slaName) });

  const makeContract = (a: AgreementSummary | null, vendor?: (typeof VENDORS)[number], vendorIndex = 0): Contract => {
    const customer = a ? customerById.get(a.customerId)! : null;
    const type = a ? typeFor(a) : vendor![1];
    const template = db.templates.find((t) => t.contractType === type && t.status === 'Active') ?? (a?.kind === 'AMC' ? db.templates[0] : db.templates[2]);
    const startDate = a?.startDate ?? dateFromNow(-rng.int(60, 400));
    const endDate = a?.endDate ?? addMonths(startDate, rng.pick([12, 24, 36]));
    const value = a?.value ?? rng.int(20, 120) * 5000;
    const cost = Math.round(value * (0.58 + rng.next() * 0.25));
    const siteIds = a?.siteIds ?? [];
    const cats = type === 'AMC Contract' ? ['HVAC Services'] : ['HVAC Services', 'Electrical Services', 'Generator Services', 'Fire & Safety Services'].slice(0, rng.int(2, 4));
    const services = catalog.services.filter((s) => s.status === 'Active' && cats.includes(catalog.categories.find((c) => c.id === s.categoryId)?.name ?? '')).slice(0, rng.int(3, 7));
    const assets = base.assets.filter((x) => siteIds.includes(x.siteId)).filter(() => rng.chance(0.6));
    const manager = rng.pick(managers);
    const months = monthsBetween(startDate, endDate);
    const id = a?.id ?? `VEN-${pad(vendorIndex + 1, 5)}`;
    const createdAt = at(addDays(startDate, -rng.int(20, 45)), 9);
    return {
      id, number: id, title: a?.title ?? vendor![2], type, category: a ? (a.coverage.startsWith('Comprehensive') || a.coverage === 'Full scope' ? 'Comprehensive' : a.coverage.startsWith('Labour') ? 'Labour Only' : a.coverage.startsWith('Reactive') ? 'Reactive' : 'Planned Maintenance') : 'Procurement',
      status: 'Draft', version: '1.0', parentContractId: null, previousContractId: null, externalReference: customer ? `PO-${rng.int(40000, 99999)}` : `VND-${rng.int(1000, 9999)}`,
      requestId: null, templateId: template.id, clauseIds: [...template.defaultClauseIds], riskLevel: value >= 900_000 ? 'High' : value >= 300_000 ? 'Medium' : 'Low', signatureRequired: true,
      approvalStatus: 'Not Submitted', signatureStatus: 'Not Sent', executionDate: null, activatedAt: null, suspendedReason: null,
      parties: {
        customerId: customer?.id ?? null, legalEntity: customer?.legalName ?? vendor![0], contractingOrganizationId: customer?.companyId ?? 'CMP-01', branchId: customer?.branchId ?? 'BR-01',
        vendorPartner: vendor?.[0] ?? '', primaryContact: customer ? contactName(customer.primaryContactId) : 'Account Manager', ownerId: customer?.commercial.accountManagerId ?? manager.id, managerId: manager.id,
        accountManagerId: customer?.commercial.accountManagerId ?? null,
      },
      period: { effectiveDate: startDate, startDate, endDate, renewalDate: addDays(endDate, -60), noticePeriodDays: rng.pick([30, 60, 90]), autoRenewal: rng.chance(0.35), renewalTermMonths: Math.min(36, months), timeBound: true },
      scopeInfo: {
        scope: `${a?.coverage ?? 'Supply and support'} for ${siteIds.length || 'company'} site(s).`, serviceIds: services.map((s) => s.id), siteIds: [...siteIds], assetIds: assets.map((x) => x.id), serviceCategories: cats,
        slaId: customer?.operational.defaultSlaId ?? 'SLA-SLV', maintenanceRequirements: type === 'AMC Contract' ? 'Quarterly PPM visits with checklist-based reports.' : 'Monthly planned maintenance plus reactive call-outs.',
        exclusions: 'Civil works, major component replacement above SAR 10,000, damage due to misuse.',
      },
      commercial: {
        value, currency: a?.currency ?? 'SAR', billingFrequency: rng.pick(['Monthly', 'Quarterly', 'Quarterly', 'Annual']), paymentTermsId: customer?.commercial.paymentTermsId ?? 'PT-30', billingMethod: 'Fixed Fee',
        taxProfileId: customer?.commercial.taxProfileId ?? 'TAX-STD', discountPercent: rng.pick([0, 0, 5, 7.5, 12]), deposit: rng.chance(0.2) ? Math.round(value * 0.1) : null, advancePayment: rng.chance(0.3) ? Math.round(value * 0.25) : null,
        priceEscalationPercent: months > 12 ? rng.pick([3, 5]) : null, priceRevisionDate: months > 12 ? addMonths(startDate, 12) : null,
      },
      financial: { estimatedRevenue: value, estimatedCost: cost, billingAccount: `BA-${customer?.code ?? 'VEN'}`, revenueAccount: '4100-Service Revenue', costCenter: rng.pick(['CC-100 Operations Central', 'CC-200 Operations Western', 'CC-300 Operations Eastern']), profitCenter: type === 'AMC Contract' ? 'PC-20 Technical Maintenance' : 'PC-10 Facility Services' },
      service: { serviceFrequency: type === 'AMC Contract' ? 'Quarterly' : 'Monthly', includedVisits: type === 'AMC Contract' ? 4 * Math.ceil(months / 12) : null, laborCoverage: true, partsCoverage: a?.coverage.startsWith('Comprehensive') ?? false, travelCoverage: true, emergencyCoverage: rng.chance(0.5), serviceWindow: rng.pick(['Business Hours (08:00–17:00)', '24/7']) },
      legal: {
        governingLaw: 'Kingdom of Saudi Arabia', jurisdiction: rng.pick(['Riyadh Commercial Court', 'Jeddah Commercial Court', 'Dammam Commercial Court']), confidentiality: true, insuranceRequirement: 'Public liability SAR 5,000,000',
        complianceRequirements: 'Civil Defense, HSE and site security rules', penaltyTerms: rng.chance(0.4) ? '0.5% per day of delay, capped at 10%' : '', liabilityLimit: value, terminationConditions: '60 days written notice; immediate for uncured material breach',
        disputeResolution: rng.pick(['Negotiation', 'Arbitration', 'Litigation']),
      },
      notes: { internal: '', customer: '', legal: '', manager: '' },
      tracking: { billed: 0, collected: 0, recognizedRevenue: 0, actualCost: 0, additionalCharges: 0, slaBreaches: 0 },
      ...audit(createdAt, manager.name),
    };
  };

  const approvalSteps = (c: Contract, round: number, decidedUntil: number, createdAt: string, rejectedAt?: number) => {
    const customer = c.parties.customerId ? customerById.get(c.parties.customerId) : null;
    const ctx = {
      value: c.commercial.value, type: c.type, customerType: customer?.type ?? null, discountPercent: c.commercial.discountPercent,
      marginPercent: Math.round(((c.financial.estimatedRevenue - c.financial.estimatedCost) / Math.max(1, c.financial.estimatedRevenue)) * 100),
      durationMonths: monthsBetween(c.period.startDate, c.period.endDate), riskLevel: c.riskLevel, legalFlags: c.legal.liabilityLimit === null,
    };
    const levels = APPROVAL_LEVELS.map((l) => ({ l, reasons: l.when(ctx) })).filter((x) => x.reasons.length);
    levels.forEach(({ l, reasons }, i) => {
      const status = rejectedAt === i ? 'Returned for Changes' : i < decidedUntil ? 'Approved' : i === decidedUntil ? 'Pending' : 'Waiting';
      db.approvals.push({
        id: `APR-${c.id}-${round}-${l.level}`, contractId: c.id, subject: 'Contract', subjectId: c.id, round, level: l.level, levelName: l.name, role: l.role, approverId: l.approverId, delegateId: null,
        status, decidedAt: status === 'Approved' || status === 'Returned for Changes' ? at(addDays(createdAt.slice(0, 10), i + 1), 11 + i) : null,
        comments: status === 'Approved' ? 'Approved.' : status === 'Returned for Changes' ? 'Please revise the discount and payment terms.' : '', reasons, createdAt,
      });
    });
    return levels.length;
  };

  const signers = (c: Contract, signedCount: number, sentAt: string, status: SignatureEnvelope['status']) => {
    const envelopeId = `ENV-${c.id}`;
    const customer = c.parties.customerId ? customerById.get(c.parties.customerId) : null;
    const list = [
      { name: c.parties.primaryContact || 'Authorized Signatory', email: `signatory@${(customer?.code ?? 'vendor').toLowerCase()}.example`, role: 'Authorized Signatory', party: (customer ? 'Customer' : 'Counterparty') as Signatory['party'] },
      { name: 'Abdullah Al-Faisal', email: 'abdullah.faisal@gfs.sa', role: 'Operations Director', party: 'Company' as const },
    ];
    list.forEach((s, i) => {
      const signed = i < signedCount;
      db.signatories.push({
        id: `SIG-${c.id}-${i + 1}`, contractId: c.id, envelopeId, ...s, order: i + 1, status: signed ? 'Signed' : i === signedCount ? (rng.chance(0.5) ? 'Viewed' : 'Sent') : 'Waiting',
        sentAt: i <= signedCount ? at(sentAt.slice(0, 10), 10 + i) : null, viewedAt: i <= signedCount ? at(addDays(sentAt.slice(0, 10), i + 1), 9) : null, signedAt: signed ? at(addDays(sentAt.slice(0, 10), i + 1), 14) : null,
        ipAddress: signed ? `85.${rng.int(10, 250)}.${rng.int(1, 250)}.${rng.int(1, 250)}` : null,
      });
    });
    const docId = status === 'Completed' ? addDoc(c.id, `${c.number} Executed Contract.pdf`, 'Signed Contract', at(addDays(sentAt.slice(0, 10), 2), 15), 1, true, 'E-signature envelope') : null;
    db.envelopes.push({ id: envelopeId, contractId: c.id, finalVersion: '1.1', provider: 'DocuSign (simulated)', sentAt, expiresAt: addDays(sentAt.slice(0, 10), CONTRACT_RULES.signatureExpiryDays), completedAt: status === 'Completed' ? at(addDays(sentAt.slice(0, 10), 2), 15) : null, status, signedDocumentId: docId });
  };

  const obligationsFor = (c: Contract, closed: boolean) => {
    const specs: [ObligationType, string, string, string, Contract['parties']['ownerId'] | null][] = [
      ['Payment Obligation', 'Customer to settle quarterly invoices', 'Customer', 'Quarterly', null],
      ['Maintenance Obligation', 'Deliver PPM visits as per schedule', 'Company', c.service.serviceFrequency === 'Quarterly' ? 'Quarterly' : 'Monthly', 'USR-15'],
      ['Reporting Obligation', 'Submit monthly service performance report', 'Company', 'Monthly', c.parties.managerId],
      ['Insurance Obligation', 'Provide renewed public liability insurance certificate', 'Company', 'Annual', 'USR-11'],
      ['Renewal Notice', 'Issue renewal / non-renewal notice before the notice period', 'Company', 'One-Time', c.parties.managerId],
      ['Compliance Obligation', 'Civil Defense compliance inspection and certificate', 'Company', 'Annual', 'USR-15'],
    ];
    specs.slice(0, rng.int(3, 6)).forEach(([type, description, party, frequency, user], i) => {
      const due = type === 'Renewal Notice' ? addDays(c.period.endDate, -c.period.noticePeriodDays) : addDays(today(), rng.int(-40, 50) + i * 5);
      const past = due < today();
      const status = closed ? (past ? 'Completed' : 'Cancelled') : past ? (rng.chance(0.6) ? 'Completed' : 'Pending') : rng.chance(0.25) ? 'In Progress' : 'Pending';
      db.obligations.push({
        id: `OBL-${pad(obSeq, 5)}`, number: `OBL-${pad(obSeq++, 5)}`, contractId: c.id, type, description, responsibleParty: party, responsibleUserId: user, dueDate: due, frequency,
        priority: type === 'Payment Obligation' || type === 'Compliance Obligation' ? 'High' : 'Medium', status, evidenceRequired: type !== 'Payment Obligation',
        evidence: status === 'Completed' && type !== 'Payment Obligation' ? [{ id: `EV-${obSeq}`, name: `${type} evidence.pdf`, size: 230_000, type: 'application/pdf', uploadedBy: userName(user ?? 'USR-10'), uploadedAt: at(due, 12) }] : [],
        completionDate: status === 'Completed' ? due : null, escalated: false, notes: '', ...audit(c.activatedAt ?? c.createdAt),
      });
    });
  };

  const finalize = (c: Contract, status: ContractStatus, history: (c: Contract) => void) => {
    db.contracts.push({ ...c, status });
    history({ ...c, status });
  };

  for (const a of base.agreements) {
    let c = makeContract(a);
    const createdDay = c.createdAt.slice(0, 10);
    log(c.createdAt, 'Contract Created', 'Contract', c.id, c.id, c.number, `Created from template ${c.templateId}.`, null, c.title, c.createdBy);
    const doc1 = addDoc(c.id, `${c.number} Draft.pdf`, 'Contract Document', c.createdAt, 1);
    addVersion(c, '1.0', c.createdAt, 'Original draft', 'Not Submitted', 'Not Executed', doc1);
    addDoc(c.id, `${c.number} Proposal.pdf`, 'Proposal', c.createdAt);

    const customer = customerById.get(a.customerId)!;
    const stage = a.status === 'Draft' ? DRAFT_PIPELINE[draftIndex++ % DRAFT_PIPELINE.length] : null;
    const stageIndex = stage ? STAGE_INDEX[stage] : 99;

    // Review & negotiation
    if (stageIndex >= 1) {
      const reviewDay = addDays(createdDay, 3);
      log(at(reviewDay, 9), 'Submitted for Review', 'Contract', c.id, c.id, c.number, 'Submitted for commercial, legal, technical and financial review.', 'Draft', 'Under Review', c.createdBy);
      const reviewers: Record<string, string> = { 'Commercial Review': c.parties.managerId, 'Legal Review': 'USR-11', 'Technical Review': 'USR-15', 'Financial Review': 'USR-12' };
      CONTRACT_RULES.defaultReviews.forEach((type, i) => {
        const done = stageIndex > 1 || i < 2;
        db.reviews.push({
          id: `REV-${c.id}-${i + 1}`, contractId: c.id, reviewerId: reviewers[type], type: type as ContractReview['type'], reviewDate: done ? addDays(reviewDay, i + 1) : '', dueDate: addDays(reviewDay, 7),
          status: done ? (type === 'Legal Review' && stageIndex === 2 ? 'Changes Requested' : 'Reviewed') : i === 2 ? 'In Review' : 'Pending',
          comments: done ? (type === 'Legal Review' ? 'Liability cap and termination notice to be aligned with policy.' : 'No issues.') : '', attachments: [], createdAt: at(reviewDay, 9),
        });
        if (done) log(at(addDays(reviewDay, i + 1), 12), 'Reviewed', 'Review', `REV-${c.id}-${i + 1}`, c.id, c.number, `${type} completed.`, null, 'Reviewed', userName(reviewers[type]));
      });
      if (stageIndex >= 2) {
        const negDay = addDays(reviewDay, 6);
        db.negotiation.push(
          { id: `NEG-${c.id}-1`, contractId: c.id, at: at(negDay, 10), author: 'Reem Al-Saud', party: 'Company', visibility: 'External', kind: 'Redline', section: 'Limitation of Liability', original: 'limited to the fees paid in the preceding six months', proposed: 'limited to the annual contract value', text: 'Aligned with our standard liability position.', resolved: stageIndex > 2 },
          { id: `NEG-${c.id}-2`, contractId: c.id, at: at(addDays(negDay, 2), 11), author: c.parties.primaryContact || 'Customer', party: 'Customer', visibility: 'External', kind: 'Comment', section: 'Payment Terms', original: null, proposed: null, text: 'We request Net 45 payment terms.', resolved: stageIndex > 2 },
          { id: `NEG-${c.id}-3`, contractId: c.id, at: at(addDays(negDay, 3), 9), author: userName(c.parties.managerId), party: 'Company', visibility: 'Internal', kind: 'Review Note', section: 'Commercial', original: null, proposed: null, text: 'Finance agrees to Net 45 if the discount stays at or below 5%.', resolved: stageIndex > 2 },
          { id: `NEG-${c.id}-4`, contractId: c.id, at: at(addDays(negDay, 4), 15), author: 'Reem Al-Saud', party: 'Company', visibility: 'External', kind: 'Clause Change', section: 'Termination for Convenience', original: '30 days notice', proposed: '60 days notice', text: 'Notice period extended per customer request.', resolved: stageIndex > 2 },
        );
        log(at(negDay, 10), 'Negotiated', 'Contract', c.id, c.id, c.number, 'Negotiation started — redlines exchanged with the customer.', 'Under Review', 'Under Negotiation');
        c = { ...c, version: '1.1', period: { ...c.period, noticePeriodDays: 60 } };
        addVersion(c, '1.1', at(addDays(negDay, 4), 16), 'Commercial and legal changes after negotiation', 'Not Submitted', 'Not Executed', addDoc(c.id, `${c.number} Draft v1.1.pdf`, 'Contract Document', at(addDays(negDay, 4), 16), 2));
        db.documents = db.documents.map((d) => (d.id === doc1 ? { ...d, supersededById: `CDOC-${pad(docSeq - 1, 5)}` } : d));
      }
    }
    // Approval
    if (stageIndex >= 3) {
      const subDay = addDays(createdDay, 14);
      log(at(subDay, 9), 'Submitted for Review', 'Approval', c.id, c.id, c.number, 'Submitted for approval.', c.version, 'Pending Approval');
      const levels = approvalSteps(c, 1, stageIndex === 3 ? 1 : 99, at(subDay, 9));
      if (stageIndex > 3) {
        log(at(addDays(subDay, levels), 16), 'Approved', 'Approval', c.id, c.id, c.number, `All ${levels} approval level(s) completed — approved for execution.`, 'Pending Approval', 'Approved');
        c = { ...c, approvalStatus: 'Approved' };
      } else {
        c = { ...c, approvalStatus: 'Pending' };
      }
    }
    // Signature
    if (stageIndex >= 5) {
      const sentAt = at(addDays(createdDay, 20), 10);
      const executed = stageIndex === 99;
      signers(c, executed ? 2 : stageIndex === 6 ? 1 : 0, sentAt, executed ? 'Completed' : 'Sent');
      log(sentAt, 'Sent for Signature', 'Signature', `ENV-${c.id}`, c.id, c.number, 'Sent to 2 signatories.', null, 'Sent');
      c = { ...c, signatureStatus: executed ? 'Fully Signed' : stageIndex === 6 ? 'Partially Signed' : rng.chance(0.5) ? 'Viewed' : 'Sent' };
      if (stageIndex === 6) log(at(addDays(createdDay, 21), 14), 'Signed', 'Signature', `SIG-${c.id}-1`, c.id, c.number, `${c.parties.primaryContact || 'Customer'} signed.`, null, 'Partially Signed', 'System');
    }

    if (stage) {
      finalize(c, stage, () => undefined);
      db.contracts[db.contracts.length - 1] = { ...db.contracts[db.contracts.length - 1], approvalStatus: c.approvalStatus };
      continue;
    }

    // Executed contracts — approval + signature history, activation, obligations, tracking.
    const elapsed = Math.min(1, Math.max(0, (Date.now() - new Date(c.period.startDate).getTime()) / (new Date(c.period.endDate).getTime() - new Date(c.period.startDate).getTime())));
    const billed = Math.round(c.commercial.value * elapsed * (0.85 + rng.next() * 0.15));
    const margin = 1 - c.financial.estimatedCost / c.financial.estimatedRevenue;
    const activatedAt = at(c.period.startDate, 8);
    c = {
      ...c, version: '2.0', approvalStatus: 'Approved', signatureStatus: 'Fully Signed', executionDate: addDays(c.period.startDate, -3), activatedAt,
      tracking: { billed, collected: Math.round(billed * (0.75 + rng.next() * 0.25)), recognizedRevenue: billed, actualCost: Math.round(billed * (1 - margin + (rng.next() - 0.5) * 0.08)), additionalCharges: rng.chance(0.3) ? rng.int(2, 20) * 1000 : 0, slaBreaches: rng.chance(0.25) ? rng.int(1, 4) : 0 },
    };
    if (customer.status === 'On Hold' && a.status !== 'Expired' && a.status !== 'Terminated') c = { ...c, suspendedReason: 'Customer account on hold — overdue payments.' };
    addVersion(c, '2.0', at(c.executionDate!, 15), 'Executed contract', 'Approved', 'Executed', db.envelopes.find((e) => e.contractId === c.id)?.signedDocumentId ?? null);
    db.versions = db.versions.map((v) => (v.contractId === c.id && v.version !== '2.0' ? { ...v, executionStatus: 'Superseded' } : v));
    log(at(c.executionDate!, 15), 'Signed', 'Signature', `ENV-${c.id}`, c.id, c.number, 'Fully signed by all parties — executed version 2.0 stored.', 'Partially Signed', 'Fully Signed', 'System');
    log(activatedAt, 'Activated', 'Contract', c.id, c.id, c.number, 'Contract activated on start date.', 'Approved', 'Active');
    addDoc(c.id, `${c.number} Customer PO.pdf`, 'Customer PO', at(c.period.startDate, 9));

    // Amendments
    if (a.status !== 'Terminated' && rng.chance(0.35)) {
      const effective = addDays(c.period.startDate, rng.int(60, 200));
      if (effective < today()) {
        const impact = rng.int(2, 12) * 5000;
        const siteAdd = base.sites.find((s) => s.customerId === c.parties.customerId && !c.scopeInfo.siteIds.includes(s.id));
        db.amendments.push({
          id: `AMD-${pad(amSeq, 5)}`, number: `AMD-${pad(amSeq++, 5)}`, contractId: c.id, type: siteAdd ? 'Site Addition' : 'Price Change', effectiveDate: effective, requestedBy: customer.name,
          reason: siteAdd ? `Add ${siteAdd.name} to the scope.` : 'Additional equipment brought under maintenance.', previousTerms: `Value ${c.commercial.currency} ${c.commercial.value.toLocaleString('en-US')}`,
          newTerms: `Value ${c.commercial.currency} ${(c.commercial.value + impact).toLocaleString('en-US')}${siteAdd ? ` · +${siteAdd.name}` : ''}`, commercialImpact: impact, serviceImpact: siteAdd ? 'One additional site covered.' : 'More assets covered.',
          changes: { value: c.commercial.value + impact, addSiteIds: siteAdd ? [siteAdd.id] : [] }, status: 'Executed', documentId: addDoc(c.id, `AMD-${pad(amSeq - 1, 5)} Amendment.pdf`, 'Amendment', at(effective, 11)),
          resultingVersion: '2.1', notes: '', ...audit(at(addDays(effective, -20), 10)),
        });
        c = { ...c, version: '2.1', commercial: { ...c.commercial, value: c.commercial.value + impact }, scopeInfo: { ...c.scopeInfo, siteIds: siteAdd ? [...c.scopeInfo.siteIds, siteAdd.id] : c.scopeInfo.siteIds } };
        addVersion(c, '2.1', at(effective, 11), `Amendment AMD-${pad(amSeq - 1, 5)} — ${siteAdd ? 'site addition' : 'price change'}`, 'Approved', 'Executed', null);
        db.versions = db.versions.map((v) => (v.contractId === c.id && v.version === '2.0' ? { ...v, executionStatus: 'Superseded' } : v));
        log(at(effective, 11), 'Amended', 'Amendment', `AMD-${pad(amSeq - 1, 5)}`, c.id, c.number, `Amendment executed — version 2.1.`, '2.0', '2.1');
      }
    }
    if (a.status === 'Active' && rng.chance(0.2)) {
      db.amendments.push({
        id: `AMD-${pad(amSeq, 5)}`, number: `AMD-${pad(amSeq++, 5)}`, contractId: c.id, type: rng.pick(['SLA Change', 'Service Change', 'Asset Addition']), effectiveDate: dateFromNow(rng.int(10, 40)), requestedBy: customer.name,
        reason: 'Customer requested upgraded response times for critical assets.', previousTerms: `SLA ${slaName(c.scopeInfo.slaId)}`, newTerms: 'SLA Platinum 24/7', commercialImpact: rng.int(2, 8) * 5000, serviceImpact: 'Faster response for critical assets.',
        changes: { slaId: 'SLA-PLT' }, status: rng.pick(['Requested', 'Under Review', 'Under Negotiation']), documentId: null, resultingVersion: null, notes: '', ...audit(daysFromNow(-rng.int(2, 15), 10)),
      });
    }

    let status: ContractStatus = c.suspendedReason ? 'Suspended' : 'Active';
    if (a.status === 'Expired') status = rng.chance(0.25) ? 'Archived' : 'Expired';
    if (a.status === 'Terminated') status = 'Terminated';
    if (status === 'Suspended') log(daysFromNow(-rng.int(5, 40), 10), 'Suspended', 'Contract', c.id, c.id, c.number, c.suspendedReason!, 'Active', 'Suspended');
    if (status === 'Expired' || status === 'Archived') log(at(c.period.endDate, 0), 'Expired', 'Contract', c.id, c.id, c.number, 'End date reached — no active service coverage.', 'Active', 'Expired', 'System');
    if (status === 'Archived') log(at(addDays(c.period.endDate, 30), 9), 'Archived', 'Contract', c.id, c.id, c.number, 'Archived after expiry.', 'Expired', 'Archived');
    if (status === 'Terminated') {
      const tDate = addDays(c.period.endDate, -rng.int(30, 120));
      db.terminations.push({
        id: `TRM-${pad(tmSeq, 5)}`, number: `TRM-${pad(tmSeq++, 5)}`, contractId: c.id, type: rng.pick(['Customer Termination', 'Mutual Termination', 'Early Termination']), terminationDate: c.period.endDate,
        requestedBy: customer.name, approvedBy: 'Abdullah Al-Faisal', reason: 'Customer consolidating facility management providers.', noticePeriodDays: c.period.noticePeriodDays, financialSettlement: 'Final invoice issued; deposit refunded.',
        outstandingAmount: 0, outstandingObligations: 0, finalServiceDate: c.period.endDate, documentId: addDoc(c.id, `${c.number} Termination Notice.pdf`, 'Termination Notice', at(tDate, 10)), status: 'Closed', notes: '', ...audit(at(tDate, 10)),
      });
      log(at(c.period.endDate, 17), 'Terminated', 'Termination', `TRM-${pad(tmSeq - 1, 5)}`, c.id, c.number, 'Contract terminated and closed — history preserved.', 'Active', 'Terminated');
    }
    obligationsFor({ ...c, status }, status !== 'Active' && status !== 'Suspended');
    db.contracts.push({ ...c, status });

    // Renewal pipeline for expiring contracts
    if (a.status === 'Expiring' && rng.chance(0.6)) {
      const start = addDays(c.period.endDate, 1);
      const term = 12;
      db.renewals.push({
        id: `RNW-${pad(rnSeq, 5)}`, number: `RNW-${pad(rnSeq++, 5)}`, contractId: c.id, type: rng.pick(['Standard Renewal', 'Renewal with Price Change']), startDate: start, endDate: addDays(addMonths(start, term), -1), termMonths: term,
        value: Math.round(c.commercial.value * 1.05), priceAdjustmentPercent: 5, revisedServices: 'No change', revisedSla: null, revisedEntitlements: 'Same as current period', revisedPaymentTerms: null,
        reason: 'Customer satisfied with service; renewal at 5% uplift.', status: rng.pick(['Requested', 'Under Review', 'Commercial Review', 'Pending Approval']), newContractId: null, ...audit(daysFromNow(-rng.int(2, 20), 10)),
      });
    }
  }

  // Renewed history: the first two expired contracts were renewed into a new period.
  for (const old of db.contracts.filter((c) => c.status === 'Expired').slice(0, 2)) {
    const start = addDays(old.period.endDate, 1);
    const end = addDays(addMonths(start, 12), -1);
    const newId = `${old.number}-R1`;
    const renewed: Contract = { ...old, id: newId, number: newId, version: '3.0', status: end < today() ? 'Expired' : 'Active', previousContractId: old.id, period: { ...old.period, startDate: start, effectiveDate: start, endDate: end, renewalDate: addDays(end, -60) }, commercial: { ...old.commercial, value: Math.round(old.commercial.value * 1.04) }, executionDate: addDays(start, -5), activatedAt: at(start, 8), ...audit(at(addDays(start, -25), 10)) };
    db.renewals.push({
      id: `RNW-${pad(rnSeq, 5)}`, number: `RNW-${pad(rnSeq++, 5)}`, contractId: old.id, type: 'Renewal with Price Change', startDate: start, endDate: end, termMonths: 12, value: renewed.commercial.value, priceAdjustmentPercent: 4,
      revisedServices: 'No change', revisedSla: null, revisedEntitlements: 'Same as previous period', revisedPaymentTerms: null, reason: 'Renewal at 4% uplift.', status: 'Completed', newContractId: newId, ...audit(at(addDays(start, -30), 10)),
    });
    db.contracts = db.contracts.map((c) => (c.id === old.id ? { ...c, status: 'Renewed' } : c));
    db.contracts.push(renewed);
    addVersion(renewed, '3.0', renewed.createdAt, `Renewed contract (from ${old.number})`, 'Approved', 'Executed', null);
    db.versions = db.versions.filter((v) => !(v.contractId === old.id && v.version === '3.0'));
    log(at(start, 8), 'Renewed', 'Renewal', `RNW-${pad(rnSeq - 1, 5)}`, old.id, old.number, `Renewed as ${newId}.`, old.period.endDate, end);
    obligationsFor(renewed, renewed.status !== 'Active');
  }
  // An active contract in termination.
  const toTerminate = db.contracts.find((c) => c.status === 'Active' && !db.renewals.some((r) => r.contractId === c.id));
  if (toTerminate) {
    db.terminations.push({
      id: `TRM-${pad(tmSeq, 5)}`, number: `TRM-${pad(tmSeq, 5)}`, contractId: toTerminate.id, type: 'Non-Renewal', terminationDate: toTerminate.period.endDate, requestedBy: reference.customers.find((x) => x.id === toTerminate.parties.customerId)?.name ?? '',
      approvedBy: 'Abdullah Al-Faisal', reason: 'Customer will not renew; moving services in-house.', noticePeriodDays: toTerminate.period.noticePeriodDays, financialSettlement: 'Final quarter billing on completion.',
      outstandingAmount: Math.max(0, toTerminate.tracking.billed - toTerminate.tracking.collected), outstandingObligations: db.obligations.filter((o) => o.contractId === toTerminate.id && o.status !== 'Completed').length,
      finalServiceDate: toTerminate.period.endDate, documentId: null, status: 'Notice Issued', notes: '', ...audit(daysFromNow(-6, 10)),
    });
  }

  // Vendor / partner contracts
  VENDORS.forEach((v, i) => {
    const c = { ...makeContract(null, v, i), status: 'Active' as ContractStatus, version: '2.0', approvalStatus: 'Approved' as const, signatureStatus: 'Fully Signed' as const };
    const done = { ...c, executionDate: addDays(c.period.startDate, -2), activatedAt: at(c.period.startDate, 8), tracking: { ...c.tracking, billed: Math.round(c.commercial.value * 0.4), collected: Math.round(c.commercial.value * 0.35), recognizedRevenue: 0, actualCost: Math.round(c.commercial.value * 0.4) } };
    db.contracts.push(done);
    addVersion(done, '2.0', done.activatedAt, 'Executed contract', 'Approved', 'Executed', addDoc(done.id, `${done.number} Executed.pdf`, 'Signed Contract', done.activatedAt, 1, true));
    log(done.createdAt, 'Contract Created', 'Contract', done.id, done.id, done.number, `${v[1]} with ${v[0]}.`, null, done.title);
    log(done.activatedAt, 'Activated', 'Contract', done.id, done.id, done.number, 'Contract activated.', 'Approved', 'Active');
    obligationsFor(done, false);
  });

  // ── Requests ────────────────────────────────────────────────────────────────
  const activeCustomers = base.customers.filter((c) => c.status === 'Active');
  const requestStatuses: ContractRequest['status'][] = ['Draft', 'Submitted', 'Submitted', 'Under Review', 'Under Review', 'Approved', 'Approved', 'Rejected', 'Cancelled', 'Converted to Contract', 'Converted to Contract', 'Converted to Contract'];
  const drafts = db.contracts.filter((c) => c.status !== 'Active' && STAGE_INDEX[c.status] !== undefined && c.parties.customerId);
  requestStatuses.forEach((status, i) => {
    const converted = status === 'Converted to Contract' ? drafts[i % drafts.length] : null;
    const customer = converted ? customerById.get(converted.parties.customerId!)! : activeCustomers[(i * 7) % activeCustomers.length];
    const site = base.sites.find((s) => s.customerId === customer.id);
    const createdAt = converted ? at(addDays(converted.createdAt.slice(0, 10), -10), 9) : daysFromNow(-rng.int(1, 60), 10);
    const type = i % 5 === 4 ? 'Renewal' : i % 7 === 3 ? 'Amendment' : 'New Contract';
    const id = `CRQ-${pad(i + 1, 5)}`;
    db.requests.push({
      id, number: id, customerId: customer.id, siteId: site?.id ?? null, requestType: type, contractType: rng.pick(['AMC Contract', 'Service Contract', 'Maintenance Contract']),
      requestedStart: dateFromNow(rng.int(15, 60)), requestedEnd: dateFromNow(rng.int(380, 760)), estimatedValue: rng.int(10, 120) * 5000, currency: customer.commercial.currency,
      requestedServices: rng.pick(['HVAC quarterly PPM and breakdown support', 'Generator and UPS maintenance', 'Integrated MEP maintenance', 'Elevator monthly service']), requiredSla: rng.pick(['SLA-GLD', 'SLA-SLV', 'SLA-PLT']),
      requiredEntitlements: '4 PPM visits per year, unlimited breakdown call-outs', justification: 'Customer requested a formal agreement after the trial period.', requestedBy: rng.pick(LOOKUPS_SEED.salesReps).name,
      ownerId: customer.commercial.accountManagerId ?? 'USR-01', priority: rng.pick(['High', 'Medium', 'Medium', 'Low']), status, relatedContractId: type === 'New Contract' ? null : (db.contracts.find((c) => c.parties.customerId === customer.id)?.id ?? null),
      convertedContractId: converted?.id ?? null, decisionComment: status === 'Rejected' ? 'Margin below policy.' : status === 'Approved' || converted ? 'Approved — proceed with drafting.' : '', attachments: [], notes: '',
      ...audit(createdAt, rng.pick(LOOKUPS_SEED.salesReps).name),
    });
    if (converted) db.contracts = db.contracts.map((c) => (c.id === converted.id ? { ...c, requestId: id } : c));
    log(createdAt, 'Request Created', 'Request', id, converted?.id ?? null, id, `${type} request for ${customer.name}.`, null, status);
  });

  db.history.sort((x, y) => y.timestamp.localeCompare(x.timestamp));
  return db;
}
