import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import {
  chunkDateRange,
  getOrderListPage,
  refreshAccessToken,
  type ShopeeOrderSummary,
} from '@/lib/shopee'

// Vercel Hobby: hard cap 10s. Each call does 1 Shopee API + 1 DB batch = ~4s.
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
 * POST /api/shopee/sync/orders?days=90&chunk=0&cursor=ABC
 *
 * Fetches exactly ONE PAGE (max 100 orders) per call.
 * Frontend loops, passing back the cursor until done.
 *
 * State machine:
 *   chunk=0,cursor=''  → fetch page 1 of chunk 0
 *   chunk=0,cursor=X   → fetch next page of chunk 0
 *   chunk=0,done→true  → move to chunk=1,cursor=''
 *   ...until chunk >= totalChunks → fully done
 *
 * Response: { success, synced, chunk, totalChunks, cursor, chunkDone, allDone }
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
        // Non-fatal
      }
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30'), 1), 90)
    const chunkIndex = Math.max(parseInt(searchParams.get('chunk') ?? '0'), 0)
    const cursor = searchParams.get('cursor') || undefined

    const nowTs = Math.floor(Date.now() / 1000)
    const fromTs = nowTs - days * 86400
    const allChunks = chunkDateRange(fromTs, nowTs)
    const totalChunks = allChunks.length

    // Past all chunks → fully done
    if (chunkIndex >= totalChunks) {
      const res = NextResponse.json({
        success: true, synced: 0,
        chunk: chunkIndex, totalChunks,
        cursor: '', chunkDone: true, allDone: true,
      })
      persistTokensIfRefreshed(res, refreshedAccessToken, refreshedRefreshToken)
      return res
    }

    const currentChunk = allChunks[chunkIndex]
    let synced = 0

    const runPage = async (tkn: string) => {
      // Fetch exactly ONE page (max 100 orders)
      const page = await getOrderListPage(
        tkn, shopId, currentChunk.start, currentChunk.end, cursor
      )

      const summaries = page.orders
      if (summaries.length > 0) {
        // Upsert all orders in this page
        const rows = summaries.map(mapSummaryToStub)
        const { error: upsertError } = await supabase
          .from('orders')
          .upsert(rows, { onConflict: 'order_id', ignoreDuplicates: true })
        if (upsertError) throw new Error(`Supabase upsert failed: ${upsertError.message}`)

        // Update status & gmv for existing orders (separate call to not overwrite enriched data)
        const updateRows = summaries.map((s) => ({
          order_id: s.order_sn,
          status: s.order_status ?? 'UNKNOWN',
          gmv: s.total_amount ?? 0,
          ...(s.pay_time ? { paid_at: new Date(s.pay_time * 1000).toISOString() } : {}),
        }))
        for (const row of updateRows) {
          await supabase
            .from('orders')
            .update({ status: row.status, gmv: row.gmv, ...(row.paid_at ? { paid_at: row.paid_at } : {}) })
            .eq('order_id', row.order_id)
            // Ignore errors on individual updates — non-fatal
        }
      }

      synced = summaries.length
      return page
    }

    let page
    try {
      page = await runPage(accessToken)
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
        page = await runPage(accessToken)
      } catch {
        return NextResponse.json(
          { error: 'Shopee session expired. Please reconnect in Settings.', reconnect_required: true },
          { status: 401 }
        )
      }
    }

    const chunkDone = !page.hasMore || !page.nextCursor
    const allDone = chunkDone && chunkIndex + 1 >= totalChunks

    const res = NextResponse.json({
      success: true,
      synced,
      chunk: chunkIndex,
      totalChunks,
      cursor: chunkDone ? '' : page.nextCursor,
      chunkDone,
      allDone,
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
