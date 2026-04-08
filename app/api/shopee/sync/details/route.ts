import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import {
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

// Orders processed per call. 10 order_sn per getOrderDetail call × N calls.
const BATCH_SIZE = 50

// Only exclude UNPAID — cancelled/returned orders also need detail enrichment
// so their gmv, voucher_from_seller, etc. are populated for Penjualan KPI.
const EXCLUDED_STATUSES = ['UNPAID']

function safeIsoFromUnixSeconds(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const date = new Date(value * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Maps a getOrderDetail response to a DB upsert row.
 * Stores Shopee fields EXACTLY as returned — no derivation or estimation.
 *
 * Field mapping:
 *   total_amount          → gmv           (item total before buyer vouchers)
 *   buyer_total_amount    → buyer_paid_amount + revenue  (what buyer actually paid)
 *   voucher_from_seller   → voucher_from_seller
 *   voucher_from_shopee   → voucher_from_shopee
 *   estimated_shipping_fee ?? actual_shipping_fee → shipping_fee
 *   pay_time              → paid_at
 *   order_status          → status (raw UPPERCASE)
 */
function mapDetailToRow(order: ShopeeOrderDetail) {
  const gmv = order.total_amount ?? 0
  const buyerPaid = order.buyer_total_amount ?? 0
  const shippingFee = order.estimated_shipping_fee ?? order.actual_shipping_fee ?? 0
  const voucherSeller = order.voucher_from_seller ?? 0
  const voucherShopee = order.voucher_from_shopee ?? 0
  const paidAt = safeIsoFromUnixSeconds(order.pay_time)
  const createdAt = safeIsoFromUnixSeconds(order.create_time)

  return {
    platform: 'Shopee' as const,
    order_id: order.order_sn,
    gmv,
    // revenue = buyer_paid_amount: what buyer actually paid after all discounts
    revenue: buyerPaid,
    buyer_paid_amount: buyerPaid,
    voucher_from_seller: voucherSeller,
    voucher_from_shopee: voucherShopee,
    voucher_amount: voucherSeller + voucherShopee,
    shipping_fee: shippingFee,
    // platform_fee/commission_fee/service_fee stay 0 until escrow sync provides actuals
    platform_fee: 0,
    commission_fee: 0,
    service_fee: 0,
    status: order.order_status ?? 'UNKNOWN',
    details_synced: true,
    ...(createdAt ? { created_at: createdAt } : {}),
    ...(paidAt ? { paid_at: paidAt } : {}),
  }
}

/** True if the Shopee error indicates an expired or invalid access token. */
function isTokenExpiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return /HTTP 40[13]/.test(err.message) || /invalid_access_token|auth\.token\.expired/.test(err.message)
}

export async function POST(request: Request) {
  try {
    const jar = await cookies()

    // ── Token resolution: cookies first, env vars as fallback ────────────────
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

    // ── Proactive token refresh ───────────────────────────────────────────────
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

    // ── Find orders needing detail enrichment ─────────────────────────────────
    // Use details_synced flag instead of revenue=0 to avoid infinite loop when
    // buyer_total_amount is legitimately 0 or null.
    const { data: pendingOrders, error: queryError } = await supabase
      .from('orders')
      .select('order_id')
      .eq('platform', 'Shopee')
      .eq('details_synced', false)
      .not('status', 'in', `(${EXCLUDED_STATUSES.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(BATCH_SIZE)

    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500 })
    }

    const orderSns = (pendingOrders ?? []).map((r) => r.order_id as string)

    if (orderSns.length === 0) {
      const res = NextResponse.json({ success: true, updated: 0, remaining: 0, done: true })
      persistTokensIfRefreshed(res, refreshedAccessToken, refreshedRefreshToken)
      return res
    }

    // ── Fetch details in sub-batches of 10 (Shopee API limit) ─────────────────
    const SHOPEE_BATCH = 10
    let updatedCount = 0

    const fetchAndUpsert = async (tkn: string) => {
      updatedCount = 0
      for (let i = 0; i < orderSns.length; i += SHOPEE_BATCH) {
        const batch = orderSns.slice(i, i + SHOPEE_BATCH)
        let details: ShopeeOrderDetail[]
        try {
          details = await getOrderDetail(batch, tkn, shopId)
        } catch (err) {
          // Propagate auth errors so the outer handler can retry with a fresh token.
          // Swallow all other per-batch failures (e.g. stale/invalid order_sn).
          if (isTokenExpiredError(err)) throw err
          continue
        }
        if (details.length > 0) {
          const rows = details.map(mapDetailToRow)
          const { error } = await supabase
            .from('orders')
            .upsert(rows, { onConflict: 'order_id', ignoreDuplicates: false })
          if (error) throw new Error(`Supabase detail upsert failed: ${error.message}`)
          updatedCount += details.length
        }
      }
    }

    try {
      await fetchAndUpsert(accessToken)
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
        await fetchAndUpsert(accessToken)
      } catch {
        return NextResponse.json(
          { error: 'Shopee session expired. Please reconnect in Settings.', reconnect_required: true },
          { status: 401 }
        )
      }
    }

    // ── Check how many still need details ─────────────────────────────────────
    const { count: remaining } = await supabase
      .from('orders')
      .select('order_id', { count: 'exact', head: true })
      .eq('platform', 'Shopee')
      .eq('details_synced', false)
      .not('status', 'in', `(${EXCLUDED_STATUSES.join(',')})`)

    const res = NextResponse.json({
      success: true,
      updated: updatedCount,
      remaining: remaining ?? 0,
      done: (remaining ?? 0) === 0,
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
