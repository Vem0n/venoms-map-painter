# Changelog

## v2.2.1 — Hegemony Support & Inspect Selection

- Fixed provinces missing from the title hierarchy when their titles are nested under a hegemony (`h_`). Inspect now shows a green Hegemony dot and supports highlighting and following hegemony territory across province clicks.
- Fixed UTF-8 byte-order marks being included in the first parsed title key.
- Gave Inspect priority over lasso selection for clicks, Shift-clicks and drags, preserving the existing lasso selection when switching back to Paint.

## v2.2.0 — Map Editing, Save Safety & Automated Releases

- Fixed forgetting Workshop folders on Windows when filesystem-normalized paths differ in casing or use short-name aliases; offline folders can still be removed from the project list.

- Added GitHub Actions builds for Windows installer/portable/ZIP and Linux AppImage/DEB/RPM. Version tags create draft releases for review with changelog sections, source commit SHA, SHA-256 checksums and automated VirusTotal scans of the exact Windows EXEs.

- Replaced custom UI icons with a consistent, locally vendored Tabler Outline subset, including clearer sidebar tools and distinct project/draft file actions. Added sidebar button accessibility labels, upstream source mapping and the full MIT notice bundled with releases; no npm dependency was added.

- Hierarchy visualization now keeps the chosen tier active across province clicks, automatically following the new county/duchy/kingdom/empire. Missing assignments clear stale outlines while retaining the tier; explicit clear actions and map/draft loading exit the mode.

- Added clickable de jure county/duchy/kingdom/empire visualization in Inspect: glowing active tier dots, shader outlines around each title’s combined territory (including disconnected pieces), dimmed unrelated land and a clear action. Visualization is read-only and uses current province colors and explicit pending-parent assignments.

- Gave Harmonize an independent color tile seeded from the first selected province, with a visual picker, RGB/hex entry and saturation strength. Palette generation respects that saturation and excludes both existing province colors and duplicates within the new palette.

- Added a persistent Projects picker: scan game Workshop folders for map-bearing mods, read descriptor names, search and rescan projects, and open maps or project drafts without looking up Workshop IDs. Master metadata lives in app user data; scans never modify mod files.
- Added persistent save-error logs and a recovery dialog with the actual log path, draft recovery actions and an explicit exit without saving. Log-writing failures show the original error and never block an explicit close.
- Guarded dirty tab × closure with Cancel, Don't Save and Save Draft & Close. Failed saves keep tabs open with a visible retryable error; tab and window closure now share one guard in single- and multi-tab mode.
- Moved all ID-drift checks before orphan removal so every required save confirmation precedes reconciliation and file writes; cancelling any save dialog leaves files and backups untouched.
- Changed Ctrl+S to Save Draft and Ctrl+Shift+S to Save to Mod, with explicit labels and tooltips.
- Drafts now preserve province definitions, metadata edits and staged title renames without modifying mod files; applying a draft confirms the target and warns about definition drift.
- Fixed cancelling a draft picker redirecting later saves to the selected mod, and stopped close/navigation after a failed draft save.
- Added an always-visible Keep All & Save orphan action; parent-title deletion follows the actual province selection and is validated before writing.

- Fixed cross-mod writes in multi-tab mode: saves, reconciliation, province creation, title renames and metadata reads now explicitly target their mod directory. Missing or unloaded targets are rejected.

- Fixed Voronoi province picking being intercepted by the lasso tool; explicit color/province picking now takes priority over lasso, including Shift-clicks.

- Updated Electron to 44.7.0, electron-builder to 26.17.0, Vite to 7.3.7, and Vitest to 5.0.4; refreshed the transitive dependency lockfile.
- Replaced sharp with dependency-free pngjs, keeping PNG processing in workers and avoiding Electron/Linux native-library crashes.
- Pinned direct dependencies, documented Node 24 LTS/npm 12 requirements, and added a seven-day release cooldown with version-specific install-script approvals.
- Overrode global-agent to 4.1.3 to remove an unpatched sprintf-js dependency from the packaging toolchain.
- Added explicit Electron binary setup to development/preview commands and made packaging rebuild the app first.
- Added real PNG worker checks for exact RGB values, 24-bit output and 16-bit heightmaps, plus an Electron UI/preload/IPC smoke test.

## v2.1.0-beta — Multi-Tab, Cross-Tab Copy-Paste & Close Guard

### New Features

**Multi-Tab Editing**
Open up to 4 maps simultaneously in separate tabs. Each tab runs a fully isolated instance with its own engine, registry, undo history, and pending provinces. Switch between tabs freely — only the active tab renders, keeping GPU usage in check. Tab labels auto-update to the loaded mod folder name, and a dirty indicator (•) marks tabs with unsaved changes.

**Cross-Tab Copy-Paste**
Copy provinces or arbitrary pixel regions from one tab and paste them into another. Two selection modes are available:
- **Province mode** — Selects entire provinces within the lasso polygon. Only pixels belonging to those provinces are copied.
- **Normal mode** — Selects all non-empty pixels within the lasso polygon regardless of province boundaries.

Hit **Copy** on the selection action bar (or use the toolbar), then **Ctrl+V** in any tab to enter paste mode. A draggable preview appears at screen center — position it, then **Accept** to write the pixels.

**Paste Resize & Rotate**
Scale and rotate the paste buffer before committing. The floating paste toolbar provides:
- **Scale**: ±10% step buttons, or click the percentage to select scale for fine adjustment
- **Rotation**: ±15° step buttons, or click the degree value to select rotation for fine adjustment
- **Ctrl+Scroll**: Fine-grained adjustment (~2% scale or ~2° rotation per tick) for whichever mode is active
- **Keyboard**: `-`/`+` for scale, `[`/`]` for rotation, `0` to reset

All transforms use nearest-neighbor interpolation to preserve exact RGB province colors — no blending or anti-aliasing that would create invalid mixed colors. New/unknown colors encountered during paste are auto-registered as pending provinces.

**Multi-Tab Close Guard**
When closing the app with unsaved changes across multiple tabs, a global dialog lists all dirty tabs with checkboxes. Select which tabs to save, then saves run sequentially before the app closes. Unselected tabs are discarded. In single-tab mode, the existing per-tab unsaved draft dialog is used instead.

### Improvements

**Selection Action Bar**
The floating action bar during lasso selection now includes a mode toggle (Province/Normal), a Copy button, and shows the Harmonize option only in Province mode. The bar appears whenever provinces are selected regardless of the active tool.

### Shortcuts

| Key | Action |
|-----|--------|
| `L` | Lasso select |
| `Ctrl+V` | Paste from clipboard |
| `-` / `+` | Scale paste ±10% |
| `[` / `]` | Rotate paste ±15° |
| `0` | Reset paste transforms |
| `Ctrl+Scroll` | Fine-adjust active paste parameter |
| `Escape` | Cancel paste / clear selection |

---

## v2.0.0 — Lasso Selection, Voronoi Generation & Draft System

### New Features

**Lasso Multi-Select**
Draw a freehand polygon to select multiple provinces at once. All provinces within the lasso are highlighted with a distinct blue overlay. Shift-click individual provinces to add or remove them from the selection. A floating action bar appears while provinces are selected with the following actions:
- **Harmonize Colors** — Repaints all selected provinces with a cohesive palette derived from the current brush color's hue. Fully undoable.
- **Clear Selection** — Dismisses the selection and overlay.

**Voronoi Province Generator**
A new province generator tool lets you place seed points on the map and generate Voronoi regions as province outlines. Seeds can be placed manually or auto-distributed using Poisson disk sampling. Configure cell count, minimum spacing, and color assignment before confirming. Each generated region becomes a new pending province, fully integrated with undo/redo and the Pending Provinces tab.

**Draft Save & Load**
Save your in-progress work as a named draft at any point without writing to your mod files. Drafts preserve the full map image, all pending provinces, save options, and locked/empty color state. Load a draft later to resume exactly where you left off. An unsaved-changes guard warns before closing, opening a new map, or loading a draft over modified work.

**Sector Spatial Index**
An internal spatial index accelerates all province-color lookups across the map. Lasso selection, harmonize, Voronoi seed collection, and undo/redo tile rescans all use the sector index to avoid scanning the full map, keeping operations fast.

**Save Mutex**
Concurrent Ctrl+S presses are now blocked — a second save cannot begin until the first completes, preventing race conditions during orphan detection, reconcile, and drift checks.

### Improvements

**Save Options per Province**
The Pending Provinces tab now shows a per-session "On Save" options panel. `definition.csv` entries are always written (required), while history file stubs, landed titles entries, and terrain entries are individually toggleable checkboxes.

**Harmonize Palette from Brush Color**
The Harmonize Colors action now derives its palette from the hue of the currently selected brush color rather than averaging the hues of the selected provinces. This gives you direct control over the color scheme — pick your target hue in the brush, then harmonize.

**More Distinct Selection Overlay**
The lasso selection highlight is now significantly more visible: fill alpha raised from 60 → 120, border alpha raised from 180 → 230.

**Undo/Redo + SectorManager Integration**
Undo and redo now correctly rescan the spatial index after restoring tile snapshots. Harmonize undo/redo also properly re-keys pending province color entries when color remaps are reversed or reapplied.

---

## v1.1.0 — Paint-First Provinces & Quality of Life

### New Features

**Paint-First Province Auto-Registration**
Provinces are now assigned an ID the moment you paint with a new color — no need to visit the Create tab first. Just pick a color, paint your province, and VMP handles the rest. The Create tab becomes an optional editor for filling in names, culture, religion, and other details whenever you're ready.

**Pending Provinces Tab**
A new 4th sidebar tab tracks every province created but not yet saved to disk. Each entry shows a color swatch, ID, name, and a "needs details" indicator for provinces missing culture/religion. You can:
- Edit any pending province inline (opens in the Create tab with pre-filled fields)
- Remove pending provinces before saving
- Choose which file stubs to generate on save (definition.csv, history, landed titles, terrain)
- Undo and redo now fully track pending province state. Undoing a paint stroke that created a new province removes it from the pending list; redo re-adds it.

### Bug Fixes

**Fixed false orphan detection on save**
Provinces whose color happened to match a "Define Empty" color were incorrectly flagged as orphaned during save, even when they had pixels on the map. The orphan scan now correctly counts all province pixels regardless of empty color definitions.

**Fixed portable build failing to load images**
The packaged portable app would fail with `Cannot find module 'sharp'` when launched from a directory other than its install location. The sharp native module path is now resolved at startup rather than relying on Node's working-directory-based module resolution.

**Reconcile no longer blocks saves for placeholder provinces**
Mods with placeholder provinces in history/location files that don't exist on the map were forced to reconcile before saving. You can now uncheck all detected orphans and proceed with a normal save — the reconcile and renumber logic is skipped entirely when nothing is selected.

### Improvements

**Unified backup directory**
All backups now go to a single `<mod>/VMP-Backups/` folder instead of being scattered across `map_backup/`, `backups/`, and inline `.bak` files. Each operation creates a timestamped subfolder (`load_`, `save_`, `reconcile_`) that mirrors your mod's directory structure, making it easy to find and restore any previous state.

---

## v1.0.1 — Reconcile & Renumber

### New Features

**Province Deletion & Reconciliation**
On save (Ctrl+S), VMP scans the map for orphaned provinces — entries in definition.csv that have zero pixels on the map. A reconcile dialog lets you select which orphans to remove, then renumbers all surviving province IDs sequentially to prevent gaps (which CK3 does not handle well). The reconcile operation cleans up:
- `definition.csv` — removes orphaned rows, renumbers IDs
- `history/provinces/*.txt` — removes orphaned blocks, remaps province IDs in headers
- `common/landed_titles/*.txt` — removes orphaned barony/parent blocks, remaps `province = X`
- `common/province_terrain/*.txt` — removes orphaned lines, remaps IDs
- `gfx/map/map_object_data/*.txt` — removes orphaned locator blocks, remaps IDs
- `map_data/default.map` — remaps province ID ranges for sea_zones, lakes, etc.

All affected files are backed up before any changes are made.

---

## v1.0.0 — Initial Release

Core province map painting tool for CK3 mods. WebGL2 tile engine, flood fill, brush, eraser, eyedropper, province lock, border respect, define empty, hover inspect, province inspector, province creator with advanced options, realm palette generator, and full mod file generation.
