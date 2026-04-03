import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '90'), 1), 90)
  const platform = searchParams.get('platform') // optional filter

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days)
  const fromIso = fromDate.toISOString()

  // Include rows that might fall into the dashboard window on paid_at even if create_time is older.
  let query = supabase
    .from('orders')
    .select('id, platform, order_id, revenue, cogs, shipping_fee, platform_fee, status, created_at, paid_at')
    // Quote ISO timestamps so PostgREST parses colons in values correctly.
    .or(`created_at.gte."${fromIso}",paid_at.gte."${fromIso}"`)
    .order('created_at', { ascending: false })

  if (platform && platform !== 'All') {
    query = query.eq('platform', platform)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
