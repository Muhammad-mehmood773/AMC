import { Injectable, signal } from '@angular/core';

export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  readonly kind: NotificationKind;
  readonly message: string;
  readonly title?: string;
  readonly durationMs?: number;
}

export interface ActiveNotification extends AppNotification {
  readonly id: number;
}

const DEFAULT_DURATION_MS = 4500;
const MAX_VISIBLE = 4;

@Injectable({ providedIn: 'root' })
export class NotificationPort {
  private sequence = 0;
  private readonly items = signal<readonly ActiveNotification[]>([]);

  readonly notifications = this.items.asReadonly();

  show(notification: AppNotification): void {
    const id = ++this.sequence;
    this.items.update((list) => [...list, { ...notification, id }].slice(-MAX_VISIBLE));
    const duration = notification.durationMs ?? DEFAULT_DURATION_MS;
    if (duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => this.dismiss(id), duration);
    }
  }

  success(message: string, title?: string): void {
    this.show({ kind: 'success', message, title });
  }

  info(message: string, title?: string): void {
    this.show({ kind: 'info', message, title });
  }

  warning(message: string, title?: string): void {
    this.show({ kind: 'warning', message, title });
  }

  error(message: string, title?: string): void {
    this.show({ kind: 'error', message, title });
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((item) => item.id !== id));
  }
}
