import { useCallback, useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { supabase } from '../lib/api'
import type { InventoryRow, Transaction } from '../lib/types'
import { CATEGORY_COLORS, EmptyState, Spinner, StatCard, TS, cediTip } from '../components/ui'

// ── Reports ────────────────────────────────────────────────────────────────

export function Reports({ refresh }: { refresh: number }) {
  const [txns, setTxns] = useState<Transaction[]>([])
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'7D' | '30D' | 'ALL'>('30D')

  const load = useCallback(async () => {
    setLoading(true)
    const [t, inv] = await Promise.allSettled([
      supabase.from('ms_transactions').select('*, ms_transaction_items(quantity, unit_price, product_name, ms_products(name, category))').neq('status', 'Refunded').order('created_at', { ascending: false }),
      supabase.from('ms_inventory').select('id, stock, reorder_level, ms_products!inner(name, category, price, cost, active)').eq('ms_products.active', true),
    ])
    if (t.status === 'fulfilled' && t.value.data) setTxns(t.value.data)
    if (inv.status === 'fulfilled' && inv.value.data) setInventory(inv.value.data as unknown as InventoryRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const cutoff = period === '7D' ? Date.now() - 7 * 86400000 : period === '30D' ? Date.now() - 30 * 86400000 : 0
  const filtered = txns.filter(t => new Date(t.created_at).getTime() >= cutoff)

  const dailyData = (() => {
    const map: Record<string, number> = {}
    filtered.forEach(t => {
      const d = t.created_at.slice(0, 10)
      map[d] = (map[d] || 0) + Number(t.total)
    })
    return Object.entries(map).sort().map(([date, revenue]) => ({ date: date.slice(5), revenue }))
  })()

  type TxnWithItems = Transaction
  const productMap: Record<string, { name: string; revenue: number; qty: number; category: string }> = {}
  ;(filtered as TxnWithItems[]).forEach(t => {
    t.ms_transaction_items?.forEach(item => {
      const name = item.ms_products?.name ?? item.product_name ?? 'Removed product'
      if (!productMap[name]) productMap[name] = { name, revenue: 0, qty: 0, category: item.ms_products?.category ?? '' }
      productMap[name].revenue += Number(item.unit_price) * item.quantity
      productMap[name].qty += item.quantity
    })
  })
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8)

  const catData = Object.entries(
    (filtered as TxnWithItems[]).flatMap(t => t.ms_transaction_items ?? []).reduce((acc, item) => {
      const cat = item.ms_products?.category ?? 'Other'
      acc[cat] = (acc[cat] || 0) + Number(item.unit_price) * item.quantity
      return acc
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value, color: CATEGORY_COLORS[name] ?? '#9ca3af' }))

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 22, fontWeight: 700, margin: 0 }}>Sales Reports</h2>
        <div style={{ display: 'flex', gap: 4, background: '#0d1120', padding: 4, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['7D', '30D', 'ALL'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className="tab-btn" style={{ background: period === p ? 'rgba(0,212,106,0.12)' : 'transparent', color: period === p ? '#00d46a' : '#6b7280' }}>{p}</button>
          ))}
        </div>
      </div>

      <div className="g3">
        <StatCard label="Revenue" value={`₵${filtered.reduce((s, t) => s + Number(t.total), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${period} period`} icon="pos" color="#00d46a" />
        <StatCard label="Transactions" value={filtered.length.toString()} sub={`${period} period`} icon="reports" color="#3b82f6" />
        <StatCard label="Avg Sale Value" value={filtered.length ? `₵${(filtered.reduce((s, t) => s + Number(t.total), 0) / filtered.length).toFixed(2)}` : '—'} sub="Per transaction" icon="trending" color="#a855f7" />
      </div>

      <div className="stat-card">
        <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Daily Revenue</h3>
        {dailyData.length === 0 ? (
          <EmptyState icon="📈" title="No sales in this period" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d46a" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00d46a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₵${v}`} />
              <Tooltip contentStyle={TS} formatter={cediTip('Revenue')} />
              <Area type="monotone" dataKey="revenue" stroke="#00d46a" strokeWidth={2} fill="url(#rg)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="g-split">
        <div className="stat-card">
          <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>Top Products by Revenue</h3>
          {topProducts.length === 0 ? (
            <EmptyState icon="🏆" title="No product data yet" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topProducts.map((p, i) => {
                const maxRev = topProducts[0].revenue
                return (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5563', minWidth: 18, textAlign: 'right' }}>#{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#e8ecf4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#00d46a', fontWeight: 600, marginLeft: 8 }}>₵{p.revenue.toFixed(2)}</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${(p.revenue / maxRev) * 100}%`, background: CATEGORY_COLORS[p.category] ?? '#00d46a' }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6b7280', minWidth: 40, textAlign: 'right' }}>{p.qty} sold</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="stat-card">
          <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>Revenue by Category</h3>
          {catData.length === 0 ? (
            <EmptyState icon="🍰" title="No category data yet" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {catData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TS} formatter={cediTip('')} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {[...catData].sort((a, b) => b.value - a.value).map(c => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color }} />
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>{c.name}</span>
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#e8ecf4' }}>₵{c.value.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: 0 }}>Inventory Health</h3>
        </div>
        <div className="g3">
          {inventory.filter(r => r.stock <= r.reorder_level).slice(0, 6).map(r => (
            <div key={r.id} style={{ padding: '12px 14px', borderRadius: 8, background: r.stock === 0 ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${r.stock === 0 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)'}` }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#e8ecf4', marginBottom: 4 }}>{r.ms_products?.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Stock: <span style={{ fontFamily: 'JetBrains Mono, monospace', color: r.stock === 0 ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>{r.stock}</span></span>
                <span className={`badge ${r.stock === 0 ? 'badge-red' : 'badge-yellow'}`}>{r.stock === 0 ? 'OUT' : 'LOW'}</span>
              </div>
            </div>
          ))}
          {inventory.filter(r => r.stock <= r.reorder_level).length === 0 && (
            <div style={{ gridColumn: '1/-1' }}>
              <EmptyState icon="✅" title="All inventory levels are healthy" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
