#!/bin/bash

# =============================================================================
# SYNC-FIX-PLAN Implementation Automation Script
# Mengimplementasikan Phase 1-5 dari SYNC-FIX-PLAN.md secara berurutan
# =============================================================================

set -e  # Exit on error

PLAN_FILE="SYNC-FIX-PLAN.md"
PROJECT_ROOT="$(pwd)"

# Color codes untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

verify_build() {
    print_info "Verifying TypeScript build..."
    if npm run build > /dev/null 2>&1; then
        print_success "Build passed ✓"
        return 0
    else
        print_error "Build failed - see errors above"
        return 1
    fi
}

# =============================================================================
# PHASE 1: Fix ignoreDuplicates
# =============================================================================
phase1_fix_ignore_duplicates() {
    print_header "PHASE 1: Fix ignoreDuplicates (Bug #1)"

    echo "Task:"
    echo "  - Ganti ignoreDuplicates: true → false"
    echo "  - Pisahkan INSERT (new orders) dan UPDATE (existing orders)"
    echo "  - Jangan overwrite revenue, escrow_synced, dll"
    echo ""
    echo "File: app/api/shopee/sync/orders/route.ts (line 131)"
    echo ""

    read -p "Jalankan phase ini? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Menjalankan Claude Code untuk Phase 1..."
        claude code --task "
Implementasi Phase 1 dari SYNC-FIX-PLAN.md: Fix ignoreDuplicates di sync/orders

File: app/api/shopee/sync/orders/route.ts (sekitar line 131)

Perubahan:
1. Ganti ignoreDuplicates: true → ignoreDuplicates: false
2. Pisahkan jadi 2 operasi batch:
   a. INSERT baru untuk order yang belum ada (revenue=0 sebagai stub)
   b. UPDATE status & gmv SAJA untuk order yang sudah ada (jangan overwrite revenue, escrow_synced, paid_at, dll)

Implementasi:
- Query dulu existing order_id dari batch rows
- Filter: newRows = rows.filter(r => !existingIds.includes(r.order_id))
- await supabase.from('orders').insert(newRows)
- Loop update existing dengan: .update({ status: row.status, gmv: row.gmv })

Pastikan:
- Tidak ada field lain yang di-reset ke 0
- Details dan escrow data tidak dihapus
- Logic tetap sama, hanya operasi DB yang berbeda

Setelah selesai, save file.
"
        if verify_build; then
            print_success "Phase 1 selesai"
            return 0
        else
            print_error "Phase 1 build failed"
            return 1
        fi
    else
        print_warning "Phase 1 di-skip"
        return 0
    fi
}

# =============================================================================
# PHASE 2: Sync Cancelled & Returned Orders
# =============================================================================
phase2_sync_cancelled_orders() {
    print_header "PHASE 2: Sync Cancelled & Returned Orders (Bug #2)"

    echo "Task:"
    echo "  - Hapus filter EXCLUDED_STATUSES dari sync/details"
    echo "  - Hapus filter EXCLUDED_STATUSES dari /api/orders"
    echo "  - Split calcMetrics() jadi allPaidOrders vs activeOrders"
    echo ""
    echo "Files:"
    echo "  1. app/api/shopee/sync/details/route.ts (line 139)"
    echo "  2. app/api/orders/route.ts (line 35)"
    echo "  3. lib/dummy-data.ts (calcMetrics function)"
    echo ""

    read -p "Jalankan phase ini? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Menjalankan Claude Code untuk Phase 2..."
        claude code --task "
Implementasi Phase 2 dari SYNC-FIX-PLAN.md: Sync Cancelled & Returned Orders

PERUBAHAN #1: app/api/shopee/sync/details/route.ts (line 139)
- Hapus: .not('status', 'in', \`\${EXCLUDED_STATUSES.join(',')}\`)
- Tujuan: Enrich SEMUA order termasuk cancelled/returned agar punya GMV dan revenue data

PERUBAHAN #2: app/api/orders/route.ts (line 35)
- Hapus: .not('status', 'in', \`\${EXCLUDED_STATUSES.join(',')}\`)
- Tambah: .not('status', 'eq', 'UNPAID') saja
- Tujuan: Kirim SEMUA paid/cancelled orders ke frontend, exclude hanya UNPAID

PERUBAHAN #3: lib/dummy-data.ts (calcMetrics function, line 380)
- Buat 2 kategori order:
  const allPaidOrders = orders.filter(o =>
    (o.status ?? '').toUpperCase() !== 'UNPAID'
  )
  const activeOrders = orders.filter(o => orderCountsForShopeeKpi(o.status))

- Untuk GMV/Penjualan: gunakan allPaidOrders (termasuk cancelled)
- Untuk COGS/Shipping: gunakan activeOrders (exclude cancelled)
- Return object harus pisahkan metrik ini

Pastikan:
- OrderCountsForShopeeKpi() tetap sama (untuk activeOrders)
- Penjualan termasuk cancelled orders dengan GMV-nya
- Revenue calculation sudah sesuai

Setelah selesai, save file.
"
        if verify_build; then
            print_success "Phase 2 selesai"
            return 0
        else
            print_error "Phase 2 build failed"
            return 1
        fi
    else
        print_warning "Phase 2 di-skip"
        return 0
    fi
}

# =============================================================================
# PHASE 3: Fix time_range_field
# =============================================================================
phase3_fix_time_range_field() {
    print_header "PHASE 3: Fix time_range_field (Bug #3)"

    echo "Task:"
    echo "  - Ganti time_range_field: 'create_time' → 'pay_time'"
    echo "  - Tambah parameter timeRangeField ke function signature"
    echo ""
    echo "File: lib/shopee.ts (fungsi getOrderList, line 246)"
    echo ""

    read -p "Jalankan phase ini? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Menjalankan Claude Code untuk Phase 3..."
        claude code --task "
Implementasi Phase 3 dari SYNC-FIX-PLAN.md: Fix time_range_field

File: lib/shopee.ts, fungsi getOrderList (line 233-273)

Perubahan:
1. Tambah parameter di function signature:
   timeRangeField: 'create_time' | 'pay_time' | 'update_time' = 'pay_time'

2. Ganti line 246 dari:
   time_range_field: 'create_time',
   ke:
   time_range_field: timeRangeField,

3. Update semua call ke getOrderList():
   - Di app/api/shopee/sync/orders/route.ts line 117
     getOrderList(tkn, shopId, chunk.start, chunk.end)
     → biarkan default 'pay_time'

   - Kalau ada call lain, pastikan tidak pass explicit 'create_time'

Alasan: Shopee Seller Center menghitung 'Pesanan Dibayar' berdasarkan pay_time, bukan create_time.

Setelah selesai, save file.
"
        if verify_build; then
            print_success "Phase 3 selesai"
            return 0
        else
            print_error "Phase 3 build failed"
            return 1
        fi
    else
        print_warning "Phase 3 di-skip"
        return 0
    fi
}

# =============================================================================
# PHASE 4: Fix Definisi Penjualan
# =============================================================================
phase4_fix_penjualan_definition() {
    print_header "PHASE 4: Fix Definisi Penjualan (Bug #4)"

    echo "Task:"
    echo "  - Tambah helper function calculatePenjualan()"
    echo "  - Update calcMetrics() untuk hitung Penjualan sesuai definisi Shopee"
    echo ""
    echo "File: lib/dummy-data.ts"
    echo ""

    read -p "Jalankan phase ini? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Menjalankan Claude Code untuk Phase 4..."
        claude code --task "
Implementasi Phase 4 dari SYNC-FIX-PLAN.md: Fix Definisi Penjualan

File: lib/dummy-data.ts

Definisi Penjualan Shopee:
  Penjualan = Total_Amount (GMV) - Voucher_Seller
  (tidak dikurangi Voucher Shopee, hanya seller voucher)

Perubahan:

1. Tambah helper function (sebelum calcMetrics):
   function calculatePenjualan(order: Order): number {
     return (order.gmv ?? 0) - (order.voucher_from_seller ?? 0)
   }

2. Di calcMetrics(), tambah:
   const allPaidOrders = orders.filter(o =>
     (o.status ?? '').toUpperCase() !== 'UNPAID'
   )
   const penjualan = allPaidOrders.reduce((s, o) =>
     s + calculatePenjualan(o), 0
   )

3. Return object dari calcMetrics() tambah field baru:
   penjualan, // Shopee definition
   (tetap ada revenue, gmv, dll untuk backward compatibility)

Pastikan:
- Penjualan include cancelled orders
- Formula sesuai definisi (GMV - seller_voucher)
- activeOrders tetap untuk COGS/shipping calc

Setelah selesai, save file.
"
        if verify_build; then
            print_success "Phase 4 selesai"
            return 0
        else
            print_error "Phase 4 build failed"
            return 1
        fi
    else
        print_warning "Phase 4 di-skip"
        return 0
    fi
}

# =============================================================================
# PHASE 5: Dashboard UI Updates
# =============================================================================
phase5_dashboard_ui_updates() {
    print_header "PHASE 5: Dashboard UI Updates (KPI Cards)"

    echo "Task:"
    echo "  - Tambah KPI card 'Pesanan Dibatalkan'"
    echo "  - Tambah KPI card 'Penjualan (Shopee Definition)'"
    echo "  - Update existing cards dengan tooltip penjelasan"
    echo ""
    echo "File: app/(dashboard)/dashboard/page.tsx"
    echo ""

    read -p "Jalankan phase ini? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Menjalankan Claude Code untuk Phase 5..."
        claude code --task "
Implementasi Phase 5 dari SYNC-FIX-PLAN.md: Dashboard UI Updates

File: app/(dashboard)/dashboard/page.tsx

Perubahan:

1. Tambah calculation untuk cancelled orders:
   const cancelledOrders = periodOrders.filter(o =>
     ['CANCELLED', 'CANCELED'].includes((o.status ?? '').toUpperCase())
   )

2. Tambah KPI card baru untuk 'Pesanan Dibatalkan':
   <KpiCard
     title=\"Pesanan Dibatalkan\"
     value={cancelledOrders.length}
     change={0}
     tooltip=\"Jumlah pesanan yang dibatalkan (termasuk dalam Penjualan per definisi Shopee)\"
   />

3. Tambah KPI card untuk 'Penjualan (Shopee)':
   <KpiCard
     title=\"Penjualan (Shopee Def)\"
     value={formatCurrency(metrics.penjualan ?? 0)}
     change={0}
     tooltip=\"Definisi Shopee: GMV - Voucher Seller. Termasuk pesanan dibatalkan & dikembalikan.\"
   />

4. Update existing cards dengan tooltip yang jelas:
   - GMV: \"Gross item value sebelum diskon buyer\"
   - Revenue: \"Buyer paid amount setelah semua diskon\"
   - Escrow: \"Uang yang masuk ke rekening seller\"

Pastikan order KPI cards:
1. Pesanan Dibayar (dari activeOrders.length)
2. Pesanan Dibatalkan (baru)
3. Penjualan Shopee (baru, dengan definisi yang benar)

Setelah selesai, save file.
"
        if verify_build; then
            print_success "Phase 5 selesai"
            return 0
        else
            print_error "Phase 5 build failed"
            return 1
        fi
    else
        print_warning "Phase 5 di-skip"
        return 0
    fi
}

# =============================================================================
# POST-IMPLEMENTATION: Database Migration & Full Sync
# =============================================================================
post_implementation() {
    print_header "POST-IMPLEMENTATION: Database Migration & Full Sync"

    echo "Setelah Phase 1-5 selesai, jalankan:"
    echo ""
    echo "1. Database Migration (SQL):"
    echo "   - Tambah kolom penjualan di orders table"
    echo "   - Reset details_synced = false untuk cancelled orders"
    echo ""
    echo "2. Full Resync:"
    echo "   POST /api/shopee/sync/orders?days=90"
    echo "   POST /api/shopee/sync/details (loop sampai done: true)"
    echo "   POST /api/shopee/sync/escrow (loop sampai done: true)"
    echo ""

    read -p "Lanjut ke testing? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_header "TESTING CHECKLIST"
        echo "Verifikasi dengan data tanggal 7 April:"
        echo ""
        echo "- [ ] Order count = 89 (match Shopee 'Pesanan Dibayar')"
        echo "- [ ] Cancelled count = 5 (match Shopee)"
        echo "- [ ] Penjualan = Rp 31.511.224 (match Shopee, includes cancelled)"
        echo "- [ ] Semua order punya detail teruri (tidak ada revenue=0)"
        echo "- [ ] Dashboard shows: Pesanan Dibayar, Pesanan Dibatalkan, Penjualan"
        echo "- [ ] Status order terupdate saat berubah di Shopee"
        echo "- [ ] Escrow sync masih berjalan untuk COMPLETED orders"
        echo ""
    fi
}

# =============================================================================
# MAIN FLOW
# =============================================================================
main() {
    clear
    print_header "PROFIT DASHBOARD SYNC-FIX IMPLEMENTATION"

    # Check if plan file exists
    if [ ! -f "$PLAN_FILE" ]; then
        print_error "File $PLAN_FILE tidak ditemukan di current directory"
        exit 1
    fi

    print_info "Plan file found: $PLAN_FILE"
    echo ""

    # Run phases
    phase1_fix_ignore_duplicates || exit 1
    phase2_sync_cancelled_orders || exit 1
    phase3_fix_time_range_field || exit 1
    phase4_fix_penjualan_definition || exit 1
    phase5_dashboard_ui_updates || exit 1

    # Post-implementation
    post_implementation

    print_header "IMPLEMENTATION COMPLETE ✓"
    echo ""
    echo "Next steps:"
    echo "1. Deploy changes ke production"
    echo "2. Jalankan database migration"
    echo "3. Trigger full resync: POST /api/shopee/sync/orders?days=90"
    echo "4. Monitor sync progress"
    echo "5. Verify data match dengan Shopee Seller Center untuk 7 April"
    echo ""
}

# Run main
main
