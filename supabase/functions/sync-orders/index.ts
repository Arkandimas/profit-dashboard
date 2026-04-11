import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PARTNER_ID = parseInt(Deno.env.get('SHOPEE_PARTNER_ID') ?? '0')
const PARTNER_KEY = Deno.env.get('SHOPEE_PARTNER_KEY') ?? ''
const BASE_URL = 'https://partner.shopeemobile.com'

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

type SupabaseClient = ReturnType<typeof createClient>

async function loadTokens(sb: SupabaseClient, shopId: number): Promise<TokenRow | null> {
  const { data } = await sb
    .from('shopee_tokens')
    .select('*')
    .eq('shop_id', shopId)
    .single()
  return data ?? null
}

async function saveTokens(sb: SupabaseClient, shopId: number, accessToken: string, refreshToken: string, expiresIn: number) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  await sb.from('shopee_tokens').upsert(
    { shop_id: shopId, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt },
    { onConflict: 'shop_id' }
  )
}

async function refreshAccessToken(sb: SupabaseClient, row: TokenRow): Promise<TokenRow> {
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

  await saveTokens(sb, row.shop_id, data.access_token, data.refresh_token, data.expire_in ?? 14400)
  return { ...row, access_token: data.access_token, refresh_token: data.refresh_token }
}

async function getValidToken(sb: SupabaseClient, shopId: number): Promise<TokenRow> {
  const row = await loadTokens(sb, shopId)
  if (!row) throw new Error('No Shopee tokens found. Reconnect in Settings.')

  const expiresAt = new Date(row.expires_at).getTime()
  const twoMinutes = 2 * 60 * 1000
  if (Date.now() + twoMinutes >= expiresAt) {
    return refreshAccessToken(sb, row)
  }
  return row
}

// ─── Shopee API calls ─────────────────────────────────────────────────────────

interface OrderSummary {
  order_sn: string
  order_status: string
  create_time: number
  update_time: number
  pay_time?: number
  total_amount?: number
}

interface OrderDetail {
  order_sn: string
  order_status: string
  create_time: number
  update_time: number
  pay_time?: number
  total_amount?: number
  buyer_total_amount?: number
  buyer_user_id?: number
  item_list?: Array<{
    item_id: number
    item_name: string
    item_sku: string
    model_quantity_purchased: number
    model_original_price: number
    model_discounted_price: number
  }>
  estimated_shipping_fee?: number
  actual_shipping_fee?: number
  commission_fee?: number
  voucher_from_seller?: number
  voucher_from_shopee?: number
}

async function getOrderListAll(
  accessToken: string,
  shopId: number,
  fromTs: number,
  toTs: number
): Promise<OrderSummary[]> {
  const path = '/api/v2/order/get_order_list'
  const all: OrderSummary[] = []
  let cursor: string | undefined

  for (;;) {
    const params: Record<string, string | number> = {
      time_range_field: 'create_time',
      time_from: fromTs,
      time_to: toTs,
      page_size: 100,
    }
    if (cursor) params.cursor = cursor

    const url = await buildUrl(path, params, accessToken, shopId)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`getOrderList HTTP ${res.status}`)
    const data = await res.json()
    if (data.error && data.error !== '') throw new Error(`getOrderList: ${data.message || data.error}`)

    const orders: OrderSummary[] = data.response?.order_list ?? []
    all.push(...orders)

    if (!data.response?.more || !data.response?.next_cursor) break
    cursor = String(data.response.next_cursor)
  }

  return all
}

async function getOrderDetail(
  orderSnList: string[],
  accessToken: string,
  shopId: number
): Promise<OrderDetail[]> {
  const path = '/api/v2/order/get_order_detail'
  const url = await buildUrl(
    path,
    {
      order_sn_list: orderSnList.join(','),
      response_optional_fields:
        'pay_time,item_list,total_amount,buyer_total_amount,buyer_username,estimated_shipping_fee,actual_shipping_fee,payment_method,buyer_user_id,voucher_from_seller,voucher_from_shopee',
    },
    accessToken,
    shopId
  )
  const res = await fetch(url)
  if (!res.ok) throw new Error(`getOrderDetail HTTP ${res.status}`)
  const data = await res.json()
  if (data.error && data.error !== '') throw new Error(`getOrderDetail: ${data.message || data.error}`)
  return data.response?.order_list ?? []
}

// ─── Date chunking ────────────────────────────────────────────────────────────

function chunkDateRange(fromTs: number, toTs: number, maxDays = 15): Array<{ start: number; end: number }> {
  const maxSecs = maxDays * 86400
  const chunks: Array<{ start: number; end: number }> = []
  let cursor = fromTs
  while (cursor < toTs) {
    const end = Math.min(cursor + maxSecs, toTs)
    chunks.push({ start: cursor, end })
    cursor = end
  }
  return chunks
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function mapSummaryToStub(order: OrderSummary) {
  return {
    platform: 'Shopee',
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

function mapDetailToUpdate(detail: OrderDetail) {
  return {
    order_id: detail.order_sn,
    status: detail.order_status ?? 'UNKNOWN',
    gmv: detail.total_amount ?? 0,
    revenue: detail.buyer_total_amount ?? 0,
    buyer_paid_amount: detail.buyer_total_amount ?? 0,
    paid_at: detail.pay_time ? new Date(detail.pay_time * 1000).toISOString() : undefined,
    details_synced: true,
  }
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

  // Validate env vars and init supabase client inside handler so errors are catchable
  console.log('sync-orders started, checking env vars...')
  console.log('SHOPEE_PARTNER_ID:', Deno.env.get('SHOPEE_PARTNER_ID') ? 'SET' : 'MISSING')
  console.log('SHOPEE_PARTNER_KEY:', Deno.env.get('SHOPEE_PARTNER_KEY') ? 'SET' : 'MISSING')
  console.log('SHOPEE_SHOP_ID:', Deno.env.get('SHOPEE_SHOP_ID') ? 'SET' : 'MISSING')
  console.log('SUPABASE_URL:', Deno.env.get('SUPABASE_URL') ? 'SET' : 'MISSING')
  console.log('SUPABASE_SERVICE_ROLE_KEY:', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'SET' : 'MISSING')

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [!supabaseUrl && 'SUPABASE_URL', !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean).join(', ')
    console.error('FATAL: missing env vars:', missing)
    return Response.json({ error: `Missing env vars: ${missing}` }, { status: 500 })
  }

  if (!PARTNER_ID || !PARTNER_KEY) {
    const missing = [!PARTNER_ID && 'SHOPEE_PARTNER_ID', !PARTNER_KEY && 'SHOPEE_PARTNER_KEY'].filter(Boolean).join(', ')
    console.error('FATAL: missing Shopee env vars:', missing)
    return Response.json({ error: `Missing env vars: ${missing}` }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const startMs = Date.now()

  try {
    const body = await req.json().catch(() => ({}))
    const days: number = Math.min(Math.max(Number(body.days ?? 30), 1), 90)
    const shopId: number = Number(body.shop_id ?? Deno.env.get('SHOPEE_SHOP_ID') ?? 0)

    if (!shopId) {
      return Response.json({ error: 'shop_id required' }, { status: 400 })
    }

    console.log(`sync-orders: shopId=${shopId}, days=${days}`)

    const tokenRow = await getValidToken(supabase, shopId)
    const { access_token: accessToken } = tokenRow

    const nowTs = Math.floor(Date.now() / 1000)
    const fromTs = nowTs - days * 86400
    const chunks = chunkDateRange(fromTs, nowTs)

    // Fetch all order summaries across all chunks
    const allSummaries: OrderSummary[] = []
    for (const chunk of chunks) {
      const summaries = await getOrderListAll(accessToken, shopId, chunk.start, chunk.end)
      allSummaries.push(...summaries)
    }

    // Upsert stubs for all orders
    if (allSummaries.length > 0) {
      const stubs = allSummaries.map(mapSummaryToStub)
      const { error: upsertErr } = await supabase
        .from('orders')
        .upsert(stubs, { onConflict: 'order_id', ignoreDuplicates: true })
      if (upsertErr) throw new Error(`Stub upsert failed: ${upsertErr.message}`)
    }

    // Fetch details in batches of 50
    const DETAIL_BATCH = 50
    let detailsSynced = 0
    for (let i = 0; i < allSummaries.length; i += DETAIL_BATCH) {
      const batch = allSummaries.slice(i, i + DETAIL_BATCH)
      const sns = batch.map((o) => o.order_sn)
      const details = await getOrderDetail(sns, accessToken, shopId)

      for (const detail of details) {
        const update = mapDetailToUpdate(detail)
        await supabase
          .from('orders')
          .update(update)
          .eq('order_id', detail.order_sn)
        detailsSynced++
      }
    }

    const durationMs = Date.now() - startMs

    // Log to sync_logs
    await supabase.from('sync_logs').insert({
      sync_type: 'orders',
      status: 'success',
      synced_count: detailsSynced,
      duration_ms: durationMs,
      metadata: { days, chunks: chunks.length, summaries: allSummaries.length },
    })

    return Response.json({ synced: detailsSynced, duration_ms: durationMs })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync-orders FATAL ERROR:', err)
    const { error: logErr } = await supabase.from('sync_logs').insert({
      sync_type: 'orders',
      status: 'error',
      synced_count: 0,
      duration_ms: Date.now() - startMs,
      metadata: { error: message },
    })
    if (logErr) console.error('sync-orders: failed to write sync_logs:', logErr)
    return Response.json({ error: message }, { status: 500 })
  }
})
