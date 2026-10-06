import { Injectable, signal } from '@angular/core';

export interface BulkFailure {
  readonly label: string;
  readonly message: string;
}

export interface BulkOperation {
  readonly title: string;
  readonly total: number;
  readonly done: number;
  readonly failures: readonly BulkFailure[];
  readonly status: 'running' | 'cancelling' | 'finished' | 'cancelled';
}

export interface BulkResult {
  readonly succeeded: number;
  readonly failed: number;
  readonly cancelled: boolean;
}

/** Runs a bulk operation item by item and exposes live progress for `BulkProgressHost`. */
@Injectable({ providedIn: 'root' })
export class BulkOperationService {
  readonly operation = signal<BulkOperation | null>(null);
  private cancelRequested = false;

  get running(): boolean {
    const status = this.operation()?.status;
    return status === 'running' || status === 'cancelling';
  }

  async run<T>(
    title: string,
    items: readonly T[],
    worker: (item: T) => Promise<unknown>,
    label: (item: T) => string,
  ): Promise<BulkResult> {
    this.cancelRequested = false;
    const failures: BulkFailure[] = [];
    let done = 0;
    const publish = (status: BulkOperation['status']) =>
      this.operation.set({ title, total: items.length, done, failures: [...failures], status });

    publish('running');
    for (const item of items) {
      if (this.cancelRequested) break;
      try {
        await worker(item);
      } catch (error) {
        failures.push({ label: label(item), message: (error as Error).message || 'Failed' });
      }
      done++;
      publish(this.cancelRequested ? 'cancelling' : 'running');
    }
    const cancelled = this.cancelRequested && done < items.length;
    publish(cancelled ? 'cancelled' : 'finished');
    return { succeeded: done - failures.length, failed: failures.length, cancelled };
  }

  cancel(): void {
    if (this.running) {
      this.cancelRequested = true;
      const current = this.operation();
      if (current) this.operation.set({ ...current, status: 'cancelling' });
    }
  }

  dismiss(): void {
    if (!this.running) this.operation.set(null);
  }
}
