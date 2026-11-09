// Receipt printing for thermal printers. The paper width is remembered per
// computer, because each till can have a different printer.

export type PaperWidth = '58' | '80'
const KEY = 'mysupermart-paper-width'

// Printable width is narrower than the paper: about 48 mm on 58 mm paper, 72 mm on 80 mm.
const SIZES: Record<PaperWidth, { pad: number; font: number }> = {
  '58': { pad: 5, font: 9 },
  '80': { pad: 4, font: 11 },
}

export function getPaperWidth(): PaperWidth {
  try { return localStorage.getItem(KEY) === '80' ? '80' : '58' } catch { return '58' }
}

export function setPaperWidth(w: PaperWidth) {
  try { localStorage.setItem(KEY, w) } catch { /* storage unavailable */ }
}

/** Sets the page size for the chosen paper, then opens the print dialog. */
export function printReceipt(width: PaperWidth = getPaperWidth()) {
  const { pad, font } = SIZES[width]
  let style = document.getElementById('receipt-page-style') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'receipt-page-style'
    document.head.appendChild(style)
  }
  style.textContent = `@media print {
  @page { size: ${width}mm auto; margin: 0; }
  .receipt-print { width: ${width}mm !important; padding: 3mm ${pad}mm 6mm !important; font-size: ${font}px !important; }
}`
  window.print()
}
