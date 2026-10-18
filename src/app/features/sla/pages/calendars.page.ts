import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { Switch } from '@shared/ui/form-controls';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { LookupValuesStore } from '@shared/lookups/lookup-values.store';
import { PageHeader } from '@shared/ui/page-header';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { type Observable, firstValueFrom } from 'rxjs';
import { SlaReferenceStore } from '../data/sla-reference.store';
import { SlaCalendarApi } from '../data/sla.api';
import { SLA_LOOKUP } from '../data/sla.lookups';
import { businessMinutes } from '../data/sla-time';
import { formatMinutes } from '../models/display';
import { CALENDAR_TYPES, DAYS, type DayHours, HOLIDAY_TYPES, type Holiday, type SlaCalendar, TIME_ZONES } from '../models/operations.model';

/** SRS 7.10 — calendars, working days, breaks, holidays and time zones. */
@Component({
  selector: 'amc-calendars-page',
  imports: [DataTable, DatePicker, Dialog, FormField, Icon, PageHeader, Select, Spinner, Switch, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="SLA Calendar & Service Hours" subtitle="Time periods during which SLA clocks run — in the calendar's time zone, excluding breaks and holidays." [breadcrumbs]="[{ label: 'SLA Management', path: '/app/sla/dashboard' }, { label: 'Calendars' }]">
        @if (tab() === 'calendars') { <button type="button" class="amc-btn-primary" (click)="openCalendar(null)"><amc-icon name="plus" /> Add Calendar</button> } @else { <button type="button" class="amc-btn-primary" (click)="openHoliday(null)"><amc-icon name="plus" /> Add Holiday</button> }
      </amc-page-header>
      <amc-tabs [items]="tabs()" [active]="tab()" (activeChange)="tab.set($any($event))" />
      @if (tab() === 'calendars') {
        <section class="amc-card overflow-hidden">
          <amc-data-table tableId="sla-calendars" [rows]="calendars()" [columns]="calendarColumns" [trackBy]="trackById" [loading]="calendarsRes.isLoading()" [actions]="calendarActions" emptyIcon="calendar" emptyTitle="No calendars" emptyMessage="Add a service calendar." (action)="onCalendar($event)" />
        </section>
        <section class="amc-card p-4 sm:p-5">
          <p class="text-sm font-semibold text-ink">Time zone handling</p>
          <p class="mt-1 text-xs text-ink-muted">SLA clocks use the time zone of the SLA calendar. Customer, site, service team, technician and organization time zones are converted to the calendar zone, so a 4-hour business-hours target means 4 working hours at the customer's location.</p>
          <div class="mt-3 flex flex-wrap items-end gap-3">
            <amc-form-field label="Calendar" for="sim-cal" class="min-w-56"><amc-select inputId="sim-cal" [options]="refs.calendarOptions()" [(value)]="simCalendar" /></amc-form-field>
            <amc-form-field label="From" for="sim-from"><input id="sim-from" type="datetime-local" class="amc-input" [value]="simFrom()" (input)="simFrom.set($any($event.target).value)" /></amc-form-field>
            <amc-form-field label="To" for="sim-to"><input id="sim-to" type="datetime-local" class="amc-input" [value]="simTo()" (input)="simTo.set($any($event.target).value)" /></amc-form-field>
            <p class="pb-2 text-sm text-ink">SLA time: <span class="font-semibold tabular-nums">{{ simulated() }}</span></p>
          </div>
        </section>
      } @else {
        <section class="amc-card overflow-hidden">
          <amc-data-table tableId="sla-holidays" [rows]="holidays()" [columns]="holidayColumns" [trackBy]="trackById" [loading]="holidaysRes.isLoading()" [actions]="holidayActions" [initialPageSize]="25" emptyIcon="calendar" emptyTitle="No holidays" emptyMessage="Add holidays to a holiday calendar." (action)="onHoliday($event)" />
        </section>
      }
    </div>

    <amc-dialog size="lg" [title]="editingCal() ? 'Edit calendar' : 'Add calendar'" [(open)]="calOpen">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <amc-form-field label="Calendar Name" for="cl-name" [required]="true" class="sm:col-span-2"><input id="cl-name" class="amc-input" [value]="cal().name" (input)="patchCal({ name: $any($event.target).value })" /></amc-form-field>
        <amc-form-field label="Calendar Type" for="cl-type"><amc-select inputId="cl-type" [options]="typeOptions" [value]="cal().type" (valueChange)="patchCal({ type: $any($event) })" /></amc-form-field>
        <amc-form-field label="Time Zone" for="cl-tz"><amc-select inputId="cl-tz" [options]="tzOptions" [value]="cal().timeZone" (valueChange)="patchCal({ timeZone: $any($event) })" /></amc-form-field>
        <amc-form-field label="Holiday Calendar" for="cl-hol"><amc-select inputId="cl-hol" [options]="holidayCalendarOptions()" [value]="cal().holidayCalendar" (valueChange)="patchCal({ holidayCalendar: $any($event) })" /></amc-form-field>
        <amc-form-field label="Effective Date" for="cl-eff"><amc-date-picker inputId="cl-eff" [value]="cal().effectiveDate" (valueChange)="patchCal({ effectiveDate: $event })" /></amc-form-field>
        <amc-form-field label="Break Start" for="cl-bs"><input id="cl-bs" type="time" class="amc-input" [value]="cal().breakStart ?? ''" (input)="patchCal({ breakStart: $any($event.target).value || null })" /></amc-form-field>
        <amc-form-field label="Break End" for="cl-be"><input id="cl-be" type="time" class="amc-input" [value]="cal().breakEnd ?? ''" (input)="patchCal({ breakEnd: $any($event.target).value || null })" /></amc-form-field>
        <amc-form-field label="Status" for="cl-status"><amc-select inputId="cl-status" [options]="statusOptions" [value]="cal().status" (valueChange)="patchCal({ status: $any($event) })" /></amc-form-field>
        <amc-form-field label="Weekend Rules" for="cl-wk" class="sm:col-span-3"><input id="cl-wk" class="amc-input" [value]="cal().weekendRules" (input)="patchCal({ weekendRules: $any($event.target).value })" /></amc-form-field>
      </div>
      <p class="amc-overline mt-5">Working days</p>
      <div class="mt-2 divide-y divide-line rounded-xl border border-line">
        @for (d of cal().days; track $index; let i = $index) {
          <div class="flex flex-wrap items-center gap-3 px-3 py-2">
            <span class="w-24 text-sm font-medium">{{ days[i] }}</span>
            <amc-switch [checked]="d.working" (checkedChange)="patchDay(i, { working: $event })" [label]="d.working ? 'Working' : 'Off'" />
            @if (d.working) {
              <input type="time" class="amc-input h-8 w-28" [attr.aria-label]="days[i] + ' start'" [value]="d.start" (input)="patchDay(i, { start: $any($event.target).value })" />
              <span class="text-ink-subtle">–</span>
              <input type="time" class="amc-input h-8 w-28" [attr.aria-label]="days[i] + ' end'" [value]="d.end === '24:00' ? '23:59' : d.end" (input)="patchDay(i, { end: $any($event.target).value })" />
            }
          </div>
        }
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="calOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="saveCalendar()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>

    <amc-dialog size="md" [title]="editingHol() ? 'Edit holiday' : 'Add holiday'" [(open)]="holOpen">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <amc-form-field label="Holiday Name" for="hl-name" [required]="true" class="sm:col-span-2"><input id="hl-name" class="amc-input" [value]="hol().name" (input)="patchHol({ name: $any($event.target).value })" /></amc-form-field>
        <amc-form-field label="Holiday Date" for="hl-date" [required]="true"><amc-date-picker inputId="hl-date" [value]="hol().date" (valueChange)="patchHol({ date: $event })" /></amc-form-field>
        <amc-form-field label="Holiday Type" for="hl-type"><amc-select inputId="hl-type" [options]="holidayTypeOptions" [value]="hol().type" (valueChange)="patchHol({ type: $any($event) })" /></amc-form-field>
        <amc-form-field label="Country" for="hl-country"><input id="hl-country" class="amc-input" [value]="hol().country" (input)="patchHol({ country: $any($event.target).value })" /></amc-form-field>
        <amc-form-field label="Region" for="hl-region"><input id="hl-region" class="amc-input" [value]="hol().region" (input)="patchHol({ region: $any($event.target).value })" /></amc-form-field>
        <amc-form-field label="Site" for="hl-site"><amc-select inputId="hl-site" [options]="refs.siteOptions(null)" [value]="hol().siteId" (valueChange)="patchHol({ siteId: $any($event) })" [clearable]="true" placeholder="All sites" /></amc-form-field>
        <amc-form-field label="Applicable Calendar" for="hl-cal"><amc-select inputId="hl-cal" [options]="holidayCalendarOptions()" [value]="hol().calendar" (valueChange)="patchHol({ calendar: $any($event) })" /></amc-form-field>
        <amc-switch [checked]="hol().working" (checkedChange)="patchHol({ working: $event })" label="Working day" description="Counted as working time." />
        <amc-switch [checked]="hol().overrideAllowed" (checkedChange)="patchHol({ overrideAllowed: $event })" label="Override Allowed" />
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="holOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="saveHoliday()">@if (busy()) { <amc-spinner [size]="14" /> } Save</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class CalendarsPage {
  private readonly api = inject(SlaCalendarApi);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(SlaReferenceStore);
  protected readonly holidayCalendarOptions = inject(LookupValuesStore).options(SLA_LOOKUP.holidayCalendar);

  protected readonly tab = signal<'calendars' | 'holidays'>('calendars');
  protected readonly calendarsRes = rxResource({ stream: () => this.api.list() });
  protected readonly holidaysRes = rxResource({ stream: () => this.api.holidays() });
  protected readonly calendars = computed(() => (this.calendarsRes.hasValue() ? this.calendarsRes.value() : []));
  protected readonly holidays = computed(() => (this.holidaysRes.hasValue() ? this.holidaysRes.value() : []));
  protected readonly tabs = computed<TabItem[]>(() => [{ id: 'calendars', label: 'Calendars', count: this.calendars().length }, { id: 'holidays', label: 'Holiday Management', count: this.holidays().length }]);
  protected readonly days = DAYS;
  protected readonly calendarColumns: DataColumn<SlaCalendar>[] = [
    { key: 'name', label: 'Calendar', value: (c) => c.name, secondary: (c) => c.type, mobile: 'title', width: 240 },
    { key: 'tz', label: 'Time Zone', value: (c) => c.timeZone, visibility: 'md', mobile: 'meta', width: 140 },
    { key: 'days', label: 'Working Days', value: (c) => c.days.map((d, i) => (d.working ? `${DAYS[i].slice(0, 3)} ${d.start}–${d.end}` : null)).filter(Boolean).join(', '), visibility: 'lg', width: 420 },
    { key: 'break', label: 'Break', value: (c) => (c.breakStart ? `${c.breakStart}–${c.breakEnd}` : '—'), visibility: 'xl', width: 110 },
    { key: 'holiday', label: 'Holiday Calendar', value: (c) => c.holidayCalendar, visibility: 'xl', width: 170 },
    { key: 'effective', label: 'Effective', value: (c) => c.effectiveDate, type: 'date', visibility: '2xl', width: 110 },
    { key: 'status', label: 'Status', value: (c) => c.status, type: 'badge', tone: (c) => (c.status === 'Active' ? 'ok' : 'neutral'), mobile: 'badge', width: 100 },
  ];
  protected readonly holidayColumns: DataColumn<Holiday>[] = [
    { key: 'name', label: 'Holiday', value: (h) => h.name, secondary: (h) => h.type, mobile: 'title', width: 240 },
    { key: 'date', label: 'Holiday Date', value: (h) => h.date, type: 'date', sortable: true, mobile: 'meta', width: 130 },
    { key: 'calendar', label: 'Applicable Calendar', value: (h) => h.calendar, visibility: 'md', width: 180 },
    { key: 'country', label: 'Country / Region', value: (h) => h.country, secondary: (h) => h.region, visibility: 'lg', width: 180 },
    { key: 'site', label: 'Site', value: (h) => (h.siteId ? this.refs.data().sites.find((s) => s.id === h.siteId)?.name ?? h.siteId : 'All sites'), visibility: 'xl', width: 160 },
    { key: 'override', label: 'Override Allowed', value: (h) => (h.overrideAllowed ? 'Yes' : 'No'), visibility: 'xl', width: 120 },
    { key: 'working', label: 'Working / Non-Working', value: (h) => (h.working ? 'Working' : 'Non-Working'), type: 'badge', tone: (h) => (h.working ? 'info' : 'warn'), mobile: 'badge', width: 140 },
  ];
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly calendarActions = (): MenuItem[] => [{ id: 'edit', label: 'Edit', icon: 'pencil' }];
  protected readonly holidayActions = (): MenuItem[] => [{ id: 'edit', label: 'Edit', icon: 'pencil' }];
  protected readonly typeOptions = toOptions(CALENDAR_TYPES);
  protected readonly tzOptions = toOptions(TIME_ZONES);
  protected readonly holidayTypeOptions = toOptions(HOLIDAY_TYPES);
  protected readonly statusOptions = toOptions(['Active', 'Inactive'] as const);
  protected readonly busy = signal(false);

  private readonly blankCal = (): Omit<SlaCalendar, 'id'> => ({ name: '', type: 'Business Hours', timeZone: 'Asia/Riyadh', days: DAYS.map((_, i) => ({ working: i <= 4, start: '08:00', end: '17:00' })), breakStart: null, breakEnd: null, weekendRules: 'Friday and Saturday are non-working.', holidayCalendar: 'KSA Public Holidays', effectiveDate: new Date().toISOString().slice(0, 10), status: 'Active', customerId: null });
  protected readonly calOpen = signal(false);
  protected readonly editingCal = signal<SlaCalendar | null>(null);
  protected readonly cal = signal<Omit<SlaCalendar, 'id'>>(this.blankCal());
  private readonly blankHol = (): Omit<Holiday, 'id'> => ({ name: '', date: '', type: 'Public Holiday', country: 'Saudi Arabia', region: 'All', siteId: null, calendar: 'KSA Public Holidays', working: false, overrideAllowed: false });
  protected readonly holOpen = signal(false);
  protected readonly editingHol = signal<Holiday | null>(null);
  protected readonly hol = signal<Omit<Holiday, 'id'>>(this.blankHol());

  protected readonly simCalendar = signal<string | number | null>('CAL-KSA-BH');
  protected readonly simFrom = signal(new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 16));
  protected readonly simTo = signal(new Date().toISOString().slice(0, 16));
  protected readonly simulated = computed(() => {
    const c = this.calendars().find((x) => x.id === this.simCalendar());
    if (!c || !this.simFrom() || !this.simTo()) return '—';
    return formatMinutes(businessMinutes(c, this.holidays(), `${this.simFrom()}:00Z`, `${this.simTo()}:00Z`));
  });

  protected patchCal(p: Partial<SlaCalendar>): void {
    this.cal.update((c) => ({ ...c, ...p }));
  }

  protected patchDay(i: number, p: Partial<DayHours>): void {
    this.cal.update((c) => ({ ...c, days: c.days.map((d, idx) => (idx === i ? { ...d, ...p } : d)) }));
  }

  protected patchHol(p: Partial<Holiday>): void {
    this.hol.update((h) => ({ ...h, ...p }));
  }

  protected openCalendar(c: SlaCalendar | null): void {
    this.editingCal.set(c);
    if (c) {
      const { id: _id, ...rest } = c;
      void _id;
      this.cal.set({ ...rest, days: rest.days.map((d) => ({ ...d })) });
    } else this.cal.set(this.blankCal());
    this.calOpen.set(true);
  }

  protected openHoliday(h: Holiday | null): void {
    this.editingHol.set(h);
    if (h) {
      const { id: _id, ...rest } = h;
      void _id;
      this.hol.set(rest);
    } else this.hol.set(this.blankHol());
    this.holOpen.set(true);
  }

  protected onCalendar({ row }: RowAction<SlaCalendar>): void {
    this.openCalendar(row);
  }

  protected onHoliday({ row }: RowAction<Holiday>): void {
    this.openHoliday(row);
  }

  protected async saveCalendar(): Promise<void> {
    const c = this.editingCal();
    if (await this.exec(c ? this.api.update(c.id, this.cal()) : this.api.create(this.cal()), c ? 'Calendar updated.' : 'Calendar added.')) {
      this.calOpen.set(false);
      this.calendarsRes.reload();
      this.refs.refresh();
    }
  }

  protected async saveHoliday(): Promise<void> {
    const h = this.editingHol();
    if (await this.exec(h ? this.api.updateHoliday(h.id, this.hol()) : this.api.createHoliday(this.hol()), h ? 'Holiday updated.' : 'Holiday added.')) {
      this.holOpen.set(false);
      this.holidaysRes.reload();
    }
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
