import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * POST /api/admin/clear-orders
 * Deletes all Shopee orders from the database so a clean re-sync can be run.
 * Returns { deleted: N } on success.
 */
export async function POST() {
  try {
    const { error, count } = await supabase
      .from('orders')
      .delete({ count: 'exact' })
      .eq('platform', 'Shopee')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: count ?? 0 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
