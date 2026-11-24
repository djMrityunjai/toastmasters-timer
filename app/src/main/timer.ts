import { EventEmitter } from 'node:events'
import type { Phase, Preset, TimerState } from '@shared/types'

export function phaseAt(elapsedMs: number, preset: Preset): Phase {
  const s = elapsedMs / 1000
  if (s >= preset.red) return 'red'
  if (s >= preset.yellow) return 'yellow'
  if (s >= preset.green) return 'green'
  return 'neutral'
}

export function isWithinLimits(elapsedMs: number, preset: Preset, graceSeconds: number): boolean {
  const s = elapsedMs / 1000
  return s >= preset.green - graceSeconds && s <= preset.red + graceSeconds
}

export function validatePreset(p: Preset): string | null {
  if (!p.name.trim()) return 'Name is required'
  for (const k of ['green', 'yellow', 'red'] as const) {
    if (!Number.isFinite(p[k]) || p[k] < 0) return `${k} time is invalid`
  }
  if (!(p.green <= p.yellow && p.yellow <= p.red)) return 'Times must be in order: green ≤ yellow ≤ red'
  if (p.red === 0) return 'Red time must be greater than 0'
  return null
}

export interface TimerEvents {
  tick: [TimerState]
  phase: [Phase]
  stopped: [TimerState]
}

/**
 * Speech timer. Time is measured from a monotonic clock, never by counting ticks,
 * so a delayed tick can't make the timer drift.
 */
export class TimerEngine extends EventEmitter<TimerEvents> {
  private status: TimerState['status'] = 'idle'
  private accumulatedMs = 0
  private startedAt = 0
  private lastPhase: Phase = 'neutral'
  private interval: NodeJS.Timeout | null = null

  constructor(
    private preset: Preset,
    private speaker = '',
    private readonly now: () => number = () => performance.now(),
    private readonly tickMs = 200
  ) {
    super()
  }

  get state(): TimerState {
    const elapsedMs = this.elapsedMs()
    return {
      status: this.status,
      elapsedMs,
      phase: this.status === 'stopped' || this.status === 'idle' ? 'neutral' : phaseAt(elapsedMs, this.preset),
      preset: this.preset,
      speaker: this.speaker
    }
  }

  setPreset(preset: Preset): void {
    this.preset = preset
    this.evaluate()
  }

  setSpeaker(name: string): void {
    this.speaker = name
    this.emit('tick', this.state)
  }

  start(): void {
    if (this.status === 'running') return
    if (this.status === 'stopped' || this.status === 'idle') this.accumulatedMs = 0
    this.status = 'running'
    this.startedAt = this.now()
    this.startInterval()
    this.evaluate()
  }

  pause(): void {
    if (this.status !== 'running') return
    this.accumulatedMs = this.elapsedMs()
    this.status = 'paused'
    this.stopInterval()
    this.evaluate()
  }

  /** Ends the current speech. Returns the final state, or null if nothing was timed. */
  stop(): TimerState | null {
    if (this.status !== 'running' && this.status !== 'paused') return null
    this.accumulatedMs = this.elapsedMs()
    this.status = 'paused' // freeze the clock so `state` reports the final time
    const final = this.state
    this.status = 'stopped'
    this.stopInterval()
    this.evaluate()
    this.emit('stopped', final)
    return final
  }

  reset(): void {
    this.stopInterval()
    this.status = 'idle'
    this.accumulatedMs = 0
    this.evaluate()
  }

  /** Re-computes state; emits `phase` only when the phase actually changes. */
  evaluate(): void {
    const state = this.state
    if (state.phase !== this.lastPhase) {
      this.lastPhase = state.phase
      this.emit('phase', state.phase)
    }
    this.emit('tick', state)
  }

  dispose(): void {
    this.stopInterval()
    this.removeAllListeners()
  }

  private elapsedMs(): number {
    return this.status === 'running' ? this.accumulatedMs + (this.now() - this.startedAt) : this.accumulatedMs
  }

  private startInterval(): void {
    this.stopInterval()
    if (this.tickMs > 0) this.interval = setInterval(() => this.evaluate(), this.tickMs)
  }

  private stopInterval(): void {
    if (this.interval) clearInterval(this.interval)
    this.interval = null
  }
}
