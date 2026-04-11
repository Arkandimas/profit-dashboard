// Triggered every 6 hours by Supabase cron (schedule defined in config.toml).
// Calls sync-orders (last 1 day) then sync-escrow sequentially.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SHOPEE_SHOP_ID = Deno.env.get('SHOPEE_SHOP_ID') ?? ''

Deno.serve(async (_req) => {
  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    }

    const body = JSON.stringify({ days: 1, shop_id: Number(SHOPEE_SHOP_ID) })

    // Step 1: sync orders for the last day
    const ordersRes = await fetch(`${SUPABASE_URL}/functions/v1/sync-orders`, {
      method: 'POST',
      headers,
      body,
    })
    const ordersData = await ordersRes.json().catch(() => ({}))

    if (!ordersRes.ok) {
      return Response.json(
        { error: 'sync-orders failed', detail: ordersData },
        { status: 500 }
      )
    }

    // Step 2: sync escrow
    const escrowRes = await fetch(`${SUPABASE_URL}/functions/v1/sync-escrow`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ shop_id: Number(SHOPEE_SHOP_ID) }),
    })
    const escrowData = await escrowRes.json().catch(() => ({}))

    return Response.json({
      orders: ordersData,
      escrow: escrowData,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
})
