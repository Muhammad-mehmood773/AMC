import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { NotificationPort } from '@core/notification/notification.port';
import type { ImportCommitResult, ImportConfig } from '@shared/models/import';
import { Icon } from '@shared/ui/icon';
import { ImportDialog } from '@shared/ui/import-dialog';
import { Spinner } from '@shared/ui/spinner';
import { CustomerSiteImports, type ImportEntity } from '../data/import.service';

/** "Import" toolbar action that opens the import wizard for the given entity. */
@Component({
  selector: 'amc-import-button',
  imports: [Icon, ImportDialog, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <button type="button" class="amc-btn-secondary" [disabled]="loading()" (click)="start()">
      @if (loading()) {
        <amc-spinner [size]="14" />
      } @else {
        <amc-icon name="upload" />
      }
      <span class="hidden sm:inline">Import</span>
    </button>
    <amc-import-dialog [config]="config()" [(open)]="open" (imported)="onImported($event)" />
  `,
})
export class ImportButton {
  private readonly imports = inject(CustomerSiteImports);
  private readonly notify = inject(NotificationPort);

  readonly entity = input.required<ImportEntity>();
  readonly imported = output<ImportCommitResult>();

  protected readonly config = signal<ImportConfig | null>(null);
  protected readonly open = signal(false);
  protected readonly loading = signal(false);

  protected async start(): Promise<void> {
    this.loading.set(true);
    try {
      this.config.set(await this.imports.config(this.entity()));
      this.open.set(true);
    } catch (error) {
      this.notify.error((error as Error).message, 'Import unavailable');
    } finally {
      this.loading.set(false);
    }
  }

  protected onImported(result: ImportCommitResult): void {
    if (result.created) {
      this.notify.success(`${result.created} ${this.entity()} imported.`, 'Import complete');
    }
    this.imported.emit(result);
  }
}
