# CLAUDE.md

Toastmasters Timer: an Electron desktop app for the meeting Timer role. It runs a speech timer and,
over **obs-websocket v5**, switches an OBS scene's background between neutral/green/yellow/red.
OBS Virtual Camera carries the result into Zoom / Google Meet. macOS first; Windows installer builds
but is untested on real Windows.

All code lives in `app/`. Run commands from there.

## Commands

```bash
npm install
npm run dev           # electron-vite dev (renderer hot-reloads; main/preload changes need a restart)
npm test              # vitest: tests/timer.test.ts (timer engine + format helpers)
npm run typecheck     # tsc --noEmit (TypeScript 7)
npm run build         # electron-vite build → out/
npm start             # run the built app (electron-vite preview)
npm run install:mac   # build for host arch, replace /Applications/Toastmasters Timer.app, relaunch
npm run dist:mac      # unsigned DMGs (arm64 + x64) → dist/
npm run dist:win      # NSIS installer → dist/Toastmasters-Timer-Setup-<version>.exe (cross-builds on macOS)
npm version patch --no-git-tag-version   # bump version before install/dist
```

Before committing: `npm test && npm run typecheck`.

## Architecture

- `src/main/index.ts`: app wiring. It owns the `TimerEngine`, `ObsController`, `Store` and `BackgroundLibrary`,
  registers IPC handlers (`api:<name>`), global shortcuts, and the `tmbg://` protocol that serves
  background previews. That protocol only serves files inside the backgrounds folder (`BackgroundLibrary.isInside`).
- `src/main/timer.ts`: pure timer on a monotonic clock (injectable `now`). It emits `tick`, `phase`
  (only on change) and `stopped`. The timer runs in **main**, so a renderer reload doesn't stop it.
- `src/main/obs.ts`: all OBS calls. Fixed names: scene `TM Timer`, inputs `TM BG Neutral|Green|Yellow|Red`,
  filter `TM Background Removal` (kind `background_removal` from the obs-backgroundremoval plugin).
  - Phase switch = `CallBatch` of `SetSceneItemEnabled` (enable target first, then hide the others).
  - `setupScene()` is idempotent.
  - `refreshSceneState()` re-adds a missing background-removal filter on connect.
  - `diagnostics()` is a read-only dump, handy for debugging.
- `src/main/store.ts`: `settings.json` / `history.json` in `app.getPath('userData')`
  (`~/Library/Application Support/Toastmasters Timer`). The OBS password is encrypted with `safeStorage`
  in `obs-password.bin` and never sent to the renderer. Default presets and migrations live here.
- `src/main/backgrounds.ts`: background sets. Uploads are **copied** into `userData/backgrounds/<setId>/`
  with a timestamped name, so OBS reloads them. Built-in sets are copied from `resources/default-sets/` on startup.
- `src/preload/index.ts` + `src/shared/types.ts` (`TimerApi`): typed bridge exposed as `window.api`.
- `src/renderer/src/*View.tsx`: React UI, one view per tab. `App.tsx` holds the `AppSnapshot` and
  updates it from push events (`onTimer`, `onObs`, `onHistory`, `onSets`).

**Adding an IPC call:** add it to `TimerApi` in `shared/types.ts`, to `preload/index.ts` (`invoke('name')`),
and `handle('name', …)` in `main/index.ts`. Errors thrown in main reach the renderer wrapped. Use `errorText()`
from `renderer/src/util.ts` to strip the wrapper.

## Gotchas

- **Packaging:** `electron-builder.yml` pins `toolsets.nsis: "1.2.1"`. The legacy NSIS `makensis` is Intel-only and
  fails on Apple Silicon without Rosetta (spawn error -86). `extraResources` ships `default-sets/` and `icon.png`.
- The app icon source is `app/build/icon.svg`. `build/icon.png` (1024²) was rendered from it with Electron, because
  no SVG rasteriser is installed. The renderer uses a 128px copy at `src/renderer/src/assets/logo.png`.
- Global shortcuts are system-wide. Don't default to combos apps use (old ⌘⇧S hijacked Save As; a migration
  in `Store` moves the old defaults).
- **zsh:** `rm dist/*.exe` with no match aborts the whole command. Use `rm -rf dir` or `setopt nullglob`.
- **Driving the UI without screen access:** `npx electron-vite dev --remoteDebuggingPort 9333`, then call
  `window.api.*` / `document` over the Chrome DevTools Protocol (`http://127.0.0.1:9333/json`).
  `window.api.obsDiagnostics()` shows the live OBS scene state.
- Zoom/Meet mirror only the user's own preview. Background text looking reversed there is expected; don't "fix" it in OBS.
- OBS must run on the same machine (it loads image files by local path).

## Repo

- Public on GitHub: `djMrityunjai/toastmasters-timer`, branch `main`. This clone has repo-local git config so
  `git push` authenticates as **djMrityunjai** via `gh auth token --user djMrityunjai`. The machine's
  active `gh` account is a different (work) account, so for `gh` commands on this repo, prefix
  `GH_TOKEN=$(gh auth token --user djMrityunjai)`.
- `artifacts/` and `app/resources/default-sets/` are Toastmasters International artwork, kept in the public
  repo by the owner's choice.
- Commit messages end with a `Co-Authored-By` line. Don't commit `app/dist`, `app/out` or `node_modules`.
- Deferred idea (not started): animal avatar (MediaPipe → WebSocket → three-vrm OBS Browser Source)
  and voice changer (Graillon VST in OBS + BlackHole/VB-Cable).
