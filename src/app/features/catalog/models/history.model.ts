/** SRS 4.13 — Service / Entitlement history. */

export const HISTORY_ENTITIES = ['Service', 'Entitlement', 'Category', 'Price Rule'] as const;
export type HistoryEntity = (typeof HISTORY_ENTITIES)[number];

export const SERVICE_EVENTS = [
  'Service Created',
  'Service Updated',
  'Price Changed',
  'Service Activated',
  'Service Deactivated',
  'SLA Changed',
  'Service Requirement Changed',
] as const;

export const ENTITLEMENT_EVENTS = [
  'Entitlement Created',
  'Entitlement Activated',
  'Entitlement Modified',
  'Coverage Changed',
  'Usage Updated',
  'Entitlement Suspended',
  'Entitlement Extended',
  'Entitlement Renewed',
  'Entitlement Expired',
  'Entitlement Cancelled',
] as const;

export const OTHER_EVENTS = ['Category Created', 'Category Updated', 'Category Activated', 'Category Deactivated', 'Price Rule Added', 'Price Rule Updated'] as const;

export const HISTORY_ACTIONS = [...SERVICE_EVENTS, ...ENTITLEMENT_EVENTS, ...OTHER_EVENTS] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

export interface HistoryEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly user: string;
  readonly action: HistoryAction;
  readonly entity: HistoryEntity;
  readonly entityId: string;
  readonly entityLabel: string;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly reference: string | null;
  readonly comments: string;
}

export interface HistoryFilter {
  readonly entity?: HistoryEntity;
  readonly entityId?: string;
}
