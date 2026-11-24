import { useState } from 'react'
import type { AppSnapshot } from '@shared/types'
import { api, errorText } from './util'

const BG_REMOVAL_URL = 'https://github.com/royshil/obs-backgroundremoval/releases'

export default function ObsView({ snap, onSaved }: { snap: AppSnapshot; onSaved: () => void }) {
  const { obs, settings } = snap
  const [host, setHost] = useState(settings.obs.host)
  const [port, setPort] = useState(String(settings.obs.port))
  const [password, setPassword] = useState('')
  const [autoConnect, setAutoConnect] = useState(settings.obs.autoConnect)
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const saveAndConnect = () =>
    run(async () => {
      await api.obsSaveConnection(host, Number(port), password || null, autoConnect)
      setPassword('')
      onSaved()
      await api.obsConnect()
    })

  const setup = () =>
    run(async () => {
      const result = await api.obsSetup()
      setMessages(result.messages)
    })

  return (
    <section>
      <h2>1. Connect to OBS</h2>
      <p className="hint">
        In OBS open <b>Tools → WebSocket Server Settings</b>, tick <b>Enable WebSocket server</b>, then click <b>Show Connect Info</b> and copy the
        password here.
      </p>
      <div className="row">
        <label className="field grow">
          <span>Host</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} />
        </label>
        <label className="field">
          <span>Port</span>
          <input className="time" value={port} onChange={(e) => setPort(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Password {settings.obs.hasPassword && <em>(saved — leave blank to keep)</em>}</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={settings.obs.hasPassword ? '••••••••' : ''} />
      </label>
      <label className="check">
        <input type="checkbox" checked={autoConnect} onChange={(e) => setAutoConnect(e.target.checked)} /> Connect automatically when the app starts
      </label>
      <div className="savebar">
        <button className="btn primary" disabled={busy} onClick={saveAndConnect}>
          {obs.connected ? 'Save & reconnect' : 'Save & connect'}
        </button>
        {obs.connected && (
          <button className="btn" disabled={busy} onClick={() => run(() => api.obsDisconnect())}>
            Disconnect
          </button>
        )}
        <span className={obs.connected ? 'ok-text' : 'muted'}>
          {obs.connected ? `Connected to OBS ${obs.obsVersion ?? ''}` : obs.connecting ? 'Connecting…' : 'Not connected'}
        </span>
      </div>
      {obs.error && <p className="error-text">{obs.error}</p>}

      <h2>2. Set up the scene</h2>
      <p className="hint">
        Creates a scene called <b>TM Timer</b> with your camera on top of four background images, adds background removal to the camera, and makes it
        the active scene. Safe to run again at any time to repair it.
      </p>
      <ul className="checklist">
        <li className={obs.sceneReady ? 'done' : ''}>Scene "TM Timer" {obs.sceneReady ? 'ready' : 'not set up'}</li>
        <li className={obs.cameraName ? 'done' : ''}>Camera: {obs.cameraName ?? 'unknown until setup runs'}</li>
        <li className={obs.bgRemovalOnCamera ? 'done' : obs.bgRemovalOnCamera === false ? 'bad' : ''}>
          Background removal on camera: {obs.bgRemovalOnCamera === null ? 'unknown' : obs.bgRemovalOnCamera ? 'on' : 'off'}
        </li>
        <li className={obs.bgRemovalAvailable ? 'done' : obs.bgRemovalAvailable === false ? 'bad' : ''}>
          Background removal plugin:{' '}
          {obs.bgRemovalAvailable === null ? (
            'unknown'
          ) : obs.bgRemovalAvailable ? (
            'installed'
          ) : (
            <>
              not installed —{' '}
              <a href="#" onClick={(e) => (e.preventDefault(), api.openExternal(BG_REMOVAL_URL))}>
                download obs-backgroundremoval
              </a>
              , install it, restart OBS, then run setup again
            </>
          )}
        </li>
      </ul>
      <div className="savebar">
        <button className="btn primary" disabled={busy || !obs.connected} onClick={setup}>
          {obs.sceneReady ? 'Re-run setup' : 'Set up OBS'}
        </button>
      </div>
      {messages.length > 0 && (
        <ul className="messages">
          {messages.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      <h2>3. Send it to Zoom</h2>
      <div className="savebar">
        <button className="btn primary" disabled={busy || !obs.connected} onClick={() => run(() => api.obsVirtualCam(!obs.virtualCamActive))}>
          {obs.virtualCamActive ? 'Stop virtual camera' : 'Start virtual camera'}
        </button>
        <span className={obs.virtualCamActive ? 'ok-text' : 'muted'}>{obs.virtualCamActive ? 'Virtual camera is on' : 'Virtual camera is off'}</span>
      </div>
      <p className="hint">
        In Zoom: <b>Settings → Video → Camera → OBS Virtual Camera</b>, and set <b>Backgrounds & effects → Virtual background</b> to <b>None</b> (the
        background now comes from OBS). Google Meet: pick <b>OBS Virtual Camera</b> under Settings → Video and turn background effects off.
        Zoom and Meet show <i>your own</i> preview mirrored, so the logo text looks backwards to you. Other participants see it the right way
        round. In Zoom you can untick <b>Mirror my video</b>. Meet has no such switch.
      </p>
      {error && <p className="error-text">{error}</p>}
    </section>
  )
}
