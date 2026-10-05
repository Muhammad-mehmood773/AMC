import type { CustomerLookups, UserLookup } from '../../models/lookup.model';

const USERS: readonly UserLookup[] = [
  { id: 'USR-01', name: 'Ahmed Al-Harbi', email: 'ahmed.harbi@gfs.sa', role: 'Account Manager' },
  { id: 'USR-02', name: 'Sara Al-Qahtani', email: 'sara.qahtani@gfs.sa', role: 'Account Manager' },
  { id: 'USR-03', name: 'Omar Farooq', email: 'omar.farooq@gfs.sa', role: 'Account Manager' },
  { id: 'USR-04', name: 'Lina Haddad', email: 'lina.haddad@gfs.sa', role: 'Account Manager' },
  { id: 'USR-05', name: 'Khalid Al-Mutairi', email: 'khalid.mutairi@gfs.sa', role: 'Sales Representative' },
  { id: 'USR-06', name: 'Fatima Zahrani', email: 'fatima.zahrani@gfs.sa', role: 'Sales Representative' },
  { id: 'USR-07', name: 'Yousef Nasser', email: 'yousef.nasser@gfs.sa', role: 'Sales Representative' },
  { id: 'USR-08', name: 'Noura Al-Dosari', email: 'noura.dosari@gfs.sa', role: 'Document Controller' },
  { id: 'USR-09', name: 'Hassan Raza', email: 'hassan.raza@gfs.sa', role: 'Service Coordinator' },
];

export const CURRENT_USER = USERS[0];

export const LOOKUPS_SEED: CustomerLookups = {
  companies: [
    { id: 'CMP-01', name: 'Gulf Facility Services Co.' },
    { id: 'CMP-02', name: 'Arabian Technical Maintenance' },
  ],
  branches: [
    { id: 'BR-01', name: 'Riyadh Main Branch', companyId: 'CMP-01' },
    { id: 'BR-02', name: 'Jeddah Branch', companyId: 'CMP-01' },
    { id: 'BR-03', name: 'Dammam Branch', companyId: 'CMP-01' },
    { id: 'BR-04', name: 'Riyadh Industrial Branch', companyId: 'CMP-02' },
    { id: 'BR-05', name: 'Khobar Branch', companyId: 'CMP-02' },
  ],
  users: USERS,
  accountManagers: USERS.filter((user) => user.role === 'Account Manager'),
  salesReps: USERS.filter((user) => user.role === 'Sales Representative'),
  paymentTerms: [
    { id: 'PT-ADV', name: 'Advance Payment' },
    { id: 'PT-15', name: 'Net 15 days' },
    { id: 'PT-30', name: 'Net 30 days' },
    { id: 'PT-45', name: 'Net 45 days' },
    { id: 'PT-60', name: 'Net 60 days' },
  ],
  currencies: ['SAR', 'AED', 'BHD', 'USD'],
  taxProfiles: [
    { id: 'TAX-STD', name: 'Standard VAT 15%' },
    { id: 'TAX-ZERO', name: 'Zero-Rated' },
    { id: 'TAX-EXEMPT', name: 'VAT Exempt' },
  ],
  priceLists: [
    { id: 'PL-STD', name: 'Standard 2026' },
    { id: 'PL-ENT', name: 'Enterprise 2026' },
    { id: 'PL-GOV', name: 'Government 2026' },
    { id: 'PL-PRT', name: 'Partner 2026' },
  ],
  slas: [
    { id: 'SLA-PLT', name: 'Platinum 24/7', responseHours: 2, resolutionHours: 8 },
    { id: 'SLA-GLD', name: 'Gold', responseHours: 4, resolutionHours: 24 },
    { id: 'SLA-SLV', name: 'Silver', responseHours: 8, resolutionHours: 48 },
    { id: 'SLA-BRZ', name: 'Bronze', responseHours: 24, resolutionHours: 72 },
  ],
  serviceRegions: ['Central', 'Western', 'Eastern', 'Southern', 'Northern', 'GCC'],
  territories: [
    { id: 'TER-RN', name: 'Riyadh North', region: 'Central' },
    { id: 'TER-RS', name: 'Riyadh South', region: 'Central' },
    { id: 'TER-QS', name: 'Qassim', region: 'Central' },
    { id: 'TER-JM', name: 'Jeddah Metro', region: 'Western' },
    { id: 'TER-MT', name: 'Makkah & Taif', region: 'Western' },
    { id: 'TER-MD', name: 'Madinah & Yanbu', region: 'Western' },
    { id: 'TER-DK', name: 'Dammam – Khobar', region: 'Eastern' },
    { id: 'TER-JB', name: 'Jubail Industrial', region: 'Eastern' },
    { id: 'TER-AH', name: 'Al Ahsa', region: 'Eastern' },
    { id: 'TER-AS', name: 'Abha & Asir', region: 'Southern' },
    { id: 'TER-GC', name: 'GCC Partners', region: 'GCC' },
  ],
  industries: [
    'Banking & Finance',
    'Education',
    'Government Services',
    'Healthcare',
    'Hospitality',
    'Logistics',
    'Manufacturing',
    'Oil & Gas',
    'Real Estate',
    'Retail',
    'Telecommunications',
  ],
  countries: [
    {
      name: 'Saudi Arabia',
      regions: [
        { name: 'Riyadh', cities: ['Riyadh', 'Al Kharj', 'Diriyah'] },
        { name: 'Makkah', cities: ['Jeddah', 'Makkah', 'Taif'] },
        {
          name: 'Eastern Province',
          cities: ['Dammam', 'Al Khobar', 'Dhahran', 'Jubail', 'Al Ahsa'],
        },
        { name: 'Madinah', cities: ['Madinah', 'Yanbu'] },
        { name: 'Asir', cities: ['Abha', 'Khamis Mushait'] },
        { name: 'Qassim', cities: ['Buraydah', 'Unaizah'] },
      ],
    },
    {
      name: 'United Arab Emirates',
      regions: [
        { name: 'Dubai', cities: ['Dubai'] },
        { name: 'Abu Dhabi', cities: ['Abu Dhabi', 'Al Ain'] },
        { name: 'Sharjah', cities: ['Sharjah'] },
      ],
    },
    {
      name: 'Bahrain',
      regions: [
        { name: 'Capital', cities: ['Manama'] },
        { name: 'Muharraq', cities: ['Muharraq'] },
      ],
    },
  ],
};
