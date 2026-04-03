import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { chunkDateRange, getOrderList, getOrderDetail, refreshAccessToken } from '@/lib/shopee'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const COOKIE_OPTS = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

export async function POST(request: Request) {
  try {
    const jar = await cookies()
    let accessToken = jar.get('shopee_access_token')?.value
    const shopIdStr = jar.get('shopee_shop_id')?.value
    const shopId = shopIdStr ? parseInt(shopIdStr) : 0
    const refreshToken = jar.get('shopee_refresh_token')?.value

    if (!accessToken || !shopId) {
      return NextResponse.json(
        { error: 'Not connected to Shopee. Please connect in Settings.' },
        { status: 401 }
      )
    }

    // ── Step 0: Auto-refresh access token before sync ────────────────────────
    // Shopee tokens expire in ~4 hours. Silently refresh before every sync so
    // we never hit HTTP 401/410 mid-sync due to an expired token.
    let refreshedAccessToken: string | null = null
    let refreshedRefreshToken: string | null = null

    if (refreshToken) {
      try {
        const newTokens = await refreshAccessToken(refreshToken, shopId)
        accessToken = newTokens.access_token
        refreshedAccessToken = newTokens.access_token
        refreshedRefreshToken = newTokens.refresh_token
      } catch (refreshErr) {
        // Non-fatal: continue with the current token and let the sync itself
        // fail with a clear message if the token really is expired.
        console.warn('[sync] Token refresh failed (will try existing token):', refreshErr)
      }
    }

    // Parse ?days= query param (default 90, max 90)
    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '90'), 1), 90)

    const nowTs = Math.floor(Date.now() / 1000)
    const fromTs = nowTs - days * 86400

    // Split into ≤15-day chunks (Shopee API limit)
    const chunks = chunkDateRange(fromTs, nowTs)

    // ── Step 1: Fetch order SNs across all time chunks ───────────────────────
    const seenSns = new Set<string>()
    for (const chunk of chunks) {
      const summaries = await getOrderList(accessToken, shopId, chunk.start, chunk.end)
      for (const o of summaries) seenSns.add(o.order_sn)
    }

    if (seenSns.size === 0) {
      const res = NextResponse.json({ synced: 0, chunks: chunks.length, days })
      persistTokensIfRefreshed(res, refreshedAccessToken, refreshedRefreshToken)
      return res
    }

    const orderSnList = Array.from(seenSns)

    // ── Step 2: Fetch order details in batches of 50 (Shopee limit) ──────────
    const BATCH_SIZE = 50
    const details = []
    for (let i = 0; i < orderSnList.length; i += BATCH_SIZE) {
      const batch = orderSnList.slice(i, i + BATCH_SIZE)
      const batchDetails = await getOrderDetail(batch, accessToken, shopId)
      details.push(...batchDetails)
    }

    // ── Step 3: Map to DB rows ────────────────────────────────────────────────
    const rows = details.map((order) => {
      // ── Revenue = Shopee "Penjualan" (Article 26796) ────────────────────────
      // "Penjualan" = product price AFTER seller discount, EXCLUDING:
      //   • buyer-paid shipping fee
      //   • Shopee voucher subsidies
      //   • any other buyer fees
      //
      // This equals: sum of (model_discounted_price × model_quantity_purchased)
      // across all items in the order.
      //
      // We do NOT use `total_amount` because that is the gross amount paid by
      // the buyer which includes shipping and may include Shopee subsidies.
      const itemRevenue = Array.isArray(order.item_list) && order.item_list.length > 0
        ? order.item_list.reduce((sum: number, item: { model_discounted_price: number; model_original_price: number; model_quantity_purchased: number }) => {
            const price = item.model_discounted_price ?? item.model_original_price ?? 0
            const qty   = item.model_quantity_purchased ?? 1
            return sum + price * qty
          }, 0)
        : null

      // Fallback: if item_list is missing in the API response, use total_amount.
      // This should be rare since we request items as an optional field.
      const revenue = itemRevenue !== null ? itemRevenue : (order.total_amount ?? 0)

      const cogs = 0 // user sets COGS per product manually
      const shipping_fee = order.actual_shipping_fee ?? 0
      const platform_fee = order.commission_fee ?? 0
      const net_profit = revenue - cogs - shipping_fee - platform_fee
      const payTime = order.pay_time && order.pay_time > 0 ? order.pay_time : null
      return {
        platform: 'Shopee' as const,
        order_id: order.order_sn,
        revenue,
        cogs,
        shipping_fee,
        platform_fee,
        net_profit,
        status: order.order_status?.toLowerCase() ?? 'unknown',
        created_at: new Date(order.create_time * 1000).toISOString(),
        // paid_at is the key field used by the dashboard to bucket orders into
        // the correct "paid day" — matching Shopee Seller Center's logic.
        paid_at: payTime ? new Date(payTime * 1000).toISOString() : null,
      }
    })

    // ── Step 4: Upsert into Supabase ──────────────────────────────────────────
    const { error } = await supabase.from('orders').upsert(rows, { onConflict: 'order_id' })
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`)

    const resPayload = NextResponse.json({ synced: rows.length, chunks: chunks.length, days })
    persistTokensIfRefreshed(resPayload, refreshedAccessToken, refreshedRefreshToken)
    return resPayload
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Attach refreshed Shopee cookies to the response so the browser stays logged in. */
function persistTokensIfRefreshed(
  res: NextResponse,
  accessToken: string | null,
  refreshToken: string | null
) {
  if (accessToken) res.cookies.set('shopee_access_token', accessToken, COOKIE_OPTS)
  if (refreshToken) res.cookies.set('shopee_refresh_token', refreshToken, COOKIE_OPTS)
}
