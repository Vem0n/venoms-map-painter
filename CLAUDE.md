# Ven0m's Map Painter

Desktop Electron app for painting CK3 mod province maps. Load a mod directory, paint provinces onto `provinces.png`, and the tool auto-generates definition.csv, landed_titles, and history files.

## Tech Stack

- **Electron** (main + renderer) with **TypeScript** strict mode
- **WebGL2** raw canvas for tile-based map rendering (no framework)
- **React** for UI panels only (canvas is imperative)
- **pngjs** for PNG I/O in short-lived workers, **electron-vite** for bundling
- **vitest** for tests, **electron-builder** for packaging

## Architecture

**Main process** (`src/main/`): File I/O, IPC handlers, lossless pngjs worker PNG load/save, Paradox script parser, mod file manager (definition.csv, landed_titles, history stubs).

**Renderer** (`src/renderer/`):
- `engine/` — TileEngine (512×512 tile chunks, WebGL2 textures, camera pan/zoom, viewport culling, dirty tracking, undo/redo via tile snapshots)
- `registry/` — ColorRegistry (RGB↔Province bidirectional map, golden ratio color generation, palette generator)
- `tools/` — FloodFill (iterative scanline), Brush (circular + Bresenham interpolation), Eraser (paints first "Define Empty" color, respects Province Lock), ToolManager
- `ui/` — React shell: App layout with animated tab bar, VerticalToolBar with brush size flyout and Hover Inspect toggle, ProvinceInspector, ProvinceCreator (with Advanced wizard), ColorPicker, ProvinceSearch, StatusBar

**Shared** (`src/shared/`): Types (RGB, ProvinceData, rgbToKey/keyToRgb), constants (TILE_SIZE=512), IPC channel names, electron.d.ts for preload API.

## Tool Behaviors

- **Hierarchy visualization**: Inspect county/duchy/kingdom/empire titles toggle an independent shader layer; active tier dots glow. The R8 256³ exact-RGB lookup outlines the union, samples adjacent tile textures to avoid seams, dims unrelated land, and never changes pixels/dirty state. The selected tier follows subsequent province clicks, including staying enabled (with no stale outline) across missing tiers/unassigned/empty pixels. Esc, repeated click or map badge × exits; map/draft loads reset it through the exposed selection setter. `indexTitleHierarchy` resolves current registry title identities and explicit pending parents; unassigned pending IDs must never inherit old hierarchy ownership. Registry revision caches this index across cursor moves.

- **Harmonize** uses its own color tile, seeded from the first selected province (selection insertion order). The visual HSV picker supports RGB/hex entry and saturation strength; brush color is independent. Palette generation honors seed saturation and excludes all registered colors plus earlier candidates in the same batch, with extra lightness samples for near-gray seeds.

- **Eraser** paints with the first color from "Define Empty" (not hardcoded black). Respects Province Lock — when locked, only erases pixels matching the locked color.
- **Hover Inspect** (H key) toggle in the toolbar shows a floating tooltip on the viewport with province info (color, ID, name, title, culture, religion) regardless of active sidebar tab. When off, hover inspector only appears in the sidebar Paint tab.
- **Province Creator** supports an "Advanced" collapsible section with:
  - History File picker — choose an existing `history/provinces/*.txt` file to append to, or leave blank to create a new file per province
- **Landed titles insertion** preserves existing file content and comments (raw text insertion, no AST rewrite). Indentation is derived from parent tier via `getChildIndent()`.
- **definition.csv appending** ensures new entries always start on their own line (handles files not ending with newline).

## Key Constraints

- Map dimensions are dynamic (not hardcoded) — AGOT mod uses 9216×6144
- Never hold the full image in one buffer; always work through tiles
- Required save confirmations must all complete before any write IPC (including reconciliation and backups). ID checks precede the final orphan review; cancelling any dialog leaves files and pending IDs unchanged.
- Ctrl+S saves a draft; Ctrl+Shift+S explicitly saves to the mod. Draft save/load must not modify game files. Preserve in-memory province data and staged renames in draft snapshots.
- ProjectLibraryStore persists the master Workshop catalog at userData/projects.json. Discovery is read-only for mods: stat map/CSV presence, read descriptor names, and never create mod drafts/backups. Keep all project opens behind the unsaved-work guard.
- Failed saves write diagnostics under the app user-data logs directory (temporary-directory fallback), preserving the original main-process stack. Show the saved path and recovery actions; log failures must not prevent explicit discard/exit.
- TabShell owns all tab/window close decisions. Closing dirty tabs requires an explicit decision; failed draft saves keep tabs open and show the error. Keep the editor inert while a close decision or save is pending.
- Draft picker paths must never change the tab's active mod path until a draft is successfully selected and loaded.
- All file I/O goes through IPC (context isolation enforced)
- Mod metadata IPC calls require the tab's absolute mod path; main-process managers are keyed by normalized mod directory, never by a global active tab. Capture the path before an asynchronous save and use it throughout the operation.
- Flood fill must be iterative scanline (recursive will stack overflow)
- WebGL wheel events use imperative `addEventListener` with `{ passive: false }`, not React `onWheel`
- `definition.csv` is semicolon-delimited, may have UTF-8 BOM
- All mod file writes are non-destructive — comments, whitespace, and modder formatting are preserved

## Commands

- `.github/workflows/build.yml` validates/packages Windows and Linux x64. Only version-tag pushes create draft releases after VT scans; ordinary pushes/PRs/manual runs only upload build artifacts. Keep actions pinned, build jobs read-only, and the VT key out of npm/build steps. See `docs/RELEASING.md` and built-in-only release tooling in `scripts/release.cjs` / `scripts/virustotal.cjs`. Never replace a published release or fabricate scan counts.

- `npm run dev` — Start dev server + Electron
- `npm test` — Run vitest (290 tests across 18 files)
- `npm run typecheck` — TypeScript checks
- `npm run build` — Production build via electron-vite
- `npm run test:electron` — Hidden-window renderer/preload/IPC/PNG smoke test (requires a build and graphical session)
- `npm run package` — Build distributable (NSIS installer + portable EXE)

## Dependency Safety

Use Node 24.21+ (24.x LTS) and npm 12.2+ (12.x). Use `npm ci` with the committed lockfile. `.npmrc` applies a seven-day release cooldown; `package.json` pins direct dependencies and approved esbuild install-script versions. Electron setup runs explicitly through `npm run setup:electron` (included in dev/start). See `docs/DEPENDENCIES.md` for updates and the global-agent override. PNG processing uses pngjs rather than sharp to avoid Electron/Linux native-library crashes and extra image-format dependencies.

## Conventions

- UI icons are a vendored Tabler Outline SVG subset in `ui/components/icons.tsx`; preserve upstream geometry and the source mapping in `docs/ICONS.md`. Keep `THIRD_PARTY_NOTICES.txt` in the repo and packaged `resources` via electron-builder. No icon package or remote loading is needed.

- TypeScript strict, no `any` except WebGL interop
- `const` and immutable patterns preferred
- Async/await for all file ops, never sync fs in main
- Functional React components, hooks for state
- Inline styles using centralized theme (`src/renderer/ui/theme.ts`)
- Shaders as template literals in `shaders.ts`
- JSDoc on public APIs
