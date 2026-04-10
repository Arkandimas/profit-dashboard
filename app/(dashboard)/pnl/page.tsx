'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/date-range-picker'
import { Download, TrendingUp, TrendingDown } from 'lucide-react'
import {
  dummyOrders,
  filterByDateRange,
  filterOrdersByReportDate,
  getDateRange,
  getPreviousPeriod,
  calcMetrics,
  formatCurrency,
} from '@/lib/dummy-data'
import type { Expense, AdSpend } from '@/lib/supabase'

const NO_MANUAL_EXPENSES: Expense[] = []

interface PnlRowProps {
  label: string
  current: number
  previous: number
  isTotal?: boolean
  isSubtotal?: boolean
  isDeduction?: boolean
  indent?: boolean
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}

function PnlRow({ label, current, previous, isTotal, isSubtotal, isDeduction, indent }: PnlRowProps) {
  const change = pctChange(current, previous)
  const isPositive = change !== null && change >= 0

  return (
    <tr className={`border-b last:border-0 ${isTotal ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}>
      <td className={`px-4 py-3 text-sm ${isTotal ? 'font-bold' : isSubtotal ? 'font-semibold' : 'text-muted-foreground'} ${indent ? 'pl-8' : ''}`}>
        {isDeduction && <span className="mr-1 text-red-400">−</span>}
        {label}
      </td>
      <td className={`px-4 py-3 text-sm text-right ${isTotal ? 'font-bold' : ''} ${current < 0 ? 'text-red-600' : isTotal && current > 0 ? 'text-emerald-600' : ''}`}>
        {isDeduction ? `(${formatCurrency(current)})` : formatCurrency(current)}
      </td>
      <td className={`px-4 py-3 text-sm text-right ${isTotal ? 'font-bold' : ''} ${previous < 0 ? 'text-red-600' : ''}`}>
        {isDeduction ? `(${formatCurrency(previous)})` : formatCurrency(previous)}
      </td>
      <td className="px-4 py-3 text-sm text-right">
        {change !== null ? (
          <span className={`flex items-center justify-end gap-1 text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isPositive ? '+' : ''}{change.toFixed(1)}%
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
    </tr>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-slate-100 dark:bg-slate-800">
      <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </td>
    </tr>
  )
}

export default function PnlPage() {
  const [datePreset, setDatePreset] = useState('thisMonth')
  const [liveOrders, setLiveOrders] = useState<typeof dummyOrders | null>(null)
  const [liveAdSpend, setLiveAdSpend] = useState<AdSpend[]>([])

  useEffect(() => {
    fetch('/api/orders?days=90')
      .then((r) => r.json())
      .then((data: typeof dummyOrders) => { if (Array.isArray(data) && data.length > 0) setLiveOrders(data) })
      .catch(() => {/* keep dummy */})
  }, [])

  useEffect(() => {
    fetch('/api/ad-spend?days=90')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLiveAdSpend(data) })
      .catch(() => { /* keep empty */ })
  }, [])

  const allOrders = liveOrders ?? dummyOrders

  const { from, to } = useMemo(() => getDateRange(datePreset), [datePreset])
  const prev = useMemo(() => getPreviousPeriod(from, to), [from, to])

  const currentMetrics = useMemo(() => {
    const orders = filterOrdersByReportDate(allOrders, from, to)
    const ads = filterByDateRange(liveAdSpend, from, to)
    const returnedRevenue = orders
      .filter((o) => {
        const s = (o.status ?? '').toLowerCase().trim()
        return s === 'returned' || s === 'refunded'
      })
      .reduce((s, o) => s + (o.buyer_paid_amount ?? o.revenue ?? 0), 0)
    const m = calcMetrics(orders, ads, NO_MANUAL_EXPENSES)
    const grossRevenue = m.gmv   // GMV = definisi Shopee (include cancelled, setelah seller voucher)
    const grossProfit = m.buyerPaid - m.cogs
    return { ...m, grossRevenue, returnedRevenue, grossProfit }
  }, [allOrders, from, to, liveAdSpend])

  const prevMetrics = useMemo(() => {
    const orders = filterOrdersByReportDate(allOrders, prev.from, prev.to)
    const ads = filterByDateRange(liveAdSpend, prev.from, prev.to)
    const returnedRevenue = orders
      .filter((o) => {
        const s = (o.status ?? '').toLowerCase().trim()
        return s === 'returned' || s === 'refunded'
      })
      .reduce((s, o) => s + (o.buyer_paid_amount ?? o.revenue ?? 0), 0)
    const m = calcMetrics(orders, ads, NO_MANUAL_EXPENSES)
    const grossRevenue = m.gmv
    const grossProfit = m.buyerPaid - m.cogs
    return { ...m, grossRevenue, returnedRevenue, grossProfit }
  }, [allOrders, prev, liveAdSpend])

  function exportCSV() {
    const rows = [
      ['P&L Report', '', '', ''],
      ['', 'Current Period', 'Previous Period', '% Change'],
      ['Gross Revenue', currentMetrics.grossRevenue, prevMetrics.grossRevenue, ''],
      ['Returns/Refunds', -currentMetrics.returnedRevenue, -prevMetrics.returnedRevenue, ''],
      ['Net Revenue', currentMetrics.buyerPaid, prevMetrics.buyerPaid, ''],
      ['COGS', -currentMetrics.cogs, -prevMetrics.cogs, ''],
      ['Gross Profit', currentMetrics.grossProfit, prevMetrics.grossProfit, ''],
      ['Shipping Costs', -currentMetrics.shippingCost, -prevMetrics.shippingCost, ''],
      ['Platform Fees', -currentMetrics.platformFees, -prevMetrics.platformFees, ''],
      ['Ad Spend', -(currentMetrics.adSpendTotal - currentMetrics.shopeeAdsExpenses), -(prevMetrics.adSpendTotal - prevMetrics.shopeeAdsExpenses), ''],
      ['Shopee Ads', -currentMetrics.shopeeAdsExpenses, -prevMetrics.shopeeAdsExpenses, ''],
      ['Other Expenses', -currentMetrics.otherExpenses, -prevMetrics.otherExpenses, ''],
      ['NET PROFIT', currentMetrics.netProfit, prevMetrics.netProfit, ''],
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pnl-report.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">P&L Report</h1>
          <p className="text-muted-foreground text-sm">Profit & Loss statement</p>
        </div>
        <div className="flex gap-3">
          <DateRangePicker value={datePreset} onChange={setDatePreset} />
          <Button variant="outline" className="gap-2" onClick={exportCSV}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Buyer Paid (Active Orders)</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(currentMetrics.buyerPaid)}</p>
            <p className="text-xs text-muted-foreground mt-1">{currentMetrics.orderCount} pesanan (incl. {currentMetrics.cancelledCount} dibatalkan)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Gross Profit</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(currentMetrics.grossProfit)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {currentMetrics.buyerPaid > 0 ? ((currentMetrics.grossProfit / currentMetrics.buyerPaid) * 100).toFixed(1) : 0}% gross margin
            </p>
          </CardContent>
        </Card>
        <Card className={currentMetrics.netProfit >= 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Net Profit</p>
            <p className={`text-2xl font-bold mt-1 ${currentMetrics.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(currentMetrics.netProfit)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {currentMetrics.buyerPaid > 0 ? currentMetrics.margin.toFixed(1) : 0}% net margin
            </p>
          </CardContent>
        </Card>
      </div>

      {/* P&L Statement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profit & Loss Statement</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-900 dark:bg-slate-800">
                  <th className="text-left px-4 py-3 text-sm font-semibold text-white">Line Item</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-white">Current Period</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-white">Previous Period</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-white">Change</th>
                </tr>
              </thead>
              <tbody>
                <SectionHeader label="Revenue" />
                <PnlRow label="Gross Revenue" current={currentMetrics.grossRevenue} previous={prevMetrics.grossRevenue} />
                <PnlRow label="Returns & Refunds" current={currentMetrics.returnedRevenue} previous={prevMetrics.returnedRevenue} isDeduction indent />
                <PnlRow label="Buyer Paid (Active Orders)" current={currentMetrics.buyerPaid} previous={prevMetrics.buyerPaid} isSubtotal />

                <SectionHeader label="Cost of Goods" />
                <PnlRow label="COGS" current={currentMetrics.cogs} previous={prevMetrics.cogs} isDeduction indent />
                <PnlRow label="Gross Profit" current={currentMetrics.grossProfit} previous={prevMetrics.grossProfit} isSubtotal />

                <SectionHeader label="Operating Expenses" />
                <PnlRow label="Shipping Costs" current={currentMetrics.shippingCost} previous={prevMetrics.shippingCost} isDeduction indent />
                <PnlRow label="Platform Fees" current={currentMetrics.platformFees} previous={prevMetrics.platformFees} isDeduction indent />
                <PnlRow label="Ad Spend" current={currentMetrics.adSpendTotal - currentMetrics.shopeeAdsExpenses} previous={prevMetrics.adSpendTotal - prevMetrics.shopeeAdsExpenses} isDeduction indent />
                <PnlRow label="Shopee Ads" current={currentMetrics.shopeeAdsExpenses} previous={prevMetrics.shopeeAdsExpenses} isDeduction indent />
                <PnlRow label="Other Expenses" current={currentMetrics.otherExpenses} previous={prevMetrics.otherExpenses} isDeduction indent />

                <SectionHeader label="Bottom Line" />
                <PnlRow
                  label="NET PROFIT"
                  current={currentMetrics.netProfit}
                  previous={prevMetrics.netProfit}
                  isTotal
                />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
