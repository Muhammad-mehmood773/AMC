import type { ActivityAction, ActivityEntity, ActivityEntry } from '../../models/activity.model';
import type { Contact, ContactType, PreferredLanguage } from '../../models/contact.model';
import type {
  Address,
  BillingCycle,
  CommunicationMethod,
  Customer,
  CustomerCategory,
  CustomerStatus,
  CustomerType,
  ServicePriority,
  ServiceWindow,
} from '../../models/customer.model';
import type { CustomerDocument, DocumentCategory } from '../../models/document.model';
import type { CustomerLookups } from '../../models/lookup.model';
import type {
  AgreementStatus,
  AgreementSummary,
  AssetStatus,
  AssetSummary,
  InvoiceStatus,
  InvoiceSummary,
  MaintenanceSummary,
  RequestPriority,
  ServiceHistoryEntry,
  ServiceRequestStatus,
  ServiceRequestSummary,
  WorkOrderStatus,
  WorkOrderSummary,
  WorkOrderType,
} from '../../models/related.model';
import type { Site, SiteStatus, SiteType, VisitTime, Weekday } from '../../models/site.model';
import { LOOKUPS_SEED } from './lookups.seed';
import { type Random, dateFromNow, daysFromNow, pad, random } from './mock-utils';

export interface MockDatabase {
  customers: Customer[];
  sites: Site[];
  contacts: Contact[];
  documents: CustomerDocument[];
  activities: ActivityEntry[];
  assets: AssetSummary[];
  agreements: AgreementSummary[];
  serviceRequests: ServiceRequestSummary[];
  workOrders: WorkOrderSummary[];
  maintenance: MaintenanceSummary[];
  invoices: InvoiceSummary[];
  serviceHistory: ServiceHistoryEntry[];
  lookups: CustomerLookups;
}

interface CustomerBlueprint {
  readonly name: string;
  readonly short: string;
  readonly type: CustomerType;
  readonly category: CustomerCategory;
  readonly status: CustomerStatus;
  readonly industry: string;
  readonly country: string;
  readonly region: string;
  readonly city: string;
  readonly district: string;
  readonly createdDaysAgo: number;
  readonly sites: number;
}

const BLUEPRINTS: readonly CustomerBlueprint[] = [
  { name: 'King Faisal Specialist Medical Group', short: 'KFSMG', type: 'Corporate', category: 'Healthcare', status: 'Active', industry: 'Healthcare', country: 'Saudi Arabia', region: 'Riyadh', city: 'Riyadh', district: 'Al Olaya', createdDaysAgo: 812, sites: 5 },
  { name: 'Al Noor Hospitality Holdings', short: 'Al Noor', type: 'Corporate', category: 'Hospitality', status: 'Active', industry: 'Hospitality', country: 'Saudi Arabia', region: 'Makkah', city: 'Jeddah', district: 'Al Rawdah', createdDaysAgo: 640, sites: 4 },
  { name: 'Riyadh Metro Facilities Authority', short: 'RMFA', type: 'Government', category: 'Government', status: 'Active', industry: 'Government Services', country: 'Saudi Arabia', region: 'Riyadh', city: 'Riyadh', district: 'KAFD', createdDaysAgo: 590, sites: 5 },
  { name: 'Eastern Petrochem Industries', short: 'EPI', type: 'Corporate', category: 'Industrial', status: 'Active', industry: 'Oil & Gas', country: 'Saudi Arabia', region: 'Eastern Province', city: 'Jubail', district: 'Industrial City', createdDaysAgo: 720, sites: 4 },
  { name: 'Najd International Schools', short: 'Najd Schools', type: 'Corporate', category: 'Education', status: 'Active', industry: 'Education', country: 'Saudi Arabia', region: 'Riyadh', city: 'Riyadh', district: 'Al Malqa', createdDaysAgo: 455, sites: 3 },
  { name: 'Red Sea Mall Management', short: 'Red Sea Mall', type: 'Corporate', category: 'Commercial', status: 'Active', industry: 'Retail', country: 'Saudi Arabia', region: 'Makkah', city: 'Jeddah', district: 'Al Shati', createdDaysAgo: 380, sites: 2 },
  { name: 'Gulf Cold Chain Logistics', short: 'GCC Logistics', type: 'SME', category: 'Industrial', status: 'Active', industry: 'Logistics', country: 'Saudi Arabia', region: 'Eastern Province', city: 'Dammam', district: '2nd Industrial City', createdDaysAgo: 300, sites: 3 },
  { name: 'Municipality of Asir Region', short: 'Asir Municipality', type: 'Government', category: 'Government', status: 'Active', industry: 'Government Services', country: 'Saudi Arabia', region: 'Asir', city: 'Abha', district: 'Al Mansak', createdDaysAgo: 520, sites: 3 },
  { name: 'Al Rajhi Towers Residential', short: 'Rajhi Towers', type: 'Corporate', category: 'Residential', status: 'Active', industry: 'Real Estate', country: 'Saudi Arabia', region: 'Riyadh', city: 'Riyadh', district: 'Al Yasmin', createdDaysAgo: 260, sites: 3 },
  { name: 'Madinah Heritage Hotels', short: 'Heritage Hotels', type: 'Corporate', category: 'Hospitality', status: 'On Hold', industry: 'Hospitality', country: 'Saudi Arabia', region: 'Madinah', city: 'Madinah', district: 'Central Area', createdDaysAgo: 410, sites: 2 },
  { name: 'Saudi Precision Manufacturing', short: 'SPM', type: 'SME', category: 'Industrial', status: 'Active', industry: 'Manufacturing', country: 'Saudi Arabia', region: 'Qassim', city: 'Buraydah', district: 'Industrial Area', createdDaysAgo: 230, sites: 2 },
  { name: 'Khobar Corniche Clinics', short: 'Corniche Clinics', type: 'SME', category: 'Healthcare', status: 'Active', industry: 'Healthcare', country: 'Saudi Arabia', region: 'Eastern Province', city: 'Al Khobar', district: 'Al Corniche', createdDaysAgo: 170, sites: 2 },
  { name: 'Fakeeh Education Campus', short: 'Fakeeh Campus', type: 'Corporate', category: 'Education', status: 'Active', industry: 'Education', country: 'Saudi Arabia', region: 'Makkah', city: 'Jeddah', district: 'Al Zahra', createdDaysAgo: 75, sites: 2 },
  { name: 'Tamimi Retail Group', short: 'Tamimi Retail', type: 'Corporate', category: 'Commercial', status: 'Active', industry: 'Retail', country: 'Saudi Arabia', region: 'Eastern Province', city: 'Dammam', district: 'Al Faisaliyah', createdDaysAgo: 690, sites: 5 },
  { name: 'Abdullah Al-Saud Villa Compound', short: 'Al-Saud Compound', type: 'Individual', category: 'Residential', status: 'Active', industry: 'Real Estate', country: 'Saudi Arabia', region: 'Riyadh', city: 'Diriyah', district: 'Al Bujairi', createdDaysAgo: 140, sites: 1 },
  { name: 'Emirates Integrated Partners', short: 'EIP', type: 'Partner', category: 'Enterprise', status: 'Active', industry: 'Telecommunications', country: 'United Arab Emirates', region: 'Dubai', city: 'Dubai', district: 'Business Bay', createdDaysAgo: 62, sites: 2 },
  { name: 'Apex Facilities Management UK', short: 'Apex UK', type: 'Corporate', category: 'Commercial', status: 'Active', industry: 'Real Estate', country: 'United Kingdom', region: 'England', city: 'London', district: 'City of London', createdDaysAgo: 55, sites: 2 },
  { name: 'Steinberg Industrial Systems GmbH', short: 'Steinberg', type: 'Corporate', category: 'Industrial', status: 'Active', industry: 'Manufacturing', country: 'Germany', region: 'Bavaria', city: 'Munich', district: 'Maxvorstadt', createdDaysAgo: 40, sites: 1 },
  { name: 'NovaTech Healthcare USA', short: 'NovaTech', type: 'Corporate', category: 'Healthcare', status: 'Active', industry: 'Healthcare', country: 'United States', region: 'Texas', city: 'Houston', district: 'Medical Center', createdDaysAgo: 48, sites: 2 },
  { name: 'Karachi Logistics Hub', short: 'KLH', type: 'SME', category: 'Industrial', status: 'Active', industry: 'Logistics', country: 'Pakistan', region: 'Sindh', city: 'Karachi', district: 'SITE Industrial Area', createdDaysAgo: 30, sites: 1 },
  { name: 'National Commercial Bank – Branch Network', short: 'NCB Branches', type: 'Corporate', category: 'Enterprise', status: 'Active', industry: 'Banking & Finance', country: 'Saudi Arabia', region: 'Riyadh', city: 'Riyadh', district: 'Al Murabba', createdDaysAgo: 900, sites: 5 },
  { name: 'Taif Rose Resorts', short: 'Taif Rose', type: 'SME', category: 'Hospitality', status: 'Inactive', industry: 'Hospitality', country: 'Saudi Arabia', region: 'Makkah', city: 'Taif', district: 'Al Hada', createdDaysAgo: 760, sites: 1 },
  { name: 'Yanbu Desalination Services', short: 'Yanbu Desal', type: 'Government', category: 'Industrial', status: 'Active', industry: 'Government Services', country: 'Saudi Arabia', region: 'Madinah', city: 'Yanbu', district: 'Royal Commission', createdDaysAgo: 340, sites: 2 },
  { name: 'Dhahran Techno Park', short: 'Techno Park', type: 'Corporate', category: 'Commercial', status: 'Active', industry: 'Real Estate', country: 'Saudi Arabia', region: 'Eastern Province', city: 'Dhahran', district: 'Techno Valley', createdDaysAgo: 120, sites: 3 },
  { name: 'Al Kharj Dairy Farms', short: 'Kharj Dairy', type: 'Corporate', category: 'Industrial', status: 'On Hold', industry: 'Manufacturing', country: 'Saudi Arabia', region: 'Riyadh', city: 'Al Kharj', district: 'Al Sahna', createdDaysAgo: 480, sites: 2 },
  { name: 'Jeddah Waterfront Apartments', short: 'Waterfront Apts', type: 'SME', category: 'Residential', status: 'Active', industry: 'Real Estate', country: 'Saudi Arabia', region: 'Makkah', city: 'Jeddah', district: 'Al Hamra', createdDaysAgo: 18, sites: 1 },
  { name: 'Bahrain Gateway Hotels', short: 'Gateway Hotels', type: 'Partner', category: 'Hospitality', status: 'Active', industry: 'Hospitality', country: 'Bahrain', region: 'Capital', city: 'Manama', district: 'Seef', createdDaysAgo: 205, sites: 2 },
  { name: 'Ahsa Date Processing Co.', short: 'Ahsa Dates', type: 'SME', category: 'Industrial', status: 'Archived', industry: 'Manufacturing', country: 'Saudi Arabia', region: 'Eastern Province', city: 'Al Ahsa', district: 'Al Hofuf', createdDaysAgo: 1100, sites: 1 },
  { name: 'Unaizah General Hospital', short: 'Unaizah Hospital', type: 'Government', category: 'Healthcare', status: 'Active', industry: 'Healthcare', country: 'Saudi Arabia', region: 'Qassim', city: 'Unaizah', district: 'Al Khalidiyah', createdDaysAgo: 95, sites: 2 },
  { name: 'Diriyah Gate Cultural Venues', short: 'Diriyah Venues', type: 'Government', category: 'Hospitality', status: 'Active', industry: 'Government Services', country: 'Saudi Arabia', region: 'Riyadh', city: 'Diriyah', district: 'At-Turaif', createdDaysAgo: 9, sites: 2 },
  { name: 'Sahara Smart Offices', short: 'Sahara Offices', type: 'SME', category: 'Commercial', status: 'Active', industry: 'Real Estate', country: 'Saudi Arabia', region: 'Riyadh', city: 'Riyadh', district: 'Al Sulaimaniyah', createdDaysAgo: 4, sites: 1 },
  { name: 'Prime Care Pharmacies', short: 'Prime Care', type: 'Other', category: 'Healthcare', status: 'Inactive', industry: 'Retail', country: 'Saudi Arabia', region: 'Makkah', city: 'Makkah', district: 'Al Aziziyah', createdDaysAgo: 610, sites: 2 },
];

const SITE_TYPES_BY_CATEGORY: Record<CustomerCategory, readonly SiteType[]> = {
  Healthcare: ['Hospital', 'Head Office', 'Branch'],
  Hospitality: ['Hotel', 'Head Office', 'Hotel'],
  Education: ['School', 'Head Office', 'School'],
  Industrial: ['Factory', 'Warehouse', 'Industrial Site'],
  Commercial: ['Commercial Building', 'Branch', 'Head Office'],
  Residential: ['Residential Building', 'Residential Building', 'Other'],
  Government: ['Head Office', 'Branch', 'Commercial Building'],
  Enterprise: ['Head Office', 'Branch', 'Branch'],
};

const SITE_SUFFIX: Record<SiteType, readonly string[]> = {
  'Head Office': ['Head Office', 'Corporate HQ'],
  Branch: ['North Branch', 'East Branch', 'City Centre Branch', 'West Branch'],
  Warehouse: ['Central Warehouse', 'Distribution Centre'],
  Factory: ['Plant 1', 'Plant 2', 'Processing Plant'],
  Hospital: ['Main Hospital', 'Women & Children Hospital', 'Specialist Centre'],
  Hotel: ['Grand Hotel', 'Suites', 'Resort & Spa'],
  School: ['Boys Campus', 'Girls Campus', 'Primary Campus'],
  'Residential Building': ['Tower A', 'Tower B', 'Residences'],
  'Commercial Building': ['Business Centre', 'Mall', 'Office Tower'],
  'Industrial Site': ['Utilities Block', 'Industrial Yard'],
  Other: ['Community Facilities', 'Annex'],
};

const DISTRICTS: Record<string, readonly string[]> = {
  Riyadh: ['Al Olaya', 'Al Malqa', 'Al Sahafa', 'Al Nakheel', 'Al Wurud', 'Al Rabwah', 'Hittin'],
  Jeddah: ['Al Rawdah', 'Al Andalus', 'Al Salamah', 'Al Naeem', 'Obhur'],
  Dammam: ['Al Faisaliyah', 'Al Shatea', 'Al Mazruiyah'],
  'Al Khobar': ['Al Aqrabiyah', 'Al Rakah', 'Al Corniche'],
};

const FIRST_NAMES = ['Mohammed', 'Abdulrahman', 'Faisal', 'Nasser', 'Turki', 'Majed', 'Rami', 'Hani', 'Imran', 'Tariq', 'Reem', 'Huda', 'Mona', 'Aisha', 'Dana', 'Layla', 'Hessa', 'Maryam'];
const LAST_NAMES = ['Al-Ghamdi', 'Al-Shehri', 'Al-Zahrani', 'Al-Otaibi', 'Al-Subaie', 'Al-Anazi', 'Bakr', 'Siddiqui', 'Hamdan', 'Al-Shammari', 'Al-Malki', 'Kanaan', 'Al-Juhani', 'Al-Amri'];
const DEPARTMENTS: Record<ContactType, readonly string[]> = {
  Primary: ['Executive Office', 'Operations'],
  Technical: ['Engineering', 'Maintenance'],
  Billing: ['Finance', 'Accounts Payable'],
  Procurement: ['Procurement', 'Supply Chain'],
  Management: ['Executive Office', 'General Management'],
  'Site Contact': ['Facilities', 'Operations'],
  Emergency: ['Security', 'Facilities'],
  Other: ['Administration'],
};
const DESIGNATIONS: Record<ContactType, readonly string[]> = {
  Primary: ['Facility Director', 'Operations Director'],
  Technical: ['IT Manager', 'Chief Engineer', 'Maintenance Manager'],
  Billing: ['Finance Manager', 'Accounts Payable Lead'],
  Procurement: ['Procurement Manager', 'Category Buyer'],
  Management: ['General Manager', 'Chief Operating Officer'],
  'Site Contact': ['Site Manager', 'Site Engineer', 'Facility Supervisor'],
  Emergency: ['Security Supervisor', 'Duty Manager'],
  Other: ['Administrator'],
};

const ASSET_CATALOG: readonly { name: string; category: string; models: readonly string[] }[] = [
  { name: 'Water-Cooled Chiller', category: 'HVAC', models: ['Carrier 30XW-400', 'Trane RTHF-350', 'York YK-500'] },
  { name: 'Air Handling Unit', category: 'HVAC', models: ['Daikin AHU-D15', 'Carrier 39HQ-12'] },
  { name: 'Diesel Generator', category: 'Power', models: ['Caterpillar C18 600kVA', 'Cummins C1100D5'] },
  { name: 'Passenger Elevator', category: 'Vertical Transport', models: ['KONE MonoSpace 700', 'Otis Gen2 Life'] },
  { name: 'Fire Alarm Control Panel', category: 'Fire & Safety', models: ['Notifier NFS2-3030', 'Simplex 4100ES'] },
  { name: 'UPS System', category: 'Power', models: ['APC Galaxy VS 100kW', 'Eaton 93PM 80kW'] },
  { name: 'CCTV Recording Server', category: 'Security', models: ['Hikvision DS-96256NI', 'Milestone Husky X8'] },
  { name: 'Booster Pump Set', category: 'Plumbing', models: ['Grundfos Hydro MPC-E', 'Wilo SiBoost Smart'] },
  { name: 'BMS Controller', category: 'Building Automation', models: ['Honeywell Spyder', 'Siemens PXC Modular'] },
  { name: 'Cold Room Compressor', category: 'Refrigeration', models: ['Bitzer 4NES-20Y', 'Copeland ZB76'] },
];

const SR_SUBJECTS = ['Chiller high-pressure alarm', 'AC not cooling in east wing', 'Generator failed weekly test', 'Elevator stuck between floors', 'Fire panel showing fault', 'Water leakage near plant room', 'UPS battery replacement request', 'CCTV camera offline', 'Cold room temperature deviation', 'BMS communication loss'];
const TECHNICIANS = ['Rashid Khan', 'Bilal Ahmed', 'Saeed Al-Amri', 'Jomar Santos', 'Vikram Patel', 'Ali Hassan', 'Mahmoud Saleh'];
const VISIT_SUMMARIES = ['Replaced faulty contactor and restored chiller operation.', 'Quarterly PPM completed; filters and belts replaced.', 'Annual load-bank test of generator completed successfully.', 'Elevator door operator adjusted; safety circuits verified.', 'Fire alarm detectors cleaned and tested as per NFPA 72.', 'Recharged refrigerant and checked for leaks.', 'Pump mechanical seal replaced; pressure normalized.', 'Firmware updated on BMS controllers.'];

const CODE_BASE = 100;

function slug(short: string): string {
  return short.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14);
}

const INTL_STREETS: Record<string, readonly string[]> = {
  'United States': ['Main Street', 'Oak Avenue', 'Park Boulevard', '5th Avenue', 'Market Street'],
  'Canada': ['Yonge Street', 'Granville Street', 'Robson Street', 'King Street', 'Queen Street'],
  'United Kingdom': ['High Street', 'Victoria Road', 'Church Lane', 'Station Road', 'London Road'],
  'Germany': ['Hauptstraße', 'Bahnhofstraße', 'Goethestraße', 'Schillerstraße', 'Friedrichstraße'],
  'France': ['Rue de la Paix', 'Avenue des Champs-Élysées', 'Boulevard Haussmann', 'Rue du Faubourg'],
  'Netherlands': ['Keizersgracht', 'Prinsengracht', 'Herengracht', 'Damrak', 'Kalverstraat'],
  'Pakistan': ['M.A. Jinnah Road', 'Mall Road', 'Shahrah-e-Faisal', 'Clifton Road', 'Gulberg Main Boulevard'],
};
const GCC_COUNTRIES = new Set(['United Arab Emirates', 'Bahrain', 'Kuwait', 'Oman', 'Qatar']);

function makeAddress(rng: Random, country: string, region: string, city: string, district: string): Address {
  const sa = country === 'Saudi Arabia';
  const gcc = GCC_COUNTRIES.has(country);
  const intlStreets = INTL_STREETS[country];
  const street = intlStreets
    ? rng.pick(intlStreets)
    : rng.pick(['King Fahd Road', 'Prince Sultan Street', 'Corniche Road', 'Commerce Street', 'Central Road']);
  const building = sa ? rng.digits(4) : '';
  let postalCode: string;
  if (sa) {
    postalCode = `${rng.int(1, 3)}${rng.digits(4)}`;
  } else if (country === 'United Kingdom') {
    const letters = 'ABCDEFGHJKLMNPRSTUVWXY';
    postalCode = `${rng.pick(letters.split(''))}${rng.pick(letters.split(''))}${rng.int(1, 9)} ${rng.int(1, 9)}${rng.pick(['AA', 'AB', 'BC', 'CD', 'DE'])}`;
  } else if (country === 'Canada') {
    postalCode = `M${rng.int(1, 9)}V ${rng.int(1, 9)}L${rng.int(1, 9)}`;
  } else {
    postalCode = rng.digits(5);
  }
  const streetDisplay = intlStreets ? `${rng.int(1, 999)} ${street}` : `${building} ${street}`;
  return {
    country,
    region,
    city,
    district,
    street,
    buildingNumber: building,
    postalCode,
    additionalNumber: sa ? rng.digits(4) : '',
    addressLine: `${streetDisplay}, ${district || city}, ${city}`,
    latitude: Number(
      (sa ? 21 + rng.next() * 6 : gcc ? 23 + rng.next() * 4 : country === 'United Kingdom' ? 51 + rng.next() * 3 : country === 'Pakistan' ? 24 + rng.next() * 7 : 40 + rng.next() * 10).toFixed(6),
    ),
    longitude: Number(
      (sa ? 39 + rng.next() * 11 : gcc ? 50 + rng.next() * 6 : country === 'United Kingdom' ? -3 + rng.next() * 4 : country === 'Pakistan' ? 66 + rng.next() * 8 : -10 + rng.next() * 40).toFixed(6),
    ),
  };
}

/** Returns a representative IANA timezone for the given country. */
function countryTimezone(country: string): string {
  const map: Record<string, string> = {
    'Saudi Arabia': 'Asia/Riyadh',
    'United Arab Emirates': 'Asia/Dubai',
    'Bahrain': 'Asia/Bahrain',
    'Kuwait': 'Asia/Kuwait',
    'Oman': 'Asia/Muscat',
    'Qatar': 'Asia/Qatar',
    'United States': 'America/New_York',
    'Canada': 'America/Toronto',
    'United Kingdom': 'Europe/London',
    'Germany': 'Europe/Berlin',
    'France': 'Europe/Paris',
    'Netherlands': 'Europe/Amsterdam',
    'Pakistan': 'Asia/Karachi',
  };
  return map[country] ?? 'UTC';
}

function audit(createdAt: string, user = 'Ahmed Al-Harbi') {
  return { createdAt, createdBy: user, updatedAt: null, updatedBy: null };
}

export function buildSeed(): MockDatabase {
  const rng = random(20261005);
  const lookups = LOOKUPS_SEED;
  const db: MockDatabase = {
    customers: [],
    sites: [],
    contacts: [],
    documents: [],
    activities: [],
    assets: [],
    agreements: [],
    serviceRequests: [],
    workOrders: [],
    maintenance: [],
    invoices: [],
    serviceHistory: [],
    lookups,
  };

  let siteSeq = 1;
  let contactSeq = 1;
  let assetSeq = 1;
  let agreementSeq = 100;
  let srSeq = 4000;
  let woSeq = 7000;
  let invSeq = 2000;
  let docSeq = 1;
  let actSeq = 1;
  let pmSeq = 1;

  const log = (
    timestamp: string,
    action: ActivityAction,
    entity: ActivityEntity,
    entityId: string,
    customerId: string,
    siteId: string | null,
    description: string,
    reference: string | null,
    change?: { field: string; from: string; to: string },
    userName?: string,
  ) => {
    const user = userName ? lookups.users.find((u) => u.name === userName) ?? lookups.users[0] : rng.pick(lookups.users);
    const nowIso = new Date().toISOString();
    db.activities.push({
      id: `ACT-${pad(actSeq++, 5)}`,
      timestamp: timestamp > nowIso ? daysFromNow(-0.05) : timestamp,
      userId: user.id,
      userName: user.name,
      action,
      entity,
      entityId,
      customerId,
      siteId,
      field: change?.field ?? null,
      previousValue: change?.from ?? null,
      newValue: change?.to ?? null,
      reference,
      description,
    });
  };

  const COUNTRY_PHONE_PREFIX: Record<string, string> = {
    'Saudi Arabia': '+966',
    'United Arab Emirates': '+971',
    'Bahrain': '+973',
    'Kuwait': '+965',
    'Oman': '+968',
    'Qatar': '+974',
    'United Kingdom': '+44',
    'Germany': '+49',
    'France': '+33',
    'Netherlands': '+31',
    'United States': '+1',
    'Canada': '+1',
    'Pakistan': '+92',
  };

  const makeContact = (
    customerId: string,
    siteId: string | null,
    type: ContactType,
    isPrimary: boolean,
    domain: string,
    createdAt: string,
    country = 'Saudi Arabia',
    status: 'Active' | 'Inactive' = 'Active',
  ): Contact => {
    const firstName = rng.pick(FIRST_NAMES);
    const lastName = rng.pick(LAST_NAMES);
    const prefix = COUNTRY_PHONE_PREFIX[country] ?? '+966';
    const isSa = country === 'Saudi Arabia';
    const contact: Contact = {
      id: `CON-${pad(contactSeq++, 4)}`,
      customerId,
      siteId,
      firstName,
      lastName,
      designation: rng.pick(DESIGNATIONS[type]),
      department: rng.pick(DEPARTMENTS[type]),
      email: `${firstName[0].toLowerCase()}.${lastName.toLowerCase().replace(/^al-/, '').replace(/[^a-z]/g, '')}@${domain}`,
      mobile: isSa ? `${prefix} 5${rng.int(0, 9)} ${rng.digits(3)} ${rng.digits(4)}` : `${prefix} ${rng.digits(3)} ${rng.digits(3)} ${rng.digits(4)}`,
      phone: rng.chance(0.7) ? (isSa ? `${prefix} 1${rng.int(1, 7)} ${rng.digits(3)} ${rng.digits(4)}` : `${prefix} ${rng.digits(2)} ${rng.digits(4)} ${rng.digits(4)}`) : '',
      preferredLanguage: rng.pick<PreferredLanguage>(['English', 'Arabic', 'Arabic', 'English']),
      preferredCommunication: rng.pick<CommunicationMethod>(['Email', 'Mobile', 'Email', 'WhatsApp', 'Phone']),
      type,
      isPrimary,
      status,
      notes: type === 'Emergency' ? 'Available 24/7 for critical incidents.' : '',
      ...audit(createdAt),
    };
    db.contacts.push(contact);
    return contact;
  };

  BLUEPRINTS.forEach((bp, index) => {
    const id = `CUS-${pad(CODE_BASE + index + 1, 5)}`;
    const createdAt = daysFromNow(-bp.createdDaysAgo, 9 + (index % 8));
    const tldMap: Record<string, string> = { 'Saudi Arabia': 'com.sa', 'United Arab Emirates': 'ae', 'Bahrain': 'bh', 'Kuwait': 'kw', 'Oman': 'om', 'Qatar': 'qa', 'United Kingdom': 'co.uk', 'Germany': 'de', 'France': 'fr', 'Netherlands': 'nl', 'Pakistan': 'com.pk', 'United States': 'com', 'Canada': 'ca' };
    const tld = tldMap[bp.country] ?? 'com';
    const domain = `${slug(bp.short)}.${tld}`;
    const company = lookups.companies[index % 3 === 2 ? 1 : 0];
    const branches = lookups.branches.filter((b) => b.companyId === company.id);
    const am = lookups.accountManagers[index % lookups.accountManagers.length];
    const sla = bp.type === 'Government' || bp.category === 'Healthcare' ? 'SLA-PLT' : rng.pick(['SLA-GLD', 'SLA-SLV', 'SLA-BRZ']);
    const GCC_COUNTRIES_SEED = new Set(['United Arab Emirates', 'Bahrain', 'Kuwait', 'Oman', 'Qatar']);
    const region = bp.country === 'Saudi Arabia'
      ? ({ Riyadh: 'Central', Qassim: 'Central', Makkah: 'Western', Madinah: 'Western', 'Eastern Province': 'Eastern', Asir: 'Southern' } as Record<string, string>)[bp.region] ?? 'Central'
      : GCC_COUNTRIES_SEED.has(bp.country) ? 'GCC' : 'GCC';
    const territory = lookups.territories.find((t) => t.region === region) ?? lookups.territories[0];
    const inactive = bp.status === 'Inactive' || bp.status === 'Archived';

    const primary = makeContact(id, null, 'Primary', true, domain, createdAt, bp.country);
    makeContact(id, null, 'Billing', true, domain, createdAt, bp.country);
    if (rng.chance(0.75)) makeContact(id, null, 'Technical', true, domain, createdAt, bp.country);
    if (rng.chance(0.5)) makeContact(id, null, 'Procurement', true, domain, createdAt, bp.country);
    if (rng.chance(0.35)) makeContact(id, null, 'Management', true, domain, createdAt, bp.country, rng.chance(0.2) ? 'Inactive' : 'Active');

    const customer: Customer = {
      id,
      code: id,
      name: bp.name,
      legalName: bp.type === 'Individual' ? bp.name : `${bp.name.replace(/ Co\.$/, '')} ${bp.type === 'Government' ? '' : 'Company Ltd.'}`.trim(),
      type: bp.type,
      category: bp.category,
      status: bp.status,
      crNumber: bp.type === 'Individual' ? '' : bp.country === 'Saudi Arabia' ? `${rng.int(1, 4)}0${rng.digits(8)}` : `REG-${rng.digits(8)}`,
      vatNumber: bp.type === 'Individual' ? '' : bp.country === 'Saudi Arabia' ? `3${rng.digits(13)}3` : bp.country === 'United Kingdom' ? `GB${rng.digits(9)}` : bp.country === 'Germany' ? `DE${rng.digits(9)}` : `VAT-${rng.digits(9)}`,
      nationalAddressRef: bp.country === 'Saudi Arabia' ? `${String.fromCharCode(65 + rng.int(0, 25))}${String.fromCharCode(65 + rng.int(0, 25))}${String.fromCharCode(65 + rng.int(0, 25))}${String.fromCharCode(65 + rng.int(0, 25))}${rng.digits(4)}` : '',
      industry: bp.industry,
      registrationDate: bp.type === 'Individual' ? null : dateFromNow(-bp.createdDaysAgo - rng.int(800, 6000)),
      address: makeAddress(rng, bp.country, bp.region, bp.city, bp.district),
      primaryContactId: primary.id,
      commercial: {
        accountManagerId: am.id,
        salesRepId: rng.pick(lookups.salesReps).id,
        paymentTermsId: bp.type === 'Government' ? 'PT-60' : rng.pick(['PT-15', 'PT-30', 'PT-30', 'PT-45']),
        currency: ({ 'United Arab Emirates': 'AED', 'Bahrain': 'BHD', 'Kuwait': 'KWD', 'Oman': 'OMR', 'Qatar': 'QAR', 'United Kingdom': 'GBP', 'Germany': 'EUR', 'France': 'EUR', 'Netherlands': 'EUR', 'United States': 'USD', 'Canada': 'CAD', 'Pakistan': 'PKR' } as Record<string, string>)[bp.country] ?? 'SAR',
        creditLimit: bp.type === 'Individual' ? 50000 : rng.int(5, 80) * 25000,
        taxProfileId: bp.country === 'Saudi Arabia' ? 'TAX-STD' : bp.country === 'United Kingdom' || bp.country === 'Germany' || bp.country === 'France' || bp.country === 'Netherlands' ? 'TAX-STD' : 'TAX-ZERO',
        priceListId: bp.type === 'Government' ? 'PL-GOV' : bp.type === 'Partner' ? 'PL-PRT' : bp.category === 'Enterprise' || bp.type === 'Corporate' ? 'PL-ENT' : 'PL-STD',
        billingCycle: rng.pick<BillingCycle>(['Monthly', 'Quarterly', 'Quarterly', 'Annual']),
      },
      operational: {
        servicePriority: rng.pick<ServicePriority>(bp.category === 'Healthcare' ? ['Critical', 'High'] : ['High', 'Medium', 'Medium', 'Low']),
        defaultSlaId: sla,
        serviceRegion: region,
        serviceTerritoryId: territory.id,
        preferredServiceWindow: rng.pick<ServiceWindow>(bp.category === 'Healthcare' ? ['24/7'] : ['Business Hours (08:00–17:00)', 'Extended Hours (07:00–22:00)', 'After Hours (18:00–06:00)']),
        portalAccess: !inactive && rng.chance(0.6),
      },
      internalNotes: rng.chance(0.5) ? 'Key account — escalate critical incidents to the account manager within 30 minutes.' : '',
      customerNotes: rng.chance(0.4) ? 'Visitors must register at the security gate 24 hours in advance.' : '',
      companyId: company.id,
      branchId: rng.pick(branches).id,
      ...audit(createdAt, am.name),
    };
    db.customers.push(customer);
    log(createdAt, 'Customer Created', 'Customer', id, id, null, `Customer ${bp.name} was created.`, id, undefined, am.name);
    log(daysFromNow(-bp.createdDaysAgo + 0.01), 'Contact Added', 'Contact', primary.id, id, null, `${primary.firstName} ${primary.lastName} added as primary contact.`, primary.id);
    if (bp.status !== 'Active') {
      log(daysFromNow(-Math.min(bp.createdDaysAgo - 1, rng.int(5, 60)), 11), 'Status Changed', 'Customer', id, id, null, `Customer status changed.`, id, { field: 'Customer Status', from: 'Active', to: bp.status }, am.name);
    } else if (rng.chance(0.5)) {
      log(daysFromNow(-rng.int(1, Math.min(bp.createdDaysAgo, 40)), 14), 'Customer Updated', 'Customer', id, id, null, 'Payment terms updated.', id, { field: 'Payment Terms', from: 'Net 15 days', to: 'Net 30 days' }, am.name);
    }

    // Customer-level documents
    const docs: { name: string; category: DocumentCategory; expiry: number | null; siteId?: string }[] = [
      { name: 'Commercial Registration Certificate', category: 'Commercial Registration', expiry: rng.int(-20, 400) },
      { name: 'VAT Registration Certificate', category: 'VAT Certificate', expiry: null },
    ];
    if (rng.chance(0.6)) docs.push({ name: 'Public Liability Insurance', category: 'Insurance', expiry: rng.int(-40, 200) });
    if (rng.chance(0.5)) docs.push({ name: 'Signed Master Service Agreement', category: 'Contracts', expiry: rng.int(30, 700) });
    if (bp.category === 'Healthcare' || bp.category === 'Industrial') docs.push({ name: 'Civil Defense Compliance Certificate', category: 'Compliance Documents', expiry: rng.int(-10, 90) });

    // Sites
    const siteTypes = SITE_TYPES_BY_CATEGORY[bp.category];
    const country = lookups.countries.find((c) => c.name === bp.country)!;
    const regionCities = country.regions.find((r) => r.name === bp.region)?.cities ?? [bp.city];
    for (let s = 0; s < bp.sites; s++) {
      const siteId = `SITE-${pad(siteSeq++, 4)}`;
      const type = siteTypes[s % siteTypes.length];
      const city = s === 0 ? bp.city : rng.pick(regionCities);
      const district = s === 0 ? bp.district : rng.pick(DISTRICTS[city] ?? [`${city} Central`, `${city} North`]);
      const siteCreatedDays = Math.max(1, bp.createdDaysAgo - s * rng.int(10, 60));
      const siteCreatedAt = daysFromNow(-siteCreatedDays, 10 + s);
      const status: SiteStatus = inactive
        ? bp.status === 'Archived' ? 'Archived' : 'Inactive'
        : s === bp.sites - 1 && bp.sites > 2 && rng.chance(0.5)
          ? rng.pick<SiteStatus>(['Planned', 'Temporarily Closed'])
          : 'Active';
      const siteContact = makeContact(id, siteId, 'Site Contact', true, domain, siteCreatedAt, bp.country);
      const emergency = rng.chance(0.6) ? makeContact(id, siteId, 'Emergency', true, domain, siteCreatedAt, bp.country) : null;
      const siteManager = rng.chance(0.5) ? makeContact(id, siteId, 'Management', false, domain, siteCreatedAt, bp.country) : siteContact;
      const suffix = SITE_SUFFIX[type][s % SITE_SUFFIX[type].length];
      const site: Site = {
        id: siteId,
        code: siteId,
        name: `${bp.short} ${suffix}${s >= SITE_SUFFIX[type].length ? ` ${s}` : ''}`,
        customerId: id,
        type,
        status,
        location: makeAddress(rng, bp.country, bp.region, city, district),
        timezone: countryTimezone(bp.country),
        siteContactId: siteContact.id,
        siteManagerId: siteManager.id,
        emergencyContactId: emergency?.id ?? null,
        operatingHours: type === 'Hospital' || type === 'Hotel' ? '24/7' : bp.country === 'Saudi Arabia' ? 'Sun–Thu 08:00–17:00' : 'Mon–Fri 08:00–17:00',
        serviceHours: type === 'Hospital' ? '24/7 (critical systems)' : bp.country === 'Saudi Arabia' ? 'Sun–Thu 07:00–19:00, Sat 08:00–14:00' : 'Mon–Fri 07:00–19:00',
        accessRequirements: rng.pick(['Visitor pass required at reception.', 'Escort required in restricted areas.', 'PPE mandatory: helmet, safety shoes, hi-vis vest.', 'Access via service entrance.', '']),
        securityRequirements: rng.pick(['Background-checked technicians only.', 'Tools inventory checked at entry and exit.', 'No photography inside the premises.', '']),
        defaultSlaId: customer.operational.defaultSlaId,
        serviceTerritoryId: territory.id,
        servicePriority: customer.operational.servicePriority,
        preferredVisitDays: rng.pick<readonly Weekday[]>([['Sun', 'Mon', 'Tue', 'Wed', 'Thu'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ['Mon', 'Wed'], ['Tue', 'Thu']]),
        preferredVisitTime: rng.pick<VisitTime>(['Morning (09:00–12:00)', 'Early Morning (06:00–09:00)', 'Afternoon (12:00–16:00)', 'Any Time']),
        accessNoticeRequired: rng.chance(0.6),
        siteInstructions: 'Report to the facility office on arrival and sign the visitor register.',
        technicianInstructions: rng.pick(['Isolate equipment before starting work.', 'Coordinate with the duty engineer for any shutdown.', 'Permit-to-work required for hot work and roof access.', '']),
        internalNotes: '',
        ...audit(siteCreatedAt),
      };
      db.sites.push(site);
      log(siteCreatedAt, 'Site Added', 'Site', siteId, id, siteId, `Site ${site.name} was added.`, siteId);
      log(daysFromNow(-siteCreatedDays + 0.02), 'Contact Added', 'Contact', siteContact.id, id, siteId, `${siteContact.firstName} ${siteContact.lastName} added as site contact.`, siteContact.id);
      if (s === 0 || rng.chance(0.4)) {
        docs.push({ name: `${site.name} – Floor Plans`, category: 'Site Documents', expiry: null, siteId });
      }
      if (rng.chance(0.35)) {
        docs.push({ name: `${site.name} – Equipment O&M Manual`, category: 'Technical Documents', expiry: null, siteId });
      }

      // Assets
      const assetCount = status === 'Planned' ? 0 : rng.int(2, 7);
      const siteAssets: AssetSummary[] = [];
      for (let a = 0; a < assetCount; a++) {
        const item = ASSET_CATALOG[(a + s + index) % ASSET_CATALOG.length];
        const installDays = rng.int(30, siteCreatedDays + 400);
        const assetNo = pad(assetSeq++, 5);
        const asset: AssetSummary = {
          id: `AST-${assetNo}`,
          tag: `TAG-${assetNo}`,
          name: item.name,
          category: item.category,
          model: rng.pick(item.models),
          serialNumber: `SN${rng.digits(9)}`,
          customerId: id,
          siteId,
          status: inactive ? 'Decommissioned' : rng.pick<AssetStatus>(['In Service', 'In Service', 'In Service', 'Under Maintenance', 'Out of Service']),
          installDate: dateFromNow(-installDays),
          warrantyEnd: rng.chance(0.7) ? dateFromNow(-installDays + 730) : null,
        };
        siteAssets.push(asset);
        db.assets.push(asset);
        if (installDays < siteCreatedDays) {
          log(daysFromNow(-installDays, 12), 'Asset Added', 'Asset', asset.id, id, siteId, `${asset.name} (${asset.model}) registered.`, asset.tag);
        }
      }

      if (status === 'Planned') continue;

      // Service requests
      const srCount = inactive ? rng.int(0, 1) : rng.int(0, 4);
      for (let r = 0; r < srCount; r++) {
        const ageDays = inactive ? rng.int(120, 400) : rng.int(0, 45);
        const statuses: readonly ServiceRequestStatus[] = ageDays > 14 ? ['Resolved', 'Closed', 'Closed', 'In Progress'] : ['New', 'Assigned', 'In Progress', 'On Hold', 'Resolved'];
        const priority = rng.pick<RequestPriority>(['Critical', 'High', 'Medium', 'Medium', 'Low']);
        const sr: ServiceRequestSummary = {
          id: `SR-${srSeq}`,
          number: `SR-${srSeq++}`,
          subject: rng.pick(SR_SUBJECTS),
          customerId: id,
          siteId,
          priority,
          status: inactive ? 'Closed' : rng.pick(statuses),
          createdAt: daysFromNow(-ageDays - rng.next(), rng.int(7, 20)),
          slaDue: daysFromNow(-ageDays + ({ Critical: 0.33, High: 1, Medium: 2, Low: 3 } as const)[priority]),
        };
        db.serviceRequests.push(sr);
        log(sr.createdAt, 'Service Request Created', 'Service Request', sr.id, id, siteId, `${sr.subject}`, sr.number);
      }

      // Work orders
      const woCount = inactive ? 0 : rng.int(1, 4);
      for (let w = 0; w < woCount; w++) {
        const offset = rng.int(-60, 21);
        const type = rng.pick<WorkOrderType>(['Corrective', 'Preventive', 'Preventive', 'Inspection', 'Installation']);
        const status: WorkOrderStatus = offset < -3 ? rng.pick(['Completed', 'Completed', 'Completed', 'Cancelled']) : offset <= 0 ? rng.pick(['In Progress', 'On Hold', 'Completed']) : 'Scheduled';
        const wo: WorkOrderSummary = {
          id: `WO-${woSeq}`,
          number: `WO-${woSeq++}`,
          title: `${type} – ${siteAssets.length ? rng.pick(siteAssets).name : 'General facility check'}`,
          customerId: id,
          siteId,
          type,
          status,
          technician: rng.pick(TECHNICIANS),
          scheduledDate: dateFromNow(offset),
          completedDate: status === 'Completed' ? dateFromNow(offset + rng.int(0, 2)) : null,
        };
        db.workOrders.push(wo);
        log(daysFromNow(offset - rng.int(1, 5), 9), 'Work Order Created', 'Work Order', wo.id, id, siteId, wo.title, wo.number);
      }

      // Preventive maintenance
      if (!inactive && siteAssets.length) {
        for (let m = 0; m < rng.int(1, 3); m++) {
          const due = rng.int(-6, 55);
          const asset = rng.pick(siteAssets);
          db.maintenance.push({
            id: `PM-${pad(pmSeq++, 4)}`,
            plan: `${asset.category} ${rng.pick(['Quarterly PPM', 'Monthly Inspection', 'Semi-Annual Service', 'Annual Overhaul'])}`,
            customerId: id,
            siteId,
            assetName: `${asset.name} · ${asset.tag}`,
            frequency: rng.pick(['Monthly', 'Quarterly', 'Semi-Annual', 'Annual']),
            nextDue: dateFromNow(due),
            status: due < 0 ? 'Overdue' : due <= 7 ? 'Due' : 'Scheduled',
          });
        }
      }

      // Service history
      for (let h = 0; h < rng.int(2, 6); h++) {
        const ago = inactive ? rng.int(200, 700) : rng.int(1, Math.max(5, siteCreatedDays));
        db.serviceHistory.push({
          id: `SH-${siteId}-${h}`,
          date: daysFromNow(-ago, rng.int(8, 17)),
          customerId: id,
          siteId,
          visitType: rng.pick(['Corrective Visit', 'Preventive Visit', 'Preventive Visit', 'Inspection', 'Installation']),
          reference: `WO-${rng.int(5000, 6999)}`,
          summary: rng.pick(VISIT_SUMMARIES),
          technician: rng.pick(TECHNICIANS),
          outcome: rng.pick(['Completed', 'Resolved', 'Completed', 'Follow-up Required']),
        });
      }
    }

    // Agreements (contracts & AMCs)
    const customerSites = db.sites.filter((site) => site.customerId === id);
    const agreementCount = inactive ? 1 : rng.int(1, 3);
    for (let c = 0; c < agreementCount + (inactive ? 0 : rng.int(0, 2)); c++) {
      const kind = c < agreementCount ? 'Contract' : 'AMC';
      const startAgo = rng.int(30, Math.max(60, bp.createdDaysAgo));
      const durationDays = rng.pick([365, 730, 1095]);
      const endIn = inactive ? -rng.int(10, 200) : Math.max(-60, durationDays - startAgo);
      const endFinal = c === 0 && !inactive && index % 4 === 1 ? rng.int(5, 55) : endIn;
      let status: AgreementStatus = endFinal < 0 ? 'Expired' : endFinal <= 60 ? 'Expiring' : 'Active';
      if (!inactive && c === agreementCount - 1 && rng.chance(0.15)) status = 'Draft';
      const number = `${kind === 'AMC' ? 'AMC' : 'CON'}-${pad(agreementSeq++, 5)}`;
      const covered = customerSites.filter(() => rng.chance(0.7));
      const agreement: AgreementSummary = {
        id: number,
        number,
        title: kind === 'AMC'
          ? `${rng.pick(['HVAC', 'MEP', 'Elevator', 'Fire & Life Safety', 'Generator'])} Annual Maintenance`
          : `${rng.pick(['Integrated Facility Management', 'MEP Services', 'Hard Services', 'Critical Systems Support'])} Contract`,
        kind,
        customerId: id,
        siteIds: (covered.length ? covered : customerSites.slice(0, 1)).map((site) => site.id),
        status,
        startDate: dateFromNow(-startAgo),
        endDate: dateFromNow(endFinal),
        value: rng.int(8, 260) * 5000,
        currency: customer.commercial.currency,
        coverage: kind === 'AMC' ? rng.pick(['Comprehensive (parts & labour)', 'Labour only', 'Non-comprehensive']) : rng.pick(['Full scope', 'Planned maintenance + reactive', 'Reactive only']),
      };
      db.agreements.push(agreement);
      log(daysFromNow(-startAgo - 3, 11), kind === 'AMC' ? 'AMC Created' : 'Contract Created', kind, number, id, null, agreement.title, number);
      if (status !== 'Draft' && rng.chance(0.5)) {
        log(daysFromNow(-startAgo, 10), 'Status Changed', kind, number, id, null, `${kind} status changed.`, number, { field: `${kind} Status`, from: 'Draft', to: 'Active' });
      }
    }

    // Invoices
    for (let i = 0; i < rng.int(2, 6); i++) {
      const issuedAgo = inactive ? rng.int(200, 500) : rng.int(3, 200);
      const amount = rng.int(4, 120) * 1150;
      const due = -issuedAgo + 30;
      let status: InvoiceStatus;
      let paid: number;
      if (inactive || issuedAgo > 120) {
        status = 'Paid';
        paid = amount;
      } else if (due < 0) {
        status = rng.pick(['Paid', 'Paid', 'Overdue', 'Partially Paid']);
        paid = status === 'Paid' ? amount : status === 'Partially Paid' ? Math.round(amount * 0.4) : 0;
      } else {
        status = rng.pick(['Issued', 'Issued', 'Partially Paid', 'Paid']);
        paid = status === 'Paid' ? amount : status === 'Partially Paid' ? Math.round(amount * 0.5) : 0;
      }
      const invoice: InvoiceSummary = {
        id: `INV-${invSeq}`,
        number: `INV-${invSeq++}`,
        customerId: id,
        reference: rng.pick(db.agreements.filter((a) => a.customerId === id)).number,
        issueDate: dateFromNow(-issuedAgo),
        dueDate: dateFromNow(due),
        amount,
        paid,
        currency: customer.commercial.currency,
        status,
      };
      db.invoices.push(invoice);
      log(daysFromNow(-issuedAgo, 15), 'Invoice Generated', 'Invoice', invoice.id, id, null, `Invoice for ${invoice.currency} ${amount.toLocaleString('en-US')}`, invoice.number);
      if (paid > 0) {
        log(daysFromNow(-issuedAgo + rng.int(5, 25), 13), 'Payment Recorded', 'Payment', invoice.id, id, null, `Payment of ${invoice.currency} ${paid.toLocaleString('en-US')} recorded.`, invoice.number);
      }
    }

    // Documents
    docs.forEach((doc, d) => {
      const uploadedAgo = Math.max(1, bp.createdDaysAgo - d * 7 - rng.int(0, 5));
      const uploader = rng.pick(lookups.users);
      const fileName = `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
      const versions = rng.chance(0.3) ? 2 : 1;
      const issueDays = doc.expiry !== null ? doc.expiry - 365 : -uploadedAgo - 30;
      const document: CustomerDocument = {
        id: `DOC-${pad(docSeq++, 4)}`,
        name: doc.name,
        category: doc.category,
        customerId: id,
        siteId: doc.siteId ?? null,
        documentNumber: doc.category === 'Commercial Registration' ? customer.crNumber : doc.category === 'VAT Certificate' ? customer.vatNumber : `${doc.category.slice(0, 3).toUpperCase()}-${rng.digits(6)}`,
        issueDate: dateFromNow(issueDays),
        expiryDate: doc.expiry === null ? null : dateFromNow(doc.expiry),
        reminderDays: 30,
        responsibleUserId: rng.chance(0.6) ? 'USR-08' : am.id,
        access: doc.category === 'Contracts' || doc.category === 'Legal Documents' ? 'Restricted' : rng.pick(['Internal', 'Internal', 'Customer Visible']),
        recordStatus: bp.status === 'Archived' ? 'Archived' : 'Active',
        renewalStatus: doc.expiry !== null && doc.expiry < 20 && rng.chance(0.35) ? 'In Progress' : 'None',
        fileName,
        fileSize: rng.int(120, 4800) * 1024,
        mimeType: 'application/pdf',
        version: versions,
        uploadedBy: uploader.name,
        uploadedAt: daysFromNow(-uploadedAgo, 10),
        versions: Array.from({ length: versions }, (_, v) => ({
          version: v + 1,
          fileName: v + 1 === versions ? fileName : fileName.replace('.pdf', `-v${v + 1}.pdf`),
          fileSize: rng.int(120, 4800) * 1024,
          uploadedBy: uploader.name,
          uploadedAt: daysFromNow(-uploadedAgo - (versions - v - 1) * 180, 10),
          note: v === 0 ? 'Initial upload' : 'Renewed certificate uploaded',
        })),
        notes: '',
      };
      db.documents.push(document);
      log(document.uploadedAt, 'Document Uploaded', 'Document', document.id, id, document.siteId, `${document.name} uploaded.`, document.id, undefined, uploader.name);
    });
  });

  db.activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return db;
}
