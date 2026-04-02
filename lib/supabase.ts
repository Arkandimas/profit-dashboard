import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Platform = 'Shopee' | 'TikTok Shop'
export type ExpenseCategory = 'COGS' | 'Shipping' | 'Platform Fee' | 'Shopee Ads' | 'Other'

export interface Order {
  id: string
  platform: Platform
  order_id: string
  /** The stored revenue (= buyer_paid_amount from Shopee sync). */
  revenue: number
  cogs: number
  /** Legacy denormalised shipping fee column (= actual_shipping_fee). */
  shipping_fee: number
  /** Legacy denormalised platform fee column (= commission_fee). */
  platform_fee: number
  /** Pre-computed net profit stored by the sync route. */
  net_profit?: number | null
  status: string
  created_at: string
  /** When Shopee reports payment time; used for "paid order" date filters (seller center style). */
  paid_at?: string | null

  // ── Extended Shopee financial fields ─────────────────────────────────────
  /** Original order total before any discounts/vouchers. */
  total_amount?: number | null
  /** Actual amount paid by buyer — the primary revenue signal. */
  buyer_paid_amount?: number | null
  /** Shopee-charged shipping fee. */
  actual_shipping_fee?: number | null
  /** Shopee commission fee (% of transaction). */
  commission_fee?: number | null
  /** Shopee service fee. */
  service_fee?: number | null
  /** Discount funded by the seller. */
  seller_discount?: number | null
  /** Voucher amount funded by the seller. */
  voucher_from_seller?: number | null
  /** Voucher amount funded by Shopee (does NOT reduce seller income). */
  voucher_from_shopee?: number | null
  /** Payment method used by buyer (e.g. "ShopeePay"). */
  payment_method?: string | null
  /** Line items of the order (product name, SKU, qty, price). */
  item_list?: Array<{
    item_id: number
    item_name: string
    item_sku: string
    model_quantity_purchased: number
    model_original_price: number
    model_discounted_price: number
  }> | null
}

export interface Product {
  id: string
  name: string
  sku: string
  platform: Platform
  cogs_per_unit: number
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
}

export interface Expense {
  id: string
  category: ExpenseCategory
  amount: number
  description: string
  platform: Platform | 'All'
  date: string
  created_at: string
  campaign_name?: string
  ad_type?: string
}

export interface AdSpend {
  id: string
  platform: Platform
  campaign_name: string
  amount: number
  date: string
}
