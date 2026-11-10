import { useCallback, useEffect, useState } from 'react'
import { supabase, friendlyError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { cedi } from '../lib/format'
import type { Customer } from '../lib/types'
import { Btn, EmptyState, ErrorBox, Field, Icon, ICONS, Modal, Spinner, StatCard, Th, Td } from '../components/ui'

const tierColor = (t: string) => t === 'Platinum' ? 'var(--c-purple)' : t === 'Gold' ? 'var(--c-warn)' : t === 'Silver' ? 'var(--c-text-2)' : 'var(--c-warn)'
const BLANK = { name: '', phone: '', email: '', customer_code: '' }

export function Customers({ refresh }: { refresh: number }) {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Customer | 'new' | null>(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('ms_customers').select('*').order('total_spent', { ascending: false })
    setCustomers((data as Customer[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const openNew = () => { setForm({ ...BLANK, customer_code: `CUS-${Date.now().toString(36).toUpperCase().slice(-6)}` }); setError(''); setEditing('new') }
  const openEdit = (c: Customer) => { setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', customer_code: c.customer_code ?? '' }); setError(''); setEditing(c) }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')
    const payload = { name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, customer_code: form.customer_code.trim() || null }
    const { error } = editing === 'new'
      ? await supabase.from('ms_customers').insert(payload)
      : await supabase.from('ms_customers').update(payload).eq('id', (editing as Customer).id)
    setSaving(false)
    if (error) { setError(friendlyError(error)); return }
    setEditing(null); load()
  }

  const remove = async (c: Customer) => {
    if (!window.confirm(`Delete ${c.name}? Their past sales are kept but will show as walk-in.`)) return
    const { error } = await supabase.from('ms_customers').delete().eq('id', c.id)
    if (error) { setError(friendlyError(error)); return }
    setEditing(null); load()
  }

  const q = query.toLowerCase()
  const shown = customers.filter(c => !q || c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.customer_code?.toLowerCase().includes(q))

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="g4">
        <StatCard label="Customers" value={customers.length.toString()} icon="crm" color="var(--c-purple)" />
        <StatCard label="Platinum / Gold" value={customers.filter(c => ['Platinum', 'Gold'].includes(c.tier)).length.toString()} sub="High-value" icon="trending" color="var(--c-warn)" />
        <StatCard label="Total spend" value={cedi(customers.reduce((s, c) => s + Number(c.total_spent), 0), 0)} sub="All loyalty customers" icon="accounting" color="var(--c-accent)" />
        <StatCard label="Points outstanding" value={customers.reduce((s, c) => s + c.points, 0).toLocaleString()} icon="reports" color="var(--c-info)" />
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
            <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-3)' }}><Icon d={ICONS.search} size={14} /></div>
            <input className="input-field" style={{ paddingLeft: 34 }} placeholder="Search name, phone, code…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div style={{ flex: 1 }} />
          <Btn onClick={openNew}><Icon d={ICONS.plus} size={14} /> Add customer</Btn>
        </div>
        {customers.length === 0 ? (
          <EmptyState title="No customers yet" sub="Add customers here or from the till to track loyalty points" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><Th>Customer</Th><Th>Phone</Th><Th>Code</Th><Th right>Total spent</Th><Th right>Visits</Th><Th right>Points</Th><Th>Tier</Th><Th>Last visit</Th><Th /></tr></thead>
              <tbody>
                {shown.map(c => (
                  <tr key={c.id} className="table-row">
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: `color-mix(in srgb, ${tierColor(c.tier)} 10%, transparent)`, border: `1.5px solid ${tierColor(c.tier)}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: tierColor(c.tier), flexShrink: 0 }}>
                          {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>{c.name}</span>
                      </div>
                    </Td>
                    <Td mono>{c.phone ?? '—'}</Td>
                    <Td mono muted>{c.customer_code ?? '—'}</Td>
                    <Td mono strong right>{cedi(c.total_spent)}</Td>
                    <Td mono right>{c.visit_count}</Td>
                    <Td mono right style={{ color: 'var(--c-good)', fontWeight: 600 }}>{c.points.toLocaleString()}</Td>
                    <Td><span className="badge" style={{ background: `color-mix(in srgb, ${tierColor(c.tier)} 10%, transparent)`, color: tierColor(c.tier) }}>{c.tier}</span></Td>
                    <Td mono muted>{c.last_visit ?? '—'}</Td>
                    <Td><button onClick={() => openEdit(c)} title="Edit" style={{ background: 'color-mix(in srgb, var(--c-ink) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--c-ink) 8%, transparent)', color: 'var(--c-text-2)', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Icon d={ICONS.edit} size={14} /></button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add customer' : 'Edit customer'} onClose={() => setEditing(null)} width={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Full name *"><input autoFocus className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Kwame Mensah" /></Field>
            <div className="g2">
              <Field label="Phone"><input className="input-field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="024 123 4567" inputMode="tel" /></Field>
              <Field label="Customer code"><input className="input-field" value={form.customer_code} onChange={e => setForm(f => ({ ...f, customer_code: e.target.value }))} /></Field>
            </div>
            <Field label="Email"><input className="input-field" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
            <ErrorBox>{error}</ErrorBox>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              {isOwner && editing !== 'new' ? <Btn variant="danger" onClick={() => remove(editing as Customer)}>Delete</Btn> : <span />}
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
                <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
