# Migration Guide

How to port a screen from `_legacy/*.jsx` into the App Router structure used by
Home (`app/page.tsx` + `features/home/`) and Revenue Gap (`app/gap/page.tsx` +
`features/revenue-gap/`). Follow this shape so every screen ends up consistent.

> **Read `node_modules/next/dist/docs/` before writing routing/layout code.**
> Next 16 has breaking changes vs. what's in your training data. Heed deprecation notices.

---

## 1. Folder layout

```
app/<route>/page.tsx          Route entry. Composes a screen from feature parts.
app/<section>/layout.tsx      Wraps a group of routes in a SubNav.
features/<screen>/*.tsx       Screen-specific components. Not reused elsewhere.
features/_shared/*.tsx        Cross-screen feature helpers (e.g. ComingSoon).
components/layout/            Page shell + chrome: Page, TopBar, SubNav, PageHeader.
components/ui/                Reusable primitives: Btn, Icon, Stat, SectionLabel, …
components/table/             DataTable + filter helpers.
lib/data/*.ts                 Plain-object data, one file per domain noun.
lib/types.ts                  Domain types.
lib/calc.ts                   Pure derivations over `lib/data`.
lib/format.ts                 `fmt.dollars/dollarsK/pct/int`.
styles/tokens.css             CSS variables — colors, paper/rule/ink/tones.
```

Path alias `@/*` resolves to repo root (see `tsconfig.json`). Always import as
`@/components/...`, `@/features/...`, `@/lib/...`.

---

## 2. The migration steps

For each `_legacy/screens-<name>.jsx`:

1. **Find or add data.** If the screen reads numbers, locate or create a file in
   `lib/data/` and shape it with a type in `lib/types.ts`. Pure data only — no
   computation, no JSX.
2. **Find or add derivations.** Anything computed from raw data (totals, sorts,
   recommendations) goes in `lib/calc.ts` as a pure function returning a typed
   shape. See `topFixes`, `enrichServices`.
3. **Carve the screen into feature components.** Each visual section becomes
   one file in `features/<screen>/`. One responsibility per file; keep them
   short. Mark `"use client"` only when the file needs hooks, `next/link`
   interactivity, or browser-only APIs (`TopFixesTable` does; `AuditTrail`
   doesn't).
4. **Assemble in `app/<route>/page.tsx`.** Keep page files thin: import
   features + primitives, wire data, lay out with `<Page>` and inline grids.
5. **Replace the `ComingSoon` placeholder** that currently sits in the route.

A page is "migrated" when its `page.tsx` no longer references
`@/features/_shared/ComingSoon`.

---

## 3. The page shell

Every screen wraps its body in `<Page>` from `@/components/layout`:

```tsx
import { Page } from "@/components/layout";

export default function FooPage() {
  return (
    <Page>
      {/* sections */}
    </Page>
  );
}
```

`<Page>` is just `<div className="page">` — the spacing rules live in
`globals.css`. Don't reimplement page padding.

The top-level chrome (`<TopBar/>`) is already mounted in `app/layout.tsx`.
**Do not re-add it per page.**

For nested route groups (`/build/*`, `/annual/*`), the section's
`layout.tsx` adds a `<SubNav>`. To add a new sub-route, append a
`SubNavItem` to the existing array — don't make a new SubNav.

---

## 4. Header conventions

Two patterns. Pick by intent:

### A. Decision screens — `AnswerHeader`
Used when the screen exists to answer **one question** with one big number.
This is the Revenue Gap pattern.

```tsx
<div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: "28px 32px" }}>
  <AnswerHeader
    question="What revenue is the city leaving on the table?"
    answer={`${fmt.dollarsK(annualGap)}/yr`}
    tone="neg"               // neg | warn | pos | info — colors the answer
    sub="Short framing sentence."
    stats={[{ label, value, tone, sub }, …]}   // 2-4 supporting tiles
    actions={<><Btn …/><Btn …/></>}
  />
</div>
```

### B. Working screens — `PageHeader`
Used for routes that exist to *do* something rather than answer a question
(every Build/Annual sub-route).

```tsx
<PageHeader
  eyebrow="Build model"     // section label, ALL CAPS rendering handled by the component
  title="Services"
  subtitle="Optional one-liner."
  actions={<Btn …/>}
/>
```

Home's headline card is a one-off (document-style "report cover"). It is
**not** the template for new screens — use `AnswerHeader` or `PageHeader`.

---

## 5. Sectioning the body

Below the header, each content block is a "card": white paper with a 1px rule.
Two ways to make one:

```tsx
{/* Inline card — fine for one-off layouts */}
<div style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 22 }}>
  <SectionLabel>Where the gap comes from</SectionLabel>
  <DriverBreakdown … />
</div>
```

Side-by-side cards use a 2-column grid: `gridTemplateColumns: "1fr 1fr", gap: 16`.
See Home's "Workflow branch" and Revenue Gap's "Drivers + Dept" rows for the
canonical form.

`SectionLabel` is the small mono label that sits at the top of a card.

---

## 6. Tables

Anything tabular goes through `DataTable` from `@/components/table`. Don't roll
your own `<table>`. See `features/revenue-gap/TopFixesTable.tsx` for the full
shape — columns with `render`, optional `filters` via `deriveDeptFilter` +
`applyFilter`, `defaultSort`, `footerNote`.

Common cell helpers from `components/ui`:
- `<DeptChip code={…}/>` — colored department badge.
- `<RecoveryMeter pct={…} target={…}/>` — recovery bar with target tick.
- `<Stat …/>` — one-up KPI tile.

Format numbers with `fmt.*` from `@/lib/format`. Apply the `num` className to
any numeric span so it picks up tabular figures.

---

## 7. Styling rules

- **Inline styles + CSS variables.** No CSS-in-JS, no module CSS, no Tailwind.
  Colors, paper, rules, ink tones, and accent tones all come from variables
  defined in `styles/tokens.css` — use `var(--paper)`, `var(--rule)`,
  `var(--ink)`, `var(--ink-2)`, `var(--ink-3)`, `var(--neg|warn|pos|accent)`,
  `var(--navy|charcoal)`, etc.
- **Typography.** Three families wired in `app/layout.tsx`: default UI, the
  `.display` class for headlines, `.mono` for eyebrows/labels/codes. Add the
  `.num` class to numeric spans for tabular figures.
- **Eyebrows** use this canonical block — copy it, don't invent variants:
  ```
  fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
  textTransform: "uppercase", color: "var(--ink-3)"
  ```

---

## 8. Server vs. client

Default to server components (no `"use client"`). Add it only when the file:
- uses React state/effects (`TopFixesTable`),
- uses `next/navigation` hooks like `usePathname` (`SubNav`, `TopBar`), or
- needs `next/link` inside an interactive composite (`EntryCard`).

A pure presentational component over plain data (`AuditTrail`, `ModelInputs`,
`AnswerHeader`, `DriverBreakdown`, `DeptRecoveryChart`) stays on the server.

---

## 9. Type and data discipline

- Add new domain shapes to `lib/types.ts`. Reuse `DeptCode`, `Service`,
  `EnrichedService`, etc. rather than inventing parallel types.
- New data files in `lib/data/` must import their type from `lib/types.ts` and
  cite their source in a top-of-file comment (see `services.ts`,
  `citywide.ts`).
- Derivations live in `lib/calc.ts` and must be pure. Never put `useState` or
  side effects there.

---

## 10. Quick reference: where each piece lives

| You want to… | Use |
|---|---|
| Wrap a route body | `<Page>` from `@/components/layout` |
| Add a section subnav item | append to `app/<section>/layout.tsx` |
| Headline + supporting KPIs ("decision screen") | `AnswerHeader` |
| Standard working-screen header | `PageHeader` |
| Section-label inside a card | `<SectionLabel>` |
| Button / link-button | `<Btn kind="primary|ghost" href?=…>` |
| Department badge | `<DeptChip code={…}/>` |
| Recovery bar | `<RecoveryMeter pct={…} target={…}/>` |
| Tabular data | `<DataTable …>` |
| Format $/% / int | `fmt.dollars`, `fmt.dollarsK`, `fmt.pct`, `fmt.int` |
| Mark a not-yet-migrated route | `<ComingSoon legacyFile="…"/>` |

---

## 11. Migration checklist (per screen)

- [ ] Located the legacy file under `_legacy/`.
- [ ] Data extracted to `lib/data/<noun>.ts`, typed via `lib/types.ts`.
- [ ] Derivations in `lib/calc.ts`, pure and typed.
- [ ] One folder under `features/<screen>/`, one file per visual section.
- [ ] `"use client"` only where required.
- [ ] No new CSS files; only inline styles + tokens.
- [ ] No re-implemented `<TopBar>` or `<SubNav>`.
- [ ] Header uses `AnswerHeader` (decision screen) or `PageHeader` (working screen).
- [ ] Numbers formatted via `fmt.*`, numeric spans have `className="num"`.
- [ ] Tables go through `DataTable`.
- [ ] `app/<route>/page.tsx` no longer imports `ComingSoon`.
