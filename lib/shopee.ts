import { createHmac } from 'crypto'

const PARTNER_ID = parseInt(process.env.SHOPEE_PARTNER_ID?.trim() || '0')
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY?.trim() || ''
const BASE_URL = process.env.SHOPEE_BASE_URL?.trim() || 'https://partner.shopeemobile.com'
export const DEFAULT_SHOP_ID = parseInt(process.env.SHOPEE_SHOP_ID?.trim() || '0')

// Signature: HMAC-SHA256 of "{partner_id}{path}{timestamp}[{access_token}{shop_id}]"
function sign(path: string, timestamp: number, accessToken?: string, shopId?: number): string {
  const parts: (string | number)[] = [PARTNER_ID, path, timestamp]
  if (accessToken) parts.push(accessToken)
  if (shopId) parts.push(shopId)
  return createHmac('sha256', PARTNER_KEY).update(parts.join('')).digest('hex')
}

function buildUrl(
  path: string,
  params: Record<string, string | number>,
  accessToken?: string,
  shopId?: number
): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = sign(path, timestamp, accessToken, shopId)

  const query = new URLSearchParams({
    partner_id: String(PARTNER_ID),
    timestamp: String(timestamp),
    sign: signature,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  })

  if (accessToken) query.set('access_token', accessToken)
  if (shopId) query.set('shop_id', String(shopId))

  return `${BASE_URL}${path}?${query}`
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

/** Returns the Shopee authorization URL to redirect sellers to. */
export function getAuthUrl(redirectUrl: string): string {
  const path = '/api/v2/shop/auth_partner'
  const timestamp = Math.floor(Date.now() / 1000)
  // Shopee OAuth formula: HMAC-SHA256(partner_id + path + timestamp, partner_key)
  // partner_id and timestamp must be plain decimal strings, NO extra components
  const baseString = String(PARTNER_ID) + path + String(timestamp)
  const signature = createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex')

  const query = new URLSearchParams({
    partner_id: String(PARTNER_ID),
    timestamp: String(timestamp),
    sign: signature,
    redirect: redirectUrl,
  })

  return `${BASE_URL}${path}?${query}`
}

/** Returns the raw inputs used to build the auth URL — for debugging only. */
export function getAuthDebugInfo(redirectUrl: string) {
  const path = '/api/v2/shop/auth_partner'
  const timestamp = Math.floor(Date.now() / 1000)
  const partnerIdRaw = process.env.SHOPEE_PARTNER_ID
  const partnerKeyRaw = process.env.SHOPEE_PARTNER_KEY ?? ''
  const baseString = String(PARTNER_ID) + path + String(timestamp)
  const signature = createHmac('sha256', partnerKeyRaw).update(baseString).digest('hex')
  const query = new URLSearchParams({
    partner_id: String(PARTNER_ID),
    timestamp: String(timestamp),
    sign: signature,
    redirect: redirectUrl,
  })
  return {
    partner_id_env: partnerIdRaw,
    partner_id_parsed: PARTNER_ID,
    partner_id_type: typeof PARTNER_ID,
    partner_key_length: partnerKeyRaw.length,
    partner_key_starts_with: partnerKeyRaw.slice(0, 6),
    partner_key_ends_with: partnerKeyRaw.slice(-4),
    timestamp,
    base_string: baseString,
    sign: signature,
    full_url: `${BASE_URL}${path}?${query}`,
  }
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expire_in: number
  shop_id: number
}

/** Exchange auth_code (from OAuth callback) for access + refresh tokens. */
export async function exchangeToken(code: string, shopId: number): Promise<TokenResponse> {
  const path = '/api/v2/auth/token/get'
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = sign(path, timestamp)

  const query = new URLSearchParams({
    partner_id: String(PARTNER_ID),
    timestamp: String(timestamp),
    sign: signature,
  })

  const res = await fetch(`${BASE_URL}${path}?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, shop_id: shopId, partner_id: PARTNER_ID }),
  })

  if (!res.ok) throw new Error(`Token exchange HTTP ${res.status}`)
  const data = await res.json()
  if (data.error && data.error !== '') throw new Error(`Token exchange: ${data.message ?? data.error}`)
  return data
}

/** Use a refresh token to obtain a new access token. */
export async function refreshAccessToken(
  refreshToken: string,
  shopId: number
): Promise<TokenResponse> {
  const path = '/api/v2/auth/access_token/get'
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = sign(path, timestamp)

  const query = new URLSearchParams({
    partner_id: String(PARTNER_ID),
    timestamp: String(timestamp),
    sign: signature,
  })

  const res = await fetch(`${BASE_URL}${path}?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, shop_id: shopId, partner_id: PARTNER_ID }),
  })

  if (!res.ok) throw new Error(`Refresh token HTTP ${res.status}`)
  const data = await res.json()
  if (data.error && data.error !== '') throw new Error(`Refresh token: ${data.message ?? data.error}`)
  return data
}

export interface ShopInfo {
  shop_name: string
  status: string
}

/** Fetch basic shop info (name, status) after connecting. */
export async function getShopInfo(accessToken: string, shopId: number): Promise<ShopInfo> {
  const url = buildUrl('/api/v2/shop/get_shop_info', {}, accessToken, shopId)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`getShopInfo HTTP ${res.status}`)
  const data = await res.json()
  if (data.error && data.error !== '') throw new Error(`getShopInfo: ${data.message ?? data.error}`)
  return {
    shop_name: data.response?.shop_name ?? 'Unknown',
    status: data.response?.status ?? 'NORMAL',
  }
}

// ─── Order API ────────────────────────────────────────────────────────────────

export interface ShopeeOrderSummary {
  order_sn: string
  order_status: string
  create_time: number
  update_time: number
  total_amount: number
}

export interface ShopeeOrderDetail {
  order_sn: string
  order_status: string
  create_time: number
  update_time: number
  /** Unix seconds; use for seller-center style “paid order” day bucketing (GMT+7 in UI). */
  pay_time?: number
  total_amount: number
  buyer_user_id: number
  /**
   * Field name in Shopee API v2 response is `item_list` (NOT `items`).
   * Requested via response_optional_fields: 'item_list'.
   * Contains per-line product pricing used to compute Shopee "Penjualan".
   */
  item_list: Array<{
    item_id: number
    item_name: string
    item_sku: string
    model_quantity_purchased: number
    model_original_price: number
    model_discounted_price: number
  }>
  actual_shipping_fee: number
  commission_fee: number
}

// Shopee API allows max 15 days per getOrderList request.
// This helper splits a date range into ≤15-day chunks.
export function chunkDateRange(
  fromTs: number,
  toTs: number,
  maxDays = 15
): Array<{ start: number; end: number }> {
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

/** Fetch orders for a specific unix-timestamp window (max 15-day span). */
export async function getOrderList(
  accessToken: string,
  shopId: number,
  fromTs: number,
  toTs: number
): Promise<ShopeeOrderSummary[]> {
  const path = '/api/v2/order/get_order_list'
  const all: ShopeeOrderSummary[] = []
  let cursor = ''

  for (;;) {
    const params: Record<string, string | number> = {
      time_range_field: 'create_time',
      time_from: fromTs,
      time_to: toTs,
      page_size: 100,
      response_optional_fields: 'order_status',
    }
    if (cursor) params.cursor = cursor

    const url = buildUrl(path, params, accessToken, shopId)
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(`getOrderList HTTP ${res.status}: ${body.message || body.error || 'unknown'}`)
    }
    const data = await res.json()
    if (data.error && data.error !== '') throw new Error(`getOrderList: ${data.message || data.error}`)

    const list: ShopeeOrderSummary[] = data.response?.order_list ?? []
    all.push(...list)

    const more = data.response?.more === true
    const next = String(data.response?.next_cursor ?? '')
    if (!more || !next) break
    cursor = next
  }

  return all
}

// ─── Product API ──────────────────────────────────────────────────────────────

export interface ShopeeItemSummary {
  item_id: number
  item_status: string
}

export interface ShopeeItemBaseInfo {
  item_id: number
  item_name: string
  item_sku: string
  price_info: Array<{ current_price: number; original_price: number }>
}

/** Fetch a page of item IDs. Paginates via offset; max page_size 100. */
export async function getItemList(
  accessToken: string,
  shopId: number,
  offset = 0,
  pageSize = 100,
  itemStatus = 'NORMAL'
): Promise<{ items: ShopeeItemSummary[]; has_next_page: boolean; next_offset: number }> {
  const path = '/api/v2/product/get_item_list'
  const url = buildUrl(
    path,
    { offset, page_size: pageSize, item_status: itemStatus },
    accessToken,
    shopId
  )
  const res = await fetch(url)
  if (!res.ok) throw new Error(`getItemList HTTP ${res.status}`)
  const data = await res.json()
  if (data.error && data.error !== '') throw new Error(`getItemList: ${data.message ?? data.error}`)
  return {
    items: data.response?.item ?? [],
    has_next_page: data.response?.has_next_page ?? false,
    next_offset: data.response?.next_offset ?? 0,
  }
}

/** Fetch base info (name, SKU, price) for up to 50 item IDs at once. */
export async function getItemBaseInfo(
  itemIds: number[],
  accessToken: string,
  shopId: number
): Promise<ShopeeItemBaseInfo[]> {
  const path = '/api/v2/product/get_item_base_info'
  const url = buildUrl(
    path,
    { item_id_list: itemIds.join(',') },
    accessToken,
    shopId
  )
  const res = await fetch(url)
  if (!res.ok) throw new Error(`getItemBaseInfo HTTP ${res.status}`)
  const data = await res.json()
  if (data.error && data.error !== '') throw new Error(`getItemBaseInfo: ${data.message ?? data.error}`)
  return data.response?.item_list ?? []
}

export interface ShopeeItemModel {
  model_id: number
  model_name: string
  model_sku: string
  price_info: Array<{ current_price: number; original_price: number }>
  stock_info: Array<{ current_available_stock: number }>
}

/** Fetch variant/model list for a single item. */
export async function getItemModelList(
  itemId: number,
  accessToken: string,
  shopId: number
): Promise<ShopeeItemModel[]> {
  const path = '/api/v2/product/get_model_list'
  const url = buildUrl(path, { item_id: itemId }, accessToken, shopId)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`getItemModelList HTTP ${res.status}`)
  const data = await res.json()
  if (data.error && data.error !== '') throw new Error(`getItemModelList: ${data.message ?? data.error}`)
  return data.response?.model ?? []
}

export async function getOrderDetail(
  orderSnList: string[],
  accessToken: string,
  shopId: number
): Promise<ShopeeOrderDetail[]> {
  const path = '/api/v2/order/get_order_detail'

  const url = buildUrl(
    path,
    {
      order_sn_list: orderSnList.join(','),
      response_optional_fields:
        'buyer_user_id,item_list,actual_shipping_fee,commission_fee,total_amount,pay_time',
    },
    accessToken,
    shopId
  )

  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`getOrderDetail HTTP ${res.status}: ${body.message || body.error || 'unknown'}`)
  }
  const data = await res.json()
  if (data.error && data.error !== '') throw new Error(`getOrderDetail: ${data.message || data.error}`)
  return data.response?.order_list ?? []
}
