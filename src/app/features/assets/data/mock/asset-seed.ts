import { buildSeed } from '../../../customers/data/mock/seed';
import { type Random, dateFromNow, daysFromNow, pad, random } from '../../../customers/data/mock/mock-utils';
import type { AssetSummary } from '../../../customers/models/related.model';
import type { Asset, AssetStatus, AssetTechnical, Criticality, OwnershipType, ServiceFrequency } from '../../models/asset.model';
import type { AssetComponent } from '../../models/component.model';
import { COVERAGE_FLAGS, type AgreementRef, type AssetCoverage, type CoverageFlag, type CoverageType } from '../../models/coverage.model';
import type { AssetDocument, DocumentAccess } from '../../models/document.model';
import type {
  AssetMaintenance,
  AssetServiceRequest,
  AssetWorkOrder,
  LifecycleEvent,
  LifecycleEventType,
  PartUsage,
  ServiceRecord,
  ServiceType,
} from '../../models/history.model';
import { COMMISSIONING_CHECKLIST, type AssetTransfer, type InstallationRecord, type TransferReason } from '../../models/operations.model';
import type { AssetReferenceData, SiteRef } from '../../models/reference.model';
import type { AssetWarranty, WarrantyType } from '../../models/warranty.model';

export interface AssetDatabase {
  reference: AssetReferenceData;
  assets: Asset[];
  components: AssetComponent[];
  warranties: AssetWarranty[];
  coverages: AssetCoverage[];
  installations: InstallationRecord[];
  transfers: AssetTransfer[];
  documents: AssetDocument[];
  serviceRecords: ServiceRecord[];
  lifecycle: LifecycleEvent[];
  serviceRequests: AssetServiceRequest[];
  workOrders: AssetWorkOrder[];
  maintenance: AssetMaintenance[];
}

interface EquipmentProfile {
  readonly type: string;
  readonly subType: string;
  readonly productFamily: string;
  readonly criticality: Criticality;
  readonly serviceClass: string;
  readonly maintenanceClass: string;
  readonly meterType: string;
  readonly plan: string;
  readonly frequency: ServiceFrequency;
  readonly team: string;
  readonly locations: readonly string[];
  readonly technical: Partial<AssetTechnical>;
  readonly attributes: Readonly<Record<string, string>>;
  readonly components: readonly (readonly [name: string, type: string])[];
  readonly parts: readonly (readonly [partNumber: string, name: string, cost: number])[];
  readonly problems: readonly string[];
}

const PROFILES: Record<string, EquipmentProfile> = {
  'Water-Cooled Chiller': {
    type: 'Chiller', subType: 'Water-Cooled Screw', productFamily: 'Centrifugal & Screw Chillers', criticality: 'Critical',
    serviceClass: 'Mission Critical', maintenanceClass: 'Time-Based', meterType: 'Running Hours', plan: 'HVAC Quarterly PPM', frequency: 'Quarterly', team: 'HVAC Team',
    locations: ['Central Plant Room', 'Basement B2 Plant Room', 'Roof Plant Area'],
    technical: { capacity: '400 TR', powerRating: '245 kW', voltage: '400 V 3-phase', frequency: '60 Hz', dimensions: '4,800 × 1,900 × 2,300 mm', weight: '9,800 kg', operatingRange: '5–14 °C leaving water', refrigerantType: 'R-134a', fuelType: 'Not Applicable' },
    attributes: { coolingCapacityTr: '400', refrigerantCharge: '410', efficiency: '0.56 kW/TR' },
    components: [['Compressor 1', 'Compressor'], ['Compressor 2', 'Compressor'], ['Control Panel', 'Control Panel'], ['Condenser Water Pump', 'Pump'], ['Temperature Sensors', 'Sensor']],
    parts: [['CH-OIL-5L', 'Compressor oil 5 L', 420], ['CH-FLT-DRY', 'Filter drier core', 260], ['CH-CNT-95A', 'Contactor 95 A', 780], ['CH-SNS-TMP', 'Temperature sensor', 190]],
    problems: ['High condenser pressure alarm', 'Low refrigerant charge', 'Compressor tripping on overload', 'Chilled water temperature not achieved'],
  },
  'Air Handling Unit': {
    type: 'Air Handling Unit', subType: 'Double Skin AHU', productFamily: 'Air Handling Units', criticality: 'High',
    serviceClass: 'Essential', maintenanceClass: 'Time-Based', meterType: 'Running Hours', plan: 'HVAC Monthly Inspection', frequency: 'Monthly', team: 'HVAC Team',
    locations: ['Roof Plant Area', 'AHU Room Level 3', 'Mechanical Floor'],
    technical: { capacity: '12,000 CFM', powerRating: '15 kW', voltage: '400 V 3-phase', frequency: '60 Hz', dimensions: '3,600 × 1,500 × 1,800 mm', weight: '1,450 kg', operatingRange: '0–50 °C ambient', refrigerantType: 'Not Applicable' },
    attributes: { airflow: '12,000', efficiency: 'EC fan IE4' },
    components: [['Supply Fan', 'Fan'], ['Fan Motor', 'Motor'], ['Pre-Filter Bank', 'Filter'], ['Chilled Water Valve', 'Valve'], ['VFD Drive', 'Drive']],
    parts: [['AHU-FLT-G4', 'G4 panel filter', 85], ['AHU-BLT-B52', 'V-belt B52', 65], ['AHU-BRG-6206', 'Bearing 6206', 120], ['AHU-ACT-24V', 'Valve actuator 24 V', 640]],
    problems: ['Unusual vibration from supply fan', 'Low airflow in zone', 'Fan belt slipping', 'Actuator not responding'],
  },
  'Diesel Generator': {
    type: 'Diesel Generator', subType: 'Standby Genset', productFamily: 'Diesel Generator Sets', criticality: 'Critical',
    serviceClass: 'Mission Critical', maintenanceClass: 'Meter-Based', meterType: 'Running Hours', plan: 'Generator Monthly Run Test', frequency: 'Monthly', team: 'Electrical Team',
    locations: ['Generator Room', 'External Generator Yard', 'Basement B1 Generator Room'],
    technical: { capacity: '600 kVA', powerRating: '480 kW', voltage: '400/230 V', frequency: '60 Hz', dimensions: '4,200 × 1,700 × 2,100 mm', weight: '5,200 kg', operatingRange: '-10–50 °C', fuelType: 'Diesel', refrigerantType: 'Not Applicable' },
    attributes: { ratedKva: '600', fuelTankLitres: '1,000', atsModel: 'ASCO 7000' },
    components: [['Engine', 'Engine'], ['Alternator', 'Alternator'], ['Starter Battery', 'Battery'], ['Control Panel', 'Control Panel'], ['Fuel System', 'Fuel System']],
    parts: [['GEN-OIL-FLT', 'Lube oil filter', 140], ['GEN-FUEL-FLT', 'Fuel filter', 110], ['GEN-BAT-12V', 'Starter battery 12 V', 950], ['GEN-AIR-FLT', 'Air filter element', 230]],
    problems: ['Generator failed weekly test', 'Battery charger fault', 'Low coolant level alarm', 'Fuel leak at injector line'],
  },
  'Passenger Elevator': {
    type: 'Elevator', subType: 'Machine-Room-Less Traction', productFamily: 'Passenger Elevators', criticality: 'High',
    serviceClass: 'Essential', maintenanceClass: 'Time-Based', meterType: 'Cycles', plan: 'Elevator Monthly Service', frequency: 'Monthly', team: 'Mechanical Team',
    locations: ['Lift Core A', 'Lift Core B', 'Main Lobby Lift Shaft'],
    technical: { capacity: '1,000 kg / 13 persons', powerRating: '11 kW', voltage: '400 V 3-phase', dimensions: 'Car 1,600 × 1,400 mm', operatingRange: 'B2 – Level 18' },
    attributes: { ratedLoadKg: '1,000', speed: '1.6', floorsServed: 'B2–18', driveType: 'Gearless traction' },
    components: [['Traction Machine', 'Motor'], ['Door Operator', 'Door Operator'], ['Controller', 'Controller'], ['Overspeed Governor', 'Other']],
    parts: [['LFT-DR-ROL', 'Door roller set', 310], ['LFT-RLY-24', 'Safety relay', 420], ['LFT-BTN-HAL', 'Hall call button', 95], ['LFT-RP-6MM', 'Governor rope (m)', 45]],
    problems: ['Elevator stuck between floors', 'Door re-opening repeatedly', 'Levelling inaccurate at lobby', 'Car call buttons unresponsive'],
  },
  'Fire Alarm Control Panel': {
    type: 'Fire Alarm Panel', subType: 'Addressable Panel', productFamily: 'Fire Alarm Systems', criticality: 'Critical',
    serviceClass: 'Mission Critical', maintenanceClass: 'Time-Based', meterType: 'None', plan: 'Fire System Quarterly Test', frequency: 'Quarterly', team: 'Fire & Safety Team',
    locations: ['Fire Command Centre', 'Security Room', 'Ground Floor Control Room'],
    technical: { powerRating: '0.5 kW', voltage: '230 V / 24 V DC', dimensions: '600 × 450 × 200 mm' },
    attributes: { zones: '8 loops', devices: '420 detectors', standard: 'NFPA 72' },
    components: [['Loop Card 1', 'Controller'], ['Loop Card 2', 'Controller'], ['Standby Batteries', 'Battery'], ['Power Supply', 'Other']],
    parts: [['FA-DET-SMK', 'Smoke detector', 160], ['FA-BAT-12V7', 'Battery 12 V 7 Ah', 85], ['FA-MCP-RED', 'Manual call point', 120], ['FA-SND-BS', 'Sounder base', 140]],
    problems: ['Fire panel showing fault', 'Loop open circuit', 'False alarm on level 4', 'Battery low warning'],
  },
  'UPS System': {
    type: 'UPS', subType: 'Online Double Conversion', productFamily: 'Three-Phase UPS', criticality: 'Critical',
    serviceClass: 'Mission Critical', maintenanceClass: 'Condition-Based', meterType: 'None', plan: 'UPS Semi-Annual Service', frequency: 'Semi-Annual', team: 'Electrical Team',
    locations: ['Server Room', 'UPS Room Level 1', 'Electrical Room'],
    technical: { capacity: '100 kVA', powerRating: '100 kW', voltage: '400 V 3-phase', frequency: '60 Hz', dimensions: '600 × 900 × 1,900 mm', weight: '420 kg' },
    attributes: { batteryAutonomy: '15', ratedKva: '100' },
    components: [['Battery String A', 'Battery'], ['Battery String B', 'Battery'], ['Rectifier Module', 'Other'], ['Static Bypass', 'Controller']],
    parts: [['UPS-BAT-12V', 'VRLA battery 12 V 100 Ah', 1100], ['UPS-FAN-120', 'Cooling fan 120 mm', 180], ['UPS-CAP-DC', 'DC capacitor', 520]],
    problems: ['UPS battery replacement request', 'UPS on bypass', 'Overload alarm', 'Fan failure alarm'],
  },
  'CCTV Recording Server': {
    type: 'CCTV System', subType: 'Network Video Recorder', productFamily: 'Video Surveillance', criticality: 'Medium',
    serviceClass: 'Standard', maintenanceClass: 'Condition-Based', meterType: 'None', plan: 'Network Annual Review', frequency: 'Semi-Annual', team: 'ELV & Security Team',
    locations: ['Security Control Room', 'Server Room', 'IT Rack Room'],
    technical: { powerRating: '0.8 kW', voltage: '230 V', dimensions: '2U rack' },
    attributes: { channels: '128', storageTb: '96', retentionDays: '90' },
    components: [['Storage Array', 'Other'], ['Power Supply Unit', 'Other'], ['Network Card', 'Controller']],
    parts: [['CCTV-HDD-8T', 'Surveillance HDD 8 TB', 980], ['CCTV-PSU-800', 'PSU 800 W', 640], ['CCTV-CAM-4MP', 'Dome camera 4 MP', 720]],
    problems: ['CCTV camera offline', 'Recording gaps detected', 'Disk failure alarm', 'Video loss on channel 12'],
  },
  'Booster Pump Set': {
    type: 'Pump Set', subType: 'Variable Speed Booster', productFamily: 'Booster Systems', criticality: 'High',
    serviceClass: 'Essential', maintenanceClass: 'Time-Based', meterType: 'Running Hours', plan: 'Pump Quarterly Service', frequency: 'Quarterly', team: 'Mechanical Team',
    locations: ['Pump Room', 'Basement B1 Pump Room', 'Water Tank Room'],
    technical: { capacity: '45 m³/h @ 60 m', powerRating: '3 × 7.5 kW', voltage: '400 V 3-phase', frequency: '60 Hz', operatingRange: '0–10 bar' },
    attributes: { flowRate: '45', head: '60', pumps: '3 (2 duty + 1 standby)' },
    components: [['Pump 1', 'Pump'], ['Pump 2', 'Pump'], ['Pump 3 (Standby)', 'Pump'], ['Controller', 'Controller'], ['Pressure Sensor', 'Sensor']],
    parts: [['PMP-SEAL-28', 'Mechanical seal 28 mm', 340], ['PMP-PRS-10B', 'Pressure transmitter', 560], ['PMP-NRV-50', 'Non-return valve DN50', 410]],
    problems: ['Water leakage near plant room', 'Low pressure on upper floors', 'Pump short cycling', 'Seal leaking'],
  },
  'BMS Controller': {
    type: 'BMS Controller', subType: 'DDC Controller', productFamily: 'Building Management Systems', criticality: 'Medium',
    serviceClass: 'Standard', maintenanceClass: 'Condition-Based', meterType: 'None', plan: 'BMS Annual Health Check', frequency: 'Annual', team: 'ELV & Security Team',
    locations: ['BMS Control Room', 'Electrical Room', 'Facility Management Office'],
    technical: { powerRating: '0.1 kW', voltage: '24 V AC' },
    attributes: { protocol: 'BACnet/IP', points: '256' },
    components: [['I/O Module 1', 'Controller'], ['I/O Module 2', 'Controller'], ['Supervisory Controller', 'Controller']],
    parts: [['BMS-IO-16', 'I/O module 16 point', 1250], ['BMS-SNS-RH', 'Humidity sensor', 260], ['BMS-TRF-24', 'Transformer 24 V', 140]],
    problems: ['BMS communication loss', 'Trend logging stopped', 'Controller offline', 'Incorrect sensor readings'],
  },
  'Cold Room Compressor': {
    type: 'Compressor', subType: 'Semi-Hermetic Reciprocating', productFamily: 'Refrigeration Compressors', criticality: 'High',
    serviceClass: 'Essential', maintenanceClass: 'Time-Based', meterType: 'Running Hours', plan: 'Refrigeration Monthly Service', frequency: 'Monthly', team: 'HVAC Team',
    locations: ['Cold Room 1', 'Freezer Room', 'Refrigeration Plant'],
    technical: { capacity: '22 kW cooling', powerRating: '11 kW', voltage: '400 V 3-phase', frequency: '60 Hz', operatingRange: '-25 to -18 °C', refrigerantType: 'R-404A' },
    attributes: { setPoint: '-18', refrigerantCharge: '24' },
    components: [['Compressor Motor', 'Motor'], ['Evaporator Fan', 'Fan'], ['Expansion Valve', 'Valve'], ['Temperature Controller', 'Controller']],
    parts: [['REF-TXV-04', 'Thermostatic expansion valve', 480], ['REF-GAS-404', 'R-404A refrigerant (kg)', 95], ['REF-FAN-EVP', 'Evaporator fan motor', 560]],
    problems: ['Cold room temperature deviation', 'Ice build-up on evaporator', 'Compressor high discharge temperature', 'Door heater failure'],
  },
};

const END_OF_LIFE = new Set<AssetStatus>(['Retired', 'Decommissioned']);
const OPERATIONAL = new Set<AssetStatus>(['Installed', 'Active', 'Under Maintenance', 'Under Repair']);

const TECHNICIANS = ['Rashid Khan', 'Bilal Ahmed', 'Saeed Al-Amri', 'Jomar Santos', 'Vikram Patel', 'Ali Hassan', 'Mahmoud Saleh', 'Naveed Iqbal', 'Omar Haddad'];
const SR_KEYWORDS: readonly [string, string][] = [
  ['Chiller', 'Water-Cooled Chiller'], ['AC not cooling', 'Air Handling Unit'], ['Generator', 'Diesel Generator'], ['Elevator', 'Passenger Elevator'],
  ['Fire panel', 'Fire Alarm Control Panel'], ['Water leakage', 'Booster Pump Set'], ['UPS', 'UPS System'], ['CCTV', 'CCTV Recording Server'],
  ['Cold room', 'Cold Room Compressor'], ['BMS', 'BMS Controller'],
];

const PRE_INSTALL_ASSETS: readonly { readonly name: string; readonly status: AssetStatus }[] = [
  { name: 'Water-Cooled Chiller', status: 'Received' },
  { name: 'Diesel Generator', status: 'Ordered' },
  { name: 'UPS System', status: 'Received' },
  { name: 'Passenger Elevator', status: 'Planned' },
  { name: 'Air Handling Unit', status: 'Received' },
  { name: 'Booster Pump Set', status: 'Ordered' },
  { name: 'Fire Alarm Control Panel', status: 'Planned' },
  { name: 'BMS Controller', status: 'Received' },
];

/** ISO timestamp for a date (yyyy-MM-dd) at an hour, never later than now. */
function at(date: string, hour = 10): string {
  const iso = `${date}T${pad(hour, 2)}:${pad((hour * 7) % 60, 2)}:00.000Z`;
  const now = new Date().toISOString();
  return iso > now ? daysFromNow(-0.02) : iso;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);

function mapStatus(rng: Random, summary: AssetSummary): AssetStatus {
  switch (summary.status) {
    case 'In Service':
      return rng.chance(0.12) ? 'Installed' : 'Active';
    case 'Under Maintenance':
      return 'Under Maintenance';
    case 'Out of Service':
      return rng.chance(0.6) ? 'Under Repair' : 'Temporarily Out of Service';
    default:
      return rng.chance(0.4) ? 'Retired' : 'Decommissioned';
  }
}

function coverageFlags(type: CoverageType): Record<CoverageFlag, boolean> {
  const all = (value: boolean) => Object.fromEntries(COVERAGE_FLAGS.map((f) => [f.key, value])) as Record<CoverageFlag, boolean>;
  switch (type) {
    case 'Comprehensive':
      return all(true);
    case 'Non-Comprehensive':
      return { ...all(true), parts: false, emergency: false };
    case 'Labor Only':
      return { ...all(true), parts: false };
    case 'Parts Only':
      return { ...all(false), parts: true };
    case 'Preventive Only':
      return { ...all(false), preventive: true, inspection: true, labor: true };
    case 'Breakdown Only':
      return { ...all(false), breakdown: true, emergency: true, labor: true };
  }
}

export function coverageTerms(type: CoverageType): Pick<AssetCoverage, 'includedServices' | 'excludedServices' | 'partsCoverage' | 'laborCoverage' | 'flags'> {
  const flags = coverageFlags(type);
  const included = COVERAGE_FLAGS.filter((f) => flags[f.key]).map((f) => f.label.replace(' Included', ''));
  const excluded = COVERAGE_FLAGS.filter((f) => !flags[f.key]).map((f) => f.label.replace(' Included', ''));
  return {
    flags,
    includedServices: included,
    excludedServices: [...excluded, 'Civil works', 'Consumables beyond agreed list'],
    partsCoverage: flags.parts ? (type === 'Comprehensive' ? 'All spare parts included' : 'Parts up to agreed cap') : 'Chargeable at price list',
    laborCoverage: flags.labor ? 'Included during service hours' : 'Chargeable per hour',
  };
}

function matchesAgreement(agreement: AgreementRef, category: string): boolean {
  if (agreement.kind === 'Contract') return true;
  const title = agreement.title;
  if (title.startsWith('MEP')) return ['HVAC', 'Power', 'Plumbing', 'Building Automation'].includes(category);
  if (title.startsWith('HVAC')) return category === 'HVAC' || category === 'Refrigeration';
  if (title.startsWith('Elevator')) return category === 'Vertical Transport';
  if (title.startsWith('Fire')) return category === 'Fire & Safety' || category === 'Security';
  if (title.startsWith('Generator')) return category === 'Power';
  return false;
}

export function buildAssetSeed(): AssetDatabase {
  const base = buildSeed();
  const rng = random(20261016);
  const users = base.lookups.users.map((u) => u.name);
  const currentUser = users[0];

  const reference: AssetReferenceData = {
    customers: base.customers.map((c) => ({ id: c.id, code: c.code, name: c.name, status: c.status, serviceRegion: c.operational.serviceRegion ?? '', currency: c.commercial.currency })),
    sites: base.sites.map((s) => ({
      id: s.id, code: s.code, name: s.name, customerId: s.customerId, status: s.status, city: s.location.city, region: s.location.region,
      addressLine: s.location.addressLine, latitude: s.location.latitude, longitude: s.location.longitude, serviceTerritoryId: s.serviceTerritoryId, defaultSlaId: s.defaultSlaId,
    })),
    agreements: base.agreements.map((a) => ({ id: a.id, number: a.number, title: a.title, kind: a.kind, customerId: a.customerId, siteIds: a.siteIds, status: a.status, startDate: a.startDate, endDate: a.endDate })),
    slas: base.lookups.slas,
    territories: base.lookups.territories,
    serviceRegions: base.lookups.serviceRegions,
    technicians: TECHNICIANS,
    users,
    currencies: base.lookups.currencies,
    currentUser,
  };

  const db: AssetDatabase = {
    reference, assets: [], components: [], warranties: [], coverages: [], installations: [], transfers: [], documents: [],
    serviceRecords: [], lifecycle: [], serviceRequests: [], workOrders: [], maintenance: [],
  };

  const customers = new Map(base.customers.map((c) => [c.id, c]));
  const sites = new Map(reference.sites.map((s) => [s.id, s]));
  const seq = { cmp: 1, war: 1, cov: 1, ins: 1, trf: 1, doc: 1, svc: 1, evt: 1, pm: 1, claim: 1 };
  const next = (key: keyof typeof seq, prefix: string, width = 5) => `${prefix}-${pad(seq[key]++, width)}`;
  const event = (assetId: string, timestamp: string, eventType: LifecycleEventType, comments: string, reference: string | null = null, previousValue: string | null = null, newValue: string | null = null, user?: string) =>
    db.lifecycle.push({ id: next('evt', 'EVT', 6), assetId, timestamp, user: user ?? rng.pick(users), eventType, previousValue, newValue, reference, comments });

  const docFile = (name: string, ext = 'pdf') => ({ fileName: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`, fileSize: rng.int(80, 4800) * 1024, mimeType: ext === 'jpg' ? 'image/jpeg' : 'application/pdf' });
  const addDocument = (assetId: string, componentId: string | null, name: string, type: string, issue: string, expiry: string | null, access: DocumentAccess = 'Internal') => {
    const file = docFile(name, type === 'Photos' ? 'jpg' : 'pdf');
    const uploadedAt = at(issue, rng.int(8, 16));
    const uploadedBy = rng.pick(users);
    const doc: AssetDocument = {
      id: next('doc', 'ADOC'), assetId, componentId, name, type, documentNumber: type === 'Photos' ? '' : `${type.slice(0, 3).toUpperCase()}-${rng.digits(6)}`,
      issueDate: issue, expiryDate: expiry, reminderDays: 30, version: 1,
      versions: [{ version: 1, fileName: file.fileName, fileSize: file.fileSize, uploadedBy, uploadedAt, note: 'Initial upload' }],
      access, ...file, notes: '', archived: false, uploadedBy, uploadedAt,
    };
    db.documents.push(doc);
    return doc;
  };

  // ── Assets derived from the customer & site seed ──────────────────────────
  const summaries = [...base.assets];
  const maxNo = summaries.reduce((m, a) => Math.max(m, Number(a.id.slice(4))), 0);
  const activeSites = reference.sites.filter((s) => s.status === 'Active' && customers.get(s.customerId)?.status === 'Active');
  PRE_INSTALL_ASSETS.forEach((item, i) => {
    const site = activeSites[(i * 7) % activeSites.length];
    const no = pad(maxNo + i + 1, 5);
    summaries.push({ id: `AST-${no}`, tag: `TAG-${no}`, name: item.name, category: '', model: '', serialNumber: `SN${rng.digits(9)}`, customerId: site.customerId, siteId: site.id, status: 'In Service', installDate: '', warrantyEnd: null });
  });
  const preStatus = new Map(PRE_INSTALL_ASSETS.map((item, i) => [`AST-${pad(maxNo + i + 1, 5)}`, item.status]));

  const catalogModels: Record<string, readonly string[]> = {
    'Water-Cooled Chiller': ['Carrier 30XW-400', 'Trane RTHF-350', 'York YK-500'],
    'Air Handling Unit': ['Daikin AHU-D15', 'Carrier 39HQ-12'],
    'Diesel Generator': ['Caterpillar C18 600kVA', 'Cummins C1100D5'],
    'Passenger Elevator': ['KONE MonoSpace 700', 'Otis Gen2 Life'],
    'Fire Alarm Control Panel': ['Notifier NFS2-3030', 'Simplex 4100ES'],
    'UPS System': ['APC Galaxy VS 100kW', 'Eaton 93PM 80kW'],
    'CCTV Recording Server': ['Hikvision DS-96256NI', 'Milestone Husky X8'],
    'Booster Pump Set': ['Grundfos Hydro MPC-E', 'Wilo SiBoost Smart'],
    'BMS Controller': ['Honeywell Spyder', 'Siemens PXC Modular'],
    'Cold Room Compressor': ['Bitzer 4NES-20Y', 'Copeland ZB76'],
  };
  const categoryOf: Record<string, string> = {
    'Water-Cooled Chiller': 'HVAC', 'Air Handling Unit': 'HVAC', 'Diesel Generator': 'Power', 'Passenger Elevator': 'Vertical Transport',
    'Fire Alarm Control Panel': 'Fire & Safety', 'UPS System': 'Power', 'CCTV Recording Server': 'Security', 'Booster Pump Set': 'Plumbing',
    'BMS Controller': 'Building Automation', 'Cold Room Compressor': 'Refrigeration',
  };

  for (const summary of summaries) {
    const profile = PROFILES[summary.name];
    const site = sites.get(summary.siteId)!;
    const customer = customers.get(summary.customerId)!;
    const pre = preStatus.get(summary.id);
    const status: AssetStatus = pre ?? mapStatus(rng, summary);
    const model = summary.model || rng.pick(catalogModels[summary.name]);
    const [manufacturer, ...modelRest] = model.split(' ');
    const installDate = pre ? null : summary.installDate;
    const createdDate = installDate ? addDays(installDate, -rng.int(20, 60)) : dateFromNow(-rng.int(5, 40));
    const createdAt = at(createdDate, rng.int(8, 15));
    const commissioningDate = installDate ? addDays(installDate, rng.int(1, 6)) : null;
    const location = rng.pick(profile.locations);
    const floor = location.includes('Basement') ? location.match(/B\d/)?.[0] ?? 'B1' : location.includes('Roof') ? 'Roof' : location.match(/Level (\d+)/)?.[1] ?? rng.pick(['G', '1', '2', 'B1']);
    const meterBase = profile.meterType === 'None' ? null : rng.int(0, 400);
    const ageDays = installDate ? Math.max(0, Math.round((Date.now() - new Date(installDate).getTime()) / 86_400_000)) : 0;
    const meterNow = meterBase === null ? null : meterBase + Math.round(ageDays * (profile.meterType === 'Cycles' ? 180 : rng.int(6, 16)));
    const ownership: OwnershipType = rng.chance(0.85) ? 'Customer Owned' : rng.pick<OwnershipType>(['Leased', 'Rented', 'Company Owned']);
    const purchaseCost = Math.round((profile.criticality === 'Critical' ? rng.int(180, 900) : rng.int(25, 260)) * 1000);
    const criticality: Criticality = customer.category === 'Healthcare' && profile.criticality !== 'Critical' ? 'High' : rng.chance(0.15) ? rng.pick<Criticality>(['Medium', 'Low']) : profile.criticality;

    const asset: Asset = {
      id: summary.id,
      code: summary.id,
      tag: summary.tag,
      name: summary.name,
      customerId: summary.customerId,
      siteId: summary.siteId,
      status,
      category: categoryOf[summary.name],
      type: profile.type,
      subType: profile.subType,
      criticality,
      serviceClass: profile.serviceClass,
      maintenanceClass: profile.maintenanceClass,
      manufacturer,
      brand: manufacturer,
      model,
      modelNumber: modelRest.join(' '),
      serialNumber: summary.serialNumber,
      partNumber: `${manufacturer.slice(0, 3).toUpperCase()}-${rng.digits(6)}`,
      productFamily: profile.productFamily,
      manufacturingDate: addDays(installDate ?? createdDate, -rng.int(60, 300)),
      barcode: summary.tag,
      rfid: rng.chance(0.3) ? `E200${rng.digits(12)}` : '',
      installation: {
        date: installDate,
        commissioningDate,
        installedBy: installDate ? rng.pick(TECHNICIANS) : '',
        location,
        floor,
        room: location,
        area: rng.pick(['Mechanical', 'Electrical', 'Utilities', 'Public Area', 'Back of House']),
        initialMeterReading: installDate ? meterBase : null,
        notes: installDate && rng.chance(0.3) ? 'Installed as per approved shop drawings.' : '',
      },
      technical: {
        capacity: '', powerRating: '', voltage: '', frequency: '', dimensions: '', weight: '', operatingRange: '', fuelType: '', refrigerantType: '',
        specifications: `${profile.productFamily} — ${model}. Refer to the manufacturer datasheet for full specifications.`,
        ...profile.technical,
      },
      customAttributes: profile.attributes,
      service: {
        contractId: null,
        amcId: null,
        slaId: site.defaultSlaId,
        servicePlan: rng.pick(['Comprehensive Care', 'Preventive Only', 'Breakdown Cover', 'Comprehensive Care']),
        maintenancePlan: profile.plan,
        serviceFrequency: profile.frequency,
        servicePriority: criticality,
        serviceTerritoryId: site.serviceTerritoryId,
      },
      ownership: {
        type: ownership,
        owner: ownership === 'Company Owned' ? 'Gulf Facility Services Co.' : customer.name,
        purchaseDate: addDays(installDate ?? createdDate, -rng.int(10, 45)),
        purchaseCost,
        currency: customer.commercial.currency,
        supplier: `${manufacturer} Authorized Distributor`,
        purchaseReference: `PO-${rng.digits(6)}`,
        depreciationReference: rng.chance(0.6) ? `DEP-${rng.digits(5)}` : '',
        financialAssetReference: rng.chance(0.6) ? `FA-${rng.digits(7)}` : '',
      },
      operational: {
        responsibleTeam: profile.team,
        assignedTechnician: rng.pick(TECHNICIANS),
        serviceRegion: customer.operational.serviceRegion ?? '',
        operatingHours: installDate ? Math.round(ageDays * rng.int(8, 24)) : null,
        meterType: profile.meterType,
        currentMeterReading: meterNow,
        lastMaintenanceDate: null,
        nextMaintenanceDate: null,
      },
      notes: {
        internalNotes: rng.chance(0.3) ? 'Critical to tenant operations — notify the account manager before shutdowns.' : '',
        customerNotes: rng.chance(0.2) ? 'Customer requests 48 hours notice before planned maintenance.' : '',
        technicianInstructions: rng.pick(['Isolate and lock out before opening panels.', 'Permit-to-work required for roof access.', 'Coordinate with site engineer for shutdown.', '']),
      },
      createdAt,
      createdBy: rng.pick(users),
      updatedAt: null,
      updatedBy: null,
    };
    db.assets.push(asset);

    // Lifecycle: creation, procurement and receipt
    event(asset.id, createdAt, 'Asset Created', `${asset.name} (${asset.model}) registered.`, asset.code);
    if (status !== 'Planned') event(asset.id, at(addDays(createdDate, 2), 11), 'Asset Ordered', `Purchase order raised with ${asset.ownership.supplier}.`, asset.ownership.purchaseReference);
    if (!['Planned', 'Ordered'].includes(status)) event(asset.id, at(addDays(createdDate, rng.int(8, 18)), 13), 'Asset Received', 'Equipment received on site and inspected.', null);

    // Installation / commissioning
    if (installDate) {
      const technician = asset.installation.installedBy;
      const recent = ageDays < 45;
      const commissioningStatus = recent && rng.chance(0.4) ? rng.pick(['In Progress', 'Rework Required'] as const) : 'Completed';
      const completed = commissioningStatus === 'Completed';
      db.installations.push({
        id: next('ins', 'INS'), assetId: asset.id, customerId: asset.customerId, siteId: asset.siteId, installationDate: installDate,
        installationTeam: 'Installation Team', technician, location, reference: `INST-${rng.digits(5)}`, notes: asset.installation.notes,
        installationStatus: 'Completed', commissioningDate: completed ? commissioningDate : null, commissionedBy: completed || commissioningStatus === 'Rework Required' ? rng.pick(TECHNICIANS) : '',
        checklist: COMMISSIONING_CHECKLIST.map((item, i) => ({ item, done: completed || i < 4 })),
        initialMeterReading: meterBase, initialCondition: 'New', testResults: completed ? 'All functional and performance tests passed.' : commissioningStatus === 'Rework Required' ? 'Vibration above tolerance on load test — rework required.' : '',
        commissioningStatus, customerConfirmation: completed && rng.chance(0.85) ? { name: 'Site Engineer', designation: 'Facility Engineer', date: commissioningDate!, remarks: 'Accepted.' } : null,
        createdAt: at(addDays(installDate, -7), 9), createdBy: rng.pick(users),
      });
      event(asset.id, at(installDate, 12), 'Asset Installed', `Installed at ${site.name} — ${location}.`, null, null, site.name, technician);
      if (completed) {
        event(asset.id, at(commissioningDate!, 15), 'Asset Commissioned', 'Commissioning completed and accepted by the customer.', null);
        addDocument(asset.id, null, `${asset.name} – Commissioning Report`, 'Commissioning Reports', commissioningDate!, null, 'Customer Visible');
      }
      addDocument(asset.id, null, `${asset.name} – Installation Checklist`, 'Installation Documents', installDate, null);
    } else if (status === 'Received') {
      db.installations.push({
        id: next('ins', 'INS'), assetId: asset.id, customerId: asset.customerId, siteId: asset.siteId, installationDate: dateFromNow(rng.int(3, 20)),
        installationTeam: 'Installation Team', technician: rng.pick(TECHNICIANS), location, reference: `INST-${rng.digits(5)}`, notes: 'Awaiting site readiness confirmation.',
        installationStatus: 'Scheduled', commissioningDate: null, commissionedBy: '', checklist: COMMISSIONING_CHECKLIST.map((item) => ({ item, done: false })),
        initialMeterReading: null, initialCondition: '', testResults: '', commissioningStatus: 'Pending', customerConfirmation: null,
        createdAt: daysFromNow(-rng.int(1, 4)), createdBy: rng.pick(users),
      });
    }
    addDocument(asset.id, null, `${manufacturer} ${asset.modelNumber || asset.type} – O&M Manual`, 'Technical Manuals', asset.manufacturingDate!, null, 'Technicians');
    if (rng.chance(0.5)) addDocument(asset.id, null, `${asset.model} – Datasheet`, 'Equipment Datasheets', asset.manufacturingDate!, null, 'Technicians');
    addDocument(asset.id, null, `Purchase Order ${asset.ownership.purchaseReference}`, 'Purchase Documents', asset.ownership.purchaseDate!, null, 'Restricted');

    // Warranty (primary + optional extended)
    if (installDate && summary.warrantyEnd) {
      const warrantyDoc = addDocument(asset.id, null, `${manufacturer} Warranty Certificate`, 'Warranty Documents', installDate, summary.warrantyEnd, 'Customer Visible');
      const claims = rng.chance(0.2)
        ? [{ id: `CLM-${pad(seq.claim++, 4)}`, reference: `${manufacturer.toUpperCase().slice(0, 3)}-WC-${rng.digits(6)}`, date: addDays(installDate, rng.int(30, 300)), description: rng.pick(profile.problems), status: rng.pick(['Approved', 'Settled', 'Submitted'] as const), amount: rng.int(1, 12) * 500, serviceRecordId: null }]
        : [];
      db.warranties.push({
        id: next('war', 'WAR'), assetId: asset.id, componentId: null, provider: `${manufacturer} Middle East`, type: 'Manufacturer Warranty',
        reference: `${manufacturer.toUpperCase().slice(0, 3)}-W-${rng.digits(7)}`, startDate: installDate, endDate: summary.warrantyEnd,
        coverageDetails: 'Parts and labour for manufacturing defects.', exclusions: 'Consumables, misuse, power surges and unauthorised modifications.',
        cancelled: false, documentId: warrantyDoc.id, notes: '', isPrimary: true, claims, createdAt: at(installDate, 16), createdBy: rng.pick(users),
      });
      event(asset.id, at(installDate, 16), 'Warranty Started', `${manufacturer} manufacturer warranty started.`, null, null, `Until ${summary.warrantyEnd}`);
      if (summary.warrantyEnd < today()) event(asset.id, at(summary.warrantyEnd, 0), 'Warranty Expired', 'Manufacturer warranty expired.', null, 'Active', 'Expired', 'System');
      if (summary.warrantyEnd < dateFromNow(60) && rng.chance(0.35)) {
        const start = addDays(summary.warrantyEnd, 1);
        const end = addDays(start, 365 * rng.int(1, 2));
        db.warranties.push({
          id: next('war', 'WAR'), assetId: asset.id, componentId: null, provider: 'Gulf Facility Services Co.', type: rng.pick<WarrantyType>(['Extended Warranty', 'Service Warranty']),
          reference: `EXT-${rng.digits(6)}`, startDate: start, endDate: end, coverageDetails: 'Extended parts cover for major components.', exclusions: 'Consumables and wear parts.',
          cancelled: rng.chance(0.1), documentId: null, notes: '', isPrimary: false, claims: [], createdAt: at(addDays(summary.warrantyEnd, -20), 10), createdBy: rng.pick(users),
        });
        event(asset.id, at(start <= today() ? start : addDays(summary.warrantyEnd, -20), 10), 'Warranty Updated', 'Extended warranty registered.', null);
      }
    }

    // Components
    if (installDate) {
      const count = rng.int(2, profile.components.length);
      for (let c = 0; c < count; c++) {
        const [name, componentType] = profile.components[c];
        const component: AssetComponent = {
          id: next('cmp', 'CMP'), assetId: asset.id, name, componentType, serialNumber: `${componentType.slice(0, 2).toUpperCase()}${rng.digits(8)}`,
          manufacturer, model: `${asset.modelNumber || asset.type} ${componentType}`, installationDate: installDate, replacementDate: null,
          status: END_OF_LIFE.has(status) ? 'Inactive' : 'Active', warrantyEnd: summary.warrantyEnd, warrantyProvider: summary.warrantyEnd ? `${manufacturer} Middle East` : '',
          replacesId: null, replacedById: null, notes: '', createdAt: at(installDate, 13), createdBy: rng.pick(users),
        };
        db.components.push(component);
        event(asset.id, at(installDate, 13), 'Component Added', `${name} registered as a component.`, component.id, null, name);
        if (ageDays > 300 && rng.chance(0.18) && !END_OF_LIFE.has(status)) {
          const replacedOn = addDays(installDate, rng.int(150, ageDays - 30));
          const replacement: AssetComponent = {
            ...component, id: next('cmp', 'CMP'), serialNumber: `${componentType.slice(0, 2).toUpperCase()}${rng.digits(8)}`, installationDate: replacedOn,
            warrantyEnd: addDays(replacedOn, 365), warrantyProvider: `${manufacturer} Middle East`, replacesId: component.id, createdAt: at(replacedOn, 14),
          };
          db.components[db.components.length - 1] = { ...component, status: 'Replaced', replacementDate: replacedOn, replacedById: replacement.id };
          db.components.push(replacement);
          event(asset.id, at(replacedOn, 14), 'Component Replaced', `${name} replaced after failure.`, replacement.id, component.serialNumber, replacement.serialNumber);
        }
      }
    }

    // Documents with expiry (compliance / calibration)
    if (installDate && (asset.category === 'Fire & Safety' || asset.category === 'Vertical Transport' || rng.chance(0.25))) {
      const issue = dateFromNow(-rng.int(30, 330));
      addDocument(asset.id, null, `${asset.name} – ${asset.category === 'Vertical Transport' ? 'Lift Safety Certificate' : asset.category === 'Fire & Safety' ? 'Civil Defense Compliance Certificate' : 'Inspection Certificate'}`, asset.category === 'Fire & Safety' || asset.category === 'Vertical Transport' ? 'Compliance Certificates' : 'Inspection Reports', issue, addDays(issue, 365), 'Customer Visible');
    }
    if (installDate && rng.chance(0.3)) addDocument(asset.id, null, `${asset.name} – Site Photo`, 'Photos', installDate, null);
  }

  // ── Coverage from contracts & AMCs ─────────────────────────────────────────
  const assetsBySite = new Map<string, Asset[]>();
  for (const asset of db.assets) {
    if (!asset.siteId) continue;
    assetsBySite.set(asset.siteId, [...(assetsBySite.get(asset.siteId) ?? []), asset]);
  }
  for (const agreement of reference.agreements) {
    if (agreement.status === 'Draft') continue;
    const coverageType: CoverageType = agreement.kind === 'AMC' ? rng.pick(['Comprehensive', 'Non-Comprehensive', 'Preventive Only']) : rng.pick(['Comprehensive', 'Labor Only', 'Breakdown Only', 'Non-Comprehensive']);
    for (const siteId of agreement.siteIds) {
      for (const asset of assetsBySite.get(siteId) ?? []) {
        if (!asset.installation.date || !matchesAgreement(agreement, asset.category)) continue;
        const visitsAllowed = coverageType === 'Breakdown Only' ? null : ({ Monthly: 12, Quarterly: 4, 'Semi-Annual': 2, Annual: 1 } as Record<string, number>)[asset.service.serviceFrequency ?? ''] ?? 4;
        db.coverages.push({
          id: next('cov', 'COV'), assetId: asset.id, agreementId: agreement.id, slaId: asset.service.slaId,
          entitlement: `${agreement.kind === 'AMC' ? 'AMC' : 'Contract'} ${coverageType} — ${asset.category}`,
          coverageType, serviceFrequency: asset.service.serviceFrequency ?? 'Quarterly', ...coverageTerms(coverageType),
          visitsAllowed, visitsUsed: visitsAllowed === null ? 0 : rng.int(0, visitsAllowed),
        });
        const start = agreement.startDate > asset.installation.date ? agreement.startDate : asset.installation.date;
        event(asset.id, at(start, 9), 'Contract Started', `Covered under ${agreement.number} (${agreement.title}).`, agreement.number, null, coverageType, 'System');
        if (agreement.status === 'Expired') event(asset.id, at(agreement.endDate, 0), 'Contract Expired', `${agreement.number} expired.`, agreement.number, 'Active', 'Expired', 'System');
      }
    }
  }
  const agreementById = new Map(reference.agreements.map((a) => [a.id, a]));
  const LIVE = new Set(['Active', 'Expiring']);
  db.assets = db.assets.map((asset) => {
    const linked = db.coverages.filter((c) => c.assetId === asset.id).map((c) => agreementById.get(c.agreementId)!);
    const pick = (kind: 'Contract' | 'AMC') => (linked.find((a) => a.kind === kind && LIVE.has(a.status)) ?? linked.find((a) => a.kind === kind))?.id ?? null;
    return { ...asset, service: { ...asset.service, contractId: pick('Contract'), amcId: pick('AMC') } };
  });

  // ── Service requests, work orders & maintenance mapped onto assets ─────────
  const byName = (siteId: string, name: string) => (assetsBySite.get(siteId) ?? []).filter((a) => a.name === name && a.installation.date);
  const installedAt = (siteId: string) => (assetsBySite.get(siteId) ?? []).filter((a) => a.installation.date);
  for (const sr of base.serviceRequests) {
    const keyword = SR_KEYWORDS.find(([k]) => sr.subject.includes(k));
    const candidates = keyword ? byName(sr.siteId, keyword[1]) : [];
    const pool = candidates.length ? candidates : installedAt(sr.siteId);
    if (!pool.length) continue;
    const asset = rng.pick(pool);
    db.serviceRequests.push({ id: sr.id, number: sr.number, subject: sr.subject, assetId: asset.id, priority: sr.priority, status: sr.status, createdAt: sr.createdAt, slaDue: sr.slaDue });
  }
  for (const wo of base.workOrders) {
    const name = wo.title.split(' – ')[1] ?? '';
    const candidates = byName(wo.siteId, name);
    const pool = candidates.length ? candidates : installedAt(wo.siteId);
    if (!pool.length) continue;
    db.workOrders.push({ id: wo.id, number: wo.number, title: wo.title, assetId: rng.pick(pool).id, type: wo.type, status: wo.status, technician: wo.technician, scheduledDate: wo.scheduledDate, completedDate: wo.completedDate });
  }
  const assetByTag = new Map(db.assets.map((a) => [a.tag, a]));
  for (const pm of base.maintenance) {
    const asset = assetByTag.get(pm.assetName.split(' · ')[1] ?? '');
    if (!asset) continue;
    db.maintenance.push({ id: pm.id, assetId: asset.id, plan: pm.plan, frequency: pm.frequency, lastDone: null, nextDue: pm.nextDue, status: pm.status });
  }

  // ── Service history ────────────────────────────────────────────────────────
  const OPEN_WO = new Set(['Scheduled', 'In Progress', 'On Hold']);
  const failureProne = new Set(db.assets.filter((a) => a.status === 'Under Repair' || (a.installation.date && rng.chance(0.06))).map((a) => a.id));
  for (const asset of db.assets) {
    const installDate = asset.installation.date;
    if (!installDate) continue;
    const profile = PROFILES[asset.name];
    const site = sites.get(asset.siteId ?? '') as SiteRef;
    const customer = customers.get(asset.customerId ?? '')!;
    const ageDays = Math.max(1, Math.round((Date.now() - new Date(installDate).getTime()) / 86_400_000));
    const endOfLife = END_OF_LIFE.has(asset.status);
    const warranty = db.warranties.find((w) => w.assetId === asset.id && w.isPrimary);
    const coverage = db.coverages.find((c) => c.assetId === asset.id);
    const covering = coverage ? agreementById.get(coverage.agreementId) : undefined;
    const components = db.components.filter((c) => c.assetId === asset.id);
    const records: ServiceRecord[] = [];
    const make = (daysAgo: number, serviceType: ServiceType, problem: string, work: string): ServiceRecord => {
      const date = daysFromNow(-daysAgo, rng.int(8, 17));
      const day = date.slice(0, 10);
      const failure = serviceType === 'Corrective Maintenance' || serviceType === 'Breakdown Service' || serviceType === 'Emergency Service';
      const parts: PartUsage[] = failure || rng.chance(0.35)
        ? Array.from({ length: rng.int(1, failure ? 3 : 1) }, () => {
            const [partNumber, name, cost] = rng.pick(profile.parts);
            return { partNumber, name, quantity: rng.int(1, 3), unitCost: cost };
          })
        : [];
      const laborHours = failure ? rng.int(2, 9) : rng.int(1, 4);
      const underWarranty = !!warranty && day >= warranty.startDate && day <= warranty.endDate && failure && rng.chance(0.5);
      return {
        id: next('svc', 'SVC', 6), assetId: asset.id, componentId: components.length && rng.chance(0.3) ? rng.pick(components).id : null, date,
        serviceType: underWarranty ? 'Warranty Service' : serviceType, serviceRequest: failure ? `SR-${rng.int(3000, 3999)}` : null, workOrder: `WO-${rng.int(5000, 6999)}`,
        technician: rng.pick(TECHNICIANS), serviceLocation: `${site.name} — ${asset.installation.location}`, problemReported: problem,
        diagnosis: failure ? rng.pick(['Worn component identified during inspection.', 'Electrical fault traced to loose termination.', 'Sensor drift beyond tolerance.', 'Component failure due to age and duty cycle.']) : 'No abnormalities found.',
        workPerformed: work, partsUsed: parts, laborHours, laborCost: laborHours * 180,
        result: failure && rng.chance(0.15) ? 'Follow-up Required' : failure ? 'Resolved' : 'Completed',
        meterReading: asset.operational.currentMeterReading === null ? null : Math.max(0, Math.round((asset.operational.currentMeterReading * (ageDays - daysAgo)) / ageDays)),
        customerConfirmation: daysAgo < 3 ? 'Pending' : rng.chance(0.9) ? 'Confirmed' : 'Not Required', warrantyService: underWarranty,
        coveredBy: covering && day >= covering.startDate && day <= covering.endDate ? covering.number : null, currency: customer.commercial.currency,
      };
    };
    const span = endOfLife ? Math.min(ageDays, 400) : ageDays;
    const offset = endOfLife ? ageDays - span + 120 : 0;
    const pmCount = Math.min(10, Math.max(1, Math.floor(span / 95)));
    for (let i = 0; i < pmCount; i++) {
      const daysAgo = Math.max(1, Math.round(offset + (span * (i + 0.5)) / pmCount) + rng.int(-5, 5));
      if (daysAgo >= ageDays) continue;
      const type: ServiceType = asset.category === 'Medical Equipment' && i % 2 === 0 ? 'Calibration' : i % 4 === 3 ? 'Inspection' : 'Preventive Maintenance';
      records.push(make(daysAgo, type, `Scheduled ${asset.service.maintenancePlan}`, rng.pick(['Planned preventive maintenance completed as per checklist.', 'Filters, belts and connections checked; readings logged.', 'Inspection completed; all parameters within tolerance.'])));
    }
    const failures = failureProne.has(asset.id) ? rng.int(3, 5) : rng.int(0, 2);
    for (let i = 0; i < failures; i++) {
      const daysAgo = failureProne.has(asset.id) ? rng.int(2, Math.min(170, ageDays - 1)) : rng.int(1, Math.max(2, ageDays - 1));
      if (daysAgo >= ageDays || daysAgo < 1) continue;
      const type = rng.pick<ServiceType>(['Corrective Maintenance', 'Corrective Maintenance', 'Breakdown Service', 'Emergency Service']);
      records.push(make(daysAgo, type, rng.pick(profile.problems), rng.pick(['Faulty part replaced and system restored.', 'Fault rectified; tested under load.', 'Temporary repair made; permanent fix scheduled.'])));
    }
    records.push({ ...make(Math.max(1, ageDays - 1), 'Installation', 'New installation', 'Equipment installed and connected.'), date: at(installDate, 12), partsUsed: [], meterReading: asset.installation.initialMeterReading, warrantyService: false, serviceType: 'Installation', result: 'Completed', coveredBy: null });
    records.sort((a, b) => b.date.localeCompare(a.date));
    db.serviceRecords.push(...records);
    for (const r of records) {
      if (r.serviceType === 'Preventive Maintenance' || r.serviceType === 'Calibration') event(asset.id, r.date, 'Maintenance Performed', r.workPerformed, r.workOrder, null, null, r.technician);
      else if (r.serviceType !== 'Installation' && r.serviceType !== 'Inspection') event(asset.id, r.date, 'Repair Performed', `${r.problemReported} — ${r.workPerformed}`, r.workOrder, null, null, r.technician);
    }

    const lastPm = records.find((r) => r.serviceType === 'Preventive Maintenance' || r.serviceType === 'Calibration' || r.serviceType === 'Inspection');
    let plans = db.maintenance.filter((m) => m.assetId === asset.id);
    if (!plans.length && !endOfLife && !['Temporarily Out of Service'].includes(asset.status)) {
      const due = rng.int(-12, 80);
      const plan: AssetMaintenance = { id: `APM-${pad(seq.pm++, 4)}`, assetId: asset.id, plan: asset.service.maintenancePlan, frequency: asset.service.serviceFrequency ?? 'Quarterly', lastDone: lastPm?.date.slice(0, 10) ?? null, nextDue: dateFromNow(due), status: due < 0 ? 'Overdue' : due <= 7 ? 'Due' : 'Scheduled' };
      db.maintenance.push(plan);
      plans = [plan];
    }
    db.maintenance = db.maintenance.map((m) => (m.assetId === asset.id ? { ...m, lastDone: lastPm?.date.slice(0, 10) ?? m.lastDone } : m));
    const nextDue = plans.map((m) => m.nextDue).sort()[0] ?? null;
    const index = db.assets.findIndex((a) => a.id === asset.id);
    db.assets[index] = { ...db.assets[index], operational: { ...db.assets[index].operational, lastMaintenanceDate: lastPm?.date.slice(0, 10) ?? null, nextMaintenanceDate: endOfLife ? null : nextDue } };
    if (asset.status === 'Under Repair' && !db.workOrders.some((w) => w.assetId === asset.id && OPEN_WO.has(w.status))) {
      db.workOrders.push({ id: `WO-A${asset.id.slice(4)}`, number: `WO-A${asset.id.slice(4)}`, title: `Corrective – ${asset.name}`, assetId: asset.id, type: 'Corrective', status: 'In Progress', technician: asset.operational.assignedTechnician, scheduledDate: dateFromNow(-1), completedDate: null });
    }
  }

  // ── Transfers ──────────────────────────────────────────────────────────────
  const movable = db.assets.filter((a) => OPERATIONAL.has(a.status) && a.installation.date && a.siteId);
  const otherSite = (asset: Asset, anyCustomer: boolean) =>
    reference.sites.find((s) => s.id !== asset.siteId && s.status === 'Active' && (anyCustomer ? s.customerId !== asset.customerId : s.customerId === asset.customerId));
  const transferPlan: readonly { status: AssetTransfer['status']; daysAgo: number; reason: TransferReason; crossCustomer?: boolean }[] = [
    { status: 'Completed', daysAgo: 160, reason: 'Site Relocation' },
    { status: 'Completed', daysAgo: 95, reason: 'Operational Requirement' },
    { status: 'Completed', daysAgo: 40, reason: 'Customer Request' },
    { status: 'Completed', daysAgo: 21, reason: 'Project Requirement' },
    { status: 'Completed', daysAgo: 8, reason: 'Replacement', crossCustomer: true },
    { status: 'Approved', daysAgo: 3, reason: 'Maintenance Requirement' },
    { status: 'Requested', daysAgo: 2, reason: 'Customer Request' },
    { status: 'Requested', daysAgo: 1, reason: 'Site Relocation' },
    { status: 'Rejected', daysAgo: 30, reason: 'Other' },
  ];
  transferPlan.forEach((plan, i) => {
    const asset = movable[(i * 13 + 5) % movable.length];
    const target = otherSite(asset, !!plan.crossCustomer) ?? otherSite(asset, true);
    if (!target) return;
    const requestedAt = daysFromNow(-plan.daysAgo - 3, 10);
    const requester = rng.pick(users);
    const approver = users[1];
    const fromLocation = asset.installation.location;
    const toLocation = rng.pick(PROFILES[asset.name].locations);
    const transfer: AssetTransfer = {
      id: next('trf', 'TRF'), assetId: asset.id,
      from: { customerId: asset.customerId, siteId: asset.siteId, location: fromLocation },
      to: { customerId: target.customerId, siteId: target.id, location: toLocation },
      transferDate: plan.status === 'Requested' ? dateFromNow(rng.int(3, 14)) : dateFromNow(-plan.daysAgo), reason: plan.reason, requestedBy: requester,
      approvedBy: plan.status === 'Requested' || plan.status === 'Rejected' ? null : approver, reference: `TR-${rng.digits(6)}`,
      notes: plan.status === 'Rejected' ? 'Rejected: target site not ready for installation.' : '', status: plan.status, requestedAt,
      approvedAt: plan.status === 'Requested' || plan.status === 'Rejected' ? null : daysFromNow(-plan.daysAgo - 1, 12),
      completedAt: plan.status === 'Completed' ? daysFromNow(-plan.daysAgo, 15) : null, previousAssetStatus: asset.status,
    };
    db.transfers.push(transfer);
    event(asset.id, requestedAt, 'Transfer Requested', `Transfer to ${target.name} requested (${plan.reason}).`, transfer.reference, null, null, requester);
    const index = db.assets.findIndex((a) => a.id === asset.id);
    if (plan.status === 'Completed') {
      const fromSite = sites.get(asset.siteId ?? '')?.name ?? '';
      db.assets[index] = { ...asset, customerId: target.customerId, siteId: target.id, installation: { ...asset.installation, location: toLocation, room: toLocation }, service: { ...asset.service, serviceTerritoryId: target.serviceTerritoryId } };
      event(asset.id, transfer.completedAt!, 'Location Changed', `Moved to ${target.name} — ${toLocation}.`, transfer.reference, `${fromSite} — ${fromLocation}`, `${target.name} — ${toLocation}`, approver);
      event(asset.id, transfer.completedAt!, 'Asset Transferred', `Transfer ${transfer.reference} completed.`, transfer.reference, null, null, approver);
      if (target.customerId !== asset.customerId) {
        const to = customers.get(target.customerId)!;
        db.assets[index] = { ...db.assets[index], ownership: { ...db.assets[index].ownership, owner: to.name } };
        event(asset.id, transfer.completedAt!, 'Ownership Changed', 'Customer changed through transfer.', transfer.reference, customers.get(asset.customerId ?? '')?.name ?? null, to.name, approver);
      }
    } else if (plan.status === 'Approved') {
      db.assets[index] = { ...asset, status: 'Transferred' };
      event(asset.id, transfer.approvedAt!, 'Status Changed', 'Asset in movement after transfer approval.', transfer.reference, asset.status, 'Transferred', approver);
    }
  });

  // ── End-of-life events ─────────────────────────────────────────────────────
  for (const asset of db.assets) {
    if (asset.status === 'Retired' || asset.status === 'Decommissioned') {
      const retiredOn = daysFromNow(-rng.int(30, 200), 11);
      event(asset.id, retiredOn, 'Asset Retired', 'Asset retired from operational service.', null, 'Active', 'Retired');
      if (asset.status === 'Decommissioned') event(asset.id, daysFromNow(-rng.int(5, 29), 11), 'Asset Decommissioned', 'Asset decommissioned and removed from site.', null, 'Retired', 'Decommissioned');
    }
  }

  db.lifecycle.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return db;
}
