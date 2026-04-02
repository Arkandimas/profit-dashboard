import { NextResponse } from 'next/server'
import { exchangeToken, getShopInfo, DEFAULT_SHOP_ID } from '@/lib/shopee'

const COOKIE_OPTS = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const shopId = parseInt(searchParams.get('shop_id') ?? String(DEFAULT_SHOP_ID))

  if (!code) {
    return NextResponse.redirect(`${origin}/settings?shopee_error=missing_code`)
  }

  try {
    const tokens = await exchangeToken(code, shopId)

    // Fetch shop name for display
    let shopName = 'My Shopee Store'
    try {
      const info = await getShopInfo(tokens.access_token, shopId)
      if (info.shop_name && info.shop_name !== 'Unknown') {
        shopName = info.shop_name
      }
    } catch {
      // non-fatal — proceed without shop name
    }

    const res = NextResponse.redirect(`${origin}/settings?shopee_connected=1`)

    // HttpOnly cookie for the actual token (not accessible by JS)
    res.cookies.set('shopee_access_token', tokens.access_token, {
      ...COOKIE_OPTS,
      httpOnly: true,
    })
    res.cookies.set('shopee_refresh_token', tokens.refresh_token, {
      ...COOKIE_OPTS,
      httpOnly: true,
    })
    res.cookies.set('shopee_shop_id', String(shopId), COOKIE_OPTS)

    // Non-httpOnly cookies for UI display
    res.cookies.set('shopee_shop_name', shopName, COOKIE_OPTS)
    res.cookies.set('shopee_connected', '1', COOKIE_OPTS)

    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'oauth_failed'
    return NextResponse.redirect(
      `${origin}/settings?shopee_error=${encodeURIComponent(message)}`
    )
  }
}
