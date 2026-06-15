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
  console.log("  ✓ default Spinner exposes role=status + aria-label=Loading");
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

// ── 3. Custom size sets inline width / height ────────────────────────────
{
  const html = renderToStaticMarkup(<Spinner size={24}/>);
  // React inlines styles as `style="width:24px;height:24px"` (key
  // order is stable across React versions for `style` objects).
  assert.match(html, /width:24px/, "custom size sets inline width");
  assert.match(html, /height:24px/, "custom size sets inline height");
  console.log("  ✓ custom size sets inline width/height");
}

console.log("\nAll Spinner assertions passed.");
