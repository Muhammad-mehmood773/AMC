import type { Observable } from 'rxjs';

export type ImportColumnType = 'text' | 'email' | 'phone' | 'date' | 'number' | 'boolean' | 'list';

export interface ImportColumn {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly type?: ImportColumnType;
  readonly description?: string;
  /** Alternative header names recognised during automatic mapping. */
  readonly aliases?: readonly string[];
  /** Allowed values (case-insensitive); normalised to the canonical spelling. */
  readonly options?: readonly string[];
  /** Values must be unique within the file. */
  readonly unique?: boolean;
  /** Additional validation; return an error message or null. */
  readonly validate?: (value: string, row: ImportRow) => string | null;
}

export type ImportRow = Readonly<Record<string, string>>;

export interface ImportFailure {
  readonly row: number;
  readonly message: string;
}

export interface ImportCommitResult {
  readonly created: number;
  readonly failed: readonly ImportFailure[];
}

export interface ImportConfig {
  /** e.g. "customer" / "customers" */
  readonly entity: string;
  readonly entityPlural: string;
  readonly templateName: string;
  readonly columns: readonly ImportColumn[];
  /** Realistic example records used for the downloadable demo template. */
  readonly sampleRows: readonly ImportRow[];
  readonly notes?: readonly string[];
  readonly maxRows?: number;
  readonly commit: (rows: readonly { readonly row: number; readonly values: ImportRow }[]) => Observable<ImportCommitResult>;
}
