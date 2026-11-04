import { useEffect, useRef, useState } from 'react'
import { listenToDisplay, type DisplayState } from '../lib/display'
import { cedi } from '../lib/format'

/**
 * Customer-facing screen. Opened from the POS ("Customer screen" button) and
 * dragged onto the second monitor. Press F11 for full screen.
 * It only shows what the POS window sends; it has no login and reads no data.
 */
export function CustomerDisplay() {
  const [state, setState] = useState<DisplayState>({ mode: 'idle', shopName: 'My Supermart', message: 'Welcome!' })
  const [now, setNow] = useState(new Date())
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => listenToDisplay(setState), [])
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t) }, [])
  useEffect(() => { document.title = `${state.shopName} — Customer Display` }, [state.shopName])
  // Newest item stays in view.
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [state])

  const goFullscreen = () => { document.documentElement.requestFullscreen?.().catch(() => {}) }

  return (
    <div onDoubleClick={goFullscreen} style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 80% 0%, rgba(0,212,106,0.10), transparent 45%), #06080f', color: '#e8ecf4', overflow: 'hidden', cursor: 'default' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2.2vh 3vw', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
          <div style={{ width: '5vh', height: '5vh', borderRadius: '1.2vh', background: 'linear-gradient(135deg, #00d46a, #009f50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.6vh', fontWeight: 800, color: '#03120a', fontFamily: 'Roboto Slab, serif' }}>
            {state.shopName.charAt(0).toUpperCase()}
          </div>
          <div style={{ fontSize: '3.2vh', fontWeight: 700, fontFamily: 'Roboto Slab, serif' }}>{state.shopName}</div>
        </div>
        <div style={{ fontSize: '2.6vh', color: '#9ca3af', fontFamily: 'JetBrains Mono, monospace' }}>
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      {state.mode === 'idle' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3vh', padding: '0 6vw', textAlign: 'center' }}>
          <div style={{ fontSize: '12vh' }}>🛒</div>
          <div style={{ fontSize: '6vh', fontWeight: 800, fontFamily: 'Roboto Slab, serif', lineHeight: 1.15 }}>{state.message}</div>
          <div style={{ fontSize: '2.4vh', color: '#6b7280' }}>Ask about our loyalty points — earn 1 point for every ₵1 you spend.</div>
        </div>
      )}

      {state.mode === 'cart' && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', minHeight: 0 }}>
          <div ref={listRef} style={{ overflowY: 'auto', padding: '2vh 3vw' }}>
            {state.lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '1.5vw', padding: '1.6vh 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '2.8vh' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#00d46a', minWidth: '3.5em' }}>{l.qty}×</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{l.name}<span style={{ display: 'block', fontSize: '2vh', color: '#6b7280', fontWeight: 400 }}>{cedi(l.price)} each</span></span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{cedi(l.qty * l.price)}</span>
              </div>
            ))}
          </div>
          <aside style={{ background: '#0d1120', borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '4vh 3vw', display: 'flex', flexDirection: 'column', gap: '2vh', justifyContent: 'flex-end' }}>
            {state.customerName && (
              <div style={{ padding: '1.8vh 1.5vw', borderRadius: '1.2vh', background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.3)', fontSize: '2.3vh' }}>
                Hello, <b>{state.customerName}</b>
                {state.customerPoints != null && <div style={{ color: '#c084fc', marginTop: 4 }}>{state.customerPoints.toLocaleString()} loyalty points · +{Math.floor(state.total)} with this purchase</div>}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '2.6vh', color: '#9ca3af' }}><span>Subtotal</span><span>{cedi(state.subtotal)}</span></div>
            {state.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '2.6vh', color: '#00d46a' }}><span>Discount ({state.discountPct}%)</span><span>−{cedi(state.discount)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '2.6vh', color: '#9ca3af' }}><span>VAT ({state.vatRate}%)</span><span>{cedi(state.tax)}</span></div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2vh' }}>
              <div style={{ fontSize: '2.6vh', color: '#9ca3af' }}>Total to pay</div>
              <div style={{ fontSize: '9vh', fontWeight: 800, fontFamily: 'Roboto Slab, serif', color: '#00d46a', lineHeight: 1.1 }}>{cedi(state.total)}</div>
              <div style={{ fontSize: '2.2vh', color: '#6b7280', marginTop: '1vh' }}>
                {state.paymentMethod}{state.tendered != null && state.tendered > 0 ? ` · Cash ${cedi(state.tendered)} · Change ${cedi(Math.max(0, state.tendered - state.total))}` : ''}
              </div>
            </div>
          </aside>
        </div>
      )}

      {state.mode === 'paid' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2.5vh', textAlign: 'center', padding: '0 6vw' }}>
          <div style={{ width: '14vh', height: '14vh', borderRadius: '50%', background: 'rgba(0,212,106,0.12)', border: '2px solid rgba(0,212,106,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8vh', color: '#00d46a' }}>✓</div>
          <div style={{ fontSize: '6vh', fontWeight: 800, fontFamily: 'Roboto Slab, serif' }}>Thank you{state.customerName ? `, ${state.customerName.split(' ')[0]}` : ''}!</div>
          <div style={{ fontSize: '3vh', color: '#9ca3af' }}>Paid {cedi(state.total)} by {state.paymentMethod}</div>
          {state.change != null && state.change > 0 && (
            <div style={{ fontSize: '4.5vh', fontWeight: 700, color: '#00d46a' }}>Your change: {cedi(state.change)}</div>
          )}
          {state.customerName && state.pointsEarned > 0 && (
            <div style={{ fontSize: '2.6vh', color: '#c084fc' }}>You earned {state.pointsEarned} points{state.customerPoints != null ? ` · Balance ${state.customerPoints.toLocaleString()}` : ''}</div>
          )}
          <div style={{ fontSize: '2.4vh', color: '#6b7280' }}>{state.message}</div>
        </div>
      )}

      <footer style={{ padding: '1.4vh 3vw', fontSize: '1.6vh', color: '#374151', textAlign: 'right' }}>Double-click for full screen</footer>
    </div>
  )
}
