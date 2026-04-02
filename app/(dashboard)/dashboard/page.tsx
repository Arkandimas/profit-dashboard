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
} from 'recharts'
import { DollarSign, ShoppingCart, TrendingUp, Percent, Package, Megaphone, RefreshCw } from 'lucide-react'
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

function reportTimeMs(o: Order): number {
  return new Date(o.paid_at || o.created_at).getTime()
}

const CHART_METRICS = ['Net Profit', 'Revenue', 'Orders'] as const
type ChartMetric = (typeof CHART_METRICS)[number]

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

type SyncStatus = { state: 'idle' } | { state: 'loading' } | { state: 'success'; count: number } | { state: 'error'; message: string }

export default function DashboardPage() {
  const [datePreset, setDatePreset] = useState('last30')
  const [platform, setPlatform] = useState<PlatformFilter>('Shopee')
  const [chartMetric, setChartMetric] = useState<ChartMetric>('Net Profit')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' })
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
        if (Array.isArray(data) && data.length > 0) setLiveOrders(data)
      })
      .catch(() => {/* keep dummy */})
  }, [])

  useEffect(() => {
    fetch('/api/ad-spend?days=90')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLiveAdSpend(data) })
      .catch(() => { /* keep empty */ })
  }, [])

  async function handleShopeeSync() {
    setSyncStatus({ state: 'loading' })
    try {
      const res = await fetch('/api/shopee/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setSyncStatus({ state: 'success', count: data.synced })
      const ord = await fetch('/api/orders?days=90').then((r) => r.json())
      if (Array.isArray(ord) && ord.length > 0) setLiveOrders(ord)
    } catch (err) {
      setSyncStatus({ state: 'error', message: err instanceof Error ? err.message : 'Sync failed' })
    } finally {
      setTimeout(() => setSyncStatus({ state: 'idle' }), 4000)
    }
  }

  const { from, to } = useMemo(() => getDateRange(datePreset), [datePreset])
  const prev = useMemo(() => getPreviousPeriod(from, to), [from, to])

  // Use live Supabase orders when available, fall back to demo data
  const allOrders = liveOrders ?? dummyOrders

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

  // Chart data: daily aggregation
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: from, end: to })
    return days.map((day) => {
      const dayStr = format(day, 'MMM d')
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0)
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59)
      const dayOrders = filterOrdersByReportDate(filteredOrders, dayStart, dayEnd)
      const dayAds = filterByDateRange(filteredAdSpend, dayStart, dayEnd)
      const m = calcMetrics(dayOrders, dayAds, NO_MANUAL_EXPENSES)
      return {
        date: dayStr,
        'Net Profit': Math.round(m.netProfit / 1000),
        Revenue: Math.round(m.revenue / 1000),
        Orders: m.orders,
      }
    })
  }, [filteredOrders, filteredAdSpend, from, to])

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
            {liveOrders ? `Live data · ${liveOrders.length} orders synced` : 'Demo data'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {syncStatus.state === 'success' && (
            <span className="text-sm text-emerald-600 font-medium">
              ✓ Synced {syncStatus.count} orders
            </span>
          )}
          {syncStatus.state === 'error' && (
            <span className="text-sm text-red-600 font-medium" title={syncStatus.message}>
              ✕ {syncStatus.message}
            </span>
          )}
          {shopeeConnected === true && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleShopeeSync}
              disabled={syncStatus.state === 'loading'}
              className="border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncStatus.state === 'loading' ? 'animate-spin' : ''}`} />
              {syncStatus.state === 'loading' ? 'Syncing…' : 'Sync Shopee'}
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
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Total Revenue"
          value={formatCurrency(metrics.revenue)}
          change={pctChange(metrics.revenue, prevMetrics.revenue)}
          icon={<DollarSign className="w-4 h-4" />}
        />
        <KpiCard
          title="Total Orders"
          value={metrics.orders.toLocaleString()}
          change={pctChange(metrics.orders, prevMetrics.orders)}
          icon={<ShoppingCart className="w-4 h-4" />}
        />
        <KpiCard
          title="Net Profit"
          value={formatCurrency(metrics.netProfit)}
          change={pctChange(metrics.netProfit, prevMetrics.netProfit)}
          icon={<TrendingUp className="w-4 h-4" />}
          highlight
        />
        <KpiCard
          title="Profit Margin"
          value={`${metrics.margin.toFixed(1)}%`}
          change={pctChange(metrics.margin, prevMetrics.margin)}
          icon={<Percent className="w-4 h-4" />}
        />
        <KpiCard
          title="COGS"
          value={formatCurrency(metrics.cogs)}
          icon={<Package className="w-4 h-4" />}
        />
        <KpiCard
          title="Ad Spend"
          value={formatCurrency(metrics.adSpendTotal)}
          icon={<Megaphone className="w-4 h-4" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Line Chart */}
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
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  interval={Math.floor(chartData.length / 6)}
                />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={yAxisTickFormatter} />
                <Tooltip
                  formatter={(value) => {
                    const v = Number(value)
                    return chartMetric === 'Orders'
                      ? [`${v}`, chartMetric]
                      : [formatCurrency(v * 1000), chartMetric]
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={chartMetric}
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
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
                  // Prefer the stored net_profit (synced from Shopee); fall back to computed
                  const netProfit =
                    order.net_profit != null
                      ? order.net_profit
                      : order.revenue - order.cogs - order.shipping_fee - order.platform_fee
                  const displayRevenue = order.buyer_paid_amount ?? order.revenue
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
                      <td className="px-4 py-3 text-right">{formatCurrency(displayRevenue)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(order.cogs)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(netProfit)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {format(new Date(order.paid_at || order.created_at), 'MMM d, yyyy')}
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
