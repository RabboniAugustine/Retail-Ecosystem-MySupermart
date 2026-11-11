import { Fragment, useCallback, useEffect, useState } from 'react'
import { supabase, fetchAll, deleteSale, type DeletedRecord } from '../lib/api'
import { cedi, dateTime, isCompleted, localDate } from '../lib/format'
import type { Transaction } from '../lib/types'
import { Btn, EmptyState, ErrorBox, Field, Icon, ICONS, Modal, Spinner, StatCard, Th, Td, statusBadge } from '../components/ui'
import { SaleDetail } from '../components/SaleDetail'

/** Owner: every sale, filter by date / salesperson / payment, open receipt, refund, delete. */
export function SalesHistory({ refresh }: { refresh: number }) {
  const [from, setFrom] = useState(localDate(new Date(Date.now() - 6 * 86400000)))
  const [to, setTo] = useState(localDate())
  const [staff, setStaff] = useState('All')
  const [method, setMethod] = useState('All')
  const [search, setSearch] = useState('')
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [delReason, setDelReason] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState('')
  const [delProgress, setDelProgress] = useState('')
  const [showLog, setShowLog] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const start = new Date(`${from}T00:00:00`).toISOString()
    const end = new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString()
    const rows = await fetchAll<Transaction>((a, b) => supabase.from('ms_transactions').select('*, ms_customers(name)')
      .gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false }).range(a, b)).catch(() => [])
    setTxns(rows)
    setSelected(new Set())
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

  const toggle = (id: number) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allShownSelected = shown.length > 0 && shown.every(t => selected.has(t.id))
  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map(t => t.id)))
  const selectedTxns = txns.filter(t => selected.has(t.id))

  const runDelete = async () => {
    if (!delReason.trim()) { setDelError('Please give a reason.'); return }
    setDelBusy(true); setDelError('')
    const failed: string[] = []
    let i = 0
    for (const t of selectedTxns) {
      i++; setDelProgress(`Deleting ${i} of ${selectedTxns.length}…`)
      try { await deleteSale(t.id, delReason) } catch (e) { failed.push(`${t.txn_code}: ${e instanceof Error ? e.message : 'failed'}`) }
    }
    setDelBusy(false); setDelProgress('')
    if (failed.length) setDelError(`Some sales were not deleted. ${failed.join(' · ')}`)
    else { setConfirmDelete(false); setDelReason('') }
    load()
  }

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
        <StatCard label="Revenue" value={cedi(revenue)} sub={`${done.length} sales`} icon="pos" color="var(--c-accent)" />
        <StatCard label="Average sale" value={done.length ? cedi(revenue / done.length) : '—'} icon="trending" color="var(--c-purple)" />
        <StatCard label="VAT collected" value={cedi(done.reduce((a, t) => a + Number(t.tax), 0))} icon="reports" color="var(--c-info)" />
        <StatCard label="Refunds" value={refunded.length.toString()} sub={cedi(refunded.reduce((a, t) => a + Number(t.total), 0))} icon="refresh" color="var(--c-danger)" />
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <input className="input-field" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150 }} />
          <span style={{ color: 'var(--c-text-4)', fontSize: 12 }}>to</span>
          <input className="input-field" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150 }} />
          <select className="input-field" value={staff} onChange={e => setStaff(e.target.value)} style={{ width: 160 }}>
            {staffNames.map(n => <option key={n} value={n}>{n === 'All' ? 'All salespeople' : n}</option>)}
          </select>
          <select className="input-field" value={method} onChange={e => setMethod(e.target.value)} style={{ width: 150 }}>
            {['All', 'Cash', 'Mobile Money', 'Card'].map(n => <option key={n} value={n}>{n === 'All' ? 'All payments' : n}</option>)}
          </select>
          <input className="input-field" placeholder="Sale no. or customer" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 160px', maxWidth: 240 }} />
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowLog(true)} className="pos-key" style={{ padding: '8px 12px', gap: 6, color: 'var(--c-text-2)' }}><Icon d={ICONS.history} size={14} /> Deleted sales</button>
          <button onClick={exportCsv} className="pos-key" style={{ padding: '8px 12px', gap: 6, color: 'var(--c-text-2)' }}><Icon d={ICONS.download} size={14} /> Export CSV</button>
        </div>
        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'color-mix(in srgb, var(--c-danger) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger) 25%, transparent)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--c-text)' }}><b>{selected.size}</b> selected · {cedi(selectedTxns.reduce((a, t) => a + Number(t.total), 0))}</span>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={() => setSelected(new Set())}>Clear</Btn>
            <Btn variant="danger" onClick={() => { setDelError(''); setDelReason(''); setConfirmDelete(true) }}><Icon d={ICONS.trash} size={14} /> Delete selected</Btn>
          </div>
        )}
        {loading ? <Spinner /> : shown.length === 0 ? <EmptyState title="No sales in this period" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><Th><input type="checkbox" aria-label="Select all" checked={allShownSelected} onChange={toggleAll} style={{ accentColor: 'var(--c-accent)', width: 15, height: 15, cursor: 'pointer' }} /></Th><Th>Date</Th><Th>Sale</Th><Th>Customer</Th><Th>Salesperson</Th><Th>Payment</Th><Th right>Discount</Th><Th right>Total</Th><Th>Status</Th></tr></thead>
              <tbody>
                {shown.map(t => (
                  <tr key={t.id} className="table-row" onClick={() => setOpen(t.id)} style={{ cursor: 'pointer', background: selected.has(t.id) ? 'color-mix(in srgb, var(--c-danger) 5%, transparent)' : undefined }}>
                    <Td><input type="checkbox" aria-label={`Select ${t.txn_code}`} checked={selected.has(t.id)} onClick={e => e.stopPropagation()} onChange={() => toggle(t.id)} style={{ accentColor: 'var(--c-accent)', width: 15, height: 15, cursor: 'pointer' }} /></Td>
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

      {confirmDelete && (
        <Modal title={`Delete ${selectedTxns.length} ${selectedTxns.length === 1 ? 'sale' : 'sales'}`} onClose={() => !delBusy && setConfirmDelete(false)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
              These sales ({cedi(selectedTxns.reduce((a, t) => a + Number(t.total), 0))}) will be <b style={{ color: 'var(--c-danger)' }}>removed permanently</b> from all reports and accounts, as if they never happened.
              Items go back into stock and customers' points are taken back (except for sales that were already refunded).
              A copy of each is kept in the Deleted sales log.
            </div>
            <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--c-text-2)', border: '1px solid color-mix(in srgb, var(--c-ink) 8%, transparent)', borderRadius: 8, padding: '6px 10px' }}>
              {selectedTxns.map(t => <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{t.txn_code}</span><span>{cedi(t.total)}</span></div>)}
            </div>
            <Field label="Reason *"><input autoFocus className="input-field" value={delReason} onChange={e => setDelReason(e.target.value)} placeholder="e.g. test sales before opening" /></Field>
            <ErrorBox>{delError}</ErrorBox>
            {delProgress && <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{delProgress}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" disabled={delBusy} onClick={() => setConfirmDelete(false)}>Cancel</Btn>
              <Btn variant="danger" disabled={delBusy || !delReason.trim()} onClick={runDelete}>{delBusy ? 'Deleting…' : `Delete ${selectedTxns.length}`}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showLog && <DeletedLog onClose={() => setShowLog(false)} />}
    </div>
  )
}

/** Every deleted sale: what it was, who deleted it, when and why. */
function DeletedLog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<DeletedRecord[] | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  useEffect(() => {
    supabase.from('ms_deleted_records').select('*').eq('record_type', 'sale').order('deleted_at', { ascending: false }).limit(500)
      .then(({ data }) => setRows((data as DeletedRecord[] | null) ?? []))
  }, [])
  return (
    <Modal title="Deleted sales" onClose={onClose} width={720}>
      {!rows ? <Spinner /> : rows.length === 0 ? <EmptyState title="No sales have been deleted" /> : (
        <div className="table-wrap" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          <table>
            <thead><tr><Th>Deleted</Th><Th>Sale</Th><Th>Sold on</Th><Th right>Total</Th><Th>Reason</Th><Th>By</Th></tr></thead>
            <tbody>
              {rows.map(r => (
                <Fragment key={r.id}>
                  <tr className="table-row" onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                    <Td mono muted>{dateTime(r.deleted_at)}</Td>
                    <Td mono>{r.record_code}</Td>
                    <Td mono muted>{r.snapshot.created_at ? dateTime(r.snapshot.created_at) : '—'}</Td>
                    <Td mono right strong>{cedi(r.amount)}</Td>
                    <Td style={{ whiteSpace: 'normal' }}>{r.reason}</Td>
                    <Td>{r.deleted_by_name ?? '—'}</Td>
                  </tr>
                  {openId === r.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: '6px 10px 12px', fontSize: 12, color: 'var(--c-text-2)' }}>
                        {r.snapshot.payment_method} · {r.snapshot.cashier_name ?? 'Unknown salesperson'} · {r.snapshot.customer_name ?? 'Walk-in'}{r.snapshot.status === 'Refunded' ? ' · was refunded' : ''}
                        {(r.snapshot.items ?? []).map((i, k) => (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 420, fontFamily: 'JetBrains Mono, monospace' }}>
                            <span>{i.quantity} × {i.product_name ?? 'Item'}</span><span>{cedi(Number(i.unit_price) * i.quantity)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
