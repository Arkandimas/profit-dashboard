import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { chunkDateRange, getOrderList, getOrderDetail, getEscrowDetail, refreshAccessToken, type ShopeeOrderDetail } from '@/lib/shopee'

// Pro plan: up to 60s. Hobby plan: capped at 10s regardless.
export const maxDuration = 60

const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const HAS_SUPABASE_SERVICE_ROLE = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

// ── Commission fee estimation ─────────────────────────────────────────────────
// Shopee escrow API sometimes returns commission_fee = 0 before settlement.
// Set USE_ESTIMATED_COMMISSION = true to use a flat-rate estimate instead.
const USE_ESTIMATED_COMMISSION = true
const ESTIMATED_COMMISSION_RATE = 0.03  // 3% — Health & Beauty category, Shopee ID

function resolveCommissionFee(apiValue: number, revenue: number): number {
  if (USE_ESTIMATED_COMMISSION) return Math.round(revenue * ESTIMATED_COMMISSION_RATE)
  return apiValue ?? 0
}

const COOKIE_OPTS = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

function safeIsoFromUnixSeconds(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const date = new Date(value * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function POST(request: Request) {
  const syncStart = Date.now()
  let stage = 'init'
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
        stage = 'refreshAccessToken'
        const newTokens = await refreshAccessToken(refreshToken, shopId)
        accessToken = newTokens.access_token
        refreshedAccessToken = newTokens.access_token
        refreshedRefreshToken = newTokens.refresh_token
      } catch (refreshErr) {
        // INTENTIONAL: refresh failure is non-fatal. We continue with existing token.
        // If the existing token is also expired, the subsequent Shopee API calls will
        // fail with a clear error. We do NOT return 500 here by design.
        // See: testsprite-mcp-test-report.md TC006 analysis.
        console.warn('[sync] Token refresh failed (will try existing token):', refreshErr)
      }
    }

    // Always use the latest token value for downstream Shopee API calls.
    // Declared as let so the reactive-refresh block below can update it too.
    let currentToken = accessToken

    // Parse ?days= query param (default 90, max 90)
    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '90'), 1), 90)

    const nowTs = Math.floor(Date.now() / 1000)
    const fromTs = nowTs - days * 86400

    // Split into ≤15-day chunks (Shopee API limit)
    const chunks = chunkDateRange(fromTs, nowTs)

    // ── Step 1: Fetch order SNs across all time chunks ───────────────────────
    // On 403/401, attempt one reactive refresh then retry. This covers the case
    // where the proactive refresh above silently failed (e.g. Shopee rate-limited
    // the refresh endpoint) but the access token is also expired.
    stage = 'getOrderList'
    const seenSns = new Set<string>()
    const fetchChunks = async (tkn: string) => {
      for (const chunk of chunks) {
        const summaries = await getOrderList(tkn, shopId, chunk.start, chunk.end)
        for (const o of summaries) seenSns.add(o.order_sn)
      }
    }
    try {
      await fetchChunks(currentToken)
    } catch (err) {
      if (!isTokenExpiredError(err)) throw err
      // Token expired mid-sync — reactive refresh
      const latestRefreshToken = refreshedRefreshToken ?? refreshToken
      if (!latestRefreshToken) {
        return NextResponse.json(
          { error: 'Shopee token expired and no refresh token available. Please reconnect in Settings.', stage: 'getOrderList' },
          { status: 401 }
        )
      }
      stage = 'reactiveTokenRefresh'
      try {
        const newTokens = await refreshAccessToken(latestRefreshToken, shopId)
        // Update all token references so steps 2+ use the fresh token
        accessToken = newTokens.access_token
        currentToken = newTokens.access_token
        refreshedAccessToken = newTokens.access_token
        refreshedRefreshToken = newTokens.refresh_token
      } catch {
        return NextResponse.json(
          { error: 'Shopee access token expired. Please reconnect Shopee in Settings.', stage: 'tokenRefresh' },
          { status: 401 }
        )
      }
      // Retry once with fresh token
      stage = 'getOrderList'
      try {
        await fetchChunks(currentToken)
      } catch {
        return NextResponse.json(
          { error: 'Shopee access token expired. Please reconnect Shopee in Settings.', stage: 'getOrderList' },
          { status: 401 }
        )
      }
    }

    if (seenSns.size === 0) {
      const res = NextResponse.json({ synced: 0, chunks: chunks.length, days })
      persistTokensIfRefreshed(res, refreshedAccessToken, refreshedRefreshToken)
      return res
    }

    const orderSnList = Array.from(seenSns)

    // ── Step 2: Fetch order details in batches of 50 (Shopee limit) ──────────
    stage = 'getOrderDetail'
    const BATCH_SIZE = 50
    const details: ShopeeOrderDetail[] = []
    for (let i = 0; i < orderSnList.length; i += BATCH_SIZE) {
      const batch = orderSnList.slice(i, i + BATCH_SIZE)
      const batchDetails = await getOrderDetail(batch, currentToken, shopId)
      details.push(...batchDetails)
    }

    // ── Step 2b: Fetch escrow details (fees, buyer paid amount) ───────────────
    // Escrow API is per-order. Budget: ~8s for escrow before we must return.
    // If deadline is too close, skip escrow — orders still upsert with estimated fees.
    stage = 'getEscrowDetail'
    const escrowBySn = new Map<string, Awaited<ReturnType<typeof getEscrowDetail>> | null>()
    const ESCROW_DEADLINE_MS = 50_000 // bail out at 50s, well before the 60s maxDuration
    const escrowSkipped = Date.now() - syncStart > ESCROW_DEADLINE_MS
    if (!escrowSkipped) {
      const CONCURRENCY = 10 // bumped from 5; Shopee rate-limits per shop, not per IP
      let idx = 0
      async function worker() {
        for (;;) {
          const i = idx++
          if (i >= details.length) return
          if (Date.now() - syncStart > ESCROW_DEADLINE_MS) return // deadline mid-loop
          const sn = details[i]?.order_sn
          if (!sn) continue
          try {
            const esc = await getEscrowDetail(String(sn), currentToken, shopId)
            escrowBySn.set(sn, esc)
          } catch {
            escrowBySn.set(sn, null)
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
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
      const gmv = (Array.isArray(order.item_list) ? order.item_list : []).reduce((sum, item) => {
        const price = item.model_original_price || item.model_discounted_price || 0
        const qty = item.model_quantity_purchased || 1
        return sum + price * qty
      }, 0)

      // Revenue = buyer_paid_amount when escrow is available; fallback to discounted item sum.
      const itemRevenue = (Array.isArray(order.item_list) ? order.item_list : []).reduce((sum, item) => {
        const price = item.model_discounted_price ?? item.model_original_price ?? 0
        const qty = item.model_quantity_purchased ?? 1
        return sum + price * qty
      }, 0)

      // Fallback: if item_list is missing in the API response, use total_amount.
      // This should be rare since we request items as an optional field.
      const esc = escrowBySn.get(order.order_sn) ?? null
      const buyer_paid_amount = Number(esc?.order_income?.buyer_paid_amount ?? 0)
      const commission_fee = Number(esc?.order_income?.commission_fee ?? 0)
      const service_fee = Number(esc?.order_income?.service_fee ?? 0)
      const voucher_amount = Number(esc?.order_income?.voucher_from_seller ?? 0) + Number(esc?.order_income?.voucher_from_shopee ?? 0)
      const escrow_amount = Number(esc?.order_income?.escrow_amount ?? esc?.order_income?.order_income ?? 0)

      const revenue = buyer_paid_amount > 0 ? buyer_paid_amount : (itemRevenue || order.total_amount || 0)

      const cogs = 0 // user sets COGS per product manually
      const shipping_fee = order.actual_shipping_fee ?? 0
      const resolved_commission = resolveCommissionFee(commission_fee || (order.commission_fee ?? 0), revenue)
      const platform_fee = resolved_commission + (service_fee || 0)
      const net_profit = revenue - cogs - shipping_fee - platform_fee
      const createdAt = safeIsoFromUnixSeconds(order.create_time)
      const paidAt = safeIsoFromUnixSeconds(order.pay_time)
      return {
        platform: 'Shopee' as const,
        order_id: order.order_sn,
        gmv,
        buyer_paid_amount,
        voucher_amount,
        revenue,
        cogs,
        shipping_fee,
        platform_fee,
        commission_fee: resolved_commission,
        service_fee,
        escrow_amount,
        net_profit,
        status: order.order_status?.toLowerCase() ?? 'unknown',
        ...(createdAt ? { created_at: createdAt } : {}),
        // paid_at is the key field used by the dashboard to bucket orders into
        // the correct "paid day" — matching Shopee Seller Center's logic.
        ...(paidAt ? { paid_at: paidAt } : {}),
      }
    })

    // ── Step 4: Upsert into Supabase ──────────────────────────────────────────
    stage = 'supabaseUpsert'
    const { error } = await supabase.from('orders').upsert(rows, { onConflict: 'order_id' })
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`)

    const resPayload = NextResponse.json({
      synced: rows.length,
      chunks: chunks.length,
      days,
      commission_mode: USE_ESTIMATED_COMMISSION ? 'estimated_3pct' : 'api_value',
      escrow_skipped: escrowSkipped,
    })
    persistTokensIfRefreshed(resPayload, refreshedAccessToken, refreshedRefreshToken)
    return resPayload
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const needsServiceRoleHint =
      stage === 'supabaseUpsert' && !HAS_SUPABASE_SERVICE_ROLE
        ? ' Missing SUPABASE_SERVICE_ROLE_KEY in .env.local; this route is currently falling back to the public anon key.'
        : ''

    return NextResponse.json(
      {
        error: message,
        stage,
        debug: {
          has_supabase_service_role_key: HAS_SUPABASE_SERVICE_ROLE,
          has_refresh_token_cookie: Boolean((await cookies()).get('shopee_refresh_token')?.value),
        },
        hint: `Sync failed during ${stage}.${needsServiceRoleHint}`,
      },
      { status: 500 }
    )
  }
}

/** Returns true if the error is a Shopee 401/403 (expired or invalid access token). */
function isTokenExpiredError(err: unknown): boolean {
  return err instanceof Error && /HTTP 40[13]/.test(err.message)
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
