import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import {
  chunkDateRange,
  getOrderList,
  getOrderDetail,
  refreshAccessToken,
  type ShopeeOrderDetail,
} from '@/lib/shopee'

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

// Shopee getOrderDetail accepts up to 50 order_sn per call.
const DETAIL_BATCH = 50

/**
 * Maps a getOrderDetail response to a DB upsert row.
 *
 * Field mapping per official Shopee API docs:
 *   order_sn              → order_id
 *   order_status          → status
 *   create_time           → created_at
 *   pay_time              → paid_at
 *   total_amount          → gmv
 *   buyer_total_amount    → buyer_paid_amount + revenue
 *   voucher_from_seller   → voucher_from_seller
 *   voucher_from_shopee   → voucher_from_shopee
 *   estimated_shipping_fee → shipping_fee
 */
function mapDetailToRow(order: ShopeeOrderDetail) {
  const buyerPaid = order.buyer_total_amount ?? 0
  const voucherSeller = order.voucher_from_seller ?? 0
  const voucherShopee = order.voucher_from_shopee ?? 0

  return {
    platform: 'Shopee' as const,
    order_id: order.order_sn,
    status: order.order_status ?? 'UNKNOWN',
    created_at: order.create_time ? new Date(order.create_time * 1000).toISOString() : undefined,
    paid_at: order.pay_time ? new Date(order.pay_time * 1000).toISOString() : undefined,
    gmv: order.total_amount ?? 0,
    buyer_paid_amount: buyerPaid,
    revenue: buyerPaid,
    voucher_from_seller: voucherSeller,
    voucher_from_shopee: voucherShopee,
    voucher_amount: voucherSeller + voucherShopee,
    shipping_fee: order.estimated_shipping_fee ?? 0,
    cogs: 0,
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

      // ── Step 1: getOrderList — collect all order_sn (COMPLETED, no optional fields) ──
      const allOrderSns: string[] = []
      for (const chunk of chunks) {
        const summaries = await getOrderList(tkn, shopId, chunk.start, chunk.end, 'COMPLETED')
        for (const s of summaries) allOrderSns.push(s.order_sn)
      }

      // ── Step 2: getOrderDetail — batch 50 SNs, upsert full rows ──────────────
      for (let i = 0; i < allOrderSns.length; i += DETAIL_BATCH) {
        const batch = allOrderSns.slice(i, i + DETAIL_BATCH)
        const details = await getOrderDetail(batch, tkn, shopId)
        if (details.length > 0) {
          const rows = details.map(mapDetailToRow)
          const { error } = await supabase
            .from('orders')
            .upsert(rows, { onConflict: 'order_id', ignoreDuplicates: false })
          if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
          synced += details.length
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
