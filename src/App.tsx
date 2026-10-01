import { useState, useCallback, useEffect, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { supabase, checkout } from './lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

type Product = {
  id: number; name: string; sku: string; category: string
  barcode: string; price: number; cost: number
}
type InventoryRow = {
  id: number; product_id: number; stock: number; reorder_level: number
  expiry_date: string; supplier: string; updated_at: string
  ms_products: Product
}
type Customer = {
  id: number; name: string; customer_code: string; joined_date: string
  total_spent: number; visit_count: number; points: number; tier: string; last_visit: string
}
type Supplier = {
  id: number; name: string; contact_name: string; category: string
  rating: number; payable: number
}
type Transaction = {
  id: number; txn_code: string; total: number; subtotal: number
  discount_pct: number; tax: number; payment_method: string
  status: string; created_at: string
  ms_customers?: { name: string } | null
}
type Expense = {
  id: number; description: string; category: string; amount: number; date: string
}

// ── Icons ──────────────────────────────────────────────────────────────────

const Icon = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const ICONS: Record<string, string> = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  pos: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8 10h8M8 14h5',
  inventory: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
  accounting: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  reports: 'M18 20V10M12 20V4M6 20v-6',
  crm: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  suppliers: 'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5 21a2 2 0 100-4 2 2 0 000 4zM19 21a2 2 0 100-4 2 2 0 000 4z',
  alert: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0',
  trending: 'M23 6l-9.5 9.5-5-5L1 18',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  trash: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  chevronDown: 'M6 9l6 6 6-6',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
}

const CATEGORY_EMOJI: Record<string, string> = {
  Dairy: '🥛', Bakery: '🍞', Beverages: '🥤', Produce: '🥬',
  Grains: '🌾', Oils: '🍳', Meat: '🥩', Frozen: '🧊', Default: '📦'
}

const CATEGORY_COLORS: Record<string, string> = {
  Dairy: '#3b82f6', Bakery: '#f59e0b', Beverages: '#a855f7',
  Produce: '#00d46a', Grains: '#06b6d4', Oils: '#ef4444', Default: '#9ca3af'
}

const TS = {
  backgroundColor: '#0d1120',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#e8ecf4', fontSize: 12,
}

// ── Primitives ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, trend, color = '#00d46a', icon }: {
  label: string; value: string; sub?: string; trend?: string; color?: string; icon: string
}) {
  const up = trend?.startsWith('+')
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={ICONS[icon]} size={17} />
        </div>
        {trend && (
          <span style={{ fontSize: 11, fontWeight: 600, color: up ? '#00d46a' : '#ef4444', background: up ? 'rgba(0,212,106,0.1)' : 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: 4 }}>
            {trend}
          </span>
        )}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Roboto Slab, serif', color: '#e8ecf4', letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#6b7280', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 26, height: 26, border: '2.5px solid rgba(0,212,106,0.15)', borderTopColor: '#00d46a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function EmptyState({ icon, title, sub, action }: { icon: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 0', color: '#4b5563', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 36, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#9ca3af' }}>{title}</div>
      {sub && <div style={{ fontSize: 13 }}>{sub}</div>}
      {action}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 17, fontWeight: 700, margin: 0, color: '#e8ecf4' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}>
            <Icon d={ICONS.x} size={18} />
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  )
}

function Btn({ children, onClick, variant = 'primary', type = 'button', disabled }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'; disabled?: boolean
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: '#00d46a', color: '#03120a', border: 'none' },
    ghost: { background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' },
    danger: { background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...styles[variant], borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s' }}>
      {children}
    </button>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────

function Dashboard({ refresh }: { refresh: number }) {
  const [txns, setTxns] = useState<Transaction[]>([])
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [t, inv, exp] = await Promise.allSettled([
      supabase.from('ms_transactions').select('*, ms_customers(name)').order('created_at', { ascending: false }).limit(200),
      supabase.from('ms_inventory').select('*, ms_products(name)'),
      supabase.from('ms_expenses').select('*'),
    ])
    if (t.status === 'fulfilled' && t.value.data) setTxns(t.value.data)
    if (inv.status === 'fulfilled' && inv.value.data) setInventory(inv.value.data)
    if (exp.status === 'fulfilled' && exp.value.data) setExpenses(exp.value.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const today = new Date().toISOString().split('T')[0]
  const todayTxns = txns.filter(t => t.created_at.startsWith(today))
  const todayRevenue = todayTxns.reduce((s, t) => s + Number(t.total), 0)
  const totalRevenue = txns.reduce((s, t) => s + Number(t.total), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const netProfit = totalRevenue - totalExpenses
  const lowStock = inventory.filter(r => r.stock > 0 && r.stock <= r.reorder_level).length
  const outOfStock = inventory.filter(r => r.stock === 0).length

  const chartData = (() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const map: Record<string, number> = {}
    days.forEach(d => { map[d] = 0 })
    txns.forEach(t => { const d = days[new Date(t.created_at).getDay()]; map[d] += Number(t.total) })
    return days.map(d => ({ day: d, sales: map[d] }))
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 24, fontWeight: 700, color: '#e8ecf4', margin: 0 }}>Overview</h1>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 3 }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <button onClick={load} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#6b7280', padding: '7px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon d={ICONS.refresh} size={14} /> Refresh
        </button>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <StatCard label="Today's Revenue" value={`₵${todayRevenue.toFixed(2)}`} sub={`${todayTxns.length} sales today`} icon="pos" color="#00d46a" />
            <StatCard label="Net Profit (All Time)" value={`₵${netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`Revenue ₵${totalRevenue.toFixed(0)} · Exp ₵${totalExpenses.toFixed(0)}`} icon="accounting" color="#3b82f6" />
            <StatCard label="Low / Out of Stock" value={`${lowStock} / ${outOfStock}`} sub="Items needing attention" icon="alert" color={outOfStock > 0 ? '#ef4444' : '#f59e0b'} />
            <StatCard label="All Transactions" value={txns.length.toLocaleString()} sub="Recorded sales" icon="reports" color="#a855f7" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
            <div className="stat-card">
              <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: '0 0 18px' }}>Sales by Day of Week</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d46a" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#00d46a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₵${v}`} />
                  <Tooltip contentStyle={TS} formatter={(v: number) => [`₵${v.toFixed(2)}`, 'Sales']} />
                  <Area type="monotone" dataKey="sales" stroke="#00d46a" strokeWidth={2} fill="url(#sg)" dot={{ fill: '#00d46a', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="stat-card">
              <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>Stock Alerts</h3>
              {inventory.filter(r => r.stock <= r.reorder_level).length === 0 ? (
                <EmptyState icon="✅" title="All stock levels healthy" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {inventory.filter(r => r.stock <= r.reorder_level).slice(0, 6).map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 8, background: r.stock === 0 ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)', border: `1px solid ${r.stock === 0 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}` }}>
                      <span style={{ fontSize: 13, color: '#e8ecf4', fontWeight: 500 }}>{r.ms_products?.name}</span>
                      <span className={`badge ${r.stock === 0 ? 'badge-red' : 'badge-yellow'}`}>{r.stock === 0 ? 'OUT' : `${r.stock} left`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: 0 }}>Recent Sales</h3>
              <span style={{ fontSize: 12, color: '#4b5563' }}>Last {Math.min(txns.length, 10)} transactions</span>
            </div>
            {txns.length === 0 ? (
              <EmptyState icon="🧾" title="No sales yet" sub="Complete your first sale in Point of Sale" />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {['Transaction', 'Customer', 'Payment', 'Total', 'Tax', 'Date', 'Status'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txns.slice(0, 10).map(t => (
                    <tr key={t.id} className="table-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6b7280' }}>{t.txn_code}</td>
                      <td style={{ padding: '10px 10px', fontSize: 13, color: '#9ca3af' }}>{t.ms_customers?.name ?? 'Walk-in'}</td>
                      <td style={{ padding: '10px 10px', fontSize: 12, color: '#9ca3af' }}>{t.payment_method}</td>
                      <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: '#e8ecf4' }}>₵{Number(t.total).toFixed(2)}</td>
                      <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#6b7280' }}>₵{Number(t.tax).toFixed(2)}</td>
                      <td style={{ padding: '10px 10px', fontSize: 11, color: '#6b7280', fontFamily: 'JetBrains Mono, monospace' }}>{new Date(t.created_at).toLocaleString()}</td>
                      <td style={{ padding: '10px 10px' }}><span className={`badge ${t.status === 'Completed' ? 'badge-green' : t.status === 'Refunded' ? 'badge-red' : 'badge-yellow'}`}>{t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── POS ────────────────────────────────────────────────────────────────────

function POS({ onSaleComplete }: { onSaleComplete: () => void }) {
  const [products, setProducts] = useState<(Product & { ms_inventory: { stock: number; reorder_level: number }[] })[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([])
  const [search, setSearch] = useState('')
  const [discount, setDiscount] = useState(0)
  const [payMethod, setPayMethod] = useState('Cash')
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'processing' | 'done'>('idle')
  const [activeCategory, setActiveCategory] = useState('All')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    Promise.allSettled([
      supabase.from('ms_products').select('*, ms_inventory(stock, reorder_level)').order('name'),
      supabase.from('ms_customers').select('id, name, customer_code').order('name'),
    ]).then(([p, c]) => {
      if (p.status === 'fulfilled' && p.value.data) setProducts(p.value.data as typeof products)
      if (c.status === 'fulfilled' && c.value.data) setCustomers(c.value.data)
    }).finally(() => setLoading(false))
  }, [])

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category))).sort()]

  const filtered = products.filter(p => {
    const matchCat = activeCategory === 'All' || p.category === activeCategory
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search)
    return matchCat && matchSearch
  })

  const addToCart = (p: Product) => setCart(prev => {
    const ex = prev.find(i => i.product.id === p.id)
    return ex ? prev.map(i => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i)
      : [...prev, { product: p, qty: 1 }]
  })

  const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0)
  const discountAmt = subtotal * (discount / 100)
  const tax = (subtotal - discountAmt) * 0.125
  const total = subtotal - discountAmt + tax

  const handleCheckout = async () => {
    if (!cart.length || status !== 'idle') return
    setStatus('processing')
    setErrorMsg('')
    try {
      await checkout({
        txn: {
          txn_code: `TXN-${Date.now()}`,
          customer_id: customerId,
          subtotal: +subtotal.toFixed(2),
          discount_pct: discount,
          tax: +tax.toFixed(2),
          total: +total.toFixed(2),
          payment_method: payMethod,
          status: 'Completed',
        },
        items: cart.map(i => ({ product_id: i.product.id, quantity: i.qty, unit_price: i.product.price })),
        customer_id: customerId,
      })
      setStatus('done')
      setTimeout(() => {
        setCart([]); setDiscount(0); setCustomerId(null); setStatus('idle')
        onSaleComplete()
        // Refresh stock in products
        supabase.from('ms_products').select('*, ms_inventory(stock, reorder_level)').order('name')
          .then(({ data }) => { if (data) setProducts(data as typeof products) })
      }, 1800)
     } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkout failed')
      setStatus('idle')
   }
  }

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, height: 'calc(100vh - 116px)' }}>
      {/* Products */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}><Icon d={ICONS.search} size={15} /></div>
            <input className="input-field" style={{ paddingLeft: 34 }} placeholder="Search or scan barcode…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className="tab-btn"
              style={{ background: activeCategory === cat ? 'rgba(0,212,106,0.12)' : 'transparent', color: activeCategory === cat ? '#00d46a' : '#6b7280' }}>
              {cat}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="📦" title="No products found" sub="Add products in the Inventory section" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, overflowY: 'auto', paddingRight: 2 }}>
            {filtered.map(p => {
              const inv = p.ms_inventory?.[0]
              const out = inv?.stock === 0
              return (
                <div key={p.id} onClick={() => !out && addToCart(p)}
                  style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, cursor: out ? 'not-allowed' : 'pointer', opacity: out ? 0.45 : 1, transition: 'all 0.1s' }}
                  onMouseEnter={e => { if (!out) { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,212,106,0.35)'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,106,0.05)' } }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.background = '#0d1120' }}>
                  <div style={{ height: 38, background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    {CATEGORY_EMOJI[p.category] ?? CATEGORY_EMOJI.Default}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#e8ecf4', marginBottom: 3, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#00d46a', fontFamily: 'Roboto Slab, serif' }}>₵{Number(p.price).toFixed(2)}</div>
                    {inv && <span style={{ fontSize: 9, color: out ? '#ef4444' : inv.stock <= inv.reorder_level ? '#f59e0b' : '#4b5563', fontFamily: 'JetBrains Mono, monospace' }}>{out ? 'OUT' : inv.stock}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18 }}>
        <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 16, fontWeight: 700, margin: 0 }}>Order</h3>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#4b5563', fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🛒</div>Tap a product to add
            </div>
          ) : cart.map(item => (
            <div key={item.product.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e8ecf4', lineHeight: 1.3 }}>{item.product.name}</div>
                <div style={{ fontSize: 11, color: '#4b5563' }}>₵{Number(item.product.price).toFixed(2)} × {item.qty}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, qty: Math.max(1, i.qty - 1) } : i))} className="pos-key" style={{ width: 24, height: 24, fontSize: 14 }}>−</button>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                <button onClick={() => setCart(prev => prev.map(i => i.product.id === item.product.id ? { ...i, qty: i.qty + 1 } : i))} className="pos-key" style={{ width: 24, height: 24, fontSize: 14 }}>+</button>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, minWidth: 52, textAlign: 'right', color: '#e8ecf4' }}>₵{(item.product.price * item.qty).toFixed(2)}</div>
              <button onClick={() => setCart(prev => prev.filter(i => i.product.id !== item.product.id))} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 2 }}><Icon d={ICONS.x} size={13} /></button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="input-field" value={customerId ?? ''} onChange={e => setCustomerId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Walk-in customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="input-field" placeholder="Discount %" type="number" style={{ width: 90 }} value={discount || ''} onChange={e => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
              <span>Subtotal</span><span style={{ fontFamily: 'JetBrains Mono, monospace' }}>₵{subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#00d46a' }}>
                <span>Discount ({discount}%)</span><span style={{ fontFamily: 'JetBrains Mono, monospace' }}>−₵{discountAmt.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
              <span>VAT (12.5%)</span><span style={{ fontFamily: 'JetBrains Mono, monospace' }}>₵{tax.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e8ecf4', fontWeight: 700, fontSize: 17, fontFamily: 'Roboto Slab, serif', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <span>Total</span><span>₵{total.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {['Cash', 'Card', 'Mobile Money'].map(m => (
              <button key={m} onClick={() => setPayMethod(m)} className="pos-key" style={{ height: 34, fontSize: 11, background: payMethod === m ? 'rgba(0,212,106,0.1)' : undefined, borderColor: payMethod === m ? 'rgba(0,212,106,0.35)' : undefined, color: payMethod === m ? '#00d46a' : undefined }}>{m}</button>
            ))}
          </div>

          {errorMsg && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
              Checkout failed: {errorMsg}
            </div>
          )}
          <button onClick={handleCheckout} disabled={!cart.length || status !== 'idle'}
            style={{ background: status === 'done' ? 'rgba(0,212,106,0.2)' : !cart.length ? 'rgba(255,255,255,0.04)' : '#00d46a', color: status === 'done' ? '#00d46a' : !cart.length ? '#4b5563' : '#03120a', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: (!cart.length || status !== 'idle') ? 'default' : 'pointer', transition: 'all 0.18s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {status === 'done' ? <><Icon d={ICONS.check} size={15} /> Recorded!</>
              : status === 'processing' ? 'Processing…'
                : `Charge ₵${total.toFixed(2)} · ${payMethod}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inventory ──────────────────────────────────────────────────────────────

type ProductForm = {
  name: string; sku: string; barcode: string; category: string
  price: string; cost: string; stock: string; reorder_level: string
  expiry_date: string; supplier: string
}

const BLANK_FORM: ProductForm = {
  name: '', sku: '', barcode: '', category: 'Dairy',
  price: '', cost: '', stock: '0', reorder_level: '50',
  expiry_date: '', supplier: ''
}

const CATEGORIES = ['Dairy', 'Bakery', 'Beverages', 'Produce', 'Grains', 'Oils', 'Meat', 'Frozen', 'Household', 'Other']

function Inventory({ refresh }: { refresh: number }) {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<ProductForm>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [stockSaving, setStockSaving] = useState<number | null>(null)
  const stockEdits = useRef<Record<number, number>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('ms_inventory')
      .select('*, ms_products(id, name, sku, category, price, cost, barcode)')
      .order('ms_products(name)')
    setRows((data as InventoryRow[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const filtered = rows.filter(r =>
    r.ms_products?.name?.toLowerCase().includes(query.toLowerCase()) ||
    r.ms_products?.sku?.toLowerCase().includes(query.toLowerCase()) ||
    r.ms_products?.category?.toLowerCase().includes(query.toLowerCase())
  )

  const handleAdd = async () => {
    if (!form.name || !form.sku || !form.price) return
    setSaving(true)
    const { data: prod, error } = await supabase.from('ms_products').insert({
      name: form.name, sku: form.sku, barcode: form.barcode,
      category: form.category, price: Number(form.price), cost: Number(form.cost)
    }).select().single()
    if (!error && prod) {
      await supabase.from('ms_inventory').insert({
        product_id: prod.id,
        stock: Number(form.stock),
        reorder_level: Number(form.reorder_level),
        expiry_date: form.expiry_date || null,
        supplier: form.supplier,
      })
      setShowAdd(false)
      setForm(BLANK_FORM)
      load()
    }
    setSaving(false)
  }

  const handleStockBlur = async (row: InventoryRow) => {
    const newVal = stockEdits.current[row.product_id]
    if (newVal === undefined || newVal === row.stock) return
    setStockSaving(row.product_id)
    await supabase.from('ms_inventory').update({ stock: newVal, updated_at: new Date().toISOString() }).eq('product_id', row.product_id)
    setStockSaving(null)
    load()
  }

  const outCount = rows.filter(r => r.stock === 0).length
  const lowCount = rows.filter(r => r.stock > 0 && r.stock <= r.reorder_level).length
  const totalValue = rows.reduce((s, r) => s + r.stock * Number(r.ms_products?.cost ?? 0), 0)

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatCard label="Total Products" value={rows.length.toString()} sub="In inventory" icon="inventory" color="#3b82f6" />
        <StatCard label="Low Stock" value={lowCount.toString()} sub="Below reorder level" icon="alert" color="#f59e0b" />
        <StatCard label="Out of Stock" value={outCount.toString()} sub="Zero units" icon="x" color="#ef4444" />
        <StatCard label="Stock Value" value={`₵${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="At cost price" icon="accounting" color="#00d46a" />
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
            <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}><Icon d={ICONS.search} size={14} /></div>
            <input className="input-field" style={{ paddingLeft: 34 }} placeholder="Search products…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <button onClick={load} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#6b7280', padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon d={ICONS.refresh} size={13} /> Sync
          </button>
          <Btn onClick={() => setShowAdd(true)}><Icon d={ICONS.plus} size={14} /> Add Product</Btn>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="📦" title="No products yet" sub="Add your first product to get started"
            action={<Btn onClick={() => setShowAdd(true)}><Icon d={ICONS.plus} size={14} /> Add Product</Btn>} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {['Product', 'SKU', 'Category', 'Stock', 'Reorder At', 'Expiry', 'Supplier', 'Cost', 'Price', 'Margin', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: 10, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const p = row.ms_products
                  const status = row.stock === 0 ? 'out' : row.stock <= row.reorder_level ? 'low' : 'ok'
                  const margin = p?.price && p?.cost ? (((Number(p.price) - Number(p.cost)) / Number(p.price)) * 100).toFixed(0) : '—'
                  return (
                    <tr key={row.id} className="table-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '10px 10px', fontSize: 13, fontWeight: 600, color: '#e8ecf4', whiteSpace: 'nowrap' }}>{p?.name}</td>
                      <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5563' }}>{p?.sku}</td>
                      <td style={{ padding: '10px 10px', fontSize: 12, color: '#9ca3af' }}>{p?.category}</td>
                      <td style={{ padding: '10px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <input type="number" defaultValue={row.stock} key={`${row.product_id}-${row.stock}`}
                            onChange={e => { stockEdits.current[row.product_id] = Number(e.target.value) }}
                            onBlur={() => handleStockBlur(row)}
                            title="Click to edit"
                            style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 4, color: status === 'out' ? '#ef4444' : status === 'low' ? '#f59e0b' : '#e8ecf4', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, width: 60, padding: '2px 4px', outline: 'none', cursor: 'text' }}
                            onFocus={e => (e.target.style.borderColor = 'rgba(0,212,106,0.4)')} />
                          {stockSaving === row.product_id && <span style={{ fontSize: 9, color: '#00d46a' }}>saving…</span>}
                        </div>
                      </td>
                      <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5563' }}>{row.reorder_level}</td>
                      <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6b7280' }}>{row.expiry_date ?? '—'}</td>
                      <td style={{ padding: '10px 10px', fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>{row.supplier ?? '—'}</td>
                      <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6b7280' }}>₵{Number(p?.cost ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: '#e8ecf4' }}>₵{Number(p?.price ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 10px', fontSize: 12, color: '#00d46a', fontWeight: 600 }}>{margin}%</td>
                      <td style={{ padding: '10px 10px' }}>
                        <span className={`badge ${status === 'out' ? 'badge-red' : status === 'low' ? 'badge-yellow' : 'badge-green'}`}>
                          {status === 'out' ? 'Out' : status === 'low' ? 'Low' : 'OK'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Add New Product" onClose={() => { setShowAdd(false); setForm(BLANK_FORM) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Product Name *"><input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Whole Milk 1L" /></Field>
              <Field label="SKU *"><input className="input-field" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="e.g. DRY-001" /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Barcode"><input className="input-field" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} placeholder="Scan or type" /></Field>
              <Field label="Category">
                <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Selling Price (₵) *"><input className="input-field" type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" /></Field>
              <Field label="Cost Price (₵)"><input className="input-field" type="number" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="0.00" /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Opening Stock"><input className="input-field" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} /></Field>
              <Field label="Reorder Level"><input className="input-field" type="number" value={form.reorder_level} onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Supplier"><input className="input-field" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" /></Field>
              <Field label="Expiry Date"><input className="input-field" type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} /></Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <Btn variant="ghost" onClick={() => { setShowAdd(false); setForm(BLANK_FORM) }}>Cancel</Btn>
              <Btn onClick={handleAdd} disabled={saving || !form.name || !form.sku || !form.price}>{saving ? 'Saving…' : 'Add Product'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Accounting ─────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = ['Cost of Goods', 'Rent', 'Utilities', 'Wages', 'Transport', 'Marketing', 'Equipment', 'Maintenance', 'Other']

function Accounting({ refresh }: { refresh: number }) {
  const [txns, setTxns] = useState<Transaction[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ description: '', category: 'Cost of Goods', amount: '', date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [t, e] = await Promise.allSettled([
      supabase.from('ms_transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('ms_expenses').select('*').order('date', { ascending: false }),
    ])
    if (t.status === 'fulfilled' && t.value.data) setTxns(t.value.data)
    if (e.status === 'fulfilled' && e.value.data) setExpenses(e.value.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const handleAddExpense = async () => {
    if (!form.description || !form.amount) return
    setSaving(true)
    await supabase.from('ms_expenses').insert({ description: form.description, category: form.category, amount: Number(form.amount), date: form.date })
    setShowAdd(false)
    setForm({ description: '', category: 'Cost of Goods', amount: '', date: new Date().toISOString().split('T')[0] })
    load()
    setSaving(false)
  }

  const handleDeleteExpense = async (id: number) => {
    await supabase.from('ms_expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const totalRevenue = txns.reduce((s, t) => s + Number(t.total), 0)
  const totalTax = txns.reduce((s, t) => s + Number(t.tax), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const netProfit = totalRevenue - totalExpenses
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0'

  const expByCategory = EXPENSE_CATEGORIES.map(cat => ({
    name: cat,
    value: expenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0),
    color: ['#ef4444','#f59e0b','#00d46a','#3b82f6','#a855f7','#06b6d4','#ec4899','#84cc16','#9ca3af'][EXPENSE_CATEGORIES.indexOf(cat) % 9]
  })).filter(c => c.value > 0)

  const monthlyRevenue = (() => {
    const map: Record<string, number> = {}
    txns.forEach(t => {
      const m = t.created_at.slice(0, 7)
      map[m] = (map[m] || 0) + Number(t.total)
    })
    return Object.entries(map).sort().slice(-6).map(([m, v]) => ({ month: m.slice(5), revenue: v }))
  })()

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatCard label="Total Revenue" value={`₵${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${txns.length} transactions`} icon="pos" color="#00d46a" />
        <StatCard label="Total Expenses" value={`₵${totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${expenses.length} expense entries`} icon="trending" color="#ef4444" />
        <StatCard label="Net Profit" value={`₵${netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${margin}% margin`} icon="accounting" color={netProfit >= 0 ? '#3b82f6' : '#ef4444'} />
        <StatCard label="VAT Collected" value={`₵${totalTax.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="12.5% on all sales" icon="reports" color="#a855f7" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="stat-card">
          <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Monthly Revenue</h3>
          {monthlyRevenue.length === 0 ? (
            <EmptyState icon="📊" title="No sales data yet" sub="Revenue chart appears after first sales" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₵${v}`} />
                <Tooltip contentStyle={TS} formatter={(v: number) => [`₵${v.toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#00d46a" radius={[5, 5, 0, 0]} opacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="stat-card">
          <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Expenses by Category</h3>
          {expByCategory.length === 0 ? (
            <EmptyState icon="💸" title="No expenses logged" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={expByCategory} cx="50%" cy="50%" innerRadius={35} outerRadius={58} paddingAngle={3} dataKey="value">
                    {expByCategory.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TS} formatter={(v: number) => [`₵${v.toFixed(2)}`, '']} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                {expByCategory.map(c => (
                  <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{c.name}</span>
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#e8ecf4' }}>₵{c.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: 0 }}>Expense Ledger</h3>
          <Btn onClick={() => setShowAdd(true)}><Icon d={ICONS.plus} size={14} /> Log Expense</Btn>
        </div>
        {expenses.length === 0 ? (
          <EmptyState icon="📋" title="No expenses logged" sub="Record expenses to track profit accurately"
            action={<Btn onClick={() => setShowAdd(true)}><Icon d={ICONS.plus} size={14} /> Log Expense</Btn>} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Date', 'Description', 'Category', 'Amount', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id} className="table-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6b7280' }}>{e.date}</td>
                  <td style={{ padding: '10px 10px', fontSize: 13, color: '#e8ecf4' }}>{e.description}</td>
                  <td style={{ padding: '10px 10px' }}><span className="badge badge-gray">{e.category}</span></td>
                  <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: '#ef4444' }}>₵{Number(e.amount).toFixed(2)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                    <button onClick={() => handleDeleteExpense(e.id)} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4, borderRadius: 4 }} onMouseEnter={x => (x.currentTarget.style.color = '#ef4444')} onMouseLeave={x => (x.currentTarget.style.color = '#4b5563')}>
                      <Icon d={ICONS.trash} size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="Log Expense" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Description *"><input className="input-field" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Monthly rent payment" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Category">
                <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Amount (₵) *"><input className="input-field" type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" /></Field>
            </div>
            <Field label="Date"><input className="input-field" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn onClick={handleAddExpense} disabled={saving || !form.description || !form.amount}>{saving ? 'Saving…' : 'Log Expense'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Reports ────────────────────────────────────────────────────────────────

function Reports({ refresh }: { refresh: number }) {
  const [txns, setTxns] = useState<Transaction[]>([])
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'7D' | '30D' | 'ALL'>('30D')

  const load = useCallback(async () => {
    setLoading(true)
    const [t, inv] = await Promise.allSettled([
      supabase.from('ms_transactions').select('*, ms_transaction_items(quantity, unit_price, ms_products(name, category))').order('created_at', { ascending: false }),
      supabase.from('ms_inventory').select('stock, reorder_level, ms_products(name, category, price, cost)'),
    ])
    if (t.status === 'fulfilled' && t.value.data) setTxns(t.value.data)
    if (inv.status === 'fulfilled' && inv.value.data) setInventory(inv.value.data as InventoryRow[])
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

  type TxnWithItems = Transaction & { ms_transaction_items?: { quantity: number; unit_price: number; ms_products?: { name: string; category: string } }[] }
  const productMap: Record<string, { name: string; revenue: number; qty: number; category: string }> = {}
  ;(filtered as TxnWithItems[]).forEach(t => {
    t.ms_transaction_items?.forEach(item => {
      const name = item.ms_products?.name ?? 'Unknown'
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
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
              <Tooltip contentStyle={TS} formatter={(v: number) => [`₵${v.toFixed(2)}`, 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="#00d46a" strokeWidth={2} fill="url(#rg)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
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
                  <Tooltip contentStyle={TS} formatter={(v: number) => [`₵${v.toFixed(2)}`, '']} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {catData.sort((a, b) => b.value - a.value).map(c => (
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
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

// ── Customers ──────────────────────────────────────────────────────────────

function Customers({ refresh }: { refresh: number }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', customer_code: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('ms_customers').select('*').order('total_spent', { ascending: false })
    setCustomers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const handleAdd = async () => {
    if (!form.name || !form.customer_code) return
    setSaving(true)
    await supabase.from('ms_customers').insert({ name: form.name, customer_code: form.customer_code })
    setShowAdd(false); setForm({ name: '', customer_code: '' }); load()
    setSaving(false)
  }

  const tierColor = (t: string) => t === 'Platinum' ? '#a855f7' : t === 'Gold' ? '#f59e0b' : t === 'Silver' ? '#9ca3af' : '#b45309'

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatCard label="Total Customers" value={customers.length.toString()} icon="crm" color="#a855f7" />
        <StatCard label="Platinum / Gold" value={customers.filter(c => ['Platinum','Gold'].includes(c.tier)).length.toString()} sub="High-value" icon="trending" color="#f59e0b" />
        <StatCard label="Total Spend" value={`₵${customers.reduce((s,c) => s + Number(c.total_spent), 0).toLocaleString(undefined,{maximumFractionDigits:0})}`} sub="All customers" icon="accounting" color="#00d46a" />
        <StatCard label="Points Outstanding" value={customers.reduce((s,c) => s + c.points, 0).toLocaleString()} icon="reports" color="#3b82f6" />
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: 0 }}>Customer Profiles</h3>
          <Btn onClick={() => setShowAdd(true)}><Icon d={ICONS.plus} size={14} /> Add Customer</Btn>
        </div>
        {customers.length === 0 ? (
          <EmptyState icon="👤" title="No customers yet" sub="Add customers to track loyalty and purchase history"
            action={<Btn onClick={() => setShowAdd(true)}><Icon d={ICONS.plus} size={14} /> Add Customer</Btn>} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Customer', 'Code', 'Joined', 'Total Spent', 'Visits', 'Points', 'Tier', 'Last Visit'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id} className="table-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '11px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${tierColor(c.tier)}18`, border: `1.5px solid ${tierColor(c.tier)}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: tierColor(c.tier), flexShrink: 0 }}>
                        {c.name.split(' ').map(n => n[0]).join('').slice(0,2)}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#e8ecf4' }}>{c.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '11px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5563' }}>{c.customer_code}</td>
                  <td style={{ padding: '11px 10px', fontSize: 11, color: '#6b7280' }}>{c.joined_date}</td>
                  <td style={{ padding: '11px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: '#e8ecf4' }}>₵{Number(c.total_spent).toLocaleString()}</td>
                  <td style={{ padding: '11px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#9ca3af' }}>{c.visit_count}</td>
                  <td style={{ padding: '11px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#00d46a' }}>{c.points.toLocaleString()}</td>
                  <td style={{ padding: '11px 10px' }}><span className="badge" style={{ background: `${tierColor(c.tier)}18`, color: tierColor(c.tier) }}>{c.tier}</span></td>
                  <td style={{ padding: '11px 10px', fontSize: 11, color: '#6b7280' }}>{c.last_visit ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="Add Customer" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Full Name *"><input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Kwame Mensah" /></Field>
            <Field label="Customer Code *"><input className="input-field" value={form.customer_code} onChange={e => setForm(f => ({ ...f, customer_code: e.target.value }))} placeholder="e.g. CUS-0001" /></Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn onClick={handleAdd} disabled={saving || !form.name || !form.customer_code}>{saving ? 'Saving…' : 'Add Customer'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Suppliers ──────────────────────────────────────────────────────────────

function Suppliers({ refresh }: { refresh: number }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', contact_name: '', category: '', rating: '4.5', payable: '0' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('ms_suppliers').select('*').order('name')
    setSuppliers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const handleAdd = async () => {
    if (!form.name) return
    setSaving(true)
    await supabase.from('ms_suppliers').insert({ name: form.name, contact_name: form.contact_name, category: form.category, rating: Number(form.rating), payable: Number(form.payable) })
    setShowAdd(false); setForm({ name: '', contact_name: '', category: '', rating: '4.5', payable: '0' }); load()
    setSaving(false)
  }

  const totalPayable = suppliers.reduce((s, x) => s + Number(x.payable), 0)

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <StatCard label="Suppliers" value={suppliers.length.toString()} sub="In directory" icon="suppliers" color="#06b6d4" />
        <StatCard label="Total Payable" value={`₵${totalPayable.toLocaleString(undefined,{maximumFractionDigits:0})}`} sub="Outstanding balance" icon="accounting" color="#ef4444" />
        <StatCard label="Avg Rating" value={suppliers.length ? (suppliers.reduce((s,x) => s+x.rating,0)/suppliers.length).toFixed(1) : '—'} sub="Supplier quality" icon="check" color="#f59e0b" />
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: 0 }}>Supplier Directory</h3>
          <Btn onClick={() => setShowAdd(true)}><Icon d={ICONS.plus} size={14} /> Add Supplier</Btn>
        </div>
        {suppliers.length === 0 ? (
          <EmptyState icon="🚚" title="No suppliers yet" sub="Add your suppliers to track orders and payments"
            action={<Btn onClick={() => setShowAdd(true)}><Icon d={ICONS.plus} size={14} /> Add Supplier</Btn>} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Supplier', 'Contact', 'Category', 'Rating', 'Outstanding'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id} className="table-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '12px 10px', fontSize: 14, fontWeight: 600, color: '#e8ecf4' }}>{s.name}</td>
                  <td style={{ padding: '12px 10px', fontSize: 13, color: '#9ca3af' }}>{s.contact_name || '—'}</td>
                  <td style={{ padding: '12px 10px' }}>{s.category ? <span className="badge badge-blue">{s.category}</span> : <span style={{ color: '#4b5563', fontSize: 12 }}>—</span>}</td>
                  <td style={{ padding: '12px 10px', fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>{'★'.repeat(Math.round(s.rating))} {s.rating}</td>
                  <td style={{ padding: '12px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: Number(s.payable) > 0 ? '#ef4444' : '#00d46a' }}>
                    {Number(s.payable) > 0 ? `₵${Number(s.payable).toLocaleString()}` : 'Cleared'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="Add Supplier" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Supplier Name *"><input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. FreshDairy Co." /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Contact Person"><input className="input-field" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Full name" /></Field>
              <Field label="Category"><input className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Dairy, Beverages" /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Rating (1–5)"><input className="input-field" type="number" step="0.1" min="1" max="5" value={form.rating} onChange={e => setForm(f => ({ ...f, rating: e.target.value }))} /></Field>
              <Field label="Opening Balance (₵)"><input className="input-field" type="number" step="0.01" value={form.payable} onChange={e => setForm(f => ({ ...f, payable: e.target.value }))} /></Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn onClick={handleAdd} disabled={saving || !form.name}>{saving ? 'Saving…' : 'Add Supplier'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Nav & Shell ────────────────────────────────────────────────────────────

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'pos', label: 'Point of Sale', icon: 'pos' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory' },
  { id: 'accounting', label: 'Accounting', icon: 'accounting' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'customers', label: 'Customers', icon: 'crm' },
  { id: 'suppliers', label: 'Suppliers', icon: 'suppliers' },
]

export default function App() {
  const [active, setActive] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [refresh, setRefresh] = useState(0)

  const renderPage = () => {
    const r = { refresh }
    switch (active) {
      case 'dashboard': return <Dashboard {...r} />
      case 'pos': return <POS onSaleComplete={() => setRefresh(n => n + 1)} />
      case 'inventory': return <Inventory {...r} />
      case 'accounting': return <Accounting {...r} />
      case 'reports': return <Reports {...r} />
      case 'customers': return <Customers {...r} />
      case 'suppliers': return <Suppliers {...r} />
      default: return <Dashboard {...r} />
    }
  }

  const current = NAV.find(n => n.id === active)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#06080f' }}>
      {/* Sidebar */}
      <div style={{ width: sidebarOpen ? 224 : 56, flexShrink: 0, background: '#0d1120', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', transition: 'width 0.18s ease', overflow: 'hidden' }}>
        <div style={{ padding: '16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, background: 'linear-gradient(135deg, #00d46a, #009f50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#03120a', fontFamily: 'Roboto Slab, serif' }}>M</div>
          {sidebarOpen && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Roboto Slab, serif', color: '#e8ecf4', lineHeight: 1.2 }}>MySupermart</div>
              <div style={{ fontSize: 9, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>RETAIL OS</div>
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: '10px 6px', overflow: 'hidden' }}>
          {NAV.map(item => (
            <div key={item.id} className={`sidebar-link ${active === item.id ? 'active' : ''}`} onClick={() => setActive(item.id)} title={!sidebarOpen ? item.label : undefined}>
              <span style={{ flexShrink: 0 }}><Icon d={ICONS[item.icon]} size={16} /></span>
              {sidebarOpen && <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{item.label}</span>}
            </div>
          ))}
        </nav>

        <div style={{ padding: '10px 6px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div className="sidebar-link" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">
            <Icon d={sidebarOpen ? 'M11 17l-5-5 5-5M18 17l-5-5 5-5' : 'M13 17l5-5-5-5M6 17l5-5-5-5'} size={16} />
            {sidebarOpen && <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>Collapse</span>}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 52, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px', flexShrink: 0, background: '#0d1120' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#4b5563', fontSize: 12 }}>MySupermart</span>
            <span style={{ color: '#4b5563', fontSize: 12 }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e8ecf4' }}>{current?.label}</span>
          </div>
          <button onClick={() => setRefresh(n => n + 1)} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Icon d={ICONS.refresh} size={14} /> Sync
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 22 }}>
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
