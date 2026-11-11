/** ₵1,234.50 */
export const cedi = (n: number | string | null | undefined, digits = 2) => {
  let v = Number(n ?? 0)
  if (!isFinite(v) || Math.abs(v) < 0.5 / 10 ** digits) v = 0
  const s = Math.abs(v).toLocaleString('en-GH', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return v < 0 ? `−₵${s}` : `₵${s}`
}

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" is correct after midnight UTC). */
export const localDate = (d: Date | string = new Date()) => {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Start of today in local time, as ISO string for database filters. */
export const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export const dateTime = (s: string) =>
  new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** "11 Nov 2026, 09:30" */
export const dateTimeFull = (s: string) =>
  new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Value for <input type="datetime-local"> in local time, e.g. 2026-11-11T09:30 */
export const localDateTimeInput = (d: Date = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const isCompleted = (t: { status: string }) => t.status !== 'Refunded'
