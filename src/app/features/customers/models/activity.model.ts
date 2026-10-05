export const ACTIVITY_ACTIONS = [
  'Customer Created',
  'Customer Updated',
  'Contact Added',
  'Contact Updated',
  'Site Added',
  'Site Updated',
  'Asset Added',
  'Contract Created',
  'AMC Created',
  'Service Request Created',
  'Work Order Created',
  'Invoice Generated',
  'Payment Recorded',
  'Document Uploaded',
  'Document Updated',
  'Status Changed',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const ACTIVITY_ENTITIES = [
  'Customer',
  'Contact',
  'Site',
  'Asset',
  'Contract',
  'AMC',
  'Service Request',
  'Work Order',
  'Invoice',
  'Payment',
  'Document',
] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

export interface ActivityEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly userId: string;
  readonly userName: string;
  readonly action: ActivityAction;
  readonly entity: ActivityEntity;
  readonly entityId: string;
  readonly customerId: string;
  readonly siteId: string | null;
  readonly field: string | null;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly reference: string | null;
  readonly description: string;
}

export interface ActivityListItem extends ActivityEntry {
  readonly customerName: string;
  readonly siteName: string | null;
}

export interface ActivityFilter {
  readonly customerId?: string;
  readonly siteId?: string;
}
