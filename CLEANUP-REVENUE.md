# Cleanup: Remove `revenue` Field — Align GMV dengan Shopee Definition

## Definisi Final (Dari Shopee Official)

**GMV (Penjualan):**
```
GMV = Total Penjualan dari pesanan yang sudah dibayar 
      setelah dikurangi Voucher/Diskon dari Penjual
      
TERMASUK: Pesanan dibatalkan dan dikembalikan
EXCLUDE: UNPAID (belum dibayar)

Rumus: GMV = Sum(total_amount - voucher_from_seller) untuk semua paid orders
```

**Jumlah Pesanan:**
```
Jumlah Pesanan Dibayar = Pesanan yang telah dibayar (termasuk COD)

TERMASUK: Pesanan dibatalkan dan dikembalikan
EXCLUDE: UNPAID saja

Rumus: COUNT(status != 'UNPAID')
```

---

## Changes Required

### 1. Database Schema (`supabase-migrate-all.sql`)
- ❌ Hapus column `revenue` jika ada (atau keep untuk backward compatibility, tapi not used)
- ✅ Keep `buyer_paid_amount` (untuk escrow reconciliation)
- ✅ Keep `gmv` (total_amount dari Shopee)
- ✅ Keep `voucher_from_seller` (untuk GMV calculation)

### 2. `lib/dummy-data.ts` — `calcMetrics()` Function

**BEFORE:**
```typescript
export function calcMetrics(orders: Order[], adSpend: AdSpend[], expenses: Expense[]) {
  // Penjualan (Shopee definition)
  const allPaidOrders = orders.filter(o => (o.status ?? '').toUpperCase() !== 'UNPAID')
  const penjualan = allPaidOrders.reduce((s, o) => s + (o.gmv ?? 0) - (o.voucher_from_seller ?? 0), 0)
  
  // Active orders
  const completedOrders = orders.filter(o => orderCountsForShopeeKpi(o.status))
  const gmv = completedOrders.reduce((s, o) => s + (o.gmv ?? o.revenue), 0)
  const revenue = completedOrders.reduce((s, o) => s + o.revenue, 0)
  
  return {
    gmv,              // ← untuk active orders saja (exclude cancelled)
    revenue,          // ← hapus ini
    penjualan,        // ← untuk semua paid orders (include cancelled)
    orders: completedOrders.length,
    ...
  }
}
```

**AFTER:**
```typescript
export function calcMetrics(orders: Order[], adSpend: AdSpend[], expenses: Expense[]) {
  // ──────────────────────────────────────────────────────────────────────────
  // GMV (Shopee Definition): All paid orders, minus seller vouchers
  // INCLUDES: cancelled, returned orders
  // EXCLUDES: UNPAID orders
  // ──────────────────────────────────────────────────────────────────────────
  const allPaidOrders = orders.filter(
    (o) => (o.status ?? '').toUpperCase() !== 'UNPAID'
  )
  
  // GMV = Sum of (total_amount - voucher_from_seller)
  const gmv = allPaidOrders.reduce(
    (s, o) => s + (o.gmv ?? 0) - (o.voucher_from_seller ?? 0),
    0
  )
  
  // Jumlah Pesanan = Count of paid orders (including cancelled/returned)
  const orderCount = allPaidOrders.length
  
  // Pesanan Dibatalkan = Count of cancelled/returned/refunded
  const cancelledCount = allPaidOrders.filter((o) =>
    ['CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'].includes((o.status ?? '').toUpperCase())
  ).length
  
  // ──────────────────────────────────────────────────────────────────────────
  // For Profit Calculation: Use only active (non-cancelled) orders
  // ──────────────────────────────────────────────────────────────────────────
  const activeOrders = orders.filter((o) => orderCountsForShopeeKpi(o.status))
  
  // Revenue = Total amount buyer paid (for cost calculation)
  const totalRevenue = activeOrders.reduce((s, o) => s + (o.buyer_paid_amount ?? o.revenue ?? 0), 0)
  
  // COGS, Shipping, Platform Fees: only for active orders
  const cogs = activeOrders.reduce((s, o) => s + o.cogs, 0)
  const shippingCost = activeOrders.reduce((s, o) => s + o.shipping_fee, 0)
  
  // Platform Fees
  const commissionFees = activeOrders.reduce((s, o) =>
    s + (o.escrow_synced ? (o.commission_fee_actual ?? 0) : (o.commission_fee ?? 0)), 0)
  const serviceFees = activeOrders.reduce((s, o) =>
    s + (o.escrow_synced ? (o.service_fee_actual ?? 0) : (o.service_fee ?? 0)), 0)
  const amsCommission = activeOrders.reduce((s, o) => s + (o.ams_commission ?? 0), 0)
  const processingFees = activeOrders.reduce((s, o) => s + (o.processing_fee ?? 0), 0)
  
  const platformFees = activeOrders.filter((o) => o.escrow_synced).length > 0
    ? commissionFees + serviceFees + amsCommission + processingFees
    : activeOrders.reduce((s, o) => s + o.platform_fee, 0)
  
  // Expenses
  const shopeeAdsExpenses = expenses
    .filter((e) => e.category === 'Shopee Ads')
    .reduce((s, e) => s + e.amount, 0)
  const adSpendTotal = adSpend.reduce((s, a) => s + a.amount, 0) + shopeeAdsExpenses
  const otherExpenses = expenses
    .filter((e) => e.category === 'Other')
    .reduce((s, e) => s + e.amount, 0)
  
  // Net Profit: only from active orders
  const netProfit = totalRevenue - cogs - shippingCost - platformFees - adSpendTotal - otherExpenses
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
  
  return {
    // KPI: Match Shopee Seller Center
    gmv,                // Penjualan (Shopee definition): includes cancelled
    orderCount,         // Pesanan Dibayar: count of paid orders
    cancelledCount,     // Pesanan Dibatalkan: count of cancelled/returned
    
    // For Cost/Profit Analysis: active orders only
    totalRevenue,       // Total buyer paid (for denominator in margin calc)
    cogs,
    shippingCost,
    platformFees,
    commissionFees,
    serviceFees,
    amsCommission,
    processingFees,
    adSpendTotal,
    shopeeAdsExpenses,
    otherExpenses,
    netProfit,
    margin,
    escrowSynced: activeOrders.filter((o) => o.escrow_synced).length,
  }
}
```

### 3. Dashboard Page (`app/(dashboard)/dashboard/page.tsx`)

**Update KPI Cards:**
```typescript
// BEFORE:
<KpiCard title="GMV" value={formatCurrency(metrics.gmv)} />
<KpiCard title="Orders" value={metrics.orders} />

// AFTER:
<KpiCard 
  title="GMV (Penjualan)" 
  value={formatCurrency(metrics.gmv)}
  subtitle="Termasuk pesanan dibatalkan & dikembalikan"
/>
<KpiCard 
  title="Pesanan Dibayar" 
  value={metrics.orderCount}
  change={...}
/>
<KpiCard 
  title="Pesanan Dibatalkan" 
  value={metrics.cancelledCount}
  change={...}
/>
```

**Remove Revenue Card:**
```typescript
// DELETE this line:
// <KpiCard title="Revenue" value={formatCurrency(metrics.revenue)} />
```

### 4. Order Type (`lib/supabase.ts`)

**OPTIONAL — Keep for backward compat:**
```typescript
export interface Order {
  // ... existing fields
  gmv?: number                    // Total amount before buyer discounts
  revenue?: number                // DEPRECATED — use buyer_paid_amount
  buyer_paid_amount?: number      // What buyer actually paid
  voucher_from_seller?: number
  voucher_from_shopee?: number
  // ...
}
```

Or remove `revenue` completely jika mau full cleanup.

---

## Testing Setelah Changes

```sql
-- Verify GMV calculation
SELECT 
  COUNT(*) as total_paid_orders,
  COUNT(CASE WHEN status IN ('CANCELLED','CANCELED','RETURNED','REFUNDED') THEN 1 END) as cancelled_count,
  SUM(CASE WHEN status = 'UNPAID' THEN 1 ELSE 0 END) as unpaid_count,
  SUM(gmv - COALESCE(voucher_from_seller, 0)) as total_gmv
FROM orders
WHERE platform = 'Shopee'
  AND DATE(paid_at AT TIME ZONE 'Asia/Jakarta') = '2026-04-07';

-- Expected:
-- total_paid_orders: 89
-- cancelled_count: 5
-- unpaid_count: 0
-- total_gmv: 31511224
```

---

## Implementasi Step-by-Step

1. **Update `lib/dummy-data.ts`** — `calcMetrics()` function (Ini yang utama)
2. **Update `app/(dashboard)/dashboard/page.tsx`** — KPI cards
3. **Build & Test:**
   ```bash
   npm run build
   npm run dev
   ```
4. **Database Query** untuk verify GMV calculation match 31.511.224
5. **Deploy**

---

## Notes

- `buyer_paid_amount` tetap dikeep untuk escrow reconciliation
- Net profit calculation tetap pakai active orders saja (exclude cancelled)
- GMV di dashboard sekarang = true Shopee definition (include cancelled)
- Lebih sederhana dan align dengan Shopee Seller Center
