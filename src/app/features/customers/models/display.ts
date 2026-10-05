import type { BadgeTone } from '@shared/ui/status-badge';
import type { ContactStatus } from './contact.model';
import type { AgreementState, CustomerStatus, ServicePriority } from './customer.model';
import type { DocumentStatus } from './document.model';
import type { ActivityAction } from './activity.model';
import type { SiteStatus } from './site.model';
import type { IconName } from '@shared/ui/icon';

/** Status → badge tone mappings shared by all screens in the feature. */

export const CUSTOMER_STATUS_TONE: Record<CustomerStatus, BadgeTone> = {
  Active: 'ok',
  'On Hold': 'warn',
  Inactive: 'neutral',
  Archived: 'neutral',
};

export const SITE_STATUS_TONE: Record<SiteStatus, BadgeTone> = {
  Planned: 'info',
  Active: 'ok',
  'Temporarily Closed': 'warn',
  Inactive: 'neutral',
  Archived: 'neutral',
};

export const CONTACT_STATUS_TONE: Record<ContactStatus, BadgeTone> = {
  Active: 'ok',
  Inactive: 'neutral',
};

export const AGREEMENT_STATE_TONE: Record<AgreementState, BadgeTone> = {
  Active: 'ok',
  Expiring: 'warn',
  Expired: 'danger',
  None: 'neutral',
};

export const DOCUMENT_STATUS_TONE: Record<DocumentStatus, BadgeTone> = {
  Valid: 'ok',
  'Expiring Soon': 'warn',
  Expired: 'danger',
  'Renewal In Progress': 'info',
  'No Expiry': 'neutral',
  Archived: 'neutral',
};

export const PRIORITY_TONE: Record<ServicePriority, BadgeTone> = {
  Critical: 'danger',
  High: 'warn',
  Medium: 'info',
  Low: 'neutral',
};

/** Generic tone resolver for statuses of related (downstream) records. */
export function recordTone(status: string): BadgeTone {
  switch (status) {
    case 'Active':
    case 'In Service':
    case 'Completed':
    case 'Resolved':
    case 'Paid':
    case 'Closed':
      return 'ok';
    case 'Expiring':
    case 'Under Maintenance':
    case 'On Hold':
    case 'Partially Paid':
    case 'Due':
    case 'Follow-up Required':
      return 'warn';
    case 'Expired':
    case 'Out of Service':
    case 'Overdue':
    case 'Critical':
    case 'Terminated':
      return 'danger';
    case 'New':
    case 'Assigned':
    case 'In Progress':
    case 'Scheduled':
    case 'Issued':
    case 'High':
      return 'info';
    case 'Draft':
      return 'accent';
    default:
      return 'neutral';
  }
}

export const ACTIVITY_ICON: Record<ActivityAction, IconName> = {
  'Customer Created': 'building',
  'Customer Updated': 'pencil',
  'Contact Added': 'user-plus',
  'Contact Updated': 'user-check',
  'Site Added': 'map-pin',
  'Site Updated': 'map-pin',
  'Asset Added': 'box',
  'Contract Created': 'file-check',
  'AMC Created': 'shield-check',
  'Service Request Created': 'ticket',
  'Work Order Created': 'wrench',
  'Invoice Generated': 'receipt',
  'Payment Recorded': 'wallet',
  'Document Uploaded': 'upload',
  'Document Updated': 'file-up',
  'Status Changed': 'refresh',
};

export const ACTIVITY_TONE: Record<ActivityAction, BadgeTone> = {
  'Customer Created': 'brand',
  'Customer Updated': 'neutral',
  'Contact Added': 'info',
  'Contact Updated': 'neutral',
  'Site Added': 'brand',
  'Site Updated': 'neutral',
  'Asset Added': 'accent',
  'Contract Created': 'ok',
  'AMC Created': 'ok',
  'Service Request Created': 'warn',
  'Work Order Created': 'info',
  'Invoice Generated': 'accent',
  'Payment Recorded': 'ok',
  'Document Uploaded': 'info',
  'Document Updated': 'info',
  'Status Changed': 'warn',
};
