import { NextResponse } from 'next/server'
import { getAuthDebugInfo } from '@/lib/shopee'

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const redirectUrl = `${origin}/api/shopee/callback`
  const info = getAuthDebugInfo(redirectUrl)
  return NextResponse.json(info)
}
