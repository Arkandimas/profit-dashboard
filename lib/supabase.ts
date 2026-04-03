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
  revenue: number
  cogs: number
  shipping_fee: number
  platform_fee: number
  status: string
  created_at: string
  /** When Shopee reports payment time; used for “paid order” date filters (seller center style). */
  paid_at?: string | null
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
