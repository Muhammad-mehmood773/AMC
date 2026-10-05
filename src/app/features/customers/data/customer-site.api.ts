import type { ImportCommitResult } from '@shared/models/import';
import type { Observable } from 'rxjs';
import type { ActivityFilter, ActivityListItem } from '../models/activity.model';
import type { Contact, ContactFilter, ContactInput, ContactListItem, ContactStatus } from '../models/contact.model';
import type {
  Customer,
  CustomerDetail,
  CustomerListItem,
  CustomerStatus,
  CustomerUpsert,
  DuplicateCandidate,
  DuplicateMatch,
} from '../models/customer.model';
import type { CustomerDashboard, DashboardFilters } from '../models/dashboard.model';
import type {
  CustomerDocument,
  DocumentFilter,
  DocumentListItem,
  DocumentReplace,
  DocumentUpload,
} from '../models/document.model';
import type { CustomerLookups } from '../models/lookup.model';
import type { RelatedRecords } from '../models/related.model';
import type { Site, SiteFilter, SiteListItem, SiteStatus, SiteUpsert } from '../models/site.model';

/*
 * Data-access contracts for the Customer & Site Management feature.
 * Components depend only on these abstractions; the concrete implementation is bound in
 * `provideCustomerSiteData()` (currently in-memory mocks, later HTTP adapters over ApiClient).
 */

/** One validated row from an import file. */
export interface ImportEntry<T> {
  readonly row: number;
  readonly input: T;
}

export abstract class CustomerApi {
  abstract list(): Observable<CustomerListItem[]>;
  abstract get(id: string): Observable<CustomerDetail>;
  abstract create(input: CustomerUpsert): Observable<Customer>;
  abstract importMany(entries: readonly ImportEntry<CustomerUpsert>[]): Observable<ImportCommitResult>;
  abstract update(id: string, input: CustomerUpsert): Observable<Customer>;
  abstract setStatus(ids: readonly string[], status: CustomerStatus): Observable<void>;
  abstract assignAccountManager(ids: readonly string[], userId: string): Observable<void>;
  abstract updateNotes(
    id: string,
    notes: { internalNotes: string; customerNotes: string },
  ): Observable<void>;
  abstract nextCode(): Observable<string>;
  abstract isCodeAvailable(code: string, excludeId?: string): Observable<boolean>;
  abstract findDuplicates(
    candidate: DuplicateCandidate,
    excludeId?: string,
  ): Observable<DuplicateMatch[]>;
  abstract dashboard(filters: DashboardFilters): Observable<CustomerDashboard>;
}

export abstract class SiteApi {
  abstract list(filter?: SiteFilter): Observable<SiteListItem[]>;
  abstract get(id: string): Observable<SiteListItem>;
  abstract create(input: SiteUpsert): Observable<Site>;
  abstract importMany(entries: readonly ImportEntry<SiteUpsert>[]): Observable<ImportCommitResult>;
  abstract update(id: string, input: SiteUpsert): Observable<Site>;
  abstract setStatus(id: string, status: SiteStatus): Observable<void>;
  abstract nextCode(): Observable<string>;
  abstract isCodeAvailable(code: string, excludeId?: string): Observable<boolean>;
}

export abstract class ContactApi {
  abstract list(filter?: ContactFilter): Observable<ContactListItem[]>;
  abstract create(input: ContactInput): Observable<Contact>;
  abstract importMany(entries: readonly ImportEntry<ContactInput>[]): Observable<ImportCommitResult>;
  abstract update(id: string, input: ContactInput): Observable<Contact>;
  abstract setPrimary(id: string): Observable<void>;
  abstract setStatus(id: string, status: ContactStatus): Observable<void>;
}

export abstract class DocumentApi {
  abstract list(filter?: DocumentFilter): Observable<DocumentListItem[]>;
  abstract upload(input: DocumentUpload): Observable<CustomerDocument>;
  abstract importMany(entries: readonly ImportEntry<DocumentUpload>[]): Observable<ImportCommitResult>;
  abstract replace(id: string, input: DocumentReplace): Observable<CustomerDocument>;
  abstract startRenewal(id: string): Observable<void>;
  abstract archive(id: string): Observable<void>;
}

export abstract class ActivityApi {
  abstract list(filter?: ActivityFilter): Observable<ActivityListItem[]>;
}

export abstract class RelatedRecordsApi {
  abstract forCustomer(customerId: string): Observable<RelatedRecords>;
  abstract forSite(siteId: string): Observable<RelatedRecords>;
}

export abstract class LookupApi {
  abstract get(): Observable<CustomerLookups>;
}
