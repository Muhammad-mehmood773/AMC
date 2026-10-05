import type { ImportColumn, ImportConfig, ImportRow } from '@shared/models/import';
import { excelSerialToIso } from './spreadsheet';

export interface ValidatedRow {
  /** 1-based row number in the source file (header = row 1). */
  readonly row: number;
  readonly values: ImportRow;
  readonly errors: Readonly<Record<string, string>>;
  readonly valid: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

const normalizeHeader = (value: string) => value.toLowerCase().replace(/\*|\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

/** Suggests a target column for each source header (exact label, key or alias match). */
export function autoMap(headers: readonly string[], columns: readonly ImportColumn[]): (string | null)[] {
  const used = new Set<string>();
  return headers.map((header) => {
    const h = normalizeHeader(header);
    const match = columns.find(
      (c) =>
        !used.has(c.key) &&
        [c.label, c.key, ...(c.aliases ?? [])].some((candidate) => normalizeHeader(candidate) === h),
    );
    if (match) used.add(match.key);
    return match?.key ?? null;
  });
}

function normalizeDate(value: string): string | null {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  if (/^\d{5}(\.\d+)?$/.test(v)) return excelSerialToIso(Number(v));
  return null;
}

function normalizeCell(column: ImportColumn, raw: string): { value: string; error: string | null } {
  const value = raw.trim();
  if (!value) {
    return { value: '', error: column.required ? `${column.label} is required` : null };
  }
  if (column.options) {
    const match = column.options.find((o) => o.toLowerCase() === value.toLowerCase());
    if (!match) return { value, error: `${column.label} must be one of: ${column.options.join(', ')}` };
    return { value: match, error: null };
  }
  switch (column.type) {
    case 'email':
      return { value: value.toLowerCase(), error: EMAIL.test(value) ? null : 'Invalid email address' };
    case 'phone':
      return { value, error: PHONE.test(value) ? null : 'Invalid phone number' };
    case 'date': {
      const iso = normalizeDate(value);
      return iso ? { value: iso, error: null } : { value, error: 'Use date format YYYY-MM-DD' };
    }
    case 'number': {
      const n = Number(value.replace(/,/g, ''));
      return Number.isFinite(n) ? { value: String(n), error: null } : { value, error: 'Must be a number' };
    }
    case 'boolean': {
      const v = value.toLowerCase();
      if (['yes', 'y', 'true', '1'].includes(v)) return { value: 'Yes', error: null };
      if (['no', 'n', 'false', '0'].includes(v)) return { value: 'No', error: null };
      return { value, error: 'Use Yes or No' };
    }
    default:
      return { value, error: null };
  }
}

/** Applies the column mapping, normalises values and validates every data row. */
export function validateRows(
  config: ImportConfig,
  dataRows: readonly (readonly string[])[],
  mapping: readonly (string | null)[],
): ValidatedRow[] {
  const seen = new Map<string, Set<string>>();
  return dataRows.map((cells, index) => {
    const raw: Record<string, string> = {};
    mapping.forEach((key, col) => {
      if (key) raw[key] = cells[col] ?? '';
    });
    const values: Record<string, string> = {};
    const errors: Record<string, string> = {};
    for (const column of config.columns) {
      const { value, error } = normalizeCell(column, raw[column.key] ?? '');
      values[column.key] = value;
      if (error) errors[column.key] = error;
    }
    for (const column of config.columns) {
      const value = values[column.key];
      if (errors[column.key] || !value) continue;
      if (column.unique) {
        const set = seen.get(column.key) ?? new Set<string>();
        if (set.has(value.toLowerCase())) errors[column.key] = `Duplicate ${column.label} in file`;
        set.add(value.toLowerCase());
        seen.set(column.key, set);
      }
      const custom = !errors[column.key] && column.validate?.(value, values);
      if (custom) errors[column.key] = custom;
    }
    return { row: index + 2, values, errors, valid: Object.keys(errors).length === 0 };
  });
}
