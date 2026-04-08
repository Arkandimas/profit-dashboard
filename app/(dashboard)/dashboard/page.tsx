'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from 'recharts'
import { DollarSign, ShoppingCart, TrendingUp, Percent, Package, Megaphone, RefreshCw, Tag, Database } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/kpi-card'
import { DateRangePicker } from '@/components/date-range-picker'
import {
  dummyOrders,
  filterByDateRange,
  filterOrdersByReportDate,
  getDateRange,
  getPreviousPeriod,
  calcMetrics,
  formatCurrency,
  orderCountsForShopeeKpi,
} from '@/lib/dummy-data'
import type { AdSpend, Expense, Order } from '@/lib/supabase'
import { format, eachDayOfInterval } from 'date-fns'

const NO_MANUAL_EXPENSES: Expense[] = []

const PLATFORMS = ['All', 'Shopee'] as const
type PlatformFilter = (typeof PLATFORMS)[number]

function safeDate(raw: string | null | undefined) {
  if (!raw) return null
  const value = new Date(raw)
  return Number.isNaN(value.getTime()) ? null : value
}

function reportTimeMs(o: Order): number {
  return safeDate(o.paid_at || o.created_at)?.getTime() ?? 0
}

const CHART_METRICS = ['GMV', 'Revenue', 'Orders'] as const
type ChartMetric = (typeof CHART_METRICS)[number]

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

type SyncStatus =
  | { state: 'idle' }
  | { state: 'loading'; msg: string }
  | { state: 'success'; orderCount: number; escrowCount: number }
  | { state: 'error'; message: string; reconnect_required?: boolean }
type EscrowSyncStatus = { state: 'idle' } | { state: 'loading' } | { state: 'success'; count: number } | { state: 'error'; message: string }

export default function DashboardPage() {
  const [datePreset, setDatePreset] = useState('last30')
  const [platform, setPlatform] = useState<PlatformFilter>('Shopee')
  const [chartMetric, setChartMetric] = useState<ChartMetric>('GMV')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' })
  const [escrowSyncStatus, setEscrowSyncStatus] = useState<EscrowSyncStatus>({ state: 'idle' })
  const [shopeeConnected, setShopeeConnected] = useState<boolean | null>(null)
  const [liveOrders, setLiveOrders] = useState<typeof dummyOrders | null>(null)
  const [liveAdSpend, setLiveAdSpend] = useState<AdSpend[]>([])

  useEffect(() => {
    fetch('/api/shopee/status')
      .then((r) => r.json())
      .then((data) => setShopeeConnected(!!data.connected))
      .catch(() => setShopeeConnected(false))
  }, [])

  useEffect(() => {
    // Fetch a superset so both the current period and the previous period have data.
    // (The date preset UI supports up to ~30 days, and we compare with the previous period of the same length.)
    fetch('/api/orders?days=90')
      .then((r) => r.json())
      .then((data) => {
        // Always set state (even if empty) so we never fall back to dummy data.
        setLiveOrders(Array.isArray(data) ? data : [])
      })
      .catch(() => {/* keep dummy */})
  }, [])

  useEffect(() => {
    fetch('/api/ad-spend?days=90')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLiveAdSpend(data) })
      .catch(() => { /* keep empty */ })
  }, [])

  async function handleShopeeSync(days = 30) {
    setSyncStatus({ state: 'loading', msg: `Listing orders (last ${days} days)…` })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300_000) // 5 min — details loop needs time for large stores
    try {
      // ── Step 1: Fetch order list stubs ────────────────────────────────────
      // Default: 30 days (2 × 15-day chunks). Full sync: 90 days (6 chunks).
      // Each chunk paginates independently; all results upserted as stubs.
      const ordersRes = await fetch(`/api/shopee/sync/orders?days=${days}`, { method: 'POST', signal: controller.signal })
      const ordersData = await ordersRes.json().catch(() => ({ error: `Server error (HTTP ${ordersRes.status})` }))
      if (ordersData.reconnect_required) {
        clearTimeout(timeout)
        setSyncStatus({
          state: 'error',
          message: 'Session expired — please reconnect Shopee in Settings.',
          reconnect_required: true,
        })
        return
      }
      if (!ordersRes.ok) throw new Error(ordersData.error ?? 'Order sync failed')

      const queued: number = ordersData.synced ?? 0
      setSyncStatus({ state: 'loading', msg: `Orders listed: ${queued} — fetching details…` })

      // ── Step 2: Fetch order details in batches until done ──────────────────
      // Each call processes up to 50 orders, finishes in < 5s on Hobby plan.
      let detailsSynced = 0
      let detailsIteration = 0
      while (true) {
        const detailsRes = await fetch('/api/shopee/sync/details', { method: 'POST', signal: controller.signal })
        const detailsData = await detailsRes.json().catch(() => ({ done: true, updated: 0, remaining: 0 }))
        if (!detailsRes.ok) break // non-fatal

        detailsSynced += detailsData.updated ?? 0
        detailsIteration++
        setSyncStatus({ state: 'loading', msg: `Details synced: ${detailsSynced}${detailsData.remaining > 0 ? `, ${detailsData.remaining} remaining…` : ''}` })

        // Refresh DB view every 3 detail batches so dashboard updates live
        if (detailsIteration % 3 === 0) {
          fetch('/api/orders?days=90').then((r) => r.json()).then((data) => {
            if (Array.isArray(data)) setLiveOrders(data)
          }).catch(() => {})
        }

        if (detailsData.done) break
      }

      // Refresh after details are done
      fetch('/api/orders?days=90').then((r) => r.json()).then((data) => {
        if (Array.isArray(data)) setLiveOrders(data)
      }).catch(() => {})

      // Escrow sync is handled by a background cron job (every 15 min).
      // Skipping it here prevents timeouts on large stores (1000+ orders).

      clearTimeout(timeout)
      setSyncStatus({ state: 'success', orderCount: queued, escrowCount: 0 })

      // Final refresh with fully-synced data
      const ordFinal = await fetch('/api/orders?days=90').then((r) => r.json())
      setLiveOrders(Array.isArray(ordFinal) ? ordFinal : [])
    } catch (err) {
      clearTimeout(timeout)
      const message = err instanceof Error
        ? (err.name === 'AbortError' ? 'Sync timed out — try again' : err.message)
        : 'Sync failed'
      setSyncStatus({ state: 'error', message })
    } finally {
      setTimeout(() => setSyncStatus({ state: 'idle' }), 5_000)
    }
  }

  async function handleEscrowSync() {
    setEscrowSyncStatus({ state: 'loading' })
    try {
      let totalSynced = 0
      for (;;) {
        const res = await fetch('/api/shopee/sync/escrow', { method: 'POST' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Escrow sync failed')
        totalSynced += data.synced ?? 0
        if (data.done) break
      }
      setEscrowSyncStatus({ state: 'success', count: totalSynced })
      const ord = await fetch('/api/orders?days=90').then((r) => r.json())
      setLiveOrders(Array.isArray(ord) ? ord : [])
    } catch (err) {
      setEscrowSyncStatus({ state: 'error', message: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setTimeout(() => setEscrowSyncStatus({ state: 'idle' }), 4000)
    }
  }

  const { from, to } = useMemo(() => getDateRange(datePreset), [datePreset])
  const prev = useMemo(() => getPreviousPeriod(from, to), [from, to])

  // Use only live Supabase orders for realtime correctness.
  const allOrders = liveOrders ?? []

  const filteredOrders = useMemo(() => {
    let orders = filterOrdersByReportDate(allOrders, from, to)
    if (platform !== 'All') orders = orders.filter((o) => o.platform === platform)
    return orders
  }, [allOrders, from, to, platform])

  const filteredPrevOrders = useMemo(() => {
    let orders = filterOrdersByReportDate(allOrders, prev.from, prev.to)
    if (platform !== 'All') orders = orders.filter((o) => o.platform === platform)
    return orders
  }, [allOrders, prev, platform])

  const filteredAdSpend = useMemo(() => {
    let ads = filterByDateRange(liveAdSpend, from, to)
    if (platform !== 'All') ads = ads.filter((a) => a.platform === platform)
    return ads
  }, [from, to, platform, liveAdSpend])

  const filteredPrevAdSpend = useMemo(() => {
    let ads = filterByDateRange(liveAdSpend, prev.from, prev.to)
    if (platform !== 'All') ads = ads.filter((a) => a.platform === platform)
    return ads
  }, [prev, platform, liveAdSpend])

  const metrics = useMemo(
    () => calcMetrics(filteredOrders, filteredAdSpend, NO_MANUAL_EXPENSES),
    [filteredOrders, filteredAdSpend]
  )
  const prevMetrics = useMemo(
    () => calcMetrics(filteredPrevOrders, filteredPrevAdSpend, NO_MANUAL_EXPENSES),
    [filteredPrevOrders, filteredPrevAdSpend]
  )

  function pctChange(current: number, previous: number) {
    if (previous === 0) return 0
    return ((current - previous) / previous) * 100
  }

  // Chart data: daily aggregation (grouped by paid_at date)
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: from, end: to })
    return days.map((day) => {
      const label = format(day, 'yyyy-MM-dd')
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0)
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59)
      const dayOrders = filterOrdersByReportDate(filteredOrders, dayStart, dayEnd)
      const dayAds = filterByDateRange(filteredAdSpend, dayStart, dayEnd)
      const m = calcMetrics(dayOrders, dayAds, NO_MANUAL_EXPENSES)
      const gmv = dayOrders.reduce((s, o) => s + (Number(o.gmv) || 0), 0)
      return {
        date: label,
        GMV: Math.round(gmv / 1000),
        Revenue: Math.round(m.revenue / 1000),
        Orders: m.orders,
      }
    })
  }, [filteredOrders, filteredAdSpend, from, to])

  const gmvTotal = useMemo(
    () => filteredOrders.reduce((s, o) => s + (Number(o.gmv) || 0), 0),
    [filteredOrders]
  )

  const cancelledOrders = useMemo(
    () =>
      filteredOrders.filter((o) => ['cancelled', 'canceled', 'in_cancel'].includes((o.status ?? '').toLowerCase().trim())).length,
    [filteredOrders]
  )

  const paidOrders = metrics.orders
  const conversionHint = useMemo(() => {
    const denom = paidOrders + cancelledOrders
    if (denom <= 0) return '—'
    return `${((paidOrders / denom) * 100).toFixed(1)}% paid rate`
  }, [paidOrders, cancelledOrders])

  // Escrow-aware fee breakdown — uses real values when escrow_synced = true
  const escrowSyncedCount = useMemo(
    () => filteredOrders.filter((o) => o.escrow_synced).length,
    [filteredOrders]
  )

  const { commissionTotal, serviceFeeTotal, amsTotal, processingTotal } = useMemo(() => {
    const paid = filteredOrders.filter((o) => orderCountsForShopeeKpi(o.status))
    return {
      commissionTotal: paid.reduce((s, o) =>
        s + (o.escrow_synced ? (o.commission_fee_actual ?? 0) : (Number(o.commission_fee) || 0)), 0),
      serviceFeeTotal: paid.reduce((s, o) =>
        s + (o.escrow_synced ? (o.service_fee_actual ?? 0) : (Number(o.service_fee) || 0)), 0),
      amsTotal: paid.reduce((s, o) => s + (o.ams_commission ?? 0), 0),
      processingTotal: paid.reduce((s, o) => s + (o.processing_fee ?? 0), 0),
    }
  }, [filteredOrders])

  const platformFees = useMemo(
    () => commissionTotal + serviceFeeTotal + amsTotal + processingTotal,
    [commissionTotal, serviceFeeTotal, amsTotal, processingTotal]
  )

  // Net Revenue: use sum of escrow_amount when available (most accurate),
  // fall back to revenue - platformFees for unsynced orders.
  const escrowAmountTotal = useMemo(
    () => filteredOrders
      .filter((o) => orderCountsForShopeeKpi(o.status) && o.escrow_synced)
      .reduce((s, o) => s + (Number(o.escrow_amount) || 0), 0),
    [filteredOrders]
  )
  const netRevenue = useMemo(() => {
    if (escrowSyncedCount > 0) return escrowAmountTotal
    return metrics.revenue - platformFees
  }, [escrowSyncedCount, escrowAmountTotal, metrics.revenue, platformFees])

  const netProfit = useMemo(() => netRevenue - metrics.cogs - metrics.adSpendTotal, [netRevenue, metrics.cogs, metrics.adSpendTotal])

  // Waterfall breakdown: GMV → Diskon → Revenue → Komisi → Serv.Fee → AMS → Proc.Fee → COGS → Profit
  const waterfallData = useMemo(() => {
    const rev = metrics.revenue
    const cg = metrics.cogs
    const commission = commissionTotal
    const svc = serviceFeeTotal
    const ams = amsTotal
    const proc = processingTotal
    const discount = Math.max(0, gmvTotal - rev)
    const profit = rev - commission - svc - ams - proc - cg
    return [
      { name: 'GMV',      base: 0,                                                       value: gmvTotal,         fill: '#6366f1' },
      { name: 'Diskon',   base: rev,                                                      value: discount,         fill: '#f59e0b' },
      { name: 'Revenue',  base: 0,                                                        value: rev,              fill: '#3b82f6' },
      { name: 'Komisi',   base: Math.max(0, rev - commission),                            value: commission,       fill: '#ef4444' },
      { name: 'Serv.Fee', base: Math.max(0, rev - commission - svc),                     value: svc,              fill: '#ef4444' },
      { name: 'AMS',      base: Math.max(0, rev - commission - svc - ams),               value: ams,              fill: '#f97316' },
      { name: 'Proc.Fee', base: Math.max(0, rev - commission - svc - ams - proc),        value: proc,             fill: '#ef4444' },
      { name: 'COGS',     base: Math.max(0, rev - commission - svc - ams - proc - cg),  value: cg,               fill: '#ef4444' },
      { name: 'Profit',   base: 0,                                                        value: Math.abs(profit), fill: profit >= 0 ? '#10b981' : '#ef4444' },
    ]
  }, [gmvTotal, metrics.revenue, metrics.cogs, commissionTotal, serviceFeeTotal, amsTotal, processingTotal])

  // Pie data — Shopee Ads shown as separate slice from general Ad Spend
  const pieData = [
    { name: 'COGS', value: metrics.cogs },
    { name: 'Shipping', value: metrics.shippingCost },
    { name: 'Platform Fee', value: metrics.platformFees },
    { name: 'Ad Spend', value: metrics.adSpendTotal - metrics.shopeeAdsExpenses },
    { name: 'Shopee Ads', value: metrics.shopeeAdsExpenses },
    { name: 'Other', value: metrics.otherExpenses },
  ].filter((d) => d.value > 0)

  // Recent orders
  const recentOrders = useMemo(
    () =>
      [...filteredOrders]
        .filter((o) => orderCountsForShopeeKpi(o.status))
        .sort((a, b) => reportTimeMs(b) - reportTimeMs(a))
        .slice(0, 10),
    [filteredOrders]
  )

  const yAxisTickFormatter = (value: number) => {
    if (chartMetric === 'Orders') return `${value}`
    return `${value}K`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {liveOrders
              ? `Live data · ${liveOrders.length} orders synced${escrowSyncedCount > 0 ? ` · ${escrowSyncedCount} escrow-verified` : ''}`
              : 'Demo data'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {syncStatus.state === 'loading' && (
            <span className="text-sm text-orange-600 font-medium">
              {syncStatus.msg}
            </span>
          )}
          {syncStatus.state === 'success' && (
            <span className="text-sm text-emerald-600 font-medium">
              ✓ {syncStatus.orderCount} orders, {syncStatus.escrowCount} escrow synced
            </span>
          )}
          {syncStatus.state === 'error' && (
            <span className="text-sm text-red-600 font-medium">
              ✕ {syncStatus.message}
              {syncStatus.reconnect_required && (
                <a href="/settings" className="ml-1 underline">
                  Go to Settings
                </a>
              )}
            </span>
          )}
          {escrowSyncStatus.state === 'success' && (
            <span className="text-sm text-blue-600 font-medium">
              ✓ {escrowSyncStatus.count} escrow synced
            </span>
          )}
          {escrowSyncStatus.state === 'error' && (
            <span className="text-sm text-red-600 font-medium" title={escrowSyncStatus.message}>
              ✕ {escrowSyncStatus.message}
            </span>
          )}
          {shopeeConnected === true && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShopeeSync(30)}
              disabled={syncStatus.state === 'loading'}
              className="border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncStatus.state === 'loading' ? 'animate-spin' : ''}`} />
              {syncStatus.state === 'loading' ? 'Syncing…' : 'Sync Shopee (30 days)'}
            </Button>
          )}
          {shopeeConnected === true && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShopeeSync(90)}
              disabled={syncStatus.state === 'loading'}
              className="border-purple-200 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
            >
              <Database className={`w-3.5 h-3.5 mr-1.5 ${syncStatus.state === 'loading' ? 'animate-spin' : ''}`} />
              {syncStatus.state === 'loading' ? 'Syncing…' : 'Full Sync (90 days)'}
            </Button>
          )}
          {shopeeConnected === true && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEscrowSync}
              disabled={escrowSyncStatus.state === 'loading'}
              className="border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            >
              <Database className={`w-3.5 h-3.5 mr-1.5 ${escrowSyncStatus.state === 'loading' ? 'animate-spin' : ''}`} />
              {escrowSyncStatus.state === 'loading' ? 'Syncing…' : 'Sync Escrow'}
            </Button>
          )}
          <DateRangePicker value={datePreset} onChange={setDatePreset} />
        </div>
      </div>

      {/* Platform filter */}
      <div className="flex gap-2 flex-wrap">
        {PLATFORMS.map((p) => (
          <Button
            key={p}
            variant={platform === p ? 'default' : 'outline'}
            size="sm"
            className={platform === p ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            onClick={() => setPlatform(p)}
          >
            {p === 'Shopee' && <span className="w-2 h-2 bg-orange-500 rounded-full mr-1.5" />}
            {p}
          </Button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            title="GMV"
            value={formatCurrency(gmvTotal)}
            icon={<Tag className="w-4 h-4" />}
            tooltip="Total harga item sebelum voucher/diskon apapun. Termasuk pesanan dibatalkan."
          />
          <KpiCard
            title="Penjualan (Shopee)"
            value={formatCurrency(metrics.penjualan)}
            icon={<DollarSign className="w-4 h-4" />}
            tooltip="Definisi Shopee Seller Center: GMV dikurangi voucher dari penjual saja. Termasuk pesanan dibatalkan & dikembalikan."
            colorScheme="orange"
          />
          <KpiCard
            title="Pesanan Dibayar"
            value={paidOrders.toLocaleString()}
            icon={<ShoppingCart className="w-4 h-4" />}
            tooltip="Jumlah order yang sudah dikonfirmasi pembayarannya. Tidak termasuk UNPAID, CANCELLED, dan RETURNED."
          />
          <KpiCard
            title="Pesanan Dibatalkan"
            value={cancelledOrders.toLocaleString()}
            icon={<Package className="w-4 h-4" />}
            tooltip="Order yang dibatalkan atau dikembalikan dalam periode ini. Shopee menghitung ini dalam 'Total Penjualan'."
          />
          <KpiCard
            title="Conversion"
            value={conversionHint}
            icon={<Percent className="w-4 h-4" />}
            tooltip="Paid rate = Pesanan Dibayar / (Pesanan Dibayar + Dibatalkan)."
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            title={escrowSyncedCount > 0 ? 'Platform Fee ✓' : 'Platform Fee (est.)'}
            value={formatCurrency(platformFees)}
            icon={<Megaphone className="w-4 h-4" />}
            tooltip={escrowSyncedCount > 0
              ? `Terverifikasi escrow: ${escrowSyncedCount} order. Komisi + Service Fee + AMS + Processing fee.`
              : 'Estimasi dari tarif komisi 3%. Jalankan "Sync Escrow" untuk angka aktual.'}
          />
          <KpiCard
            title={escrowSyncedCount > 0 ? 'Escrow (Net Revenue) ✓' : 'Escrow (Net Revenue)'}
            value={formatCurrency(netRevenue)}
            icon={<TrendingUp className="w-4 h-4" />}
            tooltip={escrowSyncedCount > 0
              ? `Uang yang benar-benar masuk ke rekening seller. Dari escrow_amount untuk ${escrowSyncedCount} order terverifikasi.`
              : 'Estimasi: Revenue dikurangi biaya platform. Jalankan "Sync Escrow" untuk angka escrow aktual.'}
          />
          <KpiCard
            title="Net Profit"
            value={formatCurrency(netProfit)}
            icon={<TrendingUp className="w-4 h-4" />}
            highlight
          />
        </div>

        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">GMV</span> {formatCurrency(gmvTotal)} →
            <span className="ml-2">-Voucher</span> {formatCurrency(filteredOrders.reduce((s, o) => s + (Number(o.voucher_amount) || 0), 0))} →
            <span className="ml-2 font-medium text-foreground">Revenue</span> {formatCurrency(metrics.revenue)} →
            <span className="ml-2">-Fees</span> {formatCurrency(platformFees)} →
            <span className="ml-2">Escrow</span> {formatCurrency(filteredOrders.reduce((s, o) => s + (Number(o.escrow_amount) || 0), 0))} →
            <span className="ml-2">-COGS</span> {formatCurrency(metrics.cogs)} →
            <span className="ml-2 font-medium text-foreground">Net Profit</span> {formatCurrency(netProfit)}
          </CardContent>
        </Card>
      </div>

      {/* COGS warning banner */}
      {liveOrders !== null && metrics.cogs === 0 && metrics.orders > 0 && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <span>⚠️</span>
          <span>COGS belum diset — net profit ditampilkan tanpa biaya produksi. Set COGS di halaman <a href="/products" className="underline">Produk</a>.</span>
        </div>
      )}

      {/* Waterfall Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profit Waterfall</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={waterfallData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload) return null
                  const item = payload.find((p) => p.dataKey === 'value')
                  if (!item) return null
                  const entry = waterfallData.find((d) => d.name === label)
                  const isNegative = ['Diskon', 'COGS', 'Ongkir', 'Komisi', 'Iklan'].includes(String(label))
                  return (
                    <div className="bg-white dark:bg-slate-900 border rounded shadow-sm px-3 py-2 text-sm">
                      <p className="font-medium mb-1">{label}</p>
                      <p style={{ color: entry?.fill }}>
                        {isNegative ? '−' : '+'}{formatCurrency(Number(item.value))}
                      </p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="base" stackId="wf" fill="transparent" />
              <Bar dataKey="value" stackId="wf" radius={[3, 3, 0, 0]}>
                {waterfallData.map((entry, i) => (
                  <Cell key={`wf-${i}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Trend</CardTitle>
              <div className="flex gap-1">
                {CHART_METRICS.map((m) => (
                  <Button
                    key={m}
                    variant={chartMetric === m ? 'default' : 'ghost'}
                    size="sm"
                    className={`text-xs h-7 ${chartMetric === m ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                    onClick={() => setChartMetric(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              {chartMetric === 'Orders' ? (
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} interval={Math.floor(chartData.length / 6)} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="Orders" fill="#10b981" />
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} interval={Math.floor(chartData.length / 6)} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => `${v}K`} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value) * 1000)} />
                  <Line type="monotone" dataKey="GMV" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span className="text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Summary */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Top Campaigns by Net Profit</CardTitle>
          <a href="/campaigns" className="text-xs text-emerald-600 hover:underline">Open tracker →</a>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Campaign data is not persisted yet, so this dashboard section is hidden.
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order ID</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Platform</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">COGS</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Net Profit</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date (paid)</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => {
                  const netProfit = order.revenue - order.cogs - order.shipping_fee - order.platform_fee
                  return (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-mono text-xs">{order.order_id}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            order.platform === 'Shopee'
                              ? 'border-orange-200 text-orange-600 bg-orange-50'
                              : 'border-slate-200 text-slate-600 bg-slate-50'
                          }
                        >
                          {order.platform}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(order.revenue)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(order.cogs)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(netProfit)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {(() => {
                          const value = safeDate(order.paid_at || order.created_at)
                          return value ? format(value, 'MMM d, yyyy') : '—'
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={order.status === 'completed' ? 'default' : 'destructive'}
                          className={order.status === 'completed' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}
                        >
                          {order.status}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
