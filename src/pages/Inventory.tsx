import { useCallback, useEffect, useState } from 'react'
import { supabase, friendlyError, adjustStock, createProduct, removeProduct } from '../lib/api'
import { useAuth } from '../lib/auth'
import { cedi, dateTime } from '../lib/format'
import type { InventoryRow, RemovalRow, StockMovement } from '../lib/types'
import { Btn, EmptyState, ErrorBox, Field, Icon, ICONS, Modal, Spinner, StatCard, Th, Td } from '../components/ui'

type ProductForm = {
  name: string; sku: string; barcode: string; category: string
  price: string; cost: string; stock: string; reorder_level: string
  expiry_date: string; supplier: string
}

const BLANK_FORM: ProductForm = {
  name: '', sku: '', barcode: '', category: 'Dairy',
  price: '', cost: '', stock: '0', reorder_level: '10', expiry_date: '', supplier: '',
}

export const CATEGORIES = ['Dairy', 'Bakery', 'Beverages', 'Produce', 'Grains', 'Oils', 'Meat', 'Frozen', 'Household', 'Toiletries', 'Snacks', 'Other']
const REMOVAL_REASONS = ['Returned to supplier', 'Expired', 'Damaged', 'Lost / stolen', 'Discontinued', 'Entered by mistake', 'Other']
const ADJUST_REASONS = ['Delivery received', 'Stock count correction', 'Damaged / expired', 'Returned by customer', 'Other']

const daysUntil = (d: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null)

function ProductFields({ form, setForm, isNew, suppliers }: {
  form: ProductForm; setForm: React.Dispatch<React.SetStateAction<ProductForm>>; isNew: boolean; suppliers: string[]
}) {
  const set = (k: keyof ProductForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  return (
    <>
      <div className="g2">
        <Field label="Product name *"><input className="input-field" value={form.name} onChange={set('name')} placeholder="e.g. Whole Milk 1L" /></Field>
        <Field label="SKU"><input className="input-field" value={form.sku} onChange={set('sku')} placeholder="e.g. DRY-001" /></Field>
      </div>
      <div className="g2">
        <Field label="Barcode"><input className="input-field" value={form.barcode} onChange={set('barcode')} placeholder="Scan or type" /></Field>
        <Field label="Category">
          <select className="input-field" value={form.category} onChange={set('category')}>
            {Array.from(new Set([...CATEGORIES, form.category])).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="g2">
        <Field label="Selling price (₵) *"><input className="input-field" type="number" step="0.01" min="0" value={form.price} onChange={set('price')} placeholder="0.00" /></Field>
        <Field label="Cost price (₵)"><input className="input-field" type="number" step="0.01" min="0" value={form.cost} onChange={set('cost')} placeholder="0.00" /></Field>
      </div>
      <div className="g2">
        {isNew
          ? <Field label="Opening stock"><input className="input-field" type="number" min="0" value={form.stock} onChange={set('stock')} /></Field>
          : <Field label="Stock"><div style={{ fontSize: 12, color: '#6b7280', padding: '10px 0' }}>Use “Stock in / adjust” to change stock.</div></Field>}
        <Field label="Reorder level"><input className="input-field" type="number" min="0" value={form.reorder_level} onChange={set('reorder_level')} /></Field>
      </div>
      <div className="g2">
        <Field label="Supplier">
          <input className="input-field" list="supplier-list" value={form.supplier} onChange={set('supplier')} placeholder="Supplier name" />
          <datalist id="supplier-list">{suppliers.map(s => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Expiry date"><input className="input-field" type="date" value={form.expiry_date} onChange={set('expiry_date')} /></Field>
      </div>
    </>
  )
}

export function Inventory({ refresh }: { refresh: number }) {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const [rows, setRows] = useState<InventoryRow[]>([])
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'expiring'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<ProductForm>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [editRow, setEditRow] = useState<InventoryRow | null>(null)
  const [adjRow, setAdjRow] = useState<InventoryRow | null>(null)
  const [adj, setAdj] = useState({ mode: 'add' as 'add' | 'set', qty: '', reason: 'Delivery received', note: '' })
  const [delRow, setDelRow] = useState<InventoryRow | null>(null)
  const [delReason, setDelReason] = useState('')
  const [delNote, setDelNote] = useState('')
  const [log, setLog] = useState<'removals' | 'movements' | null>(null)
  const [removals, setRemovals] = useState<RemovalRow[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [inv, sup] = await Promise.all([
      supabase.from('ms_inventory')
        .select('*, ms_products!inner(id, name, sku, category, price, cost, barcode, active)')
        .eq('ms_products.active', true),
      supabase.from('ms_suppliers').select('name').order('name'),
    ])
    const list = ((inv.data as InventoryRow[] | null) ?? []).sort((a, b) => a.ms_products.name.localeCompare(b.ms_products.name))
    setRows(list)
    setSuppliers(((sup.data as { name: string }[] | null) ?? []).map(s => s.name))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const q = query.toLowerCase()
  const filtered = rows.filter(r => {
    const p = r.ms_products
    const match = !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.barcode?.includes(q)
    const d = daysUntil(r.expiry_date)
    return match && (filter === 'all' || (filter === 'low' && r.stock <= r.reorder_level) || (filter === 'expiring' && d != null && d <= 30))
  })

  const handleAdd = async () => {
    if (!form.name.trim() || !form.price) { setFormError('Name and selling price are required.'); return }
    setSaving(true); setFormError('')
    try {
      await createProduct({ ...form })
      setShowAdd(false); setForm(BLANK_FORM); load()
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not save') }
    setSaving(false)
  }

  const openEdit = (row: InventoryRow) => {
    const p = row.ms_products
    setFormError('')
    setForm({
      name: p.name ?? '', sku: p.sku ?? '', barcode: p.barcode ?? '', category: p.category ?? 'Other',
      price: String(p.price ?? ''), cost: String(p.cost ?? ''), stock: String(row.stock),
      reorder_level: String(row.reorder_level), expiry_date: row.expiry_date ?? '', supplier: row.supplier ?? '',
    })
    setEditRow(row)
  }

  const handleEditSave = async () => {
    if (!editRow) return
    if (!form.name.trim() || !form.price) { setFormError('Name and selling price are required.'); return }
    setSaving(true); setFormError('')
    const { error: pErr } = await supabase.from('ms_products').update({
      name: form.name.trim(), sku: form.sku.trim() || null, barcode: form.barcode.trim() || null,
      category: form.category, price: Number(form.price), cost: Number(form.cost || 0),
    }).eq('id', editRow.product_id)
    if (pErr) { setFormError(friendlyError(pErr)); setSaving(false); return }
    const { error: iErr } = await supabase.from('ms_inventory').update({
      reorder_level: Number(form.reorder_level || 0), expiry_date: form.expiry_date || null,
      supplier: form.supplier.trim() || null, updated_at: new Date().toISOString(),
    }).eq('product_id', editRow.product_id)
    if (iErr) { setFormError(friendlyError(iErr)); setSaving(false); return }
    setEditRow(null); setForm(BLANK_FORM); load()
    setSaving(false)
  }

  const handleAdjust = async () => {
    if (!adjRow) return
    const n = Number(adj.qty)
    if (adj.qty === '' || !Number.isInteger(n) || (adj.mode === 'set' && n < 0)) { setFormError('Enter a whole number.'); return }
    const reason = adj.reason === 'Other' ? adj.note.trim() : adj.note.trim() ? `${adj.reason} — ${adj.note.trim()}` : adj.reason
    if (!reason) { setFormError('Please describe the reason.'); return }
    setSaving(true); setFormError('')
    try {
      await adjustStock(adjRow.product_id, n, adj.mode, reason)
      setAdjRow(null); load()
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not update stock') }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!delRow) return
    if (!delReason) { setFormError('Please choose a reason.'); return }
    if (delReason === 'Other' && !delNote.trim()) { setFormError('Please describe the reason.'); return }
    setSaving(true); setFormError('')
    try {
      await removeProduct(delRow.product_id, delReason, delNote.trim() || null)
      setDelRow(null); load()
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not remove') }
    setSaving(false)
  }

  const openLog = async (kind: 'removals' | 'movements') => {
    setLog(kind)
    if (kind === 'removals') {
      const { data } = await supabase.from('ms_product_removals').select('*').order('removed_at', { ascending: false }).limit(200)
      setRemovals((data as RemovalRow[] | null) ?? [])
    } else {
      const { data } = await supabase.from('ms_stock_movements').select('*').order('created_at', { ascending: false }).limit(300)
      setMovements((data as StockMovement[] | null) ?? [])
    }
  }

  const outCount = rows.filter(r => r.stock <= 0).length
  const lowCount = rows.filter(r => r.stock > 0 && r.stock <= r.reorder_level).length
  const expiringCount = rows.filter(r => { const d = daysUntil(r.expiry_date); return d != null && d <= 30 }).length
  const totalValue = rows.reduce((s, r) => s + r.stock * Number(r.ms_products?.cost ?? 0), 0)

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="g4">
        <StatCard label="Products" value={rows.length.toString()} sub="Active in the shop" icon="inventory" color="#3b82f6" />
        <StatCard label="Low / out of stock" value={`${lowCount} / ${outCount}`} sub="At or below reorder level" icon="alert" color={outCount ? '#ef4444' : '#f59e0b'} />
        <StatCard label="Expiring ≤ 30 days" value={expiringCount.toString()} sub="Check the shelves" icon="history" color="#f59e0b" />
        {isOwner
          ? <StatCard label="Stock value" value={cedi(totalValue, 0)} sub="At cost price" icon="accounting" color="#00d46a" />
          : <StatCard label="Units in stock" value={rows.reduce((s, r) => s + r.stock, 0).toLocaleString()} sub="All products" icon="inventory" color="#00d46a" />}
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
            <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}><Icon d={ICONS.search} size={14} /></div>
            <input className="input-field" style={{ paddingLeft: 34 }} placeholder="Search name, SKU, barcode…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {([['all', 'All'], ['low', 'Low stock'], ['expiring', 'Expiring']] as const).map(([k, l]) => (
              <button key={k} className="tab-btn" onClick={() => setFilter(k)} style={{ background: filter === k ? 'rgba(0,212,106,0.12)' : 'transparent', color: filter === k ? '#00d46a' : '#6b7280' }}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {isOwner && <Btn variant="ghost" onClick={() => openLog('movements')}>Stock log</Btn>}
          {isOwner && <Btn variant="ghost" onClick={() => openLog('removals')}>Removal log</Btn>}
          <Btn onClick={() => { setFormError(''); setForm(BLANK_FORM); setShowAdd(true) }}><Icon d={ICONS.plus} size={14} /> Add product</Btn>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="📦" title="No products yet" sub="Add your first product to get started" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {['Product', 'SKU', 'Category', 'Stock', 'Reorder', 'Expiry', 'Supplier', 'Cost', 'Price'].map(h => <Th key={h}>{h}</Th>)}
                  {isOwner && <Th>Margin</Th>}
                  <Th>Status</Th><Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const p = row.ms_products
                  const status = row.stock <= 0 ? 'out' : row.stock <= row.reorder_level ? 'low' : 'ok'
                  const margin = Number(p.price) > 0 && p.cost != null ? (((Number(p.price) - Number(p.cost)) / Number(p.price)) * 100).toFixed(0) + '%' : '—'
                  const d = daysUntil(row.expiry_date)
                  return (
                    <tr key={row.id} className="table-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <Td strong>{p.name}</Td>
                      <Td mono muted>{p.sku ?? '—'}</Td>
                      <Td>{p.category}</Td>
                      <Td mono strong style={{ color: status === 'out' ? '#ef4444' : status === 'low' ? '#f59e0b' : '#e8ecf4' }}>{row.stock}</Td>
                      <Td mono muted>{row.reorder_level}</Td>
                      <Td mono style={{ color: d == null ? '#6b7280' : d < 0 ? '#ef4444' : d <= 30 ? '#f59e0b' : '#6b7280' }}>
                        {row.expiry_date ?? '—'}{d != null && d < 0 ? ' (expired)' : ''}
                      </Td>
                      <Td>{row.supplier ?? '—'}</Td>
                      <Td mono muted>{cedi(p.cost)}</Td>
                      <Td mono strong>{cedi(p.price)}</Td>
                      {isOwner && <Td style={{ color: '#00d46a', fontWeight: 600 }}>{margin}</Td>}
                      <Td><span className={`badge ${status === 'out' ? 'badge-red' : status === 'low' ? 'badge-yellow' : 'badge-green'}`}>{status === 'out' ? 'Out' : status === 'low' ? 'Low' : 'OK'}</span></Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { setFormError(''); setAdj({ mode: 'add', qty: '', reason: 'Delivery received', note: '' }); setAdjRow(row) }} title="Stock in / adjust"
                            style={{ background: 'rgba(0,212,106,0.1)', border: '1px solid rgba(0,212,106,0.25)', color: '#00d46a', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>± Stock</button>
                          <button onClick={() => openEdit(row)} title="Edit product" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Icon d={ICONS.edit} size={14} /></button>
                          {isOwner && <button onClick={() => { setDelRow(row); setDelReason(''); setDelNote(''); setFormError('') }} title="Remove product" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Icon d={ICONS.trash} size={14} /></button>}
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState icon="🔎" title="Nothing matches" />}
          </div>
        )}
      </div>

      {(showAdd || editRow) && (
        <Modal title={editRow ? 'Edit product' : 'Add new product'} onClose={() => { setShowAdd(false); setEditRow(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProductFields form={form} setForm={setForm} isNew={!editRow} suppliers={suppliers} />
            <ErrorBox>{formError}</ErrorBox>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowAdd(false); setEditRow(null) }}>Cancel</Btn>
              <Btn onClick={editRow ? handleEditSave : handleAdd} disabled={saving}>{saving ? 'Saving…' : editRow ? 'Save changes' : 'Add product'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {adjRow && (
        <Modal title={`Stock: ${adjRow.ms_products.name}`} onClose={() => setAdjRow(null)} width={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Currently <b style={{ color: '#e8ecf4' }}>{adjRow.stock}</b> in stock.</div>
            <div style={{ display: 'flex', gap: 4, background: '#06080f', padding: 4, borderRadius: 8 }}>
              {([['add', 'Add / remove units'], ['set', 'Set counted amount']] as const).map(([k, l]) => (
                <button key={k} className="tab-btn" style={{ flex: 1, background: adj.mode === k ? 'rgba(0,212,106,0.12)' : 'transparent', color: adj.mode === k ? '#00d46a' : '#6b7280' }}
                  onClick={() => setAdj(a => ({ ...a, mode: k, reason: k === 'set' ? 'Stock count correction' : 'Delivery received' }))}>{l}</button>
              ))}
            </div>
            <Field label={adj.mode === 'add' ? 'Units to add (use minus to remove, e.g. -3)' : 'Units counted on the shelf'}>
              <input autoFocus className="input-field" type="number" step="1" value={adj.qty} onChange={e => setAdj(a => ({ ...a, qty: e.target.value }))} />
            </Field>
            {adj.qty !== '' && Number.isInteger(Number(adj.qty)) && (
              <div style={{ fontSize: 12, color: '#6b7280' }}>New stock will be <b style={{ color: '#e8ecf4' }}>{adj.mode === 'add' ? adjRow.stock + Number(adj.qty) : Number(adj.qty)}</b></div>
            )}
            <div className="g2">
              <Field label="Reason">
                <select className="input-field" value={adj.reason} onChange={e => setAdj(a => ({ ...a, reason: e.target.value }))}>
                  {ADJUST_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label={adj.reason === 'Other' ? 'Describe *' : 'Note'}><input className="input-field" value={adj.note} onChange={e => setAdj(a => ({ ...a, note: e.target.value }))} placeholder="e.g. invoice #123" /></Field>
            </div>
            <ErrorBox>{formError}</ErrorBox>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setAdjRow(null)}>Cancel</Btn>
              <Btn onClick={handleAdjust} disabled={saving}>{saving ? 'Saving…' : 'Save stock'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {delRow && (
        <Modal title="Remove product" onClose={() => setDelRow(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5 }}>
              You are removing <b style={{ color: '#e8ecf4' }}>{delRow.ms_products.name}</b> ({delRow.stock} units, {cedi(delRow.stock * Number(delRow.ms_products.cost ?? 0))} at cost).
              It will disappear from the till and stock list. Past sales and reports are kept.
            </div>
            <Field label="Reason *">
              <select className="input-field" value={delReason} onChange={e => setDelReason(e.target.value)}>
                <option value="">Select a reason…</option>
                {REMOVAL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label={delReason === 'Other' ? 'Describe the reason *' : 'Note (optional)'}>
              <input className="input-field" value={delNote} onChange={e => setDelNote(e.target.value)} placeholder="e.g. supplier credit note #123" />
            </Field>
            <ErrorBox>{formError}</ErrorBox>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setDelRow(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={handleDelete} disabled={saving || !delReason}>{saving ? 'Removing…' : 'Remove product'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {log === 'removals' && (
        <Modal title="Removal log" onClose={() => setLog(null)} width={620}>
          {removals.length === 0 ? <div style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', padding: 20 }}>No products removed yet.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Total value removed (at cost): <b style={{ color: '#e8ecf4' }}>{cedi(removals.reduce((a, r) => a + Number(r.loss_value), 0))}</b></div>
              {removals.map(r => (
                <div key={r.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: '#e8ecf4', fontWeight: 600 }}>
                    <span>{r.product_name}</span><span>{r.quantity} units · {cedi(r.loss_value)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                    {r.reason}{r.note ? ` — ${r.note}` : ''} · {dateTime(r.removed_at)}{r.removed_by_name ? ` · ${r.removed_by_name}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {log === 'movements' && (
        <Modal title="Stock log" onClose={() => setLog(null)} width={760}>
          {movements.length === 0 ? <div style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', padding: 20 }}>No stock changes recorded yet. Sales are not listed here; see Sales history.</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><Th>When</Th><Th>Product</Th><Th right>Change</Th><Th right>Before → after</Th><Th>Reason</Th><Th>By</Th></tr></thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id} className="table-row">
                      <Td mono muted>{dateTime(m.created_at)}</Td>
                      <Td strong>{m.product_name}</Td>
                      <Td mono right style={{ color: m.change >= 0 ? '#00d46a' : '#ef4444', fontWeight: 700 }}>{m.change > 0 ? '+' : ''}{m.change}</Td>
                      <Td mono right muted>{m.old_stock} → {m.new_stock}</Td>
                      <Td style={{ whiteSpace: 'normal' }}>{m.reason}</Td>
                      <Td>{m.created_by_name ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
