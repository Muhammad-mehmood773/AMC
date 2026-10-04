import { Injectable } from '@angular/core';

export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  readonly kind: NotificationKind;
  readonly message: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationPort {
  show(notification: AppNotification): void {
    void notification;
  }
}
