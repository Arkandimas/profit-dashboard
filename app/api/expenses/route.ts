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
  const platform = searchParams.get('platform') // optional filter; expects 'All' | 'Shopee' | 'TikTok Shop'

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days)

  let query = supabase
    .from('expenses')
    .select('id, category, amount, description, platform, date, created_at')
    .gte('created_at', fromDate.toISOString())
    .order('created_at', { ascending: false })

  if (platform && platform !== 'All') query = query.eq('platform', platform)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const payload = {
      category: body.category,
      amount: Number(body.amount),
      description: body.description ?? null,
      platform: body.platform ?? 'All',
      date: body.date,
    }

    const { data, error } = await supabase
      .from('expenses')
      .insert(payload)
      .select('id, category, amount, description, platform, date, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const payload = {
      category: body.category,
      amount: Number(body.amount),
      description: body.description ?? null,
      platform: body.platform ?? 'All',
      date: body.date,
    }

    const { data, error } = await supabase
      .from('expenses')
      .update(payload)
      .eq('id', id)
      .select('id, category, amount, description, platform, date, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const idFromQuery = searchParams.get('id')
    const body = await request.json().catch(() => ({}))
    const id = body.id ?? idFromQuery
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

