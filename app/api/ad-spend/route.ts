import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function clampDays(raw: string | null) {
  const n = parseInt(raw ?? '90')
  if (Number.isNaN(n)) return 90
  return Math.min(Math.max(n, 1), 90)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = clampDays(searchParams.get('days'))
  const platform = searchParams.get('platform') // optional; 'All' to disable

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days)

  let query = supabase
    .from('ad_spend')
    .select('id, platform, campaign_name, amount, date, created_at')
    .gte('created_at', fromDate.toISOString())
    .order('created_at', { ascending: false })

  if (platform && platform !== 'All') query = query.eq('platform', platform)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

