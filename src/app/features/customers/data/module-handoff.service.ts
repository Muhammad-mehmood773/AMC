import { Injectable, inject } from '@angular/core';
import { NotificationPort } from '@core/notification/notification.port';

export type HandoffAction =
  | 'Create Contract'
  | 'Create AMC'
  | 'Create Service Request'
  | 'Create Work Order'
  | 'Add Asset';

const TARGET_MODULE: Record<HandoffAction, string> = {
  'Create Contract': 'Contract Lifecycle Management',
  'Create AMC': 'AMC / Service Contract Management',
  'Create Service Request': 'Service Request Management',
  'Create Work Order': 'Work Order & Field Service',
  'Add Asset': 'Asset / Installed Base Management',
};

/**
 * Hand-off point for actions owned by downstream modules. Once those modules are delivered,
 * replace the notification with navigation to their create screens using the given context.
 */
@Injectable()
export class ModuleHandoff {
  private readonly notifications = inject(NotificationPort);

  open(action: HandoffAction, context: { customerName: string; siteName?: string }): void {
    const scope = context.siteName ? `${context.customerName} · ${context.siteName}` : context.customerName;
    this.notifications.info(
      `${action} for ${scope} continues in the ${TARGET_MODULE[action]} module.`,
      action,
    );
  }
}
