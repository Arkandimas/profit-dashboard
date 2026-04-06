'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw } from 'lucide-react'
import { formatCurrency, orderCountsForShopeeKpi } from '@/lib/dummy-data'
import type { Order } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

function safeDate(raw: string | null | undefined) {
  if (!raw) return null
  const value = new Date(raw)
  return Number.isNaN(value.getTime()) ? null : value
}

export default function ExpensesPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/orders?days=90&platform=Shopee')
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) {
          setError(data.error)
          setOrders([])
          return
        }
        setOrders(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        setError('Failed to load orders')
        setOrders([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const feeOrders = useMemo(
    () => orders.filter((o) => orderCountsForShopeeKpi(o.status)),
    [orders]
  )

  const totals = useMemo(() => {
    const shipping = feeOrders.reduce((s, o) => s + (Number(o.shipping_fee) || 0), 0)
    const platform = feeOrders.reduce((s, o) => s + (Number(o.platform_fee) || 0), 0)
    const cogs = feeOrders.reduce((s, o) => s + (Number(o.cogs) || 0), 0)
    return { shipping, platform, cogs, all: shipping + platform + cogs }
  }, [feeOrders])

  const monthlySummaries = useMemo(() => {
    const now = new Date()
    return [0, 1, 2].map((i) => {
      const date = subMonths(now, i)
      const start = startOfMonth(date)
      const end = endOfMonth(date)
      const monthRows = feeOrders.filter((o) => {
        const d = safeDate(o.paid_at || o.created_at)
        if (!d) return false
        return d >= start && d <= end
      })
      const shipping = monthRows.reduce((s, o) => s + (Number(o.shipping_fee) || 0), 0)
      const platform = monthRows.reduce((s, o) => s + (Number(o.platform_fee) || 0), 0)
      const cogs = monthRows.reduce((s, o) => s + (Number(o.cogs) || 0), 0)
      return {
        month: format(date, 'MMMM yyyy'),
        shipping,
        platform,
        cogs,
        total: shipping + platform + cogs,
        orderCount: monthRows.length,
      }
    })
  }, [feeOrders])

  const sorted = useMemo(
    () =>
      [...feeOrders].sort(
        (a, b) =>
          (safeDate(b.paid_at || b.created_at)?.getTime() ?? 0) -
          (safeDate(a.paid_at || a.created_at)?.getTime() ?? 0)
      ),
    [feeOrders]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground text-sm">
            Biaya dari order Shopee yang sudah di-sync: ongkir aktual + komisi platform (+ COGS jika ada).
            TikTok tidak dipakai di halaman ini.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ongkir (90 hari)</CardTitle>
            <p className="text-2xl font-bold">{formatCurrency(totals.shipping)}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fee platform</CardTitle>
            <p className="text-2xl font-bold">{formatCurrency(totals.platform)}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">COGS (order)</CardTitle>
            <p className="text-2xl font-bold">{formatCurrency(totals.cogs)}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total biaya order</CardTitle>
            <p className="text-2xl font-bold">{formatCurrency(totals.all)}</p>
            <p className="text-xs text-muted-foreground">{feeOrders.length} order dihitung</p>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {monthlySummaries.map((s) => (
          <Card key={s.month}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.month}</CardTitle>
              <p className="text-xl font-bold">{formatCurrency(s.total)}</p>
              <p className="text-xs text-muted-foreground">{s.orderCount} order</p>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ongkir</span>
                <span className="font-medium">{formatCurrency(s.shipping)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee platform</span>
                <span className="font-medium">{formatCurrency(s.platform)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">COGS</span>
                <span className="font-medium">{formatCurrency(s.cogs)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Rincian per order ({sorted.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Data dari Supabase setelah sync Shopee. Iklan Shopee tidak termasuk di sini — nanti dari CSV/import terpisah.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">Memuat…</p>
          ) : sorted.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              Belum ada order Shopee yang eligible. Sinkronkan order dari Dashboard, lalu refresh.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tanggal (bayar)</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Order</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ongkir</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Fee</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">COGS</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Subtotal</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((o) => {
                    const ship = Number(o.shipping_fee) || 0
                    const fee = Number(o.platform_fee) || 0
                    const cogs = Number(o.cogs) || 0
                    const sub = ship + fee + cogs
                    return (
                      <tr key={o.id} className="border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {(() => {
                            const value = safeDate(o.paid_at || o.created_at)
                            return value ? format(value, 'd MMM yyyy') : '—'
                          })()}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{o.order_id}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(ship)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(fee)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(cogs)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(sub)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs border-orange-200 text-orange-700">
                            {o.status}
                          </Badge>
                        </td>
                      </tr>
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
