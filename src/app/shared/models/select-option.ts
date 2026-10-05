export interface SelectOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

export function toOptions<T extends string>(values: readonly T[]): SelectOption<T>[] {
  return values.map((value) => ({ value, label: value }));
}
