# Afferent

Cost-of-service / revenue intelligence app for the Town of Los Altos Hills.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5**
- CSS variable design tokens (no CSS-in-JS lib, no Tailwind)
- `next/font` for Inter Tight + IBM Plex Sans/Mono

## Running it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Project structure

```
app/                       # Next.js App Router pages
  layout.tsx               # root layout: fonts + <TopBar/>
  page.tsx                 # Home (/)
  gap/page.tsx             # Revenue Gap (/gap)
  build/                   # /build — Build Model workflow
    layout.tsx             # SubNav for build/*
    page.tsx               # overview (stub)
    {services,salary,operating,cap,workload,costs,policy,feestudy}/page.tsx
  annual/                  # /annual — Annual Update workflow
    layout.tsx
    {refresh,sections,changes,packet}/page.tsx

components/
  ui/                      # Btn, Stat, RecoveryMeter, DeptChip, Icon,
                           # SectionLabel, Card
  layout/                  # Page, TopBar, SubNav, PageHeader
  table/                   # DataTable (sortable, filterable, drilldown-ready)

features/                  # One folder per feature, screen-level components
  home/                    # EntryCard, AuditTrail, ModelInputs
  revenue-gap/             # AnswerHeader, DriverBreakdown, DeptRecoveryChart, TopFixesTable
  _shared/                 # ComingSoon (used by stub pages)

lib/
  types.ts                 # all domain interfaces (Service, Department, …)
  format.ts                # fmt.dollars / dollarsK / pct / int
  signals.ts               # signalFor() — recovery % → tone
  calc.ts                  # enrichServices, topFixes
  data/                    # pure data modules — NO React imports
    city.ts
    departments.ts
    services.ts
    citywide.ts
    activity.ts

styles/
  tokens.css               # design tokens (colors, type scale, spacing)
```

## Design tokens

All visual constants live in `styles/tokens.css` as CSS custom properties.
Never hardcode a hex, never invent a new font size — pick from the scale. The
token ladder, top to bottom:

- **Paper** — `--canvas`, `--paper`, `--paper-2`, `--paper-3` (page bg sits *below* card bg).
- **Ink** — `--ink`, `--ink-2`, `--ink-3`, `--ink-4`.
- **Accent / brand** — `--accent`, `--accent-tint`, `--navy`, `--charcoal`.
- **Signal** — `--neg`, `--warn`, `--pos` (plus matching `-tint` variants).
- **Type scale** — `--t-l1` through `--t-l9` with paired weight tokens.
- **Spacing** — `--s-1` (4px) through `--s-8` (40px).
- **Geometry** — `--page-max`, `--page-padX`, `--section-gap`.

Numeric content uses `.num` (tabular nums) or `.mono` (full mono).
Display headings use `.display` (Inter Tight + tight tracking).
