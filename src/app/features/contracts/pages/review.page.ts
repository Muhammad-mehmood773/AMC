import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { DataTable, type RowAction } from '@shared/ui/data-table';
import { DatePicker } from '@shared/ui/date-picker';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { type TabItem, Tabs } from '@shared/ui/tabs';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { formatDateTime } from '@shared/utils/format';
import { type Observable, firstValueFrom, of } from 'rxjs';
import { reviewColumns } from '../components/contract-columns';
import { VersionCompare } from '../components/version-compare';
import { ContractReferenceStore } from '../data/contract-reference.store';
import { ContractApi, ReviewApi, TemplateApi } from '../data/contract.api';
import { CONTRACT_STATUS_TONE } from '../models/display';
import { COMMENT_VISIBILITY, type CommentVisibility, type NegotiationEntry, REVIEW_STATUSES, REVIEW_TYPES, type ReviewListItem, type ReviewStatus, type ReviewType } from '../models/workflow.model';

const KINDS: NegotiationEntry['kind'][] = ['Comment', 'Redline', 'Clause Change', 'Review Note'];

@Component({
  selector: 'amc-review-page',
  imports: [DataTable, DatePicker, Dialog, FilterBar, FormField, Icon, PageHeader, Panel, RouterLink, Select, Spinner, StatusBadge, Tabs, VersionCompare],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract Review & Negotiation" subtitle="Commercial, legal, technical, financial, compliance and management reviews with redlining and negotiation history." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'Review & Negotiation' }]" />

      <section class="amc-card p-3 sm:p-4">
        <div class="flex flex-wrap items-end gap-3">
          <amc-form-field label="Contract workspace" for="rv-contract" class="min-w-72 flex-1"><amc-select inputId="rv-contract" placeholder="Select a contract in review…" [options]="contractOptions()" [clearable]="true" [value]="selected()" (valueChange)="selectContract($event)" /></amc-form-field>
          @if (contract(); as c) {
            <amc-status-badge [label]="c.effectiveStatus" [tone]="statusTone[c.effectiveStatus]" />
            <a [routerLink]="['/app/contracts', c.id]" class="amc-btn-ghost amc-btn-sm">Contract 360</a>
            @if (c.status === 'Draft' || c.status === 'Under Negotiation') { <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="contractAction('review')"><amc-icon name="send" [size]="14" /> Submit for Review</button> }
            @if (c.status === 'Under Review') { <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="contractAction('negotiate')"><amc-icon name="users" [size]="14" /> Start Negotiation</button> }
            @if (['Draft', 'Under Review', 'Under Negotiation'].includes(c.status)) { <button type="button" class="amc-btn-primary amc-btn-sm" (click)="contractAction('approval')"><amc-icon name="check-circle" [size]="14" /> Submit for Approval</button> }
          }
        </div>
      </section>

      @if (contract(); as c) {
        <amc-tabs [items]="tabs()" [active]="tab()" (activeChange)="tab.set($any($event))" />
        @switch (tab()) {
          @case ('reviews') {
            <section class="amc-card overflow-hidden">
              <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <p class="text-sm text-ink-muted">{{ openReviews() }} open review(s). All reviews must be completed before approval.</p>
                <button type="button" class="amc-btn-secondary amc-btn-sm" (click)="addOpen.set(true)"><amc-icon name="plus" [size]="14" /> Add Review</button>
              </div>
              <amc-data-table [rows]="contractReviews()" [columns]="contractReviewCols" [trackBy]="trackById" [actions]="reviewActions" emptyIcon="eye" emptyTitle="No reviews" emptyMessage="Submit the contract for review to create the standard reviews." (action)="onReview($event)" />
            </section>
          }
          @case ('negotiation') {
            <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <amc-panel class="xl:col-span-2" title="Negotiation history" description="Comments, redlines and clause changes" icon="users" [padded]="false">
                <div panelActions class="flex items-center gap-1">
                  @for (v of visibilityFilter; track v) { <button type="button" class="rounded-md px-2 py-1 text-xs font-medium" [class]="visibility() === v ? 'bg-brand-subtle text-brand' : 'text-ink-muted hover:bg-surface-sunken'" (click)="visibility.set(v)">{{ v }}</button> }
                </div>
                <ol class="divide-y divide-line">
                  @for (n of thread(); track n.id) {
                    <li class="px-4 py-3 sm:px-5" [class]="n.resolved ? 'opacity-60' : ''">
                      <div class="flex flex-wrap items-center gap-2 text-xs">
                        <span class="font-semibold text-ink">{{ n.author }}</span><span class="text-ink-muted">{{ n.party }}</span>
                        <amc-status-badge [label]="n.kind" [tone]="n.kind === 'Redline' ? 'danger' : n.kind === 'Clause Change' ? 'accent' : 'neutral'" [dot]="false" />
                        <amc-status-badge [label]="n.visibility" [tone]="n.visibility === 'Internal' ? 'warn' : 'info'" [dot]="false" />
                        <span class="text-ink-muted">· {{ n.section }}</span>
                        <span class="ml-auto text-ink-subtle">{{ formatDateTime(n.at) }}</span>
                      </div>
                      @if (n.original || n.proposed) {
                        <p class="mt-1.5 text-sm">
                          @if (n.original) { <span class="rounded bg-danger-subtle px-1 text-danger line-through">{{ n.original }}</span> }
                          @if (n.proposed) { <span class="ml-1 rounded bg-ok-subtle px-1 text-ok underline">{{ n.proposed }}</span> }
                        </p>
                      }
                      <p class="mt-1 text-sm text-ink">{{ n.text }}</p>
                      @if (!n.resolved) { <button type="button" class="mt-1 text-xs text-brand hover:underline" (click)="resolve(n)">Mark resolved</button> }
                    </li>
                  } @empty { <li class="p-6 text-center text-sm text-ink-muted">No negotiation entries yet.</li> }
                </ol>
              </amc-panel>
              <amc-panel title="Add entry" icon="pencil">
                <div class="space-y-3">
                  <div class="grid grid-cols-2 gap-3">
                    <amc-form-field label="Type" for="ng-kind"><amc-select inputId="ng-kind" [options]="kindOptions" [(value)]="kind" /></amc-form-field>
                    <amc-form-field label="Visibility" for="ng-vis"><amc-select inputId="ng-vis" [options]="visibilityOptions" [(value)]="entryVisibility" /></amc-form-field>
                  </div>
                  <amc-form-field label="Party" for="ng-party"><amc-select inputId="ng-party" [options]="partyOptions" [(value)]="party" /></amc-form-field>
                  <amc-form-field label="Section / Clause" for="ng-section"><input id="ng-section" class="amc-input" [value]="section()" (input)="section.set($any($event.target).value)" placeholder="e.g. Limitation of Liability" /></amc-form-field>
                  @if (kind() === 'Redline' || kind() === 'Clause Change') {
                    <amc-form-field label="Original text" for="ng-orig"><textarea id="ng-orig" class="amc-textarea min-h-14" [value]="original()" (input)="original.set($any($event.target).value)"></textarea></amc-form-field>
                    <amc-form-field label="Proposed text" for="ng-prop"><textarea id="ng-prop" class="amc-textarea min-h-14" [value]="proposed()" (input)="proposed.set($any($event.target).value)"></textarea></amc-form-field>
                  }
                  <amc-form-field label="Comment" for="ng-text" [required]="true"><textarea id="ng-text" class="amc-textarea min-h-16" [value]="text()" (input)="text.set($any($event.target).value)"></textarea></amc-form-field>
                  <button type="button" class="amc-btn-primary w-full" [disabled]="busy() || !text().trim()" (click)="addEntry()">@if (busy()) { <amc-spinner [size]="14" /> } Add to history</button>
                </div>
              </amc-panel>
            </div>
          }
          @case ('versions') {
            <amc-panel title="Version comparison" description="Document versioning and change tracking" icon="layers"><amc-version-compare [versions]="versions()" /></amc-panel>
          }
          @case ('clauses') {
            <amc-panel title="Clause comparison" [description]="'Contract clauses compared with template ' + (c.templateId ?? '— none')" icon="file-text" [padded]="false">
              <ul class="divide-y divide-line">
                @for (row of clauseDiff(); track row.id) {
                  <li class="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <amc-status-badge [label]="row.state" [tone]="row.state === 'Added' ? 'ok' : row.state === 'Removed' ? 'danger' : 'neutral'" [dot]="false" />
                    <div class="min-w-0 flex-1"><p class="text-sm font-medium text-ink">{{ row.name }} <span class="font-normal text-ink-muted">· {{ row.type }} · v{{ row.version }}{{ row.mandatory ? ' · Mandatory' : '' }}</span></p><p class="mt-0.5 text-xs text-ink-muted">{{ row.text }}</p></div>
                  </li>
                } @empty { <li class="p-6 text-center text-sm text-ink-muted">No clauses.</li> }
              </ul>
            </amc-panel>
          }
        }
      } @else {
        <section class="amc-card overflow-hidden">
          <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search contract, reviewer or comment…" [(search)]="search" [fields]="filterFields()" [(filters)]="filters" /></div>
          <amc-data-table tableId="contract-reviews" [entity]="{ singular: 'review', plural: 'reviews' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="reviews.isLoading()" [actions]="reviewActions" emptyIcon="eye" emptyTitle="No reviews" emptyMessage="Reviews appear when contracts are submitted for review." (action)="onReview($event)" />
        </section>
      }
    </div>

    <amc-dialog size="sm" [title]="'Update ' + (reviewTarget()?.type ?? '')" [description]="reviewTarget()?.contractNumber ?? ''" [open]="!!reviewTarget()" (openChange)="!$event && reviewTarget.set(null)">
      <div class="space-y-3">
        <amc-form-field label="Review Status" for="rs-status"><amc-select inputId="rs-status" [options]="statusOptions" [(value)]="reviewStatus" /></amc-form-field>
        <amc-form-field label="Comments" for="rs-comments" [required]="reviewStatus() === 'Changes Requested' || reviewStatus() === 'Rejected'"><textarea id="rs-comments" class="amc-textarea min-h-20" [value]="reviewComment()" (input)="reviewComment.set($any($event.target).value)"></textarea></amc-form-field>
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="reviewTarget.set(null)">Close</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy()" (click)="saveReview()">Save</button>
      </ng-container>
    </amc-dialog>

    <amc-dialog size="sm" title="Add review" [(open)]="addOpen">
      <div class="space-y-3">
        <amc-form-field label="Review Type" for="ar-type"><amc-select inputId="ar-type" [options]="typeOptions" [(value)]="newType" /></amc-form-field>
        <amc-form-field label="Reviewer" for="ar-reviewer"><amc-select inputId="ar-reviewer" [options]="refs.userOptions()" [(value)]="newReviewer" /></amc-form-field>
        <amc-form-field label="Due Date" for="ar-due"><amc-date-picker inputId="ar-due" [(value)]="newDue" /></amc-form-field>
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="addOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || !newReviewer()" (click)="addReview()">Add</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ReviewPage {
  private readonly reviewApi = inject(ReviewApi);
  private readonly contractApi = inject(ContractApi);
  private readonly templateApi = inject(TemplateApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  protected readonly refs = inject(ContractReferenceStore);

  readonly contractId = input<string>();

  protected readonly selected = linkedSignal<string | null>(() => this.contractId() ?? null);
  protected readonly refresh = signal(0);
  protected readonly tab = signal<'reviews' | 'negotiation' | 'versions' | 'clauses'>('reviews');
  protected readonly reviews = rxResource({ params: () => this.refresh(), stream: () => this.reviewApi.list() });
  private readonly contracts = rxResource({ params: () => this.refresh(), stream: () => this.contractApi.list() });
  private readonly negotiationRes = rxResource({ params: () => ({ id: this.selected(), k: this.refresh() }), stream: ({ params }) => (params.id ? this.reviewApi.negotiation(params.id) : of([])) });
  private readonly versionsRes = rxResource({ params: () => ({ id: this.selected(), k: this.refresh() }), stream: ({ params }) => (params.id ? this.contractApi.versions(params.id) : of([])) });
  private readonly clausesRes = rxResource({ stream: () => this.templateApi.clauses() });
  private readonly templatesRes = rxResource({ stream: () => this.templateApi.templates() });

  protected readonly allReviews = computed(() => (this.reviews.hasValue() ? this.reviews.value() : []));
  protected readonly contract = computed(() => (this.contracts.hasValue() ? this.contracts.value() : []).find((c) => c.id === this.selected()) ?? null);
  protected readonly contractOptions = computed(() =>
    (this.contracts.hasValue() ? this.contracts.value() : [])
      .filter((c) => ['Draft', 'Under Review', 'Under Negotiation', 'Pending Approval'].includes(c.status) || c.id === this.selected())
      .map((c) => ({ value: c.id, label: `${c.number} · ${c.title}`, hint: c.effectiveStatus })),
  );
  protected readonly contractReviews = computed(() => this.allReviews().filter((r) => r.contractId === this.selected()));
  protected readonly openReviews = computed(() => this.contractReviews().filter((r) => ['Pending', 'In Review', 'Changes Requested'].includes(r.status)).length);
  protected readonly versions = computed(() => (this.versionsRes.hasValue() ? this.versionsRes.value() : []));
  protected readonly visibility = signal<'All' | CommentVisibility>('All');
  protected readonly visibilityFilter = ['All', ...COMMENT_VISIBILITY] as const;
  protected readonly thread = computed(() => (this.negotiationRes.hasValue() ? this.negotiationRes.value() : []).filter((n) => this.visibility() === 'All' || n.visibility === this.visibility()));
  protected readonly clauseDiff = computed(() => {
    const c = this.contract();
    const clauses = this.clausesRes.hasValue() ? this.clausesRes.value() : [];
    const template = (this.templatesRes.hasValue() ? this.templatesRes.value() : []).find((t) => t.id === c?.templateId);
    const ids = [...new Set([...(c?.clauseIds ?? []), ...(template?.defaultClauseIds ?? [])])];
    return ids.map((id) => {
      const cl = clauses.find((x) => x.id === id);
      const inContract = c?.clauseIds.includes(id) ?? false;
      const inTemplate = template?.defaultClauseIds.includes(id) ?? false;
      return { id, name: cl?.name ?? id, type: cl?.type ?? '', version: cl?.version ?? '', mandatory: cl?.mandatory ?? false, text: cl?.text ?? '', state: !template ? 'Included' : inContract && inTemplate ? 'Unchanged' : inContract ? 'Added' : 'Removed' };
    });
  });
  protected readonly tabs = computed<TabItem[]>(() => [
    { id: 'reviews', label: 'Reviews', count: this.contractReviews().length },
    { id: 'negotiation', label: 'Negotiation', count: this.thread().length },
    { id: 'versions', label: 'Version Comparison', count: this.versions().length },
    { id: 'clauses', label: 'Clause Comparison' },
  ]);

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({ status: ['Pending', 'In Review', 'Changes Requested'] });
  protected readonly filterFields = computed<FilterField[]>(() => [
    { key: 'status', label: 'Review Status', type: 'multiselect', options: toOptions(REVIEW_STATUSES) },
    { key: 'type', label: 'Review Type', type: 'multiselect', options: toOptions(REVIEW_TYPES) },
    { key: 'reviewer', label: 'Reviewer', type: 'multiselect', options: this.refs.userOptions() },
  ]);
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filters();
    return this.allReviews().filter((r) => (!term || `${r.contractNumber} ${r.contractTitle} ${r.reviewerName} ${r.comments}`.toLowerCase().includes(term)) && matchesAny(f, 'status', r.status) && matchesAny(f, 'type', r.type) && matchesAny(f, 'reviewer', r.reviewerId));
  });
  protected readonly columns = reviewColumns();
  protected readonly contractReviewCols = reviewColumns(false);
  protected readonly trackById = (r: { id: string }) => r.id;
  protected readonly reviewActions = (r: ReviewListItem): MenuItem[] => [
    { id: 'update', label: 'Update Review', icon: 'pencil', disabled: ['Reviewed', 'Approved', 'Rejected'].includes(r.status) && !['Draft', 'Under Review', 'Under Negotiation'].includes(this.contract()?.status ?? 'Draft') },
    { id: 'workspace', label: 'Open Workspace', icon: 'external-link' },
  ];
  protected readonly statusTone = CONTRACT_STATUS_TONE;
  protected readonly statusOptions = toOptions(REVIEW_STATUSES);
  protected readonly typeOptions = toOptions(REVIEW_TYPES);
  protected readonly kindOptions = toOptions(KINDS);
  protected readonly visibilityOptions = toOptions(COMMENT_VISIBILITY);
  protected readonly partyOptions = toOptions(['Company', 'Customer', 'Counterparty'] as const);
  protected readonly formatDateTime = formatDateTime;
  protected readonly busy = signal(false);

  protected readonly reviewTarget = signal<ReviewListItem | null>(null);
  protected readonly reviewStatus = signal<string | number | null>('Reviewed');
  protected readonly reviewComment = signal('');
  protected readonly addOpen = signal(false);
  protected readonly newType = signal<string | number | null>('Compliance Review');
  protected readonly newReviewer = signal<string | number | null>(null);
  protected readonly newDue = signal(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  protected readonly kind = signal<string | number | null>('Comment');
  protected readonly entryVisibility = signal<string | number | null>('Internal');
  protected readonly party = signal<string | number | null>('Company');
  protected readonly section = signal('');
  protected readonly original = signal('');
  protected readonly proposed = signal('');
  protected readonly text = signal('');

  protected selectContract(id: string | number | null): void {
    this.selected.set(id ? String(id) : null);
    void this.router.navigate([], { queryParams: { contractId: id || null }, replaceUrl: true });
  }

  protected onReview({ id, row }: RowAction<ReviewListItem>): void {
    if (id === 'workspace') return this.selectContract(row.contractId);
    this.reviewStatus.set(row.status === 'Pending' ? 'In Review' : 'Reviewed');
    this.reviewComment.set(row.comments);
    this.reviewTarget.set(row);
  }

  protected async saveReview(): Promise<void> {
    const r = this.reviewTarget();
    if (r && (await this.exec(this.reviewApi.setStatus(r.id, this.reviewStatus() as ReviewStatus, this.reviewComment()), `${r.type} updated.`))) this.reviewTarget.set(null);
  }

  protected async addReview(): Promise<void> {
    const id = this.selected();
    if (id && (await this.exec(this.reviewApi.add(id, this.newType() as ReviewType, String(this.newReviewer()), this.newDue()), 'Review added.'))) this.addOpen.set(false);
  }

  protected async addEntry(): Promise<void> {
    const id = this.selected();
    if (!id) return;
    const ok = await this.exec(
      this.reviewApi.addEntry(id, { kind: this.kind() as NegotiationEntry['kind'], visibility: this.entryVisibility() as CommentVisibility, party: this.party() as NegotiationEntry['party'], section: this.section() || 'General', original: this.original() || null, proposed: this.proposed() || null, text: this.text() }),
      'Added to negotiation history.',
    );
    if (ok) {
      this.text.set('');
      this.original.set('');
      this.proposed.set('');
    }
  }

  protected resolve(n: NegotiationEntry): void {
    void this.exec(this.reviewApi.resolveEntry(n.id), 'Marked resolved.');
  }

  protected contractAction(action: 'review' | 'negotiate' | 'approval'): void {
    const id = this.selected();
    if (!id) return;
    const work = action === 'review' ? this.contractApi.submitForReview(id) : action === 'negotiate' ? this.contractApi.startNegotiation(id, '') : this.contractApi.submitForApproval(id);
    void this.exec(work, action === 'review' ? 'Submitted for review.' : action === 'negotiate' ? 'Negotiation started.' : 'Submitted for approval.');
  }

  private async exec(work: Observable<unknown>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(work);
      this.notify.success(message);
      this.refresh.update((k) => k + 1);
      return true;
    } catch (error) {
      this.notify.error((error as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
