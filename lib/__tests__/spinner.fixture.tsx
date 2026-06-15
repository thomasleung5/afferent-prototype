/* Fixture for the Spinner UI atom.
 *
 * Run with: npm run test:spinner
 *
 * The Spinner is rendered beside the "Parsing workbook…" /
 * "Extracting from PDF…" status text while a file upload is in
 * flight. The accessibility contract — `role="status"` + a descriptive
 * `aria-label` derived from the loading text — is what assistive
 * tech keys off, so this fixture pins that contract.
 *
 * The visual is an SVG ring + arc that inherits `currentColor` from
 * the parent text block. The fixture also pins the SVG structure so
 * a regression to the old U-shaped border (or an accidental switch
 * to a hardcoded stroke color) is caught here.
 *
 * We render through `react-dom/server`'s static-markup path so the
 * test stays a pure node fixture (no DOM, no browser). */

import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Spinner } from "../../components/ui/Spinner";

// ── 1. Default ariaLabel is "Loading" ────────────────────────────────────
{
  const html = renderToStaticMarkup(<Spinner/>);
  assert.match(html, /role="status"/,
    "Spinner exposes role=\"status\" for screen readers");
  assert.match(html, /aria-label="Loading"/,
    "default aria-label reads 'Loading'");
  assert.match(html, /class="spinner"/,
    "Spinner uses the shared .spinner class (CSS keyframes in src/index.css)");
  // Default size 12px applies to width / height on the SVG.
  assert.match(html, /width="12"/,
    "default size sets SVG width=12");
  assert.match(html, /height="12"/,
    "default size sets SVG height=12");
  console.log("  ✓ default Spinner exposes role=status + aria-label=Loading at 12px");
}

// ── 2. Custom ariaLabel surfaces (e.g. the loading text) ─────────────────
{
  const html = renderToStaticMarkup(
    <Spinner ariaLabel="Parsing workbook…"/>,
  );
  assert.match(html, /aria-label="Parsing workbook…"/,
    "custom ariaLabel surfaces to assistive tech");
  console.log("  ✓ custom ariaLabel surfaces to assistive tech");
}

// ── 3. Custom size sets SVG width / height ────────────────────────────────
{
  const html = renderToStaticMarkup(<Spinner size={24}/>);
  assert.match(html, /width="24"/, "custom size sets SVG width attribute");
  assert.match(html, /height="24"/, "custom size sets SVG height attribute");
  // viewBox is fixed at "0 0 24 24" — strokes scale with width/height,
  // so the visual stays crisp at any size.
  assert.match(html, /viewBox="0 0 24 24"/,
    "fixed viewBox lets the SVG scale crisply at any size");
  console.log("  ✓ custom size sets SVG width/height");
}

// ── 4. SVG shape is a ring track + sweeping arc ──────────────────────────
//
// Regression guard for the U-shaped border this Spinner replaced. The
// new visual is a faint full circle (the "track") plus a denser path
// arc (the "sweep"). Both strokes use `currentColor` so they inherit
// from the parent text block — no hardcoded colors.
{
  const html = renderToStaticMarkup(<Spinner/>);
  assert.match(html, /<circle\b/,
    "track is rendered as a <circle>");
  assert.match(html, /stroke-opacity="0\.25"/,
    "track uses reduced opacity so the moving arc reads as foreground");
  assert.match(html, /<path\b/,
    "sweep arc is rendered as a <path>");
  assert.match(html, /stroke-linecap="round"/,
    "arc ends are rounded — readable even at the 12px default");
  // Stroke color must be currentColor (inherited), never a literal hex
  // or token reference — that's how the import card's --ink-3 treatment
  // flows in. Spot-check: no stroke="#..." anywhere.
  assert.doesNotMatch(html, /stroke="#/,
    "strokes never hardcode a color — currentColor inheritance is the contract");
  // The old border-based markup should be gone — no inline `border`
  // style smuggled through, no border-radius:50% on the wrapper.
  assert.doesNotMatch(html, /border:/,
    "no leftover inline border declarations from the U-shape implementation");
  console.log("  ✓ SVG shape: faint track + sweeping arc, both currentColor");
}

console.log("\nAll Spinner assertions passed.");
