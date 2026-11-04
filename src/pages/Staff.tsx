import { useCallback, useEffect, useState } from 'react'
import { supabase, setStaffRole, setStaffName } from '../lib/api'
import { useAuth } from '../lib/auth'
import { cedi, isCompleted, startOfToday } from '../lib/format'
import type { Profile, Role } from '../lib/types'
import { Btn, EmptyState, ErrorBox, SectionTitle, Spinner, Th, Td } from '../components/ui'

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', sales: 'Salesperson', pending: 'Waiting approval', disabled: 'Disabled' }
const ROLE_BADGE: Record<Role, string> = { owner: 'badge badge-blue', sales: 'badge badge-green', pending: 'badge badge-yellow', disabled: 'badge badge-red' }

export function Staff({ refresh }: { refresh: number }) {
  const { profile: me } = useAuth()
  const [staff, setStaff] = useState<Profile[]>([])
  const [today, setToday] = useState<Record<string, { count: number; total: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

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

  if (loading) return <Spinner />
  const pending = staff.filter(s => s.role === 'pending')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="stat-card" style={{ borderColor: 'rgba(0,212,106,0.2)' }}>
        <SectionTitle>Adding a salesperson</SectionTitle>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#9ca3af', lineHeight: 1.8 }}>
          <li>On the shop computer, open this app and choose <b style={{ color: '#e8ecf4' }}>Create account</b> with the salesperson's name and email.</li>
          <li>They appear below as <b style={{ color: '#eab308' }}>Waiting approval</b>. Click <b style={{ color: '#00d46a' }}>Approve as salesperson</b>.</li>
          <li>They tap “Check again” and the till opens. To remove access later, click <b style={{ color: '#ef4444' }}>Disable</b>.</li>
        </ol>
      </div>

      {pending.length > 0 && (
        <div className="stat-card" style={{ borderColor: 'rgba(234,179,8,0.35)' }}>
          <SectionTitle>Waiting for approval ({pending.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 8, background: 'rgba(234,179,8,0.06)' }}>
                <div><div style={{ fontSize: 14, color: '#e8ecf4', fontWeight: 600 }}>{p.full_name}</div><div style={{ fontSize: 12, color: '#6b7280' }}>{p.email}</div></div>
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
        {staff.length === 0 ? <EmptyState icon="🧑‍💼" title="No staff yet" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th right>Sales today</Th><Th>Joined</Th><Th>Actions</Th></tr></thead>
              <tbody>
                {staff.map(p => (
                  <tr key={p.id} className="table-row">
                    <Td strong>{p.full_name}{p.id === me?.id ? <span style={{ color: '#4b5563', fontWeight: 400 }}> (you)</span> : ''}</Td>
                    <Td>{p.email}</Td>
                    <Td><span className={ROLE_BADGE[p.role]}>{ROLE_LABEL[p.role]}</span></Td>
                    <Td mono right>{today[p.id] ? `${cedi(today[p.id].total)} · ${today[p.id].count}` : '—'}</Td>
                    <Td mono muted>{new Date(p.created_at).toLocaleDateString('en-GB')}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Btn variant="ghost" onClick={() => rename(p)}>Rename</Btn>
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
    </div>
  )
}
