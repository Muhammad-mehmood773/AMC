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
- Contextual help: pass `[help]` to `<amc-form-field>`; content lives in the feature's
  `data/field-help.ts`. Only add help where it explains a purpose or business rule.
