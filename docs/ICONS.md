# UI icons

The app uses a small vendored subset of **Tabler Outline** rather than an npm icon
package. The SVG geometry lives in `src/renderer/ui/components/icons.tsx`, adapted
to the existing React size/color/style props. The shared wrapper uses Tabler's
24×24 viewBox, 2-unit stroke, rounded caps/joins and inherited color. Icons are
decorative; their buttons supply the labels and tooltips.

- Upstream: https://github.com/tabler/tabler-icons
- Pinned source commit: `a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d`
- Source directory: [`icons/outline`](https://github.com/tabler/tabler-icons/tree/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline)
- License: MIT, copyright © 2020–2026 Paweł Kuna. The full upstream notice is in
  [`THIRD_PARTY_NOTICES.txt`](../THIRD_PARTY_NOTICES.txt).
- `electron-builder.yml` copies that notice to the release's `resources` directory
  (inside the application bundle on macOS), alongside `app.asar`.

Only static SVG geometry is copied. Do not add icon-loading services or a full
icon package for these controls. For changes, choose an upstream icon, preserve
its geometry, update this mapping and retain the full upstream license notice.

| App component | Tabler icon |
| --- | --- |
| `FloodFillIcon` | [`bucket-droplet`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/bucket-droplet.svg) |
| `BrushIcon` | [`brush`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/brush.svg) |
| `EraserIcon` | [`eraser`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/eraser.svg) |
| `EyedropperIcon` | [`color-picker`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/color-picker.svg) |
| `GridIcon` | [`grid-3x3`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/grid-3x3.svg) |
| `LockIcon` | [`lock`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/lock.svg) |
| `LockOpenIcon` | [`lock-open`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/lock-open.svg) |
| `EmptyColorIcon` | [`background`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/background.svg) |
| `UndoIcon` | [`arrow-back-up`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/arrow-back-up.svg) |
| `RedoIcon` | [`arrow-forward-up`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/arrow-forward-up.svg) |
| `FolderOpenIcon` | [`folder-open`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/folder-open.svg) |
| `SaveIcon` | [`device-floppy`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/device-floppy.svg) |
| `SearchIcon` | [`search`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/search.svg) |
| `XIcon` | [`x`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/x.svg) |
| `ChevronDownIcon` | [`chevron-down`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/chevron-down.svg) |
| `InspectIcon` | [`eye-search`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/eye-search.svg) |
| `HeightmapIcon` | [`mountain`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/mountain.svg) |
| `LassoIcon` | [`lasso`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/lasso.svg) |
| `BordersIcon` | [`border-outer`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/border-outer.svg) |
| `PaletteIcon` | [`palette`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/palette.svg) |
| `CopyIcon` | [`copy`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/copy.svg) |
| `CheckIcon` | [`check`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/check.svg) |
| `ProjectsIcon` | [`folders`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/folders.svg) |
| `LoadDraftIcon` | [`file-import`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/file-import.svg) |
| `SaveDraftIcon` | [`file-pencil`](https://github.com/tabler/tabler-icons/blob/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/file-pencil.svg) |
