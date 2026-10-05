import { Injectable, inject } from '@angular/core';
import { daysBetween, fullName } from '@shared/utils/format';
import { type Observable, defer } from 'rxjs';
import type { ActivityFilter, ActivityListItem } from '../../models/activity.model';
import type {
  Contact,
  ContactFilter,
  ContactInput,
  ContactListItem,
  ContactStatus,
} from '../../models/contact.model';
import {
  type Customer,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerStatus,
  type CustomerUpsert,
  type DuplicateCandidate,
  type DuplicateMatch,
  type DuplicateMatchField,
} from '../../models/customer.model';
import type { CustomerDashboard, DashboardFilters } from '../../models/dashboard.model';
import type {
  CustomerDocument,
  DocumentFilter,
  DocumentListItem,
  DocumentReplace,
  DocumentUpload,
} from '../../models/document.model';
import type { CustomerLookups } from '../../models/lookup.model';
import type { RelatedRecords } from '../../models/related.model';
import type { Site, SiteFilter, SiteListItem, SiteStatus, SiteUpsert } from '../../models/site.model';
import { DUPLICATE_MATCH_CRITERIA } from '../customer-site.config';
import type { ImportCommitResult } from '@shared/models/import';
import {
  ActivityApi,
  ContactApi,
  CustomerApi,
  DocumentApi,
  type ImportEntry,
  LookupApi,
  RelatedRecordsApi,
  SiteApi,
} from '../customer-site.api';
import { MockCustomerSiteStore } from './mock-store';
import { fail, pad, respond, uid } from './mock-utils';

const normalize = (value: string | null | undefined) =>
  (value ?? '').toLowerCase().replace(/[^a-z0-9@.]/g, '');
const digitsOnly = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

/** Runs the mutation lazily on subscribe, then emits the result with simulated latency. */
function mutate<T>(work: () => T | Error): Observable<T> {
  return defer(() => {
    const result = work();
    return result instanceof Error ? fail(result.message) : respond(result, 420);
  });
}

/** Inserts each entry independently; failures are reported per source row. */
function bulkInsert<I, T>(entries: readonly ImportEntry<I>[], insert: (input: I) => T | Error): ImportCommitResult {
  const failed: { row: number; message: string }[] = [];
  let created = 0;
  for (const entry of entries) {
    const result = insert(entry.input);
    if (result instanceof Error) failed.push({ row: entry.row, message: result.message });
    else created++;
  }
  return { created, failed };
}

function nextCode(prefix: string, existing: readonly string[], width: number): string {
  const max = existing.reduce((highest, code) => {
    const match = code.match(/(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix}-${pad(max + 1, width)}`;
}

@Injectable()
export class MockCustomerApi extends CustomerApi {
  private readonly store = inject(MockCustomerSiteStore);

  list(): Observable<CustomerListItem[]> {
    return defer(() =>
      respond(
        [...this.store.db.customers]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((c) => this.store.customerListItem(c)),
      ),
    );
  }

  get(id: string): Observable<CustomerDetail> {
    return defer(() => {
      const customer = this.store.customer(id);
      return customer
        ? respond(this.store.customerDetail(customer))
        : fail(`Customer ${id} was not found.`);
    });
  }

  create(input: CustomerUpsert): Observable<Customer> {
    return mutate(() => this.insert(input));
  }

  importMany(entries: readonly ImportEntry<CustomerUpsert>[]): Observable<ImportCommitResult> {
    return mutate(() => bulkInsert(entries, (input) => this.insert(input)));
  }

  private insert(input: CustomerUpsert): Customer | Error {
    const { db } = this.store;
    if (!this.codeFree(input.code)) return new Error(`Customer code ${input.code} is already in use.`);
    const id = input.code.trim().toUpperCase();
    const { primaryContact, ...fields } = input;
    let primaryContactId: string | null = null;
    if (primaryContact && (primaryContact.firstName || primaryContact.lastName)) {
      const contact: Contact = {
        ...primaryContact,
        id: uid('CON'),
        customerId: id,
        siteId: null,
        type: 'Primary',
        isPrimary: true,
        ...this.store.audit(),
      };
      db.contacts.push(contact);
      primaryContactId = contact.id;
    }
    const customer: Customer = {
      ...fields,
      id,
      code: id,
      primaryContactId,
      ...this.store.audit(),
    };
    db.customers.push(customer);
    this.store.log('Customer Created', 'Customer', id, id, null, `Customer ${customer.name} was created.`, id);
    if (primaryContactId) {
      this.store.log('Contact Added', 'Contact', primaryContactId, id, null, `${this.store.contactName(primaryContactId)} added as primary contact.`, primaryContactId);
    }
    return customer;
  }

  update(id: string, input: CustomerUpsert): Observable<Customer> {
    return mutate(() => {
      const { db } = this.store;
      const index = db.customers.findIndex((c) => c.id === id);
      if (index < 0) return new Error('Customer not found.');
      const previous = db.customers[index];
      const { primaryContact, ...fields } = input;
      let primaryContactId = previous.primaryContactId;
      if (primaryContact) {
        const existing = this.store.contact(primaryContactId);
        if (existing) {
          const i = db.contacts.indexOf(existing);
          db.contacts[i] = this.store.touched({ ...existing, ...primaryContact });
        } else if (primaryContact.firstName || primaryContact.lastName) {
          const contact: Contact = {
            ...primaryContact,
            id: uid('CON'),
            customerId: id,
            siteId: null,
            type: 'Primary',
            isPrimary: true,
            ...this.store.audit(),
          };
          db.contacts.push(contact);
          primaryContactId = contact.id;
        }
      }
      const next: Customer = this.store.touched({ ...previous, ...fields, id, code: previous.code, primaryContactId });
      db.customers[index] = next;
      if (previous.status !== next.status) {
        this.store.log('Status Changed', 'Customer', id, id, null, 'Customer status changed.', id, { field: 'Customer Status', from: previous.status, to: next.status });
      }
      const changes: [string, string, string][] = [
        ['Customer Name', previous.name, next.name],
        ['Customer Type', previous.type, next.type],
        ['Customer Category', previous.category, next.category],
        ['Account Manager', this.store.userName(previous.commercial.accountManagerId) ?? '—', this.store.userName(next.commercial.accountManagerId) ?? '—'],
        ['Credit Limit', String(previous.commercial.creditLimit ?? '—'), String(next.commercial.creditLimit ?? '—')],
      ];
      const changed = changes.filter(([, from, to]) => from !== to);
      if (changed.length) {
        changed.forEach(([field, from, to]) =>
          this.store.log('Customer Updated', 'Customer', id, id, null, `${field} updated.`, id, { field, from, to }),
        );
      } else if (previous.status === next.status) {
        this.store.log('Customer Updated', 'Customer', id, id, null, 'Customer details updated.', id);
      }
      return next;
    });
  }

  setStatus(ids: readonly string[], status: CustomerStatus): Observable<void> {
    return mutate(() => {
      const { db } = this.store;
      ids.forEach((id) => {
        const index = db.customers.findIndex((c) => c.id === id);
        if (index < 0 || db.customers[index].status === status) return;
        const previous = db.customers[index];
        db.customers[index] = this.store.touched({ ...previous, status });
        this.store.log('Status Changed', 'Customer', id, id, null, 'Customer status changed.', id, { field: 'Customer Status', from: previous.status, to: status });
      });
      return undefined;
    });
  }

  assignAccountManager(ids: readonly string[], userId: string): Observable<void> {
    return mutate(() => {
      const { db } = this.store;
      ids.forEach((id) => {
        const index = db.customers.findIndex((c) => c.id === id);
        if (index < 0) return;
        const previous = db.customers[index];
        db.customers[index] = this.store.touched({
          ...previous,
          commercial: { ...previous.commercial, accountManagerId: userId },
        });
        this.store.log('Customer Updated', 'Customer', id, id, null, 'Account manager reassigned.', id, {
          field: 'Account Manager',
          from: this.store.userName(previous.commercial.accountManagerId) ?? '—',
          to: this.store.userName(userId) ?? '—',
        });
      });
      return undefined;
    });
  }

  updateNotes(id: string, notes: { internalNotes: string; customerNotes: string }): Observable<void> {
    return mutate(() => {
      const { db } = this.store;
      const index = db.customers.findIndex((c) => c.id === id);
      if (index < 0) return new Error('Customer not found.');
      db.customers[index] = this.store.touched({ ...db.customers[index], ...notes });
      this.store.log('Customer Updated', 'Customer', id, id, null, 'Customer notes updated.', id);
      return undefined;
    });
  }

  nextCode(): Observable<string> {
    return defer(() => respond(nextCode('CUS', this.store.db.customers.map((c) => c.code), 5), 120));
  }

  isCodeAvailable(code: string, excludeId?: string): Observable<boolean> {
    return defer(() => respond(this.codeFree(code, excludeId), 350));
  }

  findDuplicates(candidate: DuplicateCandidate, excludeId?: string): Observable<DuplicateMatch[]> {
    return defer(() => {
      const { db } = this.store;
      const matches: DuplicateMatch[] = [];
      for (const customer of db.customers) {
        if (customer.id === excludeId) continue;
        const contacts = db.contacts.filter((c) => c.customerId === customer.id);
        const matchedOn = DUPLICATE_MATCH_CRITERIA.filter((field: DuplicateMatchField) => {
          const value = candidate[field];
          if (!value || normalize(value).length < 4) return false;
          switch (field) {
            case 'legalName':
              return normalize(customer.legalName) === normalize(value) || normalize(customer.name) === normalize(value);
            case 'crNumber':
              return digitsOnly(customer.crNumber) === digitsOnly(value);
            case 'vatNumber':
              return digitsOnly(customer.vatNumber) === digitsOnly(value);
            case 'email':
              return contacts.some((c) => normalize(c.email) === normalize(value));
            case 'phone':
              return contacts.some((c) =>
                [c.phone, c.mobile].some((p) => p && digitsOnly(p).endsWith(digitsOnly(value).slice(-9))),
              );
          }
        });
        if (matchedOn.length) {
          matches.push({ customerId: customer.id, code: customer.code, name: customer.name, status: customer.status, matchedOn });
        }
      }
      return respond(matches, 380);
    });
  }

  dashboard(filters: DashboardFilters): Observable<CustomerDashboard> {
    return defer(() => respond(this.buildDashboard(filters), 450));
  }

  private codeFree(code: string, excludeId?: string): boolean {
    const target = code.trim().toLowerCase();
    return !this.store.db.customers.some((c) => c.id !== excludeId && c.code.toLowerCase() === target);
  }

  private buildDashboard(filters: DashboardFilters): CustomerDashboard {
    const { db } = this.store;
    const today = new Date();
    const customers = db.customers.filter(
      (c) =>
        (!filters.companies.length || filters.companies.includes(c.companyId)) &&
        (!filters.branches.length || filters.branches.includes(c.branchId)) &&
        (!filters.types.length || filters.types.includes(c.type)) &&
        (!filters.statuses.length || filters.statuses.includes(c.status)) &&
        (!filters.categories.length || filters.categories.includes(c.category)) &&
        (!filters.managers.length || filters.managers.includes(c.commercial.accountManagerId ?? '')),
    );
    const ids = new Set(customers.map((c) => c.id));
    const items = customers.map((c) => this.store.customerListItem(c));
    const name = (id: string) => this.store.customer(id)?.name ?? '';
    const inRange = (iso: string) => (!filters.from || iso.slice(0, 10) >= filters.from) && (!filters.to || iso.slice(0, 10) <= filters.to);
    const outstanding = items
      .filter((c) => c.outstandingAmount > 0)
      .map((c) => {
        const invoices = db.invoices.filter((i) => i.customerId === c.id && i.status !== 'Paid' && i.status !== 'Draft');
        return {
          customerId: c.id,
          customerName: c.name,
          amount: c.outstandingAmount,
          overdue: invoices.filter((i) => i.status === 'Overdue' || i.dueDate < today.toISOString().slice(0, 10)).reduce((s, i) => s + i.amount - i.paid, 0),
          invoices: invoices.length,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return {
      kpis: {
        totalCustomers: customers.length,
        activeCustomers: customers.filter((c) => c.status === 'Active').length,
        inactiveCustomers: customers.filter((c) => c.status === 'Inactive' || c.status === 'Archived').length,
        newCustomers: customers.filter((c) => inRange(c.createdAt)).length,
        withActiveContracts: items.filter((c) => c.activeContracts > 0).length,
        withExpiringContracts: items.filter((c) => c.contractState === 'Expiring' || c.amcState === 'Expiring').length,
        withActiveAmcs: items.filter((c) => c.activeAmcs > 0).length,
        withOpenServiceRequests: items.filter((c) => c.openServiceRequests > 0).length,
        withOpenWorkOrders: items.filter((c) => c.openWorkOrders > 0).length,
        withOutstandingInvoices: outstanding.length,
        outstandingTotal: outstanding.reduce((sum, row) => sum + row.amount, 0),
      },
      recentCustomers: [...customers]
        .filter((c) => inRange(c.createdAt))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6)
        .map((c) => ({ id: c.id, code: c.code, name: c.name, type: c.type, status: c.status, createdAt: c.createdAt })),
      recentSites: db.sites
        .filter((s) => ids.has(s.customerId) && inRange(s.createdAt))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6)
        .map((s) => ({ id: s.id, code: s.code, name: s.name, customerName: name(s.customerId), city: s.location.city, createdAt: s.createdAt })),
      expiringContracts: db.agreements
        .filter((a) => ids.has(a.customerId) && a.status === 'Expiring')
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .slice(0, 6)
        .map((a) => ({ id: a.id, number: a.number, kind: a.kind, customerId: a.customerId, customerName: name(a.customerId), endDate: a.endDate, daysLeft: daysBetween(today, a.endDate), value: a.value })),
      openServiceRequests: db.serviceRequests
        .filter((r) => ids.has(r.customerId) && ['New', 'Assigned', 'In Progress', 'On Hold'].includes(r.status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6)
        .map((r) => ({ id: r.id, number: r.number, subject: r.subject, customerId: r.customerId, customerName: name(r.customerId), priority: r.priority, status: r.status, createdAt: r.createdAt })),
      upcomingMaintenance: db.maintenance
        .filter((m) => ids.has(m.customerId))
        .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
        .slice(0, 6)
        .map((m) => ({ id: m.id, plan: m.plan, siteId: m.siteId, siteName: this.store.site(m.siteId)?.name ?? '', customerName: name(m.customerId), nextDue: m.nextDue, status: m.status })),
      recentActivity: db.serviceHistory
        .filter((h) => ids.has(h.customerId))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 6)
        .map((h) => ({ id: h.id, date: h.date, visitType: h.visitType, summary: h.summary, customerId: h.customerId, customerName: name(h.customerId), siteName: this.store.site(h.siteId)?.name ?? '', technician: h.technician, outcome: h.outcome })),
      outstanding: outstanding.slice(0, 6),
    };
  }
}

@Injectable()
export class MockSiteApi extends SiteApi {
  private readonly store = inject(MockCustomerSiteStore);

  list(filter?: SiteFilter): Observable<SiteListItem[]> {
    return defer(() =>
      respond(
        this.store.db.sites
          .filter((s) => !filter?.customerId || s.customerId === filter.customerId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((s) => this.store.siteListItem(s)),
      ),
    );
  }

  get(id: string): Observable<SiteListItem> {
    return defer(() => {
      const site = this.store.site(id);
      return site ? respond(this.store.siteListItem(site)) : fail(`Site ${id} was not found.`);
    });
  }

  create(input: SiteUpsert): Observable<Site> {
    return mutate(() => this.insert(input));
  }

  importMany(entries: readonly ImportEntry<SiteUpsert>[]): Observable<ImportCommitResult> {
    return mutate(() => bulkInsert(entries, (input) => this.insert(input)));
  }

  private insert(input: SiteUpsert): Site | Error {
    const customer = this.store.customer(input.customerId);
    if (!customer) return new Error('Every site must belong to an existing customer.');
    if (customer.status === 'Inactive' || customer.status === 'Archived') {
      return new Error(`Cannot add sites to an ${customer.status.toLowerCase()} customer.`);
    }
    if (!this.codeFree(input.code)) return new Error(`Site code ${input.code} is already in use.`);
    const site: Site = { ...input, id: input.code.trim().toUpperCase(), code: input.code.trim().toUpperCase(), ...this.store.audit() };
    this.store.db.sites.push(site);
    this.store.log('Site Added', 'Site', site.id, site.customerId, site.id, `Site ${site.name} was added.`, site.id);
    return site;
  }

  update(id: string, input: SiteUpsert): Observable<Site> {
    return mutate(() => {
      const { db } = this.store;
      const index = db.sites.findIndex((s) => s.id === id);
      if (index < 0) return new Error('Site not found.');
      const previous = db.sites[index];
      const next = this.store.touched({ ...previous, ...input, id, code: previous.code });
      db.sites[index] = next;
      if (previous.status !== next.status) {
        this.store.log('Status Changed', 'Site', id, next.customerId, id, 'Site status changed.', id, { field: 'Site Status', from: previous.status, to: next.status });
      } else {
        this.store.log('Site Updated', 'Site', id, next.customerId, id, `Site ${next.name} updated.`, id);
      }
      return next;
    });
  }

  setStatus(id: string, status: SiteStatus): Observable<void> {
    return mutate(() => {
      const { db } = this.store;
      const index = db.sites.findIndex((s) => s.id === id);
      if (index < 0) return new Error('Site not found.');
      const previous = db.sites[index];
      db.sites[index] = this.store.touched({ ...previous, status });
      this.store.log('Status Changed', 'Site', id, previous.customerId, id, 'Site status changed.', id, { field: 'Site Status', from: previous.status, to: status });
      return undefined;
    });
  }

  nextCode(): Observable<string> {
    return defer(() => respond(nextCode('SITE', this.store.db.sites.map((s) => s.code), 4), 120));
  }

  isCodeAvailable(code: string, excludeId?: string): Observable<boolean> {
    return defer(() => respond(this.codeFree(code, excludeId), 350));
  }

  private codeFree(code: string, excludeId?: string): boolean {
    const target = code.trim().toLowerCase();
    return !this.store.db.sites.some((s) => s.id !== excludeId && s.code.toLowerCase() === target);
  }
}

@Injectable()
export class MockContactApi extends ContactApi {
  private readonly store = inject(MockCustomerSiteStore);

  list(filter?: ContactFilter): Observable<ContactListItem[]> {
    return defer(() =>
      respond(
        this.store.db.contacts
          .filter(
            (c) =>
              (!filter?.customerId || c.customerId === filter.customerId) &&
              (!filter?.siteId || c.siteId === filter.siteId),
          )
          .map((c) => this.store.contactListItem(c))
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.fullName.localeCompare(b.fullName)),
      ),
    );
  }

  create(input: ContactInput): Observable<Contact> {
    return mutate(() => this.insert(input));
  }

  importMany(entries: readonly ImportEntry<ContactInput>[]): Observable<ImportCommitResult> {
    return mutate(() => bulkInsert(entries, (input) => this.insert(input)));
  }

  private insert(input: ContactInput): Contact | Error {
    if (!this.store.customer(input.customerId)) return new Error('Customer not found.');
    const contact: Contact = { ...input, id: uid('CON'), ...this.store.audit() };
    this.store.db.contacts.push(contact);
    if (contact.isPrimary) this.enforceSinglePrimary(contact);
    this.store.log('Contact Added', 'Contact', contact.id, contact.customerId, contact.siteId, `${fullName(contact.firstName, contact.lastName)} added as ${contact.type.toLowerCase()} contact.`, contact.id);
    return contact;
  }

  update(id: string, input: ContactInput): Observable<Contact> {
    return mutate(() => {
      const { db } = this.store;
      const index = db.contacts.findIndex((c) => c.id === id);
      if (index < 0) return new Error('Contact not found.');
      const previous = db.contacts[index];
      const next = this.store.touched({ ...previous, ...input, id });
      db.contacts[index] = next;
      if (next.isPrimary) this.enforceSinglePrimary(next);
      this.store.log('Contact Updated', 'Contact', id, next.customerId, next.siteId, `${fullName(next.firstName, next.lastName)} updated.`, id,
        previous.status !== next.status ? { field: 'Contact Status', from: previous.status, to: next.status } : undefined);
      return next;
    });
  }

  setPrimary(id: string): Observable<void> {
    return mutate(() => {
      const { db } = this.store;
      const index = db.contacts.findIndex((c) => c.id === id);
      if (index < 0) return new Error('Contact not found.');
      const contact = db.contacts[index];
      if (contact.status !== 'Active') return new Error('Only active contacts can be set as primary.');
      db.contacts[index] = this.store.touched({ ...contact, isPrimary: true });
      this.enforceSinglePrimary(db.contacts[index]);
      this.store.log('Contact Updated', 'Contact', id, contact.customerId, contact.siteId, `${fullName(contact.firstName, contact.lastName)} set as primary ${contact.type.toLowerCase()} contact.`, id, { field: 'Primary Contact', from: 'No', to: 'Yes' });
      return undefined;
    });
  }

  setStatus(id: string, status: ContactStatus): Observable<void> {
    return mutate(() => {
      const { db } = this.store;
      const index = db.contacts.findIndex((c) => c.id === id);
      if (index < 0) return new Error('Contact not found.');
      const previous = db.contacts[index];
      db.contacts[index] = this.store.touched({ ...previous, status, isPrimary: status === 'Active' && previous.isPrimary });
      this.store.log('Status Changed', 'Contact', id, previous.customerId, previous.siteId, 'Contact status changed.', id, { field: 'Contact Status', from: previous.status, to: status });
      return undefined;
    });
  }

  /** One primary contact per contact type within the same customer (or site) scope. */
  private enforceSinglePrimary(primary: Contact): void {
    const { db } = this.store;
    db.contacts.forEach((c, i) => {
      if (c.id !== primary.id && c.isPrimary && c.customerId === primary.customerId && c.siteId === primary.siteId && c.type === primary.type) {
        db.contacts[i] = this.store.touched({ ...c, isPrimary: false });
      }
    });
    if (primary.type === 'Primary' && primary.siteId === null) {
      const index = db.customers.findIndex((c) => c.id === primary.customerId);
      if (index >= 0) db.customers[index] = { ...db.customers[index], primaryContactId: primary.id };
    }
  }
}

@Injectable()
export class MockDocumentApi extends DocumentApi {
  private readonly store = inject(MockCustomerSiteStore);

  list(filter?: DocumentFilter): Observable<DocumentListItem[]> {
    return defer(() =>
      respond(
        this.store.db.documents
          .filter(
            (d) =>
              (!filter?.customerId || d.customerId === filter.customerId) &&
              (!filter?.siteId || d.siteId === filter.siteId),
          )
          .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
          .map((d) => this.store.documentListItem(d)),
      ),
    );
  }

  upload(input: DocumentUpload): Observable<CustomerDocument> {
    return mutate(() => this.insert(input));
  }

  importMany(entries: readonly ImportEntry<DocumentUpload>[]): Observable<ImportCommitResult> {
    return mutate(() => bulkInsert(entries, (input) => this.insert(input)));
  }

  private insert(input: DocumentUpload): CustomerDocument | Error {
    const { file, ...fields } = input;
    const now = this.store.now();
    const user = this.store.currentUser.name;
    const document: CustomerDocument = {
      ...fields,
      id: uid('DOC'),
      recordStatus: 'Active',
      renewalStatus: 'None',
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      version: 1,
      uploadedBy: user,
      uploadedAt: now,
      versions: [{ version: 1, fileName: file.name, fileSize: file.size, uploadedBy: user, uploadedAt: now, note: 'Initial upload' }],
    };
    this.store.db.documents.push(document);
    this.store.log('Document Uploaded', 'Document', document.id, document.customerId, document.siteId, `${document.name} uploaded.`, document.id);
    return document;
  }

  replace(id: string, input: DocumentReplace): Observable<CustomerDocument> {
    return mutate(() => {
      const { db } = this.store;
      const index = db.documents.findIndex((d) => d.id === id);
      if (index < 0) return new Error('Document not found.');
      const previous = db.documents[index];
      const now = this.store.now();
      const user = this.store.currentUser.name;
      const version = previous.version + 1;
      const next: CustomerDocument = {
        ...previous,
        fileName: input.file.name,
        fileSize: input.file.size,
        mimeType: input.file.type || previous.mimeType,
        issueDate: input.issueDate ?? previous.issueDate,
        expiryDate: input.expiryDate,
        renewalStatus: previous.renewalStatus === 'In Progress' ? 'Renewed' : previous.renewalStatus,
        version,
        uploadedBy: user,
        uploadedAt: now,
        versions: [...previous.versions, { version, fileName: input.file.name, fileSize: input.file.size, uploadedBy: user, uploadedAt: now, note: input.note || 'New version uploaded' }],
      };
      db.documents[index] = next;
      this.store.log('Document Updated', 'Document', id, next.customerId, next.siteId, `${next.name} replaced with version ${version}.`, id, { field: 'Version', from: `v${previous.version}`, to: `v${version}` });
      return next;
    });
  }

  startRenewal(id: string): Observable<void> {
    return mutate(() => {
      const { db } = this.store;
      const index = db.documents.findIndex((d) => d.id === id);
      if (index < 0) return new Error('Document not found.');
      const previous = db.documents[index];
      db.documents[index] = { ...previous, renewalStatus: 'In Progress' };
      this.store.log('Document Updated', 'Document', id, previous.customerId, previous.siteId, `Renewal follow-up started for ${previous.name}.`, id, { field: 'Renewal Status', from: previous.renewalStatus, to: 'In Progress' });
      return undefined;
    });
  }

  archive(id: string): Observable<void> {
    return mutate(() => {
      const { db } = this.store;
      const index = db.documents.findIndex((d) => d.id === id);
      if (index < 0) return new Error('Document not found.');
      const previous = db.documents[index];
      db.documents[index] = { ...previous, recordStatus: 'Archived' };
      this.store.log('Status Changed', 'Document', id, previous.customerId, previous.siteId, `${previous.name} archived.`, id, { field: 'Document Status', from: 'Active', to: 'Archived' });
      return undefined;
    });
  }
}

@Injectable()
export class MockActivityApi extends ActivityApi {
  private readonly store = inject(MockCustomerSiteStore);

  list(filter?: ActivityFilter): Observable<ActivityListItem[]> {
    return defer(() =>
      respond(
        this.store.db.activities
          .filter(
            (a) =>
              (!filter?.customerId || a.customerId === filter.customerId) &&
              (!filter?.siteId || a.siteId === filter.siteId),
          )
          .map((a) => this.store.activityListItem(a)),
      ),
    );
  }
}

@Injectable()
export class MockRelatedRecordsApi extends RelatedRecordsApi {
  private readonly store = inject(MockCustomerSiteStore);

  forCustomer(customerId: string): Observable<RelatedRecords> {
    return defer(() => respond(this.store.related({ customerId })));
  }

  forSite(siteId: string): Observable<RelatedRecords> {
    return defer(() => respond(this.store.related({ siteId })));
  }
}

@Injectable()
export class MockLookupApi extends LookupApi {
  private readonly store = inject(MockCustomerSiteStore);

  get(): Observable<CustomerLookups> {
    return defer(() => respond(this.store.db.lookups, 150));
  }
}
