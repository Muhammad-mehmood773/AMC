import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
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

export interface HandoffContext {
  readonly customerName: string;
  readonly siteName?: string;
  readonly customerId?: string;
  readonly siteId?: string;
}

/**
 * Hand-off point for actions owned by downstream modules. Delivered modules (Asset / Installed
 * Base) are opened directly with the given context; the others notify until they are delivered.
 */
@Injectable()
export class ModuleHandoff {
  private readonly notifications = inject(NotificationPort);
  private readonly router = inject(Router);

  open(action: HandoffAction, context: HandoffContext): void {
    if (action === 'Add Asset') {
      void this.router.navigate(['/app/assets/new'], { queryParams: { customerId: context.customerId ?? null, siteId: context.siteId ?? null } });
      return;
    }
    if (action === 'Create Contract') {
      void this.router.navigate(['/app/contracts/new'], { queryParams: { customerId: context.customerId ?? null, siteId: context.siteId ?? null } });
      return;
    }
    const scope = context.siteName ? `${context.customerName} · ${context.siteName}` : context.customerName;
    this.notifications.info(
      `${action} for ${scope} continues in the ${TARGET_MODULE[action]} module.`,
      action,
    );
  }
}
