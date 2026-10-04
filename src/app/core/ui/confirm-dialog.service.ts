import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly danger?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private resolver: ((value: boolean) => void) | null = null;
  readonly request = signal<ConfirmRequest | null>(null);

  open(request: ConfirmRequest): Promise<boolean> {
    this.request.set(request);
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  close(result: boolean): void {
    this.request.set(null);
    this.resolver?.(result);
    this.resolver = null;
  }
}
