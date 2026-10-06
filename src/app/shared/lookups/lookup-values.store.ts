import { Injectable, type Signal, computed, inject, signal } from '@angular/core';
import type { ChoiceOption } from '@shared/ui/select';
import { firstValueFrom } from 'rxjs';
import { LOOKUP_TYPES, type LookupTypeDefinition, type LookupValue, LookupValuesApi } from './lookup';

/**
 * Signal-based cache of lookup values. Provide alongside a `LookupValuesApi` implementation and
 * the `LOOKUP_TYPES` registry (usually at feature-route level).
 */
@Injectable()
export class LookupValuesStore {
  private readonly api = inject(LookupValuesApi);
  private readonly definitions = new Map(inject(LOOKUP_TYPES).map((d) => [d.key, d]));
  private readonly values = signal<readonly LookupValue[]>([]);
  private readonly optionCache = new Map<string, Signal<ChoiceOption[]>>();
  private readonly valueCache = new Map<string, Signal<LookupValue[]>>();

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.values.set(await firstValueFrom(this.api.list([...this.definitions.keys()])));
      this.error.set(null);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  definition(type: string): LookupTypeDefinition {
    return this.definitions.get(type) ?? { key: type, label: type, editable: false };
  }

  isEditable(type: string): boolean {
    return this.definition(type).editable;
  }

  /** All values (active and inactive) of a type, in display order. */
  valuesOf(type: string): Signal<LookupValue[]> {
    let cached = this.valueCache.get(type);
    if (!cached) {
      cached = computed(() =>
        this.values()
          .filter((v) => v.type === type)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
      this.valueCache.set(type, cached);
    }
    return cached;
  }

  /** Active values as select options (value = name). */
  options(type: string): Signal<ChoiceOption[]> {
    let cached = this.optionCache.get(type);
    if (!cached) {
      const values = this.valuesOf(type);
      cached = computed(() => values().filter((v) => v.status === 'Active').map((v) => ({ value: v.name, label: v.name })));
      this.optionCache.set(type, cached);
    }
    return cached;
  }

  find(type: string, name: string | null | undefined): LookupValue | null {
    if (!name) return null;
    return this.valuesOf(type)().find((v) => v.name === name) ?? null;
  }

  /** True when another value of the same type already uses the name (case-insensitive). */
  isDuplicate(type: string, name: string, excludeId?: string): boolean {
    const target = name.trim().toLowerCase();
    return this.valuesOf(type)().some((v) => v.id !== excludeId && v.name.toLowerCase() === target);
  }

  async create(type: string, name: string): Promise<LookupValue> {
    const created = await firstValueFrom(this.api.create(type, name.trim()));
    this.values.update((list) => [...list, created]);
    return created;
  }

  async rename(id: string, name: string): Promise<LookupValue> {
    const updated = await firstValueFrom(this.api.update(id, { name: name.trim() }));
    this.values.update((list) => list.map((v) => (v.id === id ? updated : v)));
    return updated;
  }
}
