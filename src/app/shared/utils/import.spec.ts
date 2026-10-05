import { of } from 'rxjs';
import type { ImportConfig } from '@shared/models/import';
import { countActiveFilters, matchesAny, withinRange } from './filters';
import { autoMap, validateRows } from './import-validation';
import { parseCsv, toCsv, writeXlsx } from './spreadsheet';

const config: ImportConfig = {
  entity: 'customer',
  entityPlural: 'customers',
  templateName: 'customers',
  sampleRows: [],
  commit: () => of({ created: 0, failed: [] }),
  columns: [
    { key: 'code', label: 'Customer Code', unique: true },
    { key: 'name', label: 'Customer Name', required: true },
    { key: 'type', label: 'Customer Type', required: true, options: ['Corporate', 'SME'] },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'since', label: 'Since', type: 'date' },
    { key: 'portal', label: 'Portal', type: 'boolean' },
  ],
};

describe('spreadsheet utilities', () => {
  it('round-trips CSV with quotes, commas and newlines', () => {
    const rows = [
      ['Name', 'Notes'],
      ['Al Safwa, Medical', 'Line 1\nLine "2"'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('detects semicolon-delimited CSV', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('writes a valid XLSX (zip) container', async () => {
    const blob = writeXlsx([['Customer Name'], ['Gulf Horizon Logistics']]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    expect(blob.type).toContain('spreadsheetml');
  });
});

describe('import validation', () => {
  it('auto-maps headers by label, ignoring required markers and case', () => {
    expect(autoMap(['customer name *', 'CUSTOMER TYPE', 'Unknown'], config.columns)).toEqual(['name', 'type', null]);
  });

  it('normalises values and reports row-level errors', () => {
    const mapping = ['code', 'name', 'type', 'email', 'since', 'portal'];
    const rows = validateRows(
      config,
      [
        ['CUS-1', 'Al Safwa', 'corporate', 'K.Rashid@Safwa.sa', '05/10/2026', 'yes'],
        ['CUS-1', '', 'Enterprise', 'not-an-email', '2026-13', 'maybe'],
      ],
      mapping,
    );
    expect(rows[0].valid).toBe(true);
    expect(rows[0].values).toMatchObject({ type: 'Corporate', email: 'k.rashid@safwa.sa', since: '2026-10-05', portal: 'Yes' });
    expect(rows[1].row).toBe(3);
    expect(Object.keys(rows[1].errors).sort()).toEqual(['code', 'email', 'name', 'portal', 'since', 'type']);
  });
});

describe('filter helpers', () => {
  it('matches multi-select values and date ranges', () => {
    const values = { status: ['Active', 'On Hold'], created: { from: '2026-01-01', to: '2026-06-30' } };
    expect(countActiveFilters(values)).toBe(2);
    expect(matchesAny(values, 'status', 'Active')).toBe(true);
    expect(matchesAny(values, 'status', 'Inactive')).toBe(false);
    expect(matchesAny(values, 'type', 'SME')).toBe(true);
    expect(withinRange(values, 'created', '2026-03-15T10:00:00Z')).toBe(true);
    expect(withinRange(values, 'created', '2026-07-01')).toBe(false);
  });
});
