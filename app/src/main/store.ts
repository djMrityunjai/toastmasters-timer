import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HistoryEntry, Preset, Settings } from '@shared/types'

export const DEFAULT_PRESETS: Preset[] = [
  { id: 'table-topics', name: 'Table Topics', green: 60, yellow: 90, red: 120 },
  { id: 'evaluation', name: 'Evaluation', green: 120, yellow: 150, red: 180 },
  { id: 'ice-breaker', name: 'Ice Breaker', green: 240, yellow: 300, red: 360 },
  { id: 'prepared-5-7', name: 'Prepared Speech (5–7)', green: 300, yellow: 360, red: 420 },
  { id: 'speech-7-9', name: 'Speech (7–9)', green: 420, yellow: 480, red: 540 },
  { id: 'speech-10-12', name: 'Speech (10–12)', green: 600, yellow: 660, red: 720 },
  { id: 'custom', name: 'Custom', green: 30, yellow: 45, red: 60 }
]

export const DEFAULT_SETTINGS: Settings = {
  presets: DEFAULT_PRESETS,
  activePresetId: 'prepared-5-7',
  activeSetId: 'builtin-logo',
  graceSeconds: 30,
  obs: { host: 'localhost', port: 4455, hasPassword: false, autoConnect: true },
  hotkeys: { startStop: 'CommandOrControl+Alt+Shift+S', reset: 'CommandOrControl+Alt+Shift+R' }
}

function dataDir(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return dir
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Write to a temp file then rename, so a crash never leaves a half-written file. */
export function writeJson(file: string, value: unknown): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, file)
}

export class Store {
  private readonly settingsFile = join(dataDir(), 'settings.json')
  private readonly historyFile = join(dataDir(), 'history.json')
  private readonly passwordFile = join(dataDir(), 'obs-password.bin')

  settings: Settings
  history: HistoryEntry[]

  constructor() {
    const saved = readJson<Partial<Settings>>(this.settingsFile, {})
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      obs: { ...DEFAULT_SETTINGS.obs, ...saved.obs },
      hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...saved.hotkeys }
    }
    if (!this.settings.presets?.length) this.settings.presets = DEFAULT_PRESETS
    // v0.1.0 defaults (⌘⇧S / ⌘⇧R) hijacked "Save As" system-wide; move untouched defaults to the new ones.
    const hk = this.settings.hotkeys
    if (hk.startStop === 'CommandOrControl+Shift+S') hk.startStop = DEFAULT_SETTINGS.hotkeys.startStop
    if (hk.reset === 'CommandOrControl+Shift+R') hk.reset = DEFAULT_SETTINGS.hotkeys.reset
    this.settings.obs.hasPassword = existsSync(this.passwordFile)
    this.history = readJson<HistoryEntry[]>(this.historyFile, [])
  }

  update(patch: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...patch }
    writeJson(this.settingsFile, this.settings)
    return this.settings
  }

  activePreset(): Preset {
    return this.settings.presets.find((p) => p.id === this.settings.activePresetId) ?? this.settings.presets[0]
  }

  addHistory(entry: HistoryEntry): void {
    this.history = [...this.history, entry]
    writeJson(this.historyFile, this.history)
  }

  clearHistory(): void {
    this.history = []
    writeJson(this.historyFile, this.history)
  }

  /** The OBS password is encrypted with the OS keychain (macOS Keychain / Windows DPAPI). */
  savePassword(password: string): void {
    if (!password) {
      rmSync(this.passwordFile, { force: true })
    } else if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(this.passwordFile, safeStorage.encryptString(password))
    } else {
      throw new Error('Secure storage is not available on this system; cannot save the OBS password.')
    }
    this.update({ obs: { ...this.settings.obs, hasPassword: !!password } })
  }

  loadPassword(): string | undefined {
    if (!existsSync(this.passwordFile)) return undefined
    try {
      return safeStorage.decryptString(readFileSync(this.passwordFile))
    } catch {
      return undefined
    }
  }
}
