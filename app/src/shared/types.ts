export const PHASES = ['neutral', 'green', 'yellow', 'red'] as const
export type Phase = (typeof PHASES)[number]

/** Times are in whole seconds from the start of the speech. */
export interface Preset {
  id: string
  name: string
  green: number
  yellow: number
  red: number
}

export interface BackgroundSet {
  id: string
  name: string
  builtIn: boolean
  /** Absolute file paths, one per phase. */
  files: Record<Phase, string>
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'stopped'

export interface TimerState {
  status: TimerStatus
  elapsedMs: number
  phase: Phase
  preset: Preset
  speaker: string
}

export interface HistoryEntry {
  id: string
  at: string
  speaker: string
  presetName: string
  elapsedMs: number
  green: number
  red: number
  withinLimits: boolean
}

export interface ObsSettings {
  host: string
  port: number
  /** True when a password is saved (the password itself never leaves the main process). */
  hasPassword: boolean
  autoConnect: boolean
}

export interface Hotkeys {
  startStop: string
  reset: string
}

export interface Settings {
  presets: Preset[]
  activePresetId: string
  activeSetId: string
  graceSeconds: number
  obs: ObsSettings
  hotkeys: Hotkeys
}

export interface ObsStatus {
  connected: boolean
  connecting: boolean
  error: string | null
  obsVersion: string | null
  virtualCamActive: boolean
  sceneReady: boolean
  /** null = unknown (not connected yet). */
  bgRemovalAvailable: boolean | null
  /** Whether the camera in TM Timer has the background-removal filter. null = unknown. */
  bgRemovalOnCamera: boolean | null
  cameraName: string | null
}

export interface SetupResult {
  ok: boolean
  messages: string[]
}

export interface AppSnapshot {
  version: string
  settings: Settings
  sets: BackgroundSet[]
  timer: TimerState
  obs: ObsStatus
  history: HistoryEntry[]
}

/** API exposed to the renderer through the preload script. */
export interface TimerApi {
  getSnapshot(): Promise<AppSnapshot>
  timerStart(): Promise<void>
  timerPause(): Promise<void>
  timerStop(): Promise<void>
  timerReset(): Promise<void>
  setSpeaker(name: string): Promise<void>
  selectPreset(id: string): Promise<void>
  savePresets(presets: Preset[]): Promise<void>
  setGraceSeconds(s: number): Promise<void>
  setHotkeys(h: Hotkeys): Promise<{ ok: boolean; error?: string }>

  listSets(): Promise<BackgroundSet[]>
  createSet(name: string): Promise<BackgroundSet>
  renameSet(id: string, name: string): Promise<void>
  deleteSet(id: string): Promise<void>
  pickImageForSet(id: string, phase: Phase): Promise<BackgroundSet | null>
  setImageFromPath(id: string, phase: Phase, path: string): Promise<BackgroundSet>
  setActiveSet(id: string): Promise<void>
  getPathForFile(file: File): string

  obsSaveConnection(host: string, port: number, password: string | null, autoConnect: boolean): Promise<void>
  obsConnect(): Promise<void>
  obsDisconnect(): Promise<void>
  obsSetup(): Promise<SetupResult>
  obsVirtualCam(on: boolean): Promise<void>
  obsDiagnostics(): Promise<{ cameraFilters: { name: string; kind: string; enabled: boolean }[]; programScene: string; items: { name: string; kind: string; enabled: boolean; index: number }[]; files: Record<string, string> }>

  clearHistory(): Promise<void>
  copyText(text: string): Promise<void>
  openExternal(url: string): Promise<void>

  onTimer(cb: (s: TimerState) => void): () => void
  onObs(cb: (s: ObsStatus) => void): () => void
  onHistory(cb: (h: HistoryEntry[]) => void): () => void
  onSets(cb: (sets: BackgroundSet[], activeSetId: string) => void): () => void
}
