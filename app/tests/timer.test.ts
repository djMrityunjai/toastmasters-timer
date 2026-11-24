import { describe, expect, it } from 'vitest'
import { isWithinLimits, phaseAt, TimerEngine, validatePreset } from '../src/main/timer'
import { formatClock, parseClock } from '../src/shared/format'
import type { Phase, Preset } from '../src/shared/types'

const speech: Preset = { id: 's', name: 'Prepared Speech', green: 300, yellow: 360, red: 420 }

function makeEngine(preset = speech) {
  let t = 0
  const clock = { advance: (s: number) => (t += s * 1000) }
  const engine = new TimerEngine(preset, '', () => t, 0)
  const phases: Phase[] = []
  engine.on('phase', (p) => phases.push(p))
  return { engine, clock, phases }
}

describe('phaseAt', () => {
  it('switches exactly at the thresholds', () => {
    expect(phaseAt(0, speech)).toBe('neutral')
    expect(phaseAt(299_999, speech)).toBe('neutral')
    expect(phaseAt(300_000, speech)).toBe('green')
    expect(phaseAt(360_000, speech)).toBe('yellow')
    expect(phaseAt(420_000, speech)).toBe('red')
    expect(phaseAt(9_999_000, speech)).toBe('red')
  })
})

describe('TimerEngine', () => {
  it('emits each phase once, in order', () => {
    const { engine, clock, phases } = makeEngine()
    engine.start()
    for (let i = 0; i < 500; i++) {
      clock.advance(1)
      engine.evaluate()
    }
    expect(phases).toEqual(['green', 'yellow', 'red'])
  })

  it('pause freezes elapsed time and phase', () => {
    const { engine, clock } = makeEngine()
    engine.start()
    clock.advance(310)
    engine.pause()
    clock.advance(1000)
    expect(engine.state.elapsedMs).toBe(310_000)
    expect(engine.state.phase).toBe('green')
    engine.start()
    clock.advance(60)
    expect(engine.state.elapsedMs).toBe(370_000)
    expect(engine.state.phase).toBe('yellow')
  })

  it('stop returns the final time and goes back to neutral', () => {
    const { engine, clock, phases } = makeEngine()
    engine.start()
    clock.advance(425)
    engine.evaluate()
    const final = engine.stop()
    expect(final?.elapsedMs).toBe(425_000)
    expect(final?.phase).toBe('red')
    expect(engine.state.status).toBe('stopped')
    expect(engine.state.elapsedMs).toBe(425_000)
    expect(engine.state.phase).toBe('neutral')
    expect(phases.at(-1)).toBe('neutral')
  })

  it('start after stop begins a fresh speech', () => {
    const { engine, clock } = makeEngine()
    engine.start()
    clock.advance(100)
    engine.stop()
    engine.start()
    clock.advance(5)
    expect(engine.state.elapsedMs).toBe(5_000)
  })

  it('stop when idle does nothing', () => {
    const { engine } = makeEngine()
    expect(engine.stop()).toBeNull()
  })

  it('changing preset mid-speech re-evaluates the phase', () => {
    const { engine, clock } = makeEngine()
    engine.start()
    clock.advance(70)
    expect(engine.state.phase).toBe('neutral')
    engine.setPreset({ id: 't', name: 'Table Topics', green: 60, yellow: 90, red: 120 })
    expect(engine.state.phase).toBe('green')
  })

  it('reset returns to idle at zero', () => {
    const { engine, clock } = makeEngine()
    engine.start()
    clock.advance(400)
    engine.reset()
    expect(engine.state).toMatchObject({ status: 'idle', elapsedMs: 0, phase: 'neutral' })
  })
})

describe('limits and validation', () => {
  it('applies the grace period on both sides', () => {
    expect(isWithinLimits(270_000, speech, 30)).toBe(true)
    expect(isWithinLimits(269_000, speech, 30)).toBe(false)
    expect(isWithinLimits(450_000, speech, 30)).toBe(true)
    expect(isWithinLimits(451_000, speech, 30)).toBe(false)
  })

  it('rejects out-of-order times', () => {
    expect(validatePreset({ ...speech, yellow: 500 })).toMatch(/order/)
    expect(validatePreset(speech)).toBeNull()
  })
})

describe('format', () => {
  it('formats and parses m:ss', () => {
    expect(formatClock(65_400)).toBe('1:05')
    expect(parseClock('7:30')).toBe(450)
    expect(parseClock('7')).toBe(420)
    expect(parseClock('1:75')).toBeNull()
    expect(parseClock('abc')).toBeNull()
  })
})
