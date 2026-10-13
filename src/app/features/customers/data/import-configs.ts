import type { LookupValue } from '@shared/lookups/lookup';
import type { ImportColumn, ImportConfig, ImportRow } from '@shared/models/import';
import {
  CONTACT_STATUSES,
  type ContactInput,
  type ContactStatus,
  type ContactType,
  type PreferredLanguage,
} from '../models/contact.model';
import {
  CUSTOMER_STATUSES,
  type CommunicationMethod,
  type CustomerCategory,
  type CustomerListItem,
  type CustomerStatus,
  type CustomerType,
  type CustomerUpsert,
  SERVICE_PRIORITIES,
  type ServicePriority,
} from '../models/customer.model';
import {
  DOCUMENT_ACCESS_LEVELS,
  type DocumentAccess,
  type DocumentCategory,
  type DocumentUpload,
} from '../models/document.model';
import type { CustomerLookups } from '../models/lookup.model';
import {
  SITE_STATUSES,
  type SiteListItem,
  type SiteStatus,
  type SiteType,
  type SiteUpsert,
  VISIT_TIMES,
  type VisitTime,
  WEEKDAYS,
  type Weekday,
} from '../models/site.model';
import { PATTERNS, splitName } from '../utils/form-patterns';
import { TRANSACTION_BLOCKED_CUSTOMER_STATUSES } from './customer-site.config';
import type { ContactApi, CustomerApi, DocumentApi, SiteApi } from './customer-site.api';
import { LOOKUP } from './customer-site.lookups';

export interface ImportContext {
  readonly customers: readonly CustomerListItem[];
  readonly sites: readonly SiteListItem[];
  readonly lookups: CustomerLookups;
  readonly lookupValues: readonly LookupValue[];
}

/** Active names of a user-maintainable lookup list. */
function lookupNames(ctx: ImportContext, type: string): string[] {
  return ctx.lookupValues.filter((v) => v.type === type && v.status === 'Active').map((v) => v.name);
}

const yesNo = (value: string) => value === 'Yes';
const orNull = (value: string) => value || null;
const pattern = (regex: RegExp, message: string) => (value: string) => (regex.test(value) ? null : message);

function nextCodes(prefix: string, existing: readonly string[], width: number): () => string {
  let max = existing.reduce((m, code) => Math.max(m, Number(/(\d+)$/.exec(code)?.[1] ?? 0)), 0);
  return () => `${prefix}-${String(++max).padStart(width, '0')}`;
}

function addressColumns(ctx: ImportContext, fullAddressLabel = 'Address'): ImportColumn[] {
  const countries = ctx.lookups.countries;
  return [
    { key: 'country', label: 'Country', required: true, options: countries.map((c) => c.name) },
    {
      key: 'region',
      label: 'Region',
      required: true,
      validate: (value, row) =>
        countries.find((c) => c.name === row['country'])?.regions.some((r) => r.name.toLowerCase() === value.toLowerCase())
          ? null
          : `Region "${value}" is not valid for ${row['country'] || 'the country'}`,
    },
    {
      key: 'city',
      label: 'City',
      required: true,
      validate: (value, row) =>
        countries
          .find((c) => c.name === row['country'])
          ?.regions.find((r) => r.name.toLowerCase() === row['region']?.toLowerCase())
          ?.cities.some((city) => city.toLowerCase() === value.toLowerCase())
          ? null
          : `City "${value}" is not in region ${row['region'] || ''}`,
    },
    { key: 'district', label: 'District' },
    { key: 'street', label: 'Street' },
    { key: 'buildingNumber', label: 'Building Number', validate: pattern(PATTERNS.buildingNumber, 'Building number must be 4 digits') },
    { key: 'postalCode', label: 'Postal Code' },
    { key: 'additionalNumber', label: 'Additional Number', validate: pattern(PATTERNS.additionalNumber, 'Additional number must be 4 digits') },
    { key: 'addressLine', label: fullAddressLabel, aliases: ['Full Address', 'Address Line'] },
  ];
}

function canonical(ctx: ImportContext, row: ImportRow) {
  const country = ctx.lookups.countries.find((c) => c.name === row['country']);
  const region = country?.regions.find((r) => r.name.toLowerCase() === row['region'].toLowerCase());
  const city = region?.cities.find((c) => c.toLowerCase() === row['city'].toLowerCase());
  return {
    country: row['country'],
    region: region?.name ?? row['region'],
    city: city ?? row['city'],
    district: row['district'],
    street: row['street'],
    buildingNumber: row['buildingNumber'],
    postalCode: row['postalCode'],
    additionalNumber: row['additionalNumber'],
    addressLine: row['addressLine'],
    latitude: null,
    longitude: null,
  };
}

// ----- Customers -------------------------------------------------------------

export function customerImportConfig(ctx: ImportContext, api: CustomerApi): ImportConfig {
  const { lookups } = ctx;
  const existingCodes = new Set(ctx.customers.map((c) => c.code.toLowerCase()));
  const managerByEmail = new Map(lookups.accountManagers.map((u) => [u.email.toLowerCase(), u.id]));
  const termByName = new Map(lookups.paymentTerms.map((t) => [t.name.toLowerCase(), t.id]));
  const slaByName = new Map(lookups.slas.map((s) => [s.name.toLowerCase(), s.id]));
  const branchByName = new Map(lookups.branches.map((b) => [b.name.toLowerCase(), b]));

  return {
    entity: 'customer',
    entityPlural: 'customers',
    templateName: 'customer-import-template',
    notes: [
      'Leave Customer Code empty to generate the next available code.',
      'Account Manager is matched by email address.',
      'Each row creates the customer and its primary contact.',
    ],
    columns: [
      {
        key: 'code',
        label: 'Customer Code',
        unique: true,
        description: 'Optional; must be unique (e.g. CUS-00201)',
        validate: (v) => (!PATTERNS.code.test(v) ? 'Use 3–20 letters, numbers or hyphens' : existingCodes.has(v.toLowerCase()) ? `Customer code ${v} already exists` : null),
      },
      { key: 'name', label: 'Customer Name', required: true },
      { key: 'legalName', label: 'Legal Entity Name' },
      { key: 'type', label: 'Customer Type', required: true, options: lookupNames(ctx, LOOKUP.customerType) },
      { key: 'category', label: 'Customer Category', required: true, options: lookupNames(ctx, LOOKUP.customerCategory) },
      { key: 'status', label: 'Customer Status', options: CUSTOMER_STATUSES, description: 'Defaults to Active' },
      { key: 'crNumber', label: 'CR Number', unique: true, aliases: ['Commercial Registration'], validate: pattern(PATTERNS.crNumber, 'CR number must be 10 digits') },
      { key: 'vatNumber', label: 'VAT Number', unique: true, aliases: ['Tax Registration Number'], validate: pattern(PATTERNS.vatNumber, 'VAT must be 15 digits starting and ending with 3') },
      { key: 'industry', label: 'Industry', options: lookupNames(ctx, LOOKUP.industry) },
      ...addressColumns(ctx),
      { key: 'contactName', label: 'Primary Contact Name', required: true },
      { key: 'contactEmail', label: 'Primary Contact Email', required: true, type: 'email' },
      { key: 'contactMobile', label: 'Primary Contact Mobile', type: 'phone' },
      {
        key: 'accountManager',
        label: 'Account Manager Email',
        type: 'email',
        validate: (v) => (managerByEmail.has(v.toLowerCase()) ? null : `No account manager with email ${v}`),
      },
      { key: 'branch', label: 'Branch', options: lookups.branches.map((b) => b.name), description: 'Defaults to the first branch' },
      { key: 'paymentTerms', label: 'Payment Terms', options: lookups.paymentTerms.map((t) => t.name) },
      { key: 'currency', label: 'Currency', options: lookups.currencies },
      { key: 'creditLimit', label: 'Credit Limit', type: 'number' },
      { key: 'servicePriority', label: 'Service Priority', options: SERVICE_PRIORITIES },
      { key: 'defaultSla', label: 'Default SLA', options: lookups.slas.map((s) => s.name) },
    ],
    sampleRows: [
      { code: 'CUS-00201', name: 'Al Safwa Medical Centers', legalName: 'Al Safwa Medical Centers Company Ltd.', type: 'Corporate', category: 'Healthcare', status: 'Active', crNumber: '1010458721', vatNumber: '310458721900003', industry: 'Healthcare', country: 'Saudi Arabia', region: 'Riyadh', city: 'Riyadh', district: 'Al Malqa', street: 'Anas Ibn Malik Road', buildingNumber: '7421', postalCode: '13521', additionalNumber: '3184', addressLine: '7421 Anas Ibn Malik Road, Al Malqa, Riyadh', contactName: 'Khalid Al-Rashid', contactEmail: 'k.alrashid@alsafwamedical.com.sa', contactMobile: '+966 55 214 7789', accountManager: 'sara.qahtani@gfs.sa', branch: 'Riyadh Main Branch', paymentTerms: 'Net 30 days', currency: 'SAR', creditLimit: '750000', servicePriority: 'High', defaultSla: 'Gold' },
      { code: 'CUS-00202', name: 'Gulf Horizon Logistics', legalName: 'Gulf Horizon Logistics Company', type: 'SME', category: 'Industrial', status: 'Active', crNumber: '2050117834', vatNumber: '300117834500003', industry: 'Logistics', country: 'Saudi Arabia', region: 'Eastern Province', city: 'Dammam', district: 'Al Khaleej', street: 'King Saud Street', buildingNumber: '3318', postalCode: '32243', additionalNumber: '6620', addressLine: '3318 King Saud Street, Al Khaleej, Dammam', contactName: 'Faisal Al-Dossary', contactEmail: 'f.aldossary@gulfhorizon.com.sa', contactMobile: '+966 50 881 4412', accountManager: 'omar.farooq@gfs.sa', branch: 'Dammam Branch', paymentTerms: 'Net 45 days', currency: 'SAR', creditLimit: '300000', servicePriority: 'Medium', defaultSla: 'Silver' },
      { code: 'CUS-00203', name: 'Red Crescent Schools Jeddah', legalName: 'Red Crescent Educational Company', type: 'Corporate', category: 'Education', status: 'Active', crNumber: '4030998812', vatNumber: '302299881200003', industry: 'Education', country: 'Saudi Arabia', region: 'Makkah', city: 'Jeddah', district: 'Al Naeem', street: 'Prince Sultan Street', buildingNumber: '6612', postalCode: '23622', additionalNumber: '2271', addressLine: '6612 Prince Sultan Street, Al Naeem, Jeddah', contactName: 'Maha Bakhsh', contactEmail: 'm.bakhsh@rcschools.edu.sa', contactMobile: '+966 56 330 9014', accountManager: 'lina.haddad@gfs.sa', branch: 'Jeddah Branch', paymentTerms: 'Net 30 days', currency: 'SAR', creditLimit: '250000', servicePriority: 'Medium', defaultSla: 'Gold' },
    ],
    commit: (rows) => {
      const next = nextCodes('CUS', ctx.customers.map((c) => c.code), 5);
      return api.importMany(
        rows.map(({ row, values: v }) => {
          const branch = branchByName.get(v['branch'].toLowerCase()) ?? lookups.branches[0];
          const { first, last } = splitName(v['contactName']);
          const input: CustomerUpsert = {
            logoUrl: null,
            code: (v['code'] || next()).toUpperCase(),
            name: v['name'],
            legalName: v['legalName'] || v['name'],
            type: v['type'] as CustomerType,
            category: v['category'] as CustomerCategory,
            status: (v['status'] || 'Active') as CustomerStatus,
            crNumber: v['crNumber'],
            vatNumber: v['vatNumber'],
            nationalAddressRef: '',
            industry: v['industry'],
            registrationDate: null,
            address: canonical(ctx, v),
            commercial: {
              accountManagerId: managerByEmail.get(v['accountManager']) ?? null,
              salesRepId: null,
              paymentTermsId: termByName.get(v['paymentTerms'].toLowerCase()) ?? 'PT-30',
              currency: v['currency'] || 'SAR',
              creditLimit: v['creditLimit'] ? Number(v['creditLimit']) : null,
              taxProfileId: v['country'] === 'Saudi Arabia' ? 'TAX-STD' : 'TAX-ZERO',
              priceListId: 'PL-STD',
              billingCycle: 'Monthly',
            },
            operational: {
              servicePriority: (v['servicePriority'] || 'Medium') as ServicePriority,
              defaultSlaId: slaByName.get(v['defaultSla'].toLowerCase()) ?? null,
              serviceRegion: null,
              serviceTerritoryId: null,
              preferredServiceWindow: null,
              portalAccess: false,
            },
            internalNotes: '',
            customerNotes: '',
            companyId: branch.companyId,
            branchId: branch.id,
            primaryContact: {
              firstName: first,
              lastName: last,
              designation: '',
              department: '',
              email: v['contactEmail'],
              mobile: v['contactMobile'],
              phone: '',
              preferredLanguage: 'English',
              preferredCommunication: 'Email',
              status: 'Active',
              notes: '',
            },
          };
          return { row, input };
        }),
      );
    },
  };
}

// ----- Sites -----------------------------------------------------------------

export function siteImportConfig(ctx: ImportContext, api: SiteApi): ImportConfig {
  const customerByCode = new Map(ctx.customers.map((c) => [c.code.toLowerCase(), c]));
  const existingCodes = new Set(ctx.sites.map((s) => s.code.toLowerCase()));
  const slaByName = new Map(ctx.lookups.slas.map((s) => [s.name.toLowerCase(), s.id]));

  return {
    entity: 'site',
    entityPlural: 'sites',
    templateName: 'site-import-template',
    notes: [
      'Customer Code must reference an existing, active customer.',
      'Preferred Visit Days: Sun;Mon;Tue;Wed;Thu (semicolon separated).',
      'Leave Site Code empty to generate the next available code.',
    ],
    columns: [
      {
        key: 'code',
        label: 'Site Code',
        unique: true,
        description: 'Optional; must be unique (e.g. SITE-0201)',
        validate: (v) => (!PATTERNS.code.test(v) ? 'Use 3–20 letters, numbers or hyphens' : existingCodes.has(v.toLowerCase()) ? `Site code ${v} already exists` : null),
      },
      { key: 'name', label: 'Site Name', required: true },
      {
        key: 'customerCode',
        label: 'Customer Code',
        required: true,
        validate: (v) => {
          const customer = customerByCode.get(v.toLowerCase());
          if (!customer) return `Customer ${v} does not exist`;
          return TRANSACTION_BLOCKED_CUSTOMER_STATUSES.includes(customer.status) ? `Customer ${v} is ${customer.status.toLowerCase()}` : null;
        },
      },
      { key: 'type', label: 'Site Type', required: true, options: lookupNames(ctx, LOOKUP.siteType) },
      { key: 'status', label: 'Site Status', options: SITE_STATUSES, description: 'Defaults to Active' },
      ...addressColumns(ctx, 'Full Address'),
      { key: 'operatingHours', label: 'Operating Hours' },
      { key: 'serviceHours', label: 'Service Hours' },
      { key: 'servicePriority', label: 'Service Priority', options: SERVICE_PRIORITIES },
      { key: 'defaultSla', label: 'Default SLA', options: ctx.lookups.slas.map((s) => s.name) },
      {
        key: 'visitDays',
        label: 'Preferred Visit Days',
        type: 'list',
        validate: (v) => {
          const invalid = v.split(/[;,]/).map((d) => d.trim()).filter((d) => d && !WEEKDAYS.some((w) => w.toLowerCase() === d.toLowerCase()));
          return invalid.length ? `Unknown day(s): ${invalid.join(', ')}` : null;
        },
      },
      { key: 'visitTime', label: 'Preferred Visit Time', options: VISIT_TIMES },
      { key: 'accessNotice', label: 'Access Notice Required', type: 'boolean' },
      { key: 'accessRequirements', label: 'Access Requirements' },
      { key: 'securityRequirements', label: 'Security Requirements' },
      { key: 'siteInstructions', label: 'Site Instructions' },
      { key: 'technicianInstructions', label: 'Technician Instructions' },
    ],
    sampleRows: [
      { code: 'SITE-0201', name: 'KFSMG North Riyadh Clinic', customerCode: 'CUS-00101', type: 'Branch', status: 'Active', country: 'Saudi Arabia', region: 'Riyadh', city: 'Riyadh', district: 'Al Narjis', street: 'Abu Bakr Al Siddiq Road', buildingNumber: '8123', postalCode: '13326', additionalNumber: '4410', addressLine: '8123 Abu Bakr Al Siddiq Road, Al Narjis, Riyadh', operatingHours: 'Sun–Thu 07:00–22:00', serviceHours: '24/7 (critical systems)', servicePriority: 'Critical', defaultSla: 'Platinum 24/7', visitDays: 'Sun;Mon;Tue;Wed;Thu', visitTime: 'Early Morning (06:00–09:00)', accessNotice: 'Yes', accessRequirements: 'Escort required in clinical areas.', securityRequirements: 'Background-checked technicians only.', siteInstructions: 'Report to the facility office on arrival.', technicianInstructions: 'Coordinate with the duty engineer before any shutdown.' },
      { code: 'SITE-0202', name: 'Tamimi Retail Khobar Hypermarket', customerCode: 'CUS-00114', type: 'Commercial Building', status: 'Active', country: 'Saudi Arabia', region: 'Eastern Province', city: 'Al Khobar', district: 'Al Ulaya', street: 'Prince Turki Street', buildingNumber: '2754', postalCode: '34447', additionalNumber: '7781', addressLine: '2754 Prince Turki Street, Al Ulaya, Al Khobar', operatingHours: 'Daily 08:00–24:00', serviceHours: 'Daily 01:00–07:00', servicePriority: 'High', defaultSla: 'Gold', visitDays: 'Sat;Sun;Mon;Tue;Wed;Thu', visitTime: 'Night (20:00–06:00)', accessNotice: 'No', accessRequirements: 'Use the service entrance at loading bay 3.', securityRequirements: 'Tools inventory checked at entry and exit.', siteInstructions: 'Sign in with the store duty manager.', technicianInstructions: 'Refrigeration work only outside trading hours.' },
      { code: 'SITE-0203', name: 'RMFA Olaya Station Facilities', customerCode: 'CUS-00103', type: 'Industrial Site', status: 'Planned', country: 'Saudi Arabia', region: 'Riyadh', city: 'Riyadh', district: 'Al Olaya', street: 'Olaya Street', buildingNumber: '3920', postalCode: '12241', additionalNumber: '8812', addressLine: '3920 Olaya Street, Al Olaya, Riyadh', operatingHours: 'Daily 05:30–00:30', serviceHours: 'Daily 01:00–05:00', servicePriority: 'High', defaultSla: 'Platinum 24/7', visitDays: 'Sun;Tue;Thu', visitTime: 'Night (20:00–06:00)', accessNotice: 'Yes', accessRequirements: 'Permit-to-work required for track-side areas.', securityRequirements: 'Authority-issued access card required.', siteInstructions: 'Report to the station control room.', technicianInstructions: 'Hi-vis vest and safety shoes are mandatory.' },
    ],
    commit: (rows) => {
      const next = nextCodes('SITE', ctx.sites.map((s) => s.code), 4);
      return api.importMany(
        rows.map(({ row, values: v }) => {
          const customer = customerByCode.get(v['customerCode'].toLowerCase())!;
          const days = v['visitDays']
            .split(/[;,]/)
            .map((d) => WEEKDAYS.find((w) => w.toLowerCase() === d.trim().toLowerCase()))
            .filter((d): d is Weekday => !!d);
          const input: SiteUpsert = {
            code: (v['code'] || next()).toUpperCase(),
            name: v['name'],
            customerId: customer.id,
            type: v['type'] as SiteType,
            status: (v['status'] || 'Active') as SiteStatus,
            location: canonical(ctx, v),
            siteContactId: null,
            siteManagerId: null,
            emergencyContactId: null,
            operatingHours: v['operatingHours'],
            serviceHours: v['serviceHours'],
            accessRequirements: v['accessRequirements'],
            securityRequirements: v['securityRequirements'],
            defaultSlaId: slaByName.get(v['defaultSla'].toLowerCase()) ?? customer.operational.defaultSlaId,
            serviceTerritoryId: customer.operational.serviceTerritoryId,
            servicePriority: (v['servicePriority'] || customer.operational.servicePriority) as ServicePriority,
            preferredVisitDays: days,
            preferredVisitTime: orNull(v['visitTime']) as VisitTime | null,
            accessNoticeRequired: yesNo(v['accessNotice']),
            siteInstructions: v['siteInstructions'],
            technicianInstructions: v['technicianInstructions'],
            internalNotes: '',
            timezone: '',
          };
          return { row, input };
        }),
      );
    },
  };
}

// ----- Contacts --------------------------------------------------------------

export function contactImportConfig(ctx: ImportContext, api: ContactApi): ImportConfig {
  const customerByCode = new Map(ctx.customers.map((c) => [c.code.toLowerCase(), c]));
  const siteByCode = new Map(ctx.sites.map((s) => [s.code.toLowerCase(), s]));

  return {
    entity: 'contact',
    entityPlural: 'contacts',
    templateName: 'contact-import-template',
    notes: [
      'Customer Code is required; Site Code is optional and must belong to that customer.',
      'Marking a contact as primary replaces the existing primary of the same type.',
    ],
    columns: [
      { key: 'customerCode', label: 'Customer Code', required: true, validate: (v) => (customerByCode.has(v.toLowerCase()) ? null : `Customer ${v} does not exist`) },
      {
        key: 'siteCode',
        label: 'Site Code',
        validate: (v, row) => {
          const site = siteByCode.get(v.toLowerCase());
          if (!site) return `Site ${v} does not exist`;
          return site.customerCode.toLowerCase() === row['customerCode'].toLowerCase() ? null : `Site ${v} belongs to ${site.customerCode}`;
        },
      },
      { key: 'firstName', label: 'First Name', required: true },
      { key: 'lastName', label: 'Last Name' },
      { key: 'designation', label: 'Designation' },
      { key: 'department', label: 'Department' },
      { key: 'email', label: 'Email', required: true, type: 'email', unique: true },
      { key: 'mobile', label: 'Mobile', type: 'phone' },
      { key: 'phone', label: 'Phone', type: 'phone' },
      { key: 'type', label: 'Contact Type', required: true, options: lookupNames(ctx, LOOKUP.contactType) },
      { key: 'isPrimary', label: 'Primary Contact', type: 'boolean' },
      { key: 'language', label: 'Preferred Language', options: lookupNames(ctx, LOOKUP.preferredLanguage) },
      { key: 'communication', label: 'Preferred Communication Method', options: lookupNames(ctx, LOOKUP.communicationMethod) },
      { key: 'status', label: 'Status', options: CONTACT_STATUSES, description: 'Defaults to Active' },
      { key: 'notes', label: 'Notes' },
    ],
    sampleRows: [
      { customerCode: 'CUS-00101', siteCode: 'SITE-0001', firstName: 'Nawaf', lastName: 'Al-Harthi', designation: 'Biomedical Engineer', department: 'Engineering', email: 'n.alharthi@kfsmg.com.sa', mobile: '+966 55 902 1147', phone: '+966 11 442 8100', type: 'Technical', isPrimary: 'No', language: 'Arabic', communication: 'WhatsApp', status: 'Active', notes: 'Available Sun–Thu 07:00–16:00.' },
      { customerCode: 'CUS-00102', siteCode: '', firstName: 'Rania', lastName: 'Fawzi', designation: 'Accounts Payable Manager', department: 'Finance', email: 'r.fawzi@alnoor.com.sa', mobile: '+966 54 118 6620', phone: '+966 12 665 2300', type: 'Billing', isPrimary: 'Yes', language: 'English', communication: 'Email', status: 'Active', notes: 'Send invoices before the 25th of each month.' },
      { customerCode: 'CUS-00114', siteCode: '', firstName: 'Sultan', lastName: 'Al-Qahtani', designation: 'Security Operations Lead', department: 'Security', email: 's.alqahtani@tamimiretail.com.sa', mobile: '+966 53 774 0915', phone: '', type: 'Emergency', isPrimary: 'Yes', language: 'Arabic', communication: 'Mobile', status: 'Active', notes: 'Reachable 24/7 for critical incidents.' },
    ],
    commit: (rows) =>
      api.importMany(
        rows.map(({ row, values: v }) => {
          const input: ContactInput = {
            customerId: customerByCode.get(v['customerCode'].toLowerCase())!.id,
            siteId: v['siteCode'] ? (siteByCode.get(v['siteCode'].toLowerCase())?.id ?? null) : null,
            firstName: v['firstName'],
            lastName: v['lastName'],
            designation: v['designation'],
            department: v['department'],
            email: v['email'],
            mobile: v['mobile'],
            phone: v['phone'],
            preferredLanguage: (v['language'] || 'English') as PreferredLanguage,
            preferredCommunication: (v['communication'] || 'Email') as CommunicationMethod,
            type: v['type'] as ContactType,
            isPrimary: yesNo(v['isPrimary']),
            status: (v['status'] || 'Active') as ContactStatus,
            notes: v['notes'],
          };
          return { row, input };
        }),
      ),
  };
}

// ----- Documents -------------------------------------------------------------

export function documentImportConfig(ctx: ImportContext, api: DocumentApi): ImportConfig {
  const customerByCode = new Map(ctx.customers.map((c) => [c.code.toLowerCase(), c]));
  const siteByCode = new Map(ctx.sites.map((s) => [s.code.toLowerCase(), s]));
  const userByEmail = new Map(ctx.lookups.users.map((u) => [u.email.toLowerCase(), u.id]));

  return {
    entity: 'document',
    entityPlural: 'documents',
    templateName: 'document-import-template',
    notes: [
      'Creates document register entries; attach the files afterwards with Replace.',
      'A Responsible User is required when an Expiry Date is provided.',
    ],
    columns: [
      { key: 'name', label: 'Document Name', required: true },
      { key: 'category', label: 'Document Type', required: true, options: lookupNames(ctx, LOOKUP.documentCategory) },
      { key: 'customerCode', label: 'Customer Code', required: true, validate: (v) => (customerByCode.has(v.toLowerCase()) ? null : `Customer ${v} does not exist`) },
      {
        key: 'siteCode',
        label: 'Site Code',
        validate: (v, row) => {
          const site = siteByCode.get(v.toLowerCase());
          if (!site) return `Site ${v} does not exist`;
          return site.customerCode.toLowerCase() === row['customerCode'].toLowerCase() ? null : `Site ${v} belongs to ${site.customerCode}`;
        },
      },
      { key: 'documentNumber', label: 'Document Number' },
      { key: 'issueDate', label: 'Issue Date', type: 'date' },
      {
        key: 'expiryDate',
        label: 'Expiry Date',
        type: 'date',
        validate: (v, row) =>
          row['issueDate'] && v < row['issueDate']
            ? 'Expiry date is before the issue date'
            : !row['responsible']
              ? 'Responsible User Email is required when an expiry date is set'
              : null,
      },
      { key: 'reminderDays', label: 'Reminder Days', type: 'number', description: 'Days before expiry to notify (default 30)' },
      {
        key: 'responsible',
        label: 'Responsible User Email',
        type: 'email',
        validate: (v) => (userByEmail.has(v.toLowerCase()) ? null : `No user with email ${v}`),
      },
      { key: 'access', label: 'Access Control', options: DOCUMENT_ACCESS_LEVELS, description: 'Defaults to Internal' },
      { key: 'fileName', label: 'File Name', required: true },
      { key: 'notes', label: 'Notes' },
    ],
    sampleRows: [
      { name: 'Civil Defense Safety Certificate 2026', category: 'Compliance Documents', customerCode: 'CUS-00101', siteCode: 'SITE-0001', documentNumber: 'CD-RYD-2026-44817', issueDate: '2026-03-01', expiryDate: '2027-02-28', reminderDays: '45', responsible: 'noura.dosari@gfs.sa', access: 'Internal', fileName: 'civil-defense-certificate-2026.pdf', notes: 'Annual inspection passed without findings.' },
      { name: 'RMFA Facilities Master Agreement', category: 'Contracts', customerCode: 'CUS-00103', siteCode: '', documentNumber: 'MSA-RMFA-2025-017', issueDate: '2025-07-01', expiryDate: '2028-06-30', reminderDays: '90', responsible: 'ahmed.harbi@gfs.sa', access: 'Restricted', fileName: 'rmfa-master-service-agreement.pdf', notes: 'Signed copy received from legal.' },
      { name: 'Tamimi Retail Public Liability Policy', category: 'Insurance', customerCode: 'CUS-00114', siteCode: '', documentNumber: 'TAW-PL-889214', issueDate: '2026-01-15', expiryDate: '2027-01-14', reminderDays: '30', responsible: 'lina.haddad@gfs.sa', access: 'Customer Visible', fileName: 'tamimi-public-liability-2026.pdf', notes: 'Coverage SAR 10,000,000 per occurrence.' },
    ],
    commit: (rows) =>
      api.importMany(
        rows.map(({ row, values: v }) => {
          const fileName = v['fileName'];
          const input: DocumentUpload = {
            name: v['name'],
            category: v['category'] as DocumentCategory,
            customerId: customerByCode.get(v['customerCode'].toLowerCase())!.id,
            siteId: v['siteCode'] ? (siteByCode.get(v['siteCode'].toLowerCase())?.id ?? null) : null,
            documentNumber: v['documentNumber'],
            issueDate: orNull(v['issueDate']),
            expiryDate: orNull(v['expiryDate']),
            reminderDays: v['reminderDays'] ? Number(v['reminderDays']) : 30,
            responsibleUserId: userByEmail.get(v['responsible']) ?? null,
            access: (v['access'] || 'Internal') as DocumentAccess,
            notes: v['notes'],
            file: { name: fileName, size: 0, type: fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '' },
          };
          return { row, input };
        }),
      ),
  };
}
