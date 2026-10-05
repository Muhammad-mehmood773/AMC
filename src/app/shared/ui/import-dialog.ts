import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { ImportCommitResult, ImportConfig } from '@shared/models/import';
import { downloadCsv, downloadFile } from '@shared/utils/file';
import { formatFileSize } from '@shared/utils/format';
import { type ValidatedRow, autoMap, validateRows } from '@shared/utils/import-validation';
import { type SheetRows, readSpreadsheet, toCsv, writeXlsx } from '@shared/utils/spreadsheet';
import { firstValueFrom } from 'rxjs';
import { Dialog } from './dialog';
import { Icon, type IconName } from './icon';
import { type ChoiceOption, type ChoiceValue, Select } from './select';
import { Spinner } from './spinner';

type Step = 'upload' | 'map' | 'preview' | 'result';

const STEPS: readonly { id: Step; label: string }[] = [
  { id: 'upload', label: 'Upload file' },
  { id: 'map', label: 'Map columns' },
  { id: 'preview', label: 'Review' },
  { id: 'result', label: 'Done' },
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PREVIEW_LIMIT = 50;

/**
 * Reusable import wizard: upload CSV/XLSX → map columns → validate & preview → commit.
 * Entity specifics (columns, validation, sample template, commit) come from `ImportConfig`.
 */
@Component({
  selector: 'amc-import-dialog',
  imports: [Dialog, Icon, Select, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <amc-dialog
      size="xl"
      [title]="'Import ' + (config()?.entityPlural ?? 'data')"
      [description]="'Bulk-create ' + (config()?.entityPlural ?? 'records') + ' from a CSV or Excel file.'"
      [dismissible]="!busy()"
      [(open)]="open"
    >
      @if (config(); as cfg) {
        <!-- Stepper -->
        <ol class="mb-6 flex items-center gap-2 overflow-x-auto pb-1">
          @for (s of steps; track s.id; let i = $index; let last = $last) {
            <li class="flex shrink-0 items-center gap-2">
              <span
                class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors"
                [class]="stepIndex() > i ? 'bg-brand text-brand-foreground' : stepIndex() === i ? 'bg-brand-subtle text-brand ring-2 ring-brand' : 'bg-surface-sunken text-ink-subtle'"
              >
                @if (stepIndex() > i) {
                  <amc-icon name="check" [size]="14" [strokeWidth]="2.5" />
                } @else {
                  {{ i + 1 }}
                }
              </span>
              <span class="text-sm font-medium" [class]="stepIndex() >= i ? 'text-ink' : 'text-ink-subtle'">{{ s.label }}</span>
              @if (!last) {
                <span class="mx-1 h-px w-8 bg-line sm:w-12"></span>
              }
            </li>
          }
        </ol>

        @switch (step()) {
          @case ('upload') {
            <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div class="space-y-4">
                <label
                  for="import-file"
                  class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors"
                  [class]="dragging() ? 'border-brand bg-brand-subtle' : fileError() ? 'border-danger/50 bg-danger-subtle' : 'border-line-strong bg-surface-muted hover:border-brand hover:bg-brand-subtle'"
                  (dragover)="onDragOver($event)"
                  (dragleave)="dragging.set(false)"
                  (drop)="onDrop($event)"
                >
                  <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-brand shadow-card">
                    @if (busy()) {
                      <amc-spinner [size]="20" />
                    } @else {
                      <amc-icon name="upload" [size]="22" />
                    }
                  </span>
                  <span class="text-sm font-semibold text-ink">Drop your file here or <span class="text-brand">browse</span></span>
                  <span class="text-xs text-ink-muted">Supported formats: CSV (.csv) and Excel (.xlsx) · max 5 MB · up to {{ cfg.maxRows ?? 1000 }} rows</span>
                  <input id="import-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="sr-only" (change)="onFileInput($event)" />
                </label>
                @if (fileError()) {
                  <p class="flex items-center gap-2 text-sm text-danger" role="alert"><amc-icon name="alert-circle" />{{ fileError() }}</p>
                }

                <div class="rounded-xl border border-line">
                  <div class="flex items-center justify-between border-b border-line px-4 py-2.5">
                    <p class="text-sm font-semibold text-ink">Template columns</p>
                    <span class="text-xs text-ink-muted">{{ requiredCount() }} required · {{ cfg.columns.length }} total</span>
                  </div>
                  <ul class="max-h-56 divide-y divide-line overflow-y-auto">
                    @for (col of cfg.columns; track col.key) {
                      <li class="flex items-start gap-3 px-4 py-2 text-sm">
                        <span class="w-44 shrink-0 font-medium text-ink">
                          {{ col.label }}
                          @if (col.required) {
                            <span class="text-danger">*</span>
                          }
                        </span>
                        <span class="text-xs text-ink-muted">{{ col.description ?? (col.options ? 'One of: ' + col.options.join(', ') : typeHint(col.type)) }}</span>
                      </li>
                    }
                  </ul>
                </div>
              </div>

              <aside class="space-y-4">
                <div class="rounded-xl border border-line bg-surface-muted p-4">
                  <p class="text-sm font-semibold text-ink">Demo template</p>
                  <p class="mt-1 text-xs text-ink-muted">Includes every column and {{ cfg.sampleRows.length }} realistic example records.</p>
                  <div class="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="downloadTemplate('xlsx')">
                      <amc-icon name="download" [size]="14" /> Excel
                    </button>
                    <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="downloadTemplate('csv')">
                      <amc-icon name="download" [size]="14" /> CSV
                    </button>
                  </div>
                </div>
                <div class="rounded-xl border border-line p-4">
                  <p class="text-sm font-semibold text-ink">Instructions</p>
                  <ul class="mt-2 space-y-2 text-xs text-ink-muted">
                    <li class="flex gap-2"><amc-icon name="check" [size]="13" class="mt-0.5 text-brand" />Keep the header row; column order does not matter.</li>
                    <li class="flex gap-2"><amc-icon name="check" [size]="13" class="mt-0.5 text-brand" />Dates as YYYY-MM-DD (DD/MM/YYYY also accepted).</li>
                    <li class="flex gap-2"><amc-icon name="check" [size]="13" class="mt-0.5 text-brand" />Yes/No for switches; values in lists separated by semicolons.</li>
                    @for (note of cfg.notes ?? []; track note) {
                      <li class="flex gap-2"><amc-icon name="check" [size]="13" class="mt-0.5 text-brand" />{{ note }}</li>
                    }
                  </ul>
                </div>
              </aside>
            </div>
          }

          @case ('map') {
            <div class="space-y-4">
              <div class="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3">
                <amc-icon name="file-check" [size]="18" class="text-brand" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-ink">{{ fileName() }}</p>
                  <p class="text-xs text-ink-muted">{{ fileSize() }} · {{ dataRows().length }} data rows · {{ headers().length }} columns</p>
                </div>
                <button type="button" class="amc-btn-ghost amc-btn-sm" (click)="reset()">Change file</button>
              </div>
              @if (missingRequired().length) {
                <div class="flex gap-2 rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-ink" role="alert">
                  <amc-icon name="alert-triangle" class="mt-0.5 text-danger" />
                  <span>Map the required fields before continuing: <span class="font-medium">{{ missingRequired().join(', ') }}</span></span>
                </div>
              }
              <div class="overflow-hidden rounded-xl border border-line">
                <table class="w-full text-sm">
                  <thead class="bg-surface-muted">
                    <tr>
                      <th class="amc-th">File column</th>
                      <th class="amc-th hidden sm:table-cell">Sample value</th>
                      <th class="amc-th w-1/2">Import as</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-line">
                    @for (header of headers(); track $index; let i = $index) {
                      <tr>
                        <td class="amc-td font-medium">{{ header || 'Column ' + (i + 1) }}</td>
                        <td class="amc-td hidden max-w-48 truncate text-ink-muted sm:table-cell">{{ dataRows()[0]?.[i] || '—' }}</td>
                        <td class="amc-td">
                          <amc-select
                            [options]="targetOptions()"
                            [value]="mapping()[i] ?? ''"
                            [ariaLabel]="'Import ' + header + ' as'"
                            (valueChange)="setMapping(i, $event)"
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          @case ('preview') {
            <div class="space-y-4">
              <div class="grid grid-cols-3 gap-3">
                @for (card of summary(); track card.label) {
                  <div class="rounded-xl border border-line p-3">
                    <p class="flex items-center gap-1.5 text-xs text-ink-muted"><amc-icon [name]="card.icon" [size]="13" [class]="card.tone" />{{ card.label }}</p>
                    <p class="mt-1 text-xl font-semibold text-ink tabular-nums">{{ card.value }}</p>
                  </div>
                }
              </div>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <label class="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" class="amc-checkbox" [checked]="errorsOnly()" (change)="errorsOnly.set(!errorsOnly())" />
                  Show rows with errors only
                </label>
                @if (invalidRows().length) {
                  <button type="button" class="amc-btn-ghost amc-btn-sm" (click)="downloadErrors(validationErrors())">
                    <amc-icon name="download" [size]="14" /> Download error report
                  </button>
                }
              </div>
              <div class="max-h-[22rem] overflow-auto rounded-xl border border-line">
                <table class="w-full min-w-max border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th class="amc-th sticky top-0 left-0 z-20 border-b border-line bg-surface-muted">Row</th>
                      @for (col of mappedColumns(); track col.key) {
                        <th class="amc-th sticky top-0 z-10 border-b border-line bg-surface-muted">{{ col.label }}</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of previewRows(); track r.row) {
                      <tr>
                        <td class="sticky left-0 z-[5] border-b border-line bg-surface px-3 py-2">
                          <span class="inline-flex items-center gap-1.5 font-mono text-xs" [class]="r.valid ? 'text-ok' : 'text-danger'">
                            <amc-icon [name]="r.valid ? 'check-circle' : 'alert-circle'" [size]="13" />{{ r.row }}
                          </span>
                        </td>
                        @for (col of mappedColumns(); track col.key) {
                          <td
                            class="max-w-56 truncate border-b border-line px-3 py-2"
                            [class]="r.errors[col.key] ? 'bg-danger-subtle text-danger' : 'text-ink'"
                            [attr.title]="r.errors[col.key] ?? r.values[col.key]"
                          >
                            {{ r.values[col.key] || (r.errors[col.key] ? '(missing)' : '—') }}
                          </td>
                        }
                      </tr>
                    } @empty {
                      <tr><td class="px-3 py-8 text-center text-ink-muted" [attr.colspan]="mappedColumns().length + 1">No rows with errors.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (filteredPreview().length > previewLimit) {
                <p class="text-xs text-ink-muted">Showing the first {{ previewLimit }} of {{ filteredPreview().length }} rows.</p>
              }
              @if (invalidRows().length) {
                <ul class="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-danger/20 bg-danger-subtle/60 p-3 text-xs text-ink">
                  @for (e of validationErrors().slice(0, 30); track $index) {
                    <li><span class="font-mono text-danger">Row {{ e.row }}</span> · {{ e.message }}</li>
                  }
                </ul>
              }
            </div>
          }

          @case ('result') {
            @if (result(); as res) {
              <div class="flex flex-col items-center py-6 text-center">
                <span class="flex h-14 w-14 items-center justify-center rounded-full" [class]="res.created ? 'bg-ok-subtle text-ok' : 'bg-danger-subtle text-danger'">
                  <amc-icon [name]="res.created ? 'check-circle' : 'alert-triangle'" [size]="26" />
                </span>
                <h3 class="mt-4 text-lg font-semibold text-ink">
                  {{ res.created ? res.created + ' ' + (res.created === 1 ? cfg.entity : cfg.entityPlural) + ' imported' : 'Nothing was imported' }}
                </h3>
                <p class="mt-1 max-w-md text-sm text-ink-muted">
                  @if (allFailures().length) {
                    {{ allFailures().length }} row{{ allFailures().length === 1 ? '' : 's' }} could not be imported. Download the report, fix the rows and import them again.
                  } @else {
                    All rows were imported successfully and are now available in the list.
                  }
                </p>
                @if (allFailures().length) {
                  <button type="button" class="amc-btn-secondary mt-4" (click)="downloadErrors(allFailures())">
                    <amc-icon name="download" /> Download error report
                  </button>
                }
              </div>
            }
          }
        }
      }

      <ng-container dialogFooter>
        @switch (step()) {
          @case ('upload') {
            <button type="button" class="amc-btn-secondary" (click)="open.set(false)">Cancel</button>
          }
          @case ('map') {
            <button type="button" class="amc-btn-ghost sm:mr-auto" (click)="reset()">Back</button>
            <button type="button" class="amc-btn-primary" [disabled]="missingRequired().length > 0" (click)="toPreview()">
              Continue
              <amc-icon name="arrow-right" />
            </button>
          }
          @case ('preview') {
            <button type="button" class="amc-btn-ghost sm:mr-auto" [disabled]="busy()" (click)="step.set('map')">Back</button>
            <button type="button" class="amc-btn-primary" [disabled]="busy() || validRows().length === 0" (click)="commit()">
              @if (busy()) {
                <amc-spinner [size]="14" />
              }
              Import {{ validRows().length }} {{ validRows().length === 1 ? config()?.entity : config()?.entityPlural }}
            </button>
          }
          @case ('result') {
            <button type="button" class="amc-btn-secondary sm:mr-auto" (click)="reset()">Import another file</button>
            <button type="button" class="amc-btn-primary" (click)="open.set(false)">Done</button>
          }
        }
      </ng-container>
    </amc-dialog>
  `,
})
export class ImportDialog {
  readonly config = input<ImportConfig | null>(null);
  readonly open = model(false);
  readonly imported = output<ImportCommitResult>();

  protected readonly steps = STEPS;
  protected readonly previewLimit = PREVIEW_LIMIT;
  protected readonly step = signal<Step>('upload');
  protected readonly busy = signal(false);
  protected readonly dragging = signal(false);
  protected readonly fileError = signal<string | null>(null);
  protected readonly fileName = signal('');
  protected readonly fileSize = signal('');
  protected readonly headers = signal<string[]>([]);
  protected readonly dataRows = signal<SheetRows>([]);
  protected readonly mapping = signal<(string | null)[]>([]);
  protected readonly validated = signal<ValidatedRow[]>([]);
  protected readonly errorsOnly = signal(false);
  protected readonly result = signal<ImportCommitResult | null>(null);

  protected readonly stepIndex = computed(() => STEPS.findIndex((s) => s.id === this.step()));
  protected readonly requiredCount = computed(() => this.config()?.columns.filter((c) => c.required).length ?? 0);
  protected readonly targetOptions = computed<ChoiceOption[]>(() => [
    { value: '', label: 'Do not import' },
    ...(this.config()?.columns ?? []).map((c) => ({ value: c.key, label: c.required ? `${c.label} *` : c.label })),
  ]);
  protected readonly missingRequired = computed(() => {
    const mapped = new Set(this.mapping().filter(Boolean));
    return (this.config()?.columns ?? []).filter((c) => c.required && !mapped.has(c.key)).map((c) => c.label);
  });
  protected readonly mappedColumns = computed(() => {
    const mapped = new Set(this.mapping().filter(Boolean));
    return (this.config()?.columns ?? []).filter((c) => mapped.has(c.key) || c.required);
  });
  protected readonly validRows = computed(() => this.validated().filter((r) => r.valid));
  protected readonly invalidRows = computed(() => this.validated().filter((r) => !r.valid));
  protected readonly filteredPreview = computed(() => (this.errorsOnly() ? this.invalidRows() : this.validated()));
  protected readonly previewRows = computed(() => this.filteredPreview().slice(0, PREVIEW_LIMIT));
  protected readonly validationErrors = computed(() =>
    this.invalidRows().flatMap((r) => Object.values(r.errors).map((message) => ({ row: r.row, message }))),
  );
  protected readonly allFailures = computed(() => [
    ...this.validationErrors(),
    ...(this.result()?.failed ?? []),
  ]);
  protected readonly summary = computed<{ label: string; value: number; icon: IconName; tone: string }[]>(() => [
    { label: 'Rows in file', value: this.validated().length, icon: 'rows', tone: 'text-ink-subtle' },
    { label: 'Ready to import', value: this.validRows().length, icon: 'check-circle', tone: 'text-ok' },
    { label: 'With errors', value: this.invalidRows().length, icon: 'alert-circle', tone: 'text-danger' },
  ]);

  constructor() {
    effect(() => {
      if (this.open()) untracked(() => this.reset());
    });
  }

  protected typeHint(type: string | undefined): string {
    switch (type) {
      case 'email':
        return 'Email address';
      case 'phone':
        return 'Phone number incl. country code';
      case 'date':
        return 'Date (YYYY-MM-DD)';
      case 'number':
        return 'Number';
      case 'boolean':
        return 'Yes or No';
      case 'list':
        return 'Values separated by semicolons';
      default:
        return 'Text';
    }
  }

  protected reset(): void {
    this.step.set('upload');
    this.fileError.set(null);
    this.headers.set([]);
    this.dataRows.set([]);
    this.mapping.set([]);
    this.validated.set([]);
    this.result.set(null);
    this.errorsOnly.set(false);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.load(file);
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.load(file);
  }

  private async load(file: File): Promise<void> {
    const config = this.config();
    if (!config) return;
    this.fileError.set(null);
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      this.fileError.set('Unsupported file type. Upload a .csv or .xlsx file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.fileError.set(`The file is ${formatFileSize(file.size)}; the maximum is 5 MB.`);
      return;
    }
    this.busy.set(true);
    try {
      const rows = await readSpreadsheet(file);
      if (rows.length < 2) throw new Error('The file has no data rows below the header.');
      const max = config.maxRows ?? 1000;
      if (rows.length - 1 > max) throw new Error(`The file has ${rows.length - 1} rows; the maximum per import is ${max}.`);
      const headers = rows[0].map((h) => h.trim());
      this.headers.set(headers);
      this.dataRows.set(rows.slice(1));
      this.mapping.set(autoMap(headers, config.columns));
      this.fileName.set(file.name);
      this.fileSize.set(formatFileSize(file.size));
      this.step.set('map');
    } catch (error) {
      this.fileError.set((error as Error).message || 'The file could not be read.');
    } finally {
      this.busy.set(false);
    }
  }

  protected setMapping(index: number, value: ChoiceValue | null): void {
    const key = value ? String(value) : null;
    this.mapping.update((m) => m.map((existing, i) => (i === index ? key : existing === key && key ? null : existing)));
  }

  protected toPreview(): void {
    const config = this.config();
    if (!config) return;
    this.validated.set(validateRows(config, this.dataRows(), this.mapping()));
    this.errorsOnly.set(this.invalidRows().length > 0 && this.validRows().length === 0);
    this.step.set('preview');
  }

  protected async commit(): Promise<void> {
    const config = this.config();
    if (!config || this.busy()) return;
    this.busy.set(true);
    try {
      const result = await firstValueFrom(config.commit(this.validRows().map((r) => ({ row: r.row, values: r.values }))));
      this.result.set(result);
      this.step.set('result');
      this.imported.emit(result);
    } catch (error) {
      this.result.set({ created: 0, failed: [{ row: 0, message: (error as Error).message }] });
      this.step.set('result');
    } finally {
      this.busy.set(false);
    }
  }

  protected downloadTemplate(format: 'csv' | 'xlsx'): void {
    const config = this.config();
    if (!config) return;
    const rows = [
      config.columns.map((c) => (c.required ? `${c.label} *` : c.label)),
      ...config.sampleRows.map((row) => config.columns.map((c) => row[c.key] ?? '')),
    ];
    if (format === 'csv') {
      downloadFile(`${config.templateName}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
    } else {
      downloadFile(`${config.templateName}.xlsx`, writeXlsx(rows, config.entityPlural), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
  }

  protected downloadErrors(errors: readonly { row: number; message: string }[]): void {
    downloadCsv(`${this.config()?.templateName ?? 'import'}-errors.csv`, ['Row', 'Error'], errors.map((e) => [e.row, e.message]));
  }
}
