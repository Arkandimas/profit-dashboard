import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PARTNER_ID = parseInt(Deno.env.get('SHOPEE_PARTNER_ID') ?? '0')
const PARTNER_KEY = Deno.env.get('SHOPEE_PARTNER_KEY') ?? ''
const BASE_URL = 'https://partner.shopeemobile.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const ESCROW_ELIGIBLE_STATUSES = ['COMPLETED', 'TO_CONFIRM_RECEIVE']
const CONCURRENT_LIMIT = 10
const DELAY_BETWEEN_BATCHES_MS = 200

// ─── Crypto ───────────────────────────────────────────────────────────────────

async function sign(path: string, ts: number, token?: string, shopId?: number): Promise<string> {
  const parts = [String(PARTNER_ID), path, String(ts)]
  if (token) parts.push(token)
  if (shopId) parts.push(String(shopId))
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(PARTNER_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(parts.join('')))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function buildUrl(
  path: string,
  params: Record<string, string | number>,
  accessToken?: string,
  shopId?: number
): Promise<string> {
  const ts = Math.floor(Date.now() / 1000)
  const sig = await sign(path, ts, accessToken, shopId)
  const query = new URLSearchParams({
    partner_id: String(PARTNER_ID),
    timestamp: String(ts),
    sign: sig,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  })
  if (accessToken) query.set('access_token', accessToken)
  if (shopId) query.set('shop_id', String(shopId))
  return `${BASE_URL}${path}?${query}`
}

// ─── Token management ─────────────────────────────────────────────────────────

interface TokenRow {
  shop_id: number
  access_token: string
  refresh_token: string
  expires_at: string
}

async function loadTokens(shopId: number): Promise<TokenRow | null> {
  const { data } = await supabase
    .from('shopee_tokens')
    .select('*')
    .eq('shop_id', shopId)
    .single()
  return data ?? null
}

async function saveTokens(shopId: number, accessToken: string, refreshToken: string, expiresIn: number) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  await supabase.from('shopee_tokens').upsert(
    { shop_id: shopId, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt },
    { onConflict: 'shop_id' }
  )
}

async function refreshToken(row: TokenRow): Promise<TokenRow> {
  const path = '/api/v2/auth/access_token/get'
  const ts = Math.floor(Date.now() / 1000)
  const sig = await sign(path, ts)
  const query = new URLSearchParams({
    partner_id: String(PARTNER_ID),
    timestamp: String(ts),
    sign: sig,
  })
  const res = await fetch(`${BASE_URL}${path}?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: row.refresh_token,
      shop_id: row.shop_id,
      partner_id: PARTNER_ID,
    }),
  })
  if (!res.ok) throw new Error(`Token refresh HTTP ${res.status}`)
  const data = await res.json()
  if (data.error && data.error !== '') throw new Error(`Token refresh: ${data.message ?? data.error}`)

  await saveTokens(row.shop_id, data.access_token, data.refresh_token, data.expire_in ?? 14400)
  return { ...row, access_token: data.access_token, refresh_token: data.refresh_token }
}

async function getValidToken(shopId: number): Promise<TokenRow> {
  const row = await loadTokens(shopId)
  if (!row) throw new Error('No Shopee tokens found. Reconnect in Settings.')

  const expiresAt = new Date(row.expires_at).getTime()
  const twoMinutes = 2 * 60 * 1000
  if (Date.now() + twoMinutes >= expiresAt) {
    return refreshToken(row)
  }
  return row
}

// ─── Escrow API ───────────────────────────────────────────────────────────────

interface EscrowIncome {
  escrow_amount?: number
  buyer_paid_amount?: number
  buyer_total_amount?: number
  commission_fee?: number
  service_fee?: number
  order_ams_commission_fee?: number
  seller_order_processing_fee?: number
  actual_shipping_fee?: number
  shopee_shipping_rebate?: number
  buyer_paid_shipping_fee?: number
  voucher_from_seller?: number
  voucher_from_shopee?: number
  seller_discount?: number
}

async function getEscrowDetail(
  orderSn: string,
  accessToken: string,
  shopId: number
): Promise<EscrowIncome> {
  const path = '/api/v2/payment/get_escrow_detail'
  const url = await buildUrl(path, { order_sn: orderSn }, accessToken, shopId)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`getEscrowDetail HTTP ${res.status}`)
  const data = await res.json()
  if (data.error && data.error !== '') throw new Error(`getEscrowDetail: ${data.message || data.error}`)
  return data.response?.order_income ?? {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function processBatch(
  orders: Array<{ id: number; order_id: string; cogs: number | null }>,
  accessToken: string,
  shopId: number
): Promise<number> {
  let synced = 0

  await Promise.all(
    orders.map(async (order) => {
      try {
        const inc = await getEscrowDetail(order.order_id, accessToken, shopId)

        const commission_fee_actual = Number(inc.commission_fee ?? 0)
        const service_fee_actual = Number(inc.service_fee ?? 0)
        const ams_commission = Number(inc.order_ams_commission_fee ?? 0)
        const processing_fee = Number(inc.seller_order_processing_fee ?? 0)
        const shopee_shipping_rebate = Number(inc.shopee_shipping_rebate ?? 0)
        const voucher_from_seller = Number(inc.voucher_from_seller ?? 0)
        const voucher_from_shopee = Number(inc.voucher_from_shopee ?? 0)
        const escrow_amount = Number(inc.escrow_amount ?? 0)
        const buyer_paid_amount = Number(inc.buyer_paid_amount ?? 0)
        const voucher_amount = voucher_from_seller + voucher_from_shopee
        const net_profit = escrow_amount - (order.cogs ?? 0)

        const { error } = await supabase
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

        if (!error) synced++
      } catch {
        // Per-order failure: skip
      }
    })
  )

  return synced
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  const startMs = Date.now()

  try {
    const body = await req.json().catch(() => ({}))
    const shopId: number = Number(body.shop_id ?? Deno.env.get('SHOPEE_SHOP_ID') ?? 0)

    if (!shopId) {
      return Response.json({ error: 'shop_id required' }, { status: 400 })
    }

    const tokenRow = await getValidToken(shopId)
    const { access_token: accessToken } = tokenRow

    // Fetch all orders needing escrow sync
    const { data: orders, error: queryError } = await supabase
      .from('orders')
      .select('id, order_id, cogs')
      .eq('platform', 'Shopee')
      .in('status', ESCROW_ELIGIBLE_STATUSES)
      .or('escrow_synced.eq.false,escrow_synced.is.null')

    if (queryError) throw new Error(`DB query failed: ${queryError.message}`)

    if (!orders || orders.length === 0) {
      const durationMs = Date.now() - startMs
      await supabase.from('sync_logs').insert({
        sync_type: 'escrow',
        status: 'success',
        synced_count: 0,
        duration_ms: durationMs,
        metadata: { message: 'No orders needed escrow sync' },
      })
      return Response.json({ synced: 0, duration_ms: durationMs })
    }

    // Process in batches of CONCURRENT_LIMIT with delay between batches
    let totalSynced = 0
    for (let i = 0; i < orders.length; i += CONCURRENT_LIMIT) {
      const batch = orders.slice(i, i + CONCURRENT_LIMIT)
      const batchSynced = await processBatch(batch, accessToken, shopId)
      totalSynced += batchSynced

      if (i + CONCURRENT_LIMIT < orders.length) {
        await delay(DELAY_BETWEEN_BATCHES_MS)
      }
    }

    const durationMs = Date.now() - startMs

    await supabase.from('sync_logs').insert({
      sync_type: 'escrow',
      status: 'success',
      synced_count: totalSynced,
      duration_ms: durationMs,
      metadata: { total_eligible: orders.length },
    })

    return Response.json({ synced: totalSynced, duration_ms: durationMs })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase.from('sync_logs').insert({
      sync_type: 'escrow',
      status: 'error',
      synced_count: 0,
      duration_ms: Date.now() - startMs,
      metadata: { error: message },
    })
    return Response.json({ error: message }, { status: 500 })
  }
})
