import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { toOptions } from '@shared/models/select-option';
import { type DataColumn, DataTable } from '@shared/ui/data-table';
import { FormField } from '@shared/ui/form-field';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { StatusBadge } from '@shared/ui/status-badge';
import { firstValueFrom } from 'rxjs';
import { SrReferenceStore } from '../data/sr-reference.store';
import { RequestApi } from '../data/sr.api';
import { PRIORITY_TONE, formatMinutes } from '../models/display';
import type { ClassificationRule, RoutingRule, Suggestion } from '../models/operations.model';
import { BUSINESS_IMPACT, URGENCY } from '../models/request.model';

/** SRS 9.8 — Classification rules, keyword matching and a live suggestion test. */
@Component({
  selector: 'amc-sr-classification-page',
  imports: [DataTable, FormField, PageHeader, Panel, Select, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Request Classification" subtitle="Keyword rules, the urgency × impact matrix and routing used to classify and prioritise requests automatically." [breadcrumbs]="[{ label: 'Service Requests', path: '/app/service-requests/dashboard' }, { label: 'Classification' }]" />
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div class="space-y-5 xl:col-span-2">
          <amc-panel title="Classification Rules" description="First matching keyword rule wins." icon="list" [padded]="false">
            <amc-data-table tableId="sr-class-rules" [entity]="{ singular: 'rule', plural: 'rules' }" [rows]="rules().classification" [columns]="ruleColumns" [trackBy]="trackRule" [loading]="rulesRes.isLoading()" [compact]="true" />
          </amc-panel>
          <amc-panel title="Routing Rules" description="Service category → team and required skill (SRS 9.12)." icon="users" [padded]="false">
            <amc-data-table tableId="sr-routing-rules" [entity]="{ singular: 'rule', plural: 'rules' }" [rows]="rules().routing" [columns]="routingColumns" [trackBy]="trackCategory" [compact]="true" />
          </amc-panel>
        </div>
        <amc-panel title="Test Classification" description="Type a symptom to see what the engine would suggest." icon="activity">
          <div class="space-y-4 p-4 sm:p-5">
            <amc-form-field label="Customer" for="tc-cust"><amc-select inputId="tc-cust" [options]="refs.customerOptions()" [(value)]="customer" [clearable]="true" [searchable]="true" /></amc-form-field>
            <amc-form-field label="Subject" for="tc-subject"><input id="tc-subject" class="amc-input" [value]="subject()" (input)="subject.set($any($event.target).value)" /></amc-form-field>
            <amc-form-field label="Description" for="tc-desc"><textarea id="tc-desc" class="amc-textarea" [value]="description()" (input)="description.set($any($event.target).value)"></textarea></amc-form-field>
            <div class="grid grid-cols-2 gap-3">
              <amc-form-field label="Urgency" for="tc-urg"><amc-select inputId="tc-urg" [options]="urgencyOptions" [(value)]="urgency" /></amc-form-field>
              <amc-form-field label="Impact" for="tc-imp"><amc-select inputId="tc-imp" [options]="impactOptions" [(value)]="impact" /></amc-form-field>
            </div>
            <button type="button" class="amc-btn-primary w-full" [disabled]="subject().trim().length < 3" (click)="test()">Run Classification</button>
            @if (result(); as s) {
              <div class="space-y-2 rounded-xl border border-line bg-surface-sunken p-3 text-sm">
                <div class="flex justify-between"><span class="text-ink-muted">Type</span><span class="font-medium text-ink">{{ s.type ?? '—' }}</span></div>
                <div class="flex justify-between"><span class="text-ink-muted">Category</span><span class="font-medium text-ink">{{ s.serviceCategory ?? '—' }}{{ s.subcategory ? ' · ' + s.subcategory : '' }}</span></div>
                <div class="flex justify-between"><span class="text-ink-muted">Priority</span><amc-status-badge [label]="s.priority + ' (' + s.priorityScore + ')'" [tone]="priorityTone[s.priority]" /></div>
                <div class="flex justify-between"><span class="text-ink-muted">Skill / Team</span><span class="text-right font-medium text-ink">{{ s.requiredSkill ?? '—' }}<br />{{ s.team ?? '—' }}</span></div>
                <div class="flex justify-between"><span class="text-ink-muted">SLA</span><span class="text-right font-medium text-ink">{{ s.slaNumber ?? 'None' }}</span></div>
                <div class="flex justify-between"><span class="text-ink-muted">Response / Resolution</span><span class="font-medium tabular-nums text-ink">{{ fm(s.responseMinutes) }} / {{ fm(s.resolutionMinutes) }}</span></div>
                <p class="border-t border-line pt-2 text-xs text-ink-muted">{{ s.priorityFactors.join(' · ') }}{{ s.rule ? ' · rule ' + s.rule : '' }}</p>
              </div>
            }
          </div>
        </amc-panel>
      </div>
    </div>
  `,
})
export class ClassificationPage {
  private readonly api = inject(RequestApi);
  protected readonly refs = inject(SrReferenceStore);

  protected readonly rulesRes = rxResource({ stream: () => this.api.rules() });
  protected readonly rules = computed(() => (this.rulesRes.hasValue() ? this.rulesRes.value() : { classification: [], routing: [] }));
  protected readonly customer = signal<string | number | null>(null);
  protected readonly subject = signal('');
  protected readonly description = signal('');
  protected readonly urgency = signal<string | number | null>('Medium');
  protected readonly impact = signal<string | number | null>('Medium');
  protected readonly result = signal<Suggestion | null>(null);
  protected readonly urgencyOptions = toOptions(URGENCY);
  protected readonly impactOptions = toOptions(BUSINESS_IMPACT);
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly fm = formatMinutes;
  protected readonly trackRule = (r: ClassificationRule) => r.id;
  protected readonly trackCategory = (r: RoutingRule) => r.category;

  protected readonly ruleColumns: DataColumn<ClassificationRule>[] = [
    { key: 'id', label: 'Rule', value: (r) => r.id, width: 80 },
    { key: 'keywords', label: 'Keywords', value: (r) => r.keywords.join(', '), mobile: 'title' },
    { key: 'type', label: 'Type', value: (r) => r.type, visibility: 'lg', width: 160 },
    { key: 'category', label: 'Category', value: (r) => r.category, secondary: (r) => r.subcategory, width: 200 },
    { key: 'urgency', label: 'Urgency', value: (r) => r.urgency, type: 'badge', tone: (r) => (r.urgency === 'High' ? 'danger' : r.urgency === 'Medium' ? 'warn' : 'neutral'), width: 100 },
    { key: 'skill', label: 'Skill', value: (r) => r.skill, visibility: 'xl', width: 160 },
  ];
  protected readonly routingColumns: DataColumn<RoutingRule>[] = [
    { key: 'category', label: 'Service Category', value: (r) => r.category, mobile: 'title', width: 220 },
    { key: 'team', label: 'Team', value: (r) => r.team, width: 180 },
    { key: 'skill', label: 'Required Skill', value: (r) => r.skill, width: 180 },
    { key: 'method', label: 'Method', value: (r) => r.method, visibility: 'lg', width: 190 },
  ];

  protected async test(): Promise<void> {
    this.result.set(await firstValueFrom(this.api.suggest({
      type: 'Service Request', serviceCategory: '', subcategory: '', subject: this.subject(), description: this.description(), source: 'Internal', requestedDate: null, requestedTime: '',
      priority: null, customerReference: '',
      customer: { customerId: String(this.customer() ?? ''), contactId: null, contactName: '', phone: '', email: '' },
      location: { siteId: '', building: '', area: '', accessInstructions: '' },
      assetId: null,
      classification: { problemCategory: '', problemCode: '', serviceCode: '', failureType: '', symptom: '', cause: '', requestedServiceId: null, urgency: String(this.urgency() ?? 'Medium'), businessImpact: String(this.impact() ?? 'Medium'), affectedUsers: 1, requiredSkill: '', suggestedBy: null },
      notes: { customer: '', internal: '' },
      parentRequestId: null,
    })));
  }
}
