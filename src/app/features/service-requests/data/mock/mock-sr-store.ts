import { Injectable } from '@angular/core';
import type { SrHistoryAction, SrHistoryEvent } from '../../models/operations.model';
import type { RequestListItem, ServiceRequest } from '../../models/request.model';
import { type SrDatabase, automate, toItem } from './sr-engine';
import { buildSrSeed } from './sr-seed';

/** In-memory service-request database; runs request automation (SRS 9.31) on every read. */
@Injectable()
export class MockSrStore {
  readonly db: SrDatabase = buildSrSeed();
  private seq = 1;

  get user(): string {
    return this.db.reference.currentUser.name;
  }

  get role(): string {
    return this.db.reference.currentUser.role;
  }

  now(): string {
    return new Date().toISOString();
  }

  readonly uid = (prefix: string): string => `${prefix}-N${String(this.seq++).padStart(5, '0')}`;

  private readonly push = (e: Omit<SrHistoryEvent, 'id'>) => this.db.history.unshift({ ...e, id: this.uid('SRH') });

  log(r: ServiceRequest, action: SrHistoryAction, reason: string, prev: string | null = null, next: string | null = null, source = 'Manual', related: string | null = null): void {
    this.push({ timestamp: this.now(), user: this.user, action, requestId: r.id, requestNumber: r.number, previousValue: prev, newValue: next, reason, source, relatedRecord: related });
  }

  monitor(): void {
    if (automate(this.db, this.push, this.uid)) this.db.history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  request(id: string): ServiceRequest | undefined {
    return this.db.requests.find((r) => r.id === id);
  }

  replace(next: ServiceRequest): ServiceRequest {
    const stamped = { ...next, updatedAt: this.now() };
    this.db.requests = this.db.requests.map((r) => (r.id === next.id ? stamped : r));
    return stamped;
  }

  item(r: ServiceRequest): RequestListItem {
    return toItem(this.db, r);
  }
}
