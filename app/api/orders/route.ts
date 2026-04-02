import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ALL_FIELDS = [
  'id', 'platform', 'order_id',
  // Core financials (legacy denormalised columns kept for dummy-data compat)
  'revenue', 'cogs', 'shipping_fee', 'platform_fee', 'net_profit',
  // Extended Shopee fields
  'total_amount', 'buyer_paid_amount', 'actual_shipping_fee',
  'commission_fee', 'service_fee',
  'seller_discount', 'voucher_from_seller', 'voucher_from_shopee',
  'payment_method', 'item_list',
  // Metadata
  'status', 'created_at', 'paid_at',
].join(', ')

/** Statuses that should never count toward revenue / profit KPIs. */
const EXCLUDED_STATUSES = ['unpaid', 'in_cancel', 'cancelled', 'canceled', 'returned', 'refunded']

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '90'), 1), 90)
  const platform = searchParams.get('platform')            // optional platform filter
  const excludeCancelled = searchParams.get('exclude_cancelled') === 'true'

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days)
  const fromIso = fromDate.toISOString()

  // Include rows that might fall into the dashboard window on paid_at even if create_time is older.
  let query = supabase
    .from('orders')
    .select(ALL_FIELDS)
    // Quote ISO timestamps so PostgREST parses colons in values correctly.
    .or(`created_at.gte."${fromIso}",paid_at.gte."${fromIso}"`)
    .order('paid_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (platform && platform !== 'All') {
    query = query.eq('platform', platform)
  }

  if (excludeCancelled) {
    query = query.not('status', 'in', `(${EXCLUDED_STATUSES.join(',')})`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
