import { useCallback, useEffect, useState } from 'react'
import { supabase, setStaffRole, setStaffName, createStaff, resetStaffPassword, generatePassword, emailToLogin } from '../lib/api'
import { useAuth } from '../lib/auth'
import { cedi, isCompleted, startOfToday } from '../lib/format'
import type { Profile, Role } from '../lib/types'
import { Btn, EmptyState, ErrorBox, Field, Icon, ICONS, Modal, SectionTitle, Spinner, Th, Td } from '../components/ui'

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', sales: 'Salesperson', pending: 'Waiting approval', disabled: 'Disabled' }
const ROLE_BADGE: Record<Role, string> = { owner: 'badge badge-blue', sales: 'badge badge-green', pending: 'badge badge-yellow', disabled: 'badge badge-red' }

type Credentials = { name: string; login: string; password: string; isNew: boolean }

/** Username suggestion from a full name: "Esi Asante" -> "esi.asante". */
const suggestLogin = (name: string) =>
  name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')

export function Staff({ refresh }: { refresh: number }) {
  const { profile: me, settings } = useAuth()
  const [staff, setStaff] = useState<Profile[]>([])
  const [today, setToday] = useState<Record<string, { count: number; total: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', login: '', loginTouched: false, password: '', role: 'sales' as 'sales' | 'owner' })
  const [resetFor, setResetFor] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [creds, setCreds] = useState<Credentials | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [p, t] = await Promise.all([
      supabase.from('ms_profiles').select('*').order('created_at'),
      supabase.from('ms_transactions').select('cashier_id, total, status').gte('created_at', startOfToday()),
    ])
    setStaff((p.data as Profile[] | null) ?? [])
    const agg: Record<string, { count: number; total: number }> = {}
    ;((t.data as { cashier_id: string | null; total: number; status: string }[] | null) ?? []).filter(isCompleted).forEach(x => {
      if (!x.cashier_id) return
      agg[x.cashier_id] = agg[x.cashier_id] ?? { count: 0, total: 0 }
      agg[x.cashier_id].count++; agg[x.cashier_id].total += Number(x.total)
    })
    setToday(agg)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refresh])

  const openAdd = () => {
    setForm({ name: '', login: '', loginTouched: false, password: generatePassword(), role: 'sales' })
    setFormError(''); setAdding(true)
  }

  const submitAdd = async () => {
    if (!form.name.trim()) { setFormError('Enter the staff member\'s name.'); return }
    if (!form.login.trim()) { setFormError('Enter a username.'); return }
    if (form.password.length < 6) { setFormError('Password must be at least 6 characters.'); return }
    setSaving(true); setFormError('')
    try {
      await createStaff(form.name.trim(), form.login.trim(), form.password, form.role)
      setAdding(false)
      setCreds({ name: form.name.trim(), login: form.login.trim().toLowerCase(), password: form.password, isNew: true })
      load()
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not create the account') }
    setSaving(false)
  }

  const submitReset = async () => {
    if (!resetFor) return
    if (newPassword.length < 6) { setFormError('Password must be at least 6 characters.'); return }
    setSaving(true); setFormError('')
    try {
      await resetStaffPassword(resetFor.id, newPassword)
      setCreds({ name: resetFor.full_name ?? '', login: emailToLogin(resetFor.email), password: newPassword, isNew: false })
      setResetFor(null)
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not reset the password') }
    setSaving(false)
  }

  const change = async (p: Profile, role: Role) => {
    if (role === 'owner' && !window.confirm(`Make ${p.full_name} an owner? They will see all money and can manage staff.`)) return
    setBusy(p.id); setError('')
    try { await setStaffRole(p.id, role); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Could not update') }
    setBusy(null)
  }

  const rename = async (p: Profile) => {
    const name = window.prompt('Name shown on receipts and reports', p.full_name ?? '')
    if (name == null || !name.trim()) return
    try { await setStaffName(p.id, name); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Could not rename') }
  }

  const credsText = creds ? `${settings.shop_name}\nName: ${creds.name}\nUsername: ${creds.login}\nPassword: ${creds.password}\nSign in at: ${window.location.origin}` : ''
  const copyCreds = async () => {
    try { await navigator.clipboard.writeText(credsText); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }

  if (loading) return <Spinner />
  const pending = staff.filter(s => s.role === 'pending')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="stat-card">
        <SectionTitle right={<Btn onClick={openAdd}><Icon d={ICONS.plus} size={14} /> Add staff</Btn>}>Staff logins</SectionTitle>
        <p style={{ fontSize: 13, color: 'var(--c-text-2)', margin: 0, lineHeight: 1.6 }}>
          Create a username and password for each salesperson and give them the details. They sign in with exactly those; nobody can create their own account.
          To stop someone signing in, click <b style={{ color: 'var(--c-danger)' }}>Disable</b>.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="stat-card" style={{ borderColor: 'color-mix(in srgb, var(--c-warn) 35%, transparent)' }}>
          <SectionTitle>Accounts without access ({pending.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--c-warn) 6%, transparent)' }}>
                <div><div style={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 600 }}>{p.full_name}</div><div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{emailToLogin(p.email)}</div></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="danger" disabled={busy === p.id} onClick={() => change(p, 'disabled')}>Reject</Btn>
                  <Btn disabled={busy === p.id} onClick={() => change(p, 'sales')}>Approve as salesperson</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stat-card">
        <SectionTitle>All staff</SectionTitle>
        <ErrorBox>{error}</ErrorBox>
        {staff.length === 0 ? <EmptyState title="No staff yet" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><Th>Name</Th><Th>Username</Th><Th>Role</Th><Th right>Sales today</Th><Th>Added</Th><Th>Actions</Th></tr></thead>
              <tbody>
                {staff.map(p => (
                  <tr key={p.id} className="table-row">
                    <Td strong>{p.full_name}{p.id === me?.id ? <span style={{ color: 'var(--c-text-4)', fontWeight: 400 }}> (you)</span> : ''}</Td>
                    <Td mono>{emailToLogin(p.email)}</Td>
                    <Td><span className={ROLE_BADGE[p.role]}>{ROLE_LABEL[p.role]}</span></Td>
                    <Td mono right>{today[p.id] ? `${cedi(today[p.id].total)} · ${today[p.id].count}` : '—'}</Td>
                    <Td mono muted>{new Date(p.created_at).toLocaleDateString('en-GB')}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Btn variant="ghost" onClick={() => rename(p)}>Rename</Btn>
                        {p.id !== me?.id && <Btn variant="ghost" onClick={() => { setResetFor(p); setNewPassword(generatePassword()); setFormError('') }}>Reset password</Btn>}
                        {p.id !== me?.id && p.role === 'sales' && <Btn variant="danger" disabled={busy === p.id} onClick={() => change(p, 'disabled')}>Disable</Btn>}
                        {p.id !== me?.id && p.role === 'disabled' && <Btn variant="ghost" disabled={busy === p.id} onClick={() => change(p, 'sales')}>Re-enable</Btn>}
                        {p.id !== me?.id && p.role === 'sales' && <Btn variant="ghost" disabled={busy === p.id} onClick={() => change(p, 'owner')}>Make owner</Btn>}
                        {p.id !== me?.id && p.role === 'owner' && <Btn variant="ghost" disabled={busy === p.id} onClick={() => change(p, 'sales')}>Make salesperson</Btn>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && (
        <Modal title="Add staff" onClose={() => setAdding(false)} width={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Full name *">
              <input autoFocus className="input-field" value={form.name} placeholder="e.g. Esi Asante"
                onChange={e => { const name = e.target.value; setForm(f => ({ ...f, name, login: f.loginTouched ? f.login : suggestLogin(name) })) }} />
            </Field>
            <Field label="Username *">
              <input className="input-field" value={form.login} autoCapitalize="none" placeholder="e.g. esi.asante"
                onChange={e => setForm(f => ({ ...f, login: e.target.value.toLowerCase().replace(/\s+/g, ''), loginTouched: true }))} />
            </Field>
            <Field label="Password *">
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input-field" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={{ fontFamily: 'JetBrains Mono, monospace' }} />
                <Btn variant="ghost" onClick={() => setForm(f => ({ ...f, password: generatePassword() }))}>New</Btn>
              </div>
            </Field>
            <Field label="Role">
              <select className="input-field" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'sales' | 'owner' }))}>
                <option value="sales">Salesperson (till, stock, customers)</option>
                <option value="owner">Owner (full access)</option>
              </select>
            </Field>
            <ErrorBox>{formError}</ErrorBox>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setAdding(false)}>Cancel</Btn>
              <Btn onClick={submitAdd} disabled={saving}>{saving ? 'Creating…' : 'Create login'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {resetFor && (
        <Modal title={`Reset password · ${resetFor.full_name}`} onClose={() => setResetFor(null)} width={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="New password">
              <div style={{ display: 'flex', gap: 8 }}>
                <input autoFocus className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ fontFamily: 'JetBrains Mono, monospace' }} />
                <Btn variant="ghost" onClick={() => setNewPassword(generatePassword())}>New</Btn>
              </div>
            </Field>
            <ErrorBox>{formError}</ErrorBox>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setResetFor(null)}>Cancel</Btn>
              <Btn onClick={submitReset} disabled={saving}>{saving ? 'Saving…' : 'Set password'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {creds && (
        <Modal title={creds.isNew ? 'Login created' : 'Password changed'} onClose={() => setCreds(null)} width={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--c-text-2)', margin: 0, lineHeight: 1.5 }}>
              Give these details to {creds.name}. The password is not shown again; you can always set a new one with Reset password.
            </p>
            <div style={{ background: 'var(--c-bg)', border: '1px solid color-mix(in srgb, var(--c-ink) 8%, transparent)', borderRadius: 10, padding: 16, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: 14 }}>
              <span style={{ color: 'var(--c-text-3)' }}>Username</span><span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--c-text)', fontWeight: 600 }}>{creds.login}</span>
              <span style={{ color: 'var(--c-text-3)' }}>Password</span><span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--c-accent)', fontWeight: 600 }}>{creds.password}</span>
              <span style={{ color: 'var(--c-text-3)' }}>Sign in at</span><span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--c-text-2)', fontSize: 12, wordBreak: 'break-all' }}>{window.location.origin}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={copyCreds}>{copied ? 'Copied' : 'Copy details'}</Btn>
              <Btn onClick={() => setCreds(null)}>Done</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
