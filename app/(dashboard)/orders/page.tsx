'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronRight, Search, Download } from 'lucide-react'
import { formatCurrency } from '@/lib/dummy-data'

interface OrderItem {
  item_id: number
  item_name: string
  item_sku: string
  model_quantity_purchased: number
  model_original_price: number
  model_discounted_price: number
}

interface Order {
  id: number
  platform: string
  order_id: string
  revenue: number
  cogs: number
  shipping_fee: number
  platform_fee: number
  net_profit: number
  status: string
  created_at: string
  paid_at: string | null
  total_amount: number | null
  buyer_paid_amount: number | null
  actual_shipping_fee: number | null
  commission_fee: number | null
  service_fee: number | null
  seller_discount: number | null
  voucher_from_seller: number | null
  voucher_from_shopee: number | null
  payment_method: string | null
  item_list: OrderItem[] | null
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  shipped: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  ready_to_ship: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  processed: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  unpaid: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  returned: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  refunded: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function FinancialRow({ label, value, highlight }: { label: string; value: number | null; highlight?: 'positive' | 'negative' | 'deduction' }) {
  const v = value ?? 0
  const color = highlight === 'positive'
    ? v >= 0 ? 'text-emerald-600' : 'text-red-600'
    : highlight === 'deduction'
    ? 'text-red-500'
    : ''
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${color}`}>
        {highlight === 'deduction' ? `(${formatCurrency(v)})` : formatCurrency(v)}
      </span>
    </div>
  )
}

function OrderRow({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false)
  const statusColor = STATUS_COLORS[order.status] ?? 'bg-slate-100 text-slate-700'
  const netProfit = order.net_profit ?? 0

  return (
    <>
      <tr
        className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-4 py-3">
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          />
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground">{order.order_id}</span>
        </td>
        <td className="px-4 py-3">
          <Badge variant="outline" className="text-xs">{order.platform}</Badge>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {formatDate(order.paid_at ?? order.created_at)}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
            {statusLabel(order.status)}
          </span>
        </td>
        <td className="px-4 py-3 text-right text-sm font-medium">
          {formatCurrency(order.buyer_paid_amount ?? order.revenue)}
        </td>
        <td className={`px-4 py-3 text-right text-sm font-medium ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {formatCurrency(netProfit)}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b bg-slate-50/50 dark:bg-slate-800/20">
          <td colSpan={7} className="px-6 pb-4 pt-2">
            <div className="grid sm:grid-cols-2 gap-6">
              {/* Financial breakdown */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Financial Breakdown</p>
                <div className="space-y-0.5">
                  <FinancialRow label="Total Amount" value={order.total_amount} />
                  <FinancialRow label="Seller Discount" value={order.seller_discount} highlight="deduction" />
                  <FinancialRow label="Voucher (Seller)" value={order.voucher_from_seller} highlight="deduction" />
                  <FinancialRow label="Voucher (Shopee)" value={order.voucher_from_shopee} />
                  <div className="border-t my-1" />
                  <FinancialRow label="Buyer Paid Amount" value={order.buyer_paid_amount ?? order.revenue} />
                  <div className="border-t my-1" />
                  <FinancialRow label="Shipping Fee" value={order.actual_shipping_fee ?? order.shipping_fee} highlight="deduction" />
                  <FinancialRow label="Commission Fee" value={order.commission_fee ?? order.platform_fee} highlight="deduction" />
                  <FinancialRow label="Service Fee" value={order.service_fee} highlight="deduction" />
                  <FinancialRow label="COGS" value={order.cogs} highlight="deduction" />
                  <div className="border-t my-1" />
                  <div className="flex justify-between text-xs py-0.5 font-semibold">
                    <span>Net Profit</span>
                    <span className={`font-mono ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(netProfit)}
                    </span>
                  </div>
                </div>
                {order.payment_method && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Payment: <span className="font-medium text-foreground">{order.payment_method}</span>
                  </p>
                )}
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Items</p>
                {(order.item_list && order.item_list.length > 0) ? (
                  <div className="space-y-2">
                    {order.item_list.map((item, i) => (
                      <div key={i} className="text-xs border rounded-md p-2 bg-white dark:bg-slate-900">
                        <p className="font-medium line-clamp-2">{item.item_name}</p>
                        <div className="flex items-center gap-3 mt-1 text-muted-foreground">
                          <span>SKU: {item.item_sku || '—'}</span>
                          <span>Qty: {item.model_quantity_purchased}</span>
                          <span>{formatCurrency(item.model_discounted_price)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No item details available. Re-sync to fetch.</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const EXCLUDED_STATUSES = new Set(['unpaid', 'in_cancel', 'cancelled', 'canceled', 'returned', 'refunded'])
function orderCountsForKpi(status: string) {
  return !EXCLUDED_STATUSES.has((status ?? '').toLowerCase().trim())
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [days, setDays] = useState('30')
  const [excludeCancelled, setExcludeCancelled] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/orders?days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setOrders(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [days])

  const statuses = useMemo(() => {
    const set = new Set(orders.map((o) => o.status))
    return Array.from(set).sort()
  }, [orders])

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = statusFilter === 'all' || o.status === statusFilter
      const q = search.toLowerCase()
      const matchSearch = !q || o.order_id.toLowerCase().includes(q)
      return matchStatus && matchSearch
    })
  }, [orders, statusFilter, search])

  const totals = useMemo(() => {
    // Only count non-cancelled/non-unpaid orders in revenue & profit summaries
    const kpiOrders = excludeCancelled ? filtered.filter((o) => orderCountsForKpi(o.status)) : filtered
    return kpiOrders.reduce(
      (acc, o) => ({
        revenue: acc.revenue + (o.buyer_paid_amount ?? o.revenue ?? 0),
        profit: acc.profit + (o.net_profit ?? 0),
        count: acc.count + 1,
      }),
      { revenue: 0, profit: 0, count: 0 }
    )
  }, [filtered, excludeCancelled])

  function exportCSV() {
    const header = ['Order ID', 'Platform', 'Date', 'Status', 'Buyer Paid', 'Shipping', 'Commission', 'Service Fee', 'COGS', 'Net Profit']
    const rows = filtered.map((o) => [
      o.order_id,
      o.platform,
      formatDate(o.paid_at ?? o.created_at),
      o.status,
      o.buyer_paid_amount ?? o.revenue,
      o.actual_shipping_fee ?? o.shipping_fee,
      o.commission_fee ?? o.platform_fee,
      o.service_fee ?? '',
      o.cogs,
      o.net_profit,
    ])
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'orders.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">
            {loading
              ? 'Loading…'
              : excludeCancelled
              ? `${totals.count} orders (revenue-counted) · ${filtered.length} total`
              : `${filtered.length} orders`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button
            variant={excludeCancelled ? 'default' : 'outline'}
            size="sm"
            className={excludeCancelled ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
            onClick={() => setExcludeCancelled((v) => !v)}
          >
            {excludeCancelled ? '✓ Paid only' : 'All statuses'}
          </Button>
          <Select value={days} onValueChange={(v) => v && setDays(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={exportCSV}>
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              {excludeCancelled ? 'Paid Orders' : 'All Orders'}
            </p>
            <p className="text-xl font-bold mt-0.5">{excludeCancelled ? totals.count : filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              {excludeCancelled ? 'Revenue (paid only)' : 'Total Revenue (all)'}
            </p>
            <p className="text-xl font-bold mt-0.5">{formatCurrency(totals.revenue)}</p>
          </CardContent>
        </Card>
        <Card className={totals.profit >= 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Net Profit</p>
            <p className={`text-xl font-bold mt-0.5 ${totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(totals.profit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search order ID…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Order List</CardTitle>
        </CardHeader>
        <CardContent className="p-0 mt-3">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-900 dark:bg-slate-800">
                  <th className="w-8 px-4 py-3" />
                  <th className="text-left px-4 py-3 text-sm font-semibold text-white">Order ID</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-white">Platform</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-white">Date</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-white">Status</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-white">Revenue</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-white">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      Loading orders…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      No orders found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
