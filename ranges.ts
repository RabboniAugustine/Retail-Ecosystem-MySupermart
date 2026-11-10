import { localDate } from './format'

export type Range = { from: string; to: string }
export type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'year' | 'custom'

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
]

export function presetRange(p: Preset, current?: Range): Range {
  const now = new Date()
  const d = (y: number, m: number, day: number) => localDate(new Date(y, m, day))
  const y = now.getFullYear(), m = now.getMonth()
  switch (p) {
    case 'today': return { from: localDate(now), to: localDate(now) }
    case 'yesterday': { const t = new Date(now); t.setDate(t.getDate() - 1); return { from: localDate(t), to: localDate(t) } }
    case 'week': { const t = new Date(now); const dow = (t.getDay() + 6) % 7; t.setDate(t.getDate() - dow); return { from: localDate(t), to: localDate(now) } }
    case 'month': return { from: d(y, m, 1), to: localDate(now) }
    case 'last_month': return { from: d(y, m - 1, 1), to: d(y, m, 0) }
    case 'year': return { from: d(y, 0, 1), to: localDate(now) }
    default: return current ?? { from: d(y, m, 1), to: localDate(now) }
  }
}

export const rangeLabel = (r: Range) => {
  const f = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return r.from === r.to ? f(r.from) : `${f(r.from)} – ${f(r.to)}`
}

/** ISO bounds for filtering timestamp columns by local calendar days. */
export const rangeBounds = (r: Range) => ({
  start: new Date(`${r.from}T00:00:00`).toISOString(),
  end: new Date(new Date(`${r.to}T00:00:00`).getTime() + 86400000).toISOString(),
})
