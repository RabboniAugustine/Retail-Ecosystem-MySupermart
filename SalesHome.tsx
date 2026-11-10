import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { cedi, isCompleted, startOfToday } from '../lib/format'
import type { InventoryRow, Transaction } from '../lib/types'
import { Btn, EmptyState, Icon, ICONS, SectionTitle, Spinner, StatCard, Th, Td, statusBadge } from '../components/ui'
import { SaleDetail } from '../components/SaleDetail'

/** Salesperson home: my shift today, cash to hand in, stock to watch. */
export function SalesHome({ refresh, onStartSelling }: { refresh: number; onStartSelling: () => void }) {
  const { profile } = useAuth()
  const [txns, setTxns] = useState<Transaction[]>([])
  const [alerts, setAlerts] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const [t, inv] = await Promise.all([
      supabase.from('ms_transactions').select('*, ms_customers(name)')
        .eq('cashier_id', profile.id).gte('created_at', startOfToday()).order('created_at', { ascending: false }),
      supabase.from('ms_inventory').select('*, ms_products!inner(name, active)').eq('ms_products.active', true),
    ])
    setTxns((t.data as Transaction[] | null) ?? [])
    setAlerts((((inv.data as InventoryRow[] | null) ?? []).filter(r => r.stock <= r.reorder_level)).sort((a, b) => a.stock - b.stock))
    setLoading(false)
  }, [profile])

  useEffect(() => { load() }, [load, refresh])

  const done = txns.filter(isCompleted)
  const total = done.reduce((s, t) => s + Number(t.total), 0)
  const by = (m: string) => done.filter(t => t.payment_method === m).reduce((s, t) => s + Number(t.total), 0)
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 22, fontWeight: 700, color: 'var(--c-text)', margin: 0 }}>{greet}, {profile?.full_name?.split(' ')[0]}</h1>
          <p style={{ color: 'var(--c-text-3)', fontSize: 13, marginTop: 3 }}>Your shift today · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Btn onClick={onStartSelling}><Icon d={ICONS.pos} size={15} /> Start selling</Btn>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="g4">
            <StatCard label="My sales today" value={cedi(total)} sub={`${done.length} customers served`} icon="pos" color="var(--c-accent)" />
            <StatCard label="Cash to hand in" value={cedi(by('Cash'))} sub="Cash payments" icon="accounting" color="var(--c-warn)" />
            <StatCard label="Mobile Money" value={cedi(by('Mobile Money'))} sub="MoMo payments" icon="trending" color="var(--c-purple)" />
            <StatCard label="Card" value={cedi(by('Card'))} sub="Card payments" icon="reports" color="var(--c-info)" />
          </div>

          <div className="g-split">
            <div className="stat-card">
              <SectionTitle>My sales today</SectionTitle>
              {txns.length === 0 ? <EmptyState title="No sales yet today" sub="Your sales will show here" /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><Th>Time</Th><Th>Sale</Th><Th>Customer</Th><Th>Payment</Th><Th right>Total</Th><Th>Status</Th></tr></thead>
                    <tbody>
                      {txns.map(t => (
                        <tr key={t.id} className="table-row" onClick={() => setOpen(t.id)} style={{ cursor: 'pointer' }}>
                          <Td mono muted>{new Date(t.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</Td>
                          <Td mono muted>{t.txn_code}</Td>
                          <Td>{t.ms_customers?.name ?? 'Walk-in'}</Td>
                          <Td>{t.payment_method}</Td>
                          <Td mono strong right>{cedi(t.total)}</Td>
                          <Td><span className={statusBadge(t.status)}>{t.status}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="stat-card">
              <SectionTitle>Running low</SectionTitle>
              {alerts.length === 0 ? <EmptyState title="Stock looks good" /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {alerts.slice(0, 10).map(r => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: r.stock <= 0 ? 'color-mix(in srgb, var(--c-danger) 7%, transparent)' : 'color-mix(in srgb, var(--c-warn) 7%, transparent)' }}>
                      <span style={{ fontSize: 13, color: 'var(--c-text)' }}>{r.ms_products?.name}</span>
                      <span className={`badge ${r.stock <= 0 ? 'badge-red' : 'badge-yellow'}`}>{r.stock <= 0 ? 'OUT' : `${r.stock} left`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {open != null && <SaleDetail txnId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
