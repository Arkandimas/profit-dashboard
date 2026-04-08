import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Only exclude UNPAID at the DB level — cancelled/returned orders are sent to
// the client so the dashboard can compute Penjualan (Shopee definition) and
// show cancelled order counts. The client filters by status for each KPI.
const EXCLUDED_STATUSES = ['UNPAID']

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // Fetch a generous window (100 days) so that orders with paid_at slightly
  // outside the 90-day create_time window are still included.
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '90'), 1), 100)
  const platform = searchParams.get('platform') // optional filter

  // Subtract an extra day (Jakarta offset buffer) so we never miss midnight-
  // boundary orders when the Vercel server runs in UTC.
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days - 1)
  const fromIso = fromDate.toISOString()

  let query = supabase
    .from('orders')
    .select('id, platform, order_id, gmv, buyer_paid_amount, voucher_amount, revenue, cogs, shipping_fee, platform_fee, commission_fee, service_fee, escrow_amount, status, created_at, paid_at, escrow_synced, commission_fee_actual, service_fee_actual, ams_commission, processing_fee, shopee_shipping_rebate, voucher_from_seller, voucher_from_shopee')
    // Fetch rows whose created_at OR paid_at falls within the window.
    // The precise day-level filtering (Yesterday / Last 7 Days etc.) is done
    // client-side in Asia/Jakarta timezone by filterOrdersByReportDate().
    .or(`created_at.gte."${fromIso}",paid_at.gte."${fromIso}"`)
    // Pre-filter out statuses that can never count as revenue (reduces payload).
    .not('status', 'in', `(${EXCLUDED_STATUSES.join(',')})`)
    .order('created_at', { ascending: false })
    .range(0, 9999)

  if (platform && platform !== 'All') {
    query = query.eq('platform', platform)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
