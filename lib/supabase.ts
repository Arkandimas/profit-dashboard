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
  gmv?: number
  buyer_paid_amount?: number
  voucher_amount?: number
  /** @deprecated — tidak digunakan lagi. Gunakan buyer_paid_amount untuk profit calc, gmv untuk Shopee KPI. */
  revenue: number
  cogs: number
  shipping_fee: number
  platform_fee: number
  commission_fee?: number
  service_fee?: number
  escrow_amount?: number
  status: string
  created_at: string
  /** When Shopee reports payment time; used for “paid order” date filters (seller center style). */
  paid_at?: string | null
  // Escrow fields — populated after sync-escrow runs for completed orders
  escrow_synced?: boolean
  escrow_synced_at?: string | null
  commission_fee_actual?: number   // real commission from escrow API
  service_fee_actual?: number      // transaction service fee from escrow API
  ams_commission?: number          // Shopee Ads (AMS) fee per order
  processing_fee?: number          // seller order processing fee
  shopee_shipping_rebate?: number  // shipping subsidy Shopee pays (informational)
  voucher_from_seller?: number     // seller-funded voucher (real cost to seller)
  voucher_from_shopee?: number     // Shopee-funded voucher (informational, not seller cost)
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
