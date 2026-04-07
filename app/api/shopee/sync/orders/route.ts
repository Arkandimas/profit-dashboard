import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import {
  chunkDateRange,
  getOrderList,
  refreshAccessToken,
  type ShopeeOrderSummary,
} from '@/lib/shopee'

// This route only lists orders and upserts stubs — fast, well under 10s.
// Detail enrichment is handled by /sync/details (called in a loop by the UI).
export const maxDuration = 30

const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const COOKIE_OPTS = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 30,
}

/**
 * Maps a getOrderList summary to a minimal DB stub row.
 * revenue=0 signals to /sync/details that this order needs enrichment.
 * ignoreDuplicates: true on upsert ensures already-enriched orders are not overwritten.
 */
function mapSummaryToStub(order: ShopeeOrderSummary) {
  return {
    platform: 'Shopee' as const,
    order_id: order.order_sn,
    status: order.order_status ?? 'UNKNOWN',
    created_at: order.create_time ? new Date(order.create_time * 1000).toISOString() : undefined,
    paid_at: order.pay_time ? new Date(order.pay_time * 1000).toISOString() : undefined,
    gmv: order.total_amount ?? 0,
    revenue: 0,
    buyer_paid_amount: 0,
    voucher_amount: 0,
    shipping_fee: 0,
    platform_fee: 0,
    commission_fee: 0,
    service_fee: 0,
    net_profit: 0,
    escrow_synced: false,
  }
}

function isTokenExpiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return /HTTP 40[13]/.test(err.message) || /invalid_access_token|auth\.token\.expired/.test(err.message)
}

export async function POST(request: Request) {
  try {
    const jar = await cookies()

    let accessToken =
      jar.get('shopee_access_token')?.value ??
      process.env.SHOPEE_ACCESS_TOKEN?.trim() ??
      undefined

    const shopIdStr =
      jar.get('shopee_shop_id')?.value ??
      process.env.SHOPEE_SHOP_ID?.trim() ??
      undefined
    const shopId = shopIdStr ? parseInt(shopIdStr) : 0

    const refreshToken =
      jar.get('shopee_refresh_token')?.value ??
      process.env.SHOPEE_REFRESH_TOKEN?.trim() ??
      undefined

    if (!accessToken || !shopId) {
      return NextResponse.json(
        { error: 'Not connected to Shopee. Please reconnect in Settings.', reconnect_required: true },
        { status: 401 }
      )
    }

    let refreshedAccessToken: string | null = null
    let refreshedRefreshToken: string | null = null

    if (refreshToken) {
      try {
        const newTokens = await refreshAccessToken(refreshToken, shopId)
        accessToken = newTokens.access_token
        refreshedAccessToken = newTokens.access_token
        refreshedRefreshToken = newTokens.refresh_token
      } catch {
        // Non-fatal: continue with current token.
      }
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30'), 1), 90)
    const nowTs = Math.floor(Date.now() / 1000)
    const fromTs = nowTs - days * 86400
    const chunks = chunkDateRange(fromTs, nowTs)

    let synced = 0

    const runSync = async (tkn: string) => {
      synced = 0

      // Collect all order summaries across date chunks.
      // No status filter — syncs all paid orders (READY_TO_SHIP, SHIPPED, COMPLETED)
      // so our counts match Shopee Seller Center "Pesanan Dibayar".
      // UNPAID/CANCELLED/RETURNED are excluded later by the details route.
      const allSummaries: ShopeeOrderSummary[] = []
      for (const chunk of chunks) {
        const summaries = await getOrderList(tkn, shopId, chunk.start, chunk.end)
        allSummaries.push(...summaries)
      }

      if (allSummaries.length === 0) return

      // Upsert stubs in batches of 100.
      // ignoreDuplicates: true — skip existing rows so already-enriched orders
      // (revenue > 0, escrow_synced = true) are never overwritten back to zero.
      const STUB_BATCH = 100
      for (let i = 0; i < allSummaries.length; i += STUB_BATCH) {
        const rows = allSummaries.slice(i, i + STUB_BATCH).map(mapSummaryToStub)
        const { error } = await supabase
          .from('orders')
          .upsert(rows, { onConflict: 'order_id', ignoreDuplicates: true })
        if (error) throw new Error(`Supabase stub upsert failed: ${error.message}`)
      }

      synced = allSummaries.length
    }

    try {
      await runSync(accessToken)
    } catch (err) {
      if (!isTokenExpiredError(err)) throw err

      const latestRefreshToken = refreshedRefreshToken ?? refreshToken
      if (!latestRefreshToken) {
        return NextResponse.json(
          { error: 'Shopee session expired. Please reconnect in Settings.', reconnect_required: true },
          { status: 401 }
        )
      }

      let freshTokens
      try {
        freshTokens = await refreshAccessToken(latestRefreshToken, shopId)
      } catch {
        return NextResponse.json(
          { error: 'Shopee session expired. Please reconnect in Settings.', reconnect_required: true },
          { status: 401 }
        )
      }

      accessToken = freshTokens.access_token
      refreshedAccessToken = freshTokens.access_token
      refreshedRefreshToken = freshTokens.refresh_token

      try {
        await runSync(accessToken)
      } catch {
        return NextResponse.json(
          { error: 'Shopee session expired. Please reconnect in Settings.', reconnect_required: true },
          { status: 401 }
        )
      }
    }

    const res = NextResponse.json({ success: true, synced, days })
    persistTokensIfRefreshed(res, refreshedAccessToken, refreshedRefreshToken)
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function persistTokensIfRefreshed(
  res: NextResponse,
  accessToken: string | null,
  refreshToken: string | null
) {
  if (accessToken) res.cookies.set('shopee_access_token', accessToken, COOKIE_OPTS)
  if (refreshToken) res.cookies.set('shopee_refresh_token', refreshToken, COOKIE_OPTS)
}
