import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmDialogService } from '@core/ui/confirm-dialog.service';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return inject(ConfirmDialogService).open({
    title: 'Discard unsaved changes?',
    message: 'You have unsaved changes on this page. If you leave now, your changes will be lost.',
    confirmLabel: 'Discard changes',
    danger: true,
  });
};
