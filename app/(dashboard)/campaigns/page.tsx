'use client'

import { useState, useMemo, useId, useRef } from 'react'
import { format } from 'date-fns'
import {
  Target,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Campaign,
  CampaignType,
  CampaignScore,
  CampaignPlatform,
  CAMPAIGN_TYPES,
  calcCampaignMetrics,
} from '@/lib/campaigns'
import { formatCurrency } from '@/lib/dummy-data'

// ─── Score badge ─────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: CampaignScore }) {
  const cfg = {
    Scale:   { dot: '🟢', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    Monitor: { dot: '🟡', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    Stop:    { dot: '🔴', cls: 'bg-red-100 text-red-700 border-red-200' },
    Pending: { dot: '⚪', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  }[score]
  return (
    <Badge variant="outline" className={`text-xs font-semibold ${cfg.cls}`}>
      {cfg.dot} {score}
    </Badge>
  )
}

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: CampaignType }) {
  const color: Record<CampaignType, string> = {
    'Flash Sale Shopee':      'bg-orange-100 text-orange-700',
    'Shopee Live':            'bg-pink-100 text-pink-700',
    'Garansi Harga Terbaik':  'bg-blue-100 text-blue-700',
    'Promo Voucher':          'bg-violet-100 text-violet-700',
    'Gratis Ongkir XTRA':     'bg-teal-100 text-teal-700',
    'Trending Brand Subsidi': 'bg-cyan-100 text-cyan-700',
    'Iklan Shopee':           'bg-amber-100 text-amber-700',
    'Affiliate':              'bg-lime-100 text-lime-700',
    'Custom':                 'bg-slate-100 text-slate-700',
  }
  return <Badge className={`text-xs ${color[type]} hover:opacity-80`}>{type}</Badge>
}

// ─── Sort helper ──────────────────────────────────────────────────────────────

type SortCol = 'name' | 'start_date' | 'ad_spend' | 'revenue' | 'net_profit' | 'roas' | 'score'

function SortIcon({ col, sort }: { col: SortCol; sort: { col: SortCol; dir: 'asc' | 'desc' } }) {
  if (sort.col !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />
  return sort.dir === 'asc'
    ? <ArrowUp className="w-3 h-3 text-emerald-500" />
    : <ArrowDown className="w-3 h-3 text-emerald-500" />
}

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = () => ({
  name: '',
  type: 'Flash Sale Shopee' as CampaignType,
  platform: 'Shopee' as CampaignPlatform,
  start_date: new Date().toISOString().split('T')[0],
  end_date: new Date().toISOString().split('T')[0],
  ad_spend: '',
  revenue: '',
  cogs: '',
  notes: '',
})

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const baseId = useId()
  const counter = useRef(0)

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'start_date', dir: 'desc' })
  const [filterPlatform, setFilterPlatform] = useState<string>('All')
  const [filterType, setFilterType] = useState<string>('All')
  const [filterScore, setFilterScore] = useState<string>('All')

  // Enrich with metrics
  const enriched = useMemo(
    () => campaigns.map((c) => ({ ...c, metrics: calcCampaignMetrics(c) })),
    [campaigns]
  )

  // Filter
  const filtered = useMemo(() => {
    return enriched.filter((c) => {
      if (filterPlatform !== 'All' && c.platform !== filterPlatform) return false
      if (filterType !== 'All' && c.type !== filterType) return false
      if (filterScore !== 'All' && c.metrics.score !== filterScore) return false
      return true
    })
  }, [enriched, filterPlatform, filterType, filterScore])

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: number | string | null = null
      let bv: number | string | null = null
      switch (sort.col) {
        case 'name':       av = a.name;              bv = b.name; break
        case 'start_date': av = a.start_date;        bv = b.start_date; break
        case 'ad_spend':   av = a.ad_spend;          bv = b.ad_spend; break
        case 'revenue':    av = a.revenue ?? -1;     bv = b.revenue ?? -1; break
        case 'net_profit': av = a.metrics.net_profit ?? -Infinity; bv = b.metrics.net_profit ?? -Infinity; break
        case 'roas':       av = a.metrics.roas ?? -1; bv = b.metrics.roas ?? -1; break
        case 'score': {
          const order: Record<CampaignScore, number> = { Scale: 0, Monitor: 1, Stop: 2, Pending: 3 }
          av = order[a.metrics.score]; bv = order[b.metrics.score]; break
        }
      }
      if (av === null || bv === null) return 0
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sort])

  // Summary
  const summary = useMemo(() => {
    const withRevenue = enriched.filter((c) => c.revenue !== null)
    const totalAdSpend = enriched.reduce((s, c) => s + c.ad_spend, 0)
    const totalRevenue = withRevenue.reduce((s, c) => s + (c.revenue ?? 0), 0)
    const totalNetProfit = withRevenue.reduce((s, c) => s + (c.metrics.net_profit ?? 0), 0)
    const avgRoas = withRevenue.length > 0
      ? withRevenue.reduce((s, c) => s + (c.metrics.roas ?? 0), 0) / withRevenue.length
      : 0
    return { count: enriched.length, totalAdSpend, totalRevenue, totalNetProfit, avgRoas }
  }, [enriched])

  function toggleSort(col: SortCol) {
    setSort((prev) => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'desc' }
    )
  }

  function openAdd() {
    setForm(emptyForm())
    setEditId(null)
    setDialogOpen(true)
  }

  function openEdit(c: Campaign) {
    setForm({
      name: c.name,
      type: c.type,
      platform: c.platform,
      start_date: c.start_date,
      end_date: c.end_date,
      ad_spend: c.ad_spend.toString(),
      revenue: c.revenue !== null ? c.revenue.toString() : '',
      cogs: c.cogs.toString(),
      notes: c.notes,
    })
    setEditId(c.id)
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: Omit<Campaign, 'id' | 'created_at'> = {
      name: form.name,
      type: form.type,
      platform: form.platform,
      start_date: form.start_date,
      end_date: form.end_date,
      ad_spend: parseFloat(form.ad_spend) || 0,
      revenue: form.revenue.trim() !== '' ? parseFloat(form.revenue) : null,
      cogs: parseFloat(form.cogs) || 0,
      notes: form.notes,
    }

    if (editId) {
      setCampaigns((prev) =>
        prev.map((c) => c.id === editId ? { ...c, ...payload } : c)
      )
    } else {
      setCampaigns((prev) => [
        {
          id: `camp-custom-${baseId}-${++counter.current}`,
          created_at: new Date().toISOString(),
          ...payload,
        },
        ...prev,
      ])
    }
    setDialogOpen(false)
  }

  function deleteCampaign(id: string) {
    setCampaigns((prev) => prev.filter((c) => c.id !== id))
  }

  // Live preview calculations from form
  const previewAdSpend = parseFloat(form.ad_spend) || 0
  const previewRevenue = form.revenue.trim() !== '' ? parseFloat(form.revenue) || 0 : null
  const previewCogs = parseFloat(form.cogs) || 0
  const previewRoas = previewRevenue !== null && previewAdSpend > 0 ? previewRevenue / previewAdSpend : null
  const previewNetProfit = previewRevenue !== null ? previewRevenue - previewCogs - previewAdSpend : null

  const SCORES: CampaignScore[] = ['Scale', 'Monitor', 'Stop', 'Pending']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Target className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Campaign Tracker</h1>
            <p className="text-muted-foreground text-sm">Track ROI across all your campaigns</p>
          </div>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={openAdd}>
          <Plus className="w-4 h-4" />
          Add Campaign
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Campaigns', value: summary.count.toString() },
          { label: 'Total Ad Spend', value: formatCurrency(summary.totalAdSpend) },
          { label: 'Total Revenue', value: formatCurrency(summary.totalRevenue) },
          { label: 'Avg ROAS', value: `${summary.avgRoas.toFixed(2)}x` },
          { label: 'Net Profit', value: formatCurrency(summary.totalNetProfit), highlight: summary.totalNetProfit >= 0 },
        ].map(({ label, value, highlight }) => (
          <Card key={label} className={highlight === false ? 'border-red-200' : highlight ? 'border-emerald-200 bg-emerald-50/50' : ''}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              <p className={`text-lg font-bold mt-1 ${highlight === false ? 'text-red-600' : highlight ? 'text-emerald-600' : ''}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm font-medium text-muted-foreground">Filter:</span>

            <Select value={filterPlatform} onValueChange={(v) => setFilterPlatform(v ?? 'All')}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Platforms</SelectItem>
                <SelectItem value="Shopee">Shopee</SelectItem>
                <SelectItem value="TikTok Shop">TikTok Shop</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={(v) => setFilterType(v ?? 'All')}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Types</SelectItem>
                {CAMPAIGN_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterScore} onValueChange={(v) => setFilterScore(v ?? 'All')}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Scores</SelectItem>
                {SCORES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(filterPlatform !== 'All' || filterType !== 'All' || filterScore !== 'All') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => { setFilterPlatform('All'); setFilterType('All'); setFilterScore('All') }}
              >
                Clear filters
              </Button>
            )}

            <span className="ml-auto text-xs text-muted-foreground">
              {sorted.length} of {campaigns.length} campaigns
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 dark:bg-slate-800/50">
                  {(
                    [
                      { col: 'name' as SortCol, label: 'Campaign', align: 'left' },
                      { col: null, label: 'Type', align: 'left' },
                      { col: 'start_date' as SortCol, label: 'Period', align: 'left' },
                      { col: 'ad_spend' as SortCol, label: 'Ad Spend', align: 'right' },
                      { col: 'revenue' as SortCol, label: 'Revenue', align: 'right' },
                      { col: null, label: 'COGS', align: 'right' },
                      { col: null, label: 'Gross Profit', align: 'right' },
                      { col: 'net_profit' as SortCol, label: 'Net Profit', align: 'right' },
                      { col: 'roas' as SortCol, label: 'ROAS', align: 'right' },
                      { col: 'score' as SortCol, label: 'Score', align: 'center' },
                      { col: null, label: '', align: 'center' },
                    ] as const
                  ).map(({ col, label, align }) => (
                    <th
                      key={label || 'actions'}
                      className={`px-4 py-3 font-medium text-muted-foreground text-${align} ${col ? 'cursor-pointer select-none hover:text-foreground' : ''}`}
                      onClick={col ? () => toggleSort(col) : undefined}
                    >
                      {col ? (
                        <span className="inline-flex items-center gap-1">
                          {label}
                          <SortIcon col={col} sort={sort} />
                        </span>
                      ) : label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      No campaigns match your filters.
                    </td>
                  </tr>
                )}
                {sorted.map((c) => {
                  const m = c.metrics
                  return (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-medium max-w-[200px]">
                        <div className="truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.platform}</div>
                      </td>
                      <td className="px-4 py-3"><TypeBadge type={c.type} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(c.start_date), 'dd MMM yy')}
                        {c.start_date !== c.end_date && (
                          <> → {format(new Date(c.end_date), 'dd MMM yy')}</>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(c.ad_spend)}</td>
                      <td className="px-4 py-3 text-right">
                        {c.revenue !== null ? formatCurrency(c.revenue) : <span className="text-muted-foreground text-xs">Pending</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {c.cogs > 0 ? formatCurrency(c.cogs) : <span className="text-xs">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${m.gross_profit !== null ? (m.gross_profit >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-muted-foreground'}`}>
                        {m.gross_profit !== null ? formatCurrency(m.gross_profit) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${m.net_profit !== null ? (m.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-muted-foreground'}`}>
                        {m.net_profit !== null ? formatCurrency(m.net_profit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {m.roas !== null ? `${m.roas.toFixed(2)}x` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ScoreBadge score={m.score} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(c)}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteCampaign(c.id)}
                            className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Campaign' : 'Add Campaign'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-4 mt-2">
            {/* Name */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Campaign Name</Label>
              <Input
                placeholder="e.g. Flash Sale 12.12"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>Campaign Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as CampaignType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Platform */}
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setForm((p) => ({ ...p, platform: v as CampaignPlatform }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Shopee">Shopee</SelectItem>
                  <SelectItem value="TikTok Shop">TikTok Shop</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                required
              />
            </div>

            {/* Financials */}
            <div className="space-y-1.5">
              <Label>Ad Spend / Voucher Cost (Rp)</Label>
              <Input
                type="number"
                placeholder="5000000"
                value={form.ad_spend}
                onChange={(e) => setForm((p) => ({ ...p, ad_spend: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Revenue Generated (Rp)
                <span className="ml-1 text-xs text-muted-foreground font-normal">— leave blank if pending</span>
              </Label>
              <Input
                type="number"
                placeholder="Leave blank if campaign is still running"
                value={form.revenue}
                onChange={(e) => setForm((p) => ({ ...p, revenue: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>COGS for Campaign Products (Rp)</Label>
              <Input
                type="number"
                placeholder="8500000"
                value={form.cogs}
                onChange={(e) => setForm((p) => ({ ...p, cogs: e.target.value }))}
              />
            </div>

            {/* Live preview */}
            {(previewRevenue !== null || previewAdSpend > 0) && (
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Live Preview</p>
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs">
                  <div>
                    <p className="text-muted-foreground">ROAS</p>
                    <p className="font-bold">{previewRoas !== null ? `${previewRoas.toFixed(2)}x` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Net Profit</p>
                    <p className={`font-bold ${previewNetProfit !== null ? (previewNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600') : ''}`}>
                      {previewNetProfit !== null ? formatCurrency(previewNetProfit) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Score</p>
                    {previewRevenue !== null && previewRoas !== null ? (
                      <ScoreBadge score={
                        previewRoas >= 3.0 && (previewNetProfit ?? 0) > 0 ? 'Scale'
                        : previewRoas >= 1.5 ? 'Monitor'
                        : 'Stop'
                      } />
                    ) : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Campaign notes, strategy, observations..."
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>

            <DialogFooter className="sm:col-span-2">
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                {editId ? 'Update Campaign' : 'Save Campaign'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
