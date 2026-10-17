import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NotificationPort } from '@core/notification/notification.port';
import { toOptions } from '@shared/models/select-option';
import type { MenuItem } from '@shared/ui/action-menu';
import { type DataColumn, DataTable } from '@shared/ui/data-table';
import { Dialog } from '@shared/ui/dialog';
import { FilterBar } from '@shared/ui/filter-bar';
import { FormField } from '@shared/ui/form-field';
import { Icon } from '@shared/ui/icon';
import { PageHeader } from '@shared/ui/page-header';
import { Panel } from '@shared/ui/panel';
import { Select } from '@shared/ui/select';
import { Spinner } from '@shared/ui/spinner';
import { StatusBadge } from '@shared/ui/status-badge';
import { downloadFile } from '@shared/utils/file';
import { type FilterField, type FilterValues, matchesAny } from '@shared/utils/filters';
import { formatDate, formatDateTime } from '@shared/utils/format';
import { type Observable, firstValueFrom, of } from 'rxjs';
import { ContractReferenceStore } from '../data/contract-reference.store';
import { ContractApi, ContractHistoryApi, SignatureApi, type SignatoryInput } from '../data/contract.api';
import { SIGNATURE_TONE, SIGNER_TONE } from '../models/display';
import { SIGNATURE_STATUSES } from '../models/contract.model';
import type { SignatureListItem } from '../models/workflow.model';

/** SRS 5.13 — execution of approved contracts through e-signature with a full audit trail. */
@Component({
  selector: 'amc-execution-page',
  imports: [DataTable, Dialog, FilterBar, FormField, Icon, PageHeader, Panel, RouterLink, Select, Spinner, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <amc-page-header title="Contract Execution / E-Signature" subtitle="Send the final approved version for signature, track signing order and store the executed contract." [breadcrumbs]="[{ label: 'Contracts', path: '/app/contracts/dashboard' }, { label: 'Execution / E-Signature' }]" />
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <section class="amc-card overflow-hidden xl:col-span-3">
          <div class="border-b border-line p-3 sm:p-4"><amc-filter-bar searchPlaceholder="Search contract or customer…" [(search)]="search" [fields]="filterFields" [(filters)]="filters" /></div>
          <amc-data-table tableId="contract-signatures" [entity]="{ singular: 'contract', plural: 'contracts' }" [rows]="filtered()" [columns]="columns" [trackBy]="trackById" [loading]="list.isLoading()" emptyIcon="pen-tool" emptyTitle="Nothing to sign" emptyMessage="Approved contracts appear here for execution." [actions]="rowActions" (action)="select($event.row.contractId)" />
        </section>

        <div class="xl:col-span-2">
          @if (item(); as it) {
            <amc-panel [title]="it.contractNumber" [description]="it.contractTitle + ' · ' + (it.customerName ?? '')" icon="pen-tool" [padded]="false">
              <a panelActions [routerLink]="['/app/contracts', it.contractId]" class="amc-link text-xs">Contract 360</a>
              <div class="space-y-4 p-4 sm:p-5">
                <dl class="grid grid-cols-2 gap-3 text-sm">
                  <div><dt class="text-xs text-ink-muted">Signature Status</dt><dd class="mt-1"><amc-status-badge [label]="it.signatureStatus" [tone]="signatureTone[it.signatureStatus]" /></dd></div>
                  <div><dt class="text-xs text-ink-muted">Final Contract Version</dt><dd class="mt-1 font-mono text-ink">v{{ it.envelope?.finalVersion ?? '—' }}</dd></div>
                  <div><dt class="text-xs text-ink-muted">Sent Date</dt><dd class="mt-1 text-ink">{{ it.envelope ? formatDateTime(it.envelope.sentAt) : '—' }}</dd></div>
                  <div><dt class="text-xs text-ink-muted">Execution Date</dt><dd class="mt-1 text-ink">{{ it.executionDate ? formatDate(it.executionDate) : '—' }}</dd></div>
                  <div><dt class="text-xs text-ink-muted">Provider</dt><dd class="mt-1 text-ink">{{ it.envelope?.provider ?? '—' }}</dd></div>
                  <div><dt class="text-xs text-ink-muted">Envelope expires</dt><dd class="mt-1 text-ink">{{ it.envelope ? formatDate(it.envelope.expiresAt) : '—' }}</dd></div>
                </dl>

                <div>
                  <h3 class="text-sm font-semibold text-ink">Signatories · signing order</h3>
                  <ol class="mt-2 divide-y divide-line rounded-xl border border-line">
                    @for (s of it.signatories; track s.id) {
                      <li class="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <span class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-ink-muted">{{ s.order }}</span>
                        <div class="min-w-0 flex-1">
                          <p class="text-sm font-medium text-ink">{{ s.name }} <span class="font-normal text-ink-muted">· {{ s.role }}</span></p>
                          <p class="text-xs text-ink-muted">{{ s.party }} · {{ s.email }}{{ s.signedAt ? ' · ' + formatDateTime(s.signedAt) : s.viewedAt ? ' · viewed ' + formatDateTime(s.viewedAt) : '' }}</p>
                        </div>
                        <amc-status-badge [label]="s.status" [tone]="signerTone[s.status]" />
                        @if (it.envelope?.status === 'Sent' && (s.status === 'Sent' || s.status === 'Viewed')) {
                          <div class="flex w-full justify-end gap-1.5 sm:w-auto" title="Simulated provider callbacks">
                            @if (s.status === 'Sent') { <button type="button" class="amc-btn-ghost amc-btn-sm text-xs" (click)="record(s.id, 'Viewed')">Viewed</button> }
                            <button type="button" class="amc-btn-secondary amc-btn-sm text-xs" (click)="record(s.id, 'Signed')"><amc-icon name="pen-tool" [size]="12" /> Sign</button>
                            <button type="button" class="amc-btn-ghost amc-btn-sm text-xs text-danger" (click)="record(s.id, 'Declined')">Decline</button>
                          </div>
                        }
                      </li>
                    } @empty { <li class="px-3 py-4 text-center text-sm text-ink-muted">Not sent for signature yet.</li> }
                  </ol>
                  @if (it.envelope?.status === 'Sent') { <p class="mt-2 text-xs text-ink-subtle">Sign / Viewed / Decline simulate callbacks from the external e-signature provider.</p> }
                </div>

                <div class="flex flex-wrap gap-2">
                  @if (canSend()) { <button type="button" class="amc-btn-primary" (click)="openSend()"><amc-icon name="send" /> Send for Signature</button> }
                  @if (it.envelope?.status === 'Sent') {
                    <button type="button" class="amc-btn-secondary" (click)="run(api.remind(it.contractId), 'Reminder sent.')"><amc-icon name="bell" /> Remind</button>
                    <button type="button" class="amc-btn-ghost text-danger" (click)="run(api.cancel(it.contractId), 'Envelope cancelled.')">Cancel envelope</button>
                  }
                  @if (it.envelope?.signedDocumentId) { <button type="button" class="amc-btn-secondary" (click)="download(it)"><amc-icon name="download" /> Download Executed Contract</button> }
                </div>

                <div>
                  <h3 class="text-sm font-semibold text-ink">Signature audit trail</h3>
                  <ol class="mt-2 space-y-2">
                    @for (e of audit(); track e.id) {
                      <li class="text-xs"><span class="font-medium text-ink">{{ e.action }}</span> <span class="text-ink-muted">· {{ e.comments }} · {{ e.user }} · {{ formatDateTime(e.timestamp) }} · {{ e.systemReference }}</span></li>
                    } @empty { <li class="text-xs text-ink-muted">No signature events.</li> }
                  </ol>
                </div>
              </div>
            </amc-panel>
          } @else {
            <div class="amc-card flex flex-col items-center justify-center gap-2 p-10 text-center">
              <amc-icon name="pen-tool" [size]="28" class="text-ink-subtle" />
              <p class="text-sm font-medium text-ink">Select a contract</p>
              <p class="text-xs text-ink-muted">View signing status, send for signature and track execution.</p>
            </div>
          }
        </div>
      </div>
    </div>

    <amc-dialog size="lg" title="Send for signature" [description]="item()?.contractNumber + ' — signatories sign in the order listed.'" [(open)]="sendOpen">
      <div class="space-y-3">
        @for (s of signers(); track $index; let i = $index) {
          <div class="grid grid-cols-1 gap-2 rounded-xl border border-line p-3 sm:grid-cols-[2rem_1fr_1fr_1fr_8rem_2rem] sm:items-end">
            <span class="hidden h-9 items-center justify-center text-sm font-semibold text-ink-muted sm:flex">{{ i + 1 }}</span>
            <amc-form-field label="Signatory" [for]="'sg-name-' + i"><input [id]="'sg-name-' + i" class="amc-input" [value]="s.name" (input)="patch(i, 'name', $any($event.target).value)" /></amc-form-field>
            <amc-form-field label="Email" [for]="'sg-email-' + i"><input [id]="'sg-email-' + i" type="email" class="amc-input" [value]="s.email" (input)="patch(i, 'email', $any($event.target).value)" /></amc-form-field>
            <amc-form-field label="Signatory Role" [for]="'sg-role-' + i"><input [id]="'sg-role-' + i" class="amc-input" [value]="s.role" (input)="patch(i, 'role', $any($event.target).value)" /></amc-form-field>
            <amc-form-field label="Party" [for]="'sg-party-' + i"><amc-select [inputId]="'sg-party-' + i" [options]="partyOptions" [value]="s.party" (valueChange)="patch(i, 'party', $any($event))" /></amc-form-field>
            <button type="button" class="amc-btn-icon h-9 w-9" [attr.aria-label]="'Remove signatory ' + (i + 1)" (click)="removeSigner(i)"><amc-icon name="x" [size]="14" /></button>
          </div>
        }
        <button type="button" class="amc-btn-ghost amc-btn-sm" (click)="addSigner()"><amc-icon name="plus" [size]="14" /> Add signatory</button>
      </div>
      <ng-container dialogFooter>
        <button type="button" class="amc-btn-secondary" (click)="sendOpen.set(false)">Cancel</button>
        <button type="button" class="amc-btn-primary" [disabled]="busy() || !validSigners()" (click)="send()">@if (busy()) { <amc-spinner [size]="14" /> } Send</button>
      </ng-container>
    </amc-dialog>
  `,
})
export class ExecutionPage {
  protected readonly api = inject(SignatureApi);
  private readonly contracts = inject(ContractApi);
  private readonly historyApi = inject(ContractHistoryApi);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationPort);
  private readonly refs = inject(ContractReferenceStore);

  readonly contractId = input<string>();

  protected readonly refresh = signal(0);
  protected readonly selected = linkedSignal<string | null>(() => this.contractId() ?? null);
  protected readonly list = rxResource({ params: () => this.refresh(), stream: () => this.api.list() });
  private readonly detail = rxResource({ params: () => ({ id: this.selected(), k: this.refresh() }), stream: ({ params }) => (params.id ? this.api.get(params.id) : of(null)) });
  private readonly contract = rxResource({ params: () => ({ id: this.selected(), k: this.refresh() }), stream: ({ params }) => (params.id ? this.contracts.get(params.id) : of(null)) });
  private readonly history = rxResource({ params: () => ({ id: this.selected(), k: this.refresh() }), stream: ({ params }) => (params.id ? this.historyApi.list({ contractId: params.id, entity: 'Signature' }) : of([])) });
  protected readonly rows = computed(() => (this.list.hasValue() ? this.list.value() : []));
  protected readonly item = computed(() => (this.detail.hasValue() ? this.detail.value() : null));
  protected readonly audit = computed(() => (this.history.hasValue() ? this.history.value() : []));
  protected readonly canSend = computed(() => {
    const c = this.contract.hasValue() ? this.contract.value() : null;
    return !!c && c.signatureRequired && c.approvalStatus === 'Approved' && c.status === 'Approved' && this.item()?.envelope?.status !== 'Sent';
  });

  protected readonly search = signal('');
  protected readonly filters = signal<FilterValues>({});
  protected readonly filterFields: FilterField[] = [{ key: 'status', label: 'Signature Status', type: 'multiselect', options: toOptions(SIGNATURE_STATUSES) }];
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.rows().filter((r) => (!term || `${r.contractNumber} ${r.contractTitle} ${r.customerName ?? ''}`.toLowerCase().includes(term)) && matchesAny(this.filters(), 'status', r.signatureStatus));
  });
  protected readonly columns: DataColumn<SignatureListItem>[] = [
    { key: 'contract', label: 'Contract', value: (r) => r.contractTitle, secondary: (r) => `${r.contractNumber} · ${r.customerName ?? ''}`, mobile: 'title', width: 260 },
    { key: 'signed', label: 'Signed', value: (r) => (r.signatories.length ? `${r.signedCount} / ${r.signatories.length}` : '—'), visibility: 'md', width: 90 },
    { key: 'sent', label: 'Sent Date', value: (r) => r.envelope?.sentAt ?? null, type: 'date', visibility: 'lg', width: 120 },
    { key: 'executed', label: 'Execution Date', value: (r) => r.executionDate, type: 'date', visibility: 'lg', width: 130 },
    { key: 'status', label: 'Signature Status', value: (r) => r.signatureStatus, type: 'badge', tone: (r) => SIGNATURE_TONE[r.signatureStatus], mobile: 'badge', width: 150 },
  ];
  protected readonly trackById = (r: SignatureListItem) => r.contractId;
  protected readonly rowActions = (): MenuItem[] => [{ id: 'open', label: 'Open signing panel', icon: 'pen-tool' }];
  protected readonly signatureTone = SIGNATURE_TONE;
  protected readonly signerTone = SIGNER_TONE;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly partyOptions = toOptions(['Customer', 'Company', 'Counterparty'] as const);
  protected readonly busy = signal(false);
  protected readonly sendOpen = signal(false);
  protected readonly signers = signal<SignatoryInput[]>([]);
  protected readonly validSigners = computed(() => this.signers().length > 0 && this.signers().every((s) => s.name.trim() && /.+@.+/.test(s.email) && s.role.trim()));

  protected select(id: string): void {
    this.selected.set(id);
    void this.router.navigate([], { queryParams: { contractId: id }, replaceUrl: true });
  }

  protected openSend(): void {
    const c = this.contract.hasValue() ? this.contract.value() : null;
    const customer = this.refs.customer(c?.parties.customerId);
    this.signers.set([
      { name: c?.parties.primaryContact || 'Authorized Signatory', email: `signatory@${(customer?.code ?? 'party').toLowerCase()}.example`, role: 'Authorized Signatory', party: customer ? 'Customer' : 'Counterparty' },
      { name: 'Abdullah Al-Faisal', email: 'abdullah.faisal@gfs.sa', role: 'Operations Director', party: 'Company' },
    ]);
    this.sendOpen.set(true);
  }

  protected patch(i: number, key: keyof SignatoryInput, value: string): void {
    this.signers.update((list) => list.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)));
  }

  protected addSigner(): void {
    this.signers.update((list) => [...list, { name: '', email: '', role: '', party: 'Customer' }]);
  }

  protected removeSigner(i: number): void {
    this.signers.update((list) => list.filter((_, idx) => idx !== i));
  }

  protected async send(): Promise<void> {
    const id = this.selected();
    if (id && (await this.run(this.api.send(id, this.signers()), 'Sent for signature.'))) this.sendOpen.set(false);
  }

  protected record(signatoryId: string, event: 'Viewed' | 'Signed' | 'Declined'): void {
    void this.run(this.api.record(signatoryId, event), event === 'Signed' ? 'Signature recorded.' : event === 'Declined' ? 'Signatory declined.' : 'Marked as viewed.');
  }

  protected download(it: SignatureListItem): void {
    const lines = [`Executed contract ${it.contractNumber} — ${it.contractTitle}`, `Version: ${it.envelope?.finalVersion}`, `Execution date: ${it.executionDate}`, '', 'Signatures:', ...it.signatories.map((s) => `${s.order}. ${s.name} (${s.role}, ${s.party}) — ${s.status} ${s.signedAt ?? ''} IP ${s.ipAddress ?? ''}`)];
    downloadFile(`${it.contractNumber}-executed.txt`, lines.join('\n'), 'text/plain');
  }

  protected async run(work: Observable<unknown>, message: string): Promise<boolean> {
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
