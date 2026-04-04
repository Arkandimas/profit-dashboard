import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createHmac } from 'crypto'

const PARTNER_ID = parseInt(process.env.SHOPEE_PARTNER_ID?.trim() || '0')
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY?.trim() || ''
const BASE_URL = process.env.SHOPEE_BASE_URL?.trim() || 'https://partner.shopeemobile.com'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const orderSn = searchParams.get('order_sn')

  if (!orderSn) {
    return NextResponse.json({ error: 'Missing required query param: order_sn' }, { status: 400 })
  }

  const jar = await cookies()
  const accessToken = jar.get('shopee_access_token')?.value
  const shopIdStr = jar.get('shopee_shop_id')?.value
  const shopId = shopIdStr ? parseInt(shopIdStr) : 0

  if (!accessToken || !shopId) {
    return NextResponse.json(
      { error: 'Not connected to Shopee. Set shopee_access_token and shopee_shop_id cookies first.' },
      { status: 401 }
    )
  }

  const path = '/api/v2/payment/get_escrow_detail'
  const timestamp = Math.floor(Date.now() / 1000)

  // Signature: HMAC-SHA256("{partner_id}{path}{timestamp}{access_token}{shop_id}")
  const baseString = `${PARTNER_ID}${path}${timestamp}${accessToken}${shopId}`
  const signature = createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex')

  const query = new URLSearchParams({
    partner_id: String(PARTNER_ID),
    timestamp: String(timestamp),
    sign: signature,
    access_token: accessToken,
    shop_id: String(shopId),
    order_sn: orderSn,
  })

  const url = `${BASE_URL}${path}?${query}`

  try {
    const res = await fetch(url)
    const data = await res.json()
    return NextResponse.json({ shopee_status: res.status, request_url: url, response: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Shopee API call failed: ${message}` }, { status: 502 })
  }
}
