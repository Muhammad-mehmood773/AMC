import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Dialog } from '@shared/ui/dialog';
import { FormField } from '@shared/ui/form-field';
import { Select } from '@shared/ui/select';
import { of } from 'rxjs';
import { AssetApi } from '../data/asset.api';
import { TRANSACTION_BLOCKED_STATUSES } from '../data/asset.config';
import type { AssetListItem } from '../models/asset.model';

/** Lets the user choose an asset before starting an asset-level action from a global screen. */
@Component({
  selector: 'amc-asset-picker-dialog',
  imports: [Dialog, FormField, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog size="sm" [title]="title()" [description]="description()" [(open)]="open">
      <amc-form-field label="Asset" for="asset-picker" [required]="true" hint="Retired and decommissioned assets are excluded.">
        <amc-select inputId="asset-picker" placeholder="Search asset ID, name or tag…" [options]="options()" [(value)]="value" />
      </amc-form-field>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="open.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="!value()" (click)="choose()">Continue</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class AssetPickerDialog {
  private readonly api = inject(AssetApi);

  readonly open = model(false);
  readonly title = input('Select asset');
  readonly description = input('');
  readonly picked = output<AssetListItem>();

  protected readonly value = signal<string | number | null>(null);
  private readonly assets = rxResource({ params: () => (this.open() ? true : undefined), stream: ({ params }) => (params ? this.api.list() : of([])) });
  private readonly eligible = computed(() => (this.assets.hasValue() ? this.assets.value() : []).filter((a) => !TRANSACTION_BLOCKED_STATUSES.includes(a.status)));
  protected readonly options = computed(() => this.eligible().map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: `${a.tag} · ${a.siteName ?? a.customerName ?? ''}` })));

  protected choose(): void {
    const asset = this.eligible().find((a) => a.id === this.value());
    if (!asset) return;
    this.open.set(false);
    this.value.set(null);
    this.picked.emit(asset);
  }
}
