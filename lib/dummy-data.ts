import { Order, Product, Expense, AdSpend } from './supabase'

const PLATFORMS = ['Shopee', 'TikTok Shop'] as const

const PRODUCTS_LIST = [
  { name: 'Serum Vitamin C 30ml', sku: 'SVC-001', cogs: 45000 },
  { name: 'Moisturizer SPF 50', sku: 'MSP-002', cogs: 62000 },
  { name: 'Face Wash Gentle', sku: 'FWG-003', cogs: 28000 },
  { name: 'Toner Rose Water', sku: 'TRW-004', cogs: 35000 },
  { name: 'Eye Cream Anti-Aging', sku: 'ECA-005', cogs: 78000 },
  { name: 'Sunscreen Gel SPF 30', sku: 'SGS-006', cogs: 42000 },
  { name: 'Sheet Mask Hyaluronic', sku: 'SMH-007', cogs: 18000 },
  { name: 'Lip Balm SPF 15', sku: 'LBS-008', cogs: 22000 },
  { name: 'Exfoliating Scrub', sku: 'EXS-009', cogs: 38000 },
  { name: 'Night Cream Retinol', sku: 'NCR-010', cogs: 92000 },
  { name: 'Micellar Water 200ml', sku: 'MWL-011', cogs: 31000 },
  { name: 'BB Cream Natural', sku: 'BCN-012', cogs: 55000 },
  { name: 'Face Oil Argan', sku: 'FOA-013', cogs: 68000 },
  { name: 'Acne Spot Treatment', sku: 'AST-014', cogs: 25000 },
  { name: 'Hydrating Mist', sku: 'HYM-015', cogs: 33000 },
  { name: 'Collagen Booster', sku: 'CLB-016', cogs: 110000 },
  { name: 'Brightening Mask', sku: 'BRM-017', cogs: 29000 },
  { name: 'Pore Minimizer', sku: 'POM-018', cogs: 47000 },
  { name: 'Vitamin E Oil', sku: 'VEO-019', cogs: 41000 },
  { name: 'Aloe Vera Gel', sku: 'AVG-020', cogs: 19000 },
]

// Seeded PRNG (mulberry32) — produces identical sequences on server and client,
// preventing hydration mismatches from Math.random().
let seed = 0x9e3779b9
function seededRandom(): number {
  seed |= 0
  seed = seed + 0x6d2b79f5 | 0
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}

function randomBetween(min: number, max: number) {
  return Math.floor(seededRandom() * (max - min + 1)) + min
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDate(date: Date) {
  return date.toISOString()
}

const today = new Date()
const startDate = addDays(today, -90)

export function generateProducts(): Product[] {
  const products: Product[] = []
  PRODUCTS_LIST.forEach((p, i) => {
    PLATFORMS.forEach((platform) => {
      products.push({
        id: `prod-${platform.replace(' ', '-').toLowerCase()}-${i + 1}`,
        name: p.name,
        sku: `${platform === 'Shopee' ? 'SHP' : 'TTK'}-${p.sku}`,
        platform,
        cogs_per_unit: p.cogs,
      })
    })
  })
  return products
}

export function generateOrders(products: Product[]): Order[] {
  const orders: Order[] = []
  let orderNum = 1000

  for (let day = 0; day < 90; day++) {
    const date = addDays(startDate, day)
    const ordersPerDay = randomBetween(4, 10)

    for (let o = 0; o < ordersPerDay; o++) {
      const platform = PLATFORMS[randomBetween(0, 1)]
      const platformProducts = products.filter((p) => p.platform === platform)
      const product = platformProducts[randomBetween(0, platformProducts.length - 1)]
      const qty = randomBetween(1, 3)
      const cogs = product.cogs_per_unit * qty
      const markup = 1.8 + seededRandom() * 1.2
      const gmv = Math.round(cogs * markup)
      const discountRate = seededRandom() * 0.15  // 0–15% seller discount
      const revenue = Math.round(gmv * (1 - discountRate))
      const shippingFee = randomBetween(8000, 20000)
      const platformFeeRate = platform === 'Shopee' ? 0.025 : 0.03
      const platformFee = Math.round(revenue * platformFeeRate)

      const statuses = ['completed', 'completed', 'completed', 'returned', 'completed']
      const status = statuses[randomBetween(0, statuses.length - 1)]

      orders.push({
        id: `ord-${orderNum}`,
        platform,
        order_id: `${platform === 'Shopee' ? 'SHP' : 'TTK'}${orderNum}`,
        gmv: status === 'returned' ? 0 : gmv,
        revenue: status === 'returned' ? 0 : revenue,
        cogs: status === 'returned' ? 0 : cogs,
        shipping_fee: status === 'returned' ? 0 : shippingFee,
        platform_fee: status === 'returned' ? 0 : platformFee,
        status,
        created_at: formatDate(new Date(date.getTime() + randomBetween(0, 86400000))),
      })
      orderNum++
    }
  }

  return orders
}

export function generateExpenses(): Expense[] {
  const expenses: Expense[] = []
  let expId = 1

  const shopeeAdTypes = ['Search Ads', 'Discovery Ads', 'Shop Ads', 'Affiliate'] as const

  for (let day = 0; day < 90; day += 7) {
    const date = addDays(startDate, day)
    const weekNum = Math.ceil((day + 1) / 7)

    // Shopee → Shopee Ads category with campaign/ad_type metadata
    expenses.push({
      id: `exp-${expId++}`,
      category: 'Shopee Ads',
      amount: randomBetween(200000, 800000),
      description: `Shopee Weekly Ads Campaign`,
      campaign_name: `Campaign W${weekNum}`,
      ad_type: shopeeAdTypes[randomBetween(0, shopeeAdTypes.length - 1)],
      platform: 'Shopee',
      date: date.toISOString().split('T')[0],
      created_at: formatDate(date),
    })

    // TikTok Shop → Other (no TikTok Ads category)
    expenses.push({
      id: `exp-${expId++}`,
      category: 'Other',
      amount: randomBetween(200000, 800000),
      description: `TikTok Shop Weekly Ads Campaign`,
      platform: 'TikTok Shop',
      date: date.toISOString().split('T')[0],
      created_at: formatDate(date),
    })
  }

  // Monthly platform fees
  for (let month = 0; month < 3; month++) {
    const date = addDays(startDate, month * 30)
    PLATFORMS.forEach((platform) => {
      expenses.push({
        id: `exp-${expId++}`,
        category: 'Platform Fee',
        amount: randomBetween(50000, 150000),
        description: `${platform} Monthly Subscription`,
        platform,
        date: date.toISOString().split('T')[0],
        created_at: formatDate(date),
      })
    })
  }

  // Other expenses
  const otherExpenses = [
    { desc: 'Packaging Materials', amount: 180000 },
    { desc: 'Warehouse Storage', amount: 500000 },
    { desc: 'Staff Salary', amount: 2500000 },
    { desc: 'Photography Equipment', amount: 350000 },
    { desc: 'Software Tools', amount: 250000 },
  ]

  otherExpenses.forEach((e) => {
    expenses.push({
      id: `exp-${expId++}`,
      category: 'Other',
      amount: e.amount,
      description: e.desc,
      platform: 'All',
      date: addDays(startDate, randomBetween(0, 89)).toISOString().split('T')[0],
      created_at: formatDate(addDays(startDate, randomBetween(0, 89))),
    })
  })

  return expenses
}

export function generateAdSpend(): AdSpend[] {
  const adSpend: AdSpend[] = []
  let adId = 1
  const campaigns = {
    Shopee: ['Flash Sale Boost', 'Search Ads', 'Product Spotlight', 'Shop Ads'],
    'TikTok Shop': ['TopView Ad', 'In-Feed Ad', 'Branded Hashtag', 'Spark Ads'],
  }

  for (let day = 0; day < 90; day++) {
    const date = addDays(startDate, day)
    PLATFORMS.forEach((platform) => {
      if (randomBetween(0, 2) > 0) {
        const campList = campaigns[platform]
        adSpend.push({
          id: `ad-${adId++}`,
          platform,
          campaign_name: campList[randomBetween(0, campList.length - 1)],
          amount: randomBetween(30000, 200000),
          date: date.toISOString().split('T')[0],
        })
      }
    })
  }

  return adSpend
}

// Generate all data once
export const dummyProducts = generateProducts()
export const dummyOrders = generateOrders(dummyProducts)
export const dummyExpenses = generateExpenses()
export const dummyAdSpend = generateAdSpend()

function ymdInJakarta(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

// Helper: filter by date range
export function filterByDateRange<T extends { created_at?: string; date?: string }>(
  items: T[],
  from: Date,
  to: Date
): T[] {
  // Shopee dashboard uses GMT+7 for reporting.
  // Comparing raw UTC timestamps can shift orders across day boundaries.
  // So we compare by YYYY-MM-DD in Asia/Jakarta timezone.
  const fromYMD = ymdInJakarta(from)
  const toYMDStr = ymdInJakarta(to)

  return items.filter((item) => {
    const d = new Date(item.created_at || item.date || '')
    if (Number.isNaN(d.getTime())) return false
    const ymd = ymdInJakarta(d)
    return ymd >= fromYMD && ymd <= toYMDStr
  })
}

/** Bucket orders by paid_at when present (Shopee “paid order” day); else create time. */
export function filterOrdersByReportDate<T extends { created_at: string; paid_at?: string | null }>(
  orders: T[],
  from: Date,
  to: Date
): T[] {
  const fromYMD = ymdInJakarta(from)
  const toYMDStr = ymdInJakarta(to)

  return orders.filter((item) => {
    const raw = item.paid_at || item.created_at
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return false
    const ymd = ymdInJakarta(d)
    return ymd >= fromYMD && ymd <= toYMDStr
  })
}

// ── Timezone-aware date helpers (Asia/Jakarta = GMT+7) ────────────────────────
// Shopee Seller Center uses WIB (GMT+7) for all date reporting.
// All start-of-day / end-of-day boundaries must be anchored to that timezone
// so that "Yesterday" and other presets match Seller Center exactly.

/** Returns 'YYYY-MM-DD' string of the current date in Jakarta (WIB, GMT+7). */
function jakartaTodayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

/**
 * Returns a Date representing start-of-day (00:00:00 WIB) for the given
 * 'YYYY-MM-DD' Jakarta date string.  When passed through ymdInJakarta() it
 * will resolve back to the same dateStr.
 */
function jakartaDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+07:00`)
}

/** Returns a Date representing end-of-day (23:59:59 WIB) for the given Jakarta date string. */
function jakartaDayEnd(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59+07:00`)
}

/** Shifts a YYYY-MM-DD Jakarta date string by N calendar days. */
function shiftJakartaDate(dateStr: string, days: number): string {
  // Anchor to noon WIB to avoid DST edge cases (Jakarta has no DST, but safe habit)
  const d = new Date(`${dateStr}T12:00:00+07:00`)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

// Helper: get date range
export function getDateRange(preset: string): { from: Date; to: Date } {
  const todayStr = jakartaTodayStr()

  // Custom range format: custom:YYYY-MM-DD:YYYY-MM-DD
  if (preset.startsWith('custom:')) {
    const [, fromStr, toStr] = preset.split(':')
    if (fromStr && toStr) {
      return { from: jakartaDayStart(fromStr), to: jakartaDayEnd(toStr) }
    }
  }

  switch (preset) {
    case 'today':
      return { from: jakartaDayStart(todayStr), to: jakartaDayEnd(todayStr) }
    case 'yesterday': {
      const yStr = shiftJakartaDate(todayStr, -1)
      return { from: jakartaDayStart(yStr), to: jakartaDayEnd(yStr) }
    }
    case 'last7': {
      const startStr = shiftJakartaDate(todayStr, -6)
      return { from: jakartaDayStart(startStr), to: jakartaDayEnd(todayStr) }
    }
    case 'last30': {
      const startStr = shiftJakartaDate(todayStr, -29)
      return { from: jakartaDayStart(startStr), to: jakartaDayEnd(todayStr) }
    }
    case 'thisMonth': {
      const [y, m] = todayStr.split('-')
      const startStr = `${y}-${m}-01`
      return { from: jakartaDayStart(startStr), to: jakartaDayEnd(todayStr) }
    }
    default: {
      const startStr = shiftJakartaDate(todayStr, -29)
      return { from: jakartaDayStart(startStr), to: jakartaDayEnd(todayStr) }
    }
  }
}

export function getPreviousPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const diff = to.getTime() - from.getTime()
  return {
    from: new Date(from.getTime() - diff),
    to: new Date(from.getTime() - 1),
  }
}

/**
 * Orders counted for Shopee "Pesanan Dibayar" (Paid Orders) KPI.
 *
 * Shopee Seller Center counts an order as "paid" once payment is confirmed,
 * regardless of fulfillment state. This matches the statuses that appear in
 * the Seller Center "Pesanan Dibayar" report:
 *
 *   ✓ ready_to_ship  — payment confirmed, awaiting shipment
 *   ✓ processed      — being prepared for shipment
 *   ✓ retry_ship     — re-arranging shipping
 *   ✓ shipped        — in transit
 *   ✓ to_confirm_receive — delivered, awaiting buyer confirmation
 *   ✓ completed      — fully completed
 *   ✓ in_cancel      — cancellation requested BUT payment WAS confirmed;
 *                      Shopee still counts it in "Pesanan Dibayar"
 *   ✓ to_return      — buyer requesting return; payment was received
 *
 *   ✗ unpaid         — checkout started but NOT paid yet
 *   ✗ cancelled      — confirmed cancellation (no payment settled)
 *   ✗ canceled       — alias for cancelled
 *   ✗ returned       — return completed (refunded)
 *   ✗ refunded       — refund issued
 */
export function orderCountsForShopeeKpi(status: string | null | undefined): boolean {
  const excluded = new Set([
    'unpaid',
    'cancelled',
    'canceled',
    'returned',
    'refunded',
  ])
  const s = (status ?? '').toLowerCase().trim()
  return s !== '' && !excluded.has(s)
}

export function calcMetrics(orders: Order[], adSpend: AdSpend[], expenses: Expense[]) {
  const completedOrders = orders.filter((o) => orderCountsForShopeeKpi(o.status))
  const gmv = completedOrders.reduce((s, o) => s + (o.gmv ?? o.revenue), 0)
  const revenue = completedOrders.reduce((s, o) => s + o.revenue, 0)
  const sellerDiscount = gmv - revenue
  const cogs = completedOrders.reduce((s, o) => s + o.cogs, 0)
  const shippingCost = completedOrders.reduce((s, o) => s + o.shipping_fee, 0)
  const platformFees = completedOrders.reduce((s, o) => s + o.platform_fee, 0)
  const shopeeAdsExpenses = expenses
    .filter((e) => e.category === 'Shopee Ads')
    .reduce((s, e) => s + e.amount, 0)
  const adSpendTotal = adSpend.reduce((s, a) => s + a.amount, 0) + shopeeAdsExpenses
  const otherExpenses = expenses
    .filter((e) => e.category === 'Other')
    .reduce((s, e) => s + e.amount, 0)
  const netProfit = revenue - cogs - shippingCost - platformFees - adSpendTotal - otherExpenses
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0

  return {
    gmv,
    sellerDiscount,
    revenue,
    orders: completedOrders.length,
    cogs,
    shippingCost,
    platformFees,
    adSpendTotal,
    shopeeAdsExpenses,
    otherExpenses,
    netProfit,
    margin,
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}
