import { useState } from 'react'
import { supabase, friendlyError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Btn, ErrorBox, Field } from '../components/ui'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'radial-gradient(circle at 30% 20%, rgba(0,212,106,0.08), transparent 50%), #06080f' }}>
      <div style={{ width: 'min(400px, 100%)', background: '#0d1120', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg, #00d46a, #009f50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#03120a', fontFamily: 'Roboto Slab, serif' }}>M</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'Roboto Slab, serif', color: '#e8ecf4' }}>MySupermart</div>
            <div style={{ fontSize: 10, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Retail OS</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(''); setInfo('')
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setError(/invalid login/i.test(error.message) ? 'Wrong email or password.' : /not confirmed/i.test(error.message) ? 'Please confirm your email first (check your inbox).' : friendlyError(error))
    } else {
      if (password.length < 6) { setError('Password must be at least 6 characters.'); setBusy(false); return }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin },
      })
      if (error) setError(friendlyError(error))
      else if (!data.session) setInfo('Account created. Check your email for a confirmation link, then sign in.')
    }
    setBusy(false)
  }

  return (
    <Frame>
      <div style={{ display: 'flex', gap: 4, background: '#06080f', padding: 4, borderRadius: 9, marginBottom: 18 }}>
        {(['signin', 'signup'] as const).map(m => (
          <button key={m} onClick={() => { setMode(m); setError(''); setInfo('') }} className="tab-btn"
            style={{ flex: 1, background: mode === m ? 'rgba(0,212,106,0.12)' : 'transparent', color: mode === m ? '#00d46a' : '#6b7280' }}>
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {mode === 'signup' && (
          <Field label="Full name"><input className="input-field" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ama Mensah" /></Field>
        )}
        <Field label="Email"><input className="input-field" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input className="input-field" type="password" required autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <ErrorBox>{error}</ErrorBox>
        {info && <div style={{ background: 'rgba(0,212,106,0.1)', border: '1px solid rgba(0,212,106,0.3)', color: '#00d46a', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>{info}</div>}
        <Btn type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Btn>
        {mode === 'signup' && (
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
            The first account becomes the shop owner. Staff accounts need the owner's approval before they can sign in to the till.
          </p>
        )}
      </form>
    </Frame>
  )
}

export function Waiting({ kind }: { kind: 'pending' | 'disabled' | 'setup' | 'noprofile' }) {
  const { profile, signOut, reloadProfile, setupError } = useAuth()
  const text = {
    pending: { title: 'Waiting for approval', body: `Hi ${profile?.full_name ?? ''}, your account is created. Ask the shop owner to approve you in Staff, then tap "Check again".` },
    disabled: { title: 'Access removed', body: 'This account no longer has access. Speak to the shop owner if you think this is a mistake.' },
    setup: { title: 'Database not set up', body: setupError ?? '' },
    noprofile: { title: 'Account not linked', body: 'Your login worked, but no staff profile was found. Make sure the database migrations have been run, then try again.' },
  }[kind]
  return (
    <Frame>
      <h2 style={{ fontFamily: 'Roboto Slab, serif', fontSize: 18, color: '#e8ecf4', margin: '0 0 8px' }}>{text.title}</h2>
      <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6, margin: '0 0 18px' }}>{text.body}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn onClick={reloadProfile}>Check again</Btn>
        <Btn variant="ghost" onClick={signOut}>Sign out</Btn>
      </div>
    </Frame>
  )
}
