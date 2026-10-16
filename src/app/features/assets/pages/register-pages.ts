import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { AssetDocumentManager } from '../components/asset-document-manager';
import { EntitlementView } from '../components/entitlement-view';
import { InstallationManager } from '../components/installation-manager';
import { LifecycleTimeline } from '../components/lifecycle-timeline';
import { ServiceHistoryView } from '../components/service-history-view';
import { TransferManager } from '../components/transfer-manager';
import { WarrantyManager } from '../components/warranty-manager';

/*
 * Installed-base wide screens of SRS 3.8 – 3.14. Each page wraps the reusable feature component
 * that is also embedded (scoped to one asset) in Asset 360.
 */

const crumbs = (label: string) => [{ label: 'Assets & Installed Base', path: '/app/assets/dashboard' }, { label }];

@Component({
  selector: 'amc-installations-page',
  imports: [InstallationManager, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Asset Installation / Commissioning" subtitle="Install assets at customer sites, run the commissioning checklist and capture customer confirmation." [breadcrumbs]="breadcrumbs" />
      <amc-installation-manager [scheduleFor]="assetId() ?? null" />
    </div>
  `,
})
export class InstallationsPage {
  /** `?assetId=` opens the schedule dialog for that asset (e.g. "Save & Install"). */
  readonly assetId = input<string>();
  protected readonly breadcrumbs = crumbs('Installations');
}

@Component({
  selector: 'amc-transfers-page',
  imports: [PageHeader, TransferManager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Asset Transfer / Relocation" subtitle="Transfer request → approval → asset movement → new location assignment → asset history update." [breadcrumbs]="breadcrumbs" />
      <amc-transfer-manager [requestFor]="assetId() ?? null" />
    </div>
  `,
})
export class TransfersPage {
  readonly assetId = input<string>();
  protected readonly breadcrumbs = crumbs('Transfers');
}

@Component({
  selector: 'amc-warranties-page',
  imports: [PageHeader, WarrantyManager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Asset Warranty Management" subtitle="Warranty coverage, expiry tracking, claims, warranty-covered services and warranty documents." [breadcrumbs]="breadcrumbs" />
      <amc-warranty-manager />
    </div>
  `,
})
export class WarrantiesPage {
  protected readonly breadcrumbs = crumbs('Warranties');
}

@Component({
  selector: 'amc-entitlements-page',
  imports: [EntitlementView, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Asset Contract / Entitlement View" subtitle="Commercial and service entitlements of assets — coverage, SLA response and resolution, parts, labor and visit coverage." [breadcrumbs]="breadcrumbs" />
      <amc-entitlement-view />
    </div>
  `,
})
export class EntitlementsPage {
  protected readonly breadcrumbs = crumbs('Entitlements');
}

@Component({
  selector: 'amc-asset-documents-page',
  imports: [AssetDocumentManager, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Asset Documents" subtitle="Purchase, warranty, installation, technical, compliance, calibration and service documents with versioning and expiry tracking." [breadcrumbs]="breadcrumbs" />
      <amc-asset-document-manager />
    </div>
  `,
})
export class AssetDocumentsPage {
  protected readonly breadcrumbs = crumbs('Documents');
}

@Component({
  selector: 'amc-service-history-page',
  imports: [PageHeader, ServiceHistoryView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Asset Service History" subtitle="Chronological record of all services performed — technicians, parts consumption, failures, maintenance and costs." [breadcrumbs]="breadcrumbs" />
      <amc-service-history-view />
    </div>
  `,
})
export class ServiceHistoryPage {
  protected readonly breadcrumbs = crumbs('Service History');
}

@Component({
  selector: 'amc-lifecycle-history-page',
  imports: [Icon, LifecycleTimeline, PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Asset Lifecycle History" subtitle="Major events across each asset's lifecycle — creation, installation, warranty, contracts, components, transfers and retirement." [breadcrumbs]="breadcrumbs">
        <a routerLink="/app/assets/list" class="amc-btn-secondary"><amc-icon name="box" /> View Assets</a>
      </amc-page-header>
      <amc-lifecycle-timeline />
    </div>
  `,
})
export class LifecycleHistoryPage {
  protected readonly breadcrumbs = crumbs('Lifecycle History');
}
