import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  supabase, friendlyError, fetchAll, createPurchase, payPurchase, voidPurchase, moneyEntry, accountBalances,
  ACCOUNTS, type Account,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { cedi, localDate } from '../lib/format'
import { presetRange, rangeLabel, type Preset, type Range } from '../lib/ranges'
import type { ExpenseRow, Product, Purchase, Supplier } from '../lib/types'
import { Btn, EmptyState, ErrorBox, Field, Icon, ICONS, Modal, Spinner, StatCard, Th, Td } from '../components/ui'
import { RangePicker } from '../components/RangePicker'

export const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Marketing', 'Maintenance', 'Supplies', 'Bank charges', 'Taxes & levies', 'Other']

const purchaseBadge = (s: string) =>
  s === 'Paid' ? 'badge badge-green' : s === 'Part paid' ? 'badge badge-yellow' : s === 'Void' ? 'badge' : 'badge badge-red'

export function Accounting({ refresh }: { refresh: number }) {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const [preset, setPreset] = useState<Preset>('month')
  const [range, setRange] = useState<Range>(presetRange('month'))
  const [tab, setTab] = useState<'purchases' | 'expenses'>('purchases')
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [balances, setBalances] = useState<Record<Account, number> | null>(null)
  const [owed, setOwed] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'purchase' | 'expense' | 'money' | null>(null)
  const [openPurchase, setOpenPurchase] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [p, e] = await Promise.all([
        fetchAll<Purchase>((a, b) => supabase.from('ms_purchases').select('*, ms_purchase_items(id)')
          .gte('purchase_date', range.from).lte('purchase_date', range.to).order('purchase_date', { ascending: false }).order('id', { ascending: false }).range(a, b)),
        fetchAll<ExpenseRow>((a, b) => supabase.from('ms_expenses').select('*')
          .gte('date', range.from).lte('date', range.to).order('date', { ascending: false }).order('id', { ascending: false }).range(a, b)),
      ])
      setPurchases(p); setExpenses(e)
      if (isOwner) {
        setBalances(await accountBalances())
        const { data } = await supabase.from('ms_suppliers').select('payable')
        setOwed(((data as { payable: number }[] | null) ?? []).reduce((s, x) => s + Number(x.payable), 0))
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load') }
    setLoading(false)
  }, [range, isOwner])

  useEffect(() => { load() }, [load, refresh])

  const live = purchases.filter(p => p.status !== 'Void')
  const purchTotal = live.reduce((s, p) => s + Number(p.total), 0)
  const purchDue = live.reduce((s, p) => s + Number(p.total) - Number(p.amount_paid), 0)
  const expTotal = expenses.reduce((s, e) => s + Number(e.amount), 0)

  const deleteExpense = async (e: ExpenseRow) => {
    if (!window.confirm(`Delete the expense "${e.description}" (${cedi(e.amount)})?`)) return
    const { error } = await supabase.from('ms_expenses').delete().eq('id', e.id)
    if (error) setError(friendlyError(error)); else load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Btn onClick={() => setModal('purchase')}><Icon d={ICONS.plus} size={14} /> Add purchase</Btn>
        <Btn onClick={() => setModal('expense')}><Icon d={ICONS.plus} size={14} /> Add expense</Btn>
        {isOwner && <Btn variant="ghost" onClick={() => setModal('money')}>Money in / out</Btn>}
        <div style={{ flex: 1 }} />
        <RangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r) }} />
      </div>

      {isOwner && balances && (
        <div className="g4">
          <StatCard label="Cash" value={cedi(balances.Cash)} sub="Cash drawer / safe" icon="accounting" color="var(--c-accent)" />
          <StatCard label="Bank" value={cedi(balances.Bank)} sub="Card sales and bank payments" icon="accounting" color="var(--c-info)" />
          <StatCard label="Mobile Money" value={cedi(balances['Mobile Money'])} sub="MoMo wallet" icon="accounting" color="var(--c-purple)" />
          <StatCard label="Owed to suppliers" value={cedi(owed)} sub="Unpaid purchases" icon="suppliers" color="var(--c-danger)" />
        </div>
      )}

      <div className="g3">
        <StatCard label="Purchases" value={cedi(purchTotal)} sub={`${live.length} in ${rangeLabel(range)}`} icon="inventory" color="var(--c-cyan)" />
        <StatCard label="Still to pay" value={cedi(purchDue)} sub="On these purchases" icon="alert" color="var(--c-warn)" />
        <StatCard label="Expenses" value={cedi(expTotal)} sub={`${expenses.length} in ${rangeLabel(range)}`} icon="receipt" color="var(--c-danger)" />
      </div>

      <ErrorBox>{error}</ErrorBox>

      <div className="stat-card">
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {([['purchases', `Purchases (${purchases.length})`], ['expenses', `Expenses (${expenses.length})`]] as const).map(([k, l]) => (
            <button key={k} className="tab-btn" onClick={() => setTab(k)}
              style={{ background: tab === k ? 'color-mix(in srgb, var(--c-accent) 12%, transparent)' : 'transparent', color: tab === k ? 'var(--c-accent)' : 'var(--c-text-3)' }}>{l}</button>
          ))}
        </div>
        {loading ? <Spinner /> : tab === 'purchases' ? (
          purchases.length === 0 ? <EmptyState title="No purchases in this period" sub="Record stock bought from suppliers with Add purchase" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><Th>Date</Th><Th>Purchase</Th><Th>Supplier</Th><Th>Invoice</Th><Th right>Items</Th><Th right>Total</Th><Th right>Paid</Th><Th>Status</Th><Th>By</Th></tr></thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id} className="table-row" onClick={() => setOpenPurchase(p.id)} style={{ cursor: 'pointer', opacity: p.status === 'Void' ? 0.5 : 1 }}>
                      <Td mono muted>{p.purchase_date}</Td>
                      <Td mono>{p.purchase_code}</Td>
                      <Td strong>{p.supplier_name ?? '—'}</Td>
                      <Td mono muted>{p.invoice_no ?? '—'}</Td>
                      <Td mono right>{p.ms_purchase_items?.length ?? 0}</Td>
                      <Td mono strong right>{cedi(p.total)}</Td>
                      <Td mono right>{cedi(p.amount_paid)}</Td>
                      <Td><span className={purchaseBadge(p.status)}>{p.status}</span></Td>
                      <Td>{p.created_by_name ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          expenses.length === 0 ? <EmptyState title="No expenses in this period" sub="Record rent, transport, utilities and other costs with Add expense" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><Th>Date</Th><Th>Description</Th><Th>Category</Th><Th>Paid from</Th><Th right>Amount</Th><Th>By</Th>{isOwner && <Th />}</tr></thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e.id} className="table-row">
                      <Td mono muted>{e.date}</Td>
                      <Td strong style={{ whiteSpace: 'normal' }}>{e.description}</Td>
                      <Td><span className="badge badge-blue">{e.category}</span></Td>
                      <Td>{e.paid_from}</Td>
                      <Td mono strong right style={{ color: 'var(--c-danger)' }}>{cedi(e.amount)}</Td>
                      <Td>{e.created_by_name ?? '—'}</Td>
                      {isOwner && <Td><button onClick={() => deleteExpense(e)} title="Delete" style={{ background: 'none', border: 'none', color: 'var(--c-text-4)', cursor: 'pointer', display: 'flex' }}><Icon d={ICONS.trash} size={14} /></button></Td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {modal === 'purchase' && <AddPurchase onClose={() => setModal(null)} onSaved={() => { setModal(null); setTab('purchases'); load() }} />}
      {modal === 'expense' && <AddExpense onClose={() => setModal(null)} onSaved={() => { setModal(null); setTab('expenses'); load() }} />}
      {modal === 'money' && <MoneyEntry onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {openPurchase != null && <PurchaseDetail id={openPurchase} onClose={() => setOpenPurchase(null)} onChanged={load} />}
    </div>
  )
}

// ── Add purchase ─────────────────────────────────────────────────────────────
type PLine = { product: Product & { stock: number }; qty: string; cost: string; newPrice: string }

function AddPurchase({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<(Product & { stock: number })[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [invoice, setInvoice] = useState('')
  const [date, setDate] = useState(localDate())
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<PLine[]>([])
  const [term, setTerm] = useState('')
  const [payMode, setPayMode] = useState<'full' | 'part' | 'credit'>('full')
  const [paid, setPaid] = useState('')
  const [account, setAccount] = useState<Account>('Cash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('ms_suppliers').select('*').order('name').then(({ data }) => setSuppliers((data as Supplier[] | null) ?? []))
    fetchAll<Product & { ms_inventory: { stock: number } | { stock: number }[] | null }>((a, b) =>
      supabase.from('ms_products').select('id, name, sku, barcode, category, price, cost, ms_inventory(stock)').eq('active', true).order('name').range(a, b))
      .then(rows => setProducts(rows.map(r => {
        const inv = Array.isArray(r.ms_inventory) ? r.ms_inventory[0] : r.ms_inventory
        return { ...r, stock: inv?.stock ?? 0 }
      })))
  }, [])

  const q = term.trim().toLowerCase()
  const matches = q ? products.filter(p => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode === term.trim()).slice(0, 8) : []

  const add = (p: Product & { stock: number }) => {
    setLines(prev => prev.some(l => l.product.id === p.id)
      ? prev.map(l => l.product.id === p.id ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l)
      : [...prev, { product: p, qty: '1', cost: String(Number(p.cost)), newPrice: '' }])
    setTerm(''); searchRef.current?.focus()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const exact = products.find(p => p.barcode === term.trim() || p.sku?.toLowerCase() === q)
    if (exact) add(exact); else if (matches.length === 1) add(matches[0])
  }

  const setLine = (id: number, patch: Partial<PLine>) => setLines(prev => prev.map(l => l.product.id === id ? { ...l, ...patch } : l))
  const total = lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.cost) || 0) * 100) / 100, 0)
  const paidNum = payMode === 'full' ? total : payMode === 'credit' ? 0 : Math.min(total, Number(paid) || 0)

  const save = async () => {
    setError('')
    if (!lines.length) { setError('Add at least one item.'); return }
    for (const l of lines) {
      if (!Number.isInteger(Number(l.qty)) || Number(l.qty) <= 0) { setError(`Enter a whole quantity for ${l.product.name}.`); return }
      if (l.cost === '' || Number(l.cost) < 0) { setError(`Enter the unit cost for ${l.product.name}.`); return }
    }
    if (paidNum < total && !supplierId) { setError('Choose the supplier when the purchase is not fully paid, so the amount owed is recorded.'); return }
    setBusy(true)
    try {
      await createPurchase({
        supplier_id: supplierId ? Number(supplierId) : null, invoice_no: invoice, purchase_date: date, note,
        amount_paid: paidNum, paid_from: account,
        items: lines.map(l => ({ product_id: l.product.id, quantity: Number(l.qty), unit_cost: Number(l.cost), new_price: l.newPrice === '' ? null : Number(l.newPrice) })),
      })
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the purchase') }
    setBusy(false)
  }

  const inputSm: React.CSSProperties = { padding: '6px 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }

  return (
    <Modal title="Add purchase" onClose={onClose} width={860}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="g3">
          <Field label="Supplier">
            <select className="input-field" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">No supplier (paid on the spot)</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Supplier invoice no."><input className="input-field" value={invoice} onChange={e => setInvoice(e.target.value)} placeholder="Optional" /></Field>
          <Field label="Date"><input className="input-field" type="date" value={date} max={localDate()} onChange={e => setDate(e.target.value)} /></Field>
        </div>

        <div style={{ position: 'relative' }}>
          <Field label="Add items (scan barcode or search)">
            <input ref={searchRef} className="input-field" value={term} onChange={e => setTerm(e.target.value)} onKeyDown={onKey} placeholder="Name, SKU or barcode" autoFocus />
          </Field>
          {matches.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--c-panel-2)', border: '1px solid color-mix(in srgb, var(--c-ink) 10%, transparent)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.5)' }}>
              {matches.map(p => (
                <button key={p.id} onClick={() => add(p)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid color-mix(in srgb, var(--c-ink) 5%, transparent)', color: 'var(--c-text)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
                  <span>{p.name} <span style={{ color: 'var(--c-text-3)', fontSize: 11 }}>{p.sku ?? ''}</span></span>
                  <span style={{ color: 'var(--c-text-3)', fontSize: 12 }}>stock {p.stock} · cost {cedi(p.cost)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', textAlign: 'center', padding: 16, border: '1px dashed color-mix(in srgb, var(--c-ink) 8%, transparent)', borderRadius: 8 }}>
            No items yet. New products must first be added in Inventory.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><Th>Item</Th><Th right>In stock</Th><Th>Qty</Th><Th>Unit cost (₵)</Th><Th>New selling price (₵)</Th><Th right>Line total</Th><Th /></tr></thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.product.id}>
                    <Td strong style={{ whiteSpace: 'normal' }}>{l.product.name}</Td>
                    <Td mono right muted>{l.product.stock}</Td>
                    <Td><input className="input-field" style={{ ...inputSm, width: 70 }} type="number" min={1} step={1} value={l.qty} onChange={e => setLine(l.product.id, { qty: e.target.value })} /></Td>
                    <Td><input className="input-field" style={{ ...inputSm, width: 90 }} type="number" min={0} step="0.01" value={l.cost} onChange={e => setLine(l.product.id, { cost: e.target.value })} /></Td>
                    <Td><input className="input-field" style={{ ...inputSm, width: 100 }} type="number" min={0} step="0.01" value={l.newPrice} placeholder={String(Number(l.product.price))} onChange={e => setLine(l.product.id, { newPrice: e.target.value })} /></Td>
                    <Td mono strong right>{cedi((Number(l.qty) || 0) * (Number(l.cost) || 0))}</Td>
                    <Td><button onClick={() => setLines(prev => prev.filter(x => x.product.id !== l.product.id))} style={{ background: 'none', border: 'none', color: 'var(--c-text-3)', cursor: 'pointer', display: 'flex' }} aria-label="Remove"><Icon d={ICONS.x} size={13} /></button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid color-mix(in srgb, var(--c-ink) 7%, transparent)', paddingTop: 12 }}>
          <span style={{ color: 'var(--c-text-2)', fontSize: 13 }}>{lines.length} items · {lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)} units</span>
          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Roboto Slab, serif', color: 'var(--c-text)' }}>Total {cedi(total)}</span>
        </div>

        <div className="g3">
          <Field label="Payment">
            <select className="input-field" value={payMode} onChange={e => setPayMode(e.target.value as typeof payMode)}>
              <option value="full">Paid in full</option>
              <option value="part">Part paid</option>
              <option value="credit">On credit (pay later)</option>
            </select>
          </Field>
          {payMode === 'part'
            ? <Field label="Amount paid now (₵)"><input className="input-field" type="number" min={0} step="0.01" value={paid} onChange={e => setPaid(e.target.value)} /></Field>
            : <Field label="Amount paid now"><div style={{ padding: '10px 0', fontSize: 14, color: 'var(--c-text)', fontFamily: 'JetBrains Mono, monospace' }}>{cedi(paidNum)}</div></Field>}
          {payMode !== 'credit' && (
            <Field label="Paid from">
              <select className="input-field" value={account} onChange={e => setAccount(e.target.value as Account)}>
                {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
          )}
        </div>
        {paidNum < total && total > 0 && <div style={{ fontSize: 12, color: 'var(--c-warn)' }}>{cedi(total - paidNum)} will be added to what you owe {suppliers.find(s => String(s.id) === supplierId)?.name ?? 'the supplier'}.</div>}
        <Field label="Note"><input className="input-field" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" /></Field>
        <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>Saving adds the quantities to stock and updates each item's cost price (and selling price, if you entered a new one).</div>
        <ErrorBox>{error}</ErrorBox>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={busy || !lines.length}>{busy ? 'Saving…' : `Save purchase · ${cedi(total)}`}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── Purchase detail: items, pay balance, void ─────────────────────────────────
function PurchaseDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { profile } = useAuth()
  const [p, setP] = useState<Purchase | null>(null)
  const [mode, setMode] = useState<'view' | 'pay' | 'void'>('view')
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState<Account>('Cash')
  const [date, setDate] = useState(localDate())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('ms_purchases').select('*, ms_purchase_items(*)').eq('id', id).single()
    setP(data as Purchase | null)
  }, [id])
  useEffect(() => { load() }, [load])

  const due = p ? Number(p.total) - Number(p.amount_paid) : 0
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await fn(); setMode('view'); await load(); onChanged() } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    setBusy(false)
  }

  return (
    <Modal title={p ? `Purchase ${p.purchase_code}` : 'Purchase'} onClose={onClose} width={640}>
      {!p ? <Spinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 13 }}>
            <span style={{ color: 'var(--c-text-3)' }}>Supplier</span><span style={{ color: 'var(--c-text)' }}>{p.supplier_name ?? '—'}</span>
            <span style={{ color: 'var(--c-text-3)' }}>Date</span><span>{p.purchase_date}{p.invoice_no ? ` · Invoice ${p.invoice_no}` : ''}</span>
            <span style={{ color: 'var(--c-text-3)' }}>Recorded by</span><span>{p.created_by_name ?? '—'}</span>
            {p.note && <><span style={{ color: 'var(--c-text-3)' }}>Note</span><span>{p.note}</span></>}
            <span style={{ color: 'var(--c-text-3)' }}>Status</span><span><span className={purchaseBadge(p.status)}>{p.status}</span></span>
          </div>
          {p.status === 'Void' && <ErrorBox>Voided by {p.voided_by_name} — {p.void_reason}</ErrorBox>}
          <div className="table-wrap">
            <table>
              <thead><tr><Th>Item</Th><Th right>Qty</Th><Th right>Unit cost</Th><Th right>Total</Th></tr></thead>
              <tbody>
                {(p.ms_purchase_items ?? []).map(i => (
                  <tr key={i.id}><Td strong style={{ whiteSpace: 'normal' }}>{i.product_name}</Td><Td mono right>{i.quantity}</Td><Td mono right>{cedi(i.unit_cost)}</Td><Td mono right strong>{cedi(i.line_total)}</Td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, fontSize: 13 }}>
            <span>Total <b style={{ color: 'var(--c-text)' }}>{cedi(p.total)}</b></span>
            <span>Paid <b style={{ color: 'var(--c-good)' }}>{cedi(p.amount_paid)}</b></span>
            {p.status !== 'Void' && <span>Owed <b style={{ color: due > 0 ? 'var(--c-danger)' : 'var(--c-text-2)' }}>{cedi(due)}</b></span>}
          </div>

          {mode === 'pay' && (
            <div className="g3" style={{ alignItems: 'end' }}>
              <Field label={`Amount (max ${cedi(due)})`}><input autoFocus className="input-field" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
              <Field label="Paid from"><select className="input-field" value={account} onChange={e => setAccount(e.target.value as Account)}>{ACCOUNTS.map(a => <option key={a}>{a}</option>)}</select></Field>
              <Field label="Date"><input className="input-field" type="date" value={date} max={localDate()} onChange={e => setDate(e.target.value)} /></Field>
            </div>
          )}
          {mode === 'void' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--c-text-2)' }}>Voiding takes these items back out of stock, cancels what is owed and removes its payments from the accounts. Use it only for a purchase entered by mistake.</div>
              <Field label="Reason *"><input autoFocus className="input-field" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. entered twice" /></Field>
            </div>
          )}
          <ErrorBox>{error}</ErrorBox>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            {mode === 'view' ? (
              <>
                {profile?.role === 'owner' && p.status !== 'Void' && <Btn variant="danger" onClick={() => setMode('void')}>Void</Btn>}
                {p.status !== 'Void' && due > 0 && <Btn variant="ghost" onClick={() => { setAmount(due.toFixed(2)); setMode('pay') }}>Record payment</Btn>}
                <Btn onClick={onClose}>Close</Btn>
              </>
            ) : (
              <>
                <Btn variant="ghost" onClick={() => setMode('view')}>Back</Btn>
                {mode === 'pay'
                  ? <Btn disabled={busy} onClick={() => run(() => payPurchase(p.id, Number(amount), account, date))}>{busy ? 'Saving…' : 'Save payment'}</Btn>
                  : <Btn variant="danger" disabled={busy || !reason.trim()} onClick={() => run(() => voidPurchase(p.id, reason))}>{busy ? 'Voiding…' : 'Void purchase'}</Btn>}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Add expense ──────────────────────────────────────────────────────────────
function AddExpense({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ description: '', category: 'Transport', amount: '', date: localDate(), paid_from: 'Cash' as Account })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    if (!form.description.trim()) { setError('Describe the expense.'); return }
    if (!(Number(form.amount) > 0)) { setError('Enter an amount above zero.'); return }
    setBusy(true); setError('')
    const { error } = await supabase.from('ms_expenses').insert({
      description: form.description.trim(), category: form.category, amount: Number(form.amount), date: form.date, paid_from: form.paid_from,
    })
    setBusy(false)
    if (error) setError(friendlyError(error)); else onSaved()
  }
  return (
    <Modal title="Add expense" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Description *"><input autoFocus className="input-field" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. ECG prepaid, transport for delivery" /></Field>
        <div className="g2">
          <Field label="Category">
            <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Amount (₵) *"><input className="input-field" type="number" min={0} step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></Field>
        </div>
        <div className="g2">
          <Field label="Date"><input className="input-field" type="date" value={form.date} max={localDate()} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></Field>
          <Field label="Paid from">
            <select className="input-field" value={form.paid_from} onChange={e => setForm(f => ({ ...f, paid_from: e.target.value as Account }))}>
              {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
            </select>
          </Field>
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ── Owner: transfers between accounts, money in, money out ────────────────────
function MoneyEntry({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'transfer' | 'money_in' | 'money_out'>('transfer')
  const [from, setFrom] = useState<Account>('Cash')
  const [to, setTo] = useState<Account>('Bank')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(localDate())
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const hint = useMemo(() => ({
    transfer: 'e.g. depositing cash from the drawer into the bank, or moving MoMo to the bank.',
    money_in: 'e.g. an opening balance, or money the owner puts into the business.',
    money_out: 'e.g. money the owner takes out of the business.',
  })[kind], [kind])
  const save = async () => {
    setBusy(true); setError('')
    try { await moneyEntry(kind, Number(amount), kind === 'money_in' ? null : from, kind === 'money_out' ? null : to, desc, date); onSaved() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save') }
    setBusy(false)
  }
  return (
    <Modal title="Money in / out" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--c-bg)', padding: 4, borderRadius: 8 }}>
          {([['transfer', 'Transfer'], ['money_in', 'Money in'], ['money_out', 'Money out']] as const).map(([k, l]) => (
            <button key={k} className="tab-btn" onClick={() => setKind(k)} style={{ flex: 1, background: kind === k ? 'color-mix(in srgb, var(--c-accent) 12%, transparent)' : 'transparent', color: kind === k ? 'var(--c-accent)' : 'var(--c-text-3)' }}>{l}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{hint}</div>
        <div className="g2">
          {kind !== 'money_in' && <Field label="From"><select className="input-field" value={from} onChange={e => setFrom(e.target.value as Account)}>{ACCOUNTS.map(a => <option key={a}>{a}</option>)}</select></Field>}
          {kind !== 'money_out' && <Field label="To"><select className="input-field" value={to} onChange={e => setTo(e.target.value as Account)}>{ACCOUNTS.map(a => <option key={a}>{a}</option>)}</select></Field>}
        </div>
        <div className="g2">
          <Field label="Amount (₵)"><input autoFocus className="input-field" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
          <Field label="Date"><input className="input-field" type="date" value={date} max={localDate()} onChange={e => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Description"><input className="input-field" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Cash deposit at GCB" /></Field>
        <ErrorBox>{error}</ErrorBox>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

