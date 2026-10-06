import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Tracks browser connectivity; `reconnected` is true briefly after coming back online. */
@Injectable({ providedIn: 'root' })
export class NetworkStore {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly reconnected = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (typeof window === 'undefined') return;
    const goOnline = () => {
      this.online.set(true);
      this.reconnected.set(true);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.reconnected.set(false), 3500);
    };
    const goOffline = () => {
      clearTimeout(this.timer);
      this.reconnected.set(false);
      this.online.set(false);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearTimeout(this.timer);
    });
  }
}
