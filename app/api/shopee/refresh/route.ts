import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { refreshAccessToken } from '@/lib/shopee'

const COOKIE_OPTS = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

export async function POST() {
  try {
    const jar = await cookies()

    // Cookies are the primary source; env vars are the read-only fallback for
    // cases where the browser session was lost (e.g. new device, expired cookie).
    const refreshToken =
      jar.get('shopee_refresh_token')?.value ??
      process.env.SHOPEE_REFRESH_TOKEN?.trim() ??
      undefined

    const shopIdStr =
      jar.get('shopee_shop_id')?.value ??
      process.env.SHOPEE_SHOP_ID?.trim() ??
      undefined
    const shopId = shopIdStr ? parseInt(shopIdStr) : 0

    if (!refreshToken || !shopId) {
      return NextResponse.json(
        {
          error: 'No refresh token or shop ID found. Please reconnect Shopee in Settings.',
          reconnect_required: true,
        },
        { status: 401 }
      )
    }

    const tokens = await refreshAccessToken(refreshToken, shopId)

    const res = NextResponse.json({ success: true, expires_in: 14400 })

    // Write fresh tokens back to cookies — this is the only write path.
    // Vercel env vars are read-only at runtime and cannot be hot-updated
    // from serverless functions without a full redeployment.
    res.cookies.set('shopee_access_token', tokens.access_token, {
      ...COOKIE_OPTS,
      httpOnly: true,
    })
    res.cookies.set('shopee_refresh_token', tokens.refresh_token, {
      ...COOKIE_OPTS,
      httpOnly: true,
    })

    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refresh token failed'
    return NextResponse.json(
      { error: message, reconnect_required: true },
      { status: 401 }
    )
  }
}
