// Export tables to CSV or Excel, and print reports.

export type Col = { label: string; align?: 'right'; money?: boolean }
export type Table = { title: string; columns: Col[]; rows: (string | number | null)[][] }
export type ReportOut = { title: string; subtitle: string; summary: { label: string; value: string }[]; tables: Table[] }

const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_')

function download(blob: Blob, fileName: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: (string | number | null)[][]) {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')
}

/** CSV with a BOM so Excel opens ₵ and other characters correctly. */
export function downloadCsv(fileName: string, header: string[], rows: (string | number | null)[][]) {
  download(new Blob(['﻿' + toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }), fileName)
}

export function downloadReportCsv(r: ReportOut) {
  const parts: string[] = [toCsv([r.title], [[r.subtitle]])]
  if (r.summary.length) parts.push(toCsv(['Summary', ''], r.summary.map(s => [s.label, s.value])))
  for (const t of r.tables) parts.push(toCsv([t.title], []) + '\r\n' + toCsv(t.columns.map(c => c.label), t.rows))
  download(new Blob(['﻿' + parts.join('\r\n\r\n')], { type: 'text/csv;charset=utf-8' }), `${safeName(r.title)}_${safeName(r.subtitle)}.csv`)
}

type XCell = { value?: string | number; fontWeight?: 'bold'; format?: string } | null

async function writeSheets(fileName: string, sheets: { name: string; header: string[]; rows: (string | number | null)[][]; money?: boolean[] }[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const used = new Set<string>()
  const data = sheets.map(s => {
    let name = s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet'
    while (used.has(name)) name = name.slice(0, 28) + used.size
    used.add(name)
    const rows: XCell[][] = [
      s.header.map(h => ({ value: h, fontWeight: 'bold' as const })),
      ...s.rows.map(r => r.map((v, i) => v == null || v === '' ? null : typeof v === 'number' ? { value: v, format: s.money?.[i] ? '#,##0.00' : undefined } : { value: v })),
    ]
    return { sheet: name, data: rows, columns: s.header.map((h, i) => ({ width: Math.min(40, Math.max(10, h.length + 2, ...s.rows.slice(0, 200).map(r => String(r[i] ?? '').length + 2))) })) }
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await writeXlsxFile(data as any).toFile(fileName)
}

export async function downloadReportXlsx(r: ReportOut) {
  const sheets = [
    { name: 'Summary', header: [r.title, r.subtitle], rows: r.summary.map(s => [s.label, s.value]) },
    ...r.tables.map(t => ({ name: t.title, header: t.columns.map(c => c.label), rows: t.rows, money: t.columns.map(c => !!c.money) })),
  ]
  await writeSheets(`${safeName(r.title)}_${safeName(r.subtitle)}.xlsx`, sheets)
}

export async function downloadXlsx(fileName: string, sheetName: string, header: string[], rows: (string | number | null)[][]) {
  await writeSheets(fileName, [{ name: sheetName, header, rows }])
}

/** Print the report copy (A4) instead of the receipt. */
export function printReport() {
  let style = document.getElementById('receipt-page-style') as HTMLStyleElement | null
  if (!style) { style = document.createElement('style'); style.id = 'receipt-page-style'; document.head.appendChild(style) }
  style.textContent = '@media print { @page { size: A4; margin: 12mm; } }'
  document.body.classList.add('printing-report')
  const done = () => { document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  window.print()
  setTimeout(done, 1000)
}
