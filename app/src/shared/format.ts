export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatSeconds(sec: number): string {
  return formatClock(sec * 1000)
}

/** Parses "m:ss", "m", or "ss" style input into seconds. Returns null when invalid. */
export function parseClock(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const m = /^(\d{1,3})(?::(\d{1,2}))?$/.exec(t)
  if (!m) return null
  const minutes = Number(m[1])
  const seconds = m[2] === undefined ? 0 : Number(m[2])
  if (seconds >= 60) return null
  return minutes * 60 + seconds
}
