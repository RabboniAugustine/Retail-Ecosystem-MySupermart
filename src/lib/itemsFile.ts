// Reading and writing item lists (CSV or Excel) for Utilities.

import { downloadCsv, downloadXlsx } from './exporter'

export type ItemField = 'name' | 'sku' | 'barcode' | 'category' | 'cost' | 'price' | 'stock' | 'reorder_level' | 'supplier' | 'expiry_date'

export const ITEM_COLUMNS: { field: ItemField; label: string; aliases: string[] }[] = [
  { field: 'name', label: 'Name', aliases: ['name', 'item', 'itemname', 'product', 'productname', 'description'] },
  { field: 'sku', label: 'SKU', aliases: ['sku', 'code', 'itemcode', 'productcode'] },
  { field: 'barcode', label: 'Barcode', aliases: ['barcode', 'ean', 'upc'] },
  { field: 'category', label: 'Category', aliases: ['category', 'group', 'department'] },
  { field: 'cost', label: 'Cost price', aliases: ['cost', 'costprice', 'unitcost', 'buyingprice', 'purchaseprice'] },
  { field: 'price', label: 'Selling price', aliases: ['price', 'sellingprice', 'saleprice', 'retailprice', 'unitprice'] },
  { field: 'stock', label: 'Stock', aliases: ['stock', 'qty', 'quantity', 'stockqty', 'instock', 'onhand'] },
  { field: 'reorder_level', label: 'Reorder level', aliases: ['reorderlevel', 'reorder', 'minstock', 'minimum'] },
  { field: 'supplier', label: 'Supplier', aliases: ['supplier', 'vendor'] },
  { field: 'expiry_date', label: 'Expiry date (YYYY-MM-DD)', aliases: ['expirydate', 'expiry', 'expires', 'bestbefore', 'expirydateyyyymmdd'] },
]

export type ParsedRow = { _row: number } & Partial<Record<ItemField, string>>
export type ParsedFile = { rows: ParsedRow[]; fields: ItemField[]; unknownHeaders: string[] }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

const pad = (x: number) => String(x).padStart(2, '0')

/** Dates as YYYY-MM-DD. Accepts Excel dates, 2026-12-31, 31/12/2026 and 31-12-2026. */
export function normDate(v: unknown): string {
  if (v == null || v === '') return ''
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`
  return s // left as is; validation reports it
}

/** "₵1,250.00" -> "1250.00" */
export const normNumber = (v: unknown) => v == null ? '' : String(v).replace(/[₵\s,]/g, '').replace(/^GHS/i, '')

export async function readItemsFile(file: File): Promise<ParsedFile> {
  let grid: unknown[][]
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser')
    grid = (await readSheet(file)) as unknown[][]
  } else if (/\.(csv|txt)$/i.test(file.name)) {
    grid = parseCsv(await file.text())
  } else {
    throw new Error('Choose an Excel (.xlsx) or CSV file. Older .xls files: open in Excel and "Save as" .xlsx first.')
  }
  const headerIdx = grid.findIndex(r => r.some(c => c != null && String(c).trim() !== ''))
  if (headerIdx < 0) throw new Error('The file is empty.')
  const header = grid[headerIdx].map(h => (h == null ? '' : String(h)))
  const map: (ItemField | null)[] = header.map(h => ITEM_COLUMNS.find(c => c.aliases.includes(norm(h)))?.field ?? null)
  const fields = Array.from(new Set(map.filter((f): f is ItemField => !!f)))
  const unknownHeaders = header.filter((h, i) => h.trim() && !map[i])
  const rows: ParsedRow[] = []
  grid.slice(headerIdx + 1).forEach((r, i) => {
    if (!r.some(c => c != null && String(c).trim() !== '')) return
    const row: ParsedRow = { _row: headerIdx + i + 2 }
    map.forEach((f, j) => {
      if (!f) return
      const v = r[j]
      row[f] = f === 'expiry_date' ? normDate(v)
        : ['cost', 'price', 'stock', 'reorder_level'].includes(f) ? normNumber(v)
        : v == null ? '' : String(v).trim()
    })
    rows.push(row)
  })
  return { rows, fields, unknownHeaders }
}

export type ExportItem = { name: string; sku: string | null; barcode: string | null; category: string; cost: number; price: number; stock: number; reorder_level: number; supplier: string | null; expiry_date: string | null }

const toGrid = (items: ExportItem[]) => items.map(i => [i.name, i.sku ?? '', i.barcode ?? '', i.category, Number(i.cost), Number(i.price), i.stock, i.reorder_level, i.supplier ?? '', i.expiry_date ?? ''])
const header = ITEM_COLUMNS.map(c => c.label)

export async function exportItems(items: ExportItem[], format: 'xlsx' | 'csv', fileName: string) {
  if (format === 'csv') downloadCsv(`${fileName}.csv`, header, toGrid(items))
  else await downloadXlsx(`${fileName}.xlsx`, 'Items', header, toGrid(items))
}

export async function downloadTemplate(format: 'xlsx' | 'csv') {
  const sample = [['Whole Milk 1L', 'DRY-001', '6001234567890', 'Dairy', 12, 18, 40, 10, 'Accra Wholesale Ltd', '2026-12-31']]
  if (format === 'csv') downloadCsv('items_template.csv', header, sample)
  else await downloadXlsx('items_template.xlsx', 'Items', header, sample)
}
