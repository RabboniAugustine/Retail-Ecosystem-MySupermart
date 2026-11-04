import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/api'
import { cedi, dateTime, isCompleted, localDate } from '../lib/format'
import type { Transaction } from '../lib/types'
import { EmptyState, Icon, ICONS, Spinner, StatCard, Th, Td, statusBadge } from '../components/ui'
import { SaleDetail } from '../components/SaleDetail'

/** Owner: every sale, filter by date / salesperson / payment, open receipt, refund. */
export function SalesHistory({ refresh }: { refresh: number }) {
  const [from, setFrom] = useState(localDate(new Date(Date.now() - 6 * 86400000)))
  const [to, setTo] = useState(localDate())
  const [staff, setStaff] = useState('All')
  const [method, setMethod] = useState('All')
  const [search, setSearch] = useState('')
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const start = new Date(`${from}T00:00:00`).toISOString()
    const end = new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString()
    const { data } = await supabase.from('ms_transactions').select('*, ms_customers(name)')
      .gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false }).limit(2000)
    setTxns((data as Transaction[] | null) ?? [])
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load, refresh])

  const staffNames = ['All', ...Array.from(new Set(txns.map(t => t.cashier_name ?? 'Unassigned'))).sort()]
  const s = search.trim().toLowerCase()
  const shown = txns.filter(t =>
    (staff === 'All' || (t.cashier_name ?? 'Unassigned') === staff) &&
    (method === 'All' || t.payment_method === method) &&
    (!s || t.txn_code?.toLowerCase().includes(s) || t.ms_customers?.name?.toLowerCase().includes(s)))
  const done = shown.filter(isCompleted)
  const revenue = done.reduce((a, t) => a + Number(t.total), 0)
  const refunded = shown.filter(t => t.status === 'Refunded')

  const exportCsv = () => {
    const rows = [['Date', 'Sale', 'Customer', 'Salesperson', 'Payment', 'Subtotal', 'Discount', 'VAT', 'Total', 'Status']]
    shown.forEach(t => rows.push([new Date(t.created_at).toLocaleString('en-GB'), t.txn_code, t.ms_customers?.name ?? 'Walk-in', t.cashier_name ?? '', t.payment_method,
      String(t.subtotal), String(t.discount_amount ?? 0), String(t.tax), String(t.total), t.status]))
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `sales_${from}_to_${to}.csv`
    a.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="g4">
        <StatCard label="Revenue" value={cedi(revenue)} sub={`${done.length} sales`} icon="pos" color="#00d46a" />
        <StatCard label="Average sale" value={done.length ? cedi(revenue / done.length) : '—'} icon="trending" color="#a855f7" />
        <StatCard label="VAT collected" value={cedi(done.reduce((a, t) => a + Number(t.tax), 0))} icon="reports" color="#3b82f6" />
        <StatCard label="Refunds" value={refunded.length.toString()} sub={cedi(refunded.reduce((a, t) => a + Number(t.total), 0))} icon="refresh" color="#ef4444" />
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <input className="input-field" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150 }} />
          <span style={{ color: '#4b5563', fontSize: 12 }}>to</span>
          <input className="input-field" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150 }} />
          <select className="input-field" value={staff} onChange={e => setStaff(e.target.value)} style={{ width: 160 }}>
            {staffNames.map(n => <option key={n} value={n}>{n === 'All' ? 'All salespeople' : n}</option>)}
          </select>
          <select className="input-field" value={method} onChange={e => setMethod(e.target.value)} style={{ width: 150 }}>
            {['All', 'Cash', 'Mobile Money', 'Card'].map(n => <option key={n} value={n}>{n === 'All' ? 'All payments' : n}</option>)}
          </select>
          <input className="input-field" placeholder="Sale no. or customer" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 160px', maxWidth: 240 }} />
          <div style={{ flex: 1 }} />
          <button onClick={exportCsv} className="pos-key" style={{ padding: '8px 12px', gap: 6, color: '#9ca3af' }}><Icon d={ICONS.download} size={14} /> Export CSV</button>
        </div>
        {loading ? <Spinner /> : shown.length === 0 ? <EmptyState title="No sales in this period" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><Th>Date</Th><Th>Sale</Th><Th>Customer</Th><Th>Salesperson</Th><Th>Payment</Th><Th right>Discount</Th><Th right>Total</Th><Th>Status</Th></tr></thead>
              <tbody>
                {shown.map(t => (
                  <tr key={t.id} className="table-row" onClick={() => setOpen(t.id)} style={{ cursor: 'pointer' }}>
                    <Td mono muted>{dateTime(t.created_at)}</Td>
                    <Td mono muted>{t.txn_code}</Td>
                    <Td>{t.ms_customers?.name ?? 'Walk-in'}</Td>
                    <Td>{t.cashier_name ?? '—'}</Td>
                    <Td>{t.payment_method}</Td>
                    <Td mono right muted>{Number(t.discount_pct) > 0 ? `${Number(t.discount_pct)}%` : '—'}</Td>
                    <Td mono strong right>{cedi(t.total)}</Td>
                    <Td><span className={statusBadge(t.status)}>{t.status}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open != null && <SaleDetail txnId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}
