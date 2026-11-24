# Toastmasters Timer for Zoom & Google Meet

A desktop app for the meeting **Timer** role. As each speech goes on, it turns your video
background **green → yellow → red** at the right times for the speech type.

Zoom and Meet have no API for changing your virtual background, so the picture is built in
**OBS Studio** and sent to the meeting through **OBS Virtual Camera**:

```
Timer app ──obs-websocket──► OBS scene "TM Timer"
                               ├─ your camera (background removed)
                               └─ background: neutral | green | yellow | red  ← one visible at a time
                             OBS Virtual Camera ──► Zoom / Google Meet
```

Runs on macOS and Windows (Electron + obs-websocket v5). The Windows installer builds, but hasn't been
tested on a Windows PC yet.

## Install

- **macOS:** open `Toastmasters-Timer-<version>-arm64.dmg` (Apple Silicon) or `-x64.dmg` (Intel) and
  drag the app to Applications. It isn't code-signed, so the first time, right-click it and choose
  **Open**, then **Open** again.
- **Windows 10/11:** run `Toastmasters-Timer-Setup-<version>.exe`. It isn't code-signed, so if SmartScreen
  warns, click **More info → Run anyway**. It adds Start-menu and desktop shortcuts.

No prebuilt downloads yet. Build them yourself with the commands under [Development](#development).

## One-time setup

1. **OBS 28 or newer.** In OBS, open *Tools → WebSocket Server Settings*, tick *Enable WebSocket server*,
   click *Show Connect Info* and copy the password.
2. **Background removal plugin:** install [obs-backgroundremoval](https://github.com/royshil/obs-backgroundremoval/releases)
   (the macOS or Windows build), then restart OBS.
3. In the app's **OBS** tab: enter the password, click **Save & connect**, then **Set up OBS**.
   This creates a `TM Timer` scene (camera over four background images), adds background removal
   to the camera and switches OBS to that scene. You can run it again at any time to repair the scene.
   If you install the plugin after setup, the filter is added automatically the next time the app connects.
   - The host can be `localhost` or the IP OBS shows. Either way, OBS must run on **this** computer,
     because it loads the background images from local files.
4. Click **Start virtual camera**. The first time on macOS, OBS may ask you to allow its camera extension.
   On Windows the virtual camera is built in.
5. In the meeting app, choose **OBS Virtual Camera** as the camera and turn its own background effects off:
   - **Zoom:** *Settings → Video → Camera*; *Backgrounds & effects → None*.
   - **Google Meet:** *Settings → Video → Camera*; turn off any background or visual effect.

   **Text looks backwards to you?** Zoom and Meet mirror only your *own* preview. Everyone else sees the
   background the right way round. Zoom lets you untick *Mirror my video*; Meet has no such switch.

## Using it

- **Timer:** pick the speech type, optionally type the speaker's name, then Start / Pause / Stop / Reset.
  Global shortcuts work while the meeting window is in front:
  **⌘⌥⇧S** start/stop and **⌘⌥⇧R** reset on Mac (**Ctrl+Alt+Shift+S / R** on Windows).
- **Speech types:** edit the default times (Table Topics 1–2 min, Evaluation 2–3, Ice Breaker 4–6,
  Prepared 5–7, 7–9, 10–12, Custom) or add your own. The report's grace period and the shortcuts are here too.
- **Backgrounds:** two built-in Toastmasters sets. To use your own, create a set and click or drop an
  image on each of the four slots (neutral, green, yellow, red). 16:9 images work best. Uploads are
  copied into the app's data folder.
- **OBS:** connection, scene setup, background-removal status and the virtual camera switch.
- **Report:** each Stop logs the speaker, time and whether they were within time.
  **Copy report** puts it on the clipboard for the meeting chat.

Your settings, OBS password (encrypted with the OS keychain), backgrounds and report history live in
`~/Library/Application Support/Toastmasters Timer` (macOS) or `%APPDATA%\Toastmasters Timer` (Windows).
They're kept across updates.

## Development

Requires Node.js 20.19+ or 22.12+ (developed on Node 24) and OBS Studio 28+.

```bash
git clone https://github.com/djMrityunjai/toastmasters-timer.git
cd toastmasters-timer/app
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | Run with hot reload. Main-process changes need a restart. |
| `npm test` | Unit tests for the timer engine (vitest). |
| `npm run typecheck` | TypeScript check. |
| `npm run lint` | Lint with [oxlint](https://oxc.rs) (type-aware). Must pass with zero warnings. |
| `npm run lint:fix` | Apply automatic lint fixes. |
| `npm run build` | Compile into `app/out/`. |
| `npm start` | Run the compiled app. |
| `npm run install:mac` | Build for this Mac, quit the running app, replace `/Applications/Toastmasters Timer.app`, relaunch. |
| `npm run dist:mac` | Unsigned DMGs for Apple Silicon and Intel in `app/dist/`. |
| `npm run dist:win` | Windows installer `app/dist/Toastmasters-Timer-Setup-<version>.exe`. Builds on a Mac too. |
| `npm version patch --no-git-tag-version` | Bump the version (use `minor`/`major` as needed) before installing or packaging. |

Before committing, run all three checks:

```bash
npm run lint && npm run typecheck && npm test
```

Typical update on your own Mac:

```bash
npm version patch --no-git-tag-version
npm run install:mac
```

Project layout:

```
app/
  src/main/       timer engine, OBS control, settings and background storage, IPC
  src/preload/    typed bridge exposed to the UI as window.api
  src/renderer/   React UI (one view per tab)
  src/shared/     types and formatting shared by both sides
  tests/          vitest unit tests
  resources/      built-in background sets bundled into the app
  build/          app icon (icon.svg source, icon.png 1024×1024)
  scripts/        install-mac.sh
artifacts/        original Toastmasters background images
```

## Credits

The built-in backgrounds in `artifacts/` and `app/resources/default-sets/` are Toastmasters International
artwork for members' use. The app icon is original.
