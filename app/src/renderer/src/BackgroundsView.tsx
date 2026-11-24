import { useState } from 'react'
import { PHASES, type AppSnapshot, type BackgroundSet, type Phase } from '@shared/types'
import { api, errorText, imageUrl } from './util'

export default function BackgroundsView({ snap }: { snap: AppSnapshot }) {
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <section>
      <h2>Background sets</h2>
      <p className="hint">
        A set is four images: neutral (before green), green, yellow and red. 16:9 images work best (e.g. 1920×1080). Click an image slot or drop a
        file on it to upload. Uploaded files are copied into the app, so you can move or delete the originals.
      </p>
      {error && <p className="error-text">{error}</p>}

      <div className="new-set row">
        <input className="grow" placeholder="New set name, e.g. Club colors" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button
          className="btn"
          onClick={() =>
            run(async () => {
              await api.createSet(newName || 'My backgrounds')
              setNewName('')
            })
          }
        >
          + New set
        </button>
      </div>

      {snap.sets.map((set) => (
        <SetCard key={set.id} set={set} active={set.id === snap.settings.activeSetId} run={run} />
      ))}
    </section>
  )
}

function SetCard({ set, active, run }: { set: BackgroundSet; active: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const complete = PHASES.every((p) => set.files[p])
  return (
    <div className={active ? 'set-card active' : 'set-card'}>
      <div className="set-head">
        {set.builtIn ? (
          <strong>{set.name}</strong>
        ) : (
          <input className="set-name" defaultValue={set.name} onBlur={(e) => run(() => api.renameSet(set.id, e.target.value))} />
        )}
        {set.builtIn && <span className="tag">built-in</span>}
        <span className="spacer" />
        {active ? (
          <span className="tag ok">In use</span>
        ) : (
          <button className="btn small primary" disabled={!complete} title={complete ? '' : 'Add all four images first'} onClick={() => run(() => api.setActiveSet(set.id))}>
            Use this set
          </button>
        )}
        {!set.builtIn && (
          <button
            className="btn small ghost"
            onClick={() => {
              if (confirm(`Delete "${set.name}" and its images?`)) void run(() => api.deleteSet(set.id))
            }}
          >
            Delete
          </button>
        )}
      </div>
      <div className="slots">
        {PHASES.map((phase) => (
          <Slot key={phase} set={set} phase={phase} run={run} />
        ))}
      </div>
    </div>
  )
}

function Slot({ set, phase, run }: { set: BackgroundSet; phase: Phase; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [over, setOver] = useState(false)
  const file = set.files[phase]
  const editable = !set.builtIn
  return (
    <button
      className={`slot slot-${phase}${over ? ' over' : ''}${editable ? '' : ' readonly'}`}
      disabled={!editable}
      onClick={() => run(() => api.pickImageForSet(set.id, phase))}
      onDragOver={(e) => {
        if (!editable) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (editable && f) void run(() => api.setImageFromPath(set.id, phase, api.getPathForFile(f)))
      }}
    >
      {file ? <img src={imageUrl(file)} alt={`${phase} background`} /> : <span className="empty">+ Add image</span>}
      <span className="slot-label">{phase}</span>
    </button>
  )
}
