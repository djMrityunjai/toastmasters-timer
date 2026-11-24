import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { TimerApi } from '@shared/types'

const invoke =
  (name: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(`api:${name}`, ...args)

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: TimerApi = {
  getSnapshot: invoke('getSnapshot'),
  timerStart: invoke('timerStart'),
  timerPause: invoke('timerPause'),
  timerStop: invoke('timerStop'),
  timerReset: invoke('timerReset'),
  setSpeaker: invoke('setSpeaker'),
  selectPreset: invoke('selectPreset'),
  savePresets: invoke('savePresets'),
  setGraceSeconds: invoke('setGraceSeconds'),
  setHotkeys: invoke('setHotkeys'),

  listSets: invoke('listSets'),
  createSet: invoke('createSet'),
  renameSet: invoke('renameSet'),
  deleteSet: invoke('deleteSet'),
  pickImageForSet: invoke('pickImageForSet'),
  setImageFromPath: invoke('setImageFromPath'),
  setActiveSet: invoke('setActiveSet'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  obsSaveConnection: invoke('obsSaveConnection'),
  obsConnect: invoke('obsConnect'),
  obsDisconnect: invoke('obsDisconnect'),
  obsSetup: invoke('obsSetup'),
  obsVirtualCam: invoke('obsVirtualCam'),
  obsDiagnostics: invoke('obsDiagnostics'),

  clearHistory: invoke('clearHistory'),
  copyText: invoke('copyText'),
  openExternal: invoke('openExternal'),

  onTimer: (cb) => subscribe('timer', cb),
  onObs: (cb) => subscribe('obs', cb),
  onHistory: (cb) => subscribe('history', cb),
  onSets: (cb) => subscribe('sets', cb)
} as TimerApi

contextBridge.exposeInMainWorld('api', api)
