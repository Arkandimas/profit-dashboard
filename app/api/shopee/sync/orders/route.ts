import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { chunkDateRange, getOrderList, getOrderDetail, refreshAccessToken, type ShopeeOrderDetail, type ShopeeOrderSummary } from '@/lib/shopee'

// Pro plan: up to 60s. Hobby plan: capped at 10s regardless.
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

const ESTIMATED_COMMISSION_RATE = 0.03

function safeIsoFromUnixSeconds(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const date = new Date(value * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function mapSummaryToRow(order: ShopeeOrderSummary) {
  const revenue = Number(order.total_amount ?? 0)
  const commission_fee = Math.round(revenue * ESTIMATED_COMMISSION_RATE)
  const createdAt = safeIsoFromUnixSeconds(order.create_time)

  return {
    platform: 'Shopee' as const,
    order_id: order.order_sn,
    gmv: revenue,
    revenue,
    cogs: 0,
    shipping_fee: 0,
    platform_fee: commission_fee,
    commission_fee,
    service_fee: 0,
    net_profit: revenue - commission_fee,
    status: order.order_status?.toLowerCase() ?? 'unknown',
    ...(createdAt ? { created_at: createdAt } : {}),
  }
}

function mapDetailToRow(order: ShopeeOrderDetail) {
  const items = Array.isArray(order.item_list) ? order.item_list : []
  const gmv = items.reduce((sum, item) => {
    const price = item.model_original_price || item.model_discounted_price || 0
    return sum + price * (item.model_quantity_purchased || 1)
  }, 0)
  const itemRevenue = items.reduce((sum, item) => {
    const price = item.model_discounted_price ?? item.model_original_price ?? 0
    return sum + price * (item.model_quantity_purchased ?? 1)
  }, 0)
  const revenue = itemRevenue || order.total_amount || 0
  const shipping_fee = order.actual_shipping_fee ?? 0
  const commission_fee = Math.round(revenue * ESTIMATED_COMMISSION_RATE)
  const platform_fee = commission_fee
  const net_profit = revenue - shipping_fee - platform_fee
  const createdAt = safeIsoFromUnixSeconds(order.create_time)
  const paidAt = safeIsoFromUnixSeconds(order.pay_time)

  return {
    platform: 'Shopee' as const,
    order_id: order.order_sn,
    gmv,
    revenue,
    cogs: 0,
    shipping_fee,
    platform_fee,
    commission_fee,
    service_fee: 0,
    net_profit,
    status: order.order_status?.toLowerCase() ?? 'unknown',
    ...(createdAt ? { created_at: createdAt } : {}),
    ...(paidAt ? { paid_at: paidAt } : {}),
  }
}

export async function POST(request: Request) {
  const start = Date.now()
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

    let refreshedAccessToken: string | null = null
    let refreshedRefreshToken: string | null = null

    if (refreshToken) {
      try {
        const newTokens = await refreshAccessToken(refreshToken, shopId)
        accessToken = newTokens.access_token
        refreshedAccessToken = newTokens.access_token
        refreshedRefreshToken = newTokens.refresh_token
      } catch {
        // non-fatal: continue with existing token
      }
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '90'), 1), 90)
    const nowTs = Math.floor(Date.now() / 1000)
    const fromTs = nowTs - days * 86400
    const chunks = chunkDateRange(fromTs, nowTs)

    // ── Step 1: Collect all order SNs and persist summary rows immediately ───
    // This guarantees the dashboard changes even if we hit Hobby's hard timeout
    // before the slower detail-fetch phase completes.
    const summariesBySn = new Map<string, ShopeeOrderSummary>()
    for (const chunk of chunks) {
      const summaries = await getOrderList(accessToken, shopId, chunk.start, chunk.end)
      for (const summary of summaries) summariesBySn.set(summary.order_sn, summary)

      if (summaries.length > 0) {
        const summaryRows = summaries.map(mapSummaryToRow)
        const { error } = await supabase.from('orders').upsert(summaryRows, { onConflict: 'order_id' })
        if (error) throw new Error(`Supabase summary upsert failed: ${error.message}`)
      }
    }

    if (summariesBySn.size === 0) {
      const res = NextResponse.json({ synced: 0, total_fetched: 0, days })
      persistTokensIfRefreshed(res, refreshedAccessToken, refreshedRefreshToken)
      return res
    }

    // ── Step 2: Fetch order details — abort at 8s to return partial results ──
    // Keeps us inside Hobby's 10s hard limit. On Pro the full 60s is available.
    const BATCH_SIZE = 50
    const DEADLINE_MS = 8_000
    const orderSnList = Array.from(summariesBySn.keys())
    let detailedCount = 0

    for (let i = 0; i < orderSnList.length; i += BATCH_SIZE) {
      if (Date.now() - start > DEADLINE_MS) {
        break
      }
      const batch = orderSnList.slice(i, i + BATCH_SIZE)
      const batchDetails = await getOrderDetail(batch, accessToken, shopId)
      if (batchDetails.length > 0) {
        const detailRows = batchDetails.map(mapDetailToRow)
        const { error } = await supabase.from('orders').upsert(detailRows, { onConflict: 'order_id' })
        if (error) throw new Error(`Supabase detail upsert failed: ${error.message}`)
        detailedCount += batchDetails.length
      }
    }

    const res = NextResponse.json({ synced: summariesBySn.size, detailed: detailedCount, total_fetched: summariesBySn.size, days })
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
