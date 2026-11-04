/** ₵1,234.50 */
export const cedi = (n: number | string | null | undefined, digits = 2) =>
  `₵${Number(n ?? 0).toLocaleString('en-GH', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`

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

export const isCompleted = (t: { status: string }) => t.status !== 'Refunded'
