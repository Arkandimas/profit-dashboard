import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const jar = await cookies()
  const connected = jar.get('shopee_connected')?.value === '1'
  const shopName = jar.get('shopee_shop_name')?.value ?? null

  return NextResponse.json({ connected, shop_name: shopName })
}
