# U22 source and control inventory

Every icon-only control the current app renders, found by sweeping the running app (not an old list) and cross-checking the
source. "Icon-only" means a button, link, checkbox, radio or `summary` with no visible text of its own. Each now has the
`tip()` markers (`aria-label` = the tooltip text, `data-tooltip`), the shared layer shows the tooltip, and any native `title`
on it is gone.

| # | Control | Where it renders | Source | Name = tooltip | Row context (accessible description) |
|---|---------|------------------|--------|----------------|--------------------------------------|
| 1 | Row-selection checkbox | Monitors list, every row | `public/monitor-list.js` (`monitorRow`) | Select monitor | the row's monitor link (`monitor-link-<id>`) |
| 2 | Select-all checkbox | Monitors toolbar once a monitor is ticked | `public/catalog.js` (`mount`) | Select all monitors | none (it acts on the list) |
| 3 | Filter chip remove (x) | Monitors list, one per applied filter | `public/catalog.js` (`chips`) | Remove filter | the chip's text (`catalog-chip-label-<key>`) |
| 4 | Category remove (x) | Settings > Alerts, Root-cause categories | `public/root-cause-categories.js` (`draw`) | Remove category | the category's text (`category-label-<id>`); native `title` removed |
| 5 | "?" disclosure | Monitor page: Reports ("About coverage"), Failure snapshots ("About snapshots") | `public/monitor-status.js` (`moreInfo`, used by `monitor-folds.js`, `failure-snapshots.js`) | About coverage / About snapshots | none (the fold's own text follows it) |
| 6 | Rule remove (x), six rule rows | New monitor and Edit monitor, and each proposal's copy of the fields | `src/ui/editor.html` | Remove rule | the rule's name (hidden element `rule-name-<rule>`: Page contains, Page must not contain, Pattern, Header equals, JSON value, Responds within); it had a visually hidden name only, no tooltip |
| 7 | Run Edit Run launcher | Every `/app` document when the installation is managed | Base's editor widget (`src/base/modules/editor`, in a shadow root), adopted by `src/editor/launcher-tooltip.ts` without editing Base | Open Run Edit Run / Close Run Edit Run (the widget's own name) | none; its native `title` is removed each time the widget sets it |

## The layer

- `public/assets/tooltip.js`, `tooltip.css`, `tooltip-README.md`: the H19 module from `just-every/run-happytohelp` commit
  `3710a4b4bf06b83246463c76024917e3ade1870f` (`src/modules/tooltip/`). Only syntax changed (types removed, TypeScript 5.9
  `transpileModule`), and `tooltip.css` gained one `:root` block of Uptime's colours and type. The README is byte-identical.
  Source sha256 (read through the GitHub API at that commit; equal to the Base owner's manifest): `tooltip.ts`
  `eae2c372d0d8d73abea4f817927bba83c68f05c54fa4ef858f4bba711a8e3ea9`, `tooltip.css`
  `c3d6fb51ef434350d10c37a76af5fee8137769513a231e6c4bdd29f54a4fffd9`, `README.md`
  `54a3a2142220d55000d9e6c3462b590cd9b7528df7a546a924800887e68739f4`.
- `src/ui/operator-tooltips.tsx`: mounts `installTooltips(document)` once, from the root route, while the path is under `/app`;
  its cleanup runs when the router leaves `/app` and on `uptime:console-closed` (sign-out). Console, monitor page and the
  New/Edit forms all swap routes inside this one mount.
- `public/console-format.js` `tip()`: the markup form of the module's own `tooltip()`, used by every console-built control.
- `src/ui/tooltip-layer.ts`: loads the module by full URL so the console's modules and the root share one instance.

## Visible text label: no tooltip needed

Navigation pills and links (Monitors, Locations, Settings, Alerts, General, People, Integrations, Backup and files, Sign out),
New monitor, Filter, Run now, Edit, Pause, the "+ Location" and "+ Add a rule" summaries, the rule "Remove" link, Send test,
Edit, Add destination, Add category, row Rename/Remove on Locations, every dialog's Cancel/Close/Save, the fold summaries
(chevron beside their text), the proposal checkbox (its whole summary is its label), and every form checkbox/radio that sits
inside a text label.

## Swept surfaces (1440 and 390, details opened)

Monitors list (default, one ticked, filter open with a chip), monitor page, Edit monitor (every rule added), New monitor
(choose, manual, paste, file, follow), Settings (Alerts, General, People, Integrations, Backup and files), Locations, and the
open dialogs: bulk Edit labels, Pause, Resume, Clone, Plan maintenance, Rename location. After the change every sweep reports
0 untipped icon-only controls; no dialog holds an icon-only control, so none needed a tooltip inside one.
