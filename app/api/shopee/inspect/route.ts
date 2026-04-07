import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getOrderDetail } from '@/lib/shopee'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * GET /api/shopee/inspect?order_sn=XXXX
 *
 * Debug endpoint: fetches raw Shopee API data for a specific order AND shows
 * what is currently stored in our Supabase DB for the same order.
 *
 * Use this to verify that:
 *  - item_list is being returned by the API
 *  - model_discounted_price × qty matches stored revenue
 *  - paid_at matches Shopee's pay_time
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const orderSn = searchParams.get('order_sn')

  if (!orderSn) {
    return NextResponse.json(
      { error: 'Pass ?order_sn=YOUR_ORDER_SN to inspect a specific order.' },
      { status: 400 }
    )
  }

  const jar = await cookies()
  const accessToken = jar.get('shopee_access_token')?.value
  const shopIdStr = jar.get('shopee_shop_id')?.value
  const shopId = shopIdStr ? parseInt(shopIdStr) : 0

  if (!accessToken || !shopId) {
    return NextResponse.json(
      { error: 'Not connected to Shopee. Connect in Settings first.' },
      { status: 401 }
    )
  }

  // --- 1. Fetch raw Shopee API data for this order ---------------------
  let shopeeRaw = null
  let shopeeError = null
  try {
    const details = await getOrderDetail([orderSn], accessToken, shopId)
    shopeeRaw = details[0] ?? null
  } catch (err) {
    shopeeError = err instanceof Error ? err.message : String(err)
  }

  // --- 2. Fetch stored DB row ----------------------------------------
  const { data: dbRow, error: dbError } = await supabase
    .from('orders')
    .select('*')
    .eq('order_id', orderSn)
    .single()

  // --- 3. Compute derived values for comparison ----------------------
  let computed = null
  if (shopeeRaw) {
    const itemList = shopeeRaw.item_list ?? []
    const itemRevenue = itemList.reduce(
      (sum: number, item: { model_discounted_price: number; model_original_price: number; model_quantity_purchased: number }) =>
        sum + (item.model_discounted_price ?? item.model_original_price ?? 0) * (item.model_quantity_purchased ?? 1),
      0
    )
    computed = {
      item_list_length: itemList.length,
      item_revenue_sum: itemRevenue,           // = Shopee "Penjualan" per Article 26796
      total_amount: shopeeRaw.total_amount,    // gross buyer payment (incl. shipping)
      actual_shipping_fee: shopeeRaw.actual_shipping_fee,
      commission_fee: shopeeRaw.commission_fee,
      pay_time_unix: shopeeRaw.pay_time,
      pay_time_wib: shopeeRaw.pay_time
        ? new Date(shopeeRaw.pay_time * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        : null,
      item_details: itemList.map((item: { item_name?: string; model_discounted_price: number; model_original_price: number; model_quantity_purchased: number }) => ({
        name: item.item_name,
        model_discounted_price: item.model_discounted_price,
        model_original_price: item.model_original_price,
        qty: item.model_quantity_purchased,
        line_total: (item.model_discounted_price ?? item.model_original_price ?? 0) * (item.model_quantity_purchased ?? 1),
      })),
    }
  }

  return NextResponse.json({
    order_sn: orderSn,
    shopee_api: {
      raw: shopeeRaw,
      computed,
      error: shopeeError,
    },
    supabase_db: {
      row: dbRow ?? null,
      error: dbError?.message ?? null,
    },
    comparison: computed && dbRow ? {
      revenue_in_db: dbRow.revenue,
      item_list_sum: computed.item_revenue_sum,
      total_amount: computed.total_amount,
      revenue_matches_item_list: Math.abs(dbRow.revenue - computed.item_revenue_sum) < 1,
      revenue_matches_total_amount: computed.total_amount != null ? Math.abs(dbRow.revenue - computed.total_amount) < 1 : null,
      paid_at_in_db: dbRow.paid_at,
      paid_at_from_api_wib: computed.pay_time_wib,
    } : null,
  })
}
