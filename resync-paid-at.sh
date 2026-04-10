#!/bin/bash

# =============================================================================
# Resync Orders untuk Ensure Semua Punya paid_at
# =============================================================================

set -e

DASHBOARD_URL="${1:-https://profit-dashboard-lilac.vercel.app}"
MAX_RETRIES=100
RETRY_DELAY=3

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# =============================================================================
# STEP 1: Full Order List Sync (get_order_list)
# =============================================================================
step1_sync_orders() {
    print_header "STEP 1: Sync Order List (get_order_list)"

    echo "Fetching all orders dari Shopee (90 hari)..."
    echo "URL: POST $DASHBOARD_URL/api/shopee/sync/orders?days=90"
    echo ""

    RESPONSE=$(curl -s -X POST "$DASHBOARD_URL/api/shopee/sync/orders?days=90")

    if echo "$RESPONSE" | grep -q "error"; then
        print_error "Order list sync failed:"
        echo "$RESPONSE"
        return 1
    fi

    SYNCED=$(echo "$RESPONSE" | grep -o '"synced":[0-9]*' | grep -o '[0-9]*')
    print_success "Order list synced: $SYNCED orders"
    echo ""
}

# =============================================================================
# STEP 2: Enrich Order Details (get_order_detail) — Loop sampai done
# =============================================================================
step2_enrich_details() {
    print_header "STEP 2: Enrich Order Details (get_order_detail)"

    RETRY_COUNT=0
    TOTAL_UPDATED=0

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        echo "Attempt $((RETRY_COUNT + 1))/$MAX_RETRIES..."

        RESPONSE=$(curl -s -X POST "$DASHBOARD_URL/api/shopee/sync/details")

        if echo "$RESPONSE" | grep -q "error"; then
            print_warning "Sync details error (will retry): $(echo "$RESPONSE" | grep -o '"error":"[^"]*"')"
            RETRY_COUNT=$((RETRY_COUNT + 1))
            sleep $RETRY_DELAY
            continue
        fi

        UPDATED=$(echo "$RESPONSE" | grep -o '"updated":[0-9]*' | grep -o '[0-9]*')
        REMAINING=$(echo "$RESPONSE" | grep -o '"remaining":[0-9]*' | grep -o '[0-9]*')
        DONE=$(echo "$RESPONSE" | grep -o '"done":[a-z]*' | grep -o 'true\|false')

        print_info "Updated: $UPDATED | Remaining: $REMAINING | Done: $DONE"
        TOTAL_UPDATED=$((TOTAL_UPDATED + UPDATED))

        if [ "$DONE" = "true" ] && [ "$REMAINING" -eq 0 ]; then
            print_success "Detail enrichment COMPLETE!"
            print_success "Total updated: $TOTAL_UPDATED"
            echo ""
            return 0
        fi

        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep $RETRY_DELAY
    done

    print_error "Detail enrichment timeout after $MAX_RETRIES retries"
    echo "Manual intervention needed. Check API status."
    return 1
}

# =============================================================================
# STEP 3: Sync Escrow Details (optional, untuk final fee calculation)
# =============================================================================
step3_sync_escrow() {
    print_header "STEP 3: Sync Escrow Details (Optional)"

    read -p "Sync escrow details juga? (y/n) " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Escrow sync di-skip"
        return 0
    fi

    RETRY_COUNT=0
    TOTAL_SYNCED=0

    while [ $RETRY_COUNT -lt 50 ]; do
        echo "Escrow sync attempt $((RETRY_COUNT + 1))/50..."

        RESPONSE=$(curl -s -X POST "$DASHBOARD_URL/api/shopee/sync/escrow")

        if echo "$RESPONSE" | grep -q "error"; then
            print_warning "Escrow sync error (will retry)"
            RETRY_COUNT=$((RETRY_COUNT + 1))
            sleep $RETRY_DELAY
            continue
        fi

        SYNCED=$(echo "$RESPONSE" | grep -o '"synced":[0-9]*' | grep -o '[0-9]*')
        REMAINING=$(echo "$RESPONSE" | grep -o '"remaining":[0-9]*' | grep -o '[0-9]*')
        DONE=$(echo "$RESPONSE" | grep -o '"done":[a-z]*' | grep -o 'true\|false')

        print_info "Synced: $SYNCED | Remaining: $REMAINING | Done: $DONE"
        TOTAL_SYNCED=$((TOTAL_SYNCED + SYNCED))

        if [ "$DONE" = "true" ] && [ "$REMAINING" -eq 0 ]; then
            print_success "Escrow sync COMPLETE!"
            print_success "Total synced: $TOTAL_SYNCED"
            echo ""
            return 0
        fi

        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep $RETRY_DELAY
    done

    print_warning "Escrow sync incomplete (but orders are enriched)"
    echo ""
}

# =============================================================================
# STEP 4: Database Verification
# =============================================================================
step4_verify_database() {
    print_header "STEP 4: Verify Database Reconciliation"

    echo "Checking order status..."
    echo "SQL Query:"
    echo "  SELECT COUNT(*) as total, COUNT(paid_at) as with_paid_at, COUNT(NULL) FILTER(WHERE paid_at IS NULL) as missing"
    echo "  FROM orders WHERE platform = 'Shopee' AND status NOT IN ('UNPAID','CANCELLED','CANCELED','RETURNED','REFUNDED')"
    echo ""

    read -p "Connect ke database untuk verify? (y/n) " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Database verification di-skip"
        echo "Jalankan manual SQL query di atas untuk check hasil"
        return 0
    fi

    print_warning "Database verification - manual step needed"
    echo "Gunakan Supabase dashboard atau psql untuk run query di atas"
    echo ""
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    clear

    print_header "RESYNC: Ensure Semua Orders Punya paid_at"

    print_info "Dashboard URL: $DASHBOARD_URL"
    print_info "Max retries per step: 100"
    print_info "Retry delay: ${RETRY_DELAY}s"
    echo ""

    read -p "Mulai resync? (y/n) " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Resync di-cancel"
        exit 0
    fi

    # Run steps
    step1_sync_orders || exit 1
    step2_enrich_details || exit 1
    step3_sync_escrow
    step4_verify_database

    print_header "RESYNC COMPLETE ✓"
    echo ""
    echo "Next:"
    echo "1. Refresh dashboard di browser"
    echo "2. Check data untuk 7 April:"
    echo "   - Order count = 89"
    echo "   - Cancelled = 5"
    echo "   - Penjualan = Rp 31.511.224"
    echo "3. Verifikasi match dengan Shopee Seller Center"
    echo ""
}

main
