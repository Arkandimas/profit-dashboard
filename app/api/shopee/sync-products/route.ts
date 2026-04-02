import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { getItemList, getItemBaseInfo, getItemModelList } from '@/lib/shopee'

export async function POST() {
  try {
    const jar = await cookies()
    const accessToken = jar.get('shopee_access_token')?.value
    const shopIdStr = jar.get('shopee_shop_id')?.value
    const shopId = shopIdStr ? parseInt(shopIdStr) : 0

    if (!accessToken || !shopId) {
      return NextResponse.json(
        { error: 'Not connected to Shopee. Please connect in Settings.' },
        { status: 401 }
      )
    }

    let offset = 0
    let hasMore = true
    let totalSynced = 0

    while (hasMore) {
      const listResult = await getItemList(accessToken, shopId, offset, 100, 'NORMAL')
      const items = listResult.items

      if (items.length > 0) {
        const itemIds = items.map((i) => i.item_id)
        const details = await getItemBaseInfo(itemIds, accessToken, shopId)

        for (const item of details) {
          const models = await getItemModelList(item.item_id, accessToken, shopId)

          let rows: object[]

          if (models.length > 0) {
            // Multi-variant item — one row per model
            rows = models.map((model) => ({
              platform: 'Shopee',
              item_id: String(item.item_id),
              model_id: String(model.model_id),
              product_id: String(model.model_id),
              name: item.item_name,
              variant_name: model.model_name || null,
              sku: model.model_sku || item.item_sku || '',
              price: model.price_info?.[0]?.current_price ?? 0,
              stock: model.stock_info?.[0]?.current_available_stock ?? 0,
              cogs_per_unit: 0,
            }))
          } else {
            // Single-variant item — one row for the item itself
            rows = [{
              platform: 'Shopee',
              item_id: String(item.item_id),
              model_id: String(item.item_id),
              product_id: String(item.item_id),
              name: item.item_name,
              variant_name: null,
              sku: item.item_sku || '',
              price: item.price_info?.[0]?.current_price ?? 0,
              stock: 0,
              cogs_per_unit: 0,
            }]
          }

          const { error } = await supabase
            .from('products')
            .upsert(rows, { onConflict: 'item_id,model_id' })

          if (error) throw new Error(`Upsert failed: ${error.message}`)
          totalSynced += rows.length
        }
      }

      hasMore = listResult.has_next_page
      offset = listResult.next_offset
    }

    return NextResponse.json({ synced: totalSynced })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
