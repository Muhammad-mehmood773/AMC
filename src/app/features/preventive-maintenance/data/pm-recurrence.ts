import type { MaintenancePlan } from '../models/plan.model';
import { PM_RULES } from './pm.config';

const DAY = 86_400_000;

export const isoDay = (d: Date | number) => new Date(d).toISOString().slice(0, 10);
export const today = () => isoDay(Date.now());

export function addDays(date: string, days: number): string {
  return isoDay(new Date(`${date}T00:00:00Z`).getTime() + days * DAY);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return isoDay(d);
}

export const daysBetweenIso = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY);

export function isNonWorking(date: string, holidays: readonly string[]): boolean {
  return PM_RULES.nonWorkingDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) || holidays.includes(date);
}

/** Holiday / weekend adjustment (SRS 8.6 G, 8.9). */
export function adjust(date: string, handling: string, holidays: readonly string[]): string {
  if (handling === 'Keep date') return date;
  const step = handling === 'Move to previous working day' ? -1 : 1;
  let d = date;
  for (let i = 0; i < 10 && isNonWorking(d, holidays); i++) d = addDays(d, step);
  return d;
}

/** Interval of a time-based frequency as [amount, 'd' | 'm']. */
export function interval(type: string, value: number, unit: string): [number, 'd' | 'm'] | null {
  switch (type) {
    case 'Daily':
      return [1, 'd'];
    case 'Weekly':
      return [7, 'd'];
    case 'Bi-Weekly':
      return [14, 'd'];
    case 'Monthly':
      return [1, 'm'];
    case 'Bi-Monthly':
      return [2, 'm'];
    case 'Quarterly':
      return [3, 'm'];
    case 'Semi-Annual':
      return [6, 'm'];
    case 'Annual':
      return [12, 'm'];
    case 'Custom':
      if (!(value > 0)) return null;
      return unit === 'Days' ? [value, 'd'] : unit === 'Weeks' ? [value * 7, 'd'] : unit === 'Months' ? [value, 'm'] : unit === 'Years' ? [value * 12, 'm'] : null;
    default:
      return null;
  }
}

/** Applies a calendar rule to the month of `date` (SRS 8.2 calendar-based maintenance). */
function applyCalendarRule(date: string, p: MaintenancePlan['frequency']): string {
  const d = new Date(`${date}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  switch (p.calendarRule) {
    case 'Specific Day of Month':
      return isoDay(Date.UTC(y, m, Math.min(p.dayOfMonth ?? 1, last)));
    case 'End of Month':
      return isoDay(Date.UTC(y, m, last));
    case 'Start of Month':
      return isoDay(Date.UTC(y, m, 1));
    case 'Specific Week of Month': {
      const dow = p.dayOfWeek ?? 0;
      const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
      const day = 1 + ((dow - first + 7) % 7) + 7 * ((p.weekOfMonth ?? 1) - 1);
      return isoDay(Date.UTC(y, m, Math.min(day, last)));
    }
    case 'Specific Day of Week': {
      const dow = p.dayOfWeek ?? 0;
      return addDays(date, (dow - d.getUTCDay() + 7) % 7);
    }
    case 'Fixed Date':
    case 'Financial Year':
      return isoDay(Date.UTC(y, (p.month ?? 1) - 1, Math.min(p.dayOfMonth ?? 1, new Date(Date.UTC(y, p.month ?? 1, 0)).getUTCDate())));
    default:
      return date;
  }
}

export interface PlannedDate {
  /** Rule date — used for de-duplication and as the original planned date. */
  readonly ruleDate: string;
  /** Holiday / weekend adjusted date. */
  readonly scheduledDate: string;
}

/** Valid recurrence rule? (SRS 8.25) */
export function recurrenceError(p: MaintenancePlan): string | null {
  const f = p.frequency;
  if (!f.startDate) return 'A start date is required.';
  if (f.endDate && f.endDate < f.startDate) return 'The end date must be after the start date.';
  if (p.strategy.strategy === 'Time-Based' && !interval(f.type, f.value, f.unit)) return 'Select a valid time-based frequency (custom intervals need a value and a day / week / month / year unit).';
  if (p.strategy.strategy === 'Calendar-Based') {
    if (f.calendarRule === 'None') return 'Select a calendar rule.';
    if (['Specific Day of Month', 'Fixed Date', 'Financial Year'].includes(f.calendarRule) && !(f.dayOfMonth && f.dayOfMonth >= 1 && f.dayOfMonth <= 31)) return 'Enter a valid day of the month.';
    if (['Fixed Date', 'Financial Year'].includes(f.calendarRule) && !(f.month && f.month >= 1 && f.month <= 12)) return 'Enter a valid month.';
    if (['Specific Week of Month', 'Specific Day of Week'].includes(f.calendarRule) && (f.dayOfWeek === null || f.dayOfWeek < 0 || f.dayOfWeek > 6)) return 'Select the day of the week.';
  }
  if ((p.strategy.strategy === 'Meter-Based' || p.strategy.strategy === 'Event-Based') && !(f.value > 0)) return 'Enter the maintenance interval.';
  return null;
}

/** Next occurrences of a time- or calendar-based plan between `from` and `to` (inclusive). */
export function planDates(p: MaintenancePlan, from: string, to: string, holidays: readonly string[]): PlannedDate[] {
  const f = p.frequency;
  const end = [to, f.endDate ?? '9999-12-31'].sort()[0];
  const out: PlannedDate[] = [];
  const push = (ruleDate: string) => {
    if (ruleDate < from || ruleDate > end || ruleDate < f.startDate) return;
    if (!out.some((x) => x.ruleDate === ruleDate)) out.push({ ruleDate, scheduledDate: adjust(ruleDate, p.scheduling.holidayHandling, holidays) });
  };
  if (p.strategy.strategy === 'Time-Based') {
    const iv = interval(f.type, f.value, f.unit);
    if (!iv) return [];
    for (let i = 0, d = f.startDate; d <= end && i < 2000; i++, d = iv[1] === 'd' ? addDays(f.startDate, iv[0] * i) : addMonths(f.startDate, iv[0] * i)) push(d);
  } else if (p.strategy.strategy === 'Calendar-Based') {
    if (f.calendarRule === 'Specific Day of Week') {
      const step = f.type === 'Bi-Weekly' ? 14 : 7;
      for (let i = 0, d = applyCalendarRule(f.startDate, f); d <= end && i < 600; i++, d = addDays(applyCalendarRule(f.startDate, f), step * i)) push(d);
    } else if (f.calendarRule === 'Fixed Date' || f.calendarRule === 'Financial Year') {
      for (let y = new Date(f.startDate).getUTCFullYear(); y <= new Date(end).getUTCFullYear(); y++) push(applyCalendarRule(`${y}-01-01`, f));
    } else {
      const iv = interval(f.type, f.value, f.unit);
      const months = iv && iv[1] === 'm' ? iv[0] : 1;
      for (let i = 0; i < 400; i++) {
        const monthStart = addMonths(`${f.startDate.slice(0, 7)}-01`, months * i);
        if (monthStart > end) break;
        push(applyCalendarRule(monthStart, f));
      }
    }
  }
  return out.sort((a, b) => a.ruleDate.localeCompare(b.ruleDate));
}

export function frequencyLabel(p: MaintenancePlan): string {
  const f = p.frequency;
  switch (p.strategy.strategy) {
    case 'Time-Based':
      return f.type === 'Custom' ? `Every ${f.value} ${f.unit.toLowerCase()}` : f.type;
    case 'Calendar-Based': {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const nth = ['1st', '2nd', '3rd', '4th', '5th'];
      if (f.calendarRule === 'Specific Day of Month') return `${f.type === 'Monthly' ? 'Monthly' : f.type} on day ${f.dayOfMonth}`;
      if (f.calendarRule === 'Specific Week of Month') return `${nth[(f.weekOfMonth ?? 1) - 1]} ${days[f.dayOfWeek ?? 0]} of the month`;
      if (f.calendarRule === 'Specific Day of Week') return `${f.type === 'Bi-Weekly' ? 'Every other' : 'Every'} ${days[f.dayOfWeek ?? 0]}`;
      if (f.calendarRule === 'Fixed Date' || f.calendarRule === 'Financial Year') return `${f.calendarRule}: ${String(f.dayOfMonth).padStart(2, '0')}/${String(f.month).padStart(2, '0')} yearly`;
      return f.calendarRule;
    }
    case 'Meter-Based':
      return `Every ${f.value.toLocaleString('en-US')} ${f.unit.toLowerCase()}`;
    case 'Condition-Based':
      return 'On condition trigger';
    default:
      return `${p.maintenanceType} + ${f.value} ${f.unit.toLowerCase()}`;
  }
}
