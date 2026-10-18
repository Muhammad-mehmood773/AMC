import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import type { EntitlementCheck } from '../models/coverage.model';

export type AssetHandoffAction = 'Create Service Request' | 'Create Work Order' | 'Schedule Maintenance';

const TARGET_MODULE: Record<AssetHandoffAction, string> = {
  'Create Service Request': 'Service Request Management',
  'Create Work Order': 'Work Order & Field Service',
  'Schedule Maintenance': 'Preventive Maintenance',
};

/** Asset context passed to downstream modules. */
export interface AssetHandoffContext {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly customerName: string | null;
  readonly siteName: string | null;
}

export interface AssetHandoffRequest {
  readonly action: AssetHandoffAction;
  readonly asset: AssetHandoffContext;
}

/**
 * Hand-off point for service transactions owned by downstream modules. Before handing off,
 * the asset's active entitlement is evaluated (SRS 3.11) by the service-action dialog hosted in
 * the feature shell. Once those modules are delivered, replace the notification with navigation
 * to their create screens using the given context and entitlement result.
 */
@Injectable()
export class AssetHandoff {
  private readonly notifications = inject(NotificationPort);
  private readonly router = inject(Router);

  /** Pending request shown in the entitlement-check dialog. */
  readonly request = signal<AssetHandoffRequest | null>(null);

  open(action: AssetHandoffAction, asset: AssetHandoffContext): void {
    this.request.set({ action, asset });
  }

  /** Called by the dialog once the entitlement has been reviewed. */
  complete(request: AssetHandoffRequest, check: EntitlementCheck | null): void {
    this.request.set(null);
    if (request.action === 'Create Service Request') {
      void this.router.navigate(['/app/service-requests/new'], { queryParams: { asset: request.asset.id } });
      return;
    }
    const scope = [request.asset.code, request.asset.name, request.asset.siteName].filter(Boolean).join(' · ');
    const coverage = !check
      ? ''
      : check.covered
        ? ` Covered by ${check.coverage?.agreementNumber ?? check.warrantyReference ?? 'warranty'}.`
        : ' Not covered — chargeable service.';
    this.notifications.info(`${request.action} for ${scope} continues in the ${TARGET_MODULE[request.action]} module.${coverage}`, request.action);
  }
}
