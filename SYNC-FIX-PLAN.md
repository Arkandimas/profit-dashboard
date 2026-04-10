# Plan: Fix Order Sync Agar Match dengan Shopee Seller Center

## Ringkasan Masalah

Data dashboard tidak sinkron dengan Shopee Seller Center untuk tanggal 7 April 2026:

| Metrik | Shopee Seller Center | Dashboard | Selisih |
|--------|---------------------|-----------|---------|
| Pesanan Dibayar | 89 | 85 | -4 |
| Pesanan Dibatalkan | 5 | 0 | -5 |
| GMV/Penjualan | Rp 31.511.224 | ??? | tidak match |

**Definisi "Penjualan" di Shopee:**
> Total penjualan dari pesanan yang sudah dibayar dalam jangka waktu tertentu setelah dikurangi Voucher/Diskon dari Penjual. Catatan: Jumlah ini sudah termasuk penjualan dari pesanan dibatalkan dan dikembalikan.

---

## Root Cause Analysis

### Bug #1: `ignoreDuplicates: true` Mencegah Update Status (4 order hilang)

**File:** `app/api/shopee/sync/orders/route.ts` — line 131

```typescript
.upsert(rows, { onConflict: 'order_id', ignoreDuplicates: true })
```

Ketika sync pertama kali berjalan, order masuk sebagai `UNPAID`. Pada sync berikutnya, order itu sudah bayar (status berubah jadi `READY_TO_SHIP`), tapi karena `ignoreDuplicates: true`, **row tidak diupdate** — status tetap `UNPAID` di database.

Kemudian di `/sync/details`, order dengan status `UNPAID` difilter keluar:
```typescript
.not('status', 'in', `(${EXCLUDED_STATUSES.join(',')})`)  // UNPAID terfilter
```

**Hasil:** 4 order yang harusnya terhitung sebagai "paid" tetap stuck sebagai `UNPAID` di DB.

### Bug #2: Cancelled Orders Dibuang Sepenuhnya (0 cancelled)

**File:** `app/api/shopee/sync/details/route.ts` — line 139
**File:** `app/api/orders/route.ts` — line 35

Cancelled orders difilter di SEMUA level:
1. Detail sync skip order CANCELLED → tidak ada enrichment (revenue=0, no items)
2. API `/api/orders` exclude CANCELLED → tidak dikirim ke frontend
3. `calcMetrics()` exclude CANCELLED → tidak dihitung di KPI

Padahal definisi "Penjualan" Shopee **TERMASUK** pesanan dibatalkan dan dikembalikan.

### Bug #3: time_range_field Menggunakan `create_time`

**File:** `lib/shopee.ts` — line 246

```typescript
time_range_field: 'create_time',
```

Shopee Seller Center menghitung pesanan berdasarkan `pay_time` (waktu pembayaran), bukan `create_time`. Order yang dibuat tanggal 6 tapi dibayar tanggal 7 akan masuk hitungan tanggal 7 di Shopee, tapi di dashboard masih dihitung tanggal 6.

### Bug #4: Definisi "Penjualan" Tidak Sesuai

Dashboard menggunakan `buyer_total_amount` sebagai revenue. Tapi definisi Penjualan Shopee adalah:
> Total penjualan setelah dikurangi Voucher/Diskon dari **Penjual** saja

Artinya: `Penjualan = GMV (total_amount) - voucher_from_seller`

Bukan `buyer_total_amount` yang sudah dikurangi voucher Shopee juga.

---

## Implementation Plan

### Phase 1: Fix Order Stub Sync (Bug #1 — Critical)

**File:** `app/api/shopee/sync/orders/route.ts`

**Perubahan:**
1. Ganti `ignoreDuplicates: true` → `ignoreDuplicates: false`
2. Tapi jangan overwrite field yang sudah di-enrich. Caranya: hanya update `status` dan `gmv` untuk order yang sudah ada, jangan reset `revenue`, `escrow_synced`, dll ke 0.
3. Implementasi: split jadi 2 operasi:
   - **INSERT** baru untuk order yang belum ada (tetap dengan revenue=0 sebagai stub)
   - **UPDATE status & gmv** saja untuk order yang sudah ada

```typescript
// Pseudocode
// Step 1: Ambil semua existing order_id dari batch ini
const existingIds = await supabase
  .from('orders')
  .select('order_id')
  .in('order_id', batchOrderIds)

// Step 2: Insert ONLY new orders (yang belum ada di DB)
const newRows = rows.filter(r => !existingIds.includes(r.order_id))
await supabase.from('orders').insert(newRows)

// Step 3: Update status & gmv untuk yang sudah ada
for (const row of existingRows) {
  await supabase.from('orders')
    .update({ status: row.status, gmv: row.gmv })
    .eq('order_id', row.order_id)
}
```

**Estimasi:** 2-3 jam

---

### Phase 2: Sync Cancelled & Returned Orders (Bug #2 — Critical)

**Perubahan di beberapa file:**

#### 2a. `app/api/shopee/sync/details/route.ts`
- **Hapus filter EXCLUDED_STATUSES** dari query pending orders
- Cancelled orders juga perlu di-enrich agar punya data `gmv`, `buyer_total_amount`, `voucher_from_seller`
- Tetap set `details_synced = true` untuk cancelled orders

```typescript
// BEFORE:
.not('status', 'in', `(${EXCLUDED_STATUSES.join(',')})`)

// AFTER: hapus baris ini, enrich SEMUA order termasuk cancelled
```

#### 2b. `app/api/orders/route.ts`
- **Hapus filter EXCLUDED_STATUSES** — kirim SEMUA order ke frontend termasuk cancelled/returned
- Frontend yang akan decide mana yang dihitung untuk KPI mana

```typescript
// BEFORE:
.not('status', 'in', `(${EXCLUDED_STATUSES.join(',')})`)

// AFTER: hapus, tapi tambahkan filter UNPAID saja (karena unpaid memang belum bayar)
.not('status', 'eq', 'UNPAID')
```

#### 2c. `lib/dummy-data.ts` — `calcMetrics()`
- Buat 2 kategori metrik:
  - **Penjualan (Shopee definition):** Include cancelled + returned orders
  - **Active Orders:** Exclude cancelled + returned (untuk COGS, shipping, dll)

```typescript
// Penjualan = semua order yang pernah bayar (termasuk cancelled/returned)
const allPaidOrders = orders.filter(o => o.status !== 'UNPAID')
const penjualan = allPaidOrders.reduce((s, o) => s + calculatePenjualan(o), 0)

// Active = hanya order yang masih aktif (untuk COGS calculation)
const activeOrders = orders.filter(o => orderCountsForShopeeKpi(o.status))
```

**Estimasi:** 3-4 jam

---

### Phase 3: Fix Time Range Field (Bug #3 — Medium)

**File:** `lib/shopee.ts` — fungsi `getOrderList()`

**⚠️ IMPORTANT:** Shopee API **hanya support `create_time` atau `update_time`**, TIDAK support `pay_time`.

**Perubahan:**
Gunakan `update_time` sebagai `time_range_field` agar menangkap order yang statusnya baru berubah (misal UNPAID → READY_TO_SHIP pada tanggal tertentu).

```typescript
// BEFORE:
time_range_field: 'create_time',

// AFTER:
time_range_field: 'update_time',
```

**Alasan:**
- `create_time`: Order yang dibuat tanggal 6, dibayar tanggal 7 → akan ter-fetch tanggal 6 (salah bucket)
- `update_time`: Order yang dibuat tanggal 6, dibayar/status berubah tanggal 7 → ter-fetch tanggal 7 ✓ (sesuai Shopee Seller Center)

**Catatan:**
- `update_time` menangkap perubahan status (UNPAID → READY_TO_SHIP), pembayaran, dan update lainnya
- Ini lebih akurat untuk mencocokkan "Pesanan Dibayar per tanggal" di Shopee Seller Center
- Cancelled orders yang sebelumnya dibayar juga akan ter-fetch dengan update_time-nya

**Perubahan opsional di `getOrderList` signature:**
Bisa tambahkan parameter agar bisa dikonfigurasi:

```typescript
export async function getOrderList(
  accessToken: string,
  shopId: number,
  fromTs: number,
  toTs: number,
  orderStatus?: string,
  timeRangeField: 'create_time' | 'update_time' = 'update_time'  // pay_time dihapus
): Promise<ShopeeOrderSummary[]> {
```

**Estimasi:** 1 jam

---

### Phase 4: Fix Definisi "Penjualan" (Bug #4 — Medium)

**File:** `lib/dummy-data.ts`, `app/api/shopee/sync/details/route.ts`

**Perubahan:**

Tambah field baru `penjualan` di database yang dihitung sesuai definisi Shopee:
```
Penjualan = total_amount (GMV) - voucher_from_seller
```

Atau hitung di runtime:
```typescript
function calculatePenjualan(order: Order): number {
  // Penjualan = GMV - Voucher Seller
  // Definisi: Total penjualan setelah dikurangi Voucher/Diskon dari Penjual
  return (order.gmv ?? 0) - (order.voucher_from_seller ?? 0)
}
```

**Update `calcMetrics()` :**
```typescript
// Penjualan (Shopee definition) — includes cancelled & returned
const allPaidOrders = orders.filter(o => 
  (o.status ?? '').toUpperCase() !== 'UNPAID'
)
const penjualan = allPaidOrders.reduce((s, o) => 
  s + (o.gmv ?? 0) - (o.voucher_from_seller ?? 0), 0
)
```

**Estimasi:** 2 jam

---

### Phase 5: Dashboard UI — Tambah KPI Cancelled Orders

**File:** `app/(dashboard)/dashboard/page.tsx`

**Perubahan:**
1. Tambah KPI card "Pesanan Dibatalkan" yang menampilkan jumlah cancelled orders
2. Tambah KPI card "Penjualan" sesuai definisi Shopee (terpisah dari Revenue/Escrow)
3. Update tooltip untuk menjelaskan perbedaan:
   - **Penjualan:** Definisi Shopee (termasuk cancelled/returned, setelah seller voucher)
   - **Revenue:** Buyer paid amount (setelah semua voucher)
   - **Escrow:** Uang yang benar-benar masuk ke rekening seller

```typescript
// Cancelled count
const cancelledOrders = periodOrders.filter(o => 
  ['CANCELLED', 'CANCELED'].includes((o.status ?? '').toUpperCase())
)

// New KPI cards:
// - Pesanan Dibayar: {activeOrders.length}
// - Pesanan Dibatalkan: {cancelledOrders.length}
// - Penjualan (Shopee): Rp xxx (includes cancelled)
```

**Estimasi:** 2-3 jam

---

### Phase 6: Add Status Update Sync Route

**File baru:** `app/api/shopee/sync/status/route.ts`

Route baru untuk secara berkala mengupdate status order yang masih aktif (belum COMPLETED/CANCELLED). Ini menangkap perubahan status seperti:
- `READY_TO_SHIP` → `SHIPPED`
- `SHIPPED` → `COMPLETED`
- `READY_TO_SHIP` → `IN_CANCEL` → `CANCELLED`

```typescript
// Fetch orders yang statusnya masih "in progress"
const IN_PROGRESS = ['READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 
                      'TO_CONFIRM_RECEIVE', 'IN_CANCEL', 'TO_RETURN']

// Untuk setiap order, call getOrderDetail dan update status di DB
```

**Tambahkan ke sync flow** di dashboard — jalankan setelah sync orders dan sebelum sync details.

**Estimasi:** 3 jam

---

### Phase 7: Validasi & Reconciliation Tool

**File baru:** `app/api/shopee/reconcile/route.ts`

Endpoint untuk membandingkan data dashboard vs data mentah dari Shopee API:

```typescript
// 1. Fetch order list dari Shopee untuk tanggal tertentu
// 2. Bandingkan dengan data di DB
// 3. Return laporan perbedaan:
//    - Orders di Shopee tapi tidak di DB (missing)
//    - Orders di DB tapi tidak di Shopee (orphaned)
//    - Orders dengan status berbeda
//    - Selisih GMV/Penjualan
```

Ini berguna untuk debugging dan memastikan sinkronisasi sudah benar.

**Estimasi:** 3-4 jam

---

## Urutan Implementasi (Prioritas)

| # | Phase | Priority | Dampak | Estimasi |
|---|-------|----------|--------|----------|
| 1 | Fix ignoreDuplicates (Bug #1) | CRITICAL | Fix 4 missing orders | 2-3 jam |
| 2 | Sync cancelled orders (Bug #2) | CRITICAL | Fix 0 cancelled + GMV | 3-4 jam |
| 3 | Fix time_range_field (Bug #3) | HIGH | Fix date bucketing | 1 jam |
| 4 | Fix definisi Penjualan (Bug #4) | HIGH | Fix GMV calculation | 2 jam |
| 5 | Dashboard UI updates | MEDIUM | Show correct KPIs | 2-3 jam |
| 6 | Status update sync | MEDIUM | Keep statuses current | 3 jam |
| 7 | Reconciliation tool | LOW | Debugging/validation | 3-4 jam |

**Total estimasi: 16-20 jam kerja**

---

## Database Migration Needed

```sql
-- Tambah kolom penjualan jika mau simpan di DB (opsional, bisa hitung runtime)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS penjualan numeric DEFAULT 0;

-- Tambah index untuk query cancelled orders
CREATE INDEX IF NOT EXISTS idx_orders_status_paid_at 
  ON orders(status, paid_at);

-- Reset details_synced untuk cancelled orders agar bisa di-enrich ulang
UPDATE orders 
SET details_synced = false 
WHERE status IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
  AND (details_synced = true OR details_synced IS NULL);
```

---

## Testing Checklist

Setelah implementasi, verifikasi dengan data tanggal 7 April:

- [ ] Order count di dashboard = 89 (sama dengan Shopee "Pesanan Dibayar")
- [ ] Cancelled order count = 5 (sama dengan Shopee)
- [ ] Penjualan = Rp 31.511.224 (sama dengan Shopee, termasuk cancelled)
- [ ] Semua order punya detail yang ter-enrich (tidak ada revenue=0 untuk paid orders)
- [ ] Status order ter-update ketika berubah di Shopee
- [ ] Date filtering menggunakan pay_time dan match dengan Shopee Seller Center
- [ ] Escrow sync masih berjalan normal untuk COMPLETED orders

---

## Catatan Penting

1. **Setelah deploy Phase 1-4**, perlu jalankan full resync: `POST /api/shopee/sync/orders?days=90` → lalu `POST /api/shopee/sync/details` beberapa kali sampai `done: true`
2. **Cancelled orders yang sudah ada di DB** perlu di-reset `details_synced = false` agar diproses ulang (lihat migration SQL di atas)
3. **Rate limit Shopee**: Karena sekarang memproses lebih banyak order (termasuk cancelled), pastikan batch size dan delay tetap memadai
