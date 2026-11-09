import { useEffect, useRef, useState } from 'react'
import { listenToDisplay, type DisplayLine, type DisplayState } from '../lib/display'
import { cedi } from '../lib/format'

/**
 * Customer-facing screen. Opened from the POS ("Customer screen" button) and
 * placed on the second monitor automatically (see openCustomerDisplay).
 * It shows exactly what the POS window sends, live, and reads no data itself.
 */

const C = {
  bg: '#06080f', panel: '#0b0f1a', line: 'rgba(255,255,255,0.07)',
  text: '#e8ecf4', soft: '#9ca3af', faint: '#6b7280', green: '#00d46a',
}
const mono = 'JetBrains Mono, monospace'
const lineKey = (l: DisplayLine, i: number) => (l.id != null ? `p${l.id}` : `${l.name}#${i}`)

export function CustomerDisplay() {
  const [state, setState] = useState<DisplayState>({ mode: 'idle', shopName: 'My Supermart', message: 'Welcome' })
  const [lastKey, setLastKey] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())
  const prevQty = useRef<Map<string, number>>(new Map())
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => listenToDisplay(next => {
    // Work out which line was just added or changed, to highlight it.
    if (next.mode === 'cart') {
      let changed: string | null = null
      const map = new Map<string, number>()
      next.lines.forEach((l, i) => {
        const k = lineKey(l, i)
        map.set(k, l.qty)
        if (prevQty.current.get(k) !== l.qty) changed = k
      })
      if (changed) setLastKey(changed)
      prevQty.current = map
    } else {
      prevQty.current = new Map()
      setLastKey(null)
    }
    setState(next)
  }), [])

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t) }, [])
  useEffect(() => { document.title = `${state.shopName} · Customer display` }, [state.shopName])

  // Keep the highlighted line in view.
  useEffect(() => {
    listRef.current?.querySelector('[data-last="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [state, lastKey])

  // Go full screen by itself when the browser allows it. Otherwise the first
  // tap, click or key press anywhere on this screen does it.
  const [isFull, setIsFull] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const goFull = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}) }
    const onChange = () => setIsFull(!!document.fullscreenElement)
    goFull()
    document.addEventListener('fullscreenchange', onChange)
    window.addEventListener('pointerdown', goFull)
    window.addEventListener('keydown', goFull)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('pointerdown', goFull)
      window.removeEventListener('keydown', goFull)
    }
  }, [])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.text, overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2.4vh 3vw', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
          <span style={{ width: '1.2vh', height: '1.2vh', background: C.green, borderRadius: 2 }} />
          <span style={{ fontSize: '3vh', fontWeight: 700, fontFamily: 'Roboto Slab, serif', letterSpacing: '-0.01em' }}>{state.shopName}</span>
        </div>
        <span style={{ fontSize: '2.4vh', color: C.faint, fontFamily: mono }}>
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </header>

      {state.mode === 'idle' && <Idle message={state.message} />}
      {state.mode === 'cart' && <Cart state={state} lastKey={lastKey} listRef={listRef} />}
      {state.mode === 'paid' && <Paid state={state} />}
      {!isFull && (
        <div style={{ position: 'fixed', bottom: '1.5vh', right: '2vw', fontSize: '1.6vh', color: C.faint, pointerEvents: 'none' }}>
          Tap anywhere for full screen
        </div>
      )}
    </div>
  )
}

function Idle({ message }: { message: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3vh', padding: '0 8vw', textAlign: 'center' }}>
      <div style={{ fontSize: '6vh', fontWeight: 700, fontFamily: 'Roboto Slab, serif', lineHeight: 1.2, maxWidth: '22ch' }}>{message}</div>
      <div style={{ width: '6vw', height: 2, background: C.green }} />
      <div style={{ fontSize: '2.4vh', color: C.faint }}>Your items and prices will appear here as they are scanned.</div>
    </div>
  )
}

function Cart({ state, lastKey, listRef }: {
  state: Extract<DisplayState, { mode: 'cart' }>
  lastKey: string | null
  listRef: React.RefObject<HTMLDivElement | null>
}) {
  const units = state.lines.reduce((s, l) => s + l.qty, 0)
  const lastIndex = state.lines.findIndex((l, i) => lineKey(l, i) === lastKey)
  const last = lastIndex >= 0 ? state.lines[lastIndex] : state.lines[state.lines.length - 1]
  const cols = 'minmax(0, 1fr) 7vw 12vw 13vw'
  const head: React.CSSProperties = { fontSize: '1.6vh', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1.65fr) minmax(0, 1fr)', minHeight: 0 }}>
      {/* ── Itemised list ── */}
      <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: '2.5vh 0 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '1.5vw', padding: '0 3vw 1.5vh', borderBottom: `1px solid ${C.line}` }}>
          <span style={head}>Item</span>
          <span style={{ ...head, textAlign: 'right' }}>Qty</span>
          <span style={{ ...head, textAlign: 'right' }}>Unit price</span>
          <span style={{ ...head, textAlign: 'right' }}>Amount</span>
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto' }}>
          {state.lines.map((l, i) => {
            const isLast = lineKey(l, i) === lastKey
            return (
              <div key={lineKey(l, i)} data-last={isLast}
                style={{
                  display: 'grid', gridTemplateColumns: cols, gap: '1.5vw', alignItems: 'center',
                  padding: '1.7vh 3vw', borderBottom: `1px solid ${C.line}`,
                  background: isLast ? 'rgba(0,212,106,0.06)' : 'transparent',
                  boxShadow: isLast ? `inset 4px 0 0 ${C.green}` : 'none',
                  transition: 'background 0.3s',
                }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '2.8vh', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                  {l.category && <div style={{ fontSize: '1.8vh', color: C.faint, marginTop: 2 }}>{l.category}</div>}
                </div>
                <span style={{ fontSize: '2.8vh', fontFamily: mono, textAlign: 'right', color: isLast ? C.green : C.text }}>{l.qty}</span>
                <span style={{ fontSize: '2.4vh', fontFamily: mono, textAlign: 'right', color: C.soft }}>{cedi(l.price)}</span>
                <span style={{ fontSize: '2.8vh', fontFamily: mono, textAlign: 'right', fontWeight: 700 }}>{cedi(l.qty * l.price)}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.8vh 3vw', borderTop: `1px solid ${C.line}`, fontSize: '2.2vh', color: C.soft }}>
          <span>{state.lines.length} {state.lines.length === 1 ? 'item' : 'items'} · {units} {units === 1 ? 'unit' : 'units'}</span>
          <span style={{ fontFamily: mono }}>{cedi(state.subtotal)}</span>
        </div>
      </section>

      {/* ── Summary ── */}
      <aside style={{ background: C.panel, borderLeft: `1px solid ${C.line}`, padding: '3.5vh 3vw', display: 'flex', flexDirection: 'column', gap: '2.2vh' }}>
        {last && (
          <div>
            <div style={{ ...head, marginBottom: '1vh' }}>Just added</div>
            <div style={{ fontSize: '3.2vh', fontWeight: 700, lineHeight: 1.2 }}>{last.name}</div>
            <div style={{ fontSize: '2.4vh', color: C.soft, fontFamily: mono, marginTop: '0.6vh' }}>
              {last.qty} × {cedi(last.price)} = <span style={{ color: C.text }}>{cedi(last.qty * last.price)}</span>
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {state.customerName && (
          <div style={{ fontSize: '2.2vh', color: C.soft, paddingBottom: '2vh', borderBottom: `1px solid ${C.line}` }}>
            <span style={{ color: C.text, fontWeight: 600 }}>{state.customerName}</span>
            {state.customerPoints != null && <> · {state.customerPoints.toLocaleString()} points, +{Math.floor(state.total)} today</>}
          </div>
        )}

        <Row label="Subtotal" value={cedi(state.subtotal)} />
        {state.discount > 0 && <Row label={`Discount (${state.discountPct}%)`} value={`−${cedi(state.discount)}`} color={C.green} />}
        <Row label={`VAT (${state.vatRate}%)`} value={cedi(state.tax)} />

        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: '2.2vh' }}>
          <div style={{ fontSize: '2.2vh', color: C.soft }}>Total to pay</div>
          <div style={{ fontSize: '9vh', fontWeight: 800, fontFamily: 'Roboto Slab, serif', color: C.green, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{cedi(state.total)}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1vh', fontSize: '2.2vh', color: C.soft }}>
          <Row label="Payment" value={state.paymentMethod} small />
          {state.tendered != null && state.tendered > 0 && (
            <>
              <Row label="Cash received" value={cedi(state.tendered)} small />
              <Row label="Change" value={cedi(Math.max(0, state.tendered - state.total))} small color={C.text} />
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function Row({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: small ? '2.2vh' : '2.6vh', color: color ?? C.soft }}>
      <span>{label}</span><span style={{ fontFamily: mono }}>{value}</span>
    </div>
  )
}

function Paid({ state }: { state: Extract<DisplayState, { mode: 'paid' }> }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2.4vh', textAlign: 'center', padding: '0 6vw' }}>
      <svg width="11vh" height="11vh" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="22" stroke={C.green} strokeWidth="2" />
        <path d="M14 24.5l7 7 13-14" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ fontSize: '5.5vh', fontWeight: 700, fontFamily: 'Roboto Slab, serif' }}>
        Thank you{state.customerName ? `, ${state.customerName.split(' ')[0]}` : ''}
      </div>
      <div style={{ fontSize: '2.8vh', color: C.soft }}>Paid <span style={{ color: C.text, fontFamily: mono }}>{cedi(state.total)}</span> by {state.paymentMethod}</div>
      {state.change != null && state.change > 0 && (
        <div style={{ fontSize: '4.2vh', fontWeight: 700, color: C.green }}>Your change: <span style={{ fontFamily: mono }}>{cedi(state.change)}</span></div>
      )}
      {state.customerName && state.pointsEarned > 0 && (
        <div style={{ fontSize: '2.4vh', color: C.soft }}>
          +{state.pointsEarned} points{state.customerPoints != null ? ` · balance ${state.customerPoints.toLocaleString()}` : ''}
        </div>
      )}
      <div style={{ fontSize: '2.2vh', color: C.faint }}>{state.txnCode} · {state.message}</div>
    </div>
  )
}
