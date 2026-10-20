# Builds and releases

The **Build and release** workflow uses GitHub-hosted Windows Server 2022 and
Ubuntu 24.04 x64 runners. You do not need to register self-hosted runners.
Standard hosted runners are free for public repositories; see
[GitHub's runner documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job).

## One-time setup

1. Commit the workflow, release scripts, package/config changes and the app's
   pending changes together, then push them to `main`. All new source files,
   `.npmrc`, `.nvmrc`, `package-lock.json` and `THIRD_PARTY_NOTICES.txt` belong in
   the commit. Generated `release/`, `dist/` and `node_modules/` stay ignored.
2. If Actions is disabled, enable it under **Settings → Actions → General**.
   The workflow uses only official `actions/*` actions, pinned to full commits.
   Keep the repository's default token permissions read-only: the draft-release
   job requests `contents: write` itself. No personal access token is needed.
3. Add a repository Actions secret named **`VIRUSTOTAL_API_KEY`** under
   **Settings → Secrets and variables → Actions → New repository secret**.
   Obtain the key from your VirusTotal account. With GitHub CLI you can instead
   run `gh secret set VIRUSTOTAL_API_KEY --repo Vem0n/venoms-map-painter` and
   enter the value at its prompt. Never add the key to a file in the repo.
4. Let the first `main` build finish. Under **Actions → Build and release**, both
   platform jobs should be green and have downloadable build artifacts. This
   exercises Windows packaging before you create a real release tag.

## What runs when

| Trigger | Result |
| --- | --- |
| Push to `main` | Test and package both platforms; upload Actions artifacts. |
| Pull request | Same validation/builds; no release or VirusTotal uploads. |
| Actions → Run workflow | Build/test the selected ref without creating a release. |
| Push a version tag, e.g. `v2.2.0` | Build/test, scan Windows EXEs, and create a **draft** GitHub release. |

Each build uses the exact Node version in `.nvmrc`, installs the reviewed npm
12.2.0 in a temporary tool directory, and runs `npm ci` against the committed
lockfile. It runs TypeScript checks, unit tests and smoke tests against the
packaged application's `app.asar`. Ubuntu uses Xvfb/SwiftShader; sandbox-disabling
and software-rendering flags apply only to the smoke-test runner, never the app
that users download. Build jobs have read-only repository access and no VT key.
The release job starts in a separate clean runner and uses no npm dependencies.

Build artifacts remain in Actions for 14 days. These are test downloads, not
published GitHub releases. A manual run on a tag is still a test run; pushing a
new version tag is what requests a release.

## Version strategy

The next release is **`2.2.0`**, without a beta suffix. Use patch versions such
as `2.2.1` for fixes and minor versions such as `2.3.0` for new features. Reserve
a major version change for incompatible changes. The version in `package.json`
has no `v`; Git tags have one. Optional prereleases can still use versions such
as `2.3.0-beta.1` when a future release needs public testing.

Prerelease tags automatically create a draft marked **pre-release**. Stable tags
create an ordinary draft. Publishing remains a deliberate click in GitHub so you
can check notes, downloads and scan results first.

## Preparing a release

1. Set both package metadata files to the intended version without creating a
   tag yet (the current branch already has `2.2.0`):

   ```sh
   npm version 2.2.0 --no-git-tag-version --allow-same-version
   ```

2. Confirm `CHANGELOG.md` has the version section (`v2.2.0` is already prepared
   on this branch). For future releases, move ready changes from `## Unreleased`
   to a heading such as `## v2.2.0 — Map Editing & Save Safety`. Keep the text intended
   for this release below that heading. You can start a fresh Unreleased section
   above it for later work. Tag builds reject a missing or empty version section
   and reject a tag that differs from `package.json`.
3. Commit and push the version, changelog and intended code changes. Wait for the
   `main` build to pass, then tag that same commit:

   ```sh
   git tag -a v2.2.0 -m "v2.2.0"
   git push origin v2.2.0
   ```

4. Open **Actions → Build and release**. After both builds and scans finish,
   the final job links to the draft under **Releases**. Review it and click
   **Publish release**. Do not upload files or paste hashes by hand.

Tags are not reused. For an unsuccessful build, use **Re-run failed jobs**.
The workflow can refresh its own draft for the same source commit, but refuses
to replace a published release or an unrelated draft. If you already published,
make a new version/tag for corrected binaries.

## Release downloads

All builds currently target x64. There is no macOS Actions job.

| Download | Use |
| --- | --- |
| `…-windows-x64-setup.exe` | Windows NSIS installer. |
| `…-windows-x64-portable.exe` | Windows app without installation. |
| `…-windows-x64.zip` | Both EXEs, quick instructions, licenses and their checksums. |
| `…-linux-x86_64.AppImage` | Linux standalone bundle; mark executable before running. |
| `…-linux-amd64.deb` | Debian/Ubuntu package. |
| `…-linux-x86_64.rpm` | Fedora/RHEL-family package. |
| `SHA256SUMS.txt` | SHA-256 checksums of all six downloads. |

`amd64`, `x86_64` and `x64` here identify the same processor architecture, using
platform-native filenames. The release notes contain the matching changelog,
full source commit SHA, a hash for each file and actual VirusTotal report links.
Only the intended downloadable packages are uploaded; unpacked app directories,
builder debug configuration and updater metadata are excluded. These builds are
unsigned; code-signing can be configured separately later.

## VirusTotal behavior and retries

The release job automatically uploads the **installer and portable EXE**. The
ZIP contains those exact files; it is checksummed separately, not described as a
third scanned binary. Files at or above 32 MB use VirusTotal's large-upload
endpoint (up to 650 MB). See the [official upload API](https://docs.virustotal.com/reference/files-scan).

Requests are paced for the public API's four-requests-per-minute tier and retry
rate limits or temporary server/network failures. The job waits up to 20 minutes
per file for completed analysis. A rerun reuses an already completed report only
when its SHA-256 matches the exact file bytes. API failures, pending analyses and
missing detection counts fail the job instead of being presented as a clean scan.

The notes show the actual malicious and suspicious engine counts, including
nonzero detections. Those results do not automatically publish or discard the
release: review the linked reports in the draft. A reported zero is not a promise
that a file is harmless. The API key is scoped to the scan step; no key is passed
to npm installation, package scripts or build jobs.

If the key is missing/invalid or its quota is exhausted, the final job explains
the failure. Add/fix the secret or wait for quota recovery, then rerun the failed
job. Build artifacts remain available; published releases are left alone.

## Local validation

```sh
npm run typecheck
npm test
npm run package -- --linux AppImage deb rpm --x64 --publish never
npm run test:electron -- ./release/linux-unpacked/resources/app.asar
```

Linux packaging uses the builder's bundled Ruby/FPM toolchain and system RPM
tools. Ubuntu 24.04 runner dependencies are installed in the workflow. On Fedora,
the bundled Ruby may additionally need `libxcrypt-compat`; the same packages can
also be built inside Ubuntu 24.04. Headless Electron checks in a container need
adequate shared memory, e.g. Podman/Docker `--shm-size=1g`; hosted runners run
directly on their VM. No host-system packages need to change just to
inspect the workflow.

Workflow syntax can be checked with `actionlint .github/workflows/build.yml`.
Release/VirusTotal unit tests mock the external API: local tests do not upload
binaries, create releases, register runners or require an API key. First-run
Windows execution and the live VT API still need verification in GitHub Actions.
