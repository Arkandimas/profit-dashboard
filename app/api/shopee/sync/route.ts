import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { chunkDateRange, getOrderList, getOrderDetail } from '@/lib/shopee'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  try {
    const jar = await cookies()
    const accessToken = jar.get('shopee_access_token')?.value
    const shopIdStr = jar.get('shopee_shop_id')?.value
    const shopId = shopIdStr ? parseInt(shopIdStr) : 0

    if (!accessToken || !shopId) {
      return NextResponse.json(
        { error: 'Not connected to Shopee. Please connect in Settings.' },
        { status: 401 }
      )
    }

    // Parse ?days= query param (default 30, max 90)
    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30'), 1), 90)

    const nowTs = Math.floor(Date.now() / 1000)
    const fromTs = nowTs - days * 86400

    // Split into ≤15-day chunks (Shopee API limit)
    const chunks = chunkDateRange(fromTs, nowTs)

    // 1. Fetch order summaries across all chunks
    const seenSns = new Set<string>()
    let currentAccessToken = accessToken
    let retriedRefresh = false

    for (const chunk of chunks) {
      try {
        const summaries = await getOrderList(currentAccessToken, shopId, chunk.start, chunk.end)
        for (const o of summaries) seenSns.add(o.order_sn)
      } catch (err: any) {
        if (!retriedRefresh && (err.message?.includes('403') || err.message?.includes('error_auth'))) {
          // Attempt to refresh
          const origin = new URL(request.url).origin
          const cookieHeader = request.headers.get('cookie') || ''
          const refreshRes = await fetch(`${origin}/api/shopee/refresh`, { 
            method: 'POST', 
            headers: { cookie: cookieHeader } 
          })
          
          if (!refreshRes.ok) {
            throw new Error('Shopee session expired. Please reconnect in Settings.')
          }
          
          // To use the new access token immediately, we need to extract it from the Set-Cookie header
          // Alternatively, we can just reload the jar (but Next.js cookies might not reflect fetch side-effects)
          // Let's parse the Set-Cookie for shopee_access_token
          const setCookies = refreshRes.headers.getSetCookie()
          let newAccessToken = currentAccessToken
          for (const sc of setCookies) {
            if (sc.startsWith('shopee_access_token=')) {
              newAccessToken = sc.split(';')[0].split('=')[1]
            }
          }
          
          currentAccessToken = newAccessToken
          retriedRefresh = true
          
          // Retry this chunk
          const summaries = await getOrderList(currentAccessToken, shopId, chunk.start, chunk.end)
          for (const o of summaries) seenSns.add(o.order_sn)
        } else {
          throw err
        }
      }
    }

    if (seenSns.size === 0) {
      return NextResponse.json({ synced: 0, chunks: chunks.length, days })
    }

    const orderSnList = Array.from(seenSns)

    // 2. Fetch details in batches of 50 (Shopee limit)
    const BATCH_SIZE = 50
    const details = []
    for (let i = 0; i < orderSnList.length; i += BATCH_SIZE) {
      const batch = orderSnList.slice(i, i + BATCH_SIZE)
      const batchDetails = await getOrderDetail(batch, currentAccessToken, shopId)
      details.push(...batchDetails)
    }

    // 3. Upsert into Supabase — order_id is the conflict key (no duplicates)
    const rows = details.map((order) => {
      const buyer_paid_amount = order.buyer_paid_amount ?? order.total_amount ?? 0
      const total_amount = order.total_amount ?? 0
      const cogs = 0 // user sets COGS per product manually
      const actual_shipping_fee = order.actual_shipping_fee ?? 0
      const commission_fee = order.commission_fee ?? 0
      const service_fee = order.service_fee ?? 0
      const seller_discount = order.seller_discount ?? 0
      const voucher_from_seller = order.voucher_from_seller ?? 0
      const voucher_from_shopee = order.voucher_from_shopee ?? 0
      // Revenue = what buyer paid; net_profit excludes voucher_from_shopee (Shopee covers it)
      const revenue = buyer_paid_amount
      const net_profit = buyer_paid_amount - cogs - actual_shipping_fee - commission_fee - service_fee - voucher_from_seller
      const payTime = order.pay_time && order.pay_time > 0 ? order.pay_time : null
      return {
        platform: 'Shopee' as const,
        order_id: order.order_sn,
        revenue,
        cogs,
        shipping_fee: actual_shipping_fee,
        platform_fee: commission_fee,
        net_profit,
        status: order.order_status?.toLowerCase() ?? 'unknown',
        created_at: new Date(order.create_time * 1000).toISOString(),
        paid_at: payTime ? new Date(payTime * 1000).toISOString() : null,
        // Extended financial fields
        total_amount,
        buyer_paid_amount,
        actual_shipping_fee,
        commission_fee,
        service_fee,
        seller_discount,
        voucher_from_seller,
        voucher_from_shopee,
        payment_method: order.payment_method ?? null,
        item_list: order.item_list ?? order.items ?? [],
      }
    })

    const { error } = await supabase.from('orders').upsert(rows, { onConflict: 'order_id' })
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`)

    return NextResponse.json({ synced: rows.length, chunks: chunks.length, days })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
