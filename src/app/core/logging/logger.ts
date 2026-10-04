import { Injectable, inject } from '@angular/core';
import { APP_ENVIRONMENT } from '@core/config/app-environment.token';

@Injectable({ providedIn: 'root' })
export class Logger {
  private readonly environment = inject(APP_ENVIRONMENT);

  debug(message: string, context?: Readonly<Record<string, unknown>>): void {
    if (!this.environment.production) {
      console.debug(message, context);
    }
  }

  info(message: string, context?: Readonly<Record<string, unknown>>): void {
    console.info(message, context);
  }

  warn(message: string, context?: Readonly<Record<string, unknown>>): void {
    console.warn(message, context);
  }

  error(message: string, context?: Readonly<Record<string, unknown>>): void {
    console.error(message, context);
  }
}
