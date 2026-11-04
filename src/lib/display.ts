// Link between the POS window and the customer-facing display window.
// Both windows run in the same browser on the same computer, so they talk
// through a BroadcastChannel: instant, no internet needed, nothing stored online.

export type DisplayLine = { id?: number; name: string; sku?: string | null; category?: string; qty: number; price: number }

export type DisplayState =
  | { mode: 'idle'; shopName: string; message: string }
  | {
      mode: 'cart'; shopName: string
      lines: DisplayLine[]
      subtotal: number; discountPct: number; discount: number; vatRate: number; tax: number; total: number
      customerName: string | null; customerPoints: number | null
      paymentMethod: string; tendered: number | null
    }
  | {
      mode: 'paid'; shopName: string; message: string
      total: number; paymentMethod: string; tendered: number | null; change: number | null
      customerName: string | null; pointsEarned: number; customerPoints: number | null; txnCode: string
    }

type Msg = { type: 'state'; state: DisplayState } | { type: 'hello' }

const CHANNEL = 'mysupermart-customer-display'
const STORAGE_KEY = 'mysupermart-display-state'

function open(): BroadcastChannel | null {
  try { return new BroadcastChannel(CHANNEL) } catch { return null }
}

/** Used by the POS: send the current cart to the customer screen. */
export function createDisplaySender(getState: () => DisplayState) {
  const ch = open()
  const send = (state: DisplayState) => {
    try { ch?.postMessage({ type: 'state', state } satisfies Msg) } catch { /* channel closed */ }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* storage unavailable */ }
  }
  // A display window that opens later asks for the current state.
  if (ch) ch.onmessage = (e: MessageEvent<Msg>) => { if (e.data?.type === 'hello') send(getState()) }
  return { send, close: () => ch?.close() }
}

/** Used by the customer screen: receive updates from the POS. */
export function listenToDisplay(onState: (s: DisplayState) => void) {
  const ch = open()
  if (ch) {
    ch.onmessage = (e: MessageEvent<Msg>) => { if (e.data?.type === 'state') onState(e.data.state) }
    try { ch.postMessage({ type: 'hello' } satisfies Msg) } catch { /* channel closed */ }
  }
  // Fallback for browsers without BroadcastChannel: the storage event.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) { try { onState(JSON.parse(e.newValue)) } catch { /* ignore */ } }
  }
  window.addEventListener('storage', onStorage)
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) onState(JSON.parse(saved))
  } catch { /* storage unavailable */ }
  return () => { ch?.close(); window.removeEventListener('storage', onStorage) }
}

export function openCustomerDisplay() {
  const w = window.open('/display', 'mysupermart-customer-display', 'popup=yes,width=1024,height=700')
  w?.focus()
  return w
}
