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

_legacy/                   # original HTML/JSX prototype — reference only
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

## Migration status

Two features are fully migrated as templates:

- ✅ **Home** (`app/page.tsx` + `features/home/`)
- ✅ **Revenue Gap** (`app/gap/page.tsx` + `features/revenue-gap/`) — exercises `DataTable`

The remaining 12 routes are stubs that render `<ComingSoon legacyFile="…"/>`.
The stub points at the original JSX so the migrator knows where to look.

### To migrate a feature

1. **Data first.** Extract any feature-specific mock data from the legacy file
   into `lib/data/<name>.ts`. Type it against `lib/types.ts` — add new
   interfaces there if needed. **No React imports** in `lib/`.

2. **Pure helpers.** Calculation logic goes in `lib/calc.ts` (or a sibling).
   Should be plain functions, no globals, fully typed.

3. **Feature components.** Create `features/<feature>/` and split the screen
   into small files. Use `components/ui` and `components/table` as building
   blocks — don't reinvent buttons or tables. If a component looks like it
   belongs in `components/ui`, lift it.

4. **The page.** Replace the stub at `app/<route>/page.tsx`:

   ```tsx
   import { Page, PageHeader } from "@/components/layout";

   export default function MyFeaturePage() {
     return (
       <Page>
         <PageHeader eyebrow="Build model" title="My feature"/>
         {/* compose from features/<feature>/ */}
       </Page>
     );
   }
   ```

5. **Routing.** Adjust the matching `SubNav` item in
   `app/build/layout.tsx` or `app/annual/layout.tsx` if labels change.

### Migration backlog

| Route                  | Legacy file                                              |
| ---------------------- | -------------------------------------------------------- |
| `/build`               | `screens-build.jsx`                                      |
| `/build/services`      | `inputs-services.jsx`                                    |
| `/build/salary`        | `inputs-shared.jsx`                                      |
| `/build/operating`     | `screens-operating.jsx`                                  |
| `/build/cap`           | `screens-cap.jsx`, `cap-engine.jsx`, `data-cap.jsx`      |
| `/build/workload`      | `inputs-pattern.jsx`                                     |
| `/build/costs`         | `screens-cost-of-service.jsx`, `calc-engine.jsx`         |
| `/build/policy`        | `screens-recovery-policy.jsx`                            |
| `/build/feestudy`      | `screens-fee-schedule-v4.jsx`                            |
| `/annual`              | `screens-annual.jsx`                                     |
| `/annual/refresh`      | `screens-annual.jsx` (AnnualRefreshScreen)               |
| `/annual/sections`     | `screens-annual-sections.jsx`                            |
| `/annual/changes`      | `screens-annual-changes.jsx`                             |
| `/annual/packet`       | `screens-annual.jsx` (AnnualPacketScreen)                |

### Things to drop on the way over

- `window.AFFERENT_DATA` / `window.AFFERENT_EXT` / `window.AFFERENT_NAV` —
  use ESM imports.
- `Object.assign(window, …)` at the end of every file — components export
  themselves directly.
- In-browser Babel — Next.js compiles everything.
- Inline `oklch()` accent recomputation from the Tweaks panel — accent tokens
  are static for now; reintroduce as a CSS class swap if needed.
