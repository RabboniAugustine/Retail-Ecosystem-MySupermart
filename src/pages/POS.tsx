import { useEffect, useRef, useState } from 'react'
import { supabase, checkout, friendlyError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { cedi } from '../lib/format'
import { createDisplaySender, openCustomerDisplay, type DisplayState } from '../lib/display'
import type { Customer, Product } from '../lib/types'
import { Btn, CATEGORY_COLORS, EmptyState, ErrorBox, Field, Icon, ICONS, Modal, Spinner } from '../components/ui'
import { Receipt, type ReceiptData } from '../components/Receipt'

type PosProduct = Product & { ms_inventory: { stock: number; reorder_level: number }[] | { stock: number; reorder_level: number } | null }
type CartLine = { product: Product; qty: number; stock: number }

const stockOf = (p: PosProduct) => {
  const inv = Array.isArray(p.ms_inventory) ? p.ms_inventory[0] : p.ms_inventory
  return inv ? { stock: inv.stock, reorder: inv.reorder_level } : { stock: 0, reorder: 0 }
}

const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Card']

export function POS({ onSaleComplete }: { onSaleComplete: () => void }) {
  const { profile, settings } = useAuth()
  const isOwner = profile?.role === 'owner'
  const maxDiscount = isOwner ? 100 : Number(settings.max_discount_pct)

  const [products, setProducts] = useState<PosProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<CartLine[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [discount, setDiscount] = useState(0)
  const [payMethod, setPayMethod] = useState('Cash')
  const [tendered, setTendered] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [showCustomer, setShowCustomer] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const loadProducts = async () => {
    const { data, error } = await supabase.from('ms_products')
      .select('id, name, sku, category, barcode, price, cost, ms_inventory(stock, reorder_level)')
      .eq('active', true).order('name')
    if (error) setError(friendlyError(error))
    setProducts((data as PosProduct[] | null) ?? [])
  }

  useEffect(() => { loadProducts().finally(() => setLoading(false)) }, [])

  // ── Totals (shown here; the database recalculates them on checkout) ──────
  const subtotal = cart.reduce((s, l) => s + Number(l.product.price) * l.qty, 0)
  const discountAmt = Math.round(subtotal * discount) / 100
  const vatRate = Number(settings.vat_rate)
  const tax = Math.round((subtotal - discountAmt) * vatRate) / 100
  const total = Math.round((subtotal - discountAmt + tax) * 100) / 100
  const tenderedNum = tendered === '' ? null : Number(tendered)
  const change = payMethod === 'Cash' && tenderedNum != null ? tenderedNum - total : null

  // ── Customer display ─────────────────────────────────────────────────────
  const displayState = useRef<DisplayState>({ mode: 'idle', shopName: settings.shop_name, message: settings.display_message })
  const senderRef = useRef<ReturnType<typeof createDisplaySender> | null>(null)
  useEffect(() => {
    const s = createDisplaySender(() => displayState.current)
    senderRef.current = s
    s.send(displayState.current)
    return () => { s.close(); if (senderRef.current === s) senderRef.current = null }
  }, [])
  const sender = { send: (st: DisplayState) => senderRef.current?.send(st) }

  useEffect(() => {
    if (receipt && cart.length === 0) return // keep the "thank you" screen until the next item
    const state: DisplayState = cart.length === 0
      ? { mode: 'idle', shopName: settings.shop_name, message: settings.display_message }
      : {
          mode: 'cart', shopName: settings.shop_name,
          lines: cart.map(l => ({ id: l.product.id, name: l.product.name, sku: l.product.sku, category: l.product.category, qty: l.qty, price: Number(l.product.price) })),
          subtotal, discountPct: discount, discount: discountAmt, vatRate, tax, total,
          customerName: customer?.name ?? null, customerPoints: customer?.points ?? null,
          paymentMethod: payMethod, tendered: payMethod === 'Cash' ? tenderedNum : null,
        }
    displayState.current = state
    sender.send(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, discount, customer, payMethod, tendered, settings.shop_name, settings.display_message])

  // ── Cart actions ─────────────────────────────────────────────────────────
  const limitFor = (stock: number) => (settings.block_oversell ? stock : Infinity)

  const addToCart = (p: PosProduct) => {
    const { stock } = stockOf(p)
    setError('')
    if (receipt) setReceipt(null)
    setCart(prev => {
      const ex = prev.find(l => l.product.id === p.id)
      const inCart = ex?.qty ?? 0
      if (inCart + 1 > limitFor(stock)) { setError(`Only ${stock} of "${p.name}" in stock.`); return prev }
      return ex ? prev.map(l => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l) : [...prev, { product: p, qty: 1, stock }]
    })
  }

  const setQty = (id: number, qty: number) => setCart(prev => prev.map(l => {
    if (l.product.id !== id) return l
    const q = Math.max(1, Math.floor(qty) || 1)
    if (q > limitFor(l.stock)) { setError(`Only ${l.stock} of "${l.product.name}" in stock.`); return { ...l, qty: l.stock } }
    return { ...l, qty: q }
  }))

  const clearSale = () => {
    setCart([]); setDiscount(0); setCustomer(null); setTendered(''); setPayMethod('Cash'); setError('')
  }

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category || 'Other'))).sort()]
  const q = search.trim().toLowerCase()
  const filtered = products.filter(p =>
    (category === 'All' || p.category === category) &&
    (!q || p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase() === q || p.sku?.toLowerCase().includes(q)))

  // Barcode scanners type the code and press Enter.
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !q) return
    const exact = products.find(p => p.barcode?.toLowerCase() === q || p.sku?.toLowerCase() === q)
    const only = filtered.length === 1 ? filtered[0] : null
    const hit = exact ?? only
    if (hit) { addToCart(hit); setSearch('') }
    else setError(`No product with barcode or SKU "${search.trim()}".`)
  }

  const handleCheckout = async () => {
    if (!cart.length || processing) return
    if (payMethod === 'Cash' && tenderedNum != null && tenderedNum < total) { setError('Cash received is less than the total.'); return }
    if (discount > maxDiscount) { setError(`Your discount limit is ${maxDiscount}%.`); return }
    setProcessing(true); setError('')
    try {
      const r = await checkout({
        items: cart.map(l => ({ product_id: l.product.id, quantity: l.qty })),
        customerId: customer?.id ?? null,
        discountPct: discount,
        paymentMethod: payMethod,
        amountTendered: payMethod === 'Cash' ? tenderedNum : null,
      })
      const data: ReceiptData = {
        txnCode: r.txn_code, createdAt: r.created_at, cashier: r.cashier_name, customer: customer?.name ?? null,
        lines: cart.map(l => ({ name: l.product.name, qty: l.qty, price: Number(l.product.price) })),
        subtotal: Number(r.subtotal), discountPct: Number(r.discount_pct), discount: Number(r.discount_amount),
        vatRate: Number(r.vat_rate), tax: Number(r.tax), total: Number(r.total), paymentMethod: r.payment_method,
        tendered: r.amount_tendered != null ? Number(r.amount_tendered) : null,
        change: r.change_due != null ? Number(r.change_due) : null,
        pointsEarned: r.points_earned, customerPoints: r.customer_points,
      }
      const paid: DisplayState = {
        mode: 'paid', shopName: settings.shop_name, message: settings.receipt_footer,
        total: data.total, paymentMethod: data.paymentMethod, tendered: data.tendered, change: data.change,
        customerName: data.customer, pointsEarned: data.pointsEarned, customerPoints: data.customerPoints, txnCode: data.txnCode,
      }
      displayState.current = paid
      sender.send(paid)
      setReceipt(data)
      clearSale()
      onSaleComplete()
      loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
    }
    setProcessing(false)
  }

  const closeReceipt = () => {
    setReceipt(null)
    const idle: DisplayState = { mode: 'idle', shopName: settings.shop_name, message: settings.display_message }
    displayState.current = idle
    sender.send(idle)
    searchRef.current?.focus()
  }

  if (loading) return <Spinner />

  const quickCash = (() => {
    if (total <= 0) return []
    const opts = new Set<number>([Math.ceil(total)])
    for (const step of [10, 20, 50, 100, 200]) opts.add(Math.ceil(total / step) * step)
    return Array.from(opts).sort((a, b) => a - b).slice(0, 4)
  })()

  return (
    <div className="pos-grid">
      {/* ── Products ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}><Icon d={ICONS.search} size={15} /></div>
            <input ref={searchRef} autoFocus className="input-field" style={{ paddingLeft: 34 }} placeholder="Scan barcode or search, then Enter…"
              value={search} onChange={e => setSearch(e.target.value)} onKeyDown={onSearchKey} />
          </div>
          <Btn variant="ghost" onClick={() => openCustomerDisplay()}><Icon d={ICONS.monitor} size={14} /> Customer screen</Btn>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)} className="tab-btn"
              style={{ background: category === cat ? 'rgba(0,212,106,0.12)' : 'transparent', color: category === cat ? '#00d46a' : '#6b7280' }}>
              {cat}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="No products found" sub={products.length ? 'Try another search' : 'Add products in Stock / Inventory'} />
        ) : (
          <div className="pos-products">
            {filtered.map(p => {
              const { stock, reorder } = stockOf(p)
              const out = stock <= 0 && settings.block_oversell
              return (
                <button key={p.id} onClick={() => !out && addToCart(p)} disabled={out}
                  style={{ textAlign: 'left', background: '#0d1120', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, cursor: out ? 'not-allowed' : 'pointer', opacity: out ? 0.45 : 1, color: 'inherit', font: 'inherit' }}
                  onMouseEnter={e => { if (!out) e.currentTarget.style.borderColor = 'rgba(0,212,106,0.35)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 1, background: CATEGORY_COLORS[p.category] ?? CATEGORY_COLORS.Default }} />
                    {p.category}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#e8ecf4', marginBottom: 3, lineHeight: 1.3, minHeight: 31 }}>{p.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#00d46a', fontFamily: 'Roboto Slab, serif' }}>{cedi(p.price)}</div>
                    <span style={{ fontSize: 10, color: stock <= 0 ? '#ef4444' : stock <= reorder ? '#f59e0b' : '#4b5563', fontFamily: 'JetBrains Mono, monospace' }}>{stock <= 0 ? 'OUT' : stock}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Order ── */}
      <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 16, fontWeight: 700, margin: 0 }}>Order</h3>
          {cart.length > 0 && <button onClick={clearSale} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>Clear</button>}
        </div>

        <button onClick={() => setShowCustomer(true)} className="pos-key" style={{ justifyContent: 'space-between', padding: '8px 12px', color: customer ? '#e8ecf4' : '#6b7280' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon d={ICONS.crm} size={14} />{customer ? customer.name : 'Walk-in customer'}</span>
          <span style={{ fontSize: 11, color: '#00d46a' }}>{customer ? `${customer.points} pts · change` : 'Add loyalty'}</span>
        </button>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 80 }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#4b5563', fontSize: 13 }}>
              Scan or tap a product to add
            </div>
          ) : cart.map(l => (
            <div key={l.product.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e8ecf4', lineHeight: 1.3 }}>{l.product.name}</div>
                <div style={{ fontSize: 11, color: '#4b5563' }}>{cedi(l.product.price)} each</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setQty(l.product.id, l.qty - 1)} className="pos-key" style={{ width: 26, height: 26, fontSize: 14 }} aria-label="Less">−</button>
                <input value={l.qty} onChange={e => setQty(l.product.id, Number(e.target.value))} inputMode="numeric"
                  style={{ width: 34, textAlign: 'center', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#e8ecf4', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, padding: '3px 0' }} />
                <button onClick={() => setQty(l.product.id, l.qty + 1)} className="pos-key" style={{ width: 26, height: 26, fontSize: 14 }} aria-label="More">+</button>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, minWidth: 64, textAlign: 'right', color: '#e8ecf4' }}>{cedi(Number(l.product.price) * l.qty)}</div>
              <button onClick={() => setCart(prev => prev.filter(x => x.product.id !== l.product.id))} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 2 }} aria-label="Remove"><Icon d={ICONS.x} size={13} /></button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280', flex: 1 }}>Discount % {isOwner ? '' : <span style={{ color: '#4b5563' }}>(max {maxDiscount}%)</span>}</span>
            <input className="input-field" type="number" min={0} max={maxDiscount} style={{ width: 80, padding: '6px 10px' }} value={discount || ''}
              onChange={e => setDiscount(Math.min(maxDiscount, Math.max(0, Number(e.target.value))))} placeholder="0" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}><span>Subtotal</span><span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{cedi(subtotal)}</span></div>
            {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#00d46a' }}><span>Discount ({discount}%)</span><span style={{ fontFamily: 'JetBrains Mono, monospace' }}>−{cedi(discountAmt)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}><span>VAT ({vatRate}%)</span><span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{cedi(tax)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e8ecf4', fontWeight: 700, fontSize: 18, fontFamily: 'Roboto Slab, serif', paddingTop: 5, borderTop: '1px solid rgba(255,255,255,0.07)' }}><span>Total</span><span>{cedi(total)}</span></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {PAYMENT_METHODS.map(m => (
              <button key={m} onClick={() => setPayMethod(m)} className="pos-key" style={{ height: 34, fontSize: 11, background: payMethod === m ? 'rgba(0,212,106,0.1)' : undefined, borderColor: payMethod === m ? 'rgba(0,212,106,0.35)' : undefined, color: payMethod === m ? '#00d46a' : undefined }}>{m}</button>
            ))}
          </div>

          {payMethod === 'Cash' && cart.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="input-field" type="number" min={0} step="0.01" placeholder="Cash received (optional)" value={tendered} onChange={e => setTendered(e.target.value)} style={{ padding: '7px 10px' }} />
                {change != null && (
                  <div style={{ minWidth: 110, textAlign: 'right', fontSize: 12, color: change < 0 ? '#ef4444' : '#00d46a', fontWeight: 700 }}>
                    {change < 0 ? `Short ${cedi(-change)}` : `Change ${cedi(change)}`}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {quickCash.map(v => <button key={v} className="pos-key" style={{ flex: 1, height: 28, fontSize: 11 }} onClick={() => setTendered(String(v))}>₵{v}</button>)}
              </div>
            </div>
          )}

          <ErrorBox>{error}</ErrorBox>
          <button onClick={handleCheckout} disabled={!cart.length || processing}
            style={{ background: !cart.length ? 'rgba(255,255,255,0.04)' : '#00d46a', color: !cart.length ? '#4b5563' : '#03120a', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: (!cart.length || processing) ? 'default' : 'pointer', opacity: processing ? 0.7 : 1 }}>
            {processing ? 'Processing…' : `Charge ${cedi(total)} · ${payMethod}`}
          </button>
        </div>
      </div>

      {showCustomer && (
        <CustomerPicker
          onClose={() => setShowCustomer(false)}
          onPick={c => { setCustomer(c); setShowCustomer(false) }}
          onClear={customer ? () => { setCustomer(null); setShowCustomer(false) } : undefined}
        />
      )}

      {receipt && (
        <Modal title="Sale complete" onClose={closeReceipt} width={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {receipt.change != null && (
              <div style={{ textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(0,212,106,0.08)', border: '1px solid rgba(0,212,106,0.25)' }}>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>Give change</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#00d46a', fontFamily: 'Roboto Slab, serif' }}>{cedi(receipt.change)}</div>
              </div>
            )}
            <Receipt data={receipt} settings={settings} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => window.print()}><Icon d={ICONS.printer} size={14} /> Print receipt</Btn>
              <Btn onClick={closeReceipt}>New sale</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Search customers by name, phone or code, or add a new one on the spot. */
function CustomerPicker({ onClose, onPick, onClear }: { onClose: () => void; onPick: (c: Customer) => void; onClear?: () => void }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      const s = term.trim().replace(/[%,()]/g, '')
      let query = supabase.from('ms_customers').select('*').order('last_visit', { ascending: false, nullsFirst: false }).limit(8)
      if (s) query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,customer_code.ilike.%${s}%`)
      const { data } = await query
      setResults((data as Customer[] | null) ?? [])
    }, 200)
    return () => clearTimeout(t)
  }, [term])

  const add = async () => {
    if (!name.trim()) { setError('Name is required.'); return }
    setBusy(true); setError('')
    const code = `CUS-${Date.now().toString(36).toUpperCase().slice(-6)}`
    const { data, error } = await supabase.from('ms_customers')
      .insert({ name: name.trim(), phone: phone.trim() || null, customer_code: code }).select().single()
    setBusy(false)
    if (error) { setError(friendlyError(error)); return }
    onPick(data as Customer)
  }

  return (
    <Modal title="Loyalty customer" onClose={onClose} width={460}>
      {!adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input autoFocus className="input-field" placeholder="Search name, phone or code…" value={term} onChange={e => setTerm(e.target.value)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
            {results.length === 0 && <div style={{ fontSize: 13, color: '#6b7280', padding: 10, textAlign: 'center' }}>No customers found.</div>}
            {results.map(c => (
              <button key={c.id} onClick={() => onPick(c)} className="pos-key" style={{ justifyContent: 'space-between', padding: '9px 12px', color: '#e8ecf4' }}>
                <span style={{ textAlign: 'left' }}>{c.name}<span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>{c.phone ?? c.customer_code}</span></span>
                <span style={{ fontSize: 11, color: '#00d46a' }}>{c.points} pts · {c.tier}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {onClear ? <Btn variant="danger" onClick={onClear}>Remove customer</Btn> : <span />}
            <Btn variant="ghost" onClick={() => { setAdding(true); setName(/^\d+$/.test(term.trim()) ? '' : term.trim()); setPhone(/^\+?\d[\d\s]+$/.test(term.trim()) ? term.trim() : '') }}>
              <Icon d={ICONS.plus} size={14} /> New customer
            </Btn>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Full name *"><input autoFocus className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kwame Mensah" /></Field>
          <Field label="Phone"><input className="input-field" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 024 123 4567" inputMode="tel" /></Field>
          <ErrorBox>{error}</ErrorBox>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setAdding(false)}>Back</Btn>
            <Btn onClick={add} disabled={busy}>{busy ? 'Saving…' : 'Add & attach'}</Btn>
          </div>
        </div>
      )}
    </Modal>
  )
}
