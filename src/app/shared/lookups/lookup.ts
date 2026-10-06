import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

/*
 * Generic, application-wide lookup (reference value) mechanism. Every user-maintainable list is
 * stored as rows of one generic structure — LookupType + Id + Name + Status — so the backend can
 * serve all lists from a single table / endpoint.
 */

export type LookupStatus = 'Active' | 'Inactive';

export interface LookupValue {
  readonly id: string;
  /** Lookup type key, e.g. "customer-type". */
  readonly type: string;
  readonly name: string;
  readonly status: LookupStatus;
  /** Seeded value that business rules depend on; cannot be renamed. */
  readonly isSystem: boolean;
  readonly sortOrder: number;
}

/** Field-level configuration that decides whether inline Add / Edit is offered. */
export interface LookupTypeDefinition {
  readonly key: string;
  /** Singular display label, e.g. "Customer Type". */
  readonly label: string;
  readonly description?: string;
  /** When true, forms show inline Add (+) and Edit actions beside the field. */
  readonly editable: boolean;
  readonly maxLength?: number;
}

/** Lookup types registered by the active feature(s). */
export const LOOKUP_TYPES = new InjectionToken<readonly LookupTypeDefinition[]>('LOOKUP_TYPES');

export abstract class LookupValuesApi {
  /** All values for the given types (all types when omitted). */
  abstract list(types?: readonly string[]): Observable<LookupValue[]>;
  abstract create(type: string, name: string): Observable<LookupValue>;
  abstract update(id: string, changes: { readonly name?: string; readonly status?: LookupStatus }): Observable<LookupValue>;
}
