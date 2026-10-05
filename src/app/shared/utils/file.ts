export type CsvCell = string | number | boolean | null | undefined;

function escapeCsv(cell: CsvCell): string {
  const text = cell === null || cell === undefined ? '' : String(cell);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadFile(fileName: string, content: BlobPart, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsv(
  fileName: string,
  headers: readonly string[],
  rows: readonly (readonly CsvCell[])[],
): void {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsv).join(','));
  downloadFile(fileName, `\uFEFF${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
}

export function timestampedName(base: string, extension: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
