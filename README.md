# Toastmasters Timer for Zoom

A desktop app for the meeting **Timer** role. As each speech goes on, it turns your Zoom
video background **green → yellow → red** at the right times for the speech type.

Zoom has no API for changing the desktop client's virtual background, so the picture is
built in **OBS Studio** and sent to Zoom through **OBS Virtual Camera**:

```
Timer app ──obs-websocket──► OBS scene "TM Timer"
                               ├─ your camera (background removed)
                               └─ background: neutral | green | yellow | red  ← one visible at a time
                             OBS Virtual Camera ──► Zoom
```

Runs on macOS and Windows (Electron + obs-websocket v5). Windows builds are configured but not yet tested.

## One-time setup

1. **OBS 28 or newer.** In OBS, open *Tools → WebSocket Server Settings*, tick *Enable WebSocket server*,
   click *Show Connect Info* and copy the password.
2. **Background removal plugin:** install [obs-backgroundremoval](https://github.com/royshil/obs-backgroundremoval/releases),
   then restart OBS.
3. In the app's **OBS** tab: enter the password, click **Save & connect**, then **Set up OBS**.
   This creates a `TM Timer` scene (camera over four background images), adds background removal
   to the camera and switches OBS to that scene. You can run it again at any time to repair the scene.
   If the plugin is installed after setup, the filter is added automatically the next time the app connects.
4. Click **Start virtual camera**. The first time on macOS, OBS may ask you to allow its camera system extension.
5. In **Zoom → Settings → Video**, set Camera to **OBS Virtual Camera** and set *Backgrounds & effects*
   to **None**. (Google Meet: choose OBS Virtual Camera under *Settings → Video* and turn background effects off.)
   **Text looks backwards to you?** Zoom and Meet mirror only your *own* preview. Everyone else sees the
   background the right way round. Zoom lets you untick *Mirror my video*; Meet has no such switch.

Host: `localhost` or the IP OBS shows both work, as long as OBS runs on **this** computer
(OBS loads the background images from local file paths).

## Using it

- **Timer tab:** pick the speech type, optionally type the speaker's name, then Start / Pause / Stop / Reset.
  Global shortcuts work while Zoom is in front: **⌘⇧S** start/stop, **⌘⇧R** reset (Ctrl+Shift on Windows).
- **Speech types:** edit the default times (Table Topics 1–2, Evaluation 2–3, Ice Breaker 4–6,
  Prepared 5–7, 7–9, 10–12, Custom) or add your own. You can also change the report's grace period and the shortcuts here.
- **Backgrounds:** two built-in Toastmasters sets. To use your own, create a set and click or drop
  an image on each of the four slots (neutral, green, yellow, red). Images are copied into the app's data folder.
- **Report:** each Stop logs the speaker, time and whether they were within time. **Copy report** puts
  it on the clipboard so you can paste it into Zoom chat.

## Development

```bash
cd app
npm install
npm run dev        # run with hot reload
npm test           # timer engine unit tests
npm run typecheck
npm run dist:mac   # build a .dmg into app/dist (unsigned)
npm run dist:win   # build an NSIS installer (run on Windows)
```

Layout: `app/src/main` (timer engine, OBS control, storage), `app/src/preload` (IPC bridge),
`app/src/renderer` (React UI), `app/src/shared` (types).
Settings, history and uploaded backgrounds live in the OS app-data folder
(`~/Library/Application Support/Toastmasters Timer` on macOS).

The built-in backgrounds in `app/resources/default-sets` are Toastmasters International artwork, meant
for members' use. Remove them before publishing this repository.
