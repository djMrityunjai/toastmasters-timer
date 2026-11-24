import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, net, protocol, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppSnapshot, Hotkeys, Phase, Preset } from '@shared/types'
import { BackgroundLibrary, IMAGE_EXTENSIONS } from './backgrounds'
import { ObsController } from './obs'
import { Store } from './store'
import { isWithinLimits, TimerEngine, validatePreset } from './timer'

app.setName('Toastmasters Timer')
protocol.registerSchemesAsPrivileged([{ scheme: 'tmbg', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

let win: BrowserWindow | null = null

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

function defaultSetsDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'default-sets') : join(app.getAppPath(), 'resources', 'default-sets')
}

function iconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build', 'icon.png')
}

app.whenReady().then(() => {
  // Packaged builds get their Dock icon from the .icns; in dev, set it so you see the real icon.
  if (!app.isPackaged && process.platform === 'darwin') app.dock?.setIcon(iconPath())
  const store = new Store()
  const library = new BackgroundLibrary(app.getPath('userData'), defaultSetsDir())
  if (!library.get(store.settings.activeSetId)) store.update({ activeSetId: 'builtin-logo' })

  const timer = new TimerEngine(store.activePreset())
  const obs = new ObsController()

  const activeFiles = (): Record<Phase, string> => library.get(store.settings.activeSetId)!.files
  const broadcastSets = (): void => send('sets', library.list(), store.settings.activeSetId)

  // ---- Wiring: timer -> OBS / UI ----
  timer.on('tick', (s) => send('timer', s))
  timer.on('phase', (p) => void obs.showPhase(p))
  timer.on('stopped', (s) => {
    if (s.elapsedMs < 1000) return // ignore accidental start/stop
    store.addHistory({
      id: randomUUID(),
      at: new Date().toISOString(),
      speaker: s.speaker.trim() || 'Speaker',
      presetName: s.preset.name,
      elapsedMs: s.elapsedMs,
      green: s.preset.green,
      red: s.preset.red,
      withinLimits: isWithinLimits(s.elapsedMs, s.preset, store.settings.graceSeconds)
    })
    send('history', store.history)
  })
  obs.on('status', (s) => send('obs', s))

  const configureObs = (): void => {
    const { host, port } = store.settings.obs
    obs.configure({ host, port, password: store.loadPassword() })
  }
  configureObs()
  void obs.setFiles(activeFiles())
  if (store.settings.obs.autoConnect) void obs.connect()

  // ---- Hotkeys ----
  const toggleStartStop = (): void => {
    if (timer.state.status === 'running') timer.stop()
    else timer.start()
  }
  const registerHotkeys = (h: Hotkeys): string | null => {
    globalShortcut.unregisterAll()
    const failed: string[] = []
    if (h.startStop && !globalShortcut.register(h.startStop, toggleStartStop)) failed.push(h.startStop)
    if (h.reset && !globalShortcut.register(h.reset, () => timer.reset())) failed.push(h.reset)
    return failed.length ? `Could not register ${failed.join(', ')} (in use by another app, or invalid).` : null
  }
  registerHotkeys(store.settings.hotkeys)

  // ---- Background image previews (only files inside the backgrounds folder) ----
  protocol.handle('tmbg', (req) => {
    const path = new URL(req.url).searchParams.get('p') ?? ''
    if (!library.isInside(path)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(path).toString())
  })

  // ---- IPC ----
  const handle = (name: string, fn: (...args: any[]) => unknown): void => {
    ipcMain.handle(`api:${name}`, (_e, ...args) => fn(...args))
  }

  handle('getSnapshot', (): AppSnapshot => ({
    settings: store.settings,
    sets: library.list(),
    timer: timer.state,
    obs: obs.status,
    history: store.history
  }))

  handle('timerStart', () => timer.start())
  handle('timerPause', () => timer.pause())
  handle('timerStop', () => void timer.stop())
  handle('timerReset', () => timer.reset())
  handle('setSpeaker', (name: string) => timer.setSpeaker(String(name).slice(0, 100)))
  handle('selectPreset', (id: string) => {
    store.update({ activePresetId: id })
    timer.setPreset(store.activePreset())
  })
  handle('savePresets', (presets: Preset[]) => {
    if (!presets.length) throw new Error('Keep at least one speech type.')
    for (const p of presets) {
      const err = validatePreset(p)
      if (err) throw new Error(`${p.name || 'Unnamed'}: ${err}`)
    }
    const activePresetId = presets.some((p) => p.id === store.settings.activePresetId) ? store.settings.activePresetId : presets[0].id
    store.update({ presets, activePresetId })
    timer.setPreset(store.activePreset())
  })
  handle('setGraceSeconds', (s: number) => store.update({ graceSeconds: Math.max(0, Math.round(Number(s) || 0)) }))
  handle('setHotkeys', (h: Hotkeys) => {
    const error = registerHotkeys(h)
    if (error) {
      registerHotkeys(store.settings.hotkeys)
      return { ok: false, error }
    }
    store.update({ hotkeys: h })
    return { ok: true }
  })

  handle('listSets', () => library.list())
  handle('createSet', (name: string) => {
    const set = library.create(name)
    broadcastSets()
    return set
  })
  handle('renameSet', (id: string, name: string) => {
    library.rename(id, name)
    broadcastSets()
  })
  handle('deleteSet', (id: string) => {
    library.delete(id)
    if (store.settings.activeSetId === id) {
      store.update({ activeSetId: 'builtin-logo' })
      void obs.setFiles(activeFiles())
    }
    broadcastSets()
  })
  const applyIfActive = (id: string): void => {
    if (store.settings.activeSetId === id) void obs.setFiles(activeFiles())
  }
  handle('pickImageForSet', async (id: string, phase: Phase) => {
    const result = await dialog.showOpenDialog(win!, {
      title: `Choose the ${phase} background`,
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const set = library.setImage(id, phase, result.filePaths[0])
    applyIfActive(id)
    broadcastSets()
    return set
  })
  handle('setImageFromPath', (id: string, phase: Phase, path: string) => {
    const set = library.setImage(id, phase, path)
    applyIfActive(id)
    broadcastSets()
    return set
  })
  handle('setActiveSet', async (id: string) => {
    const set = library.get(id)
    if (!set) throw new Error('Set not found')
    if (!library.isComplete(set)) throw new Error('Add all four images (neutral, green, yellow, red) before using this set.')
    store.update({ activeSetId: id })
    await obs.setFiles(set.files)
    broadcastSets()
  })

  handle('obsSaveConnection', (host: string, port: number, password: string | null, autoConnect: boolean) => {
    store.update({ obs: { ...store.settings.obs, host: host.trim() || 'localhost', port: Number(port) || 4455, autoConnect } })
    if (password !== null) store.savePassword(password)
    configureObs()
  })
  handle('obsConnect', () => obs.connect())
  handle('obsDisconnect', () => obs.disconnect())
  handle('obsSetup', () => obs.setupScene(activeFiles()))
  handle('obsVirtualCam', (on: boolean) => obs.setVirtualCam(on))
  handle('obsDiagnostics', () => obs.diagnostics())

  handle('clearHistory', () => {
    store.clearHistory()
    send('history', store.history)
  })
  handle('copyText', (text: string) => clipboard.writeText(String(text)))
  handle('openExternal', (url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    timer.dispose()
  })
})

function createWindow(): void {
  win = new BrowserWindow({
    width: 520,
    height: 760,
    minWidth: 420,
    minHeight: 560,
    title: 'Toastmasters Timer',
    backgroundColor: '#14161a',
    icon: iconPath(), // used on Windows/Linux; macOS uses the bundle icon
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  // Open links in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
