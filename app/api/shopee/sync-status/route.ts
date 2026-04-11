import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/shopee/sync-status
 *
 * Returns the latest entry from sync_logs so the frontend can poll
 * for async Edge Function completion.
 *
 * Response: { last_sync: string | null, status: string | null, synced_count: number }
 */
export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { data, error } = await supabase
      .from('sync_logs')
      .select('created_at, status, synced_count, sync_type')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is fine
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      last_sync: data?.created_at ?? null,
      status: data?.status ?? null,
      synced_count: data?.synced_count ?? 0,
      sync_type: data?.sync_type ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
