import { NextResponse } from 'next/server'

/**
 * DEPRECATED — This all-in-one sync route is too slow for Vercel Hobby (10s limit).
 * Use the incremental pipeline instead:
 *   1. POST /api/shopee/sync/orders?days=30&chunk=0  (loop chunks until done)
 *   2. POST /api/shopee/sync/details                  (loop until done)
 *   3. POST /api/shopee/sync/escrow                   (loop until done)
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This route is deprecated. Use /api/shopee/sync/orders, /sync/details, /sync/escrow instead.',
      migration: {
        step1: 'POST /api/shopee/sync/orders?days=30&chunk=0 (loop until done)',
        step2: 'POST /api/shopee/sync/details (loop until done)',
        step3: 'POST /api/shopee/sync/escrow (loop until done)',
      },
    },
    { status: 410 }
  )
}
