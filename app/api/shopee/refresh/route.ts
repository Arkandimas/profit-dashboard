import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { refreshAccessToken } from '@/lib/shopee'

const COOKIE_OPTS = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

export async function POST(request: Request) {
  try {
    const jar = await cookies()
    const refreshToken = jar.get('shopee_refresh_token')?.value
    const shopIdStr = jar.get('shopee_shop_id')?.value
    const shopId = shopIdStr ? parseInt(shopIdStr) : 0

    if (!refreshToken || !shopId) {
      return NextResponse.json(
        { error: 'No refresh token or shop ID found. Please connect in Settings.' },
        { status: 401 }
      )
    }

    const tokens = await refreshAccessToken(refreshToken, shopId)

    const res = NextResponse.json({ success: true })

    // Save new tokens
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
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
