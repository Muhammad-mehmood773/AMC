import { Injectable } from '@angular/core';
import { daysBetween, fullName } from '@shared/utils/format';
import type {
  ActivityAction,
  ActivityEntity,
  ActivityListItem,
  ActivityEntry,
} from '../../models/activity.model';
import type { Contact, ContactListItem } from '../../models/contact.model';
import type {
  AgreementState,
  Customer,
  CustomerDetail,
  CustomerListItem,
} from '../../models/customer.model';
import type { CustomerDocument, DocumentListItem, DocumentStatus } from '../../models/document.model';
import type { AgreementSummary, RelatedRecords } from '../../models/related.model';
import type { Site, SiteListItem } from '../../models/site.model';
import { CURRENT_USER } from './lookups.seed';
import { type MockDatabase, buildSeed } from './seed';
import { pad } from './mock-utils';

const OPEN_SR = new Set(['New', 'Assigned', 'In Progress', 'On Hold']);
const OPEN_WO = new Set(['Scheduled', 'In Progress', 'On Hold']);
const LIVE_AGREEMENT = new Set(['Active', 'Expiring']);

export interface ActivityChange {
  readonly field: string;
  readonly from: string;
  readonly to: string;
}

/**
 * In-memory database shared by the mock API adapters. Holds the seeded data for the lifetime
 * of the feature injector and derives the read models (aggregates, display statuses).
 */
@Injectable()
export class MockCustomerSiteStore {
  readonly db: MockDatabase = buildSeed();
  private activitySeq = this.db.activities.length + 1;

  readonly currentUser = CURRENT_USER;

  now(): string {
    return new Date().toISOString();
  }

  audit() {
    return { createdAt: this.now(), createdBy: CURRENT_USER.name, updatedAt: null, updatedBy: null };
  }

  touched<T extends { updatedAt: string | null; updatedBy: string | null }>(value: T): T {
    return { ...value, updatedAt: this.now(), updatedBy: CURRENT_USER.name };
  }

  log(
    action: ActivityAction,
    entity: ActivityEntity,
    entityId: string,
    customerId: string,
    siteId: string | null,
    description: string,
    reference: string | null,
    change?: ActivityChange,
  ): void {
    const entry: ActivityEntry = {
      id: `ACT-${pad(this.activitySeq++, 5)}`,
      timestamp: this.now(),
      userId: CURRENT_USER.id,
      userName: CURRENT_USER.name,
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
    };
    this.db.activities.unshift(entry);
  }

  userName(id: string | null): string | null {
    return id ? (this.db.lookups.users.find((user) => user.id === id)?.name ?? null) : null;
  }

  customer(id: string): Customer | undefined {
    return this.db.customers.find((customer) => customer.id === id);
  }

  site(id: string): Site | undefined {
    return this.db.sites.find((site) => site.id === id);
  }

  contact(id: string | null): Contact | undefined {
    return id ? this.db.contacts.find((contact) => contact.id === id) : undefined;
  }

  contactName(id: string | null): string | null {
    const contact = this.contact(id);
    return contact ? fullName(contact.firstName, contact.lastName) : null;
  }

  // ----- Read models -------------------------------------------------------

  agreementState(agreements: readonly AgreementSummary[]): AgreementState {
    if (agreements.some((a) => a.status === 'Expiring')) return 'Expiring';
    if (agreements.some((a) => a.status === 'Active')) return 'Active';
    if (agreements.some((a) => a.status === 'Expired')) return 'Expired';
    return 'None';
  }

  customerListItem(customer: Customer): CustomerListItem {
    const { db } = this;
    const id = customer.id;
    const primary = this.contact(customer.primaryContactId);
    const agreements = db.agreements.filter((a) => a.customerId === id);
    const contracts = agreements.filter((a) => a.kind === 'Contract');
    const amcs = agreements.filter((a) => a.kind === 'AMC');
    return {
      ...customer,
      primaryContactName: primary ? fullName(primary.firstName, primary.lastName) : null,
      phone: primary ? primary.phone || primary.mobile : null,
      email: primary?.email ?? null,
      accountManagerName: this.userName(customer.commercial.accountManagerId),
      totalSites: db.sites.filter((s) => s.customerId === id && s.status !== 'Archived').length,
      activeContracts: contracts.filter((a) => LIVE_AGREEMENT.has(a.status)).length,
      activeAmcs: amcs.filter((a) => LIVE_AGREEMENT.has(a.status)).length,
      activeAssets: db.assets.filter((a) => a.customerId === id && a.status !== 'Decommissioned')
        .length,
      openServiceRequests: db.serviceRequests.filter(
        (r) => r.customerId === id && OPEN_SR.has(r.status),
      ).length,
      openWorkOrders: db.workOrders.filter((w) => w.customerId === id && OPEN_WO.has(w.status))
        .length,
      outstandingAmount: db.invoices
        .filter((i) => i.customerId === id && i.status !== 'Paid' && i.status !== 'Draft')
        .reduce((sum, i) => sum + (i.amount - i.paid), 0),
      contractState: this.agreementState(contracts),
      amcState: this.agreementState(amcs),
    };
  }

  customerDetail(customer: Customer): CustomerDetail {
    const { db } = this;
    const id = customer.id;
    return {
      ...this.customerListItem(customer),
      primaryContact: this.contact(customer.primaryContactId) ?? null,
      totalAssets: db.assets.filter((a) => a.customerId === id).length,
      completedServices:
        db.serviceHistory.filter((h) => h.customerId === id).length +
        db.workOrders.filter((w) => w.customerId === id && w.status === 'Completed').length,
      totalContacts: db.contacts.filter((c) => c.customerId === id).length,
      totalDocuments: db.documents.filter((d) => d.customerId === id).length,
    };
  }

  siteListItem(site: Site): SiteListItem {
    const { db } = this;
    const customer = this.customer(site.customerId);
    const agreements = db.agreements.filter((a) => a.siteIds.includes(site.id));
    return {
      ...site,
      customerName: customer?.name ?? 'Unknown customer',
      customerCode: customer?.code ?? '',
      customerStatus: customer?.status ?? 'Inactive',
      primaryContactName: this.contactName(site.siteContactId),
      siteManagerName: this.contactName(site.siteManagerId),
      emergencyContactName: this.contactName(site.emergencyContactId),
      totalAssets: db.assets.filter((a) => a.siteId === site.id).length,
      activeContracts: agreements.filter((a) => a.kind === 'Contract' && LIVE_AGREEMENT.has(a.status))
        .length,
      activeAmcs: agreements.filter((a) => a.kind === 'AMC' && LIVE_AGREEMENT.has(a.status)).length,
      openServiceRequests: db.serviceRequests.filter(
        (r) => r.siteId === site.id && OPEN_SR.has(r.status),
      ).length,
      openWorkOrders: db.workOrders.filter((w) => w.siteId === site.id && OPEN_WO.has(w.status))
        .length,
      upcomingMaintenance: db.maintenance.filter((m) => m.siteId === site.id).length,
      completedVisits: db.serviceHistory.filter((h) => h.siteId === site.id).length,
      contractState: this.agreementState(agreements),
    };
  }

  contactListItem(contact: Contact): ContactListItem {
    const customer = this.customer(contact.customerId);
    return {
      ...contact,
      fullName: fullName(contact.firstName, contact.lastName),
      customerName: customer?.name ?? '',
      customerCode: customer?.code ?? '',
      siteName: contact.siteId ? (this.site(contact.siteId)?.name ?? null) : null,
    };
  }

  documentStatus(doc: CustomerDocument): { status: DocumentStatus; daysToExpiry: number | null } {
    const daysToExpiry = doc.expiryDate ? daysBetween(new Date(), doc.expiryDate) : null;
    let status: DocumentStatus;
    if (doc.recordStatus === 'Archived') status = 'Archived';
    else if (doc.renewalStatus === 'In Progress') status = 'Renewal In Progress';
    else if (daysToExpiry === null) status = 'No Expiry';
    else if (daysToExpiry < 0) status = 'Expired';
    else if (daysToExpiry <= doc.reminderDays) status = 'Expiring Soon';
    else status = 'Valid';
    return { status, daysToExpiry };
  }

  documentListItem(doc: CustomerDocument): DocumentListItem {
    return {
      ...doc,
      ...this.documentStatus(doc),
      customerName: this.customer(doc.customerId)?.name ?? '',
      siteName: doc.siteId ? (this.site(doc.siteId)?.name ?? null) : null,
      responsibleUserName: this.userName(doc.responsibleUserId),
    };
  }

  activityListItem(entry: ActivityEntry): ActivityListItem {
    return {
      ...entry,
      customerName: this.customer(entry.customerId)?.name ?? '',
      siteName: entry.siteId ? (this.site(entry.siteId)?.name ?? null) : null,
    };
  }

  related(predicate: { customerId?: string; siteId?: string }): RelatedRecords {
    const { db } = this;
    const bySite = <T extends { customerId: string; siteId: string }>(items: readonly T[]) =>
      items.filter((item) =>
        predicate.siteId ? item.siteId === predicate.siteId : item.customerId === predicate.customerId,
      );
    const agreements = db.agreements.filter((a) =>
      predicate.siteId ? a.siteIds.includes(predicate.siteId) : a.customerId === predicate.customerId,
    );
    const customerId = predicate.customerId ?? this.site(predicate.siteId ?? '')?.customerId;
    const newestFirst = <T>(key: keyof T) => (a: T, b: T) =>
      String(b[key]).localeCompare(String(a[key]));
    return {
      assets: bySite(db.assets),
      contracts: agreements.filter((a) => a.kind === 'Contract'),
      amcs: agreements.filter((a) => a.kind === 'AMC'),
      serviceRequests: [...bySite(db.serviceRequests)].sort(newestFirst('createdAt')),
      workOrders: [...bySite(db.workOrders)].sort(newestFirst('scheduledDate')),
      maintenance: [...bySite(db.maintenance)].sort((a, b) => a.nextDue.localeCompare(b.nextDue)),
      invoices: predicate.siteId
        ? []
        : db.invoices.filter((i) => i.customerId === customerId).sort(newestFirst('issueDate')),
      serviceHistory: [...bySite(db.serviceHistory)].sort(newestFirst('date')),
    };
  }
}
