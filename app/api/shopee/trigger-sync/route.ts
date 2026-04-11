import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/shopee/trigger-sync
 * Body: { days?: number }
 *
 * 1. Reads Shopee tokens from cookies
 * 2. Saves them to shopee_tokens table so Edge Functions can read them
 * 3. Fires sync-orders + sync-escrow Edge Functions via after() (fire-and-forget)
 * 4. Returns immediately with { triggered: true }
 */
export async function POST(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const supabaseFunctionsUrl = supabaseUrl

  try {
    const jar = await cookies()

    const accessToken = jar.get('shopee_access_token')?.value
    const refreshToken = jar.get('shopee_refresh_token')?.value
    const shopIdStr = jar.get('shopee_shop_id')?.value
    const shopId = shopIdStr ? parseInt(shopIdStr) : 0

    if (!accessToken || !shopId) {
      return NextResponse.json(
        { error: 'Not connected to Shopee. Please reconnect in Settings.', reconnect_required: true },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const days: number = Math.min(Math.max(Number(body.days ?? 30), 1), 90)

    // Bridge tokens to DB so Edge Functions can access them
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() // 4h default
    const { error: upsertErr } = await supabase.from('shopee_tokens').upsert(
      {
        shop_id: shopId,
        access_token: accessToken,
        refresh_token: refreshToken ?? '',
        expires_at: expiresAt,
      },
      { onConflict: 'shop_id' }
    )

    if (upsertErr) {
      return NextResponse.json(
        { error: `Failed to save tokens: ${upsertErr.message}` },
        { status: 500 }
      )
    }

    // Fire Edge Functions after response is sent (fire-and-forget)
    const edgeFnHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    }

    after(async () => {
      try {
        // First sync orders
        const ordersRes = await fetch(`${supabaseFunctionsUrl}/functions/v1/sync-orders`, {
          method: 'POST',
          headers: edgeFnHeaders,
          body: JSON.stringify({ days, shop_id: shopId }),
        })
        if (!ordersRes.ok) return

        // Then sync escrow
        await fetch(`${supabaseFunctionsUrl}/functions/v1/sync-escrow`, {
          method: 'POST',
          headers: edgeFnHeaders,
          body: JSON.stringify({ shop_id: shopId }),
        })
      } catch {
        // Errors are logged by the Edge Functions themselves into sync_logs
      }
    })

    return NextResponse.json({ triggered: true, days, shop_id: shopId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
