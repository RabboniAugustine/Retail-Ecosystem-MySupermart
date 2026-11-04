import { useCallback, useEffect, useState } from 'react'
import { supabase, friendlyError } from '../lib/api'
import { cedi } from '../lib/format'
import type { Supplier } from '../lib/types'
import { Btn, EmptyState, ErrorBox, Field, Icon, ICONS, Modal, Spinner, StatCard, Th, Td } from '../components/ui'

const BLANK = { name: '', contact_name: '', phone: '', category: '', rating: '4.5', payable: '0' }

export function Suppliers({ refresh }: { refresh: number }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('ms_suppliers').select('*').order('name')
    setSuppliers((data as Supplier[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const openEdit = (s: Supplier) => {
    setForm({ name: s.name, contact_name: s.contact_name ?? '', phone: s.phone ?? '', category: s.category ?? '', rating: String(s.rating), payable: String(s.payable) })
    setError(''); setEditing(s)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Supplier name is required.'); return }
    setSaving(true); setError('')
    const payload = {
      name: form.name.trim(), contact_name: form.contact_name.trim() || null, phone: form.phone.trim() || null,
      category: form.category.trim() || null, rating: Math.min(5, Math.max(1, Number(form.rating) || 1)), payable: Number(form.payable) || 0,
    }
    const { error } = editing === 'new'
      ? await supabase.from('ms_suppliers').insert(payload)
      : await supabase.from('ms_suppliers').update(payload).eq('id', (editing as Supplier).id)
    setSaving(false)
    if (error) { setError(friendlyError(error)); return }
    setEditing(null); load()
  }

  const remove = async (s: Supplier) => {
    if (!window.confirm(`Delete supplier ${s.name}?`)) return
    const { error } = await supabase.from('ms_suppliers').delete().eq('id', s.id)
    if (error) { setError(friendlyError(error)); return }
    setEditing(null); load()
  }

  const totalPayable = suppliers.reduce((s, x) => s + Number(x.payable), 0)
  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="g3">
        <StatCard label="Suppliers" value={suppliers.length.toString()} sub="In directory" icon="suppliers" color="#06b6d4" />
        <StatCard label="Total payable" value={cedi(totalPayable, 0)} sub="Outstanding balance" icon="accounting" color="#ef4444" />
        <StatCard label="Average rating" value={suppliers.length ? (suppliers.reduce((s, x) => s + Number(x.rating), 0) / suppliers.length).toFixed(1) : '—'} sub="Supplier quality" icon="check" color="#f59e0b" />
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 15, fontWeight: 600, margin: 0 }}>Supplier directory</h3>
          <Btn onClick={() => { setForm(BLANK); setError(''); setEditing('new') }}><Icon d={ICONS.plus} size={14} /> Add supplier</Btn>
        </div>
        {suppliers.length === 0 ? (
          <EmptyState title="No suppliers yet" sub="Add your suppliers to track contacts and amounts owed" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><Th>Supplier</Th><Th>Contact</Th><Th>Phone</Th><Th>Category</Th><Th>Rating</Th><Th right>Outstanding</Th><Th /></tr></thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id} className="table-row">
                    <Td strong>{s.name}</Td>
                    <Td>{s.contact_name || '—'}</Td>
                    <Td mono>{s.phone || '—'}</Td>
                    <Td>{s.category ? <span className="badge badge-blue">{s.category}</span> : '—'}</Td>
                    <Td style={{ color: '#f59e0b', fontWeight: 600 }}>{Number(s.rating).toFixed(1)} / 5</Td>
                    <Td mono strong right style={{ color: Number(s.payable) > 0 ? '#ef4444' : '#00d46a' }}>{Number(s.payable) > 0 ? cedi(s.payable) : 'Cleared'}</Td>
                    <Td><button onClick={() => openEdit(s)} title="Edit" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Icon d={ICONS.edit} size={14} /></button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add supplier' : 'Edit supplier'} onClose={() => setEditing(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Supplier name *"><input autoFocus className="input-field" value={form.name} onChange={set('name')} placeholder="e.g. FreshDairy Co." /></Field>
            <div className="g2">
              <Field label="Contact person"><input className="input-field" value={form.contact_name} onChange={set('contact_name')} /></Field>
              <Field label="Phone"><input className="input-field" value={form.phone} onChange={set('phone')} inputMode="tel" /></Field>
            </div>
            <div className="g3">
              <Field label="Category"><input className="input-field" value={form.category} onChange={set('category')} placeholder="e.g. Dairy" /></Field>
              <Field label="Rating (1–5)"><input className="input-field" type="number" step="0.1" min="1" max="5" value={form.rating} onChange={set('rating')} /></Field>
              <Field label="Amount owed (₵)"><input className="input-field" type="number" step="0.01" value={form.payable} onChange={set('payable')} /></Field>
            </div>
            <ErrorBox>{error}</ErrorBox>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              {editing !== 'new' ? <Btn variant="danger" onClick={() => remove(editing as Supplier)}>Delete</Btn> : <span />}
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
