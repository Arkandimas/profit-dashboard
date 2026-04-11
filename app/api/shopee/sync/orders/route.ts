import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import {
  chunkDateRange,
  getOrderList,
  refreshAccessToken,
  type ShopeeOrderSummary,
} from '@/lib/shopee'

// Vercel Hobby: max 10s. Keep maxDuration at 10.
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

/**
 * POST /api/shopee/sync/orders?days=90&chunk=0
 *
 * Processes ONE 15-day chunk per call to stay within Vercel Hobby 10s limit.
 * Frontend should call repeatedly, incrementing `chunk` until response has `done: true`.
 *
 * Response: { success, synced, chunk, totalChunks, done }
 */
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
    const chunkIndex = Math.max(parseInt(searchParams.get('chunk') ?? '0'), 0)

    const nowTs = Math.floor(Date.now() / 1000)
    const fromTs = nowTs - days * 86400
    const allChunks = chunkDateRange(fromTs, nowTs)
    const totalChunks = allChunks.length

    // If chunk index exceeds available chunks, we're done
    if (chunkIndex >= totalChunks) {
      const res = NextResponse.json({ success: true, synced: 0, chunk: chunkIndex, totalChunks, done: true })
      persistTokensIfRefreshed(res, refreshedAccessToken, refreshedRefreshToken)
      return res
    }

    const currentChunk = allChunks[chunkIndex]
    let synced = 0

    const runSync = async (tkn: string) => {
      synced = 0

      // Fetch only ONE chunk's orders
      const summaries = await getOrderList(tkn, shopId, currentChunk.start, currentChunk.end)

      if (summaries.length === 0) return

      // Process stubs in batches of 50 (smaller batch for speed)
      const STUB_BATCH = 50
      for (let i = 0; i < summaries.length; i += STUB_BATCH) {
        const batch = summaries.slice(i, i + STUB_BATCH)
        const batchOrderIds = batch.map((s) => s.order_sn)

        // Find which order_ids already exist in DB
        const { data: existing, error: fetchError } = await supabase
          .from('orders')
          .select('order_id')
          .in('order_id', batchOrderIds)
        if (fetchError) throw new Error(`Supabase fetch existing orders failed: ${fetchError.message}`)

        const existingIdSet = new Set((existing ?? []).map((r) => r.order_id as string))

        // INSERT stubs for new orders
        const newRows = batch
          .filter((s) => !existingIdSet.has(s.order_sn))
          .map(mapSummaryToStub)
        if (newRows.length > 0) {
          const { error: insertError } = await supabase.from('orders').insert(newRows)
          if (insertError) throw new Error(`Supabase stub insert failed: ${insertError.message}`)
        }

        // UPDATE status & gmv for existing orders
        const existingRows = batch.filter((s) => existingIdSet.has(s.order_sn))
        if (existingRows.length > 0) {
          // Batch update using upsert with onConflict to avoid N individual updates
          const updateRows = existingRows.map((summary) => ({
            order_id: summary.order_sn,
            platform: 'Shopee' as const,
            status: summary.order_status ?? 'UNKNOWN',
            gmv: summary.total_amount ?? 0,
            ...(summary.pay_time
              ? { paid_at: new Date(summary.pay_time * 1000).toISOString() }
              : {}),
          }))
          const { error: updateError } = await supabase
            .from('orders')
            .upsert(updateRows, { onConflict: 'order_id', ignoreDuplicates: false })
          if (updateError) throw new Error(`Supabase status update failed: ${updateError.message}`)
        }
      }

      synced = summaries.length
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

    const done = chunkIndex + 1 >= totalChunks
    const res = NextResponse.json({
      success: true,
      synced,
      chunk: chunkIndex,
      totalChunks,
      done,
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
