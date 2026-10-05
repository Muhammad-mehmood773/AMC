const DATE = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const NUMBER = new Intl.NumberFormat('en-US');
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const DAY_MS = 86_400_000;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? DATE.format(date) : '';
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_TIME.format(date).replace(',', '') : '';
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? TIME.format(date) : '';
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : NUMBER.format(value);
}

export function formatCurrency(
  value: number | null | undefined,
  currency = 'SAR',
  compact = false,
): string {
  if (value === null || value === undefined) return '';
  return `${currency} ${compact ? COMPACT.format(value) : NUMBER.format(Math.round(value))}`;
}

export function daysBetween(from: string | Date, to: string | Date): number {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return 0;
  const start = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const end = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end - start) / DAY_MS);
}

export function relativeTime(value: string | Date | null | undefined, now = new Date()): string {
  const date = toDate(value);
  if (!date) return '';
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const future = seconds < 0;
  const abs = Math.abs(seconds);
  const units: [number, string][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [86400 * 30, 'day'],
    [86400 * 365, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  if (abs < 45) return 'just now';
  let divisor = 1;
  for (const [limit, unit] of units) {
    if (abs < limit) {
      const amount = Math.round(abs / divisor);
      const label = `${amount} ${unit}${amount === 1 ? '' : 's'}`;
      return future ? `in ${label}` : `${label} ago`;
    }
    divisor = limit;
  }
  return formatDate(date);
}

export function fullName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(' ');
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
