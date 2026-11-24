import { useEffect, useState } from 'react'
import type { AppSnapshot } from '@shared/types'
import { api } from './util'
import TimerView from './TimerView'
import PresetsView from './PresetsView'
import BackgroundsView from './BackgroundsView'
import ObsView from './ObsView'
import HistoryView from './HistoryView'
import logo from './assets/logo.png'

const TABS = ['Timer', 'Speech types', 'Backgrounds', 'OBS', 'Report'] as const
type Tab = (typeof TABS)[number]

export default function App() {
  const [snap, setSnap] = useState<AppSnapshot | null>(null)
  const [tab, setTab] = useState<Tab>('Timer')

  const reload = () => api.getSnapshot().then(setSnap)

  useEffect(() => {
    void reload()
    const offs = [
      api.onTimer((timer) => setSnap((s) => (s ? { ...s, timer } : s))),
      api.onObs((obs) => setSnap((s) => (s ? { ...s, obs } : s))),
      api.onHistory((history) => setSnap((s) => (s ? { ...s, history } : s))),
      api.onSets((sets, activeSetId) => setSnap((s) => (s ? { ...s, sets, settings: { ...s.settings, activeSetId } } : s)))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  if (!snap) return null

  const obsLabel = !snap.obs.connected
    ? snap.obs.connecting
      ? 'OBS: connecting…'
      : 'OBS: not connected'
    : !snap.obs.sceneReady
      ? 'OBS: needs setup'
      : snap.obs.virtualCamActive
        ? 'OBS: live'
        : 'OBS: virtual cam off'
  const obsTone = snap.obs.connected && snap.obs.sceneReady ? (snap.obs.virtualCamActive ? 'ok' : 'warn') : 'bad'

  return (
    <div className="app">
      <header className="brand">
        <img src={logo} alt="" className="brand-logo" />
        <span className="brand-name">Toastmasters Timer</span>
        <button className={`obs-pill ${obsTone}`} onClick={() => setTab('OBS')} title="OBS connection">
          <span className="dot" />
          {obsLabel}
        </button>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t}
            {t === 'Report' && snap.history.length > 0 && <span className="count">{snap.history.length}</span>}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'Timer' && <TimerView snap={snap} />}
        {tab === 'Speech types' && <PresetsView snap={snap} onSaved={reload} />}
        {tab === 'Backgrounds' && <BackgroundsView snap={snap} />}
        {tab === 'OBS' && <ObsView snap={snap} onSaved={reload} />}
        {tab === 'Report' && <HistoryView snap={snap} />}
      </main>
    </div>
  )
}
