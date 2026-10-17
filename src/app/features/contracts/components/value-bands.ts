/** Contract value bands used for "Value Range" filters (SRS 5.4 / 5.5). */
export const VALUE_BANDS: readonly { label: string; min: number; max: number | null }[] = [
  { label: '< 100K', min: 0, max: 99_999 },
  { label: '100K – 250K', min: 100_000, max: 249_999 },
  { label: '250K – 500K', min: 250_000, max: 499_999 },
  { label: '500K – 1M', min: 500_000, max: 999_999 },
  { label: '≥ 1M', min: 1_000_000, max: null },
];

export const inBands = (labels: readonly string[], value: number) =>
  !labels.length || VALUE_BANDS.some((b) => labels.includes(b.label) && value >= b.min && (b.max === null || value <= b.max));
