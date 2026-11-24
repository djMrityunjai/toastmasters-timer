import { useState } from 'react'
import { formatClock, formatSeconds } from '@shared/format'
import type { AppSnapshot, HistoryEntry } from '@shared/types'
import { api } from './util'

function reportText(entries: HistoryEntry[]): string {
  const lines = entries.map(
    (e, i) =>
      `${i + 1}. ${e.speaker} — ${e.presetName}: ${formatClock(e.elapsedMs)} (${formatSeconds(e.green)}–${formatSeconds(e.red)})${e.withinLimits ? '' : ' ⚠ outside time'}`
  )
  return `Timer's report\n${lines.join('\n')}`
}

export default function HistoryView({ snap }: { snap: AppSnapshot }) {
  const [copied, setCopied] = useState(false)
  const entries = snap.history

  return (
    <section>
      <h2>Timer's report</h2>
      {entries.length === 0 ? (
        <p className="hint">Nothing timed yet. Each time you press Stop, the speaker and their time are added here.</p>
      ) : (
        <>
          <table className="history">
            <thead>
              <tr>
                <th>#</th>
                <th>Speaker</th>
                <th>Type</th>
                <th>Time</th>
                <th>Range</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id}>
                  <td>{i + 1}</td>
                  <td>{e.speaker}</td>
                  <td>{e.presetName}</td>
                  <td className="mono">{formatClock(e.elapsedMs)}</td>
                  <td className="mono muted">
                    {formatSeconds(e.green)}–{formatSeconds(e.red)}
                  </td>
                  <td>{e.withinLimits ? <span className="tag ok">within time</span> : <span className="tag bad">outside</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="savebar">
            <button
              className="btn primary"
              onClick={async () => {
                await api.copyText(reportText(entries))
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? 'Copied!' : 'Copy report'}
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                if (confirm('Clear all timed speeches?')) void api.clearHistory()
              }}
            >
              Clear
            </button>
            <span className="hint">Paste into Zoom chat when you give your report.</span>
          </div>
        </>
      )}
    </section>
  )
}
