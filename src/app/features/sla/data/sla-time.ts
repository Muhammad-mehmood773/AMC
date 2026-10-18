import type { ClockPause, Holiday, SlaCalendar } from '../models/operations.model';
import { TZ_OFFSET } from './sla.config';

const MIN = 60_000;
const DAY = 86_400_000;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

const is247 = (c: SlaCalendar) => c.type === '24x7' || c.days.every((d) => d.working && d.start === '00:00' && (d.end === '24:00' || d.end === '23:59'));

/** Working intervals (UTC ms) of one local calendar day. */
function dayIntervals(cal: SlaCalendar, holidays: readonly Holiday[], localDayStartUtc: number): [number, number][] {
  const offset = (TZ_OFFSET[cal.timeZone] ?? 0) * MIN;
  const local = new Date(localDayStartUtc + offset);
  const iso = local.toISOString().slice(0, 10);
  const day = cal.days[local.getUTCDay()];
  if (!day?.working) return [];
  if (holidays.some((h) => h.date === iso && !h.working && (h.calendar === cal.holidayCalendar || h.calendar === 'All'))) return [];
  const s = localDayStartUtc + toMinutes(day.start) * MIN;
  const e = localDayStartUtc + Math.min(1440, toMinutes(day.end)) * MIN;
  if (cal.breakStart && cal.breakEnd) {
    const bs = localDayStartUtc + toMinutes(cal.breakStart) * MIN;
    const be = localDayStartUtc + toMinutes(cal.breakEnd) * MIN;
    if (bs > s && be < e) return [[s, bs], [be, e]];
  }
  return [[s, e]];
}

/** Start (UTC ms) of the local calendar day containing `t`. */
function localDayStart(cal: SlaCalendar, t: number): number {
  const offset = (TZ_OFFSET[cal.timeZone] ?? 0) * MIN;
  return Math.floor((t + offset) / DAY) * DAY - offset;
}

/** Business minutes between two instants according to the SLA calendar (SRS 7.20). */
export function businessMinutes(cal: SlaCalendar, holidays: readonly Holiday[], from: string | number, to: string | number): number {
  const a = typeof from === 'number' ? from : new Date(from).getTime();
  const b = typeof to === 'number' ? to : new Date(to).getTime();
  if (b <= a) return 0;
  if (is247(cal)) return (b - a) / MIN;
  let total = 0;
  for (let d = localDayStart(cal, a), i = 0; d < b && i < 800; d += DAY, i++) {
    for (const [s, e] of dayIntervals(cal, holidays, d)) {
      const lo = Math.max(s, a);
      const hi = Math.min(e, b);
      if (hi > lo) total += (hi - lo) / MIN;
    }
  }
  return total;
}

/** Instant at which `minutes` business minutes have elapsed after `from`. */
export function addBusinessMinutes(cal: SlaCalendar, holidays: readonly Holiday[], from: string | number, minutes: number): number {
  const a = typeof from === 'number' ? from : new Date(from).getTime();
  if (is247(cal)) return a + minutes * MIN;
  let left = minutes;
  for (let d = localDayStart(cal, a), i = 0; i < 800; d += DAY, i++) {
    for (const [s, e] of dayIntervals(cal, holidays, d)) {
      const lo = Math.max(s, a);
      if (e <= lo) continue;
      const span = (e - lo) / MIN;
      if (span >= left) return lo + left * MIN;
      left -= span;
    }
  }
  return a + minutes * MIN;
}

/** Elapsed business minutes with approved pause periods excluded. */
export function elapsedMinutes(cal: SlaCalendar, holidays: readonly Holiday[], startedAt: string, stoppedAt: string | null, pauses: readonly ClockPause[], now = Date.now()): { elapsed: number; paused: number } {
  const end = stoppedAt ? new Date(stoppedAt).getTime() : now;
  const gross = businessMinutes(cal, holidays, startedAt, end);
  const paused = pauses.reduce((s, p) => s + businessMinutes(cal, holidays, p.startedAt, p.endedAt ? Math.min(new Date(p.endedAt).getTime(), end) : end), 0);
  return { elapsed: Math.max(0, gross - paused), paused };
}
