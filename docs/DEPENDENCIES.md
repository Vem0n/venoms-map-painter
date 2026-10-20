# Dependency maintenance

Use Node 24.21+ in the 24.x LTS line and npm 12.2+ in the 12.x line. These versions support the project toolchain and its install-script approval policy. `.nvmrc` pins the tested Node version.

## Normal development

```sh
npm ci
npm run dev
```

`npm ci` reproduces `package-lock.json` and checks archive integrity. The project `.npmrc` enforces the supported toolchain and a seven-day minimum release age for dependency resolution. Keep the lockfile committed.

`dev` and `start` run `setup:electron` first. Electron 44 no longer downloads its runtime through a postinstall hook, so the explicit setup downloads the platform binary and verifies it using Electron's checksums. Subsequent starts reuse the installed runtime.

## Updating packages

1. Change the exact direct versions in `package.json`, then resolve with `npm install --package-lock-only --ignore-scripts`. Review the lockfile diff and published compromise reports for new packages or versions before running them. For a complete transitive refresh within the declared ranges, use `npm update --package-lock-only --ignore-scripts`.
2. Run `npm audit`. Check the actual advisory and call path rather than applying `npm audit fix --force`. Audit databases cover known reports; an audit result alone does not establish package safety.
3. If an install-hook version changed, install with `npm ci --ignore-scripts`, inspect its installation code, and approve only the needed package with `npm approve-scripts <package>`. npm records version-specific entries in `package.json`; commit those entries with the lockfile. Then run `npm ci` to reproduce the approved installation.
4. Run the validation commands below. Rebuild distribution files after dependency changes.

```sh
npm ci
npm audit
npm test
npm run typecheck
npm run build
npm run test:electron
npm run package
```

The release cooldown is intended to give new packages time to be checked. A verified urgent security fix may justify a temporary `--min-release-age=0` for resolution; review and commit the resulting lockfile. Do not disable install-script policy globally.

## Install scripts

Only the locked esbuild 0.25.12 and 0.28.2 install scripts are approved. They set up and validate the platform-specific build binary.

`fsevents` is explicitly denied: it is an optional macOS file-watching optimization, and the watcher has a fallback. `electron-winstaller` is denied because its setup belongs to Squirrel.Windows, which this project does not target; NSIS and portable packaging use electron-builder's own tooling. Electron has no automatic install hook. pngjs has no dependencies or install hooks. New hooks remain unapproved until reviewed; `npm approve-scripts --allow-scripts-pending` lists any pending packages without changing the policy.

Blocking install hooks reduces automatic code execution. Dependency code still runs when you start development tools or the app.

## PNG backend

Image I/O uses pngjs 7.0.0 in short-lived workers. This removes sharp and its bundled native image libraries: recent Electron/Linux binaries conflict with their GLib symbols and can crash on image processing ([Electron issue 46323](https://github.com/electron/electron/issues/46323)). The app only needs PNG, so a PNG-specific decoder avoids that conflict and the extra image-format dependencies.

The compatibility tests check repeated exact-RGB round trips, 24-bit output without alpha blending, and 16-bit grayscale heightmap input. No gamma correction is applied to province colors.

`npm run test:electron` opens a hidden window, loads the real renderer/preload, and saves/reloads pixels through IPC using a temporary mod and separate temporary profile. It also verifies Voronoi previews while lasso is active, then opens a second mod in another tab and checks that painting/saving the first mod leaves every file and backup in the second mod unchanged. It also checks Workshop project discovery/persistence and guarded project/draft opening without scan-time mod writes, draft isolation, cancellation before writes, save-error logs and draft recovery, and tab/window close guards with injected save and logging failures. It needs a graphical session and a current production build. To check the packaged archive after a directory build, use `npm run test:electron -- ./release/linux-unpacked/resources/app.asar`.

## Transitive override

`global-agent` is pinned to 4.1.3 for electron-builder's `@electron/get` dependency. The previous 3.x helper pulled in `roarr` and unpatched `sprintf-js` ([GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)). The 4.x helper removes that logging chain while retaining the `bootstrap()` API used by the downloader. Remove the override once the upstream packaging tool no longer needs it.

## References

- [npm ci](https://docs.npmjs.com/cli/v12/commands/npm-ci/)
- [npm install and release-age configuration](https://docs.npmjs.com/cli/v12/commands/npm-install/)
- [npm install-script approvals](https://docs.npmjs.com/cli/v12/commands/npm-approve-scripts/)
- [Electron support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)

## Release builds

GitHub Actions uses the committed lockfile and the same Node/npm pins on Windows and Ubuntu. Build jobs receive no VirusTotal secret or repository write access. Release notes/checksums/scans use Node built-ins and the runner’s GitHub CLI, without installing an extra release npm package. See [release workflow and setup](RELEASING.md).
