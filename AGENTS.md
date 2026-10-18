# AGENTS.md

## Environment
- Angular 22 + Tailwind CSS v4, zoneless, standalone components, signals.
- The Angular CLI requires Node ≥ 24.15 (or ≥ 22.22.3). On older Node, invoke the CLI bootstrap
  directly to skip the version gate: `node node_modules/@angular/cli/bin/bootstrap.js <command>`.

## Verification
- Build (prod): `npm run build` (or `node node_modules/@angular/cli/bin/bootstrap.js build`)
- Lint: `npm run lint`
- Tests (Vitest): `npm test -- --watch=false`
- Dev server: `npm start` → http://localhost:4200 (redirects to `/app/customers/dashboard`)

## Conventions
- Design tokens live in `src/styles/tokens.css`; dark overrides, density/font variables and the
  `amc-*` component utilities (`@utility`) live in `src/styles/base.css`. Tailwind v4 only allows
  `@apply` of utilities, so reusable classes must be declared with `@utility`.
- Avoid `!`/bracket characters in Angular `[class.x]` bindings; use `[class]="cond ? '…' : '…'"`.
- Shared UI primitives: `src/app/shared/ui/*` (data table, dialog, filter bar, form field, tabs…).
- App shell (sidebar, header, appearance panel, navigation config): `src/app/layout/*`.
- Feature modules: `src/app/features/<feature>/` with `models/`, `data/` (abstract API contracts +
  `mock/` implementations bound in a `provide…Data()` function at route level), `components/`, `pages/`.
- Downstream-module actions (create contract, work order, asset…) go through `ModuleHandoff`.
- User-maintainable lists use the generic lookup mechanism (`src/app/shared/lookups`): register the
  type in the feature's `LOOKUP_TYPES` registry (`editable: true` enables inline Add/Edit) and bind
  the field with `<amc-lookup-select [type]="…">`. Fixed/system lists (statuses, priorities,
  access levels, master data owned by other modules) stay plain `<amc-select>`.
- Asset / Installed Base (`features/assets`, SRS 3): mock seed is derived from the customer/site
  seed (`buildSeed()`), so customer, site, agreement and asset IDs (AST-00001…) match Customer 360.
  Business rules (tag/serial uniqueness, status transitions, warranty/PM windows, criticality
  profile, category-specific technical fields) live in `data/asset.config.ts`. Service actions
  (SR / WO / maintenance) go through `AssetHandoff`, which shows the entitlement check first.
  Asset labels use the offline `<amc-qr-code>` / `<amc-barcode>` (`shared/ui/codes.ts`).
- Service Catalog & Entitlements (`features/catalog`, SRS 4): seed derived from `buildSeed()`
  (entitlements built from the customer agreements, IDs SVC-<code>, ENT-00001…). Rules live in
  `data/catalog.config.ts` (expiring window, near-limit %, coverage-type service types / labor-parts
  defaults). Price resolution (most specific effective rule wins), SRS 4.12 entitlement validation
  and automatic usage updates are in `mock/mock-catalog-apis.ts`.
- Contract Lifecycle Management (`features/contracts`, SRS 5): contracts are seeded from the customer
  agreements (same CON-/AMC- numbers, sequence starts at 00100) plus vendor contracts (VEN-…);
  catalog services/entitlements come from `buildCatalogSeed()`. Approval levels, alert intervals,
  allowed status actions and FX for portfolio totals live in `data/contract.config.ts`. Workflow
  rules (review → approval → e-signature → activation, versioning, amendments, renewals,
  terminations, obligations) are enforced in `mock/mock-contract-apis.ts`. Customer "Create
  Contract" hand-off opens `/app/contracts/new?customerId=…`.
- AMC / Service Contract Management (`features/amc-agreements`, SRS 6): one operational AMC per CLM
  contract of type "AMC Contract" (same id, `parentContractId` links back). Schedule generation
  (non-working days / holidays), approval limit, usage alert %, cost model and billing periods live
  in `data/amc.config.ts`. Consumption is derived from completed covered visits; coverage
  validation (SRS 6.20) is `CoverageApi.validate`. Shared rules (operational check, territory
  validation, activation, visit completion) are in `AmcOps` (`mock/mock-amc-apis.ts`).
- SLA Management (`features/sla`, SRS 7): standard SLAs keep the master-data ids (SLA-PLT/GLD/SLV/BRZ);
  AMC SLAs (SLA-A-…) are generated for active AMCs; clocks run on the customer seed's service
  requests / corrective work orders. Business time (working days, breaks, holidays, time zones,
  excluded pauses) is in `data/sla-time.ts`; selection/validation (SRS 7.12 / 7.21), target sync
  and automatic breach + escalation detection (`tick`, run on every read) are in
  `mock/sla-engine.ts`. Clocks snapshot their target so SLA edits never change history.
- Preventive Maintenance (`features/preventive-maintenance`, SRS 8): plans are seeded from active AMC
  service plans plus standalone meter / condition / calendar / event plans. Recurrence (time and
  calendar rules, weekend / holiday adjustment) is in `data/pm-recurrence.ts`; generation without
  duplicates, automation (`automate`: horizon generation, work orders X days before due,
  auto-assign, overdue escalation, auto-missed — run on every read), SRS 8.26 validation and
  completion rules are in `mock/pm-engine.ts`. Rules/limits live in `data/pm.config.ts`.
- Service Request Management (`features/service-requests`, SRS 9): requests are seeded from the
  Customer 360 / asset service-request rows (same SR- ids) plus PM-generated, internal and
  follow-up requests. Classification, priority scoring, coverage/SLA resolution (through the SLA
  module's selection engine), routing, duplicate detection and automation (`runAutomation`:
  escalations, closure reminders, auto-miss… ) live in `mock/sr-engine.ts`; lifecycle transitions,
  SRS 9.23 business rules and 9.24 validation are enforced in `mock/mock-sr-apis.ts`. Thresholds
  and classification/routing rules live in `data/sr.config.ts`. Customer "Create Service Request"
  opens `/app/service-requests/new?customer=…&site=…`; the asset hand-off prefills `asset=…`.
- Contextual help: pass `[help]` to `<amc-form-field>`; content lives in the feature's
  `data/field-help.ts`. Only add help where it explains a purpose or business rule.
