import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getEscrowDetail, refreshAccessToken } from '@/lib/shopee'

// 50 orders × (Shopee API call + 200ms delay) ≈ 35s worst case
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

// Escrow API is per-order and rate-limited — add a small delay between calls.
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// Statuses that have settled payment and thus have escrow data available.
const ESCROW_ELIGIBLE_STATUSES = ['completed', 'to_confirm_receive']

export async function POST() {
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

    // ── Auto-refresh token ────────────────────────────────────────────────────
    let refreshedAccessToken: string | null = null
    let refreshedRefreshToken: string | null = null
    if (refreshToken) {
      try {
        const newTokens = await refreshAccessToken(refreshToken, shopId)
        accessToken = newTokens.access_token
        refreshedAccessToken = newTokens.access_token
        refreshedRefreshToken = newTokens.refresh_token
      } catch {
        // INTENTIONAL: non-fatal, continue with existing token
      }
    }

    // ── Query orders needing escrow sync ─────────────────────────────────────
    const { data: orders, error: queryError } = await supabase
      .from('orders')
      .select('id, order_id, revenue, cogs')
      .eq('platform', 'Shopee')
      .in('status', ESCROW_ELIGIBLE_STATUSES)
      .or('escrow_synced.eq.false,escrow_synced.is.null')
      .limit(50)

    if (queryError) {
      return NextResponse.json(
        { error: `DB query failed: ${queryError.message}` },
        { status: 500 }
      )
    }

    if (!orders || orders.length === 0) {
      const res = NextResponse.json({
        synced_escrow: 0,
        skipped: 0,
        message: 'All eligible orders already have escrow data',
      })
      persistTokensIfRefreshed(res, refreshedAccessToken, refreshedRefreshToken)
      return res
    }

    let synced = 0
    let skipped = 0
    const failures: Array<{ order_id: string; error: string }> = []

    for (const order of orders) {
      try {
        const escrow = await getEscrowDetail(order.order_id, accessToken, shopId)
        const inc = escrow.order_income ?? {}

        const commission_fee_actual = Number(inc.commission_fee ?? 0)
        const service_fee_actual    = Number(inc.service_fee ?? 0)
        const ams_commission        = Number(inc.order_ams_commission_fee ?? 0)
        const processing_fee        = Number(inc.seller_order_processing_fee ?? 0)
        const shopee_shipping_rebate = Number(inc.shopee_shipping_rebate ?? 0)
        const voucher_from_seller   = Number(inc.voucher_from_seller ?? 0)
        const voucher_from_shopee   = Number(inc.voucher_from_shopee ?? 0)
        const escrow_amount         = Number(inc.escrow_amount ?? 0)

        // Net profit per escrow formula:
        // revenue - cogs - commission - service fee - AMS - processing fee - seller voucher
        // Note: shipping excluded because shopee_shipping_rebate == actual_shipping_fee in most cases
        const net_profit =
          order.revenue
          - order.cogs
          - commission_fee_actual
          - service_fee_actual
          - ams_commission
          - processing_fee
          - voucher_from_seller

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            escrow_amount,
            commission_fee_actual,
            service_fee_actual,
            ams_commission,
            processing_fee,
            shopee_shipping_rebate,
            voucher_from_seller,
            voucher_from_shopee,
            net_profit,
            escrow_synced: true,
            escrow_synced_at: new Date().toISOString(),
          })
          .eq('order_id', order.order_id)

        if (updateError) {
          console.warn(`[sync-escrow] DB update failed for ${order.order_id}: ${updateError.message}`)
          failures.push({ order_id: order.order_id, error: updateError.message })
          skipped++
        } else {
          synced++
        }
      } catch (err) {
        // Per-order failure: skip this order and continue the batch.
        // Common reasons: order not yet settled, API rate limit, invalid order SN.
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.warn(`[sync-escrow] Skipped ${order.order_id}: ${msg}`)
        failures.push({ order_id: order.order_id, error: msg })
        skipped++
      }

      // 200ms delay to stay within Shopee API rate limits
      await sleep(200)
    }

    const res = NextResponse.json({
      synced_escrow: synced,
      skipped,
      total: orders.length,
      ...(failures.length > 0 && { failures }),
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
