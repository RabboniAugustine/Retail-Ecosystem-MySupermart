import { useCallback, useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { supabase, friendlyError } from '../lib/api'
import { isCompleted, localDate } from '../lib/format'
import type { Expense, Transaction } from '../lib/types'
import { Btn, EmptyState, ErrorBox, Field, Icon, ICONS, Modal, Spinner, StatCard, TS, cediTip } from '../components/ui'
import { grossProfit } from './Dashboard'

// ── Accounting ─────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = ['Cost of Goods', 'Rent', 'Utilities', 'Wages', 'Transport', 'Marketing', 'Equipment', 'Maintenance', 'Other']

export function Accounting({ refresh }: { refresh: number }) {
  const [txns, setTxns] = useState<Transaction[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ description: '', category: 'Cost of Goods', amount: '', date: localDate() })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [t, e] = await Promise.allSettled([
      supabase.from('ms_transactions').select('*, ms_transaction_items(quantity, unit_cost)').neq('status', 'Refunded').order('created_at', { ascending: false }),
      supabase.from('ms_expenses').select('*').order('date', { ascending: false }),
    ])
    if (t.status === 'fulfilled' && t.value.data) setTxns((t.value.data as Transaction[]).filter(isCompleted))
    if (e.status === 'fulfilled' && e.value.data) setExpenses(e.value.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const handleAddExpense = async () => {
    if (!form.description || !form.amount) return
    setSaving(true); setError('')
    const { error: insErr } = await supabase.from('ms_expenses').insert({ description: form.description, category: form.category, amount: Number(form.amount), date: form.date })
    if (insErr) { setError(friendlyError(insErr)); setSaving(false); return }
    setShowAdd(false)
    setForm({ description: '', category: 'Cost of Goods', amount: '', date: localDate() })
    load()
    setSaving(false)
  }

  const handleDeleteExpense = async (id: number) => {
    if (!window.confirm('Delete this expense?')) return
    await supabase.from('ms_expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const totalRevenue = txns.reduce((s, t) => s + Number(t.total), 0)
  const totalTax = txns.reduce((s, t) => s + Number(t.tax), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  // Profit = sales before VAT − cost of goods sold − expenses. Where an old sale has
  // no cost recorded, its full pre-VAT amount is counted (as before).
  const goodsProfit = txns.reduce((s, t) => s + (grossProfit(t) ?? (Number(t.total) - Number(t.tax))), 0)
  const netProfit = goodsProfit - totalExpenses
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
      <div className="g4">
        <StatCard label="Total Revenue" value={`₵${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${txns.length} transactions`} icon="pos" color="#00d46a" />
        <StatCard label="Total Expenses" value={`₵${totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${expenses.length} expense entries`} icon="trending" color="#ef4444" />
        <StatCard label="Net Profit" value={`₵${netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${margin}% · after cost of goods & expenses`} icon="accounting" color={netProfit >= 0 ? '#3b82f6' : '#ef4444'} />
        <StatCard label="VAT Collected" value={`₵${totalTax.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="12.5% on all sales" icon="reports" color="#a855f7" />
      </div>

      <div className="g-split-r">
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
                <Tooltip contentStyle={TS} formatter={cediTip('Revenue')} />
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
                  <Tooltip contentStyle={TS} formatter={cediTip('')} />
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
          <div className="table-wrap"><table>
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
          </table></div>
        )}
      </div>

      {showAdd && (
        <Modal title="Log Expense" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Description *"><input className="input-field" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Monthly rent payment" /></Field>
            <div className="g2">
              <Field label="Category">
                <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Amount (₵) *"><input className="input-field" type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" /></Field>
            </div>
            <Field label="Date"><input className="input-field" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></Field>
            <ErrorBox>{error}</ErrorBox>
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
