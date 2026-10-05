import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';
import { Dialog } from './dialog';
import { Icon } from './icon';

/** Renders requests from `ConfirmDialogService`. Mount once at application level. */
@Component({
  selector: 'amc-confirm-dialog-host',
  imports: [Dialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog
      size="sm"
      [title]="request()?.title ?? ''"
      [open]="isOpen()"
      (openChange)="!$event && confirm.close(false)"
    >
      <div class="flex gap-4">
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          [class]="request()?.danger ? 'bg-danger-subtle text-danger' : 'bg-brand-subtle text-brand'"
        >
          <amc-icon [name]="request()?.danger ? 'alert-triangle' : 'info'" [size]="18" />
        </span>
        <p class="pt-2 text-sm leading-relaxed text-ink-muted">{{ request()?.message }}</p>
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="confirm.close(false)">
          Cancel
        </button>
        <button
          type="button"
          [class]="request()?.danger ? 'amc-btn-danger' : 'amc-btn-primary'"
          (click)="confirm.close(true)"
        >
          {{ request()?.confirmLabel ?? 'Confirm' }}
        </button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ConfirmDialogHost {
  protected readonly confirm = inject(ConfirmDialogService);
  protected readonly request = this.confirm.request;
  protected readonly isOpen = computed(() => this.request() !== null);
}
