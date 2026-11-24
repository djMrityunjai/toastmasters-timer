import { EventEmitter } from 'node:events'
import { OBSWebSocket, OBSWebSocketError } from 'obs-websocket-js'
import { PHASES, type ObsStatus, type Phase, type SetupResult } from '@shared/types'

export const SCENE_NAME = 'TM Timer'
export const BG_INPUT: Record<Phase, string> = {
  neutral: 'TM BG Neutral',
  green: 'TM BG Green',
  yellow: 'TM BG Yellow',
  red: 'TM BG Red'
}
const BG_REMOVAL_FILTER_KIND = 'background_removal' // from the obs-backgroundremoval plugin
const BG_REMOVAL_FILTER_NAME = 'TM Background Removal'
const CAMERA_KINDS = ['macos-avcapture', 'macos-avcapture-fast', 'av_capture_input', 'av_capture_input_v2', 'dshow_input', 'v4l2_input']
export const BG_REMOVAL_URL = 'https://github.com/royshil/obs-backgroundremoval/releases'

// OBS alignment flags: OBS_ALIGN_LEFT = 1, OBS_ALIGN_TOP = 4
const ALIGN_TOP_LEFT = 5
const ALIGN_CENTER = 0
const AUTH_FAILED = 4009
const RECONNECT_MS = 3000

interface ConnectionInfo {
  host: string
  port: number
  password?: string
}

export interface ObsEvents {
  status: [ObsStatus]
}

/**
 * Talks to OBS Studio over obs-websocket v5 (built into OBS 28+).
 *
 * The `TM Timer` scene stacks four image sources (one per phase) under the camera.
 * Exactly one image is visible at a time; switching phase just flips visibility,
 * which is instant because OBS keeps all four images loaded.
 */
export class ObsController extends EventEmitter<ObsEvents> {
  private obs = new OBSWebSocket()
  private info: ConnectionInfo | null = null
  private wantConnected = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private itemIds: Partial<Record<Phase, number>> = {}
  private currentPhase: Phase = 'neutral'
  private currentFiles: Record<Phase, string> | null = null
  private _status: ObsStatus = {
    connected: false,
    connecting: false,
    error: null,
    obsVersion: null,
    virtualCamActive: false,
    sceneReady: false,
    bgRemovalAvailable: null,
    bgRemovalOnCamera: null,
    cameraName: null
  }

  constructor() {
    super()
    this.obs.on('ConnectionClosed', (err) => this.handleClosed(err))
    this.obs.on('VirtualcamStateChanged', ({ outputActive }) => this.setStatus({ virtualCamActive: outputActive }))
    this.obs.on('SceneRemoved', ({ sceneName }) => {
      if (sceneName === SCENE_NAME) void this.refreshSceneState()
    })
    this.obs.on('InputRemoved', ({ inputName }) => {
      if (Object.values(BG_INPUT).includes(inputName)) void this.refreshSceneState()
    })
  }

  get status(): ObsStatus {
    return this._status
  }

  configure(info: ConnectionInfo): void {
    this.info = info
  }

  async connect(): Promise<void> {
    if (!this.info) throw new Error('OBS connection is not configured')
    this.wantConnected = true
    this.clearReconnect()
    if (this._status.connected) await this.obs.disconnect()
    this.setStatus({ connecting: true, error: null })
    try {
      const { host, port, password } = this.info
      await this.obs.connect(`ws://${host}:${port}`, password || undefined)
      const version = await this.obs.call('GetVersion')
      const vcam = await this.obs.call('GetVirtualCamStatus')
      this.setStatus({
        connected: true,
        connecting: false,
        error: null,
        obsVersion: version.obsVersion,
        virtualCamActive: vcam.outputActive,
        bgRemovalAvailable: await this.hasBgRemoval()
      })
      await this.refreshSceneState()
      if (this._status.sceneReady) await this.syncFilesAndPhase()
    } catch (err) {
      this.setStatus({ connected: false, connecting: false, error: describeError(err) })
      if (isAuthError(err)) this.wantConnected = false
      else this.scheduleReconnect()
    }
  }

  async disconnect(): Promise<void> {
    this.wantConnected = false
    this.clearReconnect()
    await this.obs.disconnect()
    this.setStatus({ connected: false, connecting: false, error: null, sceneReady: false })
  }

  /** Called whenever the active background set changes. Applies immediately if connected. */
  async setFiles(files: Record<Phase, string>): Promise<void> {
    this.currentFiles = files
    if (!this._status.connected || !this._status.sceneReady) return
    await this.obs.callBatch(
      PHASES.map((p) => ({
        requestType: 'SetInputSettings' as const,
        requestData: { inputName: BG_INPUT[p], inputSettings: { file: files[p] } }
      }))
    )
  }

  async showPhase(phase: Phase): Promise<void> {
    this.currentPhase = phase
    if (!this._status.connected || !this._status.sceneReady) return
    const target = this.itemIds[phase]
    if (target === undefined) return
    // Enable the new image before hiding the others, in one batch, so there's never an empty frame.
    const requests = [
      { requestType: 'SetSceneItemEnabled' as const, requestData: { sceneName: SCENE_NAME, sceneItemId: target, sceneItemEnabled: true } },
      ...PHASES.filter((p) => p !== phase && this.itemIds[p] !== undefined).map((p) => ({
        requestType: 'SetSceneItemEnabled' as const,
        requestData: { sceneName: SCENE_NAME, sceneItemId: this.itemIds[p]!, sceneItemEnabled: false }
      }))
    ]
    try {
      await this.obs.callBatch(requests)
    } catch (err) {
      this.setStatus({ error: `Could not switch background: ${describeError(err)}` })
    }
  }

  async setVirtualCam(on: boolean): Promise<void> {
    this.assertConnected()
    try {
      await this.obs.call(on ? 'StartVirtualCam' : 'StopVirtualCam')
    } catch (err) {
      throw new Error(
        `${describeError(err)}${on ? ' — on macOS, start the virtual camera once from OBS itself and allow the system extension if prompted.' : ''}`,
        { cause: err }
      )
    }
  }

  /** Creates (or repairs) the `TM Timer` scene. Safe to run repeatedly; only touches items it owns, plus the camera filter. */
  async setupScene(files: Record<Phase, string>): Promise<SetupResult> {
    this.assertConnected()
    const messages: string[] = []
    this.currentFiles = files
    const { baseWidth, baseHeight } = await this.obs.call('GetVideoSettings')

    const { scenes } = await this.obs.call('GetSceneList')
    if (!scenes.some((s) => s.sceneName === SCENE_NAME)) {
      await this.obs.call('CreateScene', { sceneName: SCENE_NAME })
      messages.push(`Created scene "${SCENE_NAME}".`)
    }

    const { inputs } = await this.obs.call('GetInputList')
    const inputNames = new Set(inputs.map((i) => i.inputName as string))

    // 1. Background images, bottom of the stack.
    for (const phase of PHASES) {
      const inputName = BG_INPUT[phase]
      const settings = { file: files[phase], unload: false, linear_alpha: false }
      let sceneItemId: number
      if (!inputNames.has(inputName)) {
        const created = await this.obs.call('CreateInput', {
          sceneName: SCENE_NAME,
          inputName,
          inputKind: 'image_source',
          inputSettings: settings,
          sceneItemEnabled: phase === this.currentPhase
        })
        sceneItemId = created.sceneItemId
        messages.push(`Added background "${inputName}".`)
      } else {
        await this.obs.call('SetInputSettings', { inputName, inputSettings: settings })
        sceneItemId = await this.ensureInScene(inputName)
      }
      await this.obs.call('SetSceneItemTransform', {
        sceneName: SCENE_NAME,
        sceneItemId,
        sceneItemTransform: {
          positionX: 0,
          positionY: 0,
          alignment: ALIGN_TOP_LEFT,
          boundsType: 'OBS_BOUNDS_STRETCH',
          boundsAlignment: ALIGN_CENTER,
          boundsWidth: baseWidth,
          boundsHeight: baseHeight,
          rotation: 0,
          cropLeft: 0,
          cropRight: 0,
          cropTop: 0,
          cropBottom: 0
        }
      })
      this.itemIds[phase] = sceneItemId
    }

    // 2. Camera on top.
    const camera = inputs.find((i) => CAMERA_KINDS.includes(i.inputKind as string))
    if (!camera) {
      messages.push('No camera source found in OBS. Add a "Video Capture Device" source in OBS (any scene), then run setup again.')
    } else {
      const cameraName = camera.inputName as string
      const alreadyInScene = await this.sceneItemId(cameraName)
      const camItemId = alreadyInScene ?? (await this.obs.call('CreateSceneItem', { sceneName: SCENE_NAME, sourceName: cameraName })).sceneItemId
      if (alreadyInScene === undefined) {
        // Fill the canvas, keeping the camera's aspect ratio. Left alone on later runs so your own adjustments stick.
        await this.obs.call('SetSceneItemTransform', {
          sceneName: SCENE_NAME,
          sceneItemId: camItemId,
          sceneItemTransform: {
            positionX: 0,
            positionY: 0,
            alignment: ALIGN_TOP_LEFT,
            boundsType: 'OBS_BOUNDS_SCALE_INNER',
            boundsAlignment: ALIGN_CENTER,
            boundsWidth: baseWidth,
            boundsHeight: baseHeight
          }
        })
        messages.push(`Added camera "${cameraName}".`)
      }
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: SCENE_NAME })
      await this.obs.call('SetSceneItemIndex', { sceneName: SCENE_NAME, sceneItemId: camItemId, sceneItemIndex: sceneItems.length - 1 })
      this.setStatus({ cameraName })

      // 3. Background removal on the camera.
      const bg = await this.ensureBgRemoval(cameraName)
      if (bg === 'missing-plugin') {
        messages.push(`Background removal plugin not found. Install obs-backgroundremoval (${BG_REMOVAL_URL}), restart OBS, then run setup again.`)
      } else if (bg === 'added') {
        messages.push(`Added background removal to "${cameraName}".`)
      }
    }

    await this.obs.call('SetCurrentProgramScene', { sceneName: SCENE_NAME })
    this.setStatus({ sceneReady: true })
    await this.showPhase(this.currentPhase)
    if (!messages.length) messages.push('OBS was already set up. Everything is up to date.')
    return { ok: true, messages }
  }

  /** Read-only snapshot of the TM Timer scene, for troubleshooting. */
  async diagnostics(): Promise<{ cameraFilters: { name: string; kind: string; enabled: boolean }[]; programScene: string; items: { name: string; kind: string; enabled: boolean; index: number }[]; files: Record<string, string> }> {
    this.assertConnected()
    const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene')
    const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: SCENE_NAME })
    const files: Record<string, string> = {}
    for (const p of PHASES) {
      const { inputSettings } = await this.obs.call('GetInputSettings', { inputName: BG_INPUT[p] })
      files[p] = typeof inputSettings.file === 'string' ? inputSettings.file : ''
    }
    const cam = sceneItems.find((i) => CAMERA_KINDS.includes(i.inputKind as string))
    const cameraFilters = cam
      ? (await this.obs.call('GetSourceFilterList', { sourceName: cam.sourceName as string })).filters.map((f) => ({
          name: f.filterName as string,
          kind: f.filterKind as string,
          enabled: f.filterEnabled as boolean
        }))
      : []
    return {
      cameraFilters,
      programScene: currentProgramSceneName,
      items: sceneItems.map((i) => ({
        name: i.sourceName as string,
        kind: (i.inputKind as string) ?? 'scene',
        enabled: i.sceneItemEnabled as boolean,
        index: i.sceneItemIndex as number
      })),
      files
    }
  }

  private async refreshSceneState(): Promise<void> {
    if (!this._status.connected) return
    this.itemIds = {}
    for (const phase of PHASES) {
      const id = await this.sceneItemId(BG_INPUT[phase])
      if (id !== undefined) this.itemIds[phase] = id
    }
    let cameraName: string | null = null
    try {
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: SCENE_NAME })
      const cam = sceneItems.find((i) => CAMERA_KINDS.includes(i.inputKind as string))
      cameraName = (cam?.sourceName as string | undefined) ?? null
    } catch {
      // scene doesn't exist yet
    }
    this.setStatus({ sceneReady: PHASES.every((p) => this.itemIds[p] !== undefined), cameraName })
    // Self-heal: e.g. the plugin was installed after setup ran, so the camera never got the filter.
    if (cameraName) await this.ensureBgRemoval(cameraName)
  }

  /** Adds the background-removal filter to the camera if the plugin is installed and the filter is missing. */
  private async ensureBgRemoval(cameraName: string): Promise<'added' | 'present' | 'missing-plugin' | 'unknown'> {
    const available = await this.hasBgRemoval()
    this.setStatus({ bgRemovalAvailable: available })
    if (available === null) return 'unknown'
    if (!available) {
      this.setStatus({ bgRemovalOnCamera: false })
      return 'missing-plugin'
    }
    const { filters } = await this.obs.call('GetSourceFilterList', { sourceName: cameraName })
    const existing = filters.find((f) => f.filterKind === BG_REMOVAL_FILTER_KIND)
    if (existing) {
      if (!existing.filterEnabled) {
        await this.obs.call('SetSourceFilterEnabled', { sourceName: cameraName, filterName: existing.filterName as string, filterEnabled: true })
      }
      this.setStatus({ bgRemovalOnCamera: true })
      return 'present'
    }
    await this.obs.call('CreateSourceFilter', {
      sourceName: cameraName,
      filterName: BG_REMOVAL_FILTER_NAME,
      filterKind: BG_REMOVAL_FILTER_KIND,
      filterSettings: {}
    })
    this.setStatus({ bgRemovalOnCamera: true })
    return 'added'
  }

  private async syncFilesAndPhase(): Promise<void> {
    if (this.currentFiles) await this.setFiles(this.currentFiles)
    await this.showPhase(this.currentPhase)
  }

  private async sceneItemId(sourceName: string): Promise<number | undefined> {
    try {
      const { sceneItemId } = await this.obs.call('GetSceneItemId', { sceneName: SCENE_NAME, sourceName })
      return sceneItemId
    } catch {
      return undefined
    }
  }

  private async ensureInScene(sourceName: string): Promise<number> {
    return (await this.sceneItemId(sourceName)) ?? (await this.obs.call('CreateSceneItem', { sceneName: SCENE_NAME, sourceName })).sceneItemId
  }

  private async hasBgRemoval(): Promise<boolean | null> {
    try {
      const { sourceFilterKinds } = await this.obs.call('GetSourceFilterKindList')
      return sourceFilterKinds.includes(BG_REMOVAL_FILTER_KIND)
    } catch {
      return null // older obs-websocket without this request
    }
  }

  private handleClosed(err: OBSWebSocketError): void {
    const wasConnected = this._status.connected
    this.setStatus({
      connected: false,
      connecting: false,
      sceneReady: false,
      virtualCamActive: false,
      error: this.wantConnected ? (wasConnected ? 'Lost connection to OBS. Reconnecting…' : this._status.error ?? describeError(err)) : null
    })
    if (isAuthError(err)) {
      this.wantConnected = false
      this.setStatus({ error: describeError(err) })
    }
    if (this.wantConnected) this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (!this.wantConnected || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.wantConnected && !this._status.connected && !this._status.connecting) void this.connect()
    }, RECONNECT_MS)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private assertConnected(): void {
    if (!this._status.connected) throw new Error('Not connected to OBS')
  }

  private setStatus(patch: Partial<ObsStatus>): void {
    this._status = { ...this._status, ...patch }
    this.emit('status', this._status)
  }
}

function isAuthError(err: unknown): boolean {
  return err instanceof OBSWebSocketError && err.code === AUTH_FAILED
}

function describeError(err: unknown): string {
  if (isAuthError(err)) return 'OBS rejected the password. Check Tools → WebSocket Server Settings in OBS.'
  const msg = err instanceof Error ? err.message : String(err)
  if (/ECONNREFUSED|connect|1006/i.test(msg) || (err instanceof OBSWebSocketError && err.code === 1006)) {
    return 'Cannot reach OBS. Make sure OBS is open and its WebSocket server is enabled (Tools → WebSocket Server Settings).'
  }
  return msg || 'Unknown OBS error'
}
