import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import {
  chunkDateRange,
  getOrderList,
  refreshAccessToken,
  type ShopeeOrderSummary,
} from '@/lib/shopee'

export const maxDuration = 60

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

// How many days to look back per call. Split into ≤15-day chunks per Shopee limit.
const RESYNC_DAYS = 90

function safeIsoFromUnixSeconds(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const date = new Date(value * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function mapSummaryToRow(order: ShopeeOrderSummary) {
  const createdAt = safeIsoFromUnixSeconds(order.create_time)
  const paidAt = safeIsoFromUnixSeconds(order.pay_time)

  return {
    platform: 'Shopee' as const,
    order_id: order.order_sn,
    gmv: order.total_amount ?? 0,
    revenue: 0,
    buyer_paid_amount: 0,
    cogs: 0,
    shipping_fee: 0,
    platform_fee: 0,
    commission_fee: 0,
    service_fee: 0,
    net_profit: 0,
    status: order.order_status ?? 'UNKNOWN',
    ...(createdAt ? { created_at: createdAt } : {}),
    ...(paidAt ? { paid_at: paidAt } : {}),
  }
}

function isTokenExpiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return /HTTP 40[13]/.test(err.message) || /invalid_access_token|auth\.token\.expired/.test(err.message)
}

/**
 * POST /api/admin/resync-all
 * Fetches ALL COMPLETED orders from Shopee for the last 90 days and upserts them.
 * Idempotent — safe to call multiple times (upsert by order_id).
 * Returns { synced: N, status: 'COMPLETED' }
 */
export async function POST() {
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
        // Non-fatal.
      }
    }

    const nowTs = Math.floor(Date.now() / 1000)
    const fromTs = nowTs - RESYNC_DAYS * 86400
    const chunks = chunkDateRange(fromTs, nowTs)

    let synced = 0

    const runSync = async (tkn: string) => {
      synced = 0
      for (const chunk of chunks) {
        // Filter to COMPLETED only — the only status with settled escrow data
        const summaries = await getOrderList(tkn, shopId, chunk.start, chunk.end, 'COMPLETED')

        if (summaries.length > 0) {
          const rows = summaries.map(mapSummaryToRow)
          const { error } = await supabase
            .from('orders')
            .upsert(rows, { onConflict: 'order_id', ignoreDuplicates: false })
          if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
          synced += summaries.length
        }
      }
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

    // Count how many still need detail enrichment (revenue=0)
    const { count: remaining } = await supabase
      .from('orders')
      .select('order_id', { count: 'exact', head: true })
      .eq('platform', 'Shopee')
      .eq('revenue', 0)

    const res = NextResponse.json({
      success: true,
      synced,
      remaining: remaining ?? 0,
      status: 'COMPLETED',
      days: RESYNC_DAYS,
    })
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
