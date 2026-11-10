import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase, fetchAll, report, statementReport, ACCOUNTS, type Account } from '../lib/api'
import { useAuth } from '../lib/auth'
import { cedi } from '../lib/format'
import { presetRange, rangeLabel, type Preset, type Range } from '../lib/ranges'
import { downloadReportCsv, downloadReportXlsx, printReport, type ReportOut, type Table } from '../lib/exporter'
import type { ExpenseRow, Purchase } from '../lib/types'
import { Btn, EmptyState, ErrorBox, Icon, ICONS, SectionTitle, Spinner, StatCard, TS, Th, Td, cediTip } from '../components/ui'
import { RangePicker } from '../components/RangePicker'
import { ReportPrint } from '../components/ReportPrint'

type ReportId = 'sales' | 'purchases' | 'pnl' | 'stock' | 'statement' | 'expenses'
const REPORTS: { id: ReportId; label: string }[] = [
  { id: 'sales', label: 'Sales' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'pnl', label: 'Profit & Loss' },
  { id: 'stock', label: 'Stock Summary' },
  { id: 'statement', label: 'Bank Statement' },
  { id: 'expenses', label: 'Expenses' },
]

const n = (v: unknown) => Number(v ?? 0)
const money = (v: unknown) => { const r = Math.round(n(v) * 100) / 100; return r === 0 ? 0 : r }

export function Reports({ refresh }: { refresh: number }) {
  const { settings } = useAuth()
  const [active, setActive] = useState<ReportId>('sales')
  const [preset, setPreset] = useState<Preset>('month')
  const [range, setRange] = useState<Range>(presetRange('month'))
  const [out, setOut] = useState<ReportOut | null>(null)
  const [exporting, setExporting] = useState(false)

  const props = { range, refresh, setOut }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {REPORTS.map(r => (
          <button key={r.id} className="tab-btn" onClick={() => { setOut(null); setActive(r.id) }}
            style={{ background: active === r.id ? 'color-mix(in srgb, var(--c-accent) 12%, transparent)' : 'transparent', color: active === r.id ? 'var(--c-accent)' : 'var(--c-text-3)' }}>{r.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r) }} />
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" disabled={!out} onClick={() => out && downloadReportCsv(out)}><Icon d={ICONS.download} size={14} /> CSV</Btn>
        <Btn variant="ghost" disabled={!out || exporting} onClick={async () => { if (!out) return; setExporting(true); try { await downloadReportXlsx(out) } finally { setExporting(false) } }}><Icon d={ICONS.download} size={14} /> Excel</Btn>
        <Btn variant="ghost" disabled={!out} onClick={printReport}><Icon d={ICONS.printer} size={14} /> Print</Btn>
      </div>

      {active === 'sales' && <SalesReport {...props} />}
      {active === 'purchases' && <PurchasesReport {...props} />}
      {active === 'pnl' && <PnlReport {...props} />}
      {active === 'stock' && <StockReport {...props} />}
      {active === 'statement' && <StatementReport {...props} />}
      {active === 'expenses' && <ExpensesReport {...props} />}

      {out && <ReportPrint report={out} shopName={settings.shop_name} />}
    </div>
  )
}

type Props = { range: Range; refresh: number; setOut: (r: ReportOut | null) => void }

/** Loads report data when the range changes; shows a spinner and errors. */
function useReport<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    run().then(d => { if (alive) setData(d) }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load the report') }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [run])
  return { data, loading, error }
}

function SimpleTable({ t, maxRows }: { t: Table; maxRows?: number }) {
  const rows = maxRows ? t.rows.slice(0, maxRows) : t.rows
  return t.rows.length === 0 ? <div style={{ fontSize: 13, color: 'var(--c-text-3)', padding: '10px 0' }}>Nothing in this period.</div> : (
    <div className="table-wrap">
      <table>
        <thead><tr>{t.columns.map(c => <Th key={c.label} right={c.align === 'right'}>{c.label}</Th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="table-row">
              {r.map((v, j) => {
                const col = t.columns[j]
                return <Td key={j} right={col?.align === 'right'} mono={col?.align === 'right'} strong={j === 0} style={{ whiteSpace: j === 0 ? 'normal' : undefined }}>
                  {typeof v === 'number' && col?.money ? cedi(v) : typeof v === 'number' ? v.toLocaleString() : v}
                </Td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {maxRows && t.rows.length > maxRows && <div style={{ fontSize: 12, color: 'var(--c-text-3)', paddingTop: 8 }}>Showing {maxRows} of {t.rows.length}. Export to see all.</div>}
    </div>
  )
}

// ── Sales ────────────────────────────────────────────────────────────────────
type SalesData = {
  totals: { count: number; gross: number; discount: number; vat: number; total: number }
  refunds: { count: number; total: number }
  items_sold: number
  by_day: { day: string; count: number; total: number }[]
  by_payment: { name: string; count: number; total: number }[]
  by_staff: { name: string; count: number; total: number }[]
  by_product: { name: string; category: string; qty: number; revenue: number }[]
  by_category: { name: string; qty: number; revenue: number }[]
}

function SalesReport({ range, refresh, setOut }: Props) {
  const { data, loading, error } = useReport(() => report<SalesData>('sales', range.from, range.to), [range, refresh])
  const tables = useMemo<Table[]>(() => !data ? [] : [
    { title: 'Daily sales', columns: [{ label: 'Date' }, { label: 'Sales', align: 'right' }, { label: 'Total', align: 'right', money: true }], rows: data.by_day.map(d => [d.day, n(d.count), money(d.total)]) },
    { title: 'By payment method', columns: [{ label: 'Method' }, { label: 'Sales', align: 'right' }, { label: 'Total', align: 'right', money: true }], rows: data.by_payment.map(d => [d.name, n(d.count), money(d.total)]) },
    { title: 'By salesperson', columns: [{ label: 'Salesperson' }, { label: 'Sales', align: 'right' }, { label: 'Total', align: 'right', money: true }], rows: data.by_staff.map(d => [d.name, n(d.count), money(d.total)]) },
    { title: 'By category', columns: [{ label: 'Category' }, { label: 'Units', align: 'right' }, { label: 'Sales (before VAT)', align: 'right', money: true }], rows: data.by_category.map(d => [d.name, n(d.qty), money(d.revenue)]) },
    { title: 'By item', columns: [{ label: 'Item' }, { label: 'Category' }, { label: 'Units', align: 'right' }, { label: 'Sales (before VAT)', align: 'right', money: true }], rows: data.by_product.map(d => [d.name, d.category, n(d.qty), money(d.revenue)]) },
  ], [data])

  useEffect(() => {
    if (!data) { setOut(null); return }
    const t = data.totals
    setOut({
      title: 'Sales report', subtitle: rangeLabel(range),
      summary: [
        { label: 'Number of sales', value: String(t.count) }, { label: 'Items sold', value: String(data.items_sold) },
        { label: 'Gross sales', value: cedi(t.gross) }, { label: 'Discounts', value: cedi(t.discount) },
        { label: 'VAT collected', value: cedi(t.vat) }, { label: 'Total received', value: cedi(t.total) },
        { label: 'Average sale', value: t.count ? cedi(n(t.total) / n(t.count)) : '—' },
        { label: `Refunded (${data.refunds.count})`, value: cedi(data.refunds.total) },
      ],
      tables,
    })
  }, [data, tables, range, setOut])

  if (loading) return <Spinner />
  if (error) return <ErrorBox>{error}</ErrorBox>
  if (!data) return null
  const t = data.totals
  return (
    <>
      <div className="g4">
        <StatCard label="Total received" value={cedi(t.total)} sub={`${t.count} sales · ${data.items_sold} items`} icon="pos" color="var(--c-accent)" />
        <StatCard label="Average sale" value={t.count ? cedi(n(t.total) / n(t.count)) : '—'} icon="trending" color="var(--c-purple)" />
        <StatCard label="Discounts given" value={cedi(t.discount)} sub={`VAT collected ${cedi(t.vat)}`} icon="reports" color="var(--c-warn)" />
        <StatCard label="Refunds" value={cedi(data.refunds.total)} sub={`${data.refunds.count} refunded sales`} icon="refresh" color="var(--c-danger)" />
      </div>
      <div className="stat-card">
        <SectionTitle>Sales per day</SectionTitle>
        {data.by_day.length === 0 ? <EmptyState title="No sales in this period" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.by_day.map(d => ({ day: new Date(`${d.day}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), total: n(d.total) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--c-ink) 4%, transparent)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: 'var(--c-text-3)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--c-text-3)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₵${v}`} width={60} />
              <Tooltip contentStyle={TS} formatter={cediTip('Sales')} cursor={{ fill: 'color-mix(in srgb, var(--c-ink) 3%, transparent)' }} />
              <Bar dataKey="total" fill="var(--c-accent)" radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="g3">
        <div className="stat-card"><SectionTitle>By payment method</SectionTitle><SimpleTable t={tables[1]} /></div>
        <div className="stat-card"><SectionTitle>By salesperson</SectionTitle><SimpleTable t={tables[2]} /></div>
        <div className="stat-card"><SectionTitle>By category</SectionTitle><SimpleTable t={tables[3]} /></div>
      </div>
      <div className="stat-card"><SectionTitle>By item</SectionTitle><SimpleTable t={tables[4]} maxRows={50} /></div>
    </>
  )
}

// ── Purchases ────────────────────────────────────────────────────────────────
function PurchasesReport({ range, refresh, setOut }: Props) {
  const { data, loading, error } = useReport(() => fetchAll<Purchase>((a, b) => supabase.from('ms_purchases').select('*, ms_purchase_items(*)')
    .gte('purchase_date', range.from).lte('purchase_date', range.to).neq('status', 'Void').order('purchase_date').order('id').range(a, b)), [range, refresh])

  const calc = useMemo(() => {
    if (!data) return null
    const total = data.reduce((s, p) => s + n(p.total), 0)
    const paid = data.reduce((s, p) => s + n(p.amount_paid), 0)
    const bySup = new Map<string, { count: number; total: number; paid: number }>()
    const byItem = new Map<string, { qty: number; cost: number }>()
    for (const p of data) {
      const k = p.supplier_name ?? 'No supplier'
      const s = bySup.get(k) ?? { count: 0, total: 0, paid: 0 }
      s.count++; s.total += n(p.total); s.paid += n(p.amount_paid); bySup.set(k, s)
      for (const i of p.ms_purchase_items ?? []) {
        const it = byItem.get(i.product_name) ?? { qty: 0, cost: 0 }
        it.qty += i.quantity; it.cost += n(i.line_total); byItem.set(i.product_name, it)
      }
    }
    const tables: Table[] = [
      { title: 'By supplier', columns: [{ label: 'Supplier' }, { label: 'Purchases', align: 'right' }, { label: 'Total', align: 'right', money: true }, { label: 'Paid', align: 'right', money: true }, { label: 'Owed', align: 'right', money: true }],
        rows: [...bySup.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [k, v.count, money(v.total), money(v.paid), money(v.total - v.paid)]) },
      { title: 'Purchases', columns: [{ label: 'Date' }, { label: 'Purchase' }, { label: 'Supplier' }, { label: 'Invoice' }, { label: 'Total', align: 'right', money: true }, { label: 'Paid', align: 'right', money: true }, { label: 'Status' }],
        rows: data.map(p => [p.purchase_date, p.purchase_code, p.supplier_name ?? '—', p.invoice_no ?? '', money(p.total), money(p.amount_paid), p.status]) },
      { title: 'Items bought', columns: [{ label: 'Item' }, { label: 'Units', align: 'right' }, { label: 'Cost', align: 'right', money: true }, { label: 'Average unit cost', align: 'right', money: true }],
        rows: [...byItem.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([k, v]) => [k, v.qty, money(v.cost), money(v.cost / v.qty)]) },
    ]
    return { total, paid, tables }
  }, [data])

  useEffect(() => {
    if (!calc || !data) { setOut(null); return }
    setOut({ title: 'Purchase report', subtitle: rangeLabel(range), tables: calc.tables, summary: [
      { label: 'Number of purchases', value: String(data.length) }, { label: 'Total purchased', value: cedi(calc.total) },
      { label: 'Paid', value: cedi(calc.paid) }, { label: 'Still owed', value: cedi(calc.total - calc.paid) },
    ] })
  }, [calc, data, range, setOut])

  if (loading) return <Spinner />
  if (error) return <ErrorBox>{error}</ErrorBox>
  if (!calc || !data) return null
  return (
    <>
      <div className="g3">
        <StatCard label="Total purchased" value={cedi(calc.total)} sub={`${data.length} purchases`} icon="inventory" color="var(--c-cyan)" />
        <StatCard label="Paid" value={cedi(calc.paid)} icon="accounting" color="var(--c-accent)" />
        <StatCard label="Still owed" value={cedi(calc.total - calc.paid)} icon="alert" color="var(--c-danger)" />
      </div>
      <div className="g-split">
        <div className="stat-card"><SectionTitle>Items bought</SectionTitle><SimpleTable t={calc.tables[2]} maxRows={30} /></div>
        <div className="stat-card"><SectionTitle>By supplier</SectionTitle><SimpleTable t={calc.tables[0]} /></div>
      </div>
      <div className="stat-card"><SectionTitle>Purchases</SectionTitle><SimpleTable t={calc.tables[1]} maxRows={100} /></div>
    </>
  )
}

// ── Profit & Loss ────────────────────────────────────────────────────────────
type PnlData = {
  sales: number; discount: number; net_sales: number; vat: number; cogs: number; cogs_estimated: boolean; gross_profit: number
  expenses: { name: string; total: number }[]; expenses_total: number; stock_loss: number; net_profit: number; purchases: number
}

function PnlReport({ range, refresh, setOut }: Props) {
  const { data, loading, error } = useReport(() => report<PnlData>('pnl', range.from, range.to), [range, refresh])

  const lines = useMemo(() => {
    if (!data) return []
    const pct = (v: number) => n(data.net_sales) ? ` (${((v / n(data.net_sales)) * 100).toFixed(1)}%)` : ''
    type L = { label: string; value: number | null; kind?: 'head' | 'total' | 'sub' | 'grand'; note?: string }
    const l: L[] = [
      { label: 'Income', value: null, kind: 'head' },
      { label: 'Sales (before VAT)', value: n(data.sales) },
      { label: 'Less: discounts', value: -n(data.discount) },
      { label: 'Net sales', value: n(data.net_sales), kind: 'total' },
      { label: 'Less: cost of goods sold', value: -n(data.cogs), note: data.cogs_estimated ? 'Some older sales use today\'s cost price' : undefined },
      { label: `Gross profit${pct(n(data.gross_profit))}`, value: n(data.gross_profit), kind: 'total' },
      { label: 'Expenses', value: null, kind: 'head' },
      ...data.expenses.map(e => ({ label: e.name, value: -n(e.total), kind: 'sub' as const })),
      ...(data.expenses.length === 0 ? [{ label: 'No expenses recorded', value: 0, kind: 'sub' as const }] : []),
      { label: 'Total expenses', value: -n(data.expenses_total), kind: 'total' },
      { label: 'Stock removed (expired, damaged, lost)', value: -n(data.stock_loss) },
      { label: `Net profit${pct(n(data.net_profit))}`, value: n(data.net_profit), kind: 'grand' },
    ]
    return l
  }, [data])

  useEffect(() => {
    if (!data) { setOut(null); return }
    setOut({ title: 'Profit and loss', subtitle: rangeLabel(range),
      summary: [
        { label: 'Net sales', value: cedi(data.net_sales) }, { label: 'Gross profit', value: cedi(data.gross_profit) },
        { label: 'Net profit', value: cedi(data.net_profit) }, { label: 'VAT collected (not income)', value: cedi(data.vat) },
        { label: 'Stock purchased in period', value: cedi(data.purchases) },
      ],
      tables: [{ title: 'Profit and loss', columns: [{ label: 'Line' }, { label: 'Amount (₵)', align: 'right', money: true }],
        rows: lines.map(l => [l.kind === 'sub' ? `   ${l.label}` : l.label, l.value == null ? null : money(l.value)]) }] })
  }, [data, lines, range, setOut])

  if (loading) return <Spinner />
  if (error) return <ErrorBox>{error}</ErrorBox>
  if (!data) return null
  return (
    <>
      <div className="g4">
        <StatCard label="Net sales" value={cedi(data.net_sales)} sub="Sales minus discounts, before VAT" icon="pos" color="var(--c-accent)" />
        <StatCard label="Gross profit" value={cedi(data.gross_profit)} sub="After cost of goods sold" icon="trending" color="var(--c-info)" />
        <StatCard label="Expenses" value={cedi(n(data.expenses_total) + n(data.stock_loss))} sub="Including stock removed" icon="receipt" color="var(--c-danger)" />
        <StatCard label="Net profit" value={cedi(data.net_profit)} icon="accounting" color={n(data.net_profit) >= 0 ? 'var(--c-good)' : 'var(--c-danger)'} />
      </div>
      <div className="stat-card" style={{ maxWidth: 760 }}>
        <SectionTitle>Profit and loss · {rangeLabel(range)}</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {lines.map((l, i) => l.kind === 'head' ? (
            <div key={i} style={{ fontSize: 11, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, padding: '14px 0 6px' }}>{l.label}</div>
          ) : (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', gap: 12, padding: l.kind === 'grand' ? '12px 0' : '7px 0',
              paddingLeft: l.kind === 'sub' ? 16 : 0,
              borderTop: l.kind === 'total' || l.kind === 'grand' ? '1px solid color-mix(in srgb, var(--c-ink) 10%, transparent)' : undefined,
              borderBottom: l.kind === 'grand' ? '3px double color-mix(in srgb, var(--c-ink) 20%, transparent)' : undefined,
              fontWeight: l.kind === 'total' || l.kind === 'grand' ? 700 : 400,
              fontSize: l.kind === 'grand' ? 16 : 13, color: l.kind === 'sub' ? 'var(--c-text-2)' : 'var(--c-text)',
            }}>
              <span>{l.label}{l.note && <span style={{ display: 'block', fontSize: 11, color: 'var(--c-text-3)', fontWeight: 400 }}>{l.note}</span>}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: l.kind === 'grand' ? (n(l.value) >= 0 ? 'var(--c-good)' : 'var(--c-danger)') : undefined }}>
                {n(l.value) < 0 ? `(${cedi(-n(l.value))})` : cedi(l.value)}
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 14, lineHeight: 1.6 }}>
          VAT collected in this period: <b style={{ color: 'var(--c-text-2)' }}>{cedi(data.vat)}</b> (owed to GRA, not income). Stock purchased: <b style={{ color: 'var(--c-text-2)' }}>{cedi(data.purchases)}</b>. Purchases become a cost only when the goods are sold.
        </div>
      </div>
    </>
  )
}

// ── Stock summary ────────────────────────────────────────────────────────────
type StockRow = { id: number; name: string; sku: string | null; category: string; cost: number; price: number; reorder_level: number; opening: number; bought: number; sold: number; other: number; closing: number; value: number }

function StockReport({ range, refresh, setOut }: Props) {
  const { data, loading, error } = useReport(() => report<StockRow[]>('stock', range.from, range.to), [range, refresh])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')

  const table = useMemo<Table | null>(() => !data ? null : ({
    title: 'Stock summary',
    columns: [{ label: 'Item' }, { label: 'SKU' }, { label: 'Category' }, { label: 'Opening', align: 'right' }, { label: 'Bought', align: 'right' }, { label: 'Sold', align: 'right' },
      { label: 'Other changes', align: 'right' }, { label: 'Closing', align: 'right' }, { label: 'Unit cost', align: 'right', money: true }, { label: 'Value at cost', align: 'right', money: true }],
    rows: data.map(r => [r.name, r.sku ?? '', r.category, n(r.opening), n(r.bought), n(r.sold), n(r.other), n(r.closing), money(r.cost), money(r.value)]),
  }), [data])

  const totals = useMemo(() => !data ? null : {
    units: data.reduce((s, r) => s + Math.max(0, n(r.closing)), 0),
    value: data.reduce((s, r) => s + n(r.value), 0),
    retail: data.reduce((s, r) => s + Math.max(0, n(r.closing)) * n(r.price), 0),
    sold: data.reduce((s, r) => s + n(r.sold), 0),
    bought: data.reduce((s, r) => s + n(r.bought), 0),
    low: data.filter(r => n(r.closing) <= n(r.reorder_level)).length,
  }, [data])

  useEffect(() => {
    if (!table || !totals) { setOut(null); return }
    setOut({ title: 'Stock summary', subtitle: rangeLabel(range), tables: [table], summary: [
      { label: 'Items', value: String(table.rows.length) }, { label: 'Units bought', value: totals.bought.toLocaleString() },
      { label: 'Units sold', value: totals.sold.toLocaleString() }, { label: 'Units in stock at end', value: totals.units.toLocaleString() },
      { label: 'Stock value at cost', value: cedi(totals.value) }, { label: 'Stock value at selling price', value: cedi(totals.retail) },
    ] })
  }, [table, totals, range, setOut])

  if (loading) return <Spinner />
  if (error) return <ErrorBox>{error}</ErrorBox>
  if (!data || !table || !totals) return null
  const cats = ['All', ...Array.from(new Set(data.map(r => r.category))).sort()]
  const s = q.trim().toLowerCase()
  const shown = data.filter(r => (cat === 'All' || r.category === cat) && (!s || r.name.toLowerCase().includes(s) || r.sku?.toLowerCase().includes(s)))
  return (
    <>
      <div className="g4">
        <StatCard label="Stock value at cost" value={cedi(totals.value)} sub={`At the end of ${rangeLabel(range)}`} icon="inventory" color="var(--c-cyan)" />
        <StatCard label="Value at selling price" value={cedi(totals.retail)} icon="pos" color="var(--c-accent)" />
        <StatCard label="Units bought / sold" value={`${totals.bought.toLocaleString()} / ${totals.sold.toLocaleString()}`} icon="trending" color="var(--c-purple)" />
        <StatCard label="At or below reorder" value={String(totals.low)} icon="alert" color="var(--c-warn)" />
      </div>
      <div className="stat-card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input className="input-field" placeholder="Search item or SKU" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 260 }} />
          <select className="input-field" value={cat} onChange={e => setCat(e.target.value)} style={{ width: 'auto' }}>{cats.map(c => <option key={c}>{c}</option>)}</select>
        </div>
        {shown.length === 0 ? <EmptyState title="No items" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><Th>Item</Th><Th>Category</Th><Th right>Opening</Th><Th right>Bought</Th><Th right>Sold</Th><Th right>Other</Th><Th right>Closing</Th><Th right>Value at cost</Th></tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id} className="table-row">
                    <Td strong style={{ whiteSpace: 'normal' }}>{r.name}{r.sku && <span style={{ color: 'var(--c-text-4)', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>{r.sku}</span>}</Td>
                    <Td>{r.category}</Td>
                    <Td mono right>{n(r.opening)}</Td>
                    <Td mono right style={{ color: n(r.bought) ? 'var(--c-good)' : undefined }}>{n(r.bought) ? `+${n(r.bought)}` : 0}</Td>
                    <Td mono right style={{ color: n(r.sold) ? 'var(--c-danger)' : undefined }}>{n(r.sold) ? `−${n(r.sold)}` : 0}</Td>
                    <Td mono right muted>{n(r.other) > 0 ? `+${n(r.other)}` : n(r.other)}</Td>
                    <Td mono right strong style={{ color: n(r.closing) <= n(r.reorder_level) ? 'var(--c-warn)' : 'var(--c-text)' }}>{n(r.closing)}</Td>
                    <Td mono right>{cedi(r.value)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 10 }}>Other = stock counts, opening stock, refunds and removals. Closing stock is shown in amber when it is at or below the reorder level.</div>
      </div>
    </>
  )
}

// ── Bank statement ───────────────────────────────────────────────────────────
type StatementData = { opening: number; closing: number; lines: { date: string; description: string; kind: string; money_in: number; money_out: number }[] }

function StatementReport({ range, refresh, setOut }: Props) {
  const [account, setAccount] = useState<Account>('Bank')
  const { data, loading, error } = useReport(() => statementReport<StatementData>(account, range.from, range.to), [account, range, refresh])

  const rows = useMemo(() => {
    if (!data) return []
    let bal = n(data.opening)
    return data.lines.map(l => { bal += n(l.money_in) - n(l.money_out); return { ...l, balance: bal } })
  }, [data])

  useEffect(() => {
    if (!data) { setOut(null); return }
    const tin = rows.reduce((s, r) => s + n(r.money_in), 0), tout = rows.reduce((s, r) => s + n(r.money_out), 0)
    setOut({ title: `${account} statement`, subtitle: rangeLabel(range),
      summary: [{ label: 'Opening balance', value: cedi(data.opening) }, { label: 'Money in', value: cedi(tin) }, { label: 'Money out', value: cedi(tout) }, { label: 'Closing balance', value: cedi(data.closing) }],
      tables: [{ title: `${account} statement`, columns: [{ label: 'Date' }, { label: 'Description' }, { label: 'Money in', align: 'right', money: true }, { label: 'Money out', align: 'right', money: true }, { label: 'Balance', align: 'right', money: true }],
        rows: [[range.from, 'Opening balance', null, null, money(data.opening)], ...rows.map(r => [r.date, r.description, n(r.money_in) ? money(r.money_in) : null, n(r.money_out) ? money(r.money_out) : null, money(r.balance)]), [range.to, 'Closing balance', money(tin), money(tout), money(data.closing)]] }] })
  }, [data, rows, account, range, setOut])

  const tin = rows.reduce((s, r) => s + n(r.money_in), 0), tout = rows.reduce((s, r) => s + n(r.money_out), 0)
  return (
    <>
      <div style={{ display: 'flex', gap: 4 }}>
        {ACCOUNTS.map(a => (
          <button key={a} className="tab-btn" onClick={() => setAccount(a)}
            style={{ background: account === a ? 'color-mix(in srgb, var(--c-info) 14%, transparent)' : 'transparent', color: account === a ? 'var(--c-info)' : 'var(--c-text-3)' }}>{a}</button>
        ))}
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox>{error}</ErrorBox> : data && (
        <>
          <div className="g4">
            <StatCard label="Opening balance" value={cedi(data.opening)} icon="accounting" color="var(--c-text-2)" />
            <StatCard label="Money in" value={cedi(tin)} icon="trending" color="var(--c-good)" />
            <StatCard label="Money out" value={cedi(tout)} icon="receipt" color="var(--c-danger)" />
            <StatCard label="Closing balance" value={cedi(data.closing)} icon="accounting" color="var(--c-info)" />
          </div>
          <div className="stat-card">
            <SectionTitle>{account} statement · {rangeLabel(range)}</SectionTitle>
            <div className="table-wrap">
              <table>
                <thead><tr><Th>Date</Th><Th>Description</Th><Th right>Money in</Th><Th right>Money out</Th><Th right>Balance</Th></tr></thead>
                <tbody>
                  <tr><Td mono muted>{range.from}</Td><Td strong>Opening balance</Td><Td /><Td /><Td mono right strong>{cedi(data.opening)}</Td></tr>
                  {rows.map((r, i) => (
                    <tr key={i} className="table-row">
                      <Td mono muted>{r.date}</Td>
                      <Td style={{ whiteSpace: 'normal' }}>{r.description}</Td>
                      <Td mono right style={{ color: 'var(--c-good)' }}>{n(r.money_in) ? cedi(r.money_in) : ''}</Td>
                      <Td mono right style={{ color: 'var(--c-danger)' }}>{n(r.money_out) ? cedi(r.money_out) : ''}</Td>
                      <Td mono right strong>{cedi(r.balance)}</Td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid color-mix(in srgb, var(--c-ink) 10%, transparent)' }}><Td mono muted>{range.to}</Td><Td strong>Closing balance</Td><Td mono right>{cedi(tin)}</Td><Td mono right>{cedi(tout)}</Td><Td mono right strong>{cedi(data.closing)}</Td></tr>
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 10, lineHeight: 1.6 }}>
              Cash sales go to Cash, card sales to Bank and Mobile Money sales to Mobile Money. Sales are grouped into one line per day. Record deposits and transfers in Accounting → Money in / out.
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── Expenses ─────────────────────────────────────────────────────────────────
function ExpensesReport({ range, refresh, setOut }: Props) {
  const { data, loading, error } = useReport(() => fetchAll<ExpenseRow>((a, b) => supabase.from('ms_expenses').select('*')
    .gte('date', range.from).lte('date', range.to).order('date').order('id').range(a, b)), [range, refresh])

  const calc = useMemo(() => {
    if (!data) return null
    const total = data.reduce((s, e) => s + n(e.amount), 0)
    const group = (key: (e: ExpenseRow) => string) => {
      const m = new Map<string, { count: number; total: number }>()
      data.forEach(e => { const k = key(e); const v = m.get(k) ?? { count: 0, total: 0 }; v.count++; v.total += n(e.amount); m.set(k, v) })
      return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
    }
    const byCat = group(e => e.category), byAcc = group(e => e.paid_from)
    const tables: Table[] = [
      { title: 'By category', columns: [{ label: 'Category' }, { label: 'Entries', align: 'right' }, { label: 'Total', align: 'right', money: true }, { label: 'Share', align: 'right' }],
        rows: byCat.map(([k, v]) => [k, v.count, money(v.total), total ? `${((v.total / total) * 100).toFixed(1)}%` : '']) },
      { title: 'By account', columns: [{ label: 'Paid from' }, { label: 'Entries', align: 'right' }, { label: 'Total', align: 'right', money: true }],
        rows: byAcc.map(([k, v]) => [k, v.count, money(v.total)]) },
      { title: 'All expenses', columns: [{ label: 'Date' }, { label: 'Description' }, { label: 'Category' }, { label: 'Paid from' }, { label: 'Recorded by' }, { label: 'Amount', align: 'right', money: true }],
        rows: data.map(e => [e.date, e.description, e.category, e.paid_from, e.created_by_name ?? '', money(e.amount)]) },
    ]
    return { total, byCat, tables }
  }, [data])

  useEffect(() => {
    if (!calc || !data) { setOut(null); return }
    setOut({ title: 'Expenses report', subtitle: rangeLabel(range), tables: calc.tables,
      summary: [{ label: 'Number of expenses', value: String(data.length) }, { label: 'Total expenses', value: cedi(calc.total) }, ...calc.byCat.slice(0, 3).map(([k, v]) => ({ label: k, value: cedi(v.total) }))] })
  }, [calc, data, range, setOut])

  if (loading) return <Spinner />
  if (error) return <ErrorBox>{error}</ErrorBox>
  if (!calc || !data) return null
  return (
    <>
      <div className="g3">
        <StatCard label="Total expenses" value={cedi(calc.total)} sub={`${data.length} entries`} icon="receipt" color="var(--c-danger)" />
        <StatCard label="Biggest category" value={calc.byCat[0]?.[0] ?? '—'} sub={calc.byCat[0] ? cedi(calc.byCat[0][1].total) : undefined} icon="reports" color="var(--c-warn)" />
        <StatCard label="Average per day" value={cedi(calc.total / Math.max(1, Math.round((new Date(`${range.to}T00:00:00`).getTime() - new Date(`${range.from}T00:00:00`).getTime()) / 86400000) + 1))} icon="trending" color="var(--c-purple)" />
      </div>
      <div className="g-split">
        <div className="stat-card">
          <SectionTitle>By category</SectionTitle>
          {calc.byCat.length === 0 ? <EmptyState title="No expenses in this period" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {calc.byCat.map(([k, v]) => (
                <div key={k}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: 'var(--c-text)' }}>{k} <span style={{ color: 'var(--c-text-4)', fontSize: 11 }}>{v.count}</span></span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--c-text)' }}>{cedi(v.total)}</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${(v.total / calc.byCat[0][1].total) * 100}%`, background: 'var(--c-danger)' }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="stat-card"><SectionTitle>By account</SectionTitle><SimpleTable t={calc.tables[1]} /></div>
      </div>
      <div className="stat-card"><SectionTitle>All expenses</SectionTitle><SimpleTable t={calc.tables[2]} maxRows={100} /></div>
    </>
  )
}
