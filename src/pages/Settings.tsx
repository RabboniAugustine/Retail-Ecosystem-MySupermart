import { useState } from 'react'
import { supabase, friendlyError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Btn, ErrorBox, Field, SectionTitle } from '../components/ui'

export function SettingsPage() {
  const { settings, reloadSettings } = useAuth()
  const [form, setForm] = useState({
    shop_name: settings.shop_name, address: settings.address ?? '', phone: settings.phone ?? '',
    vat_rate: String(settings.vat_rate), max_discount_pct: String(settings.max_discount_pct),
    block_oversell: settings.block_oversell, display_message: settings.display_message, receipt_footer: settings.receipt_footer,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => { setSaved(false); setForm(f => ({ ...f, [k]: e.target.value })) }

  const save = async () => {
    const vat = Number(form.vat_rate), max = Number(form.max_discount_pct)
    if (!form.shop_name.trim()) { setError('Shop name is required.'); return }
    if (!(vat >= 0 && vat <= 100) || !(max >= 0 && max <= 100)) { setError('VAT and discount must be between 0 and 100.'); return }
    setSaving(true); setError('')
    const { error } = await supabase.from('ms_settings').update({
      shop_name: form.shop_name.trim(), address: form.address.trim() || null, phone: form.phone.trim() || null,
      vat_rate: vat, max_discount_pct: max, block_oversell: form.block_oversell,
      display_message: form.display_message.trim() || 'Welcome!', receipt_footer: form.receipt_footer.trim() || 'Thank you!',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
    setSaving(false)
    if (error) { setError(friendlyError(error)); return }
    await reloadSettings()
    setSaved(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
      <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionTitle>Shop details (printed on receipts)</SectionTitle>
        <Field label="Shop name"><input className="input-field" value={form.shop_name} onChange={set('shop_name')} /></Field>
        <div className="g2">
          <Field label="Address"><input className="input-field" value={form.address} onChange={set('address')} placeholder="e.g. Spintex Road, Accra" /></Field>
          <Field label="Phone"><input className="input-field" value={form.phone} onChange={set('phone')} /></Field>
        </div>
        <Field label="Receipt footer"><input className="input-field" value={form.receipt_footer} onChange={set('receipt_footer')} /></Field>
      </div>

      <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionTitle>Selling rules</SectionTitle>
        <div className="g2">
          <Field label="VAT / tax rate (%)"><input className="input-field" type="number" step="0.01" min="0" max="100" value={form.vat_rate} onChange={set('vat_rate')} /></Field>
          <Field label="Max discount a salesperson can give (%)"><input className="input-field" type="number" step="0.5" min="0" max="100" value={form.max_discount_pct} onChange={set('max_discount_pct')} /></Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--c-text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.block_oversell} onChange={e => { setSaved(false); setForm(f => ({ ...f, block_oversell: e.target.checked })) }} style={{ width: 16, height: 16, accentColor: 'var(--c-accent)' }} />
          Stop sales when there is not enough stock recorded
        </label>
        <div style={{ fontSize: 12, color: 'var(--c-text-4)' }}>Turn this off only if your stock counts are not up to date yet; stock will then stop at zero instead of blocking the sale.</div>
      </div>

      <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionTitle>Customer screen</SectionTitle>
        <Field label="Welcome message (shown when the till is idle)"><input className="input-field" value={form.display_message} onChange={set('display_message')} /></Field>
      </div>

      <ErrorBox>{error}</ErrorBox>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Btn>
        {saved && <span style={{ fontSize: 13, color: 'var(--c-accent)' }}>Saved. Open tills pick this up after Sync or a refresh.</span>}
      </div>
    </div>
  )
}
