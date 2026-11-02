# U22 tooltips and U31 phone-nav focus: report

Round `uip-uptime-u22-tooltips-1`, branch `cloud/uip-uptime-u22-tooltips-1`, on Uptime main `690ff55a867bcbac403c3f236ade9cac2a2d5c8b`.
Source of the layer: `just-every/run-happytohelp` `3710a4b4bf06b83246463c76024917e3ade1870f`, `src/modules/tooltip/` (published Base
has no tooltip module, so the H19 source is carried directly). All captures are from the real app (`rer demo`, headless
Playwright 1.64.1, real HOME, fresh contexts, `--use-mock-keychain --password-store=basic`); nothing is simulated except the
existing test-only management edge the repo's own owner-editor test uses, so the inherited launcher renders.

## Outcome 1: one mounted layer, cleaned up, no native titles

- `src/ui/operator-tooltips.tsx` mounts `installTooltips(document)` once from the root route while the path is under `/app` and
  calls its cleanup when the router leaves `/app` and on `uptime:console-closed` (sign-out). The console, monitor page and New/Edit
  forms swap routes inside that one mount; the layer is event-delegated, so menus, dialogs, redrawn lists and Settings areas need no
  per-view code and no remount.
- `public/assets/tooltip.{js,css}` + `tooltip-README.md` are the H19 files. Changes: types removed (mechanical `transpileModule`),
  one `:root` block of Uptime colours and type in `tooltip.css`; README byte-identical. Header comments carry the commit and sha256.
- Markup goes through `tip()` in `public/console-format.js`, which serialises the module's own `tooltip()`. `src/ui/editor.html`
  carries the same attributes literally. The only native `title` on an adopter (category remove) is removed.
- Probe: `proof/after/refresh-60s.json`, `proof/after/behaviour.json`.

## Outcome 2: sweep of the current app

`proof/INVENTORY.md` lists the seven icon-only controls the current app renders, with source, name and row description, and the
controls that have visible text and so need none. Sweep result after the change: 0 untipped icon-only controls on Monitors (default,
one ticked, filter chip), monitor page, Edit and New monitor (all variants), Settings (five areas), Locations and six dialogs, at 1440
and 390. Row-selection checkbox, select-all, filter chip x, category x, "?" disclosures and rule x are covered; the inherited
Run Edit Run launcher (Base widget in a shadow root) is covered by `src/editor/launcher-tooltip.ts` without editing Base's copy.

## Outcome 3: behaviour in the real app

`proof/before/` and `proof/after/`: hover (1440), keyboard focus (1440, 390) and touch long press (390) for each surface;
`proof/launcher-before/`, `proof/launcher/` for the launcher. Before: no tooltip anywhere (the launcher and category x show only a
native `title`). After, from `proof/after/behaviour.json` (19 checks, all pass) and `captures.json`:

- hover: none at 120 ms, shown by about 600 ms; focus: shown at once; long press: shown at 800 ms and not at 250 ms.
- name equals tooltip text; row context is the accessible description ("Select monitor" described by "Checkout API").
- a normal tap/click still acts (box ticks, chip removes the filter, disclosure opens, rule row is removed); a long press shows the
  tooltip and does not act (box stays unticked, filter stays).
- Escape, leaving and scrolling dismiss; the long-press tooltip leaves by itself.
- tooltips clamp to 8 px from the viewport edge (390: `[8, 303, 122, 333]`, launcher at the bottom-right corner) and are in the browser
  top layer (above dialogs, outside clipping ancestors). No icon-only control renders inside a dialog today, so there was nothing
  real to show in one; the layer is the module's popover layer either way.
- 60 s background refresh (`refresh-60s.json`, 106 and 18 API reads): Filter menu open with a chip and a focused row box at 1440;
  scrolled monitor page with the Reports fold and Add a rule menu open at 390. Menu, focus, scroll position (420), node identity and the
  single tooltip layer element were identical at 0, 10, 23, 36, 49 and 62 s, and the layer still answered afterwards.

## Outcome 4: U31 phone navigation focus

Finding: the defect named in the brief does not exist on fresh main. U21's shell round already replaced the sideways-scrolling pill
row with a wrapping one (`public/app-theme.css`, ≤700 px: "Nothing scrolls sideways"); no nav ancestor has an `overflow` other than
`visible` at 320, 379 or 390, and the Tab pass finds no ring cut by any ancestor or the viewport. So no CSS was changed (an inset
offset would change the accepted focus look to cure nothing), and the failing "before" case cannot be reproduced; `proof/u31-before/`
(main, no change) and `proof/u31-after/` (this branch) are the same passing pass. `tab-pass.json` per file: for the Monitors menu,
the Settings menu and the New monitor form at 320, 379 and 390, a real Tab key pass visits every pill (first, middle, last,
including Sign out), each ring (3 px, offset 2 px) fully inside the viewport and unclipped (`allUnclipped: true`), and Enter on
the Locations pill navigates to `/app/locations`. If the owner still sees a clipped ring, the case differs from the recorded one and
needs its steps.

## Outcome 5: checks (all on the committed head, m1-runner through heavy-slot)

`rer install`, `pnpm typecheck` (app and runner), source-lock `check` (regenerated with `cli.mjs lock`), `contract-docs.mjs check`
(no contract change, current), `rer build`, `pnpm spec:check` (match the build), `rer check --profile first-party` and the existing
`tests/owner-editor-browser.mjs` (launcher mount, renewals, role loss) all exit 0 together. `tests/browser-suites.mjs` (the console's browser
suites) also exits 0 on the same head. No test was added, changed or weakened; no migration, contract, status or Base file changed,
so the migration ledger and generated listings have nothing to regenerate beyond the lock.

## One probe per named outcome (mechanical / per-POINT handoff)

| POINT | Public-door probe | Where |
|---|---|---|
| 1 mount once, clean up, no titles | `/app/*` documents show exactly one `.ui-tooltip`, same element for 62 s; `title` absent | `after/refresh-60s.json`, `launcher/launcher.json` |
| 2 every icon-only control | sweep: 0 untipped across the surfaces above; inventory | `INVENTORY.md` |
| 3 hover/focus/long press/tap/dismiss/60 s | the captures and 19 behaviour checks | `before/`, `after/`, `launcher*/`, `behaviour.json` |
| 4 U31 Tab pass 320/379/390 | real Tab and Enter | `u31-before/`, `u31-after/` |
| 5 checks, no new tests | the chain above | this file |

## Observations, not repaired (outside U22/U31)

- A burst of automated page loads makes the dev server answer module requests with 429 (public rate limit), after which the console
  does not boot (Settings then shows the Monitors menu). It is the limiter, not the app, and the capture scripts waited it out.
- In `rer demo`, the demo-only "Run Uptime" link overlaps the Sign out pill at 320 px.
- The Edit monitor rules had a hidden name only; they now name themselves through the same tooltip text.
