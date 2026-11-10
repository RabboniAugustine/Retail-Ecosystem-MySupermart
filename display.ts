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

// ── Opening the display on the second (extended) screen ───────────────────
// Chrome and Edge can list all connected screens (Window Management API) after
// the user allows "Manage windows on all your displays" once. We then open the
// display window exactly over the second screen. Other browsers fall back to
// placing it to the right of the current screen (the usual extended layout).

type ScreenInfo = { left: number; top: number; width: number; height: number; isPrimary?: boolean; label?: string }
type ScreenDetails = { screens: ScreenInfo[]; currentScreen: ScreenInfo }
type WindowWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> }

export type DisplayOpenResult =
  | { ok: true; where: 'second-screen' | 'guessed' | 'same-screen'; screenName?: string }
  | { ok: false; reason: 'popup-blocked' }

async function findSecondScreen(): Promise<{ screen: ScreenInfo | null; detected: boolean }> {
  const w = window as WindowWithScreens
  if (!w.getScreenDetails) return { screen: null, detected: false }
  try {
    const details = await w.getScreenDetails()
    const cur = details.currentScreen
    const others = details.screens.filter(s => !(s.left === cur.left && s.top === cur.top && s.width === cur.width && s.height === cur.height))
    // Prefer a screen that is not the primary one (usually the customer-facing monitor).
    const pick = others.find(s => !s.isPrimary) ?? others[0] ?? null
    return { screen: pick, detected: true }
  } catch {
    return { screen: null, detected: false } // permission refused or not supported
  }
}

const DISPLAY_NAME = 'mysupermart-customer-display'

/** Opens (or moves) the customer display onto the second screen, filling it. Call from a click. */
export async function openCustomerDisplay(): Promise<DisplayOpenResult> {
  const { screen: target, detected } = await findSecondScreen()

  let rect: ScreenInfo
  let where: 'second-screen' | 'guessed' | 'same-screen'
  if (target) {
    rect = target
    where = 'second-screen'
  } else if (detected) {
    // Only one screen connected: open a normal window on this screen.
    rect = { left: window.screenX + 40, top: window.screenY + 40, width: 1024, height: 700 }
    where = 'same-screen'
  } else {
    // Cannot see the screens: assume the extended screen sits to the right.
    const s = window.screen as Screen & { availLeft?: number; availTop?: number }
    rect = { left: (s.availLeft ?? 0) + s.width, top: s.availTop ?? 0, width: s.availWidth, height: s.availHeight }
    where = 'guessed'
  }

  const features = `popup=yes,left=${rect.left},top=${rect.top},width=${rect.width},height=${rect.height}` +
    (where === 'same-screen' ? '' : ',fullscreen=yes')
  const win = window.open('/display', DISPLAY_NAME, features)
  if (!win) return { ok: false, reason: 'popup-blocked' }

  // If the window was already open, move it onto the target screen and fill it.
  try {
    win.moveTo(rect.left, rect.top)
    win.resizeTo(rect.width, rect.height)
  } catch { /* the browser may not allow it */ }
  win.focus()
  return { ok: true, where, screenName: target?.label }
}
