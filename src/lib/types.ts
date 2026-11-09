export type Role = 'owner' | 'sales' | 'pending' | 'disabled'

export type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: Role
  created_at: string
}

export type Settings = {
  id: number
  shop_name: string
  address: string | null
  phone: string | null
  vat_rate: number
  max_discount_pct: number
  block_oversell: boolean
  display_message: string
  receipt_footer: string
}

export type Product = {
  id: number; name: string; sku: string | null; category: string
  barcode: string | null; price: number; cost: number; active?: boolean
}

export type InventoryRow = {
  id: number; product_id: number; stock: number; reorder_level: number
  expiry_date: string | null; supplier: string | null; updated_at: string
  ms_products: Product
}

export type Customer = {
  id: number; name: string; customer_code: string | null; phone: string | null; email: string | null
  joined_date: string; total_spent: number; visit_count: number; points: number; tier: string; last_visit: string | null
}

export type Supplier = {
  id: number; name: string; contact_name: string | null; phone: string | null; category: string | null
  rating: number; payable: number
}

export type TransactionItem = {
  id: number; product_id: number | null; product_name: string | null; quantity: number
  unit_price: number; unit_cost: number | null; line_total: number
  ms_products?: { name: string; category: string } | null
}

export type Transaction = {
  id: number; txn_code: string; total: number; subtotal: number
  discount_pct: number; discount_amount: number | null; tax: number; payment_method: string
  status: string; created_at: string
  cashier_id: string | null; cashier_name: string | null
  amount_tendered: number | null; change_due: number | null; points_earned: number | null
  refund_reason: string | null; refunded_at: string | null
  customer_id: number | null
  ms_customers?: { name: string } | null
  ms_transaction_items?: TransactionItem[]
}

export type Expense = {
  id: number; description: string; category: string; amount: number; date: string
}

export type RemovalRow = {
  id: number; product_name: string; sku: string; quantity: number; removed_by_name: string | null
  unit_cost: number; loss_value: number; reason: string; note: string | null; removed_at: string
}

export type StockMovement = {
  id: number; product_name: string | null; old_stock: number; new_stock: number; change: number
  reason: string; created_by_name: string | null; created_at: string
}

/** What ms_checkout returns. */
export type CheckoutResult = {
  id: number; txn_code: string; created_at: string
  subtotal: number; discount_pct: number; discount_amount: number; tax: number; vat_rate: number; total: number
  payment_method: string; amount_tendered: number | null; change_due: number | null
  points_earned: number; customer_points: number | null; cashier_name: string | null
}

export type Purchase = {
  id: number; purchase_code: string; supplier_id: number | null; supplier_name: string | null; invoice_no: string | null
  purchase_date: string; total: number; amount_paid: number; status: 'Paid' | 'Part paid' | 'Unpaid' | 'Void'
  note: string | null; created_by_name: string | null; created_at: string
  voided_at: string | null; voided_by_name: string | null; void_reason: string | null
  ms_purchase_items?: { id: number; product_id: number | null; product_name: string; quantity: number; unit_cost: number; line_total: number }[]
}

export type ExpenseRow = {
  id: number; description: string; category: string; amount: number; date: string
  paid_from: string; created_by_name: string | null; created_at: string
}
