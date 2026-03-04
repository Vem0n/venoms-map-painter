# Ven0m's Map Painter - For Map Painters

A province map editor for Crusader Kings 3 mods. Paint provinces directly onto `provinces.png`, create new ones through a form, and the tool generates every file CK3 needs — `definition.csv` rows, province history stubs, landed title entries, and terrain mappings. No more bouncing between GIMP, Excel, and a text editor.

Built with Electron, TypeScript, React, and raw WebGL2.

---

## What It Does

The full province map is loaded as GPU-backed tiles (512x512 each) and rendered with WebGL2. Only visible tiles are drawn, so panning and zooming stays smooth regardless of map size. All painting happens at pixel precision through a global coordinate system that works transparently across tile boundaries.

Provinces are auto-registered the moment you paint with a new color — IDs are assigned at paint time, so you can focus on painting first and fill in the details later. The **Pending** tab tracks every new province that hasn't been saved yet, showing which ones still need names, culture, religion, etc. You can edit any pending province inline before saving, or just save them as-is and flesh them out later in your text editor. When you do save, VMP writes a row to `definition.csv`, generates a `history/provinces/` file, inserts a barony into `common/landed_titles/`, and adds a `common/province_terrain/` entry. You can also select existing provinces to inspect and edit their data inline — name, culture, religion, holding, terrain, and the full de jure hierarchy from barony up to empire.

Every save creates timestamped backups before touching any file. All backups go to a single `<mod>/VMP-Backups/` folder with timestamped subfolders that mirror your mod's directory structure, so you can always roll back any change. The PNG pipeline is lossless — integer RGB throughout, no interpolation, no recompression artifacts on untouched pixels.

Additionally the app is ***stateless***, you can generate files here, change them, adjust them, go fishing with them, in any other application, this tool doesn't care, it just reads data and modifies relevant lines.

---

## Screenshots

<div align="center">
  <img src="/screenshots/vmpscreen1.png" width="49%"/>
  <img src="/screenshots/vmpscreen2.png" width="49%"/>
  <img src="/screenshots/vmpscreen3.png" width="49%"/>
  <img src="/screenshots/vmpscreen4.png" width="49%"/>
</div>

## Quick Start

1. Download from the [latest release](https://github.com/Vem0n/venoms-map-painter/releases) (Windows, macOS, Linux)
2. Launch the app and click **Open Map**
3. Select your CK3 mod root directory (the one containing `map_data/`)
4. Paint provinces, create new ones, edit existing data
5. **Ctrl+S** to save everything

---

## Tools

All tools live in the vertical toolbar on the left. Hover any icon for a tooltip with its name and shortcut.

**Flood Fill** (`F`) — Scanline fill that crosses tile boundaries. With "Respect Borders" toggled on, fill stops at province color boundaries instead of flooding through them.

**Brush** (`B`) — Circular pixel brush with adjustable radius (0-50px). Hover the size dot below the tool icons to pop out the radius slider.

**Eraser** (`E`) — Same as brush but paints with the first color defined in "Define Empty." Respects Province Lock — when a province is locked, the eraser only affects pixels matching that locked color.

**Eyedropper** — Click any pixel to grab its color as your active paint color.

**Border** — Respect borders of other provinces. Ensures the brushes paint **ONLY** on pixels of color defined in "Define Empty". You can sleep tight knowing you didn't accidentally paint over that one pixel of the neighboring province.

**Define Empty** - Press then click on the map to tell the application which RGB color is classified as "empty" to ensure maximum compatibility with existing mods that already have placeholders for future map expansions. Press the red X on the added color to remove it from being seen as empty (That includes the default black).

**Province Lock** — Click a province to lock painting to only that color. Prevents accidentally painting over neighboring provinces. Click the lock icon again to clear.

**Hover Inspect** (`H`) — Toggle a floating tooltip that follows your cursor across the map. Shows the province's color swatch, RGB values, ID, name, title, culture, and religion — regardless of which sidebar tab is active.

**Grid** — Toggles a tile boundary overlay for alignment reference.

---

## Right Panel

Four tabs that stay mounted across switches so you never lose form state:

**Paint** — Color picker with RGB inputs, unique color suggestion, and a realm palette generator that produces 12 related hues from a base color. Province search with instant results that jump the camera on click. Live hover inspector showing the province under your cursor.

**Inspect** — Select a province by clicking the map. Edit all fields inline: name, culture, religion, holding type, terrain. Browse date-stamped history overrides. View the full de jure hierarchy with color-coded tiers (barony, county, duchy, kingdom, empire). Double-click any title key to rename it.

**Create** — Province creation wizard. Pick between nesting under an existing county or creating a new one (with optional parent duchy). Fill in name, holding, culture, religion, terrain, then hit Create. IDs are sequential — the CK3 wiki warns that gaps cause crashes. An **Advanced** collapsible section lets you pick an existing `history/provinces/` file to append the new province entry to instead of creating a new file per province. Also doubles as an editor for pending provinces — click the edit button on any pending province and the Create tab pre-fills with its data.

**Pending** — Lists all provinces that have been painted but not yet saved to disk. Each entry shows a color swatch, ID, and name, with a "needs details" indicator for provinces that haven't been given a name, culture, or religion yet. Save options let you control which file stubs get generated (definition.csv, history, landed titles, terrain). Undo/redo fully syncs with the pending list — undoing a paint stroke that created a province removes it from pending, redo re-adds it.

---

## Shortcuts

| Key | Action |
|-----|--------|
| `F` | Flood Fill |
| `B` | Brush |
| `E` | Eraser |
| `H` | Hover Inspect |
| `Ctrl+S` | Save (map image + all mod files) |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Escape` | Cancel active picking mode |
| Scroll | Zoom |
| Middle / Right drag | Pan |

---

## Build from Source

Requires **Node.js 18+** and a C/C++ toolchain for `sharp` native bindings:
- **Windows**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++"
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential`

```bash
git clone https://github.com/your-username/venoms-map-painter.git
cd venoms-map-painter
npm install
npm run dev          # development with hot reload
npm test             # run unit tests
npm run build        # production build
npm run package      # package as installer/portable
```

Output goes to `release/`. Builds for Windows (NSIS + portable), macOS (DMG + ZIP), and Linux (AppImage + DEB).

---

## Known Issues

- **Memory on repeated loads**: Reloading a map without restarting keeps ~250MB resident in the main process, even on more subsequent loads. This appears to be V8's heap high-water mark behavior — it grows to transfer the ~134MB RGBA buffer over IPC and doesn't shrink back. Doesn't affect stability or performance, just memory footprint.

- **Culture and religion not shown on some provinces**: This is intended behavior. As per the modding wiki, culture and religion are county-scoped — a county inherits them from the first barony defined in its hierarchy. Since VMP only reads data present in your files, it will only display culture and religion IDs on baronies that have them explicitly defined. Future releases may improve this in the inspector, as VMP already tracks the full title hierarchy.

- **Indentation when appending to existing counties/duchies**: The new barony entry may have slightly off indentation when inserted into an existing `landed_titles` block. Auto-inserting into an existing hierarchy is a delicate operation — VMP does its best to preserve indentation, existing comments, and correct placement, but it isn't perfect yet. This is purely cosmetic and does not affect how the game loads your province.

- **Saving provinces without filling in details produces empty stubs**: Provinces saved directly from the Pending tab without filling in a name, culture, religion, or holding will load in the game but may produce unreliable results depending on your mod's setup. The generated `history/provinces/` and `landed_titles` entries will be bare stubs — they won't crash the game, but CK3 may apply unexpected fallback behavior (inherited culture/religion, missing title data, etc.). It is strongly recommended to fill in at least a name and holding type before saving or only generate definitions.csv entries, and flesh out culture/religion either in VMP or directly in your text editor before testing in-game.

## Disclaimer

VMP is scoped to province painting and province file generation. It does **not** handle:

- **`map_data/default.map`** — Sea zones, impassable terrain, river/lake province lists, and other map classification entries must be edited manually or via another tool. VMP's reconcile operation can remap province IDs in `default.map` when renumbering, but it is an experimental feature and should not be relied on for this process.
- **Geographical region mappings** — `common/geographical_region/*.txt` files that group provinces into named regions are not touched by VMP. These must be maintained manually.
- **Title-to-province assignments beyond baronies** — VMP inserts barony entries into `landed_titles`, but linking counties to duchies, kingdoms, and empires in the de jure hierarchy is left to you.
- **Map locators for activities, sieges, battles, etc.** - I cannot find a reliable way to generate stubs into GFX files for location blocks, VMP will kickstart you for the provinces and IDs making sure your definitions.csv files stay sane but the best tool for the GFX locations is still the in-game map editor.

These are intentional scope decisions. VMP is a painting and stub-generation tool — the broader map structure should be handled by you directly or with other tooling of your choice.

---

## Planned Features

- **Update References** — Rename any title ID and VMP will scan your entire mod directory, find every file that references the old ID, and update them automatically. No more manual find-and-replace across dozens of files hoping you didn't miss one.

- **Mass Edit** — Select multiple provinces at once — existing or newly created — and batch update their parent title, culture, religion, or holding type in a single operation. Paint an entire region first, assign the hierarchy later.

- ~~**Other Tool Compatibility** — Looking into optimizing data creation times to ensure compatibility with other tools like Xorrad's meckt, VMP's main focus is province painting, never ever do I want to lock you into this app as your sole workflow, pick your own arsenal, and I want to help you with doing that painlessly.~~ - **Implemented**, IDs are now assigned at paint time with the option to only write the definitions.csv entry

- ~~**Auto Divide** - Paint a blob on the map, select it, specify the amount of provinces you want to divide it into, watch a live (possibly) preview, accept, receive auto generated provinces to be adjusted manually, will use Voronoi diagram seeding (most likely).~~ - Included as voronoi generation in 2.0.0

---

## Contributing

PRs welcome. Please open an issue first for anything non-trivial.

- TypeScript strict mode, no `any` unless interfacing with WebGL
- Functional React components, inline styles via the theme system, no external UI libraries
- Run `npm test` and `npx tsc --noEmit` before submitting
- Don't break the lossless PNG pipeline — untouched pixels must survive a load/save round-trip byte-identical

---

## Reasons and Decisions

I've created this tool mainly out of frustration, someone could say that's how the best apps are born, the main reasoning was that the entire pipeline of creating a province from drawing it on the map to creating the definitions is a pain in the ass and could be easily automated, though I hope maintaining it won't be just as big of a pain in the ass between game updates.

Additionally for what might be eyebrow raising, that being the decision to split the original map into 512x512 tiles, when starting development I've looked at the massive resolution of the provinces.png file, started building the system, made it work, only then did I notice the general size of provinces.png, which is laughably small and could easily be natively displayed for editing. I was too far in to refactor everything by that point but I will surely test out native displaying to save resources.

Electron itself was picked out of my curiosity for the tech, I didn't expect to publish this tool in the first place, after the last touchups I decided I am dissatisfied with the memory usage overhead Electron brings, I am looking towards a potential Tauri rewrite in the next versions as Tauri doesn't bring an entire chromium engine with it.

Thus the scope of this tool was known from the start, it's supposed to provide you useful tools for creating a province, without worrying about pre-existing provinces, it's supposed to kickstart the entire flow while carrying most of the headaches on it's back.

What this tool will do:

    - It will kickstart the process of creating your map
    - It will speed up the process of expanding your pre-existing map
    - It will provide you with stubs for provinces, counties and duchies and in the future possibly kingdoms and empires so you have a comprehensive boilerplate to build up on

What this tool will **NOT** do:

    - It will not auto generate the map for you
    - It will not create the entire mod for you
    - It will not create characters, custom cultures, religions etc. etc.

---

## AI Disclaimer

While creating this application was both fun and exciting, I can't ignore the fact that people have different views on AI generated code, which can cover a lot of ground under the umbrella of bad "vibe coding."

In my own view there are two sides to vibe coding. The good side is where you actually understand what you're doing and more importantly why - which allows you to sit back and focus solely on architecture and proper implementation while handing the coding itself to the model. The bad side is blindly trusting outputs and never attempting to understand what is now your own code.

While the code in this project has been generated using an LLM, I want to assure anyone with concerns that all workflow and architectural decisions were made by me alone. Where I lacked knowledge I focused on acquiring it, which allowed me to take on the role of more a systems engineer and project manager rather than coder. I've been working in the industry commercially for a few years and believe that using GenAI in my own free time multiplies what I could achieve alone - albeit much slower. While I wouldn't use it in a professional context, for a focused tool like this with a well defined scope, I think this is where LLMs do solid work.

If you still have gripes with this project due to GenAI usage that is completely understandable. This disclaimer simply serves to assure you that any shortcomings in architecture or workflow come from me and my decisions, not the model. Useful as these tools are, they should not and will not replace the value of human thinking.

**The workflows in the application are all manual, there is no AI generated map fillings nor a magic button to generate you province names and never will be, it's all algorithms to provide you tools and QoL that are meant to empower human creativity, NOT replace it.**

Thanks!

---

## Supporting

If you enjoy the project, feel free to

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U7U21UWJFZ)

---

## License

[MIT](LICENSE)
