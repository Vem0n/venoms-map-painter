# Changelog

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
