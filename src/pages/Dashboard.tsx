import { useCallback, useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/api'
import { cedi, dateTime, isCompleted, localDate } from '../lib/format'
import type { InventoryRow, Transaction } from '../lib/types'
import { EmptyState, Icon, ICONS, SectionTitle, Spinner, StatCard, TS, Th, Td, cediTip, statusBadge } from '../components/ui'

/** Revenue before VAT minus cost of the goods sold (only where cost is known). */
export const grossProfit = (t: Transaction) => {
  const items = t.ms_transaction_items ?? []
  if (!items.length || items.some(i => i.unit_cost == null)) return null
  const cogs = items.reduce((s, i) => s + Number(i.unit_cost) * i.quantity, 0)
  return Number(t.subtotal) - Number(t.discount_amount ?? 0) - cogs
}

export function Dashboard({ refresh }: { refresh: number }) {
  const [txns, setTxns] = useState<Transaction[]>([])
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - 14 * 86400000).toISOString()
    const [t, inv] = await Promise.all([
      supabase.from('ms_transactions')
        .select('*, ms_customers(name), ms_transaction_items(quantity, unit_price, unit_cost)')
        .gte('created_at', since).order('created_at', { ascending: false }),
      supabase.from('ms_inventory').select('*, ms_products!inner(name, active)').eq('ms_products.active', true),
    ])
    setTxns((t.data as Transaction[] | null) ?? [])
    setInventory((inv.data as InventoryRow[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const today = localDate()
  const done = txns.filter(isCompleted)
  const todayTxns = done.filter(t => localDate(t.created_at) === today)
  const todayRevenue = todayTxns.reduce((s, t) => s + Number(t.total), 0)
  const todayProfit = todayTxns.reduce((s, t) => s + (grossProfit(t) ?? 0), 0)
  const yesterday = localDate(new Date(Date.now() - 86400000))
  const yRevenue = done.filter(t => localDate(t.created_at) === yesterday).reduce((s, t) => s + Number(t.total), 0)
  const trend = yRevenue > 0 ? `${todayRevenue >= yRevenue ? '+' : ''}${(((todayRevenue - yRevenue) / yRevenue) * 100).toFixed(0)}%` : undefined
  const alerts = inventory.filter(r => r.stock <= r.reorder_level).sort((a, b) => a.stock - b.stock)
  const refundsToday = txns.filter(t => t.status === 'Refunded' && localDate(t.created_at) === today).length

  const chartData = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000)
    const key = localDate(d)
    return { day: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), sales: done.filter(t => localDate(t.created_at) === key).reduce((s, t) => s + Number(t.total), 0) }
  })

  const byStaff = Object.values(todayTxns.reduce((acc, t) => {
    const k = t.cashier_name ?? 'Unassigned'
    acc[k] = acc[k] ?? { name: k, count: 0, total: 0 }
    acc[k].count++; acc[k].total += Number(t.total)
    return acc
  }, {} as Record<string, { name: string; count: number; total: number }>)).sort((a, b) => b.total - a.total)

  const byMethod = ['Cash', 'Mobile Money', 'Card'].map(m => ({ m, total: todayTxns.filter(t => t.payment_method === m).reduce((s, t) => s + Number(t.total), 0) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 22, fontWeight: 700, color: 'var(--c-text)', margin: 0 }}>Owner overview</h1>
          <p style={{ color: 'var(--c-text-3)', fontSize: 13, marginTop: 3 }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="g4">
            <StatCard label="Today's revenue" value={cedi(todayRevenue)} sub={`${todayTxns.length} sales${refundsToday ? ` · ${refundsToday} refunded` : ''}`} trend={trend} icon="pos" color="var(--c-accent)" />
            <StatCard label="Today's gross profit" value={cedi(todayProfit)} sub="Sales before VAT minus cost of goods" icon="accounting" color="var(--c-info)" />
            <StatCard label="Average sale today" value={todayTxns.length ? cedi(todayRevenue / todayTxns.length) : '—'} sub="Per customer" icon="trending" color="var(--c-purple)" />
            <StatCard label="Stock alerts" value={alerts.length.toString()} sub={`${alerts.filter(a => a.stock <= 0).length} out of stock`} icon="alert" color={alerts.some(a => a.stock <= 0) ? 'var(--c-danger)' : 'var(--c-warn)'} />
          </div>

          <div className="g-split">
            <div className="stat-card">
              <SectionTitle>Sales, last 14 days</SectionTitle>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--c-accent)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--c-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--c-ink) 4%, transparent)" />
                  <XAxis dataKey="day" tick={{ fill: 'var(--c-text-3)', fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis tick={{ fill: 'var(--c-text-3)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₵${v}`} width={56} />
                  <Tooltip contentStyle={TS} formatter={cediTip('Sales')} />
                  <Area type="monotone" dataKey="sales" stroke="var(--c-accent)" strokeWidth={2} fill="url(#sg)" dot={{ fill: 'var(--c-accent)', r: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="stat-card">
              <SectionTitle>Today by salesperson</SectionTitle>
              {byStaff.length === 0 ? <EmptyState title="No sales yet today" /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {byStaff.map(s => (
                    <div key={s.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: 'var(--c-text)', fontWeight: 500 }}>{s.name} <span style={{ color: 'var(--c-text-4)', fontSize: 11 }}>{s.count} sales</span></span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--c-accent)', fontWeight: 600 }}>{cedi(s.total)}</span>
                      </div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${(s.total / byStaff[0].total) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ borderTop: '1px solid color-mix(in srgb, var(--c-ink) 6%, transparent)', marginTop: 16, paddingTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {byMethod.map(x => (
                  <div key={x.m}>
                    <div style={{ fontSize: 10, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{x.m}</div>
                    <div style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--c-text)', fontWeight: 600 }}>{cedi(x.total, 0)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="g-split">
            <div className="stat-card">
              <SectionTitle right={<span style={{ fontSize: 12, color: 'var(--c-text-4)' }}>Last 10</span>}>Recent sales</SectionTitle>
              {txns.length === 0 ? <EmptyState title="No sales yet" sub="Complete your first sale in Point of Sale" /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><Th>Sale</Th><Th>Customer</Th><Th>By</Th><Th>Payment</Th><Th right>Total</Th><Th>Time</Th><Th>Status</Th></tr></thead>
                    <tbody>
                      {txns.slice(0, 10).map(t => (
                        <tr key={t.id} className="table-row">
                          <Td mono muted>{t.txn_code}</Td>
                          <Td>{t.ms_customers?.name ?? 'Walk-in'}</Td>
                          <Td>{t.cashier_name ?? '—'}</Td>
                          <Td>{t.payment_method}</Td>
                          <Td mono strong right>{cedi(t.total)}</Td>
                          <Td mono muted>{dateTime(t.created_at)}</Td>
                          <Td><span className={statusBadge(t.status)}>{t.status}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="stat-card">
              <SectionTitle>Stock alerts</SectionTitle>
              {alerts.length === 0 ? <EmptyState title="All stock levels healthy" /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {alerts.slice(0, 8).map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: r.stock <= 0 ? 'color-mix(in srgb, var(--c-danger) 7%, transparent)' : 'color-mix(in srgb, var(--c-warn) 7%, transparent)', border: `1px solid ${r.stock <= 0 ? 'color-mix(in srgb, var(--c-danger) 15%, transparent)' : 'color-mix(in srgb, var(--c-warn) 15%, transparent)'}` }}>
                      <span style={{ fontSize: 13, color: 'var(--c-text)', fontWeight: 500 }}>{r.ms_products?.name}</span>
                      <span className={`badge ${r.stock <= 0 ? 'badge-red' : 'badge-yellow'}`}>{r.stock <= 0 ? 'OUT' : `${r.stock} left`}</span>
                    </div>
                  ))}
                  {alerts.length > 8 && <div style={{ fontSize: 12, color: 'var(--c-text-3)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon d={ICONS.alert} size={12} /> {alerts.length - 8} more in Inventory → Low stock</div>}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
