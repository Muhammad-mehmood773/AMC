import { type Observable, delay, of, throwError, timer, switchMap } from 'rxjs';

const DAY_MS = 86_400_000;

/** Deterministic PRNG (mulberry32) so seeded data is stable between reloads. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Random {
  readonly next: () => number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  digits(length: number): string;
}

export function random(seed: number): Random {
  const next = createRng(seed);
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability,
    digits: (length) =>
      Array.from({ length }, () => Math.floor(next() * 10)).join(''),
  };
}

/** ISO timestamp offset from now by a (possibly fractional) number of days. */
export function daysFromNow(days: number, hour?: number): string {
  const date = new Date(Date.now() + days * DAY_MS);
  if (hour !== undefined) {
    date.setHours(hour, (Math.abs(days * 997) | 0) % 60, 0, 0);
  }
  return date.toISOString();
}

/** Date-only (yyyy-MM-dd) value offset from today. */
export function dateFromNow(days: number): string {
  return daysFromNow(days).slice(0, 10);
}

export function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Simulates network latency and returns a detached copy of the payload. */
export function respond<T>(value: T, latencyMs = 280): Observable<T> {
  return of(clone(value)).pipe(delay(latencyMs));
}

export function fail(message: string, latencyMs = 280): Observable<never> {
  return timer(latencyMs).pipe(switchMap(() => throwError(() => new Error(message))));
}

let sequence = 0;
export function uid(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}${pad(sequence, 3)}`;
}
