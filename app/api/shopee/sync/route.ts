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
    for (const chunk of chunks) {
      const summaries = await getOrderList(accessToken, shopId, chunk.start, chunk.end)
      for (const o of summaries) seenSns.add(o.order_sn)
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
      const batchDetails = await getOrderDetail(batch, accessToken, shopId)
      details.push(...batchDetails)
    }

    // 3. Upsert into Supabase — order_id is the conflict key (no duplicates)
    const rows = details.map((order) => {
      const revenue = order.total_amount
      const cogs = 0 // user sets COGS per product manually
      const shipping_fee = order.actual_shipping_fee ?? 0
      const platform_fee = order.commission_fee ?? 0
      const net_profit = revenue - cogs - shipping_fee - platform_fee
      const payTime = order.pay_time && order.pay_time > 0 ? order.pay_time : null
      return {
        platform: 'Shopee' as const,
        order_id: order.order_sn,
        revenue,
        cogs,
        shipping_fee,
        platform_fee,
        net_profit,
        status: order.order_status?.toLowerCase() ?? 'unknown',
        created_at: new Date(order.create_time * 1000).toISOString(),
        paid_at: payTime ? new Date(payTime * 1000).toISOString() : null,
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
