import { useState } from 'react'
import { formatClock, formatSeconds } from '@shared/format'
import type { AppSnapshot } from '@shared/types'
import { api, prettyHotkey } from './util'

const PHASE_LABEL = { neutral: 'Waiting', green: 'Green', yellow: 'Yellow', red: 'Red' }

export default function TimerView({ snap }: { snap: AppSnapshot }) {
  const { timer, settings } = snap
  const [speaker, setSpeaker] = useState(timer.speaker)
  const running = timer.status === 'running'
  const active = running || timer.status === 'paused'

  const p = timer.preset
  return (
    <section className="timer-view">
      <div className="row">
        <label className="field grow">
          <span>Speech type</span>
          {/* The timer's preset is pushed live from the main process, so it's the source of truth here. */}
          <select value={timer.preset.id} onChange={(e) => void api.selectPreset(e.target.value)}>
            {settings.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} ({formatSeconds(preset.green)}–{formatSeconds(preset.red)})
              </option>
            ))}
          </select>
        </label>
        <label className="field grow">
          <span>Speaker</span>
          <input
            value={speaker}
            placeholder="Name (optional)"
            onChange={(e) => {
              setSpeaker(e.target.value)
              void api.setSpeaker(e.target.value)
            }}
          />
        </label>
      </div>

      <div className={`light phase-${timer.phase}`}>
        <div className="phase-name">{active || timer.phase !== 'neutral' ? PHASE_LABEL[timer.phase] : timer.status === 'stopped' ? 'Stopped' : 'Ready'}</div>
        <div className="clock">{formatClock(timer.elapsedMs)}</div>
        <div className="marks">
          <span className="mark green">{formatSeconds(p.green)}</span>
          <span className="mark yellow">{formatSeconds(p.yellow)}</span>
          <span className="mark red">{formatSeconds(p.red)}</span>
        </div>
      </div>

      <div className="controls">
        {running ? (
          <button className="btn big" onClick={() => void api.timerPause()}>
            Pause
          </button>
        ) : (
          <button className="btn big primary" onClick={() => void api.timerStart()}>
            {timer.status === 'paused' ? 'Resume' : 'Start'}
          </button>
        )}
        <button className="btn big danger" disabled={!active} onClick={() => void api.timerStop()}>
          Stop
        </button>
        <button className="btn big" disabled={timer.status === 'idle'} onClick={() => void api.timerReset()}>
          Reset
        </button>
      </div>

      <p className="hint">
        Shortcuts work even while Zoom is in front: <kbd>{prettyHotkey(settings.hotkeys.startStop)}</kbd> start/stop ·{' '}
        <kbd>{prettyHotkey(settings.hotkeys.reset)}</kbd> reset. Stop logs the time to the Report tab.
      </p>
      {!snap.obs.sceneReady && (
        <p className="notice">OBS isn't set up yet, so only this window changes color. Open the OBS tab to connect.</p>
      )}
    </section>
  )
}
