import { useState } from 'react'
import { formatSeconds, parseClock } from '@shared/format'
import type { AppSnapshot, Hotkeys, Preset } from '@shared/types'
import { api, errorText } from './util'

interface Row {
  id: string
  name: string
  green: string
  yellow: string
  red: string
}

const toRow = (p: Preset): Row => ({ id: p.id, name: p.name, green: formatSeconds(p.green), yellow: formatSeconds(p.yellow), red: formatSeconds(p.red) })

export default function PresetsView({ snap, onSaved }: { snap: AppSnapshot; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[]>(snap.settings.presets.map(toRow))
  const [grace, setGrace] = useState(String(snap.settings.graceSeconds))
  const [hotkeys, setHotkeys] = useState<Hotkeys>(snap.settings.hotkeys)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const save = async () => {
    setMsg(null)
    try {
      const presets: Preset[] = rows.map((r) => {
        const [green, yellow, red] = [r.green, r.yellow, r.red].map(parseClock)
        if (green === null || yellow === null || red === null) throw new Error(`${r.name || 'Unnamed'}: use m:ss for times, e.g. 5:30`)
        return { id: r.id, name: r.name.trim(), green, yellow, red }
      })
      await api.savePresets(presets)
      await api.setGraceSeconds(Number(grace))
      const hk = await api.setHotkeys(hotkeys)
      if (!hk.ok) throw new Error(hk.error)
      setMsg({ tone: 'ok', text: 'Saved.' })
      onSaved()
    } catch (err) {
      setMsg({ tone: 'bad', text: errorText(err) })
    }
  }

  return (
    <section>
      <h2>Speech types</h2>
      <p className="hint">Times are from the start of the speech, as m:ss. The background turns green, yellow, then red, and stays red.</p>
      <table className="presets">
        <thead>
          <tr>
            <th>Name</th>
            <th className="g">Green</th>
            <th className="y">Yellow</th>
            <th className="r">Red</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td>
                <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
              </td>
              {(['green', 'yellow', 'red'] as const).map((k) => (
                <td key={k}>
                  <input className="time" value={r[k]} onChange={(e) => update(i, { [k]: e.target.value })} />
                </td>
              ))}
              <td>
                <button className="btn ghost" title="Delete" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn" onClick={() => setRows([...rows, { id: crypto.randomUUID(), name: 'New speech type', green: '1:00', yellow: '1:30', red: '2:00' }])}>
        + Add speech type
      </button>

      <h2>Report</h2>
      <label className="field inline">
        <span>Grace period (seconds)</span>
        <input className="time" value={grace} onChange={(e) => setGrace(e.target.value)} />
      </label>
      <p className="hint">A speech counts as "within time" if it ends between green − grace and red + grace.</p>

      <h2>Keyboard shortcuts</h2>
      <p className="hint">
        Global: they work while Zoom is in front. Use Electron accelerator format, e.g. <code>CommandOrControl+Shift+S</code>.
      </p>
      <div className="row">
        <label className="field grow">
          <span>Start / stop</span>
          <input value={hotkeys.startStop} onChange={(e) => setHotkeys({ ...hotkeys, startStop: e.target.value })} />
        </label>
        <label className="field grow">
          <span>Reset</span>
          <input value={hotkeys.reset} onChange={(e) => setHotkeys({ ...hotkeys, reset: e.target.value })} />
        </label>
      </div>

      <div className="savebar">
        <button className="btn primary" onClick={save}>
          Save
        </button>
        {msg && <span className={msg.tone === 'ok' ? 'ok-text' : 'error-text'}>{msg.text}</span>}
      </div>
    </section>
  )
}
