'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, ChevronRight } from 'lucide-react'

interface Product {
  id: string
  product_id: string
  item_id: string | null
  model_id: string | null
  name: string
  variant_name: string | null
  sku: string
  platform: string
  price: number
  stock: number
  cogs_per_unit: number
  created_at: string
}

interface ProductGroup {
  item_id: string
  name: string
  platform: string
  variants: Product[]
  isSingle: boolean // true = 1 variant with no name → flat row, no chevron
}

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

const marginPct = (price: number, cogs: number) =>
  price > 0 ? ((price - cogs) / price) * 100 : 0

function MarginCell({ price, cogs }: { price: number; cogs: number }) {
  if (price <= 0) return <span className="text-muted-foreground">—</span>
  const m = marginPct(price, cogs)
  const cls = m >= 20 ? 'text-emerald-600' : m >= 10 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`font-medium ${cls}`}>{m.toFixed(1)}%</span>
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [platform, setPlatform] = useState<'All' | 'Shopee' | 'TikTok Shop'>('All')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const loadProducts = useCallback(() => {
    setLoading(true)
    fetch('/api/products')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setProducts(data) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  const syncProducts = () => {
    setSyncing(true)
    setSyncMsg('')
    fetch('/api/shopee/sync-products', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        setSyncMsg(data.error ? `Error: ${data.error}` : `Synced ${data.synced} variants`)
        if (!data.error) loadProducts()
      })
      .finally(() => setSyncing(false))
  }

  const startEdit = (product: Product) => {
    setEditingId(product.id)
    setEditValue(String(product.cogs_per_unit ?? 0))
  }

  const saveEdit = (id: string) => {
    const cogs_per_unit = parseFloat(editValue) || 0
    fetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, cogs_per_unit }),
    })
      .then(r => r.json())
      .then(updated => {
        setProducts(prev =>
          prev.map(p => p.id === id ? { ...p, cogs_per_unit: updated.cogs_per_unit } : p)
        )
      })
    setEditingId(null)
  }

  const toggleExpand = (itemId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(itemId) ? next.delete(itemId) : next.add(itemId)
      return next
    })
  }

  // Group by item_id, applying platform filter
  const groups = useMemo<ProductGroup[]>(() => {
    const filtered = platform === 'All' ? products : products.filter(p => p.platform === platform)
    const map = new Map<string, Product[]>()
    for (const p of filtered) {
      const key = p.item_id ?? p.product_id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries()).map(([item_id, variants]) => {
      const isSingle = variants.length === 1 && !variants[0].variant_name
      return {
        item_id,
        name: variants[0].name,
        platform: variants[0].platform,
        variants,
        isSingle,
      }
    })
  }, [products, platform])

  const CogsCell = ({ product }: { product: Product }) => {
    const isEditingThis = editingId === product.id
    return (
      <td
        className="py-2 pr-3 text-right cursor-pointer"
        onClick={() => { if (!isEditingThis) startEdit(product) }}
      >
        {isEditingThis ? (
          <Input
            autoFocus
            type="number"
            value={editValue}
            className="w-32 text-right h-7 ml-auto"
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => saveEdit(product.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveEdit(product.id)
              if (e.key === 'Escape') setEditingId(null)
            }}
          />
        ) : (
          <span className="hover:underline text-emerald-600 font-medium">
            {fmt(product.cogs_per_unit ?? 0)}
          </span>
        )}
      </td>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground text-sm">Manage COGS per variant</p>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className={`text-sm font-medium ${syncMsg.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
              {syncMsg}
            </span>
          )}
          <Button onClick={syncProducts} disabled={syncing} variant="outline" size="sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Products'}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        {(['All', 'Shopee', 'TikTok Shop'] as const).map(p => (
          <Button key={p} size="sm" variant={platform === p ? 'default' : 'outline'} onClick={() => setPlatform(p)}>
            {p}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{groups.length} products</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : groups.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No products found. Click &quot;Sync Products&quot; to import from Shopee.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-3 font-medium w-6" />
                    <th className="text-left py-2 pr-3 font-medium">Product / Variant</th>
                    <th className="text-left py-2 pr-3 font-medium">SKU</th>
                    <th className="text-left py-2 pr-3 font-medium">Platform</th>
                    <th className="text-right py-2 pr-3 font-medium">Price</th>
                    <th className="text-right py-2 pr-3 font-medium">Stock</th>
                    <th className="text-right py-2 pr-3 font-medium">COGS/unit ✎</th>
                    <th className="text-right py-2 font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => {
                    const isOpen = expanded.has(group.item_id)
                    const totalStock = group.variants.reduce((s, v) => s + (v.stock ?? 0), 0)
                    const avgCogs = group.variants.reduce((s, v) => s + (v.cogs_per_unit ?? 0), 0) / group.variants.length
                    const avgPrice = group.variants.reduce((s, v) => s + (v.price ?? 0), 0) / group.variants.length
                    const avgMargin = marginPct(avgPrice, avgCogs)

                    if (group.isSingle) {
                      // Flat row — no chevron, no children
                      const p = group.variants[0]
                      return (
                        <tr key={group.item_id} className="border-b hover:bg-muted/30">
                          <td className="py-2 pr-3 w-6" />
                          <td className="py-2 pr-3 font-medium max-w-[200px] truncate" title={p.name}>{p.name}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{p.sku || '—'}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className="text-orange-500 border-orange-300 text-xs">{p.platform}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-right">{fmt(p.price ?? 0)}</td>
                          <td className="py-2 pr-3 text-right">{p.stock ?? 0}</td>
                          <CogsCell product={p} />
                          <td className="py-2 text-right text-xs"><MarginCell price={p.price} cogs={p.cogs_per_unit} /></td>
                        </tr>
                      )
                    }

                    return (
                      <>
                        {/* Parent row */}
                        <tr
                          key={`parent-${group.item_id}`}
                          className="border-b hover:bg-muted/30 cursor-pointer select-none bg-slate-50/50 dark:bg-slate-800/20"
                          onClick={() => toggleExpand(group.item_id)}
                        >
                          <td className="py-2.5 pr-3 w-6">
                            <ChevronRight
                              className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                            />
                          </td>
                          <td className="py-2.5 pr-3 font-semibold max-w-[200px]">
                            <span className="truncate block" title={group.name}>{group.name}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">—</td>
                          <td className="py-2.5 pr-3">
                            <Badge variant="outline" className="text-orange-500 border-orange-300 text-xs">{group.platform}</Badge>
                          </td>
                          <td className="py-2.5 pr-3 text-right text-muted-foreground text-xs">—</td>
                          <td className="py-2.5 pr-3 text-right">
                            <span className="font-medium">{totalStock}</span>
                            <span className="text-muted-foreground text-xs ml-1.5">
                              <Badge variant="secondary" className="text-xs ml-1">{group.variants.length} variants</Badge>
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-right text-muted-foreground text-xs">{fmt(avgCogs)}</td>
                          <td className="py-2.5 text-right text-xs">
                            <span className={`font-medium ${avgMargin >= 20 ? 'text-emerald-600' : avgMargin >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {avgPrice > 0 ? `${avgMargin.toFixed(1)}%` : '—'}
                            </span>
                          </td>
                        </tr>

                        {/* Child rows */}
                        {isOpen && group.variants.map(variant => (
                          <tr key={variant.id} className="border-b hover:bg-muted/30 bg-white dark:bg-transparent">
                            <td className="py-2 pr-3 w-6">
                              <span className="text-muted-foreground text-xs pl-1">↳</span>
                            </td>
                            <td className="py-2 pr-3 pl-3 text-muted-foreground max-w-[200px] truncate" title={variant.variant_name ?? ''}>
                              {variant.variant_name || '—'}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{variant.sku || '—'}</td>
                            <td className="py-2 pr-3" />
                            <td className="py-2 pr-3 text-right">{fmt(variant.price ?? 0)}</td>
                            <td className="py-2 pr-3 text-right">{variant.stock ?? 0}</td>
                            <CogsCell product={variant} />
                            <td className="py-2 text-right text-xs"><MarginCell price={variant.price} cogs={variant.cogs_per_unit} /></td>
                          </tr>
                        ))}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
