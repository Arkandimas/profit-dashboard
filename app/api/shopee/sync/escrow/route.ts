import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getEscrowDetail, refreshAccessToken } from '@/lib/shopee'

// Vercel Hobby: max 10s per call.
export const maxDuration = 10

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

// Uppercase: matches how Shopee returns status (COMPLETED, TO_CONFIRM_RECEIVE)
const ESCROW_ELIGIBLE_STATUSES = ['COMPLETED', 'TO_CONFIRM_RECEIVE']

// 3 orders per call — sequential with ~150ms delay = ~3 × 2s = ~6s + DB overhead = ~8s total
// Must stay within Vercel Hobby 10s limit.
const BATCH_SIZE = 3

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

    // ── Fetch a batch of orders that still need escrow data ───────────────────
    const { data: orders, error: queryError } = await supabase
      .from('orders')
      .select('id, order_id, revenue, cogs')
      .eq('platform', 'Shopee')
      .in('status', ESCROW_ELIGIBLE_STATUSES)
      .or('escrow_synced.eq.false,escrow_synced.is.null')
      .limit(BATCH_SIZE)

    if (queryError) {
      return NextResponse.json({ error: `DB query failed: ${queryError.message}` }, { status: 500 })
    }

    if (!orders || orders.length === 0) {
      const res = NextResponse.json({ synced: 0, remaining: 0, done: true })
      persistTokensIfRefreshed(res, refreshedAccessToken, refreshedRefreshToken)
      return res
    }

    // ── Fetch escrow and update DB sequentially with 150ms delay ─────────────
    // Sequential to avoid concurrent timeout failures from Shopee rate limits.
    let synced = 0
    for (const order of orders) {
      let escrow = null
      try {
        escrow = await getEscrowDetail(order.order_id, accessToken!, shopId, 6_000)
      } catch {
        // Per-order failure: skip and continue
        await new Promise<void>((r) => setTimeout(r, 150))
        continue
      }

      const inc = escrow.order_income ?? {}
      const commission_fee_actual  = Number(inc.commission_fee ?? 0)
      const service_fee_actual     = Number(inc.service_fee ?? 0)
      const ams_commission         = Number(inc.order_ams_commission_fee ?? 0)
      const processing_fee         = Number(inc.seller_order_processing_fee ?? 0)
      const shopee_shipping_rebate = Number(inc.shopee_shipping_rebate ?? 0)
      const voucher_from_seller    = Number(inc.voucher_from_seller ?? 0)
      const voucher_from_shopee    = Number(inc.voucher_from_shopee ?? 0)
      const escrow_amount          = Number(inc.escrow_amount ?? 0)
      const buyer_paid_amount      = Number(inc.buyer_paid_amount ?? 0)
      const voucher_amount         = voucher_from_seller + voucher_from_shopee

      const net_profit = escrow_amount - (order.cogs ?? 0)

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          buyer_paid_amount,
          voucher_amount,
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

      if (!updateError) synced++
      await new Promise<void>((r) => setTimeout(r, 150))
    }

    // Count how many eligible orders still need escrow
    const { count: remaining } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('platform', 'Shopee')
      .in('status', ESCROW_ELIGIBLE_STATUSES)
      .or('escrow_synced.eq.false,escrow_synced.is.null')

    const done = (remaining ?? 0) === 0

    const res = NextResponse.json({ synced, remaining: remaining ?? 0, done })
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
