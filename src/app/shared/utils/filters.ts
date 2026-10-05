import type { DateRange } from '@shared/ui/date-picker';
import type { ChoiceOption } from '@shared/ui/select';

export type FilterFieldType = 'select' | 'multiselect' | 'date-range';

export interface FilterField {
  readonly key: string;
  readonly label: string;
  readonly type: FilterFieldType;
  readonly options?: readonly ChoiceOption[];
  readonly placeholder?: string;
}

export type FilterValue = string | readonly string[] | DateRange;
export type FilterValues = Readonly<Record<string, FilterValue | undefined>>;

function isRange(value: FilterValue | undefined): value is DateRange {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'from' in value;
}

export function isFilterActive(value: FilterValue | undefined): boolean {
  if (value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRange(value)) return !!(value.from || value.to);
  return true;
}

export function countActiveFilters(values: FilterValues): number {
  return Object.values(values).filter(isFilterActive).length;
}

/** Selected values of a select / multiselect filter as an array (empty = no filter). */
export function filterList(values: FilterValues, key: string): readonly string[] {
  const value = values[key];
  if (Array.isArray(value)) return value;
  return typeof value === 'string' && value ? [value] : [];
}

export function filterRange(values: FilterValues, key: string): DateRange {
  const value = values[key];
  return isRange(value) ? value : { from: '', to: '' };
}

/** True when the filter is empty or the actual value is one of the selected values. */
export function matchesAny(values: FilterValues, key: string, actual: string | null | undefined): boolean {
  const selected = filterList(values, key);
  return selected.length === 0 || selected.includes(actual ?? '');
}

/** True when the range is empty or the ISO date/timestamp falls within it (inclusive). */
export function withinRange(values: FilterValues, key: string, iso: string | null | undefined): boolean {
  const { from, to } = filterRange(values, key);
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}
