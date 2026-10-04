import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingStore {
  private readonly pendingCount = signal(0);

  readonly isLoading = computed(() => this.pendingCount() > 0);

  begin(): void {
    this.pendingCount.update((count) => count + 1);
  }

  end(): void {
    this.pendingCount.update((count) => Math.max(0, count - 1));
  }
}
