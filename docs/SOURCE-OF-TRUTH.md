# Source of Truth — Definisi Field & KPI

**Project:** Profit Dashboard PT Sukses Gemilang Bangsa
**Marketplace:** Shopee Indonesia
**Last Updated:** 2026-04-11

---

## 1. Definisi Field Database (tabel `orders`)

| Field | Sumber API Shopee | Definisi | Contoh |
|-------|-------------------|----------|--------|
| `gmv` | `get_order_detail` → `total_amount` | Gross Merchandise Value. Total harga item sebelum voucher buyer. | Rp 150.000 |
| `buyer_paid_amount` | `get_order_detail` → `buyer_total_amount` | Jumlah yang dibayar buyer setelah semua diskon & voucher. | Rp 130.000 |
| `voucher_from_seller` | `get_order_detail` → `voucher_from_seller` | Diskon yang ditanggung seller. | Rp 10.000 |
| `voucher_from_shopee` | `get_order_detail` → `voucher_from_shopee` | Diskon yang ditanggung Shopee. | Rp 10.000 |
| `shipping_fee` | `get_order_detail` → `estimated_shipping_fee` / `actual_shipping_fee` | Ongkos kirim. | Rp 15.000 |
| `escrow_amount` | `get_escrow_detail` → `escrow_amount` | Uang yang benar-benar masuk ke seller setelah semua potongan platform. Ini angka paling akurat untuk profit. | Rp 105.000 |
| `commission_fee` | `get_escrow_detail` → `commission_fee` | Komisi Shopee (biasanya ~2-6%). | Rp 7.500 |
| `service_fee` | `get_escrow_detail` → `service_fee` | Service/transaction fee Shopee. | Rp 3.000 |
| `platform_fee` | Derived: `commission_fee + service_fee` | Total potongan platform. | Rp 10.500 |
| `paid_at` | `get_order_detail` → `pay_time` (unix → ISO) | Waktu buyer membayar. NULL jika belum bayar. | 2026-04-10T14:30:00Z |
| `created_at` | `get_order_list` → `create_time` (unix → ISO) | Waktu order dibuat. | 2026-04-10T14:25:00Z |
| `status` | `get_order_list` / `get_order_detail` → `order_status` | Status order uppercase. | COMPLETED |
| `cogs` | Manual input per produk | Harga Pokok Penjualan. | Rp 50.000 |
| `revenue` | **DEPRECATED** — jangan gunakan | Legacy field. Akan dihapus di migration berikutnya. Gunakan `buyer_paid_amount` untuk profit calc, `gmv` untuk KPI Shopee. | — |

---

## 2. Definisi KPI Dashboard

### GMV (Gross Merchandise Value)
- **Rumus:** `SUM(gmv - voucher_from_seller)` untuk semua order yang sudah dibayar
- **Scope:** Termasuk CANCELLED, RETURNED, REFUNDED (selama sudah pernah dibayar)
- **Exclude:** UNPAID
- **Referensi Shopee:** [Definisi GMV Shopee](https://seller.shopee.co.id/edu/article/26796)

### Jumlah Pesanan (Order Count)
- **Rumus:** `COUNT(*)` semua order yang sudah dibayar
- **Scope:** Termasuk CANCELLED, RETURNED, REFUNDED
- **Exclude:** UNPAID

### Pesanan Dibatalkan (Cancelled Count)
- **Rumus:** `COUNT(*)` order dengan status CANCELLED, CANCELED, RETURNED, REFUNDED
- **Dari subset:** Hanya yang sudah pernah dibayar (bukan UNPAID)

### Order Aktif
- **Rumus:** `Jumlah Pesanan - Pesanan Dibatalkan`
- **Status:** READY_TO_SHIP, PROCESSED, SHIPPED, COMPLETED, IN_CANCEL, RETRY_SHIP

### Buyer Paid (untuk profit calculation)
- **Rumus:** `SUM(buyer_paid_amount)` dari **Order Aktif saja**
- **Fungsi:** Dasar perhitungan profit. Bukan KPI publik.

### Net Profit (Operasional)
- **Rumus:** `Escrow Amount - COGS` (jika escrow tersedia)
- **Fallback:** `Buyer Paid - Platform Fees - COGS` (estimasi jika escrow belum sync)
- **Belum termasuk:** Ad spend (AMS), affiliate cost — akan ditambahkan nanti

---

## 3. Pipeline Sync Resmi

Hanya 3 route ini yang aktif dan dipakai UI:

| Step | Route | Method | Fungsi |
|------|-------|--------|--------|
| 1 | `/api/shopee/sync/orders` | POST | List orders dari Shopee, insert/update stubs ke DB |
| 2 | `/api/shopee/sync/details` | POST | Enrich orders dengan detail (gmv, buyer_paid, voucher, pay_time) |
| 3 | `/api/shopee/sync/escrow` | POST | Fetch escrow data untuk orders COMPLETED |

### Route Legacy (JANGAN PAKAI)
- `/api/shopee/sync` (route.ts di folder sync) — legacy, duplikat
- `/api/shopee/sync-escrow` — legacy, diganti sync/escrow
- `/api/shopee/sync-products` — legacy
- `/api/admin/resync-all` — admin tool, jangan di UI

### Flow:
```
UI click "Sync Orders"
  → POST /sync/orders (batch, returns progress)
  → loop POST /sync/details (50 orders per call, until done=true)
  → POST /sync/escrow (for COMPLETED orders)
  → Refresh dashboard data
```

---

## 4. Status Order yang Valid

| Status | Sudah Dibayar? | Masuk GMV? | Masuk Profit? |
|--------|---------------|------------|---------------|
| UNPAID | ❌ | ❌ | ❌ |
| READY_TO_SHIP | ✅ | ✅ | ✅ |
| PROCESSED | ✅ | ✅ | ✅ |
| SHIPPED | ✅ | ✅ | ✅ |
| COMPLETED | ✅ | ✅ | ✅ |
| IN_CANCEL | ✅ | ✅ | ✅ (masih aktif) |
| RETRY_SHIP | ✅ | ✅ | ✅ |
| CANCELLED | ✅ (pernah bayar) | ✅ | ❌ |
| RETURNED | ✅ (pernah bayar) | ✅ | ❌ |
| REFUNDED | ✅ (pernah bayar) | ✅ | ❌ |

---

## 5. Timezone

- Semua timestamp di DB: **UTC (ISO 8601)**
- Dashboard display: **WIB (Asia/Jakarta, UTC+7)**
- Order bucketing by date: berdasarkan `paid_at` (fallback `created_at`), dikonversi ke WIB

---

## 6. Constraint Vercel Hobby

- Function timeout: **max 10 detik**
- Semua sync route HARUS selesai dalam <10s per call
- Strategy: small batch + cursor/progress + frontend loop
